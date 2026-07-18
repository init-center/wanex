import type { WanexAgentRunnerOptions } from "../core/index.js"
import type { SessionId } from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import type { WanexWorker } from "../../jobs/index.js"

export type SessionRunMode = "once" | "to_completion"

export interface SessionRunJobPayload {
  readonly sessionId: SessionId
  readonly mode?: SessionRunMode
  readonly maxSteps?: number
  readonly providerProfileId?: string
}

export interface SessionRunReceipt {
  readonly sessionId: SessionId
  readonly status: "idle" | "completed" | "cancelled"
  readonly mode: SessionRunMode
  readonly inputId?: string
  readonly runId?: string
  readonly steps?: number
  readonly reason?: string
}

export type SessionRunHandlerOptions = Omit<
  WanexAgentRunnerOptions,
  "runnerId"
> & {
  readonly runnerId?: string
}

export interface RegisterSessionRunHandlerOptions
  extends SessionRunHandlerOptions {
  readonly worker: WanexWorker
}

export interface ProfileSessionRunHandlerOptions
  extends Omit<SessionRunHandlerOptions, "provider"> {
  readonly storage: CoreStore
  readonly providerProfileId?: string
}

export interface RegisterProfileSessionRunHandlerOptions
  extends ProfileSessionRunHandlerOptions {
  readonly worker: WanexWorker
}
