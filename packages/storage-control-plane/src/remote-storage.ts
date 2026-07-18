import type { JsonValue } from "@wanex/protocol"
import type {
  StorageRpcRequestEnvelope,
  StorageWireTransport
} from "@wanex/storage"

export interface RemoteStorageControlPlaneRequest {
  readonly method: string
  readonly headers: Readonly<Record<string, string | undefined>>
  readonly body: unknown
}

export interface RemoteStorageControlPlaneResponse {
  readonly status: number
  readonly headers: Readonly<Record<string, string>>
  readonly body: JsonValue
}

export interface RemoteStorageAuthenticatedSubject {
  readonly subjectId: string
  readonly metadata?: Readonly<Record<string, JsonValue>>
}

export interface RemoteStorageControlPlaneOptions<
  TSubject extends RemoteStorageAuthenticatedSubject = RemoteStorageAuthenticatedSubject
> {
  readonly authenticateBearerToken: (token: string) => Promise<TSubject | null>
  readonly resolveStorageWireTransport: (
    subject: TSubject
  ) => Promise<StorageWireTransport>
}

export interface RemoteStorageControlPlane<
  TSubject extends RemoteStorageAuthenticatedSubject = RemoteStorageAuthenticatedSubject
> {
  handle(
    request: RemoteStorageControlPlaneRequest
  ): Promise<RemoteStorageControlPlaneResponse>
}

const JSON_HEADERS = {
  "content-type": "application/json"
} as const

const FORBIDDEN_STORE_SELECTOR_KEYS = new Set([
  "store",
  "storeDir",
  "storePath",
  "tenant",
  "tenantId",
  "database",
  "databaseName"
])

export function createRemoteStorageControlPlane<
  TSubject extends RemoteStorageAuthenticatedSubject = RemoteStorageAuthenticatedSubject
>(
  options: RemoteStorageControlPlaneOptions<TSubject>
): RemoteStorageControlPlane<TSubject> {
  return {
    async handle(request) {
      if (request.method.toUpperCase() !== "POST") {
        return jsonResponse(405, {
          ok: false,
          error: {
            code: "method_not_allowed",
            message: "remote storage control plane requires POST"
          }
        })
      }

      const token = parseBearerToken(request.headers)
      if (token === undefined) {
        return jsonResponse(401, {
          ok: false,
          error: {
            code: "unauthorized",
            message: "missing bearer token"
          }
        })
      }

      const subject = await options.authenticateBearerToken(token)
      if (subject === null) {
        return jsonResponse(401, {
          ok: false,
          error: {
            code: "unauthorized",
            message: "invalid bearer token"
          }
        })
      }

      const parsed = parseRemoteStorageBody(request.body)
      if (!parsed.ok) {
        return jsonResponse(parsed.status, {
          ok: false,
          error: {
            code: parsed.code,
            message: parsed.message
          }
        })
      }

      const transport = await options.resolveStorageWireTransport(subject)
      const envelope = await transport.exchange(parsed.request)
      return jsonResponse(200, envelope as JsonValue)
    }
  }
}

export function parseBearerToken(
  headers: Readonly<Record<string, string | undefined>>
): string | undefined {
  const authorization = getHeader(headers, "authorization")
  const prefix = "Bearer "
  if (authorization === undefined || !authorization.startsWith(prefix)) {
    return undefined
  }
  const token = authorization.slice(prefix.length)
  return token.length === 0 ? undefined : token
}

function parseRemoteStorageBody(
  body: unknown
):
  | {
      readonly ok: true
      readonly request: StorageRpcRequestEnvelope
    }
  | {
      readonly ok: false
      readonly status: number
      readonly code: string
      readonly message: string
    } {
  if (!isRecord(body)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_body",
      message: "remote storage body must be an object"
    }
  }

  for (const key of Object.keys(body)) {
    if (FORBIDDEN_STORE_SELECTOR_KEYS.has(key)) {
      return {
        ok: false,
        status: 400,
        code: "client_store_selector_forbidden",
        message: "remote storage clients cannot select stores"
      }
    }
  }

  if (!("request" in body)) {
    return {
      ok: false,
      status: 400,
      code: "missing_request",
      message: "remote storage body missing request"
    }
  }

  return {
    ok: true,
    request: body.request as StorageRpcRequestEnvelope
  }
}

function getHeader(
  headers: Readonly<Record<string, string | undefined>>,
  name: string
): string | undefined {
  const direct = headers[name]
  if (direct !== undefined) {
    return direct
  }
  const lower = name.toLowerCase()
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) {
      return value
    }
  }
  return undefined
}

function jsonResponse(
  status: number,
  body: JsonValue
): RemoteStorageControlPlaneResponse {
  return {
    status,
    headers: JSON_HEADERS,
    body
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
