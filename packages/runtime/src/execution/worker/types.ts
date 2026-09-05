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

interface ResolveSessionTurnAgentContextRequestBase {
  readonly sessionId: string
  readonly turnId: string
  readonly inputId: string
  readonly origin?: SessionInputOrigin
  readonly signal: AbortSignal
}

export type ResolveSessionTurnAgentContextRequest =
  | (ResolveSessionTurnAgentContextRequestBase & {
      readonly phase: "admission"
      readonly executionBinding?: never
      readonly contextIdentity?: never
    })
  | (ResolveSessionTurnAgentContextRequestBase & {
      readonly phase: "execution" | "inheritance"
      readonly executionBinding: SessionTurnExecutionBinding
      /** Process-local identity of the context used by the current Turn. */
      readonly contextIdentity?: SessionTurnAgentContextIdentity
    })

declare const sessionTurnAgentContextIdentityBrand: unique symbol

/**
 * Opaque process-local identity for a dynamic agent context generation.
 *
 * This value must never be put in protocol, storage, diagnostics, or renderer
 * data. It exists only while a host process is coordinating live contexts.
 */
export type SessionTurnAgentContextIdentity = symbol & {
  readonly [sessionTurnAgentContextIdentityBrand]: true
}

export interface SessionTurnAgentContextLease {
  readonly phase: "admission" | "inheritance"
  commit(binding: SessionTurnExecutionBinding): void
  rollback(): void
}

export interface ResolvedSessionTurnAgentContext {
  readonly context?: PreparedAgentContext
  readonly contextIdentity?: SessionTurnAgentContextIdentity
  readonly lease?: SessionTurnAgentContextLease
}

export type SessionTurnAgentContextResolver = (
  request: ResolveSessionTurnAgentContextRequest
) =>
  | Promise<ResolvedSessionTurnAgentContext | undefined>
  | ResolvedSessionTurnAgentContext
  | undefined

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
