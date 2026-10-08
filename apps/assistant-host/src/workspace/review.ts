import { createHash } from "node:crypto"
import { basename } from "node:path"
import type { CoreStore } from "@wanex/storage"
import type { WorkspaceStore } from "@wanex/storage/workspace"
import type { WorkspaceChangeOperationRecord, WorkspaceChangeProposalRecord, WorkspaceChangeSetRecord, WorkspaceTaskRunSnapshot } from "@wanex/protocol"
import type { WorkspaceChangeAction, WorkspaceChangeConflict, WorkspaceChangeFileDetail, WorkspaceChangeKind, WorkspaceChangeListEntry, WorkspaceChangeMutationRequest, WorkspaceChangeMutationResult, WorkspaceChangeReadModel, WorkspaceChangeReference, WorkspaceChangeSummary, WorkspaceChangeToolCall, WorkspaceReviewPort } from "@wanex/assistant"
import { WorkspaceRuntime } from "@wanex/workspace"
import { WorkspaceProposalApplyRuntime, WorkspaceProposalRuntime } from "@wanex/workspace/review"
import type { ExecutionEnvironment } from "@wanex/runtime/execution"
import { writablePolicy, type RootIdentity, type WorkspaceGeneration } from "./model.js"
import type { WorkspaceAccessStore } from "./access.js"
import type { WorkspaceAccessCoordinator } from "./access-coordinator.js"
import { digest } from "./store.js"

const MAX_FILES = 16
const MAX_TOOL_CALLS = 64
const MAX_CHANGES_PER_CALL = 8
const MAX_PREVIEW_BYTES = 256 * 1024
const MAX_CONFLICTS = 32
const DIRECT_TOOL = "workspace_apply_changeset"
const PROPOSAL_TOOL = "workspace_prepare_isolated_changes"

interface ChangeRefPayload {
  readonly sessionId: string
  readonly turnId: string
  readonly sourceMessageId: string
  readonly toolCallId: string
  readonly changeSetId: string
  readonly changeKind: WorkspaceChangeKind
}

interface ResolvedChange {
  readonly ref: ChangeRefPayload
  readonly execution: NonNullable<Awaited<ReturnType<CoreStore["getToolExecutionByCall"]>>>
  readonly changeSet: WorkspaceChangeSetRecord
  readonly operations: readonly WorkspaceChangeOperationRecord[]
  readonly proposal?: WorkspaceChangeProposalRecord
  readonly history?: NonNullable<Awaited<ReturnType<WorkspaceProposalRuntime["getHistory"]>>>
  readonly run?: WorkspaceTaskRunSnapshot
  readonly generation: WorkspaceGeneration
  readonly root?: RootIdentity
}

