import type {
  JsonValue,
  SchedulerJobKind,
  SchedulerJobRecord
} from "@wanex/protocol"
import { isWorkerAcknowledgedResult } from "./acknowledged.js"
import {
  ActiveExecutionAbortRegistry,
  type ActiveAbortReason
} from "./active-abort.js"
import { HeartbeatLoop } from "./heartbeat.js"
import { withTimeout } from "./timeout.js"
import type {
  WanexWorkerOptions,
  WorkerHandler,
  WorkerLoop,
  WorkerLoopOptions,
  WorkerRunOnceResult
} from "./types.js"
import { startWorkerLoop } from "./worker-loop.js"
import { normalizeError, workerFailurePayload } from "./worker-error.js"

export class WanexWorker {
  private readonly session: WanexWorkerOptions["session"]
  private readonly workerId: string
  private readonly leaseMs: number
  private readonly heartbeatIntervalMs: number
  private readonly timeoutMs: number | undefined
  private readonly kinds: readonly SchedulerJobKind[] | undefined
  readonly #activeAbortRegistry: ActiveExecutionAbortRegistry
  private readonly handlers = new Map<SchedulerJobKind, WorkerHandler>()

  constructor(options: WanexWorkerOptions) {
    if (options.leaseMs <= 0) {
      throw new Error("worker leaseMs must be positive")
    }
    if (
      options.heartbeatIntervalMs !== undefined &&
      options.heartbeatIntervalMs <= 0
    ) {
      throw new Error("worker heartbeatIntervalMs must be positive")
    }
    if (options.timeoutMs !== undefined && options.timeoutMs <= 0) {
      throw new Error("worker timeoutMs must be positive")
    }
    this.session = options.session
    this.workerId = options.workerId
    this.leaseMs = options.leaseMs
    this.heartbeatIntervalMs =
      options.heartbeatIntervalMs ?? Math.max(1_000, Math.floor(options.leaseMs / 3))
    this.timeoutMs = options.timeoutMs
    this.kinds = options.kinds
    this.#activeAbortRegistry =
      options.activeAbortRegistry ?? new ActiveExecutionAbortRegistry()
  }

  register(kind: SchedulerJobKind, handler: WorkerHandler): void {
    if (this.handlers.has(kind)) {
      throw new Error(`worker handler already registered: ${kind}`)
    }
    this.handlers.set(kind, handler)
  }

  start(options: WorkerLoopOptions = {}): WorkerLoop {
    return startWorkerLoop(this, options)
  }

  async runOnce(): Promise<WorkerRunOnceResult> {
    const job = await this.session.claimJob({
      workerId: this.workerId,
      leaseMs: this.leaseMs,
      ...(this.kinds === undefined ? {} : { kinds: this.kinds })
    })
    if (job === null) {
      return { status: "idle" }
    }

    const handler = this.handlers.get(job.kind)
    if (handler === undefined) {
      const error = new Error(`no worker handler registered for job kind: ${job.kind}`)
      const failed = await this.fail(job, error)
      return { status: "failed", job: failed, error }
    }

    const controller = new AbortController()
    const registration = this.#activeAbortRegistry.register({ jobId: job.id }, controller)
    const heartbeat = new HeartbeatLoop(async () => {
      const updated = await this.session.heartbeatJob({
        jobId: job.id,
        workerId: this.workerId,
        leaseToken: requireLeaseToken(job),
        leaseMs: this.leaseMs
      })
      if (updated === null) {
        controller.abort(
          abortReason("lease_lost", "worker lost lease for job: " + job.id)
        )
        throw new Error(`worker lost lease for job: ${job.id}`)
      }
    }, this.heartbeatIntervalMs, (error) => {
      if (!controller.signal.aborted) {
        controller.abort(
          abortReason(
            "lease_lost",
            `worker heartbeat failed for job ${job.id}: ${normalizeError(error).message}`
          )
        )
      }
    })

    try {
      heartbeat.start()
      const result = await withTimeout(
        Promise.resolve(
          handler({
            job,
            signal: controller.signal,
            registerActiveAttempt: (attemptId) => {
              registration.bindAttempt(attemptId)
              return registration
            },
            heartbeat: async () => {
              try {
                await heartbeat.beat()
              } catch (error) {
                if (!controller.signal.aborted) {
                  controller.abort(
                    abortReason(
                      "lease_lost",
                      `worker heartbeat failed for job ${job.id}: ${normalizeError(error).message}`
                    )
                  )
                }
                throw error
              }
            }
          })
        ),
        this.timeoutMs,
        `worker job ${job.id}`,
        () => {
          controller.abort(
            abortReason("timeout", "worker timed out for job: " + job.id)
          )
        }
      )
      await heartbeat.stop()
      if (isWorkerAcknowledgedResult(result)) {
        if (result.error !== undefined) {
          return { status: "failed", job: result.job, error: result.error }
        }
        return { status: "completed", job: result.job }
      }
      const completed = await this.session.completeJob({
        jobId: job.id,
        workerId: this.workerId,
        leaseToken: requireLeaseToken(job),
        ...(result === undefined ? {} : { result: result as JsonValue })
      })
      if (completed === null) {
        const error = new Error(`worker could not complete job: ${job.id}`)
        return { status: "failed", job: null, error }
      }
      return { status: "completed", job: completed }
    } catch (error) {
      await heartbeat.stop()
      const normalized = normalizeError(error)
      const failed = await this.fail(job, normalized)
      return { status: "failed", job: failed, error: normalized }
    } finally {
      await heartbeat.stop()
      registration.unregister()
    }
  }

  private async fail(
    job: SchedulerJobRecord,
    error: Error
  ): Promise<SchedulerJobRecord | null> {
    return await this.session.failJob({
      jobId: job.id,
      workerId: this.workerId,
      leaseToken: requireLeaseToken(job),
      error: workerFailurePayload(error)
    })
  }
}

function abortReason(
  kind: ActiveAbortReason["kind"],
  message: string
): ActiveAbortReason {
  return { kind, message }
}

function requireLeaseToken(job: SchedulerJobRecord): string {
  if (job.leaseToken === undefined) {
    throw new Error(`claimed job is missing lease token: ${job.id}`)
  }
  return job.leaseToken
}
