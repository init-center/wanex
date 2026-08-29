import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import type { IncomingMessage } from "node:http"

export const WEB_HOST_SESSION_HEADER =
  "x-wanex-host-session" as const
const WEB_HOST_SESSION_COOKIE_PREFIX =
  "wanex_host_session_" as const

export function createWebHostSessionToken(): string {
  return randomBytes(32).toString("base64url")
}

export function requireWebHostSessionToken(options: {
  readonly request: IncomingMessage
  readonly expected: string
}): void {
  const value = options.request.headers[WEB_HOST_SESSION_HEADER]
  if (Array.isArray(value) || typeof value !== "string") {
    throw invalidHostSession()
  }
  assertHostSessionValue(value, options.expected)
}

export function webHostSessionCookie(token: string): string {
  return `${hostSessionCookieName(token)}=${token}; HttpOnly; SameSite=Strict; Path=/wanex/assistant`
}

export function requireWebHostSessionCookie(options: {
  readonly request: IncomingMessage
  readonly expected: string
}): void {
  const header = options.request.headers.cookie
  if (typeof header !== "string") throw invalidHostSession()
  const cookieName = hostSessionCookieName(options.expected)
  const values = header
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${cookieName}=`))
    .map((part) => part.slice(cookieName.length + 1))
  if (values.length !== 1 || values[0] === undefined) throw invalidHostSession()
  assertHostSessionValue(values[0], options.expected)
}

function hostSessionCookieName(token: string): string {
  const fingerprint = createHash("sha256").update(token).digest("hex").slice(0, 16)
  return `${WEB_HOST_SESSION_COOKIE_PREFIX}${fingerprint}`
}

function assertHostSessionValue(value: string, expectedValue: string): void {
  const expected = Buffer.from(expectedValue, "utf8")
  const received = Buffer.from(value, "utf8")
  if (
    received.byteLength !== expected.byteLength ||
    !timingSafeEqual(received, expected)
  ) {
    throw invalidHostSession()
  }
}

function invalidHostSession(): Error & {
  readonly statusCode: 403
  readonly code: "host_session_required"
} {
  return Object.assign(
    new Error("assistant host session token is required"),
    {
      statusCode: 403 as const,
      code: "host_session_required" as const
    }
  )
}
