import type { SessionTurnState } from "@wanex/protocol"
import type {
  RuntimeHostSessionTurnReference,
  RuntimeHostSessionTurnResultSignal
} from "@wanex/runtime/host"
import type { CoreStore } from "@wanex/storage"
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
    return {
      promise,
      release: () => {
        if (this.#pending.get(reference.jobId) === pending) {
          this.#pending.delete(reference.jobId)
        }
      }
    }
  }

  observe = (signal: RuntimeHostSessionTurnResultSignal): void => {
    notifyCodingHostTurnObserver(this.#observeTurn, {
      kind: signal.outcome === "suspended" ? "suspended" : "settled",
      reference: signal.reference
    })
    if (signal.outcome === "suspended") return
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
        pending.resolve(turn.state)
      }
    } catch (error) {
      this.#pending.delete(reference.jobId)
      pending.reject(error)
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
