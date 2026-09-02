import type {
  SessionInputOrigin,
  SessionTurnExecutionBinding,
  SessionTurnId
} from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import type { PreparedAgentContext } from "../../context/agent/index.js"
import type { ProviderAdapter } from "../../provider/index.js"
import type { SecretResolverPort } from "../../secrets/index.js"
import type { WanexSessionCore } from "../../sessions/index.js"
import type { WanexWorker } from "../../jobs/index.js"
import type { TurnControlEventObserver } from "./turn-control-observer.js"
import type { AgentRuntimeExecutionStageObserver } from "../stage.js"

export interface SessionTurnJobPayload {
  readonly sessionId: string
  readonly turnId: SessionTurnId
  readonly inputId: string
}

export interface ResolveSessionTurnAgentContextRequest {
  readonly sessionId: string
  readonly turnId: string
  readonly inputId: string
  readonly origin?: SessionInputOrigin
  readonly executionBinding?: SessionTurnExecutionBinding
  readonly signal: AbortSignal
}

export type SessionTurnAgentContextResolver = (
  request: ResolveSessionTurnAgentContextRequest
) => Promise<PreparedAgentContext | undefined> | PreparedAgentContext | undefined

export interface SessionTurnHandlerOptions {
  readonly session: WanexSessionCore
  readonly storage: CoreStore
  readonly directProvider?: ProviderAdapter
  readonly secretResolver?: SecretResolverPort
  readonly agentContext?: PreparedAgentContext
  readonly resolveAgentContext?: SessionTurnAgentContextResolver
  readonly toolMaxConcurrency?: number
  readonly timeoutMs?: number
  readonly observeProviderEvent?: import("../../provider/index.js").ProviderEventObserver
  readonly observeExecutionStage?: AgentRuntimeExecutionStageObserver
  /** @internal */
  readonly turnControlObserver?: TurnControlEventObserver
}

export interface RegisterSessionTurnHandlerOptions
  extends SessionTurnHandlerOptions {
  readonly worker: WanexWorker
}
