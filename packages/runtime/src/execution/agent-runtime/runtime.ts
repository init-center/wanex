import { createHash, randomUUID } from "node:crypto"
import {
  runEphemeralSideQuery,
  type RunEphemeralSideQueryRequest
} from "../core/index.js"
import { createTurnExecutionBinding } from "../turn-binding.js"
import { registerSessionTurnHandler } from "../worker/index.js"
import { TurnControlEventObserver } from "../worker/turn-control-observer.js"
import type { PreparedAgentContext } from "../../context/agent/index.js"
import type { ContextCompiler } from "../../context/memory/index.js"
import { SemanticContextCompiler } from "../../context/memory/index.js"
import {
  assertConversationModelSupported,
  FakeProviderAdapter,
  requireModelEndpoint,
  resolveModelEndpoint,
  type ProviderAdapter
} from "../../provider/index.js"
import type {
  EphemeralQueryResult,
  ModelEndpoint,
  SessionRecord,
  SessionScope,
  SessionTurnExecutionBinding,
  SubmitSessionTurnReceipt,
  UserMessageInputPart
} from "@wanex/protocol"
import {
  admitUserMessage,
  validateCanonicalUserMessage
} from "../../resources/index.js"
import {
  WanexJobRuntime,
  type RuntimeWorkerLoop,
  type WorkerLoopOptions
} from "../../jobs/index.js"
import type {
  AgentRunOnceResult,
  PrepareSessionTurnExecutionBindingRequest,
  PreparedSessionTurnExecutionBinding,
  PreparedSessionTurnContext,
  PreparedUserTurn,
  SubmitAndRunUserTurnResult,
  SubmitUserTurnRequest,
  SubmitUserTurnResult,
  WanexAgentRuntimeOptions
} from "./types.js"
import type {
  SessionTurnAgentContextLease,
} from "../worker/types.js"
import {
  reconcilePreparedSessionTurnContext,
  settlePreparedSessionTurnContext,
} from "./prepared-context.js"

const DEFAULT_LEASE_MS = 60_000
const MAX_DERIVED_SESSION_TITLE_CHARACTERS = 200
const FALLBACK_SESSION_TITLE = "Resource conversation"

export class WanexAgentRuntime {
  readonly runtime: WanexJobRuntime
  readonly storage: WanexRuntimeOptionsStorage
  readonly session: WanexJobRuntime["session"]
  readonly events: WanexJobRuntime["events"]
  readonly config: WanexJobRuntime["config"]

  private readonly defaultModelEndpointId: string | undefined
  private readonly directProvider: ProviderAdapter | undefined
  private readonly secretResolver: WanexAgentRuntimeOptions["secretResolver"]
  private readonly contextCompiler: ContextCompiler | undefined
  private readonly timeoutMs: number | undefined
  private readonly staticAgentContext: PreparedAgentContext | undefined
  private readonly resolveAgentContext: WanexAgentRuntimeOptions["resolveAgentContext"]
  private readonly recovery: WanexAgentRuntimeOptions["recovery"]

