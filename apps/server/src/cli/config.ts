import { isAbsolute, resolve } from "node:path"
import { parseWanexServerConfig, type WanexServerConfig } from "../config.js"

export interface WanexServerProcessConfig {
  readonly server: WanexServerConfig
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
  const allowed = new Set(["dataRoot", "profileId", "hostId", "listener", "coding", "tls"])
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
  const { tls: _tls, ...serverInput } = record
  const server = parseWanexServerConfig(serverInput)
  return Object.freeze({
    server,
    tls: Object.freeze({ keyFile, certFile })
  })
}

function requireAbsoluteFilePath(value: string, name: string): string {
  const normalized = value.trim()
  if (!isAbsolute(normalized)) throw new Error(`Wanex Server ${name} must be absolute`)
  return resolve(normalized)
}
