import type { SessionTurnState } from "@wanex/protocol"
import type {
  RuntimeHostSessionTurnReference,
  RuntimeHostSessionTurnLifecycleSignal
} from "@wanex/runtime/host"
import type { CoreStore } from "@wanex/storage"
import type {
  CodingRuntimeTurnReference,
  CodingSettlementDiagnostics,
} from "../diagnostics/types.js"
import {
  notifyCodingHostTurnObserver,
  type CodingHostTurnObserver
} from "../events.js"

const TERMINAL_STATES = new Set<SessionTurnState>([
  "succeeded",
  "failed",
  "cancelled",
  "interrupted",
  "recovery_required"
])

interface PendingSettlement {
  readonly reference: RuntimeHostSessionTurnReference
  readonly resolve: (state: SessionTurnState) => void
  readonly reject: (error: unknown) => void
}

export class CodingTurnSettlementRegistry {
  readonly #storage: CoreStore
  readonly #observeTurn: CodingHostTurnObserver | undefined
  readonly #pending = new Map<string, PendingSettlement>()
  #lastEvent: CodingSettlementDiagnostics["lastEvent"] | undefined
  #lastReference: CodingRuntimeTurnReference | undefined
  #lastPhase: CodingSettlementDiagnostics["lastPhase"]

  constructor(storage: CoreStore, observeTurn?: CodingHostTurnObserver) {
    this.#storage = storage
    this.#observeTurn = observeTurn
  }

  wait(reference: RuntimeHostSessionTurnReference): {
    readonly promise: Promise<SessionTurnState>
    readonly release: () => void
  } {
    if (this.#pending.has(reference.jobId)) {
      throw new Error("coding Turn settlement waiter is already registered")
    }
    let pending!: PendingSettlement
    const promise = new Promise<SessionTurnState>((resolve, reject) => {
      pending = { reference, resolve, reject }
    })
    this.#pending.set(reference.jobId, pending)
    this.#lastEvent = "wait_registered"
    this.#lastReference = { ...reference }
    return {
      promise,
      release: () => {
        if (this.#pending.get(reference.jobId) === pending) {
          this.#pending.delete(reference.jobId)
          this.#lastEvent = "wait_released"
          this.#lastReference = { ...reference }
        }
      }
    }
  }

  observe = (signal: RuntimeHostSessionTurnLifecycleSignal): void => {
    this.#lastEvent = "signal_observed"
    this.#lastReference = { ...signal.reference }
    this.#lastPhase = signal.phase
    notifyCodingHostTurnObserver(this.#observeTurn, {
      kind: signal.phase === "suspended" ? "suspended" : "settled",
      reference: signal.reference
    })
    if (signal.phase === "suspended") return
    void this.refresh(signal.reference)
  }

  async refresh(reference: RuntimeHostSessionTurnReference): Promise<void> {
    const pending = this.#pending.get(reference.jobId)
    if (pending === undefined || !sameReference(pending.reference, reference)) return
    try {
      const turns = await this.#storage.listSessionTurns({
        sessionId: reference.sessionId
      })
      const turn = turns.find((candidate) =>
        candidate.id === reference.turnId &&
        candidate.primaryInputId === reference.inputId &&
        candidate.jobId === reference.jobId
      )
      if (turn !== undefined && TERMINAL_STATES.has(turn.state)) {
        this.#pending.delete(reference.jobId)
        this.#lastEvent = "canonical_terminal"
        this.#lastReference = { ...reference }
        pending.resolve(turn.state)
      }
    } catch (error) {
      this.#pending.delete(reference.jobId)
      this.#lastEvent = "refresh_failed"
      this.#lastReference = { ...reference }
      pending.reject(error)
    }
  }

  diagnostics(): CodingSettlementDiagnostics {
    return {
      pendingCount: this.#pending.size,
      pendingReferences: [...this.#pending.values()]
        .map(({ reference }) => ({ ...reference }))
        .sort((left, right) => left.jobId.localeCompare(right.jobId)),
      ...(this.#lastEvent === undefined ? {} : { lastEvent: this.#lastEvent }),
      ...(this.#lastReference === undefined
        ? {}
        : { lastReference: { ...this.#lastReference } }),
      ...(this.#lastPhase === undefined ? {} : { lastPhase: this.#lastPhase }),
    }
  }
}

function sameReference(
  left: RuntimeHostSessionTurnReference,
  right: RuntimeHostSessionTurnReference
): boolean {
  return left.sessionId === right.sessionId &&
    left.inputId === right.inputId &&
    left.turnId === right.turnId &&
    left.jobId === right.jobId
}