  constructor(options: WanexAgentRuntimeOptions) {
    const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS
    const directProvider =
      options.provider ??
      (options.fakeResponseText === undefined
        ? undefined
        : new FakeProviderAdapter({ responseText: options.fakeResponseText }))
    this.runtime = new WanexJobRuntime({
      storage: options.storage,
      workerId: options.workerId ?? `agent_runtime_worker_${randomUUID()}`,
      ...(options.queue === undefined ? {} : { queue: options.queue }),
      leaseMs,
      ...(options.heartbeatIntervalMs === undefined
        ? {}
        : { heartbeatIntervalMs: options.heartbeatIntervalMs }),
      ...(options.timeoutMs === undefined
        ? {}
        : { timeoutMs: options.timeoutMs }),
      kinds: ["session.turn"],
      ...(options.activeAbortRegistry === undefined
        ? {}
        : { activeAbortRegistry: options.activeAbortRegistry })
    })
    this.storage = options.storage
    this.session = this.runtime.session
    this.events = this.runtime.events
    this.config = this.runtime.config
    this.defaultModelEndpointId = options.modelEndpointId
    this.directProvider = directProvider
    this.secretResolver = options.secretResolver
    this.contextCompiler =
      options.agentContext?.contextCompiler ??
      options.contextCompiler ??
      new SemanticContextCompiler({ epochStore: options.storage })
    this.timeoutMs = options.timeoutMs
    this.resolveAgentContext = withDefaultContextCompilerResolver(
      options.resolveAgentContext,
      this.contextCompiler
    )
    this.recovery = options.recovery
    this.staticAgentContext = staticAgentContext(options, this.contextCompiler)

    registerSessionTurnHandler({
      worker: this.runtime.worker,
      session: this.session,
      storage: options.storage,
      turnControlObserver:
        options.turnControlObserver ??
        new TurnControlEventObserver({ storage: options.storage }),
      ...(directProvider === undefined ? {} : { directProvider }),
      ...(options.secretResolver === undefined
        ? {}
        : { secretResolver: options.secretResolver }),
      ...(this.staticAgentContext === undefined
        ? {}
        : { agentContext: this.staticAgentContext }),
      ...(this.resolveAgentContext === undefined
        ? {}
        : { resolveAgentContext: this.resolveAgentContext }),
      ...(options.toolMaxConcurrency === undefined
        ? {}
        : { toolMaxConcurrency: options.toolMaxConcurrency }),
      ...(options.timeoutMs === undefined
        ? {}
        : { timeoutMs: options.timeoutMs }),
      ...(options.observeProviderEvent === undefined
        ? {}
        : { observeProviderEvent: options.observeProviderEvent }),
      ...(options.observeExecutionStage === undefined
        ? {}
        : { observeExecutionStage: options.observeExecutionStage })
    })
  }

  async runEphemeralQuery(
    request: RunEphemeralSideQueryRequest
  ): Promise<EphemeralQueryResult> {
    const { modelEndpoint, provider } = await this.resolveEphemeralExecution(
      request.modelEndpointId
    )
    return await runEphemeralSideQuery(
      {
        session: this.session,
        provider,
        modelEndpoint,
        ...(this.contextCompiler === undefined
          ? {}
          : { contextCompiler: this.contextCompiler }),
        ...(this.timeoutMs === undefined ? {} : { timeoutMs: this.timeoutMs })
      },
      request
    )
  }

  async submitUserTurn(
    request: SubmitUserTurnRequest
  ): Promise<SubmitUserTurnResult> {
    const prepared = await this.prepareUserTurn(request)
    let receipt: SubmitSessionTurnReceipt
    try {
      receipt = await this.session.submitTurn(prepared.request)
    } catch (error) {
      await reconcilePreparedSessionTurnContext(
        this.storage,
        preparedContextBinding(prepared),
        prepared.turnId
      )
      throw error
    }
    settlePreparedSessionTurnContext(
      preparedContextBinding(prepared),
      receipt.turn,
      prepared.turnId
    )
    return {
      session: prepared.session,
      inputId: prepared.inputId,
      turnId: receipt.turn.id,
      receipt
    }
  }

