import type { ConnectorHostRun } from "./host.js"

export type ConnectorSupervisorStatus =
  | "idle"
  | "starting"
  | "running"
  | "backing_off"
  | "stopped"
  | "failed"

export interface ConnectorSupervisorState {
  readonly status: ConnectorSupervisorStatus
  readonly attempts: number
  readonly currentSessionId?: string
  readonly lastError?: Error
}

export interface ConnectorSupervisorOptions {
  readonly hostFactory: () => ConnectorHostLike
  readonly maxFailures?: number
  readonly initialBackoffMs?: number
  readonly maxBackoffMs?: number
  readonly sleep?: (ms: number, signal: AbortSignal) => Promise<void>
  readonly onStateChange?: (state: ConnectorSupervisorState) => void
  readonly runLoop?: (
    run: ConnectorHostRun,
    signal: AbortSignal
  ) => Promise<void> | void
}

export interface ConnectorHostLike {
  start(): Promise<ConnectorHostRun>
}