export function createWorkspaceReviewPort(options: {
  readonly coreStore: CoreStore
  readonly workspaceStore: WorkspaceStore
  readonly accessStore: WorkspaceAccessStore
  readonly requireGrant: WorkspaceAccessCoordinator["requireGrant"]
  readonly environment: ExecutionEnvironment
  readonly serviceBin: string
  readonly loadGeneration: (key: string) => Promise<WorkspaceGeneration>
  readonly assertGeneration: (generation: WorkspaceGeneration) => Promise<void>
}): WorkspaceReviewPort {
  const proposals = new WorkspaceProposalRuntime({ storage: options.workspaceStore })

  return {
    async listChanges(request) {
      const entries: WorkspaceChangeListEntry[] = []
      for (const toolCall of request.toolCalls.slice(0, MAX_TOOL_CALLS)) {
        const changes = await changesForToolCall(request.sessionId, toolCall)
        if (changes.length > 0) entries.push({ key: toolCall.key, changes: changes.slice(0, MAX_CHANGES_PER_CALL) })
      }
      return entries
    },
    async readChange(request) {
      return projectReadModel(await resolveChange(request, options), request.sessionId)
    },
    async decideChange(request) {
      const source = await resolveChange(request, options)
      if (source.proposal === undefined || source.root === undefined) throw unavailable()
      const operationId = reviewOperationId(source.proposal.id, request.decision, request.idempotencyKey)
      if (request.decision === "approve") {
        await proposals.approveProposal({ proposalId: source.proposal.id, actorId: "assistant-user", operationId, reason: "user approved workspace change" })
      } else {
        await proposals.rejectProposal({ proposalId: source.proposal.id, actorId: "assistant-user", operationId, reason: "user rejected workspace change" })
      }
      const history = await requireHistory(source.proposal.id, options.workspaceStore)
      if (history === null || history.changeSet === null) throw unavailable()
      return projectSummary({ ...source, proposal: history.proposal, history, changeSet: history.changeSet }, request.sessionId)
    },
    async applyChange(request) {
      const source = await resolveChange(request, options)
      if (source.proposal === undefined || source.root === undefined) throw unavailable()
      if (source.proposal.state === "approved") {
        await proposals.requestApply({ proposalId: source.proposal.id, actorId: "assistant-user", operationId: reviewOperationId(source.proposal.id, "request_apply", request.idempotencyKey), reason: "user requested apply" })
      }
      return mutationResult(source, await applyProposal(source, request, options), request.sessionId)
    },
    async undoChange(request) { return await mutateChange(request, "undo") },
    async reapplyChange(request) { return await mutateChange(request, "reapply") },
  }

  async function changesForToolCall(sessionId: string, toolCall: WorkspaceChangeToolCall): Promise<readonly WorkspaceChangeSummary[]> {
    if (toolCall.turnId.length === 0 || toolCall.sourceMessageId.length === 0) return []
    const execution = await options.coreStore.getToolExecutionByCall({ turnId: toolCall.turnId, sourceMessageId: toolCall.sourceMessageId, toolCallId: toolCall.toolCallId })
    if (execution === null || execution.toolName !== toolCall.toolName || (execution.toolName !== DIRECT_TOOL && execution.toolName !== PROPOSAL_TOOL)) return []
    const changeKind = execution.toolName === DIRECT_TOOL ? "direct" : "proposal"
    const result: WorkspaceChangeSummary[] = []
    for (const changeSetId of resultChangeSetIds(execution).slice(0, MAX_CHANGES_PER_CALL)) {
      try {
        result.push(projectSummary(await resolvePayload({ sessionId, turnId: execution.turnId, sourceMessageId: execution.sourceMessageId, toolCallId: execution.toolCallId, changeSetId, changeKind }, execution, options), sessionId))
      } catch {
        // A failed or partially persisted tool call is not a change card.
      }
    }
    return result
  }

  async function mutateChange(request: WorkspaceChangeMutationRequest, operation: "undo" | "reapply"): Promise<WorkspaceChangeMutationResult> {
    const source = await resolveChange(request, options)
    if (source.root === undefined) throw unavailable()
    const scope = await options.environment.bind({ scopeId: `workspace_review_${operation}:${source.changeSet.id}:${request.idempotencyKey}`, policy: writablePolicy([source.root]), fileSystemRoots: [{ id: source.root.id, path: source.root.path }] })
    try {
      const workspace = new WorkspaceRuntime({ storage: options.workspaceStore, workspaceId: source.changeSet.workspaceId, principalId: source.changeSet.principalId, rootDir: source.root.path, serviceBin: options.serviceBin, executionScope: scope })
      const mutation = { sourceKind: "host" as const, sourceId: `assistant-workspace-review:${source.changeSet.id}`, idempotencyKey: `assistant-workspace-review:${operation}:${request.idempotencyKey}`, ownerId: source.changeSet.principalId }
      const result = operation === "undo" ? await workspace.undoChangeSet({ changeSetId: source.changeSet.id, mutation }) : await workspace.reapplyChangeSet({ changeSetId: source.changeSet.id, mutation })
      await options.assertGeneration(source.generation)
      return mutationResult(source, result.operation, request.sessionId)
    } finally { await scope.close() }
  }
}

async function resolveChange(request: WorkspaceChangeReference, options: Parameters<typeof createWorkspaceReviewPort>[0]): Promise<ResolvedChange> {
  const ref = decodeChangeRef(request.changeRef, request.sessionId)
  const execution = await options.coreStore.getToolExecutionByCall({ turnId: ref.turnId, sourceMessageId: ref.sourceMessageId, toolCallId: ref.toolCallId })
  if (execution === null || execution.sessionId !== request.sessionId || execution.toolName !== (ref.changeKind === "direct" ? DIRECT_TOOL : PROPOSAL_TOOL) || !resultChangeSetIds(execution).includes(ref.changeSetId)) throw unavailable()
  return await resolvePayload(ref, execution, options)
}

