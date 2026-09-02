import { randomUUID } from "node:crypto"
import type {
  PreparedUserTurn,
  SubmitUserTurnRequest,
  SubmitUserTurnResult
} from "../execution/agent-runtime/index.js"
import type {
  DoctorReport,
  InterruptSessionTurnReceipt,
  InterruptSessionTurnRequest,
  ListJobsRequest,
  RequestSessionTurnCancelReceipt,
  RequestSessionTurnCancelRequest,
  RequestMediaGenerationCancelRequest,
  SchedulerJobRecord,
  SteerSessionTurnReceipt,
  SteerSessionTurnRequest,
  MediaGenerationOperationRecord
} from "@wanex/protocol"
import {
  createStorageHandle,
  type CoreStore,
  type StorageHandle
} from "@wanex/storage"
import {
  getRuntimeHostJobSummary,
  type RuntimeHostJobSummary
} from "./job-summary.js"
import { ActiveExecutionAbortRegistry } from "../jobs/active-abort.js"
import { RuntimeHostLoopLifecycle } from "./loop-lifecycle.js"
import {
  createRuntimeHostMemoryWorkers,
  normalizeMemoryCompactionOptions,
  runMemoryCompactionOnce,
  type RuntimeHostMemoryCompactionConfig,
  type RuntimeHostMemoryCompactionOptions,
  type RuntimeHostMemoryRunOnceResult,
  type RuntimeHostMemoryWorker
} from "./memory-compaction.js"
import type {
  RuntimeHostEphemeralQueryRequest,
  RuntimeHostEphemeralQueryResult,
  RuntimeHostHealthSnapshot,
  RuntimeHostHealthSnapshotRequest,
  RuntimeHostJobSummaryRequest,
  RuntimeHostRunOnceResult,
  RuntimeHostSessionTurnResultObserver,
  RuntimeHostStatus,
  RuntimeHostMediaGenerationRequest,
  RuntimeHostSubmitMediaGenerationResult,
  RuntimeHostPrepareExecutionBindingRequest,
  RuntimeHostPreparedExecutionBinding,
  WanexRuntimeHostOptions
} from "./types.js"
import {
  createRuntimeHostAgentWorkers,
  createRuntimeHostMediaGenerationWorkers
} from "./worker-factory.js"
import { observeRuntimeHostSessionTurnResult } from "./session-turn-result.js"
import { TurnControlEventObserver } from "../execution/worker/turn-control-observer.js"

export type {
  RuntimeHostMemoryCompactionOptions,
  RuntimeHostMemoryRunOnceResult
} from "./memory-compaction.js"
export * from "./job-summary.js"
export type * from "./types.js"

export const WANEX_RUNTIME_HOST = "wanex-runtime-host" as const

export class WanexRuntimeHost {
  readonly storage: CoreStore
  readonly #activeAbortRegistry: ActiveExecutionAbortRegistry
  readonly #turnControlObserver: TurnControlEventObserver

  private readonly workers: ReturnType<typeof createRuntimeHostAgentWorkers>
  private readonly mediaGenerationWorkers: ReturnType<
    typeof createRuntimeHostMediaGenerationWorkers
  >
  private readonly memoryWorkers: RuntimeHostMemoryWorker[]
  private readonly loopLifecycle: RuntimeHostLoopLifecycle
  private readonly memoryCompaction: RuntimeHostMemoryCompactionConfig | undefined
  private readonly storageHandle: StorageHandle | undefined
  private readonly observeSessionTurnResult: RuntimeHostSessionTurnResultObserver | undefined
  private started = false
  private disposed = false
  private stopPromise: Promise<void> | undefined
  private disposePromise: Promise<void> | undefined

