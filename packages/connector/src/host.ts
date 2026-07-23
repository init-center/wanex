import type {
  ChannelInboundEventRecord,
  ConnectorSessionRecord,
  JsonValue
} from "@wanex/protocol"
import type {
  ResolvedSecret,
  SecretResolverPort
} from "@wanex/runtime/secrets"
import type {
  WanexWorker,
  WorkerRunOnceResult
} from "@wanex/runtime/jobs"
import { createConnectorHostContext } from "./host-context.js"
import { normalizeHostError } from "./host-errors.js"
import { ActiveConnectorHostRun } from "./host-run.js"
import type {
  ConnectorDeliveryHandlerContext,
  FinishConnectorSessionLeaseRequest,
  IngestConnectorEventRequest
} from "./runtime.js"
import type { ConnectorRuntime } from "./runtime.js"

export interface ConnectorHostOptions {
  readonly runtime: ConnectorRuntime
  readonly connectorId: string
  readonly credentialId: string
  readonly ownerId: string
  readonly leaseMs: number
  readonly heartbeatIntervalMs?: number
  readonly sessionId?: string
  readonly sessionMetadata?: JsonValue
  readonly idempotencyKey?: string
  readonly credentialSecretRef?: string
  readonly secretResolver?: SecretResolverPort
  readonly worker?: WanexWorker
  readonly adapter: ConnectorAdapter
}

export interface ConnectorAdapter {
  start(context: ConnectorHostContext): Promise<void> | void
  stop?(context: ConnectorHostContext): Promise<void> | void
  deliver?(
    context: ConnectorDeliveryHandlerContext & {
      readonly host: ConnectorHostContext
    }
  ): Promise<JsonValue | void> | JsonValue | void
}

export interface ConnectorHostContext {
  readonly connectorId: string
  readonly credentialId: string
  readonly ownerId: string
  readonly signal: AbortSignal
  get session(): ConnectorSessionRecord
  heartbeat(metadata?: JsonValue): Promise<ConnectorSessionRecord>
  resolveCredentialSecret(): Promise<ResolvedSecret>
  ingestEvent(
    request: Omit<IngestConnectorEventRequest, "connectorId">
  ): Promise<ChannelInboundEventRecord>
}

export interface ConnectorHostRun {
  readonly session: ConnectorSessionRecord
  readonly signal: AbortSignal
  runDeliveryOnce(): Promise<WorkerRunOnceResult>
  stop(): Promise<ConnectorSessionRecord>
}

export class ConnectorHost {
  private readonly runtime: ConnectorRuntime
  private readonly connectorId: string
  private readonly credentialId: string
  private readonly ownerId: string
  private readonly leaseMs: number
  private readonly heartbeatIntervalMs: number
  private readonly sessionId: string | undefined
  private readonly sessionMetadata: JsonValue | undefined
  private readonly idempotencyKey: string | undefined
  private readonly credentialSecretRef: string | undefined
  private readonly secretResolver: SecretResolverPort | undefined
  private readonly worker: WanexWorker | undefined
  private readonly adapter: ConnectorAdapter
  private active: ActiveConnectorHostRun | null = null

  constructor(options: ConnectorHostOptions) {
    if (options.leaseMs <= 0) {
      throw new Error("connector host leaseMs must be positive")
    }
    if (
      options.heartbeatIntervalMs !== undefined &&
      options.heartbeatIntervalMs <= 0
    ) {
      throw new Error("connector host heartbeatIntervalMs must be positive")
    }
    this.runtime = options.runtime
    this.connectorId = options.connectorId
    this.credentialId = options.credentialId
    this.ownerId = options.ownerId
    this.leaseMs = options.leaseMs
    this.heartbeatIntervalMs =
      options.heartbeatIntervalMs ?? Math.max(1_000, Math.floor(options.leaseMs / 3))
    this.sessionId = options.sessionId
    this.sessionMetadata = options.sessionMetadata
    this.idempotencyKey = options.idempotencyKey
    this.credentialSecretRef = options.credentialSecretRef
    this.secretResolver = options.secretResolver
    this.worker = options.worker
    this.adapter = options.adapter
    if (this.adapter.deliver !== undefined && this.worker === undefined) {
      throw new Error("connector host delivery adapter requires a worker")
    }
  }

  async start(): Promise<ConnectorHostRun> {
    if (this.active !== null) {
      throw new Error(`connector host already started: ${this.connectorId}`)
    }

    const controller = new AbortController()
    let session = await this.runtime.startSession({
      ...(this.sessionId === undefined ? {} : { id: this.sessionId }),
      connectorId: this.connectorId,
      credentialId: this.credentialId,
      ownerId: this.ownerId,
      leaseMs: this.leaseMs,
      state: "connecting",
      ...(this.sessionMetadata === undefined
        ? {}
        : { metadata: this.sessionMetadata }),
      ...(this.idempotencyKey === undefined
        ? {}
        : { idempotencyKey: this.idempotencyKey })
    })
    const context = this.createContext(controller, () => session, (next) => {
      session = next
    })

    try {
      await this.adapter.start(context)
      session = await this.runtime.heartbeatSession({
        sessionId: session.id,
        ownerId: this.ownerId,
        leaseToken: session.leaseToken,
        leaseMs: this.leaseMs,
        state: "connected"
      })
    } catch (error) {
      controller.abort()
      await this.finishSessionIfOwned(session, {
        state: "failed",
        error: normalizeHostError(error)
      })
      throw error
    }

    if (this.worker !== undefined && this.adapter.deliver !== undefined) {
      this.runtime.registerDeliveryHandler(this.worker, async (deliveryContext) => {
        return await this.adapter.deliver?.({
          ...deliveryContext,
          host: context
        })
      })
    }

    const run = new ActiveConnectorHostRun({
      runtime: this.runtime,
      adapter: this.adapter,
      context,
      controller,
      session: () => session,
      setSession: (next) => {
        session = next
      },
      ownerId: this.ownerId,
      leaseMs: this.leaseMs,
      heartbeatIntervalMs: this.heartbeatIntervalMs,
      worker: this.worker,
      onStopped: () => {
        if (this.active === run) {
          this.active = null
        }
      }
    })
    this.active = run
    run.startHeartbeat()
    return run
  }

  private createContext(
    controller: AbortController,
    getSession: () => ConnectorSessionRecord,
    setSession: (session: ConnectorSessionRecord) => void
  ): ConnectorHostContext {
    return createConnectorHostContext({
      runtime: this.runtime,
      connectorId: this.connectorId,
      credentialId: this.credentialId,
      ownerId: this.ownerId,
      leaseMs: this.leaseMs,
      credentialSecretRef: this.credentialSecretRef,
      secretResolver: this.secretResolver,
      controller,
      getSession,
      setSession
    })
  }

  private async finishSessionIfOwned(
    session: ConnectorSessionRecord,
    request: Pick<FinishConnectorSessionLeaseRequest, "state" | "metadata" | "error">
  ): Promise<ConnectorSessionRecord> {
    return await this.runtime.finishSession({
      sessionId: session.id,
      ownerId: this.ownerId,
      leaseToken: session.leaseToken,
      state: request.state,
      ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
      ...(request.error === undefined ? {} : { error: request.error })
    })
  }
}