async function resolvePayload(ref: ChangeRefPayload, execution: NonNullable<Awaited<ReturnType<CoreStore["getToolExecutionByCall"]>>>, options: Parameters<typeof createWorkspaceReviewPort>[0]): Promise<ResolvedChange> {
  const changeSet = await options.workspaceStore.getWorkspaceChangeSet({ changeSetId: ref.changeSetId })
  if (changeSet === null || changeSet.principalId !== execution.principalId) throw unavailable()
  const operations = await options.workspaceStore.listWorkspaceChangeOperations({ changeSetId: ref.changeSetId })
  const { generationKey, rootId } = workspaceIdentity(changeSet.workspaceId)
  const generation = await options.loadGeneration(generationKey)
  let authorityValid = true
  try { await options.assertGeneration(generation) } catch { authorityValid = false }
  const root = authorityValid ? await resolveRoot(execution, generation, rootId, options) : undefined
  if (ref.changeKind === "direct") return { ref, execution, changeSet, operations, generation, ...(root === undefined ? {} : { root }) }
  const proposalId = resultProposalId(execution, ref.changeSetId)
  if (proposalId === undefined) throw unavailable()
  const history = await requireHistory(proposalId, options.workspaceStore)
  if (history === null || history.changeSet === null || history.changeSet.id !== changeSet.id) throw unavailable()
  const taskId = resultTaskId(execution, ref.changeSetId)
  const run = taskId === undefined ? undefined : await options.workspaceStore.getWorkspaceTaskRun({ runId: taskId })
  if (run !== undefined && (run === null || run.run.proposalId !== proposalId)) throw unavailable()
  return { ref, execution, changeSet, operations, proposal: history.proposal, history, ...(run === null || run === undefined ? {} : { run }), generation, ...(root === undefined ? {} : { root }) }
}

async function resolveRoot(execution: ResolvedChange["execution"], generation: WorkspaceGeneration, rootId: string, options: Parameters<typeof createWorkspaceReviewPort>[0]): Promise<RootIdentity | undefined> {
  const input = execution.input
  if (!isObject(input)) return undefined
  const configured = generation.roots.find(({ root }) => root.id === rootId)?.root
  if (execution.toolName === PROPOSAL_TOOL) return input.rootId === rootId ? configured : undefined
  if (!Array.isArray(input.changes)) return undefined
  let selected: RootIdentity | undefined
  for (const change of input.changes) {
    if (!isObject(change)) continue
    let root: RootIdentity | undefined
    if (change.rootId === rootId) root = configured
    else if (typeof change.grantId === "string") {
      try {
        const grant = await options.accessStore.getGrant(change.grantId)
        if (grant?.root.id === rootId) root = await options.requireGrant(execution, grant.id, ["read"])
      } catch { return undefined }
    }
    if (root === undefined) continue
    if (selected !== undefined && (selected.path !== root.path || selected.device !== root.device || selected.inode !== root.inode)) return undefined
    selected ??= root
  }
  return selected
}

async function applyProposal(source: ResolvedChange, request: WorkspaceChangeMutationRequest, options: Parameters<typeof createWorkspaceReviewPort>[0]): Promise<WorkspaceChangeOperationRecord> {
  if (source.root === undefined || source.proposal === undefined) throw unavailable()
  const scope = await options.environment.bind({ scopeId: `workspace_review_apply:${source.proposal.id}:${request.idempotencyKey}`, policy: writablePolicy([source.root]), fileSystemRoots: [{ id: source.root.id, path: source.root.path }] })
  try {
    const workspace = new WorkspaceRuntime({ storage: options.workspaceStore, workspaceId: source.changeSet.workspaceId, principalId: source.changeSet.principalId, rootDir: source.root.path, serviceBin: options.serviceBin, executionScope: scope })
    const runtime = new WorkspaceProposalApplyRuntime({ storage: options.workspaceStore, workspace, actorId: "assistant-user" })
    const result = await runtime.applyProposal({ proposalId: source.proposal.id, actorId: "assistant-user", metadata: { source: "assistant.workspace-review", sessionId: request.sessionId } })
    if (result.workspaceOperation === undefined) throw unavailable()
    return result.workspaceOperation
  } finally { await scope.close() }
}

