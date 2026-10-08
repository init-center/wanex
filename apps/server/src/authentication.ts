import type { IncomingMessage } from "node:http"
import type { RemoteHostAuthenticatedSubject } from "@wanex/runtime/host"
import type { WanexServerAuthentication } from "./model.js"

const MAX_BEARER_BYTES = 512

export class WanexServerAuthenticationError extends Error {
  constructor(
    readonly statusCode: 401 | 403 | 503,
    readonly code: "unauthenticated" | "unauthorized" | "authentication_unavailable",
    message: string
  ) {
    super(message)
    this.name = "WanexServerAuthenticationError"
  }
}

export async function authenticateWanexServerRequest(request: {
  readonly input: IncomingMessage
  readonly authentication: WanexServerAuthentication
  readonly operation: string
  readonly now?: () => number
}): Promise<RemoteHostAuthenticatedSubject> {
  const bearer = parseBearer(request.input)
  if (bearer === undefined) {
    throw new WanexServerAuthenticationError(
      401,
      "unauthenticated",
      `${request.operation} requires a bearer token`
    )
  }
  let subject: RemoteHostAuthenticatedSubject | null
  try {
    subject = await request.authentication.authenticateBearerToken(bearer)
  } catch {
    throw new WanexServerAuthenticationError(
      503,
      "authentication_unavailable",
      `${request.operation} authentication is unavailable`
    )
  }
  if (
    subject === null ||
    !isSubjectId(subject.subjectId) ||
    !Number.isSafeInteger(subject.expiresAt) ||
    subject.expiresAt <= (request.now ?? Date.now)()
  ) {
    throw new WanexServerAuthenticationError(
      401,
      "unauthenticated",
      `${request.operation} bearer token is invalid`
    )
  }
  if (!isWanexServerOwner(request.authentication, subject)) {
    throw new WanexServerAuthenticationError(
      403,
      "unauthorized",
      `${request.operation} is unavailable to this account`
    )
  }
  return subject
}

export function isWanexServerOwner(
  authentication: WanexServerAuthentication,
  subject: RemoteHostAuthenticatedSubject
): boolean {
  return isSubjectId(authentication.ownerSubjectId) &&
    subject.subjectId === authentication.ownerSubjectId
}

export function bindWanexServerAuthentication(
  authentication: WanexServerAuthentication
): WanexServerAuthentication {
  if (
    authentication === null || typeof authentication !== "object" ||
    !isSubjectId(authentication.ownerSubjectId) ||
    typeof authentication.authenticateBearerToken !== "function"
  ) {
    throw new Error("Wanex Server authentication requires an explicit ownerSubjectId and authenticator")
  }
  return Object.freeze({
    ownerSubjectId: authentication.ownerSubjectId,
    authenticateBearerToken: authentication.authenticateBearerToken.bind(authentication)
  })
}

function parseBearer(request: IncomingMessage): string | undefined {
  let occurrences = 0
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index]?.toLowerCase() === "authorization") {
      occurrences += 1
    }
  }
  if (occurrences > 1) return undefined
  const value = request.headers.authorization
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return undefined
  const token = value.slice("Bearer ".length)
  return token.length > 0 && Buffer.byteLength(token, "utf8") <= MAX_BEARER_BYTES
    ? token
    : undefined
}

function isSubjectId(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 200 &&
    /^[A-Za-z0-9._:-]+$/.test(value)
}
