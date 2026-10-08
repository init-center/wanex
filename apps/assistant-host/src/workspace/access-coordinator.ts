import { realpath, stat } from "node:fs/promises"
import { isAbsolute } from "node:path"
import type {
  JsonValue,
  ResolveToolExecutionApprovalReceipt,
  ResolveToolExecutionApprovalRequest,
  ToolExecutionRecord
} from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import {
  createToolRuntimeBinding,
  type ToolPermissionDecision,
  type ToolPermissionPolicy,
  type ToolPermissionRequest,
  type ToolInvocation
} from "@wanex/runtime/tools"
import type { RuntimeHostToolApprovalContinuation } from "@wanex/runtime/host"
import type { RootIdentity, WorkspaceFileEffect } from "./model.js"
import { digest, json, opaque } from "./store.js"
import {
  type WorkspaceAccessGrantRecord,
  type WorkspaceAccessStore
} from "./access.js"
import { workspaceInput, requiredWorkspaceString } from "./input.js"

export const WORKSPACE_ACCESS_TOOL = "workspace_request_access"
export const WORKSPACE_ACCESS_IMPLEMENTATION =
  "wanex.assistant.workspace.access"

const AUTHORIZATION_PREFIX = "workspace-access:"
const DEFAULT_TURN_EXPIRY_MS = 30 * 60 * 1_000
const DEFAULT_SESSION_EXPIRY_MS = 24 * 60 * 60 * 1_000

export interface WorkspaceAccessCoordinatorOptions {
  readonly hostId: string
  readonly storage: CoreStore
  readonly accessStore: WorkspaceAccessStore
  readonly basePolicy: ToolPermissionPolicy
}

export interface WorkspaceAccessRequestInput {
  readonly path: string
  readonly effects: readonly WorkspaceFileEffect[]
  readonly scope: "turn" | "session"
  readonly reason: string
}

export class WorkspaceAccessCoordinator {
  readonly #hostId: string
  readonly #storage: CoreStore
  readonly #accessStore: WorkspaceAccessStore
  readonly #basePolicy: ToolPermissionPolicy
  readonly #policy: ToolPermissionPolicy
  readonly #continuation: RuntimeHostToolApprovalContinuation

