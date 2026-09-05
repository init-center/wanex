import type { JsonValue } from "@wanex/protocol"
import type { ConfigEntryRecord } from "@wanex/storage"
import { isLocalMcpServerId, localMcpServerKey } from "./identity.js"
import type {
  LocalMcpNamedValue,
  LocalMcpServerDefinition,
  LocalMcpTransportDefinition,
  LocalMcpValueSource,
} from "./model.js"

const MAX_LABEL_BYTES = 256
const MAX_REVISION_BYTES = 256
const MAX_PATH_BYTES = 8 * 1024
const MAX_ARGUMENTS = 64
const MAX_ARGUMENT_BYTES = 8 * 1024
const MAX_NAMED_VALUES = 64
const MAX_LITERAL_BYTES = 16 * 1024
const MAX_SECRET_REF_BYTES = 2 * 1024
const MIN_TIMEOUT_MS = 10
const MAX_TIMEOUT_MS = 120_000
const MIN_BUFFER_BYTES = 1_024
const MAX_BUFFER_BYTES = 10 * 1024 * 1024

export function decodeLocalMcpServerEntry(
  entry: ConfigEntryRecord
): LocalMcpServerDefinition {
  const value = exactRecord(entry.value, "MCP server definition", [
    "capabilityRevision",
    "connectTimeoutMs",
    "enabled",
    "kind",
    "label",
    "requestTimeoutMs",
    "serverId",
    "transport",
  ])
  if (value.kind !== "assistant-host.mcp-server") {
    throw new Error("MCP server definition kind is invalid")
  }
  const serverId = requiredString(value.serverId, "MCP server ID", 64)
  if (!isLocalMcpServerId(serverId)) {
    throw new Error("MCP server ID is invalid")
  }
  if (entry.key !== localMcpServerKey(serverId)) {
    throw new Error("MCP server key does not match its definition")
  }
  return Object.freeze({
    kind: "assistant-host.mcp-server",
    serverId,
    label: requiredString(value.label, "MCP server label", MAX_LABEL_BYTES),
    enabled: requiredBoolean(value.enabled, "MCP enabled state"),
    capabilityRevision: requiredString(
      value.capabilityRevision,
      "MCP capability revision",
      MAX_REVISION_BYTES
    ),
    connectTimeoutMs: boundedInteger(
      value.connectTimeoutMs,
      "MCP connect timeout",
      MIN_TIMEOUT_MS,
      MAX_TIMEOUT_MS
    ),
    requestTimeoutMs: boundedInteger(
      value.requestTimeoutMs,
      "MCP request timeout",
      MIN_TIMEOUT_MS,
      MAX_TIMEOUT_MS
    ),
    transport: decodeTransport(value.transport),
  })
}

export function encodeLocalMcpServerDefinition(
  definition: LocalMcpServerDefinition
): JsonValue {
  return {
    kind: definition.kind,
    serverId: definition.serverId,
    label: definition.label,
    enabled: definition.enabled,
    capabilityRevision: definition.capabilityRevision,
    connectTimeoutMs: definition.connectTimeoutMs,
    requestTimeoutMs: definition.requestTimeoutMs,
    transport: definition.transport.kind === "stdio"
      ? {
          kind: definition.transport.kind,
          command: definition.transport.command,
          args: [...definition.transport.args],
          cwd: definition.transport.cwd,
          environment: definition.transport.environment.map(encodeNamedValue),
          maxBufferBytes: definition.transport.maxBufferBytes ?? null,
        }
      : {
          kind: definition.transport.kind,
          url: definition.transport.url,
          headers: definition.transport.headers.map(encodeNamedValue),
        },
  }
}

function decodeTransport(value: unknown): LocalMcpTransportDefinition {
  const candidate = requiredRecord(value, "MCP transport")
  if (candidate.kind === "stdio") {
    const stdio = exactRecord(candidate, "MCP stdio transport", [
      "args",
      "command",
      "cwd",
      "environment",
      "kind",
      "maxBufferBytes",
    ])
    return Object.freeze({
      kind: "stdio",
      command: requiredString(stdio.command, "MCP stdio command", MAX_PATH_BYTES),
      args: Object.freeze(stringArray(
        stdio.args,
        "MCP stdio arguments",
        MAX_ARGUMENTS,
        MAX_ARGUMENT_BYTES
      )),
      cwd: requiredString(stdio.cwd, "MCP stdio cwd", MAX_PATH_BYTES),
      environment: Object.freeze(namedValues(
        stdio.environment,
        "environment",
        environmentName
      )),
      ...(stdio.maxBufferBytes === null
        ? {}
        : {
            maxBufferBytes: boundedInteger(
              stdio.maxBufferBytes,
              "MCP stdio maximum buffer",
              MIN_BUFFER_BYTES,
              MAX_BUFFER_BYTES
            ),
          }),
    })
  }
  if (candidate.kind === "streamable_http") {
    const http = exactRecord(candidate, "MCP HTTP transport", [
      "headers",
      "kind",
      "url",
    ])
    return Object.freeze({
      kind: "streamable_http",
      url: safeHttpUrl(http.url),
      headers: Object.freeze(namedValues(
        http.headers,
        "header",
        headerName
      )),
    })
  }
  throw new Error("MCP transport kind is invalid")
}