  async prepareUserTurn(
    request: SubmitUserTurnRequest
  ): Promise<PreparedUserTurn> {
    const modelEndpoint = await this.resolveAdmissionModelEndpoint(
      request.modelEndpointId
    )
    const title = request.title ?? deriveAutomaticSessionTitle(request.content)
    const existingSession = request.sessionId === undefined
      ? null
      : await this.session.get(request.sessionId)
    if (existingSession !== null) {
      assertRequestedSessionScope(existingSession, request.sessionScope)
    }
    const admitted = await admitUserMessage(
      this.storage,
      modelEndpoint,
      request.content
    )
    const session = existingSession ?? await this.session.create({
      id: request.sessionId ?? `ses_${randomUUID()}`,
      title,
      kind: "agent",
      ...(request.sessionScope === undefined
        ? {}
        : { scope: request.sessionScope })
    })
    assertRequestedSessionScope(session, request.sessionScope)
    const inputId =
      request.inputId ??
      (request.idempotencyKey === undefined
        ? `inp_${randomUUID()}`
        : stableSubmissionIdentity(
            "inp",
            session.id,
            request.idempotencyKey,
          ))
    const idempotencyKey =
      request.idempotencyKey ?? `agent-runtime:${session.id}:${inputId}`
    const turnId =
      request.turnId ??
      stableSubmissionIdentity("turn", session.id, idempotencyKey)
    const resolved = await this.resolveAgentContext?.({
        sessionId: session.id,
        turnId,
        inputId,
        phase: "admission",
        ...(request.origin === undefined ? {} : { origin: request.origin }),
        signal: new AbortController().signal
      })
    let executionBinding: SessionTurnExecutionBinding
    try {
      const agentContext = resolved?.context ?? this.staticAgentContext
      executionBinding = createTurnExecutionBinding({
        modelEndpoint,
        ...(request.maxOutputTokens === undefined
          ? {}
          : { maxOutputTokens: request.maxOutputTokens }),
        resources: admitted.resources,
        ...(this.recovery === undefined ? {} : { recovery: this.recovery }),
        ...(request.executionEnvironment === undefined
          ? {}
          : { executionEnvironment: request.executionEnvironment }),
        ...(request.applicationScope === undefined
          ? {}
          : { applicationScope: request.applicationScope }),
        ...(agentContext === undefined ? {} : { agentContext })
      })
    } catch (error) {
      resolved?.lease?.rollback()
      throw error
    }
    const submissionRequest = {
      id: inputId,
      turnId,
      sessionId: session.id,
      principalId: request.principalId ?? "agent-runtime-user",
      queue: this.runtime.queue,
      idempotencyKey,
      content: admitted.content,
      executionBinding,
      ...(request.origin === undefined ? {} : { origin: request.origin }),
      ...(request.intent === undefined ? {} : { intent: request.intent }),
      ...(request.runControlPolicy === undefined
        ? {}
        : { runControlPolicy: request.runControlPolicy }),
      ...(request.expectedTurnId === undefined
        ? {}
        : { expectedTurnId: request.expectedTurnId }),
      ...(request.jobId === undefined ? {} : { jobId: request.jobId }),
      ...(request.jobIdempotencyKey === undefined
        ? {}
        : { jobIdempotencyKey: request.jobIdempotencyKey }),
      ...(request.budgetGrantId === undefined
        ? {}
        : { budgetGrantId: request.budgetGrantId }),
      ...(request.maxSteps === undefined ? {} : { maxSteps: request.maxSteps }),
      ...(request.regeneratesTurnId === undefined
        ? {}
        : { regeneratesTurnId: request.regeneratesTurnId })
    }
    return {
      session,
      inputId,
      turnId,
      request: submissionRequest,
      context: bindPreparedContext(
        resolved?.lease,
        resolved?.contextIdentity,
        executionBinding
      ),
    }
  }

  async prepareExecutionBinding(
    request: PrepareSessionTurnExecutionBindingRequest
  ): Promise<PreparedSessionTurnExecutionBinding> {
    const modelEndpoint = await this.resolveAdmissionModelEndpoint(
      request.modelEndpointId
    )
    const resources = await validateCanonicalUserMessage(
      this.storage,
      modelEndpoint,
      request.content
    )
    const resolved = await this.resolveAgentContext?.({
        sessionId: request.sessionId,
        turnId: request.turnId,
        inputId: request.inputId,
        ...(request.inheritedContextBinding === undefined
          ? { phase: "admission" as const }
          : {
              phase: "inheritance" as const,
              executionBinding: request.inheritedContextBinding,
              ...(request.inheritedContextIdentity === undefined
                ? {}
                : { contextIdentity: request.inheritedContextIdentity }),
            }),
        ...(request.origin === undefined ? {} : { origin: request.origin }),
        signal: new AbortController().signal
      })
    if (
      request.inheritedContextBinding === undefined &&
      request.inheritedContextIdentity !== undefined
    ) {
      resolved?.lease?.rollback()
      throw new Error(
        "inherited context identity requires an inherited execution binding"
      )
    }
    if (
      request.inheritedContextBinding !== undefined &&
      resolved?.lease !== undefined &&
      resolved.lease.phase !== "inheritance"
    ) {
      resolved.lease.rollback()
      throw new Error("inherited context resolution returned a non-inheritance lease")
    }
    if (
      request.inheritedContextIdentity !== undefined &&
      resolved?.contextIdentity !== request.inheritedContextIdentity
    ) {
      resolved?.lease?.rollback()
      throw new Error("inherited context resolution changed its context generation")
    }
    let binding: SessionTurnExecutionBinding
    try {
      const agentContext = resolved?.context ?? this.staticAgentContext
      binding = createTurnExecutionBinding({
        modelEndpoint,
        resources,
        ...(request.maxOutputTokens === undefined
          ? {}
          : { maxOutputTokens: request.maxOutputTokens }),
        ...(this.recovery === undefined ? {} : { recovery: this.recovery }),
        ...(request.executionEnvironment === undefined
          ? {}
          : { executionEnvironment: request.executionEnvironment }),
        ...(request.applicationScope === undefined
          ? {}
          : { applicationScope: request.applicationScope }),
        ...(agentContext === undefined ? {} : { agentContext })
      })
    } catch (error) {
      resolved?.lease?.rollback()
      throw error
    }
    return {
      binding,
      context: bindPreparedContext(
        resolved?.lease,
        resolved?.contextIdentity,
        binding
      ),
    }
  }