function projectReadModel(source: ResolvedChange, sessionId: string): WorkspaceChangeReadModel {
  const summary = projectSummary(source, sessionId)
  let remaining = MAX_PREVIEW_BYTES
  const files: WorkspaceChangeFileDetail[] = source.changeSet.changeSet.changes.slice(0, MAX_FILES).map((change) => {
    const before = projectText(change.baseText, change.baseSha256, remaining); remaining -= before.bytes
    const after = projectText(change.targetText, undefined, remaining); remaining -= after.bytes
    return { path: change.path, kind: change.kind, ...(before.value === undefined ? {} : { before: before.value }), ...(after.value === undefined ? {} : { after: after.value }) }
  })
  return { ...summary, files }
}

function projectSummary(source: ResolvedChange, sessionId: string): WorkspaceChangeSummary {
  const latest = source.operations.at(-1)
  const status = source.proposal === undefined ? directStatus(source.changeSet, latest) : proposalStatus(source.proposal, source.changeSet, latest)
  const actions: WorkspaceChangeAction[] = source.root === undefined ? [] : source.proposal === undefined ? status === "applied" ? ["undo"] : status === "undone" ? ["reapply"] : [] : source.proposal.state === "open" ? ["approve", "reject"] : source.proposal.state === "approved" ? ["apply", "reject"] : status === "applied" ? ["undo"] : status === "undone" ? ["reapply"] : []
  const title = source.proposal?.title ?? source.changeSet.title
  return { kind: "assistant.workspace-change", changeRef: encodeChangeRef(source.ref), changeKind: source.ref.changeKind, folder: basename(source.root?.path ?? "Workspace"), ...(title === undefined ? {} : { title }), status, available: source.root !== undefined, actions, totalFileCount: source.changeSet.changeSet.changes.length, files: source.changeSet.changeSet.changes.slice(0, MAX_FILES).map((change) => ({ path: change.path, kind: change.kind })) }
}

function mutationResult(source: ResolvedChange, operation: WorkspaceChangeOperationRecord, sessionId: string): WorkspaceChangeMutationResult {
  const outcome = operation.status === "conflicted" ? "conflicted" : operation.status === "applied" ? "applied" : "failed"
  const conflicts = operation.receipt.conflicts.slice(0, MAX_CONFLICTS).map<WorkspaceChangeConflict>((conflict) => ({ path: conflict.path, reason: conflict.reason }))
  const current = { ...source, operations: [...source.operations, operation] }
  return { kind: "assistant.workspace-change-mutation", outcome, change: projectSummary(current, sessionId), conflicts, totalConflictCount: operation.receipt.conflicts.length }
}

function directStatus(changeSet: WorkspaceChangeSetRecord, operation: WorkspaceChangeOperationRecord | undefined): WorkspaceChangeSummary["status"] {
  if (operation?.status === "conflicted") return "conflicted"
  if (operation?.operation === "undo" && operation.status === "applied") return "undone"
  if (operation?.operation === "apply" && operation.status === "applied") return "applied"
  return changeSet.currentState === "applied" ? "applied" : "failed"
}

function proposalStatus(proposal: WorkspaceChangeProposalRecord, changeSet: WorkspaceChangeSetRecord, operation: WorkspaceChangeOperationRecord | undefined): WorkspaceChangeSummary["status"] {
  if (operation?.status === "conflicted") return "conflicted"
  if (operation?.operation === "undo" && operation.status === "applied") return "undone"
  if (operation?.operation === "apply" && operation.status === "applied") return "applied"
  if (proposal.state === "approved") return "approved"
  if (proposal.state === "rejected") return "rejected"
  if (proposal.state === "open") return "proposed"
  return changeSet.currentState === "applied" ? "applied" : "failed"
}

function resultChangeSetIds(execution: { readonly content?: readonly { readonly type: string; readonly value?: unknown }[] }): readonly string[] {
  const values: string[] = []
  for (const part of execution.content ?? []) if (part.type === "json" && part.value !== undefined) collectChangeSetIds(part.value, values)
  return [...new Set(values)]
}

function resultProposalId(execution: { readonly content?: readonly { readonly type: string; readonly value?: unknown }[] }, changeSetId: string): string | undefined {
  for (const part of execution.content ?? []) if (part.type === "json" && part.value !== undefined) { const found = findProposalId(part.value, changeSetId); if (found !== undefined) return found }
  return undefined
}

