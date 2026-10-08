import { isAbsolute, resolve } from "node:path"
import {
  resolveLocalModelEndpoints,
  type LocalModelEndpointsOptions
} from "@wanex/assistant-host"
import { modelEndpointFromJson } from "@wanex/runtime/provider"
import { parseWanexServerConfig, type WanexServerConfig } from "../config.js"

export interface WanexServerProcessConfig {
  readonly server: WanexServerConfig
  readonly modelEndpoints?: LocalModelEndpointsOptions
  readonly tls: {
    readonly keyFile: string
    readonly certFile: string
  }
}

export function parseWanexServerProcessConfig(value: unknown): WanexServerProcessConfig {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Wanex Server process config must be an object")
  }
  const record = value as Record<string, unknown>
  const allowed = new Set([
    "dataRoot",
    "profileId",
    "hostId",
    "listener",
    "workspace",
    "modelEndpoints",
    "tls"
  ])
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) throw new Error(`Wanex Server process config field is not allowed: ${key}`)
  }
  const tls = record.tls
  if (tls === null || typeof tls !== "object" || Array.isArray(tls)) {
    throw new Error("Wanex Server TLS file config must be an object")
  }
  const tlsRecord = tls as Record<string, unknown>
  const tlsKeys = Object.keys(tlsRecord)
  if (
    tlsKeys.some((key) => key !== "keyFile" && key !== "certFile") ||
    tlsKeys.length !== 2 ||
    typeof tlsRecord.keyFile !== "string" ||
    typeof tlsRecord.certFile !== "string"
  ) {
    throw new Error("Wanex Server TLS file config requires keyFile and certFile")
  }
  const keyFile = requireAbsoluteFilePath(tlsRecord.keyFile, "tls.keyFile")
  const certFile = requireAbsoluteFilePath(tlsRecord.certFile, "tls.certFile")
  const modelEndpoints = record.modelEndpoints === undefined
    ? undefined
    : parseModelEndpoints(record.modelEndpoints)
  const {
    tls: _tls,
    modelEndpoints: _modelEndpoints,
    ...serverInput
  } = record
  const server = parseWanexServerConfig(serverInput)
  return Object.freeze({
    server,
    ...(modelEndpoints === undefined ? {} : { modelEndpoints }),
    tls: Object.freeze({ keyFile, certFile })
  })
}

function parseModelEndpoints(value: unknown): LocalModelEndpointsOptions {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Wanex Server modelEndpoints must be an object")
  }
  const record = value as Record<string, unknown>
  const unknown = Object.keys(record).find(
    (key) =>
      key !== "endpoints" &&
      key !== "activeEndpointId" &&
      key !== "capabilityRoutes"
  )
  if (unknown !== undefined) {
    throw new Error(`Wanex Server modelEndpoints field is not allowed: ${unknown}`)
  }
  if (!Array.isArray(record.endpoints)) {
    throw new Error("Wanex Server modelEndpoints.endpoints must be an array")
  }
  const endpoints = record.endpoints.map((endpoint, index) => {
    assertNoRawCredential(endpoint, index)
    try {
      return modelEndpointFromJson(
        endpoint as Parameters<typeof modelEndpointFromJson>[0]
      )
    } catch (error) {
      throw new Error(
        `Wanex Server modelEndpoints endpoint ${index} is invalid: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  })
  if (
    record.activeEndpointId !== undefined &&
    typeof record.activeEndpointId !== "string"
  ) {
    throw new Error("Wanex Server modelEndpoints.activeEndpointId must be a string")
  }
  const capabilityRoutes = record.capabilityRoutes === undefined
    ? undefined
    : parseCapabilityRoutes(record.capabilityRoutes)
  return Object.freeze(resolveLocalModelEndpoints({
    endpoints,
    ...(record.activeEndpointId === undefined
      ? {}
      : { activeEndpointId: record.activeEndpointId }),
    ...(capabilityRoutes === undefined ? {} : { capabilityRoutes })
  }))
}

function parseCapabilityRoutes(value: unknown): Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Wanex Server modelEndpoints.capabilityRoutes must be an object")
  }
  const routes: Record<string, string> = {}
  for (const [operation, endpointId] of Object.entries(value)) {
    if (typeof endpointId !== "string" || endpointId.trim().length === 0) {
      throw new Error(`Wanex Server capability route is invalid: ${operation}`)
    }
    routes[operation] = endpointId
  }
  return routes
}

function assertNoRawCredential(value: unknown, index: number): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return
  const endpoint = value as Record<string, unknown>
  const connection = endpoint.connection
  const connectionRecord = connection !== null &&
      typeof connection === "object" &&
      !Array.isArray(connection)
    ? connection as Record<string, unknown>
    : undefined
  if (
    endpoint.apiKey !== undefined ||
    endpoint.apiKeyEnv !== undefined ||
    endpoint.credential !== undefined ||
    connectionRecord?.apiKey !== undefined ||
    connectionRecord?.apiKeyEnv !== undefined ||
    connectionRecord?.credential !== undefined
  ) {
    throw new Error(
      `Wanex Server modelEndpoints endpoint ${index} must reference credentials with connection.secretRef`
    )
  }
}

function requireAbsoluteFilePath(value: string, name: string): string {
  const normalized = value.trim()
  if (!isAbsolute(normalized)) throw new Error(`Wanex Server ${name} must be absolute`)
  return resolve(normalized)
}
