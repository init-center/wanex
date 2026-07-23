import type {
  ProductAppBackendDiagnosticsDetailOptions,
  ProductAppBackendDiagnosticsOptions,
  ProductAppBackendExecuteCommandRequest,
  ProductAppBackendOverviewOptions,
  ProductAppBackendSubmitConversationOperationRequest,
  ProductAppBackendReadRecentSessionsRequest,
  ProductAppBackendReadWorkbenchRequest,
  ProductAppBackendSupportBundleOptions
} from "./types.js"

export function parseSubmitConversationOperationInput(
  request: ProductAppBackendExecuteCommandRequest
): ProductAppBackendSubmitConversationOperationRequest {
  const input = request.input
  if (typeof input === "string") {
    const text = input.trim()
    if (text.length === 0) {
      throw new Error("submitConversationOperation text must not be empty")
    }
    return { content: [{ type: "text", text }] }
  }
  if (!isRecord(input) || typeof input.text !== "string") {
    throw new Error("submitConversationOperation input requires text")
  }
  const text = input.text.trim()
  if (text.length === 0) {
    throw new Error("submitConversationOperation text must not be empty")
  }
  return {
    content: [{ type: "text", text }],
    ...optionalString(input, "sessionId"),
    ...optionalString(input, "principalId"),
    ...optionalString(input, "inputId"),
    ...optionalString(input, "idempotencyKey"),
    ...optionalString(input, "jobId"),
    ...optionalString(input, "expectedTurnId"),
    ...optionalString(input, "regeneratesTurnId")
  }
}

export function parseDiagnosticsInput(
  request: ProductAppBackendExecuteCommandRequest
): ProductAppBackendDiagnosticsOptions | undefined {
  if (request.input === undefined) {
    return undefined
  }
  if (!isRecord(request.input)) {
    throw new Error("readDiagnostics input must be an object")
  }
  return {
    ...optionalNumber(request.input, "now")
  }
}

export function parseOverviewInput(
  request: ProductAppBackendExecuteCommandRequest
): ProductAppBackendOverviewOptions | undefined {
  if (request.input === undefined) {
    return undefined
  }
  if (!isRecord(request.input)) {
    throw new Error("readProductOverview input must be an object")
  }
  return {
    ...optionalNumber(request.input, "now"),
    ...optionalNumber(request.input, "recentSessionLimit")
  }
}

export function parseDiagnosticsDetailInput(
  request: ProductAppBackendExecuteCommandRequest
): ProductAppBackendDiagnosticsDetailOptions | undefined {
  if (request.input === undefined) {
    return undefined
  }
  if (!isRecord(request.input)) {
    throw new Error("readProductDiagnosticsDetail input must be an object")
  }
  return {
    ...optionalNumber(request.input, "now"),
    ...optionalNumber(request.input, "diagnosticLimit"),
    ...optionalNumber(request.input, "activityLimit")
  }
}

export function parseSupportBundleInput(
  request: ProductAppBackendExecuteCommandRequest
): ProductAppBackendSupportBundleOptions | undefined {
  if (request.input === undefined) {
    return undefined
  }
  if (!isRecord(request.input)) {
    throw new Error("buildSupportBundle input must be an object")
  }
  return {
    ...optionalNumber(request.input, "now"),
    ...optionalNumber(request.input, "eventLimit"),
    ...optionalNumber(request.input, "jobLimit")
  }
}

export function parseRecentSessionsInput(
  request: ProductAppBackendExecuteCommandRequest
): ProductAppBackendReadRecentSessionsRequest | undefined {
  if (request.input === undefined) {
    return undefined
  }
  if (!isRecord(request.input)) {
    throw new Error("readRecentSessions input must be an object")
  }
  return {
    ...optionalNumber(request.input, "limit")
  }
}

export function parseWorkbenchInput(
  request: ProductAppBackendExecuteCommandRequest
): ProductAppBackendReadWorkbenchRequest {
  if (!isRecord(request.input) || typeof request.input.sessionId !== "string") {
    throw new Error("readProductWorkbench input requires sessionId")
  }
  if (request.input.sessionId.trim().length === 0) {
    throw new Error("sessionId must not be empty")
  }
  return {
    sessionId: request.input.sessionId
  }
}

export function parseSessionInputProvenanceInput(
  request: ProductAppBackendExecuteCommandRequest
): { readonly sessionId: string } {
  if (!isRecord(request.input) || typeof request.input.sessionId !== "string") {
    throw new Error("readSessionInputProvenance input requires sessionId")
  }
  if (request.input.sessionId.trim().length === 0) {
    throw new Error("sessionId must not be empty")
  }
  return {
    sessionId: request.input.sessionId
  }
}

export function parseSessionTranscriptInput(
  request: ProductAppBackendExecuteCommandRequest
): { readonly sessionId: string } {
  if (!isRecord(request.input) || typeof request.input.sessionId !== "string") {
    throw new Error("readSessionTranscript input requires sessionId")
  }
  if (request.input.sessionId.trim().length === 0) {
    throw new Error("sessionId must not be empty")
  }
  return {
    sessionId: request.input.sessionId
  }
}

export function parseMonitorInput(
  request: ProductAppBackendExecuteCommandRequest
): { readonly intervalMs?: number } | undefined {
  if (request.input === undefined) {
    return undefined
  }
  if (!isRecord(request.input)) {
    throw new Error("startAgentContextMonitor input must be an object")
  }
  return {
    ...optionalNumber(request.input, "intervalMs")
  }
}

export function assertNoInput(
  request: ProductAppBackendExecuteCommandRequest
): void {
  if (request.input !== undefined) {
    throw new Error(`${request.commandId} does not accept input`)
  }
}

function optionalString(
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
  return { [key]: value }
}

function optionalNumber(
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

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
