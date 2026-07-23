import type {
  SessionTurnExecutionBinding,
  SessionTurnId
} from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import type { PreparedAgentContext } from "../../context/agent/index.js"
import type { ProviderAdapter } from "../../provider/index.js"
import type { SecretResolverPort } from "../../secrets/index.js"
import type { WanexSessionCore } from "../../sessions/index.js"
import type { WanexWorker } from "../../jobs/index.js"

export interface SessionTurnJobPayload {
  readonly sessionId: string
  readonly turnId: SessionTurnId
  readonly inputId: string
}

export interface ResolveSessionTurnAgentContextRequest {
  readonly sessionId: string
  readonly turnId: string
  readonly inputId: string
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
}

export interface RegisterSessionTurnHandlerOptions
  extends SessionTurnHandlerOptions {
  readonly worker: WanexWorker
}
