import { isAbsolute } from "node:path"
import { resolveLocalStore } from "@wanex/storage"
import type { WorkspaceHostOptions } from "@wanex/assistant-host"

export interface WanexServerConfig {
  readonly dataRoot: string
  readonly profileId: string
  readonly hostId: string
  readonly listener: WanexServerListenerConfig
  /** Workspace authority resolved and executed on this Server machine. */
  readonly workspace?: WorkspaceHostOptions
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
    "workspace"
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
  const workspace = parseWorkspace(input.workspace, hostId)
  return Object.freeze({
    dataRoot: location.rootDir,
    profileId: location.profileId,
    hostId,
    listener,
    ...(workspace === undefined ? {} : { workspace })
  })
}

function parseWorkspace(value: unknown, hostId: string): WorkspaceHostOptions | undefined {
  if (value === undefined) return undefined
  const input = exactRecord(value, "Server workspace", ["initialRoots", "worktreeDirectory"])
  const isolation = input.worktreeDirectory === undefined ? {} : {
    worktreeDirectory: requiredAbsolutePath(input.worktreeDirectory, "Server workspace worktreeDirectory")
  }
  if (input.initialRoots === undefined) {
    return Object.freeze({ hostId, ...isolation })
  }
  if (!Array.isArray(input.initialRoots) || input.initialRoots.length > 16) {
    throw new Error("Server workspace initialRoots must contain at most 16 roots")
  }
  const seen = new Set<string>()
  const initialRoots = input.initialRoots.map((value, index) => {
    const root = exactRecord(value, `Server workspace root ${index}`, ["id", "path", "effects"])
    const id = requiredIdentifier(root.id, `Server workspace root ${index} id`)
    if (seen.has(id)) throw new Error("Server workspace root IDs must be unique")
    seen.add(id)
    const path = requiredAbsolutePath(root.path, `Server workspace root ${index} path`)
    const effects = parseWorkspaceEffects(root.effects, index)
    return Object.freeze({ id, path, ...(effects === undefined ? {} : { effects }) })
  })
  return Object.freeze({ hostId, ...isolation, initialRoots: Object.freeze(initialRoots) })
}

function parseWorkspaceEffects(value: unknown, index: number): readonly ("read" | "write" | "create" | "remove")[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length === 0 || value.length > 4) {
    throw new Error(`Server workspace root ${index} effects must be a non-empty array`)
  }
  const allowed = new Set(["read", "write", "create", "remove"])
  if (value.some((effect) => typeof effect !== "string" || !allowed.has(effect)) || new Set(value).size !== value.length || !value.includes("read")) {
    throw new Error(`Server workspace root ${index} effects must contain unique read/write/create/remove values including read`)
  }
  return value as readonly ("read" | "write" | "create" | "remove")[]
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