  async runOnce(): Promise<AgentRunOnceResult> {
    const worker = await this.runtime.runWorkerOnce()
    if (worker.status === "idle" || worker.job === null) {
      return { worker }
    }
    return { worker, job: worker.job }
  }

  start(options: WorkerLoopOptions = {}): RuntimeWorkerLoop {
    return this.runtime.startWorkerLoop(options)
  }

  async submitAndRunUserTurn(
    request: SubmitUserTurnRequest
  ): Promise<SubmitAndRunUserTurnResult> {
    const submitted = await this.submitUserTurn(request)
    const run = await this.runOnce()
    const messages = await this.session.listMessages({
      sessionId: submitted.session.id
    })
    return { ...submitted, run, messages }
  }

  async stop(): Promise<void> {
    await this.runtime.stop()
  }

  private async resolveAdmissionModelEndpoint(
    modelEndpointId: string | undefined
  ): Promise<ModelEndpoint> {
    const endpointId = modelEndpointId ?? this.defaultModelEndpointId
    if (endpointId !== undefined) {
      return requireConversationModelEndpoint(
        await requireModelEndpoint(this.storage, endpointId)
      )
    }
    if (this.directProvider !== undefined) {
      return directModelEndpoint(this.directProvider)
    }
    throw new Error("session turn submission requires a model endpoint")
  }

  private async resolveEphemeralExecution(
    modelEndpointId: string | undefined
  ): Promise<{ readonly modelEndpoint: ModelEndpoint; readonly provider: ProviderAdapter }> {
    const endpointId = modelEndpointId ?? this.defaultModelEndpointId
    if (endpointId !== undefined) {
      const modelEndpoint = requireConversationModelEndpoint(
        await requireModelEndpoint(this.storage, endpointId)
      )
      const provider = await resolveModelEndpoint(
        this.storage,
        endpointId,
        this.secretResolver
      )
      return { modelEndpoint, provider }
    }
    if (this.directProvider !== undefined) {
      return {
        modelEndpoint: directModelEndpoint(this.directProvider),
        provider: this.directProvider
      }
    }
    throw new Error("ephemeral query requires modelEndpointId")
  }
}

function requireConversationModelEndpoint(
  endpoint: ModelEndpoint
): ModelEndpoint {
  assertConversationModelSupported(endpoint.protocol.id, endpoint.model)
  return endpoint
}

type WanexRuntimeOptionsStorage = ConstructorParameters<
  typeof WanexJobRuntime
>[0]["storage"]

function staticAgentContext(
  options: WanexAgentRuntimeOptions,
  defaultContextCompiler: ContextCompiler
): PreparedAgentContext {
  if (options.agentContext !== undefined) {
    if (
      options.contextCompiler !== undefined ||
      options.tools !== undefined ||
      options.toolPermissionPolicy !== undefined
    ) {
      throw new Error(
        "agentContext cannot be combined with contextCompiler, tools, or toolPermissionPolicy"
      )
    }
    return {
      ...options.agentContext,
      contextCompiler:
        options.agentContext.contextCompiler ?? defaultContextCompiler
    }
  }
  return {
    contextCompiler: options.contextCompiler ?? defaultContextCompiler,
    ...(options.tools === undefined ? {} : { tools: options.tools }),
    ...(options.toolPermissionPolicy === undefined
      ? {}
      : { toolPermissionPolicy: options.toolPermissionPolicy })
  }
}

function withDefaultContextCompilerResolver(
  resolver: WanexAgentRuntimeOptions["resolveAgentContext"],
  defaultContextCompiler: ContextCompiler
): WanexAgentRuntimeOptions["resolveAgentContext"] {
  if (resolver === undefined) return undefined
  return async (request) => {
    const resolved = await resolver(request)
    if (resolved === undefined) return undefined
    return {
      ...resolved,
      ...(resolved.context === undefined
        ? {}
        : {
            context: {
              ...resolved.context,
              contextCompiler:
                resolved.context.contextCompiler ?? defaultContextCompiler,
            },
          }),
    }
  }
}

