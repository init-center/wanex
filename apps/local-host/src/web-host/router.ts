import type { IncomingMessage, ServerResponse } from "node:http"
import { handleRequest, type Controller } from "@wanex/web"
import {
  CLIENT_SCRIPT,
  CLIENT_SCRIPT_PATH,
  STYLESHEET,
  STYLESHEET_PATH,
  renderDocument
} from "./browser-client.js"
import {
  createWebEventStream,
  parseWebEventStreamCursor,
  type WebEventStreamConnection
} from "./event-stream.js"
import { normalizeHttpError } from "./http-error.js"
import { handleLocalModelCatalogRefresh } from "./model-catalog-refresh.js"
import { readJsonBody } from "./request-body.js"
import {
  handleResourceDelivery,
  handleResourceDeliveryPrepare
} from "./resource-delivery.js"
import { sendCss, sendHtml, sendJavascript, sendJson } from "./response.js"
import {
  requireWebHostSessionToken,
  webHostSessionCookie
} from "./session-token.js"
import type { WebNodeRequestHandlerOptions } from "./types.js"
import { handleAttachmentUpload } from "./routes/attachment.js"
import { handleCapabilitySetup } from "./routes/capability.js"
import { handleProviderManagement } from "./routes/providers.js"

export interface WebRequestContext {
  readonly controller: Controller
  readonly surfaceEvents: WebNodeRequestHandlerOptions["surfaceEvents"]
  readonly attachments: WebNodeRequestHandlerOptions["attachments"]
  readonly resourceDeliveries: WebNodeRequestHandlerOptions["resourceDeliveries"]
  readonly providers?: WebNodeRequestHandlerOptions["providers"]
  readonly modelCatalog?: WebNodeRequestHandlerOptions["modelCatalog"]
  readonly capabilitySetup?: WebNodeRequestHandlerOptions["capabilitySetup"]
  readonly requestPath: string
  readonly maxBodyBytes: number
  readonly attachmentPath: string
  readonly resourceDeliveryPreparePath: string
  readonly resourceDeliveryPath: string
  readonly resourceDeliveryAudience: string
  readonly eventStreamPath: string
  readonly providerManagementPath?: string
  readonly modelCatalogRefreshPath?: string
  readonly capabilitySetupPath?: string
  readonly maxAttachmentBytes: number
  readonly hostSessionToken: string
  readonly windowChrome: NonNullable<
    WebNodeRequestHandlerOptions["windowChrome"]
  >
  readonly activeStreams: Set<WebEventStreamConnection>
  readonly request: IncomingMessage
  readonly response: ServerResponse
}

