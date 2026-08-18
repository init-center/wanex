import type {
  BackendDiagnosticsDetailOptions,
  BackendDiagnosticsOptions,
  BackendExecuteCommandRequest,
  BackendOverviewOptions,
  BackendSubmitConversationOperationRequest,
  BackendReadRecentSessionsRequest,
  BackendReadWorkbenchRequest,
  BackendSupportBundleOptions
} from "../model/index.js"

export function parseSubmitConversationOperationInput(
  request: BackendExecuteCommandRequest
): BackendSubmitConversationOperationRequest {
  const input = request.input
  if (!isRecord(input) || typeof input.text !== "string") {
    throw new Error("submitConversationOperation input requires text")
  }
  const text = input.text.trim()
  if (text.length === 0) {
    throw new Error("submitConversationOperation text must not be empty")
  }
  if ([...text].length > 65_536) {
    throw new Error("submitConversationOperation text must not exceed 65536 characters")
  }
  return {
    content: [{ type: "text", text }],
    ...optionalIdentifier(input, "sessionId"),
    ...optionalIdentifier(input, "principalId"),
    ...optionalIdentifier(input, "inputId"),
    ...optionalIdentifier(input, "idempotencyKey"),
    ...optionalIdentifier(input, "jobId"),
    ...optionalIdentifier(input, "expectedTurnId"),
    ...optionalIdentifier(input, "regeneratesTurnId")
  }
}

export function parseDiagnosticsInput(
  request: BackendExecuteCommandRequest
): BackendDiagnosticsOptions | undefined {
  if (request.input === undefined) {
    return undefined
  }
  if (!isRecord(request.input)) {
    throw new Error("readDiagnostics input must be an object")
  }
  return {
    ...optionalFiniteNumber(request.input, "now")
  }
}

export function parseOverviewInput(
  request: BackendExecuteCommandRequest
): BackendOverviewOptions | undefined {
  if (request.input === undefined) {
    return undefined
  }
  if (!isRecord(request.input)) {
    throw new Error("readProductOverview input must be an object")
  }
  return {
    ...optionalFiniteNumber(request.input, "now"),
    ...optionalInteger(request.input, "recentSessionLimit", 1, 100)
  }
}

export function parseDiagnosticsDetailInput(
  request: BackendExecuteCommandRequest
): BackendDiagnosticsDetailOptions | undefined {
  if (request.input === undefined) {
    return undefined
  }
  if (!isRecord(request.input)) {
    throw new Error("readProductDiagnosticsDetail input must be an object")
  }
  return {
    ...optionalFiniteNumber(request.input, "now"),
    ...optionalInteger(request.input, "diagnosticLimit", 0, 200),
    ...optionalInteger(request.input, "activityLimit", 0, 200)
  }
}

export function parseSupportBundleInput(
  request: BackendExecuteCommandRequest
): BackendSupportBundleOptions | undefined {
  if (request.input === undefined) {
    return undefined
  }
  if (!isRecord(request.input)) {
    throw new Error("buildSupportBundle input must be an object")
  }
  return {
    ...optionalFiniteNumber(request.input, "now"),
    ...optionalInteger(request.input, "eventLimit", 1, 1_000),
    ...optionalInteger(request.input, "jobLimit", 1, 1_000)
  }
}

export function parseRecentSessionsInput(
  request: BackendExecuteCommandRequest
): BackendReadRecentSessionsRequest | undefined {
  if (request.input === undefined) {
    return undefined
  }
  if (!isRecord(request.input)) {
    throw new Error("readRecentSessions input must be an object")
  }
  return {
    ...optionalInteger(request.input, "limit", 1, 100)
  }
}

export function parseWorkbenchInput(
  request: BackendExecuteCommandRequest
): BackendReadWorkbenchRequest {
  if (!isRecord(request.input) || typeof request.input.sessionId !== "string") {
    throw new Error("readProductWorkbench input requires sessionId")
  }
  return {
    sessionId: requiredIdentifier(request.input.sessionId, "sessionId")
  }
}

export function parseSessionInputProvenanceInput(
  request: BackendExecuteCommandRequest
): { readonly sessionId: string } {
  if (!isRecord(request.input) || typeof request.input.sessionId !== "string") {
    throw new Error("readSessionInputProvenance input requires sessionId")
  }
  return {
    sessionId: requiredIdentifier(request.input.sessionId, "sessionId")
  }
}

export function parseSessionTranscriptInput(
  request: BackendExecuteCommandRequest
): {
  readonly sessionId: string
  readonly beforeSequence?: number
  readonly limit?: number
} {
  if (!isRecord(request.input) || typeof request.input.sessionId !== "string") {
    throw new Error("readSessionTranscript input requires sessionId")
  }
  return {
    sessionId: requiredIdentifier(request.input.sessionId, "sessionId"),
    ...optionalInteger(request.input, "beforeSequence", 1, Number.MAX_SAFE_INTEGER),
    ...optionalInteger(request.input, "limit", 1, 200)
  }
}

export function parseMonitorInput(
  request: BackendExecuteCommandRequest
): { readonly intervalMs?: number } | undefined {
  if (request.input === undefined) {
    return undefined
  }
  if (!isRecord(request.input)) {
    throw new Error("startAgentContextMonitor input must be an object")
  }
  return {
    ...optionalInteger(request.input, "intervalMs", 100, 86_400_000)
  }
}

export function assertNoInput(
  request: BackendExecuteCommandRequest
): void {
  if (request.input !== undefined) {
    throw new Error(`${request.commandId} does not accept input`)
  }
}

function optionalIdentifier(
  input: Readonly<Record<string, unknown>>,
  key: string
): Record<string, string> {
  const value = input[key]
  if (value === undefined) {
    return {}
  }
  if (typeof value !== "string") {
    throw new Error(`expected ${key} to be a string`)
  }
  return { [key]: requiredIdentifier(value, key) }
}

function requiredIdentifier(value: string, key: string): string {
  const normalized = value.trim()
  if (normalized.length === 0) {
    throw new Error(`${key} must not be empty`)
  }
  if ([...normalized].length > 512) {
    throw new Error(`${key} must not exceed 512 characters`)
  }
  return normalized
}

function optionalFiniteNumber(
  input: Readonly<Record<string, unknown>>,
  key: string
): Record<string, number> {
  const value = input[key]
  if (value === undefined) {
    return {}
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`expected ${key} to be a finite number`)
  }
  return { [key]: value }
}

function optionalInteger(
  input: Readonly<Record<string, unknown>>,
  key: string,
  minimum: number,
  maximum: number
): Record<string, number> {
  const value = input[key]
  if (value === undefined) {
    return {}
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(
      `expected ${key} to be an integer between ${minimum} and ${maximum}`
    )
  }
  return { [key]: value }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
