import { randomUUID } from "node:crypto"
import { runEphemeralSideQuery } from "../core/index.js"
import {
  registerProfileSessionRunHandler,
  registerSessionRunHandler
} from "../worker/index.js"
import type { ContextCompiler } from "../../context/memory/index.js"
import {
  FakeProviderAdapter,
  resolveProviderProfile,
  type ProviderAdapter
} from "../../provider/index.js"
import type {
  EphemeralQueryRequest,
  EphemeralQueryResult,
  MessagePart
} from "@wanex/protocol"
import {
  WanexJobRuntime,
  type RuntimeWorkerLoop,
  type WorkerLoopOptions
} from "../../jobs/index.js"
import type {
  AgentRunOnceResult,
  SubmitAndRunUserTextResult,
  SubmitUserTextRequest,
  SubmitUserTextResult,
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
  private readonly contextCompiler: ContextCompiler | undefined
  private readonly timeoutMs: number | undefined

  constructor(options: WanexAgentRuntimeOptions) {
    const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS
    const directProvider =
      options.provider ??
      (options.fakeResponseText === undefined
        ? undefined
        : new FakeProviderAdapter({
            responseText: options.fakeResponseText
          }))
    this.runtime = new WanexJobRuntime({
      storage: options.storage,
      workerId: options.workerId ?? `agent_runtime_worker_${randomUUID()}`,
      leaseMs,
      ...(options.heartbeatIntervalMs === undefined
        ? {}
        : { heartbeatIntervalMs: options.heartbeatIntervalMs }),
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
      kinds: ["session.run"]
    })
    this.storage = options.storage
    this.session = this.runtime.session
    this.events = this.runtime.events
    this.config = this.runtime.config
    this.defaultProviderProfileId = options.providerProfileId
    this.directProvider = directProvider
    this.contextCompiler = options.contextCompiler
    this.timeoutMs = options.timeoutMs

    if (directProvider !== undefined) {
      registerSessionRunHandler({
        worker: this.runtime.worker,
        session: this.session,
        provider: directProvider,
        ...(options.tools === undefined ? {} : { tools: options.tools }),
        ...(options.toolPermissionPolicy === undefined
          ? {}
          : { toolPermissionPolicy: options.toolPermissionPolicy }),
        ...(options.toolRecoveryPolicy === undefined
          ? {}
          : { toolRecoveryPolicy: options.toolRecoveryPolicy }),
        ...(options.toolMaxConcurrency === undefined
          ? {}
          : { toolMaxConcurrency: options.toolMaxConcurrency }),
        ...(options.contextCompiler === undefined
          ? {}
          : { contextCompiler: options.contextCompiler }),
        runnerId: options.runnerId ?? `agent_runtime_runner_${randomUUID()}`,
        leaseMs,
        ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
        ...(options.observeProviderEvent === undefined
          ? {}
          : { observeProviderEvent: options.observeProviderEvent })
      })
      return
    }

    registerProfileSessionRunHandler({
      worker: this.runtime.worker,
      session: this.session,
      storage: options.storage,
      ...(options.tools === undefined ? {} : { tools: options.tools }),
      ...(options.toolPermissionPolicy === undefined
        ? {}
        : { toolPermissionPolicy: options.toolPermissionPolicy }),
      ...(options.toolRecoveryPolicy === undefined
        ? {}
        : { toolRecoveryPolicy: options.toolRecoveryPolicy }),
      ...(options.toolMaxConcurrency === undefined
        ? {}
        : { toolMaxConcurrency: options.toolMaxConcurrency }),
      ...(options.contextCompiler === undefined
        ? {}
        : { contextCompiler: options.contextCompiler }),
      ...(options.providerProfileId === undefined
        ? {}
        : { providerProfileId: options.providerProfileId }),
      runnerId: options.runnerId ?? `agent_runtime_runner_${randomUUID()}`,
      leaseMs,
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

  async submitUserText(
    request: SubmitUserTextRequest
  ): Promise<SubmitUserTextResult> {
    if (request.text.length === 0) {
      throw new Error("agent runtime text must not be empty")
    }

    const session =
      request.sessionId === undefined
        ? await this.session.create({
            id: `ses_${randomUUID()}`,
            title: request.title ?? request.text,
            kind: "agent"
          })
        : ((await this.session.get(request.sessionId)) ??
          (await this.session.create({
            id: request.sessionId,
            title: request.title ?? request.text,
            kind: "agent"
          })))

    const inputId = request.inputId ?? `inp_${randomUUID()}`
    const providerProfileId =
      request.providerProfileId ?? this.defaultProviderProfileId
    const receipt = await this.session.submitRun({
      id: inputId,
      sessionId: session.id,
      principalId: request.principalId ?? "agent-runtime-user",
      idempotencyKey:
        request.idempotencyKey ?? `agent-runtime:${session.id}:${inputId}`,
      content: [textPart("user_text", request.text)],
      ...(request.jobId === undefined ? {} : { jobId: request.jobId }),
      ...(request.jobIdempotencyKey === undefined
        ? {}
        : { jobIdempotencyKey: request.jobIdempotencyKey }),
      ...(request.budgetGrantId === undefined
        ? {}
        : { budgetGrantId: request.budgetGrantId }),
      ...(request.mode === undefined ? {} : { mode: request.mode }),
      ...(request.maxSteps === undefined ? {} : { maxSteps: request.maxSteps }),
      ...(providerProfileId === undefined ? {} : { providerProfileId })
    })

    return {
      session,
      inputId,
      receipt
    }
  }

  async runOnce(): Promise<AgentRunOnceResult> {
    const worker = await this.runtime.runWorkerOnce()
    if (worker.status === "idle" || worker.job === null) {
      return { worker }
    }
    return {
      worker,
      job: worker.job
    }
  }

  start(options: WorkerLoopOptions = {}): RuntimeWorkerLoop {
    return this.runtime.startWorkerLoop(options)
  }

  async submitAndRunUserText(
    request: SubmitUserTextRequest
  ): Promise<SubmitAndRunUserTextResult> {
    const submitted = await this.submitUserText(request)
    const run = await this.runOnce()
    const messages = await this.session.listMessages({
      sessionId: submitted.session.id
    })
    return {
      ...submitted,
      run,
      messages
    }
  }

  async stop(): Promise<void> {
    await this.runtime.stop()
  }

  private async resolveEphemeralProvider(
    providerProfileId: string | undefined
  ): Promise<ProviderAdapter> {
    const profileId = providerProfileId ?? this.defaultProviderProfileId
    if (profileId !== undefined) {
      return await resolveProviderProfile(this.storage, profileId)
    }
    if (this.directProvider !== undefined) {
      return this.directProvider
    }
    throw new Error("ephemeral query requires providerProfileId")
  }
}

type WanexRuntimeOptionsStorage = ConstructorParameters<typeof WanexJobRuntime>[0]["storage"]

function textPart(id: string, text: string): MessagePart {
  return {
    type: "text",
    id,
    text
  }
}
