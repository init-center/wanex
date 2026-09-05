import type {
  LocalMcpCredentialSetupRequest,
  LocalMcpSettingsSaveServerRequest,
  LocalMcpSettingsTransportInput,
  LocalMcpSettingsUpdateServerRequest,
  LocalMcpSettingsValueInput,
} from "./model.js"

const MAX_LABEL_BYTES = 256
const MAX_PATH_BYTES = 8 * 1024
const MAX_ARGUMENTS = 64
const MAX_ARGUMENT_BYTES = 8 * 1024
const MAX_NAMED_VALUES = 64
const MAX_CREDENTIAL_BYTES = 16 * 1024
const MIN_TIMEOUT_MS = 10
const MAX_TIMEOUT_MS = 120_000
const MIN_BUFFER_BYTES = 1_024
const MAX_BUFFER_BYTES = 10 * 1024 * 1024

export type LocalMcpSettingsCommand =
  | {
      readonly operation: "stage-credential"
      readonly request: LocalMcpCredentialSetupRequest
    }
  | {
      readonly operation: "save-server"
      readonly request: LocalMcpSettingsSaveServerRequest
    }
  | {
      readonly operation: "update-server"
      readonly request: LocalMcpSettingsUpdateServerRequest
    }
  | {
      readonly operation: "set-server-enabled"
      readonly request: {
        readonly serverId: string
        readonly enabled: boolean
        readonly expectedRevision: number
      }
    }
  | {
      readonly operation: "remove-server"
      readonly request: {
        readonly serverId: string
        readonly expectedRevision: number
      }
    }
  | {
      readonly operation: "reload-servers"
      readonly request: { readonly force?: boolean }
    }

export class LocalMcpSettingsValidationError extends Error {
  readonly field: string

  constructor(field: string, message: string) {
    super(message)
    this.name = "LocalMcpSettingsValidationError"
    this.field = field
  }
}

export function parseLocalMcpSettingsCommand(
  input: unknown
): LocalMcpSettingsCommand {
  const command = exactRecord(input, "request", ["operation", "request"])
  const operation = requiredString(command.operation, "operation", 64)
  if (operation === "stage-credential") {
    return { operation, request: parseCredentialSetup(command.request) }
  }
  if (operation === "save-server") {
    return { operation, request: parseSaveServer(command.request) }
  }
  if (operation === "update-server") {
    return { operation, request: parseUpdateServer(command.request) }
  }
  if (operation === "set-server-enabled") {
    const request = exactRecord(command.request, "request", [
      "enabled",
      "expectedRevision",
      "serverId",
    ])
    return {
      operation,
      request: {
        serverId: serverId(request.serverId),
        enabled: requiredBoolean(request.enabled, "enabled"),
        expectedRevision: expectedRevision(
          request.expectedRevision,
          "expectedRevision"
        ),
      },
    }
  }
  if (operation === "remove-server") {
    const request = exactRecord(command.request, "request", [
      "expectedRevision",
      "serverId",
    ])
    return {
      operation,
      request: {
        serverId: serverId(request.serverId),
        expectedRevision: expectedRevision(
          request.expectedRevision,
          "expectedRevision"
        ),
      },
    }
  }
  if (operation === "reload-servers") {
    const request = exactRecord(command.request, "request", ["force"])
    const force = optionalBoolean(request.force, "force")
    return {
      operation,
      request: force === undefined ? {} : { force },
    }
  }
  throw invalid("operation", "MCP settings operation is not supported")
}

function parseCredentialSetup(input: unknown): LocalMcpCredentialSetupRequest {
  const request = exactRecord(input, "request", [
    "name",
    "serverId",
    "transport",
    "value",
  ])
  const transport = transportKind(request.transport, "transport")
  return {
    serverId: serverId(request.serverId),
    transport,
    name: namedValueName(request.name, transport, "name"),
    value: credential(request.value, "value"),
  }
}

