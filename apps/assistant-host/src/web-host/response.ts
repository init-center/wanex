import type { ServerResponse } from "node:http"

const DEFAULT_SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "cross-origin-resource-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "content-security-policy": [
    "default-src 'none'",
    "base-uri 'none'",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "script-src 'self'",
    "style-src 'self'"
  ].join("; ")
}

export function sendHtml(response: ServerResponse, html: string): void {
  response.writeHead(200, responseHeaders({
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store"
  }))
  response.end(html)
}

export function sendJavascript(
  response: ServerResponse,
  script: string
): void {
  response.writeHead(200, responseHeaders({
    "content-type": "text/javascript; charset=utf-8",
    "cache-control": "no-store"
  }))
  response.end(script)
}

export function sendCss(response: ServerResponse, css: string): void {
  response.writeHead(200, responseHeaders({
    "content-type": "text/css; charset=utf-8",
    "cache-control": "no-store"
  }))
  response.end(css)
}

export function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown
): void {
  response.writeHead(statusCode, responseHeaders({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  }))
  response.end(JSON.stringify(body))
}

export function sendBinary(
  response: ServerResponse,
  body: Uint8Array,
  headers: {
    readonly contentType: string
    readonly sha256: string
  }
): void {
  response.writeHead(200, responseHeaders({
    "content-type": headers.contentType,
    "content-length": String(body.byteLength),
    "x-wanex-resource-sha256": headers.sha256,
    "cache-control": "no-store"
  }))
  response.end(body)
}

export function setWebSecurityHeaders(
  response: ServerResponse
): void {
  for (const [name, value] of Object.entries(DEFAULT_SECURITY_HEADERS)) {
    response.setHeader(name, value)
  }
}

function responseHeaders(
  headers: Readonly<Record<string, string>>
): Record<string, string> {
  return {
    ...DEFAULT_SECURITY_HEADERS,
    ...headers
  }
}
