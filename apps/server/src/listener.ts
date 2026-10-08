import { createServer } from "node:https"
import type { ServerResponse } from "node:http"
import {
  createRemoteAgentHostNodeHttpAdapter,
  type RemoteAgentHostHttpHandler
} from "@wanex/runtime/host"
import type { WanexServerListenerConfig } from "./config.js"
import type {
  WanexServerEndpoint,
  WanexServerAuthentication,
  WanexServerTlsCredentials
} from "./model.js"
import type {
  LocalAttachmentUploadPort,
  ResourceDeliveryPort
} from "@wanex/assistant-host"
import {
  REMOTE_ASSISTANT_ATTACHMENT_UPLOAD_PATH,
  REMOTE_ASSISTANT_RESOURCE_DELIVERY_PATH
} from "@wanex/assistant-host"
import {
  createWanexServerResourceDeliveryHandler
} from "./resource-delivery.js"
import { createWanexServerAttachmentUploadHandler } from "./attachment-upload.js"

export interface ListenWanexServerOptions {
  readonly config: WanexServerListenerConfig
  readonly tls: WanexServerTlsCredentials
  readonly handler: RemoteAgentHostHttpHandler
  readonly authentication: WanexServerAuthentication
  readonly attachments: LocalAttachmentUploadPort
  readonly resourceDeliveries: ResourceDeliveryPort
  readonly maxAttachmentBytes?: number
  readonly requestTimeoutMs?: number
}

export interface WanexServerListener {
  readonly endpoint: WanexServerEndpoint
  close(): Promise<void>
  destroyConnections(): void
}

export async function listenWanexServer(
  options: ListenWanexServerOptions
): Promise<WanexServerListener> {
  validateTlsCredentials(options.tls)
  const adapter = createRemoteAgentHostNodeHttpAdapter({
    handler: options.handler
  })
  const resourceDelivery = createWanexServerResourceDeliveryHandler({
    authentication: options.authentication,
    deliveries: options.resourceDeliveries
  })
  const attachmentUpload = createWanexServerAttachmentUploadHandler({
    authentication: options.authentication,
    attachments: options.attachments,
    ...(options.maxAttachmentBytes === undefined
      ? {}
      : { maxAttachmentBytes: options.maxAttachmentBytes })
  })
  const server = createServer(
    { key: options.tls.key, cert: options.tls.cert },
    (request, response) => {
      void attachmentUpload.handle(request, response).then(
        async (handled) => {
          if (handled) return
          if (!await resourceDelivery.handle(request, response)) {
            await adapter.handle(request, response)
          }
        }
      ).catch(() => destroyResponse(response))
    }
  )
  if (options.requestTimeoutMs !== undefined) {
    server.requestTimeout = options.requestTimeoutMs
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => reject(error)
      server.once("error", onError)
      server.listen(
        { host: options.config.hostname, port: options.config.port },
        () => {
          server.off("error", onError)
          resolve()
        }
      )
    })
  } catch (error) {
    server.closeAllConnections()
    throw error
  }

  const address = server.address()
  if (address === null || typeof address === "string") {
    server.closeAllConnections()
    await closeHttpsServer(server).catch(() => {})
    throw new Error("Wanex Server listener did not bind to a TCP address")
  }
  const origin = `https://${urlHostname(options.config.hostname)}:${address.port}`
  const endpoint = Object.freeze({
    kind: "wanex.server.endpoint" as const,
    transport: "https" as const,
    hostname: options.config.hostname,
    port: address.port,
    messageUrl: `${origin}/v1/agent-host/message`,
    attachmentUploadUrl: `${origin}${REMOTE_ASSISTANT_ATTACHMENT_UPLOAD_PATH}`,
    resourceDeliveryUrl: `${origin}${REMOTE_ASSISTANT_RESOURCE_DELIVERY_PATH}`
  })
  let closePromise: Promise<void> | undefined
  return Object.freeze({
    endpoint,
    close() {
      closePromise ??= closeHttpsServer(server)
      server.closeIdleConnections()
      return closePromise
    },
    destroyConnections() {
      server.closeAllConnections()
    }
  })
}

function validateTlsCredentials(credentials: WanexServerTlsCredentials): void {
  if (!isNonEmptyTlsValue(credentials.key) || !isNonEmptyTlsValue(credentials.cert)) {
    throw new Error("Wanex Server TLS key and certificate are required")
  }
}

function isNonEmptyTlsValue(value: unknown): value is string | Buffer {
  return (
    (typeof value === "string" && value.length > 0) ||
    (Buffer.isBuffer(value) && value.byteLength > 0)
  )
}

function urlHostname(hostname: string): string {
  return hostname.includes(":") ? `[${hostname}]` : hostname
}

function destroyResponse(response: ServerResponse): void {
  if (!response.destroyed) response.destroy()
}

async function closeHttpsServer(
  server: ReturnType<typeof createServer>
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error))
  })
}
