import { createHash } from "node:crypto"
import { createServer } from "node:http"
import type { WebEventStreamConnection } from "./event-stream.js"
import { normalizeMaxAttachmentBytes } from "./routes/attachment.js"
import { routeWebRequest } from "./router.js"
import {
  CLIENT_SCRIPT,
  STYLESHEET
} from "./browser-client.js"
import { createWebHostSessionToken } from "./session-token.js"
import type {
  ListenWebNodeHostOptions,
  WebNodeHostServer,
  WebNodeRequestHandler,
  WebNodeRequestHandlerOptions
} from "./types.js"

export type * from "./types.js"

const DEFAULT_REQUEST_PATH = "/wanex/assistant/request"
const DEFAULT_ATTACHMENT_PATH = "/wanex/assistant/attachment"
const DEFAULT_RESOURCE_DELIVERY_PREPARE_PATH =
  "/wanex/assistant/resource-delivery/prepare"
const DEFAULT_RESOURCE_DELIVERY_PATH = "/wanex/assistant/resource-delivery"
const DEFAULT_PROVIDER_MANAGEMENT_PATH = "/wanex/assistant/providers"
const DEFAULT_MODEL_CATALOG_REFRESH_PATH = "/wanex/assistant/model-catalog-refresh"
const DEFAULT_CAPABILITY_SETUP_PATH = "/wanex/assistant/capability-setup"
const DEFAULT_MCP_SETTINGS_PATH = "/wanex/assistant/mcp-settings"
const DEFAULT_EVENT_STREAM_PATH = "/wanex/assistant/events"
const DEFAULT_MAX_BODY_BYTES = 64 * 1024

export function createWebNodeRequestHandler(
  options: WebNodeRequestHandlerOptions
): WebNodeRequestHandler {
  const requestPath = options.requestPath ?? DEFAULT_REQUEST_PATH
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES
  const attachmentPath = options.attachmentPath ?? DEFAULT_ATTACHMENT_PATH
  const resourceDeliveryPreparePath =
    options.resourceDeliveryPreparePath ?? DEFAULT_RESOURCE_DELIVERY_PREPARE_PATH
  const resourceDeliveryPath =
    options.resourceDeliveryPath ?? DEFAULT_RESOURCE_DELIVERY_PATH
  const eventStreamPath = options.eventStreamPath ?? DEFAULT_EVENT_STREAM_PATH
  const providerManagementPath =
    options.providers === undefined ? undefined : DEFAULT_PROVIDER_MANAGEMENT_PATH
  const modelCatalogRefreshPath =
    options.modelCatalog === undefined
      ? undefined
      : DEFAULT_MODEL_CATALOG_REFRESH_PATH
  const capabilitySetupPath =
    options.capabilitySetup === undefined
      ? undefined
      : DEFAULT_CAPABILITY_SETUP_PATH
  const mcpSettingsPath =
    options.mcpSettings === undefined ? undefined : DEFAULT_MCP_SETTINGS_PATH
  const maxAttachmentBytes = normalizeMaxAttachmentBytes(
    options.maxAttachmentBytes
  )
  const browserAssets = options.browserAssets ?? {
    clientScript: CLIENT_SCRIPT,
    stylesheet: STYLESHEET
  }
  const hostSessionToken = createWebHostSessionToken()
  const resourceDeliveryAudience = createHash("sha256")
    .update(hostSessionToken)
    .digest("hex")
  const activeStreams = new Set<WebEventStreamConnection>()
  const handler = ((request, response) => {
    void routeWebRequest({
      controller: options.controller,
      surfaceEvents: options.surfaceEvents,
      attachments: options.attachments,
      resourceDeliveries: options.resourceDeliveries,
      ...(options.providers === undefined ? {} : { providers: options.providers }),
      ...(options.modelCatalog === undefined
        ? {}
        : { modelCatalog: options.modelCatalog }),
      ...(options.capabilitySetup === undefined
        ? {}
        : { capabilitySetup: options.capabilitySetup }),
      ...(options.mcpSettings === undefined
        ? {}
        : { mcpSettings: options.mcpSettings }),
      browserAssets,
      requestPath,
      maxBodyBytes,
      attachmentPath,
      resourceDeliveryPreparePath,
      resourceDeliveryPath,
      resourceDeliveryAudience,
      eventStreamPath,
      ...(providerManagementPath === undefined
        ? {}
        : { providerManagementPath }),
      ...(modelCatalogRefreshPath === undefined
        ? {}
        : { modelCatalogRefreshPath }),
      ...(capabilitySetupPath === undefined ? {} : { capabilitySetupPath }),
      ...(mcpSettingsPath === undefined ? {} : { mcpSettingsPath }),
      maxAttachmentBytes,
      hostSessionToken,
      windowChrome: options.windowChrome ?? "standard",
      activeStreams,
      request,
      response
    })
  }) as WebNodeRequestHandler
  handler.closeActiveStreams = () => {
    for (const stream of activeStreams) stream.close()
    activeStreams.clear()
    options.resourceDeliveries.close()
  }
  return handler
}

export async function listenWebNodeHost(
  options: ListenWebNodeHostOptions
): Promise<WebNodeHostServer> {
  const handler = createWebNodeRequestHandler(options)
  const server = createServer(handler)
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(options.port ?? 0, options.hostname ?? "127.0.0.1", () => {
      server.off("error", reject)
      resolve()
    })
  })
  return {
    server,
    url: serverUrl(server),
    async close() {
      handler.closeActiveStreams()
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
        server.closeAllConnections()
      })
    }
  }
}

function serverUrl(server: ReturnType<typeof createServer>): string {
  const address = server.address()
  if (address === null || typeof address === "string") {
    throw new Error("web application Node host did not bind to a TCP address")
  }
  const host = address.address.includes(":")
    ? `[${address.address}]`
    : address.address
  return `http://${host}:${address.port}`
}