  constructor(options: WorkspaceAccessCoordinatorOptions) {
    this.#hostId = opaque(options.hostId)
    this.#storage = options.storage
    this.#accessStore = options.accessStore
    this.#basePolicy = options.basePolicy
    this.#policy = {
      snapshot: () => createToolRuntimeBinding({
        implementationId: "wanex.assistant.workspace.access-policy",
        implementationRevision: "1",
        configuration: { base: json(options.basePolicy.snapshot()) }
      }),
      authorize: async (request) => await this.authorize(request)
    }
    this.#continuation = {
      afterDecision: async (request) => await this.afterDecision(request)
    }
  }

  get policy(): ToolPermissionPolicy {
    return this.#policy
  }

  get hostId(): string {
    return this.#hostId
  }

  get continuation(): RuntimeHostToolApprovalContinuation {
    return this.#continuation
  }

  async authorize(
    request: ToolPermissionRequest
  ): Promise<ToolPermissionDecision> {
    if (request.descriptor.name !== WORKSPACE_ACCESS_TOOL) {
      return await this.#basePolicy.authorize(request)
    }
    const input = parseWorkspaceAccessRequestInput(request.call.input)
    const root = await inspectWorkspaceRoot(input.path, input.effects)
    const requestId = workspaceAccessRequestId({
      hostId: this.#hostId,
      sessionId: request.sessionId,
      turnId: request.turnId,
      inputId: request.inputId,
      toolCallId: request.call.toolCallId,
      input
    })
    const now = Date.now()
    const accessRequest = await this.#accessStore.createRequest({
      id: requestId,
      hostId: this.#hostId,
      principalId: request.principalId,
      sessionId: request.sessionId,
      turnId: request.turnId,
      attemptId: request.attemptId,
      scope: input.scope,
      root,
      reason: input.reason,
      idempotencyKey: requestId,
      expiresAt:
        now +
        (input.scope === "turn"
          ? DEFAULT_TURN_EXPIRY_MS
          : DEFAULT_SESSION_EXPIRY_MS),
      now
    })
    return {
      status: "approval_required",
      reason: "workspace_access_requires_user_approval",
      presentation: {
        summary: `Allow access to a workspace directory (${input.scope})?`,
        details: [
          { label: "Directory", value: root.id },
          { label: "Effects", value: input.effects.join(", ") },
          { label: "Reason", value: accessRequest.reason }
        ]
      },
      authorizationRef: authorizationRef(accessRequest.id)
    }
  }

  async afterDecision(request: {
    readonly request: ResolveToolExecutionApprovalRequest
    readonly execution: ToolExecutionRecord
    readonly receipt: ResolveToolExecutionApprovalReceipt
  }): Promise<void> {
    const requestId = authorizationRequestId(request.execution)
    if (requestId === undefined) return
    const accessRequest = await this.#accessStore.getRequest(requestId)
    if (accessRequest === null) {
      throw new Error("workspace access request for approved Tool is missing")
    }
    const decision =
      request.receipt.approvalDecision.decision === "approve_once"
        ? "approve"
        : "deny"
    await this.#accessStore.decideRequest({
      requestId,
      expectedRevision: accessRequest.revision,
      actorId: request.request.principalId,
      decision,
      reason: request.request.reason,
      idempotencyKey: request.request.idempotencyKey,
      now: request.execution.updatedAt
    })
  }

  async reconcile(): Promise<void> {
    const executions = [
      ...(await this.#storage.listToolExecutions({
        state: "approved",
        limit: 1_000
      })),
      ...(await this.#storage.listToolExecutions({
        state: "denied",
        limit: 1_000
      }))
    ]
    for (const execution of executions) {
      const requestId = authorizationRequestId(execution)
      if (requestId === undefined) continue
      const accessRequest = await this.#accessStore.getRequest(requestId)
      if (accessRequest === null || accessRequest.state !== "pending") continue
      await this.#accessStore.decideRequest({
        requestId,
        expectedRevision: accessRequest.revision,
        actorId: execution.principalId,
        decision: execution.state === "approved" ? "approve" : "deny",
        reason: "reconciled from the persisted Tool approval decision",
        idempotencyKey: `reconcile:${execution.id}:${execution.approvalRevision}`,
        now: execution.updatedAt
      })
    }
  }

  async requireGrant(
    invocation: Pick<
      ToolInvocation,
      "principalId" | "sessionId" | "turnId"
    >,
    grantId: string,
    effects: readonly WorkspaceFileEffect[]
  ): Promise<RootIdentity> {
    const grant = await this.#accessStore.getGrant(opaque(grantId))
    if (grant === null) throw new Error("workspace access grant is missing")
    validateGrantSubject(grant, invocation)
    if (grant.state !== "active") {
      throw new Error(`workspace access grant is ${grant.state}`)
    }
    if (grant.expiresAt !== undefined && grant.expiresAt <= Date.now()) {
      throw new Error("workspace access grant has expired")
    }
    if (effects.some((effect) => !grant.effects.includes(effect))) {
      throw new Error("workspace access grant does not include the requested effect")
    }
    const currentPath = await realpath(grant.root.path).catch(() => undefined)
    if (currentPath !== grant.root.path) {
      throw new Error("workspace access directory identity changed")
    }
    const current = await stat(currentPath, { bigint: true }).catch(() => undefined)
    if (
      current === undefined ||
      !current.isDirectory() ||
      String(current.dev) !== grant.root.device ||
      String(current.ino) !== grant.root.inode
    ) {
      throw new Error("workspace access directory identity changed")
    }
    return grant.root
  }
}