  constructor(options: WanexRuntimeHostOptions) {
    if (options.storage !== undefined) {
      this.storage = options.storage
      this.storageHandle = undefined
    } else {
      this.storageHandle = createStorageHandle(options.storageConfig)
      this.storage = this.storageHandle.core
    }
    this.observeSessionTurnResult = options.observeSessionTurnResult
    this.loopLifecycle = new RuntimeHostLoopLifecycle({
      ...(options.idleIntervalMs === undefined
        ? {}
        : { idleIntervalMs: options.idleIntervalMs }),
      ...(options.errorIntervalMs === undefined
        ? {}
        : { errorIntervalMs: options.errorIntervalMs }),
      onAgentResult: (result) =>
        observeRuntimeHostSessionTurnResult(
          result,
          this.observeSessionTurnResult
        )
    })
    this.memoryCompaction = normalizeMemoryCompactionOptions(
      options.memoryCompaction
    )
    this.#activeAbortRegistry = new ActiveExecutionAbortRegistry()
    this.#turnControlObserver = new TurnControlEventObserver({ storage: this.storage })
    this.workers = createRuntimeHostAgentWorkers({
      storage: this.storage,
      activeAbortRegistry: this.#activeAbortRegistry,
      turnControlObserver: this.#turnControlObserver,
      ...(options.workerCount === undefined
        ? {}
        : { workerCount: options.workerCount }),
      ...(options.modelEndpointId === undefined
        ? {}
        : { modelEndpointId: options.modelEndpointId }),
      ...(options.secretResolver === undefined
        ? {}
        : { secretResolver: options.secretResolver }),
      ...(options.provider === undefined ? {} : { provider: options.provider }),
      ...(options.tools === undefined ? {} : { tools: options.tools }),
      ...(options.toolPermissionPolicy === undefined
        ? {}
        : { toolPermissionPolicy: options.toolPermissionPolicy }),
      ...(options.recovery === undefined
        ? {}
        : { recovery: options.recovery }),
      ...(options.toolMaxConcurrency === undefined
        ? {}
        : { toolMaxConcurrency: options.toolMaxConcurrency }),
      ...(options.contextCompiler === undefined
        ? {}
        : { contextCompiler: options.contextCompiler }),
      ...(options.agentContext === undefined
        ? {}
        : { agentContext: options.agentContext }),
      ...(options.fakeResponseText === undefined
        ? {}
        : { fakeResponseText: options.fakeResponseText }),
      ...(options.leaseMs === undefined ? {} : { leaseMs: options.leaseMs }),
      ...(options.heartbeatIntervalMs === undefined
        ? {}
        : { heartbeatIntervalMs: options.heartbeatIntervalMs }),
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
      ...(options.observeProviderEvent === undefined
        ? {}
        : { observeProviderEvent: options.observeProviderEvent }),
      ...(options.observeExecutionStage === undefined
        ? {}
        : { observeExecutionStage: options.observeExecutionStage }),
      ...(options.resolveAgentContext === undefined
        ? {}
        : { resolveAgentContext: options.resolveAgentContext })
    })
    this.mediaGenerationWorkers = createRuntimeHostMediaGenerationWorkers({
      storage: this.storage,
      activeAbortRegistry: this.#activeAbortRegistry,
      ...(options.mediaGenerationAdapters === undefined
        ? {}
        : { mediaGenerationAdapters: options.mediaGenerationAdapters }),
      ...(options.mediaGenerationWorkerCount === undefined
        ? {}
        : { mediaGenerationWorkerCount: options.mediaGenerationWorkerCount }),
      ...(options.mediaGenerationMaxOutputBytes === undefined
        ? {}
        : { mediaGenerationMaxOutputBytes: options.mediaGenerationMaxOutputBytes }),
      ...(options.mediaGenerationPollInitialDelayMs === undefined
        ? {}
        : {
            mediaGenerationPollInitialDelayMs:
              options.mediaGenerationPollInitialDelayMs
          }),
      ...(options.mediaGenerationPollMaxDelayMs === undefined
        ? {}
        : {
            mediaGenerationPollMaxDelayMs:
              options.mediaGenerationPollMaxDelayMs
          }),
      ...(options.mediaGenerationMaxConsecutivePollFailures === undefined
        ? {}
        : {
            mediaGenerationMaxConsecutivePollFailures:
              options.mediaGenerationMaxConsecutivePollFailures
          }),
      ...(options.leaseMs === undefined ? {} : { leaseMs: options.leaseMs }),
      ...(options.heartbeatIntervalMs === undefined
        ? {}
        : { heartbeatIntervalMs: options.heartbeatIntervalMs }),
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs })
    })
    this.memoryWorkers = createRuntimeHostMemoryWorkers({
      storage: this.storage,
      config: this.memoryCompaction,
      ...(options.leaseMs === undefined ? {} : { leaseMs: options.leaseMs }),
      ...(options.heartbeatIntervalMs === undefined
        ? {}
        : { heartbeatIntervalMs: options.heartbeatIntervalMs }),
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
      ...(options.provider === undefined
        ? {}
        : { directProvider: options.provider }),
      ...(options.secretResolver === undefined
        ? {}
        : { secretResolver: options.secretResolver }),
      createWorkerId: (index) =>
        `runtime_host_memory_worker_${index}_${randomUUID()}`
    })
  }

  status(): RuntimeHostStatus {
    return {
      started: this.started,
      workerCount: this.workers.length,
      memoryWorkerCount: this.memoryWorkers.length,
      mediaGenerationWorkerCount: this.mediaGenerationWorkers.length
    }
  }

  getHealthSnapshot(
    request: RuntimeHostHealthSnapshotRequest = {}
  ): RuntimeHostHealthSnapshot {
    const loops = this.loopLifecycle.snapshot()
    return {
      generatedAt: request.now ?? Date.now(),
      started: this.started,
      workerCount: this.workers.length,
      memoryWorkerCount: this.memoryWorkers.length,
      mediaGenerationWorkerCount: this.mediaGenerationWorkers.length,
      loopCount: loops.length,
      activeLoopCount: loops.filter((loop) => !loop.stopped).length,
      stoppedLoopCount: loops.filter((loop) => loop.stopped).length,
      activeExecutionCount: this.#activeAbortRegistry.size,
      loops
    }
  }

  async submitUserTurn(
    request: SubmitUserTurnRequest
  ): Promise<SubmitUserTurnResult> {
    const submitted = await this.workers[0]!.submitUserTurn(request)
    this.wake()
    return submitted
  }

  async prepareUserTurn(
    request: SubmitUserTurnRequest
  ): Promise<PreparedUserTurn> {
    return await this.workers[0]!.prepareUserTurn(request)
  }

  async requestSessionTurnCancel(
    request: RequestSessionTurnCancelRequest
  ): Promise<RequestSessionTurnCancelReceipt> {
    const receipt = await this.storage.requestSessionTurnCancel(request)
    if (receipt.status === "cancel_requested") {
      this.#activeAbortRegistry.abort(
        { jobId: request.jobId },
        { kind: "cancel", message: request.reason }
      )
      for (const jobId of receipt.cascadeJobIds) {
        this.#activeAbortRegistry.abort(
          { jobId },
          { kind: "cancel", message: request.reason }
        )
      }
      this.wake()
    }
    return receipt
  }

  async interruptSessionTurn(
    request: InterruptSessionTurnRequest
  ): Promise<InterruptSessionTurnReceipt> {
    const receipt = await this.storage.interruptSessionTurn(request)
    if (receipt.status === "interrupt_requested") {
      this.#activeAbortRegistry.abortAttempt(request.attemptId, {
        kind: "interrupt",
        message: request.reason
      })
    }
    return receipt
  }

  async steerSessionTurn(
    request: SteerSessionTurnRequest
  ): Promise<SteerSessionTurnReceipt> {
    return await this.storage.steerSessionTurn(request)
  }

  async runEphemeralQuery(
    request: RuntimeHostEphemeralQueryRequest
  ): Promise<RuntimeHostEphemeralQueryResult> {
    return await this.workers[0]!.runEphemeralQuery(request)
  }

  async submitMediaGeneration(
    request: RuntimeHostMediaGenerationRequest
  ): Promise<RuntimeHostSubmitMediaGenerationResult> {
    const worker = this.requireMediaGenerationWorker()
    const submitted = await worker.submit(request)
    this.wake()
    return submitted
  }

  async prepareExecutionBinding(
    request: RuntimeHostPrepareExecutionBindingRequest
  ): Promise<RuntimeHostPreparedExecutionBinding> {
    return await this.workers[0]!.prepareExecutionBinding(request)
  }

  async getMediaGenerationOperation(
    operationId: string
  ): Promise<MediaGenerationOperationRecord | null> {
    return await this.storage.getMediaGenerationOperation({ operationId })
  }

  async requestMediaGenerationCancel(
    request: RequestMediaGenerationCancelRequest
  ): Promise<MediaGenerationOperationRecord | null> {
    const worker = this.mediaGenerationWorkers[0]
    if (worker !== undefined) {
      return await worker.cancel(request.operationId, request.reason)
    }
    const operation = await this.storage.requestMediaGenerationCancel(request)
    if (operation?.state === "cancel_requested") {
      this.#activeAbortRegistry.abort(
        { jobId: operation.jobId },
        { kind: "cancel", message: request.reason }
      )
    }
    return operation
  }

  start(): void {
    if (this.disposed) {
      throw new Error("runtime host is disposed")
    }
    if (this.stopPromise !== undefined) {
      throw new Error("runtime host is stopping")
    }
    if (this.started) {
      return
    }
    this.started = true
    this.loopLifecycle.start({
      workers: this.workers,
      memoryWorkers: this.memoryWorkers,
      mediaGenerationWorkers: this.mediaGenerationWorkers,
      startedAt: Date.now()
    })
  }

  wake(): void {
    if (!this.started || this.disposed) {
      return
    }
    this.loopLifecycle.wake()
  }

  async runOnce(): Promise<RuntimeHostRunOnceResult> {
    const results = await Promise.all(
      this.workers.map(async (worker) => await worker.runOnce())
    )
    for (const result of results) {
      observeRuntimeHostSessionTurnResult(
        result.worker,
        this.observeSessionTurnResult
      )
    }
    const mediaGeneration = await Promise.all(
      this.mediaGenerationWorkers.map(async (worker) => await worker.runOnce())
    )
    const memory = await runMemoryCompactionOnce({
      storage: this.storage,
      config: this.memoryCompaction,
      workers: this.memoryWorkers,
      agentResults: results
    })
    return {
      results,
      ...(mediaGeneration.length === 0 ? {} : { mediaGeneration }),
      ...(memory === undefined ? {} : { memory })
    }
  }

  async doctor(): Promise<DoctorReport> {
    return await this.storage.doctor()
  }

  async listJobs(request: ListJobsRequest): Promise<SchedulerJobRecord[]> {
    return await this.storage.listJobs(request)
  }

  async getJobSummary(
    request: RuntimeHostJobSummaryRequest = {}
  ): Promise<RuntimeHostJobSummary> {
    return await getRuntimeHostJobSummary({
      storage: this.storage,
      status: this.status(),
      ...(request.now === undefined ? {} : { now: request.now }),
      ...(request.jobLimit === undefined ? {} : { jobLimit: request.jobLimit })
    })
  }

  private requireMediaGenerationWorker() {
    const worker = this.mediaGenerationWorkers[0]
    if (worker === undefined) {
      throw new Error("runtime host has no media generation adapters")
    }
    return worker
  }

  async stop(): Promise<void> {
    if (this.stopPromise !== undefined) {
      return await this.stopPromise
    }
    this.started = false
    this.#activeAbortRegistry.abortAll({
      kind: "host_shutdown",
      message: "runtime host is stopping"
    })
    const stopping = this.loopLifecycle.stop()
    this.stopPromise = stopping
    try {
      await stopping
    } finally {
      if (this.stopPromise === stopping) {
        this.stopPromise = undefined
      }
    }
  }

  async dispose(): Promise<void> {
    if (this.disposePromise !== undefined) {
      return await this.disposePromise
    }
    this.disposed = true
    const disposing = this.disposeOwnedResources()
    this.disposePromise = disposing
    return await disposing
  }

  private async disposeOwnedResources(): Promise<void> {
    await this.stop()
    try {
      await this.#turnControlObserver.close()
    } finally {
      await this.storageHandle?.dispose()
    }
  }
}
