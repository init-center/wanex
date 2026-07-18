import type { ConnectorHostRun } from "./host.js"
import { backoffMs } from "./supervisor-backoff.js"
import { normalizeError } from "./supervisor-errors.js"
import { defaultSleep, waitForAbort } from "./supervisor-signal.js"
import type {
  ConnectorHostLike,
  ConnectorSupervisorOptions,
  ConnectorSupervisorState
} from "./supervisor-types.js"

export class ConnectorSupervisor {
  private readonly hostFactory: () => ConnectorHostLike
  private readonly maxFailures: number
  private readonly initialBackoffMs: number
  private readonly maxBackoffMs: number
  private readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>
  private readonly onStateChange: ((state: ConnectorSupervisorState) => void) | undefined
  private readonly runLoop:
    | ((run: ConnectorHostRun, signal: AbortSignal) => Promise<void> | void)
    | undefined
  private controller: AbortController | undefined
  private activeRun: ConnectorHostRun | undefined
  private stateValue: ConnectorSupervisorState = {
    status: "idle",
    attempts: 0
  }

  constructor(options: ConnectorSupervisorOptions) {
    if (options.maxFailures !== undefined && options.maxFailures <= 0) {
      throw new Error("connector supervisor maxFailures must be positive")
    }
    if (
      options.initialBackoffMs !== undefined &&
      options.initialBackoffMs < 0
    ) {
      throw new Error("connector supervisor initialBackoffMs must be non-negative")
    }
    if (options.maxBackoffMs !== undefined && options.maxBackoffMs < 0) {
      throw new Error("connector supervisor maxBackoffMs must be non-negative")
    }
    this.hostFactory = options.hostFactory
    this.maxFailures = options.maxFailures ?? 5
    this.initialBackoffMs = options.initialBackoffMs ?? 1_000
    this.maxBackoffMs = options.maxBackoffMs ?? 30_000
    if (this.maxBackoffMs < this.initialBackoffMs) {
      throw new Error(
        "connector supervisor maxBackoffMs must be greater than or equal to initialBackoffMs"
      )
    }
    this.sleep = options.sleep ?? defaultSleep
    this.onStateChange = options.onStateChange
    this.runLoop = options.runLoop
  }

  get state(): ConnectorSupervisorState {
    return this.stateValue
  }

  async runUntilStopped(): Promise<ConnectorSupervisorState> {
    if (this.controller !== undefined) {
      throw new Error("connector supervisor already running")
    }
    const controller = new AbortController()
    this.controller = controller
    let failures = 0

    try {
      while (!controller.signal.aborted) {
        this.setState({
          status: "starting",
          attempts: failures + 1
        })
        try {
          const run = await this.hostFactory().start()
          this.activeRun = run
          failures = 0
          this.setState({
            status: "running",
            attempts: 0,
            currentSessionId: run.session.id
          })
          const outcome = await this.waitForRunOutcome(run, controller.signal)
          if (outcome.kind !== "stopped") {
            await this.stopActiveRun()
          } else {
            this.activeRun = undefined
          }
          this.activeRun = undefined
          if (controller.signal.aborted) {
            break
          }
          failures += 1
          const failure =
            outcome.kind === "loop_failed"
              ? outcome.error
              : outcome.kind === "loop_completed"
                ? new Error("connector supervisor run loop completed unexpectedly")
                : new Error("connector host stopped unexpectedly")
          const shouldContinue = await this.backoffAfterFailure(
            failures,
            failure,
            controller.signal
          )
          if (!shouldContinue) {
            return this.stateValue
          }
        } catch (error) {
          this.activeRun = undefined
          if (controller.signal.aborted) {
            break
          }
          failures += 1
          const shouldContinue = await this.backoffAfterFailure(
            failures,
            normalizeError(error),
            controller.signal
          )
          if (!shouldContinue) {
            return this.stateValue
          }
        }
      }

      await this.stopActiveRun()
      this.setState({
        status: "stopped",
        attempts: failures
      })
      return this.stateValue
    } finally {
      this.controller = undefined
      this.activeRun = undefined
    }
  }

  async stop(): Promise<void> {
    const controller = this.controller
    if (controller === undefined) {
      this.setState({
        ...this.stateValue,
        status: "stopped"
      })
      return
    }
    controller.abort()
    await this.stopActiveRun()
  }

  private async backoffAfterFailure(
    failures: number,
    error: Error,
    signal: AbortSignal
  ): Promise<boolean> {
    if (failures >= this.maxFailures) {
      this.setState({
        status: "failed",
        attempts: failures,
        lastError: error
      })
      return false
    }
    const delayMs = backoffMs(failures, this.initialBackoffMs, this.maxBackoffMs)
    this.setState({
      status: "backing_off",
      attempts: failures,
      lastError: error
    })
    await this.sleep(delayMs, signal)
    return true
  }

  private async stopActiveRun(): Promise<void> {
    const run = this.activeRun
    if (run === undefined) {
      return
    }
    this.activeRun = undefined
    await run.stop()
  }

  private async waitForRunOutcome(
    run: ConnectorHostRun,
    supervisorSignal: AbortSignal
  ): Promise<RunOutcome> {
    if (this.runLoop === undefined) {
      await waitForAbort(run.signal, supervisorSignal)
      return { kind: "stopped" }
    }

    const loopController = new AbortController()
    const stopped = waitForAbort(run.signal, supervisorSignal).then(
      (): RunOutcome => ({ kind: "stopped" })
    )
    const loop = Promise.resolve()
      .then(() => this.runLoop?.(run, loopController.signal))
      .then(
        (): RunOutcome => ({ kind: "loop_completed" }),
        (error): RunOutcome => ({
          kind: "loop_failed",
          error: normalizeError(error)
        })
      )
    const outcome = await Promise.race([stopped, loop])
    loopController.abort()
    return outcome
  }

  private setState(state: ConnectorSupervisorState): void {
    this.stateValue = state
    this.onStateChange?.(state)
  }
}

type RunOutcome =
  | {
      readonly kind: "stopped"
    }
  | {
      readonly kind: "loop_completed"
    }
  | {
      readonly kind: "loop_failed"
      readonly error: Error
    }