function parseSaveServer(input: unknown): LocalMcpSettingsSaveServerRequest {
  const request = exactRecord(input, "request", [
    "connectTimeoutMs",
    "enabled",
    "expectedRevision",
    "label",
    "requestTimeoutMs",
    "serverId",
    "transport",
  ])
  return {
    serverId: serverId(request.serverId),
    expectedRevision: nullableExpectedRevision(
      request.expectedRevision,
      "expectedRevision"
    ),
    label: requiredTrimmedString(request.label, "label", MAX_LABEL_BYTES),
    enabled: requiredBoolean(request.enabled, "enabled"),
    connectTimeoutMs: boundedInteger(
      request.connectTimeoutMs,
      "connectTimeoutMs",
      MIN_TIMEOUT_MS,
      MAX_TIMEOUT_MS
    ),
    requestTimeoutMs: boundedInteger(
      request.requestTimeoutMs,
      "requestTimeoutMs",
      MIN_TIMEOUT_MS,
      MAX_TIMEOUT_MS
    ),
    transport: parseTransport(request.transport),
  }
}

function parseUpdateServer(input: unknown): LocalMcpSettingsUpdateServerRequest {
  const request = exactRecord(input, "request", [
    "expectedRevision",
    "label",
    "serverId",
  ])
  return {
    serverId: serverId(request.serverId),
    expectedRevision: expectedRevision(
      request.expectedRevision,
      "expectedRevision"
    ),
    label: requiredTrimmedString(request.label, "label", MAX_LABEL_BYTES),
  }
}

function parseTransport(input: unknown): LocalMcpSettingsTransportInput {
  const candidate = requiredRecord(input, "transport")
  const kind = transportKind(candidate.kind, "transport.kind")
  if (kind === "stdio") {
    const transport = exactRecord(candidate, "transport", [
      "args",
      "command",
      "cwd",
      "environment",
      "kind",
      "maxBufferBytes",
    ])
    const maxBufferBytes = optionalBoundedInteger(
      transport.maxBufferBytes,
      "transport.maxBufferBytes",
      MIN_BUFFER_BYTES,
      MAX_BUFFER_BYTES
    )
    return {
      kind,
      command: requiredTrimmedString(
        transport.command,
        "transport.command",
        MAX_PATH_BYTES
      ),
      args: stringArray(
        transport.args,
        "transport.args",
        MAX_ARGUMENTS,
        MAX_ARGUMENT_BYTES
      ),
      cwd: requiredTrimmedString(
        transport.cwd,
        "transport.cwd",
        MAX_PATH_BYTES
      ),
      environment: namedValues(
        transport.environment,
        kind,
        "transport.environment"
      ),
      ...(maxBufferBytes === undefined ? {} : { maxBufferBytes }),
    }
  }
  const transport = exactRecord(candidate, "transport", [
    "headers",
    "kind",
    "url",
  ])
  return {
    kind,
    url: safeHttpUrl(transport.url, "transport.url"),
    headers: namedValues(
      transport.headers,
      kind,
      "transport.headers"
    ),
  }
}

function namedValues(
  input: unknown,
  transport: "stdio" | "streamable_http",
  field: string
) {
  if (!Array.isArray(input) || input.length > MAX_NAMED_VALUES) {
    throw invalid(field, `${field} must be a bounded array`)
  }
  const seen = new Set<string>()
  return input.map((inputValue, index) => {
    const valueField = `${field}.${index}`
    const value = exactRecord(inputValue, valueField, ["name", "source"])
    const name = namedValueName(value.name, transport, `${valueField}.name`)
    if (seen.has(name)) {
      throw invalid(`${valueField}.name`, `${field} contains a duplicate name`)
    }
    seen.add(name)
    return {
      name,
      source: valueSource(value.source, `${valueField}.source`),
    }
  })
}

function valueSource(input: unknown, field: string): LocalMcpSettingsValueInput {
  const candidate = requiredRecord(input, field)
  if (candidate.kind === "credential") {
    const source = exactRecord(candidate, field, ["kind", "setupId"])
    return {
      kind: "credential",
      setupId: setupId(source.setupId, `${field}.setupId`),
    }
  }
  throw invalid(
    `${field}.kind`,
    `${field}.kind must use a staged credential`
  )
}

function exactRecord(
  input: unknown,
  field: string,
  keys: readonly string[]
): Record<string, unknown> {
  const record = requiredRecord(input, field)
  const expected = new Set(keys)
  const unknown = Object.keys(record).filter((key) => !expected.has(key))
  if (unknown.length > 0) {
    throw invalid(field, `${field} contains unsupported fields`)
  }
  return record
}

