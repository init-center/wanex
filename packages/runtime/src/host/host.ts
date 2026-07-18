import { randomUUID } from "node:crypto"
import type {
  SubmitUserTextRequest,
  SubmitUserTextResult
} from "../execution/agent-runtime/index.js"
import type {
  DoctorReport,
  ListJobsRequest,
  SchedulerJobRecord
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
  RuntimeHostStatus,
  WanexRuntimeHostOptions
} from "./types.js"
import { createRuntimeHostAgentWorkers } from "./worker-factory.js"

export type {
  RuntimeHostMemoryCompactionOptions,
  RuntimeHostMemoryRunOnceResult
} from "./memory-compaction.js"
export * from "./job-summary.js"
export type * from "./types.js"

export const WANEX_RUNTIME_HOST = "wanex-runtime-host" as const

export class WanexRuntimeHost {
  readonly storage: CoreStore

  private readonly workers: ReturnType<typeof createRuntimeHostAgentWorkers>
  private readonly memoryWorkers: RuntimeHostMemoryWorker[]
  private readonly loopLifecycle: RuntimeHostLoopLifecycle
  private readonly memoryCompaction: RuntimeHostMemoryCompactionConfig | undefined
  private readonly storageHandle: StorageHandle | undefined
  private started = false
  private disposed = false

  constructor(options: WanexRuntimeHostOptions) {
    if (options.storage !== undefined) {
      this.storage = options.storage
      this.storageHandle = undefined
    } else {
      this.storageHandle = createStorageHandle(options.storageConfig)
      this.storage = this.storageHandle.core
    }
    this.loopLifecycle = new RuntimeHostLoopLifecycle({
      ...(options.idleIntervalMs === undefined
        ? {}
        : { idleIntervalMs: options.idleIntervalMs }),
      ...(options.errorIntervalMs === undefined
        ? {}
        : { errorIntervalMs: options.errorIntervalMs })
    })
    this.memoryCompaction = normalizeMemoryCompactionOptions(
      options.memoryCompaction
    )
    this.workers = createRuntimeHostAgentWorkers({
      storage: this.storage,
      ...(options.workerCount === undefined
        ? {}
        : { workerCount: options.workerCount }),
      ...(options.providerProfileId === undefined
        ? {}
        : { providerProfileId: options.providerProfileId }),
      ...(options.provider === undefined ? {} : { provider: options.provider }),
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
        : { observeProviderEvent: options.observeProviderEvent })
    })
    this.memoryWorkers = createRuntimeHostMemoryWorkers({
      storage: this.storage,
      config: this.memoryCompaction,
      ...(options.leaseMs === undefined ? {} : { leaseMs: options.leaseMs }),
      ...(options.heartbeatIntervalMs === undefined
        ? {}
        : { heartbeatIntervalMs: options.heartbeatIntervalMs }),
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
      createWorkerId: (index) =>
        `runtime_host_memory_worker_${index}_${randomUUID()}`
    })
  }

  status(): RuntimeHostStatus {
    return {
      started: this.started,
      workerCount: this.workers.length,
      memoryWorkerCount: this.memoryWorkers.length
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
      loopCount: loops.length,
      activeLoopCount: loops.filter((loop) => !loop.stopped).length,
      stoppedLoopCount: loops.filter((loop) => loop.stopped).length,
      loops
    }
  }

  async submitUserText(
    request: SubmitUserTextRequest
  ): Promise<SubmitUserTextResult> {
    return await this.workers[0]!.submitUserText(request)
  }

  async runEphemeralQuery(
    request: RuntimeHostEphemeralQueryRequest
  ): Promise<RuntimeHostEphemeralQueryResult> {
    return await this.workers[0]!.runEphemeralQuery(request)
  }

  start(): void {
    if (this.disposed) {
      throw new Error("runtime host is disposed")
    }
    if (this.started) {
      return
    }
    this.started = true
    this.loopLifecycle.start({
      workers: this.workers,
      memoryWorkers: this.memoryWorkers,
      startedAt: Date.now()
    })
  }

  async runOnce(): Promise<RuntimeHostRunOnceResult> {
    const results = await Promise.all(
      this.workers.map(async (worker) => await worker.runOnce())
    )
    const memory = await runMemoryCompactionOnce({
      storage: this.storage,
      config: this.memoryCompaction,
      workers: this.memoryWorkers,
      agentResults: results
    })
    return {
      results,
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

  async stop(): Promise<void> {
    this.started = false
    await this.loopLifecycle.stop()
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return
    }
    this.disposed = true
    await this.stop()
    await this.storageHandle?.dispose()
  }
}