function stableSubmissionIdentity(
  kind: "inp" | "turn",
  sessionId: string,
  idempotencyKey: string
): string {
  const digest = createHash("sha256")
    .update(["wanex.runtime.submission", kind, sessionId, idempotencyKey].join("\u0000"), "utf8")
    .digest("hex")
    .slice(0, 32)
  return `${kind}_runtime_${digest}`
}

function bindPreparedContext(
  lease: SessionTurnAgentContextLease | undefined,
  identity: PreparedSessionTurnContext["identity"],
  binding: SessionTurnExecutionBinding
): PreparedSessionTurnContext {
  let state: "pending" | "committed" | "rolled_back" = "pending"
  return Object.freeze({
    ...(identity === undefined ? {} : { identity }),
    commit() {
      if (state !== "pending") return
      state = "committed"
      try {
        lease?.commit(binding)
      } catch {
        // Durable admission already committed; lifecycle cleanup cannot undo it.
      }
    },
    rollback() {
      if (state !== "pending") return
      state = "rolled_back"
      try {
        lease?.rollback()
      } catch {
        // Rollback is best-effort process-local cleanup and must not mask the
        // original admission failure.
      }
    },
  })
}

function preparedContextBinding(
  prepared: PreparedUserTurn
): PreparedSessionTurnExecutionBinding {
  return {
    binding: prepared.request.executionBinding,
    context: prepared.context,
  }
}

function assertRequestedSessionScope(
  session: SessionRecord,
  requested: SessionScope | undefined
): void {
  if (requested === undefined) {
    if (session.scope !== undefined) {
      throw new Error("existing scoped session requires an exact requested session scope")
    }
    return
  }
  if (
    session.scope?.kind !== requested.kind ||
    session.scope.id !== requested.id
  ) {
    throw new Error("existing session does not match the requested session scope")
  }
}

function directModelEndpoint(provider: ProviderAdapter): ModelEndpoint {
  const connectionId = `direct:${provider.providerId}`
  return {
    id: `${connectionId}:${provider.model.id}`,
    connection: {
      id: connectionId,
      providerId: provider.providerId
    },
    protocol: provider.protocol,
    model: provider.model
  }
}

function deriveAutomaticSessionTitle(
  content: readonly UserMessageInputPart[]
): string {
  const text = content.find((part) => part.type === "text")?.text
  if (text === undefined) return FALLBACK_SESSION_TITLE

  let fence: { readonly marker: "`" | "~"; readonly length: number } | undefined
  for (const line of text.split(/\r\n?|\n/)) {
    const trimmed = line.trim()
    const fenceMarker = parseFenceMarker(trimmed)
    if (fence !== undefined) {
      if (
        fenceMarker?.marker === fence.marker &&
        fenceMarker.length >= fence.length &&
        fenceMarker.rest.length === 0
      ) {
        fence = undefined
        continue
      }
      const title = boundTitle(collapseWhitespace(trimmed))
      if (title.length > 0) return title
      continue
    }
    if (fenceMarker !== undefined) {
      fence = fenceMarker
      continue
    }

    const title = boundTitle(
      collapseWhitespace(stripLeadingMarkdownBlockSyntax(trimmed))
    )
    if (title.length > 0) return title
  }

  return FALLBACK_SESSION_TITLE
}

function parseFenceMarker(
  line: string
):
  | {
      readonly marker: "`" | "~"
      readonly length: number
      readonly rest: string
    }
  | undefined {
  const match = /^(`{3,}|~{3,})(.*)$/.exec(line)
  if (match === null) return undefined
  const token = match[1]
  if (token === undefined) return undefined
  return {
    marker: token[0] as "`" | "~",
    length: token.length,
    rest: match[2]?.trim() ?? ""
  }
}

function stripLeadingMarkdownBlockSyntax(line: string): string {
  let result = line
  while (/^>\s?/.test(result)) {
    result = result.replace(/^>\s?/, "")
  }
  result = result.replace(/^#{1,6}(?:[ \t]+|$)/, "")
  result = result.replace(/^(?:[-+*]|\d{1,9}[.)])[ \t]+/, "")
  result = result.replace(/^\[[ xX]\][ \t]+/, "")
  return result.trim()
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ")
}

function boundTitle(value: string): string {
  return Array.from(value)
    .slice(0, MAX_DERIVED_SESSION_TITLE_CHARACTERS)
    .join("")
}
