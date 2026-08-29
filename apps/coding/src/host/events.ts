import type { ProviderRunEvent } from "@wanex/runtime/provider"

export type CodingHostTurnSignalKind =
  | "submitted"
  | "progress"
  | "suspended"
  | "settled"
  | "cancel_requested"
  | "approval_resolved"

export interface CodingHostTurnReference {
  readonly sessionId: string
  readonly inputId: string
  readonly turnId: string
  readonly jobId: string
}

export type CodingHostTurnSignal = {
  readonly kind: CodingHostTurnSignalKind
  readonly reference: CodingHostTurnReference
} | {
  readonly kind: "provider_event"
  readonly reference: CodingHostTurnReference
  readonly event: ProviderRunEvent
}

export type CodingHostTurnObserver = (signal: CodingHostTurnSignal) => void

export function notifyCodingHostTurnObserver(
  observer: CodingHostTurnObserver | undefined,
  signal: CodingHostTurnSignal
): void {
  try {
    observer?.(signal)
  } catch {
    // Advisory observers cannot affect durable Runtime or Workspace settlement.
  }
}