function namedValues(
  value: unknown,
  label: string,
  normalizeName: (value: unknown) => string
): LocalMcpNamedValue[] {
  if (!Array.isArray(value) || value.length > MAX_NAMED_VALUES) {
    throw new Error(`MCP ${label} values are invalid`)
  }
  const seen = new Set<string>()
  return value.map((item) => {
    const record = exactRecord(item, `MCP ${label} value`, ["name", "source"])
    const name = normalizeName(record.name)
    if (seen.has(name)) throw new Error(`MCP ${label} name is duplicated`)
    seen.add(name)
    return Object.freeze({ name, source: valueSource(record.source, label) })
  })
}

function valueSource(value: unknown, label: string): LocalMcpValueSource {
  const candidate = requiredRecord(value, `MCP ${label} source`)
  if (candidate.kind === "literal") {
    const record = exactRecord(candidate, `MCP ${label} literal`, ["kind", "value"])
    return Object.freeze({
      kind: "literal",
      value: boundedString(record.value, `MCP ${label} literal`, MAX_LITERAL_BYTES),
    })
  }
  if (candidate.kind === "credential") {
    const record = exactRecord(candidate, `MCP ${label} credential`, ["kind", "ref"])
    const ref = requiredString(
      record.ref,
      `MCP ${label} credential reference`,
      MAX_SECRET_REF_BYTES
    )
    if (!ref.includes(":")) {
      throw new Error(`MCP ${label} credential reference has no scheme`)
    }
    return Object.freeze({ kind: "credential", ref })
  }
  throw new Error(`MCP ${label} source kind is invalid`)
}

function encodeNamedValue(value: LocalMcpNamedValue): JsonValue {
  return {
    name: value.name,
    source: value.source.kind === "literal"
      ? { kind: "literal", value: value.source.value }
      : { kind: "credential", ref: value.source.ref },
  }
}

function safeHttpUrl(value: unknown): string {
  const raw = requiredString(value, "MCP HTTP URL", MAX_PATH_BYTES)
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error("MCP HTTP URL is invalid")
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.hash.length > 0
  ) {
    throw new Error("MCP HTTP URL contains unsupported authority or fragment")
  }
  return url.toString()
}

function environmentName(value: unknown): string {
  const name = requiredString(value, "MCP environment name", 256)
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name)) {
    throw new Error("MCP environment name is invalid")
  }
  return name
}

function headerName(value: unknown): string {
  const name = requiredString(value, "MCP header name", 256).toLowerCase()
  if (!/^[!#$%&'*+.^_\x60|~0-9a-z-]+$/u.test(name)) {
    throw new Error("MCP header name is invalid")
  }
  return name
}

function stringArray(
  value: unknown,
  label: string,
  maxItems: number,
  maxItemBytes: number
): string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new Error(`${label} are invalid`)
  }
  return value.map((item) => boundedString(item, label, maxItemBytes))
}

function exactRecord(
  value: unknown,
  label: string,
  keys: readonly string[]
): Record<string, unknown> {
  const record = requiredRecord(value, label)
  const expected = new Set(keys)
  const unknown = Object.keys(record).filter((key) => !expected.has(key))
  if (unknown.length > 0) throw new Error(`${label} has unsupported fields`)
  return record
}

function requiredRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be boolean`)
  return value
}

function requiredString(
  value: unknown,
  label: string,
  maxBytes: number
): string {
  const normalized = boundedString(value, label, maxBytes)
  if (normalized.length === 0 || normalized !== normalized.trim()) {
    throw new Error(`${label} must be non-empty and trimmed`)
  }
  return normalized
}

function boundedString(value: unknown, label: string, maxBytes: number): string {
  if (
    typeof value !== "string" ||
    Buffer.byteLength(value, "utf8") > maxBytes ||
    value.includes("\0")
  ) {
    throw new Error(`${label} is invalid`)
  }
  return value
}

function boundedInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number
): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}`)
  }
  return value as number
}
