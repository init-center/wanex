import type {
  JsonValue,
  SchedulerJobKind,
  SchedulerJobRecord
} from "@wanex/protocol"
import type { WanexSessionCore } from "../sessions/index.js"

export interface WanexWorkerOptions {
  readonly session: WanexSessionCore
  readonly workerId: string
  readonly leaseMs: number
  readonly heartbeatIntervalMs?: number
  readonly timeoutMs?: number
  readonly kinds?: readonly SchedulerJobKind[]
}

export interface WorkerHandlerContext {
  readonly job: SchedulerJobRecord
  readonly signal: AbortSignal
  heartbeat(): Promise<void>
}

export type WorkerHandlerResult = JsonValue | void

export interface WorkerAcknowledgedResult {
  readonly acknowledged: true
  readonly job: SchedulerJobRecord
  readonly error?: Error
}

export type WorkerHandlerReturn = WorkerHandlerResult | WorkerAcknowledgedResult

export type WorkerHandler = (
  context: WorkerHandlerContext
) => Promise<WorkerHandlerReturn> | WorkerHandlerReturn

export type WorkerRunOnceResult =
  | {
      readonly status: "idle"
    }
  | {
      readonly status: "completed"
      readonly job: SchedulerJobRecord
    }
  | {
      readonly status: "failed"
      readonly job: SchedulerJobRecord | null
      readonly error: Error
    }

export interface WorkerLoopOptions {
  readonly idleIntervalMs?: number
  readonly errorIntervalMs?: number
  readonly signal?: AbortSignal
  readonly onResult?: (result: WorkerRunOnceResult) => void
  readonly onError?: (error: unknown) => void
}

export interface WorkerLoop {
  readonly stopped: boolean
  stop(): void
  waitForIdle(): Promise<void>
}
