import type { SchedulerJobId } from "@wanex/protocol"

export type ActiveAbortKind =
  | "cancel"
  | "interrupt"
  | "lease_lost"
  | "timeout"
  | "host_shutdown"

export interface ActiveAbortReason {
  readonly kind: ActiveAbortKind
  readonly message: string
}

export function readActiveAbortReason(
  signal: { readonly aborted: boolean } | undefined
): ActiveAbortReason | undefined {
  if (signal?.aborted !== true) return undefined
  const reason = (signal as { readonly reason?: unknown }).reason
  if (reason === null || typeof reason !== "object") return undefined
  const candidate = reason as {
    readonly kind?: unknown
    readonly message?: unknown
  }
  if (
    typeof candidate.message !== "string" ||
    !isActiveAbortKind(candidate.kind)
  ) {
    return undefined
  }
  return { kind: candidate.kind, message: candidate.message }
}

export interface ActiveExecutionIdentity {
  readonly jobId: SchedulerJobId
  readonly attemptId?: string
}

export interface ActiveExecutionRegistration {
  bindAttempt(attemptId: string): void
  abort(reason: ActiveAbortReason): boolean
  unregister(): void
}

interface ActiveExecutionEntry {
  readonly jobId: SchedulerJobId
  readonly controller: AbortController
  attemptId: string | undefined
}

export class ActiveExecutionAbortRegistry {
  readonly #entries = new Map<SchedulerJobId, ActiveExecutionEntry>()
  readonly #attempts = new Map<string, ActiveExecutionEntry>()

  register(
    identity: ActiveExecutionIdentity,
    controller: AbortController
  ): ActiveExecutionRegistration {
    if (this.#entries.has(identity.jobId)) {
      throw new Error("active execution already registered: " + identity.jobId)
    }
    const entry: ActiveExecutionEntry = {
      jobId: identity.jobId,
      controller,
      attemptId: identity.attemptId
    }
    this.#entries.set(identity.jobId, entry)
    if (identity.attemptId !== undefined) {
      this.#attempts.set(identity.attemptId, entry)
    }
    let registered = true
    return {
      bindAttempt: (attemptId) => {
        if (!registered) {
          throw new Error("active execution registration is closed: " + identity.jobId)
        }
        if (entry.attemptId !== undefined && entry.attemptId !== attemptId) {
          throw new Error("active execution attempt is already bound: " + identity.jobId)
        }
        entry.attemptId = attemptId
        this.#attempts.set(attemptId, entry)
      },
      abort: (reason) => {
        if (!registered || entry.controller.signal.aborted) return false
        entry.controller.abort(reason)
        return true
      },
      unregister: () => {
        if (!registered) return
        registered = false
        if (
          entry.attemptId !== undefined &&
          this.#attempts.get(entry.attemptId) === entry
        ) {
          this.#attempts.delete(entry.attemptId)
        }
        if (this.#entries.get(identity.jobId) === entry) {
          this.#entries.delete(identity.jobId)
        }
      }
    }
  }

  abort(
    identity: ActiveExecutionIdentity,
    reason: ActiveAbortReason
  ): boolean {
    const entry = this.#entries.get(identity.jobId)
    if (entry === undefined) return false
    if (
      identity.attemptId !== undefined &&
      entry.attemptId !== identity.attemptId
    ) {
      return false
    }
    if (entry.controller.signal.aborted) return false
    entry.controller.abort(reason)
    return true
  }

  abortAttempt(attemptId: string, reason: ActiveAbortReason): boolean {
    const entry = this.#attempts.get(attemptId)
    if (entry === undefined || entry.controller.signal.aborted) return false
    entry.controller.abort(reason)
    return true
  }

  abortAll(reason: ActiveAbortReason): number {
    let count = 0
    for (const entry of this.#entries.values()) {
      if (!entry.controller.signal.aborted) {
        entry.controller.abort(reason)
        count += 1
      }
    }
    return count
  }

  get size(): number {
    return this.#entries.size
  }
}

function isActiveAbortKind(value: unknown): value is ActiveAbortKind {
  return (
    value === "cancel" ||
    value === "interrupt" ||
    value === "lease_lost" ||
    value === "timeout" ||
    value === "host_shutdown"
  )
}
