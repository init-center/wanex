import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import {
  handleProductAppWebRequest,
  renderProductAppWebStylesheet,
  type ProductAppWebController
} from "@wanex/product-app-web"
import {
  DEFAULT_CLIENT_SCRIPT_PATH,
  DEFAULT_STYLESHEET_PATH,
  PRODUCT_APP_WEB_BROWSER_CLIENT_SCRIPT,
  renderProductAppWebNodeHostDocument
} from "./browser-client.js"
import {
  sendCss,
  sendHtml,
  sendJavascript,
  sendJson
} from "./response.js"
import type {
  ListenProductAppWebNodeHostOptions,
  ProductAppWebNodeHostServer,
  ProductAppWebNodeRequestHandler,
  ProductAppWebNodeRequestHandlerOptions
} from "./types.js"

export type * from "./types.js"

const DEFAULT_REQUEST_PATH = "/wanex/product-app-web/request"
const DEFAULT_MAX_BODY_BYTES = 64 * 1024
const DEFAULT_POLL_INTERVAL_MS = 2_000
const MAX_POLL_INTERVAL_MS = 60_000

export function createProductAppWebNodeRequestHandler(
  options: ProductAppWebNodeRequestHandlerOptions
): ProductAppWebNodeRequestHandler {
  const requestPath = options.requestPath ?? DEFAULT_REQUEST_PATH
  const clientScriptPath = options.clientScriptPath ?? DEFAULT_CLIENT_SCRIPT_PATH
  const stylesheetPath = options.stylesheetPath ?? DEFAULT_STYLESHEET_PATH
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES
  const pollIntervalMs = normalizePollIntervalMs(options.pollIntervalMs)

  return (request, response) => {
    void handleNodeRequest({
      controller: options.controller,
      requestPath,
      clientScriptPath,
      stylesheetPath,
      maxBodyBytes,
      pollIntervalMs,
      request,
      response
    })
  }
}

export async function listenProductAppWebNodeHost(
  options: ListenProductAppWebNodeHostOptions
): Promise<ProductAppWebNodeHostServer> {
  const handler = createProductAppWebNodeRequestHandler(options)
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
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      })
    }
  }
}

async function handleNodeRequest(request: {
  readonly controller: ProductAppWebController
  readonly requestPath: string
  readonly clientScriptPath: string
  readonly stylesheetPath: string
  readonly maxBodyBytes: number
  readonly pollIntervalMs: number
  readonly request: IncomingMessage
  readonly response: ServerResponse
}): Promise<void> {
  const path = requestPath(request.request)
  try {
    if (request.request.method === "GET" && path === "/") {
      sendHtml(
        request.response,
        renderProductAppWebNodeHostDocument({
          surfaceHtml: request.controller.document().html,
          requestPath: request.requestPath,
          clientScriptPath: request.clientScriptPath,
          stylesheetPath: request.stylesheetPath,
          pollIntervalMs: request.pollIntervalMs
        })
      )
      return
    }
    if (
      request.request.method === "GET" &&
      path === request.clientScriptPath
    ) {
      sendJavascript(request.response, PRODUCT_APP_WEB_BROWSER_CLIENT_SCRIPT)
      return
    }
    if (
      request.request.method === "GET" &&
      path === request.stylesheetPath
    ) {
      sendCss(request.response, renderProductAppWebStylesheet())
      return
    }
    if (path === request.requestPath && request.request.method !== "POST") {
      sendJson(request.response, 405, {
        ok: false,
        error: {
          code: "method_not_allowed",
          message: "Product App Web request endpoint requires POST"
        }
      })
      return
    }
    if (path !== request.requestPath) {
      sendJson(request.response, 404, {
        ok: false,
        error: {
          code: "not_found",
          message: "Product App Web route was not found"
        }
      })
      return
    }

    const body = await readJsonBody(request.request, request.maxBodyBytes)
    const response = await handleProductAppWebRequest(request.controller, body)
    sendJson(request.response, 200, response)
  } catch (error) {
    sendJson(request.response, 400, {
      ok: false,
      error: {
        code: "invalid_http_request",
        message: error instanceof Error ? error.message : String(error)
      }
    })
  }
}

async function readJsonBody(
  request: IncomingMessage,
  maxBodyBytes: number
): Promise<unknown> {
  const chunks: Buffer[] = []
  let totalBytes = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    totalBytes += buffer.byteLength
    if (totalBytes > maxBodyBytes) {
      throw new Error(`request body exceeds ${maxBodyBytes} bytes`)
    }
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString("utf8")
  if (text.trim().length === 0) {
    throw new Error("request body must contain JSON")
  }
  return JSON.parse(text)
}

function requestPath(request: IncomingMessage): string {
  return new URL(request.url ?? "/", "http://127.0.0.1").pathname
}

function normalizePollIntervalMs(input: number | undefined): number {
  if (input === undefined) {
    return DEFAULT_POLL_INTERVAL_MS
  }
  if (
    !Number.isSafeInteger(input) ||
    input < 0 ||
    input > MAX_POLL_INTERVAL_MS
  ) {
    throw new Error(
      `pollIntervalMs must be an integer from 0 to ${MAX_POLL_INTERVAL_MS}`
    )
  }
  return input
}

function serverUrl(server: ReturnType<typeof createServer>): string {
  const address = server.address()
  if (address === null || typeof address === "string") {
    throw new Error("Product App Web Node host did not bind to a TCP address")
  }
  const host = address.address.includes(":")
    ? `[${address.address}]`
    : address.address
  return `http://${host}:${address.port}`
}