function resultTaskId(execution: { readonly content?: readonly { readonly type: string; readonly value?: unknown }[] }, changeSetId: string): string | undefined {
  for (const part of execution.content ?? []) if (part.type === "json" && part.value !== undefined) {
    const found = findTaskId(part.value, changeSetId)
    if (found !== undefined) return found
  }
  return undefined
}

function collectChangeSetIds(value: unknown, output: string[]): void {
  if (Array.isArray(value)) { for (const item of value) collectChangeSetIds(item, output); return }
  if (!isObject(value)) return
  if (typeof value.changeSetId === "string") output.push(value.changeSetId)
  for (const nested of Object.values(value)) collectChangeSetIds(nested, output)
}

function findProposalId(value: unknown, changeSetId: string): string | undefined {
  if (Array.isArray(value)) { for (const item of value) { const found = findProposalId(item, changeSetId); if (found !== undefined) return found } return undefined }
  if (!isObject(value)) return undefined
  if (value.changeSetId === changeSetId && typeof value.proposalId === "string") return value.proposalId
  for (const nested of Object.values(value)) { const found = findProposalId(nested, changeSetId); if (found !== undefined) return found }
  return undefined
}

function findTaskId(value: unknown, changeSetId: string): string | undefined {
  if (Array.isArray(value)) { for (const item of value) { const found = findTaskId(item, changeSetId); if (found !== undefined) return found } return undefined }
  if (!isObject(value)) return undefined
  if (value.changeSetId === changeSetId && typeof value.taskId === "string") return value.taskId
  for (const nested of Object.values(value)) { const found = findTaskId(nested, changeSetId); if (found !== undefined) return found }
  return undefined
}

function isObject(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) }

function workspaceIdentity(workspaceId: string): { readonly generationKey: string; readonly rootId: string } { const separator = workspaceId.lastIndexOf(":"); if (separator <= 0 || separator === workspaceId.length - 1) throw unavailable(); return { generationKey: workspaceId.slice(0, separator), rootId: workspaceId.slice(separator + 1) } }

function encodeChangeRef(ref: ChangeRefPayload): string { const body = Buffer.from(JSON.stringify(ref), "utf8").toString("base64url"); return `wcr_${body}.${checksum(body, ref.sessionId)}` }

function decodeChangeRef(value: string, sessionId: string): ChangeRefPayload {
  if (!value.startsWith("wcr_")) throw unavailable()
  const [body, check] = value.slice(4).split(".")
  if (body === undefined || check === undefined || check !== checksum(body, sessionId)) throw unavailable()
  let parsed: unknown
  try { parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) } catch { throw unavailable() }
  if (!isObject(parsed) || parsed.sessionId !== sessionId || typeof parsed.turnId !== "string" || typeof parsed.sourceMessageId !== "string" || typeof parsed.toolCallId !== "string" || typeof parsed.changeSetId !== "string" || (parsed.changeKind !== "direct" && parsed.changeKind !== "proposal")) throw unavailable()
  return parsed as unknown as ChangeRefPayload
}

function checksum(body: string, sessionId: string): string { return createHash("sha256").update(`${sessionId}\u0000${body}`, "utf8").digest("hex").slice(0, 24) }

function projectText(text: string | undefined, knownSha256: string | undefined, remaining: number): { bytes: number; value?: { sha256: string; text?: string; truncated: boolean } } {
  if (text === undefined && knownSha256 === undefined) return { bytes: 0 }
  const sha256 = knownSha256 ?? createHash("sha256").update(text!, "utf8").digest("hex")
  if (text === undefined || remaining <= 0) return { bytes: 0, value: { sha256, truncated: text !== undefined } }
  const limit = Math.min(32 * 1024, remaining)
  const value = Buffer.byteLength(text, "utf8") <= limit ? text : Buffer.from(text, "utf8").subarray(0, limit).toString("utf8")
  return { bytes: Buffer.byteLength(value, "utf8"), value: { sha256, text: value, truncated: value !== text } }
}

async function requireHistory(proposalId: string, storage: WorkspaceStore) { return await new WorkspaceProposalRuntime({ storage }).getHistory(proposalId) }
function reviewOperationId(proposalId: string, operation: string, idempotencyKey: string): string { return "wsro_" + digest([proposalId, operation, idempotencyKey]).slice(0, 40) }
function unavailable(): Error { return new Error("workspace change is unavailable") }
