import { randomUUID } from "node:crypto"
import { runEphemeralSideQuery } from "../core/index.js"
import { createTurnExecutionBinding } from "../turn-binding.js"
import { registerSessionTurnHandler } from "../worker/index.js"
import type { PreparedAgentContext } from "../../context/agent/index.js"
import type { ContextCompiler } from "../../context/memory/index.js"
import {
  FakeProviderAdapter,
  requireProviderProfile,
  resolveProviderProfile,
  type ProviderAdapter
} from "../../provider/index.js"
import type {
  EphemeralQueryRequest,
  EphemeralQueryResult,
  ProviderProfile
} from "@wanex/protocol"
import { admitUserMessage } from "../../resources/index.js"
import {
  WanexJobRuntime,
  type RuntimeWorkerLoop,
  type WorkerLoopOptions
} from "../../jobs/index.js"
import type {
  AgentRunOnceResult,
  SubmitAndRunUserTurnResult,
  SubmitUserTurnRequest,
  SubmitUserTurnResult,
  WanexAgentRuntimeOptions
} from "./types.js"

const DEFAULT_LEASE_MS = 60_000

export class WanexAgentRuntime {
  readonly runtime: WanexJobRuntime
  readonly storage: WanexRuntimeOptionsStorage
  readonly session: WanexJobRuntime["session"]
  readonly events: WanexJobRuntime["events"]
  readonly config: WanexJobRuntime["config"]

  private readonly defaultProviderProfileId: string | undefined
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
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
      kinds: ["session.turn"],
      ...(options.activeAbortRegistry === undefined
        ? {}
        : { activeAbortRegistry: options.activeAbortRegistry })
    })
    this.storage = options.storage
    this.session = this.runtime.session
    this.events = this.runtime.events
    this.config = this.runtime.config
    this.defaultProviderProfileId = options.providerProfileId
    this.directProvider = directProvider
    this.secretResolver = options.secretResolver
    this.contextCompiler =
      options.agentContext?.contextCompiler ?? options.contextCompiler
    this.timeoutMs = options.timeoutMs
    this.resolveAgentContext = options.resolveAgentContext
    this.recovery = options.recovery
    this.staticAgentContext = staticAgentContext(options)

    registerSessionTurnHandler({
      worker: this.runtime.worker,
      session: this.session,
      storage: options.storage,
      ...(directProvider === undefined ? {} : { directProvider }),
      ...(options.secretResolver === undefined
        ? {}
        : { secretResolver: options.secretResolver }),
      ...(this.staticAgentContext === undefined
        ? {}
        : { agentContext: this.staticAgentContext }),
      ...(options.resolveAgentContext === undefined
        ? {}
        : { resolveAgentContext: options.resolveAgentContext }),
      ...(options.toolMaxConcurrency === undefined
        ? {}
        : { toolMaxConcurrency: options.toolMaxConcurrency }),
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
      ...(options.observeProviderEvent === undefined
        ? {}
        : { observeProviderEvent: options.observeProviderEvent })
    })
  }

  async runEphemeralQuery(
    request: EphemeralQueryRequest
  ): Promise<EphemeralQueryResult> {
    const provider = await this.resolveEphemeralProvider(request.providerProfileId)
    return await runEphemeralSideQuery(
      {
        session: this.session,
        provider,
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
    const profile = await this.resolveAdmissionProfile(request.providerProfileId)
    const admitted = await admitUserMessage(this.storage, profile, request.content)
    const title = request.title ?? defaultTurnTitle(request.content)
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
        signal: new AbortController().signal
      })) ?? this.staticAgentContext
    const executionBinding = createTurnExecutionBinding({
      profile,
      resources: admitted.resources,
      ...(this.recovery === undefined ? {} : { recovery: this.recovery }),
      ...(agentContext === undefined ? {} : { agentContext })
    })
    const receipt = await this.session.submitTurn({
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
      ...(request.parentTurnId === undefined
        ? {}
        : { parentTurnId: request.parentTurnId }),
      ...(request.regeneratesTurnId === undefined
        ? {}
        : { regeneratesTurnId: request.regeneratesTurnId })
    })
    return { session, inputId, turnId: receipt.turn.id, receipt }
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

  private async resolveAdmissionProfile(
    providerProfileId: string | undefined
  ): Promise<ProviderProfile> {
    const profileId = providerProfileId ?? this.defaultProviderProfileId
    if (profileId !== undefined) {
      return await requireProviderProfile(this.storage, profileId)
    }
    if (this.directProvider !== undefined) {
      return directProviderProfile(this.directProvider)
    }
    throw new Error("session turn submission requires a provider profile")
  }

  private async resolveEphemeralProvider(
    providerProfileId: string | undefined
  ): Promise<ProviderAdapter> {
    const profileId = providerProfileId ?? this.defaultProviderProfileId
    if (profileId !== undefined) {
      return await resolveProviderProfile(
        this.storage,
        profileId,
        this.secretResolver
      )
    }
    if (this.directProvider !== undefined) {
      return this.directProvider
    }
    throw new Error("ephemeral query requires providerProfileId")
  }
}

type WanexRuntimeOptionsStorage = ConstructorParameters<
  typeof WanexJobRuntime
>[0]["storage"]

function staticAgentContext(
  options: WanexAgentRuntimeOptions
): PreparedAgentContext | undefined {
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
    return options.agentContext
  }
  if (
    options.contextCompiler === undefined &&
    options.tools === undefined &&
    options.toolPermissionPolicy === undefined
  ) {
    return undefined
  }
  return {
    ...(options.contextCompiler === undefined
      ? {}
      : { contextCompiler: options.contextCompiler }),
    ...(options.tools === undefined ? {} : { tools: options.tools }),
    ...(options.toolPermissionPolicy === undefined
      ? {}
      : { toolPermissionPolicy: options.toolPermissionPolicy })
  }
}

function directProviderProfile(provider: ProviderAdapter): ProviderProfile {
  return {
    id: `direct:${provider.providerId}:${provider.modelId}`,
    kind: provider.kind,
    providerId: provider.providerId,
    modelId: provider.modelId,
    capabilities: provider.capabilities
  }
}

function defaultTurnTitle(content: SubmitUserTurnRequest["content"]): string {
  return content.find((part) => part.type === "text")?.text ?? "Resource conversation"
}
