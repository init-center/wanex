import type {
  ConnectorAdapter,
  ConnectorHostContext
} from "@wanex/connector"
import type { JsonValue } from "@wanex/protocol"
import {
  REFERENCE_CONNECTOR_CHANNEL_ID,
  REFERENCE_CONNECTOR_CHANNEL_KIND
} from "./constants.js"

export interface ReferenceInboundMessage {
  readonly id: string
  readonly senderExternalIdentityId: string
  readonly text: string
  readonly principalId?: string
  readonly externalThreadId?: string
  readonly receivedAt?: number
  readonly metadata?: JsonValue
}

export interface ReferenceSentMessage {
  readonly id: string
  readonly targetExternalIdentityId?: string
  readonly externalThreadId?: string
  readonly payload: JsonValue
}

export interface ReferenceConnectorTransport {
  connect(options: {
    readonly token: string
    readonly signal: AbortSignal
    readonly onMessage: (message: ReferenceInboundMessage) => Promise<void>
  }): Promise<ReferenceConnectorConnection> | ReferenceConnectorConnection
  send(
    message: ReferenceConnectorSendRequest
  ): Promise<ReferenceSentMessage> | ReferenceSentMessage
}

export interface ReferenceConnectorConnection {
  close(): Promise<void> | void
}

export interface ReferenceConnectorSendRequest {
  readonly channelId: string
  readonly targetExternalIdentityId?: string
  readonly externalThreadId?: string
  readonly payload: JsonValue
}

export interface ReferenceConnectorAdapterOptions {
  readonly transport: ReferenceConnectorTransport
  readonly channelId?: string
}

export class ReferenceConnectorAdapter implements ConnectorAdapter {
  private readonly transport: ReferenceConnectorTransport
  private readonly channelId: string
  private connection: ReferenceConnectorConnection | undefined

  constructor(options: ReferenceConnectorAdapterOptions) {
    this.transport = options.transport
    this.channelId = options.channelId ?? REFERENCE_CONNECTOR_CHANNEL_ID
  }

  async start(context: ConnectorHostContext): Promise<void> {
    if (this.connection !== undefined) {
      throw new Error("reference connector adapter is already connected")
    }
    const secret = await context.resolveCredentialSecret()
    try {
      this.connection = await this.transport.connect({
        token: secret.reveal(),
        signal: context.signal,
        onMessage: async (message) => {
          await context.ingestEvent({
            id: `chin_reference_${message.id}`,
            channelKind: REFERENCE_CONNECTOR_CHANNEL_KIND,
            channelId: this.channelId,
            externalEventId: message.id,
            ...(message.externalThreadId === undefined
              ? {}
              : { externalThreadId: message.externalThreadId }),
            senderExternalIdentityId: message.senderExternalIdentityId,
            ...(message.principalId === undefined
              ? {}
              : { principalId: message.principalId }),
            payload: {
              kind: "reference.message",
              text: message.text
            },
            ...(message.metadata === undefined ? {} : { metadata: message.metadata }),
            ...(message.receivedAt === undefined
              ? {}
              : { receivedAt: message.receivedAt }),
            idempotencyKey: `reference:${message.id}`
          })
        }
      })
    } finally {
      secret.dispose()
    }
  }

  async stop(): Promise<void> {
    const connection = this.connection
    this.connection = undefined
    await connection?.close()
  }

  async deliver(
    context: Parameters<NonNullable<ConnectorAdapter["deliver"]>>[0]
  ): Promise<JsonValue> {
    if (context.delivery.channelKind !== REFERENCE_CONNECTOR_CHANNEL_KIND) {
      throw new Error(
        `reference connector cannot deliver channel kind: ${context.delivery.channelKind}`
      )
    }
    if (context.delivery.channelId !== this.channelId) {
      throw new Error(
        `reference connector cannot deliver channel id: ${context.delivery.channelId}`
      )
    }
    const sent = await this.transport.send({
      channelId: context.delivery.channelId,
      ...(context.delivery.targetExternalIdentityId === undefined
        ? {}
        : { targetExternalIdentityId: context.delivery.targetExternalIdentityId }),
      ...(context.delivery.externalThreadId === undefined
        ? {}
        : { externalThreadId: context.delivery.externalThreadId }),
      payload: context.delivery.payload
    })
    return {
      externalMessageId: sent.id,
      targetExternalIdentityId: sent.targetExternalIdentityId ?? null,
      externalThreadId: sent.externalThreadId ?? null
    }
  }
}

export function createReferenceConnectorAdapter(
  options: ReferenceConnectorAdapterOptions
): ReferenceConnectorAdapter {
  return new ReferenceConnectorAdapter(options)
}

export class InMemoryReferenceConnectorTransport
  implements ReferenceConnectorTransport
{
  readonly sent: ReferenceSentMessage[] = []
  private readonly inbound: ReferenceInboundMessage[]
  private nextSendId = 1
  private closed = false
  private connectCountValue = 0
  private lastTokenValue: string | undefined

  constructor(options: {
    readonly inbound?: readonly ReferenceInboundMessage[]
  } = {}) {
    this.inbound = [...(options.inbound ?? [])]
  }

  get connectCount(): number {
    return this.connectCountValue
  }

  get lastToken(): string | undefined {
    return this.lastTokenValue
  }

  get isClosed(): boolean {
    return this.closed
  }

  async connect(options: {
    readonly token: string
    readonly signal: AbortSignal
    readonly onMessage: (message: ReferenceInboundMessage) => Promise<void>
  }): Promise<ReferenceConnectorConnection> {
    if (this.closed) {
      throw new Error("reference transport is closed")
    }
    this.connectCountValue += 1
    this.lastTokenValue = options.token
    for (const message of this.inbound) {
      if (options.signal.aborted) {
        break
      }
      await options.onMessage(message)
    }
    return {
      close: () => {
        this.closed = true
      }
    }
  }

  send(message: ReferenceConnectorSendRequest): ReferenceSentMessage {
    if (this.closed) {
      throw new Error("reference transport is closed")
    }
    const sent: ReferenceSentMessage = {
      id: `refmsg_${this.nextSendId}`,
      ...(message.targetExternalIdentityId === undefined
        ? {}
        : { targetExternalIdentityId: message.targetExternalIdentityId }),
      ...(message.externalThreadId === undefined
        ? {}
        : { externalThreadId: message.externalThreadId }),
      payload: message.payload
    }
    this.nextSendId += 1
    this.sent.push(sent)
    return sent
  }
}
