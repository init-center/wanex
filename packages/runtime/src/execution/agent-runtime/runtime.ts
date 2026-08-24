import { randomUUID } from "node:crypto"
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
  PreparedUserTurn,
  SubmitAndRunUserTurnResult,
  SubmitUserTurnRequest,
  SubmitUserTurnResult,
  WanexAgentRuntimeOptions
} from "./types.js"

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
        : { observeProviderEvent: options.observeProviderEvent })
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
    const receipt = await this.session.submitTurn(prepared.request)
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
    const admitted = await admitUserMessage(
      this.storage,
      modelEndpoint,
      request.content
    )
    const title = request.title ?? deriveAutomaticSessionTitle(request.content)
    const session =
      request.sessionId === undefined
        ? await this.session.create({
            id: `ses_${randomUUID()}`,
            title,
            kind: "agent"
          })
        : ((await this.session.get(request.sessionId)) ??
          (await this.session.create({
            id: request.sessionId,
            title,
            kind: "agent"
          })))
    const inputId = request.inputId ?? `inp_${randomUUID()}`
    const turnId = request.turnId ?? `turn_${randomUUID()}`
    const agentContext =
      (await this.resolveAgentContext?.({
        sessionId: session.id,
        turnId,
        inputId,
        ...(request.origin === undefined ? {} : { origin: request.origin }),
        signal: new AbortController().signal
      })) ?? this.staticAgentContext
    const executionBinding = createTurnExecutionBinding({
      modelEndpoint,
      ...(request.maxOutputTokens === undefined
        ? {}
        : { maxOutputTokens: request.maxOutputTokens }),
      resources: admitted.resources,
      ...(this.recovery === undefined ? {} : { recovery: this.recovery }),
      ...(agentContext === undefined ? {} : { agentContext })
    })
    const submissionRequest = {
      id: inputId,
      turnId,
      sessionId: session.id,
      principalId: request.principalId ?? "agent-runtime-user",
      idempotencyKey:
        request.idempotencyKey ?? `agent-runtime:${session.id}:${inputId}`,
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
    return { session, inputId, turnId, request: submissionRequest }
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
    const agentContext =
      (await this.resolveAgentContext?.({
        sessionId: request.sessionId,
        turnId: request.turnId,
        inputId: request.inputId,
        ...(request.origin === undefined ? {} : { origin: request.origin }),
        signal: new AbortController().signal
      })) ?? this.staticAgentContext
    return createTurnExecutionBinding({
      modelEndpoint,
      resources,
      ...(request.maxOutputTokens === undefined
        ? {}
        : { maxOutputTokens: request.maxOutputTokens }),
      ...(this.recovery === undefined ? {} : { recovery: this.recovery }),
      ...(agentContext === undefined ? {} : { agentContext })
    })
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
      contextCompiler: resolved.contextCompiler ?? defaultContextCompiler
    }
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