export function parseWorkspaceAccessRequestInput(
  value: JsonValue
): WorkspaceAccessRequestInput {
  const input = workspaceInput(value)
  const path = requiredWorkspaceString(input, "path")
  if (!isAbsolute(path)) throw new Error("workspace access path must be absolute")
  const effectsValue = input.effects
  if (!Array.isArray(effectsValue) || effectsValue.length === 0) {
    throw new Error("workspace access effects are required")
  }
  const allowed = new Set<WorkspaceFileEffect>([
    "read",
    "write",
    "create",
    "remove"
  ])
  const effects = effectsValue.map((effect) => {
    if (typeof effect !== "string" || !allowed.has(effect as WorkspaceFileEffect)) {
      throw new Error("workspace access effect is invalid")
    }
    return effect as WorkspaceFileEffect
  })
  if (new Set(effects).size !== effects.length || !effects.includes("read")) {
    throw new Error("workspace access effects must include unique read")
  }
  const scopeValue = input.scope
  const scope = scopeValue === undefined ? "turn" : scopeValue
  if (scope !== "turn" && scope !== "session") {
    throw new Error("workspace access scope is invalid")
  }
  const reason =
    input.reason === undefined
      ? "The assistant requested access to this workspace directory."
      : requiredWorkspaceString(input, "reason")
  return {
    path,
    effects: (['read', 'write', 'create', 'remove'] as const).filter((effect) =>
      effects.includes(effect)
    ),
    scope,
    reason
  }
}

export function workspaceAccessRequestId(input: {
  readonly hostId: string
  readonly sessionId: string
  readonly turnId: string
  readonly inputId: string
  readonly toolCallId: string
  readonly input: WorkspaceAccessRequestInput
}): string {
  return `waccess_${digest(input).slice(0, 56)}`
}

export function authorizationRef(requestId: string): string {
  return `${AUTHORIZATION_PREFIX}${opaque(requestId)}`
}

export function workspaceAccessRequestIdFromInvocation(
  hostId: string,
  invocation: Pick<
    ToolInvocation,
    "sessionId" | "turnId" | "inputId" | "toolCallId"
  >,
  input: WorkspaceAccessRequestInput
): string {
  return workspaceAccessRequestId({
    hostId,
    sessionId: invocation.sessionId,
    turnId: invocation.turnId,
    inputId: invocation.inputId,
    toolCallId: invocation.toolCallId,
    input
  })
}

function authorizationRequestId(
  execution: Pick<ToolExecutionRecord, "permission">
): string | undefined {
  if (
    execution.permission === null ||
    typeof execution.permission !== "object" ||
    Array.isArray(execution.permission)
  ) {
    return undefined
  }
  const value = execution.permission as { authorizationRef?: JsonValue }
  if (typeof value.authorizationRef !== "string") return undefined
  if (!value.authorizationRef.startsWith(AUTHORIZATION_PREFIX)) return undefined
  const requestId = value.authorizationRef.slice(AUTHORIZATION_PREFIX.length)
  if (!/^waccess_[A-Za-z0-9]{1,56}$/u.test(requestId)) {
    throw new Error("workspace access authorization reference is invalid")
  }
  return requestId
}

export async function inspectWorkspaceRoot(
  path: string,
  effects: readonly WorkspaceFileEffect[]
): Promise<RootIdentity> {
  const canonical = await realpath(path)
  const metadata = await stat(canonical, { bigint: true })
  if (!metadata.isDirectory()) throw new Error("workspace access path is not a directory")
  return {
    id: `access_${digest(canonical).slice(0, 40)}`,
    path: canonical,
    effects,
    device: String(metadata.dev),
    inode: String(metadata.ino)
  }
}

function validateGrantSubject(
  grant: WorkspaceAccessGrantRecord,
  invocation: Pick<ToolInvocation, "principalId" | "sessionId" | "turnId">
): void {
  // A folder the user granted belongs to the conversation, so every Turn in that
  // Session (chat, plan, goal) may use it; model-requested grants stay principal-bound.
  const principalBound = grant.requestId !== undefined
  if (
    (principalBound && grant.principalId !== invocation.principalId) ||
    grant.sessionId !== invocation.sessionId ||
    (grant.scope === "turn" && grant.turnId !== invocation.turnId)
  ) {
    throw new Error("workspace access grant does not belong to this invocation")
  }
}
