import type { WanexAgentRuntime } from "../execution/agent-runtime/index.js"
import type { WorkerLoop, WorkerRunOnceResult } from "../jobs/index.js"
import { RuntimeHostLoopHealthTracker } from "./loop-health.js"
import type { RuntimeHostMemoryWorker } from "./memory-compaction.js"
import type { RuntimeHostLoopHealth } from "./types.js"
import type { WanexMediaGenerationRuntime } from "../media-generation/index.js"

type AgentHostLoop = ReturnType<WanexAgentRuntime["start"]>

export interface RuntimeHostLoopLifecycleOptions {
  readonly idleIntervalMs?: number
  readonly errorIntervalMs?: number
  readonly onAgentResult?: (result: WorkerRunOnceResult) => void
}

export class RuntimeHostLoopLifecycle {
  private readonly agentLoops: AgentHostLoop[] = []
  private readonly memoryLoops: WorkerLoop[] = []
  private readonly mediaGenerationLoops: WorkerLoop[] = []
  private readonly agentHealth: RuntimeHostLoopHealthTracker[] = []
  private readonly memoryHealth: RuntimeHostLoopHealthTracker[] = []
  private readonly mediaGenerationHealth: RuntimeHostLoopHealthTracker[] = []

  constructor(private readonly options: RuntimeHostLoopLifecycleOptions) {}

  start(request: {
    readonly workers: readonly WanexAgentRuntime[]
    readonly memoryWorkers: readonly RuntimeHostMemoryWorker[]
    readonly mediaGenerationWorkers: readonly WanexMediaGenerationRuntime[]
    readonly startedAt: number
  }): void {
    this.agentLoops.length = 0
    this.memoryLoops.length = 0
    this.mediaGenerationLoops.length = 0
    this.agentHealth.length = 0
    this.memoryHealth.length = 0
    this.mediaGenerationHealth.length = 0
    request.workers.forEach((worker, index) => {
      const health = new RuntimeHostLoopHealthTracker({
        kind: "agent",
        index,
        startedAt: request.startedAt
      })
      const loop = worker.start({
        ...(this.options.idleIntervalMs === undefined
          ? {}
          : { idleIntervalMs: this.options.idleIntervalMs }),
        ...(this.options.errorIntervalMs === undefined
          ? {}
          : { errorIntervalMs: this.options.errorIntervalMs }),
        onResult: (result) => {
          health.recordResult(result.status)
          this.options.onAgentResult?.(result)
        },
        onError: () => health.recordError()
      })
      health.attach(loop)
      this.agentHealth.push(health)
      this.agentLoops.push(loop)
    })
    request.memoryWorkers.forEach((worker, index) => {
      const health = new RuntimeHostLoopHealthTracker({
        kind: "memory",
        index,
        startedAt: request.startedAt
      })
      const loop = worker.start({
        ...(this.options.idleIntervalMs === undefined
          ? {}
          : { idleIntervalMs: this.options.idleIntervalMs }),
        ...(this.options.errorIntervalMs === undefined
          ? {}
          : { errorIntervalMs: this.options.errorIntervalMs }),
        onResult: (result) => health.recordResult(result.status),
        onError: () => health.recordError()
      })
      health.attach(loop)
      this.memoryHealth.push(health)
      this.memoryLoops.push(loop)
    })
    request.mediaGenerationWorkers.forEach((worker, index) => {
      const health = new RuntimeHostLoopHealthTracker({
        kind: "media_generation",
        index,
        startedAt: request.startedAt
      })
      const loop = worker.start({
        ...(this.options.idleIntervalMs === undefined
          ? {}
          : { idleIntervalMs: this.options.idleIntervalMs }),
        ...(this.options.errorIntervalMs === undefined
          ? {}
          : { errorIntervalMs: this.options.errorIntervalMs }),
        onResult: (result) => health.recordResult(result.status),
        onError: () => health.recordError()
      })
      health.attach(loop)
      this.mediaGenerationHealth.push(health)
      this.mediaGenerationLoops.push(loop)
    })
  }

  snapshot(): RuntimeHostLoopHealth[] {
    return [
      ...this.agentHealth,
      ...this.memoryHealth,
      ...this.mediaGenerationHealth
    ].map((tracker) => tracker.snapshot())
  }

  wake(): void {
    for (const loop of this.agentLoops) {
      loop.wake()
    }
    for (const loop of this.mediaGenerationLoops) {
      loop.wake()
    }
  }

  async stop(): Promise<void> {
    const loops = [
      ...this.agentLoops,
      ...this.memoryLoops,
      ...this.mediaGenerationLoops
    ]
    for (const loop of loops) {
      loop.stop()
    }
    await Promise.all(loops.map(async (loop) => await loop.waitForIdle()))
    this.agentLoops.length = 0
    this.memoryLoops.length = 0
    this.mediaGenerationLoops.length = 0
  }
}
