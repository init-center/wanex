import { isAbsolute } from "node:path"
import { resolveLocalStore } from "@wanex/storage"

export interface WanexServerConfig {
  readonly dataRoot: string
  readonly profileId: string
  readonly hostId: string
  readonly listener: WanexServerListenerConfig
  readonly coding?: WanexServerCodingConfig
}

export interface WanexServerCodingConfig {
  readonly execution: WanexServerCodingExecutionConfig
  readonly projects: readonly WanexServerProjectConfig[]
}

export interface WanexServerCodingExecutionConfig {
  readonly kind: "native"
}

export interface WanexServerProjectConfig {
  readonly repositoryPath: string
}

export interface WanexServerListenerConfig {
  readonly hostname: string
  readonly port: number
}

export function parseWanexServerConfig(value: unknown): WanexServerConfig {
  const input = exactRecord(value, "Server config", [
    "dataRoot",
    "profileId",
    "hostId",
    "listener",
    "coding"
  ])
  const dataRoot = requiredAbsolutePath(input.dataRoot, "Server dataRoot")
  const requestedProfileId = optionalString(input.profileId, "Server profileId")
  const location = resolveLocalStore({
    rootDir: dataRoot,
    ...(requestedProfileId === undefined ? {} : { profileId: requestedProfileId })
  })
  const hostId = input.hostId === undefined
    ? `wanex-server:${location.profileId}`
    : requiredIdentifier(input.hostId, "Server hostId")
  const listener = parseListener(input.listener)
  const coding = parseCoding(input.coding)
  return Object.freeze({
    dataRoot: location.rootDir,
    profileId: location.profileId,
    hostId,
    listener,
    ...(coding === undefined ? {} : { coding })
  })
}

function parseCoding(value: unknown): WanexServerCodingConfig | undefined {
  if (value === undefined) return undefined
  const input = exactRecord(value, "Server coding", ["execution", "projects"])
  const executionInput = exactRecord(
    input.execution,
    "Server coding execution",
    ["kind"]
  )
  if (executionInput.kind !== "native") {
    throw new Error("Server coding execution kind must be native")
  }
  if (!Array.isArray(input.projects) || input.projects.length === 0 || input.projects.length > 32) {
    throw new Error("Server coding projects must contain 1 to 32 entries")
  }
  const seen = new Set<string>()
  const projects = input.projects.map((value, index) => {
    const project = exactRecord(
      value,
      `Server coding project ${index}`,
      ["repositoryPath"]
    )
    const repositoryPath = requiredAbsolutePath(
      project.repositoryPath,
      `Server coding project ${index} repositoryPath`
    )
    const duplicateKey = process.platform === "win32"
      ? repositoryPath.toLowerCase()
      : repositoryPath
    if (seen.has(duplicateKey)) {
      throw new Error("Server coding project repositoryPath is duplicated")
    }
    seen.add(duplicateKey)
    return Object.freeze({ repositoryPath })
  })
  return Object.freeze({
    execution: Object.freeze({ kind: "native" as const }),
    projects: Object.freeze(projects)
  })
}

function parseListener(value: unknown): WanexServerListenerConfig {
  const input = exactRecord(value, "Server listener", ["hostname", "port"])
  const hostname = requiredHostname(input.hostname)
  const port = input.port === undefined ? 8443 : requiredPort(input.port)
  return Object.freeze({ hostname, port })
}

function requiredAbsolutePath(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw new Error(`${label} must be a non-empty path`)
  }
  if (!isAbsolute(value)) throw new Error(`${label} must be absolute`)
  return value
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "string") throw new Error(`${label} must be a string`)
  return value
}

function requiredIdentifier(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 200 ||
    !/^[A-Za-z0-9._:-]+$/.test(value)
  ) {
    throw new Error(`${label} must be a valid opaque identifier`)
  }
  return value
}

function requiredHostname(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 253 ||
    value.trim() !== value ||
    /[\u0000-\u0020\u007f/\\?#@]/.test(value)
  ) {
    throw new Error("Server listener hostname is invalid")
  }
  return value
}

function requiredPort(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 65_535) {
    throw new Error("Server listener port must be between 0 and 65535")
  }
  return value as number
}

function exactRecord(
  value: unknown,
  label: string,
  allowedKeys: readonly string[]
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  const record = value as Record<string, unknown>
  const allowed = new Set(allowedKeys)
  const unknown = Object.keys(record).find((key) => !allowed.has(key))
  if (unknown !== undefined) throw new Error(`${label} field is not allowed: ${unknown}`)
  return record
}
