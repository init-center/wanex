import type { WanexAgentRuntime } from "../execution/agent-runtime/index.js"
import type { WorkerLoop } from "../jobs/index.js"
import { RuntimeHostLoopHealthTracker } from "./loop-health.js"
import type { RuntimeHostMemoryWorker } from "./memory-compaction.js"
import type { RuntimeHostLoopHealth } from "./types.js"

type AgentHostLoop = ReturnType<WanexAgentRuntime["start"]>

export interface RuntimeHostLoopLifecycleOptions {
  readonly idleIntervalMs?: number
  readonly errorIntervalMs?: number
}

export class RuntimeHostLoopLifecycle {
  private readonly agentLoops: AgentHostLoop[] = []
  private readonly memoryLoops: WorkerLoop[] = []
  private readonly agentHealth: RuntimeHostLoopHealthTracker[] = []
  private readonly memoryHealth: RuntimeHostLoopHealthTracker[] = []

  constructor(private readonly options: RuntimeHostLoopLifecycleOptions) {}

  start(request: {
    readonly workers: readonly WanexAgentRuntime[]
    readonly memoryWorkers: readonly RuntimeHostMemoryWorker[]
    readonly startedAt: number
  }): void {
    this.agentLoops.length = 0
    this.memoryLoops.length = 0
    this.agentHealth.length = 0
    this.memoryHealth.length = 0
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
        onResult: (result) => health.recordResult(result.status),
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
  }

  snapshot(): RuntimeHostLoopHealth[] {
    return [...this.agentHealth, ...this.memoryHealth].map((tracker) =>
      tracker.snapshot()
    )
  }

  async stop(): Promise<void> {
    const loops = [...this.agentLoops, ...this.memoryLoops]
    for (const loop of loops) {
      loop.stop()
    }
    this.agentLoops.length = 0
    this.memoryLoops.length = 0
    await Promise.all(loops.map(async (loop) => await loop.waitForIdle()))
  }
}