function requiredRecord(input: unknown, field: string): Record<string, unknown> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw invalid(field, `${field} must be an object`)
  }
  return input as Record<string, unknown>
}

function requiredBoolean(input: unknown, field: string): boolean {
  if (typeof input !== "boolean") {
    throw invalid(field, `${field} must be boolean`)
  }
  return input
}

function optionalBoolean(input: unknown, field: string): boolean | undefined {
  if (input === undefined) return undefined
  return requiredBoolean(input, field)
}

function transportKind(
  input: unknown,
  field: string
): "stdio" | "streamable_http" {
  if (input !== "stdio" && input !== "streamable_http") {
    throw invalid(field, `${field} is not supported`)
  }
  return input
}

function serverId(input: unknown): string {
  const value = requiredString(input, "serverId", 64)
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/u.test(value)) {
    throw invalid("serverId", "serverId is invalid")
  }
  return value
}

function namedValueName(
  input: unknown,
  transport: "stdio" | "streamable_http",
  field: string
): string {
  const value = requiredString(input, field, 256)
  if (transport === "stdio") {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(value)) {
      throw invalid(field, `${field} is not a valid environment name`)
    }
    return value
  }
  const normalized = value.toLowerCase()
  if (!/^[!#$%&'*+.^_\x60|~0-9a-z-]+$/u.test(normalized)) {
    throw invalid(field, `${field} is not a valid header name`)
  }
  return normalized
}

function credential(input: unknown, field: string): string {
  const value = boundedString(input, field, MAX_CREDENTIAL_BYTES)
  if (value.length === 0) throw invalid(field, `${field} must not be empty`)
  return value
}

function setupId(input: unknown, field: string): string {
  const value = requiredString(input, field, 64)
  if (!/^[A-Za-z0-9_-]{16,64}$/u.test(value)) {
    throw invalid(field, `${field} is invalid`)
  }
  return value
}

function expectedRevision(input: unknown, field: string): number {
  return boundedInteger(input, field, 1, Number.MAX_SAFE_INTEGER)
}

function nullableExpectedRevision(input: unknown, field: string): number | null {
  return input === null ? null : expectedRevision(input, field)
}

function optionalBoundedInteger(
  input: unknown,
  field: string,
  minimum: number,
  maximum: number
): number | undefined {
  if (input === undefined) return undefined
  return boundedInteger(input, field, minimum, maximum)
}

function boundedInteger(
  input: unknown,
  field: string,
  minimum: number,
  maximum: number
): number {
  if (!Number.isSafeInteger(input) || (input as number) < minimum ||
    (input as number) > maximum) {
    throw invalid(field, `${field} is outside the supported range`)
  }
  return input as number
}

function stringArray(
  input: unknown,
  field: string,
  maxItems: number,
  maxItemBytes: number
): readonly string[] {
  if (!Array.isArray(input) || input.length > maxItems) {
    throw invalid(field, `${field} must be a bounded array`)
  }
  return Object.freeze(input.map((value, index) =>
    boundedString(value, `${field}.${index}`, maxItemBytes)
  ))
}

function safeHttpUrl(input: unknown, field: string): string {
  const raw = requiredTrimmedString(input, field, MAX_PATH_BYTES)
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw invalid(field, `${field} must be a valid URL`)
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.hash.length > 0
  ) {
    throw invalid(field, `${field} contains unsupported URL components`)
  }
  return url.toString()
}

function requiredTrimmedString(
  input: unknown,
  field: string,
  maxBytes: number
): string {
  const value = requiredString(input, field, maxBytes)
  if (value !== value.trim()) {
    throw invalid(field, `${field} must not contain outer whitespace`)
  }
  return value
}

function requiredString(input: unknown, field: string, maxBytes: number): string {
  const value = boundedString(input, field, maxBytes)
  if (value.length === 0) throw invalid(field, `${field} must not be empty`)
  return value
}

function boundedString(input: unknown, field: string, maxBytes: number): string {
  if (typeof input !== "string" || input.includes("\0") ||
    Buffer.byteLength(input, "utf8") > maxBytes) {
    throw invalid(field, `${field} is invalid or too long`)
  }
  return input
}

function invalid(field: string, message: string): LocalMcpSettingsValidationError {
  return new LocalMcpSettingsValidationError(field, message)
}