export async function routeWebRequest(request: WebRequestContext): Promise<void> {
  const path = new URL(
    request.request.url ?? "/",
    "http://127.0.0.1"
  ).pathname
  try {
    if (request.request.method === "GET" && path === "/") {
      request.response.setHeader(
        "set-cookie",
        webHostSessionCookie(request.hostSessionToken)
      )
      sendHtml(
        request.response,
        renderDocument({
          requestPath: request.requestPath,
          eventStreamPath: request.eventStreamPath,
          attachmentPath: request.attachmentPath,
          resourceDeliveryPreparePath: request.resourceDeliveryPreparePath,
          ...(request.providerManagementPath === undefined
            ? {}
            : { providerManagementPath: request.providerManagementPath }),
          ...(request.modelCatalogRefreshPath === undefined
            ? {}
            : { modelCatalogRefreshPath: request.modelCatalogRefreshPath }),
          ...(request.capabilitySetupPath === undefined
            ? {}
            : { capabilitySetupPath: request.capabilitySetupPath }),
          hostSessionToken: request.hostSessionToken,
          windowChrome: request.windowChrome
        })
      )
      return
    }
    if (request.request.method === "GET" && path === CLIENT_SCRIPT_PATH) {
      sendJavascript(request.response, CLIENT_SCRIPT)
      return
    }
    if (request.request.method === "GET" && path === STYLESHEET_PATH) {
      sendCss(request.response, STYLESHEET)
      return
    }
    if (path === request.eventStreamPath) {
      if (request.request.method !== "GET") {
        methodNotAllowed(
          request.response,
          "product event stream endpoint requires GET"
        )
        return
      }
      requireHostSession(request)
      const cursor = parseWebEventStreamCursor(
        request.request.headers["last-event-id"]
      )
      if (!cursor.ok) {
        sendJson(request.response, 400, {
          ok: false,
          error: {
            code: "invalid_event_cursor",
            message: cursor.message
          }
        })
        return
      }
      const connection = createWebEventStream({
        source: request.surfaceEvents,
        request: request.request,
        response: request.response,
        ...(cursor.cursor === undefined ? {} : { cursor: cursor.cursor })
      })
      request.activeStreams.add(connection)
      void connection.closed.then(() => {
        request.activeStreams.delete(connection)
      })
      return
    }
    if (
      request.providerManagementPath !== undefined &&
      path === request.providerManagementPath
    ) {
      if (
        request.request.method !== "GET" &&
        request.request.method !== "POST" &&
        request.request.method !== "DELETE"
      ) {
        methodNotAllowed(
          request.response,
          "product provider management endpoint requires GET, POST, or DELETE"
        )
        return
      }
      requireHostSession(request)
      await handleProviderManagement(request)
      return
    }
    if (
      request.modelCatalogRefreshPath !== undefined &&
      path === request.modelCatalogRefreshPath
    ) {
      if (request.request.method !== "POST") {
        methodNotAllowed(
          request.response,
          "product model catalog refresh endpoint requires POST"
        )
        return
      }
      requireHostSession(request)
      if (request.modelCatalog === undefined) {
        throw new Error("model catalog refresh route is missing its commands")
      }
      await handleLocalModelCatalogRefresh({
        commands: request.modelCatalog,
        maxBodyBytes: request.maxBodyBytes,
        request: request.request,
        response: request.response
      })
      return
    }
    if (
      request.capabilitySetupPath !== undefined &&
      path === request.capabilitySetupPath
    ) {
      if (request.request.method !== "POST") {
        methodNotAllowed(
          request.response,
          "product capability setup endpoint requires POST"
        )
        return
      }
      requireHostSession(request)
      await handleCapabilitySetup(request)
      return
    }
    if (path === request.attachmentPath) {
      if (request.request.method !== "POST") {
        methodNotAllowed(
          request.response,
          "product attachment endpoint requires POST"
        )
        return
      }
      requireHostSession(request)
      await handleAttachmentUpload(request)
      return
    }
    if (path === request.resourceDeliveryPreparePath) {
      if (request.request.method !== "POST") {
        methodNotAllowed(
          request.response,
          "product resource delivery prepare endpoint requires POST"
        )
        return
      }
      requireHostSession(request)
      await handleResourceDeliveryPrepare({
        deliveries: request.resourceDeliveries,
        audience: request.resourceDeliveryAudience,
        deliveryPath: request.resourceDeliveryPath,
        maxBodyBytes: request.maxBodyBytes,
        request: request.request,
        response: request.response
      })
      return
    }
    if (path === request.resourceDeliveryPath) {
      if (
        request.request.method !== "GET" &&
        request.request.method !== "HEAD" &&
        request.request.method !== "DELETE"
      ) {
        methodNotAllowed(
          request.response,
          "product resource delivery endpoint requires GET, HEAD, or DELETE"
        )
        return
      }
      await handleResourceDelivery({
        deliveries: request.resourceDeliveries,
        expectedHostSessionToken: request.hostSessionToken,
        request: request.request,
        response: request.response
      })
      return
    }
    if (path === request.requestPath && request.request.method !== "POST") {
      methodNotAllowed(
        request.response,
        "web application request endpoint requires POST"
      )
      return
    }
    if (path !== request.requestPath) {
      sendJson(request.response, 404, {
        ok: false,
        error: {
          code: "not_found",
          message: "web application route was not found"
        }
      })
      return
    }

    requireHostSession(request)
    const body = await readJsonBody(request.request, request.maxBodyBytes)
    const response = await handleRequest(request.controller, body)
    sendJson(request.response, 200, response)
  } catch (error) {
    const normalized = normalizeHttpError(error)
    if (normalized.totalSizeBytes !== undefined) {
      request.response.setHeader(
        "content-range",
        `bytes */${normalized.totalSizeBytes}`
      )
    }
    sendJson(request.response, normalized.statusCode, {
      ok: false,
      error: {
        code: normalized.code,
        message: normalized.message
      }
    })
  }
}

function requireHostSession(request: WebRequestContext): void {
  requireWebHostSessionToken({
    request: request.request,
    expected: request.hostSessionToken
  })
}

function methodNotAllowed(response: ServerResponse, message: string): void {
  sendJson(response, 405, {
    ok: false,
    error: { code: "method_not_allowed", message }
  })
}
