import type {
  ProductAppBackendCommandPortRequest
} from "@wanex/product-app/backend"
import type {
  ProductAppContinueWorkbenchRequest,
  ProductAppExecuteCommandRequest,
  ProductAppReadExecutionReferenceRequest,
  ProductAppHomeOptions,
  ProductAppLayout,
  ProductAppMode,
  ProductAppOpenWorkbenchRequest,
  ProductAppPreviewCommandInvocationRequest,
  ProductAppRendererPreferences,
  ProductAppStartWorkbenchRequest,
  ProductAppUpdatePreferencesRequest
} from "./types.js"
import type {
  ProductAppSurfaceCommandRequest,
  ProductAppSurfaceError
} from "./types-surface.js"

export function parseProductAppSurfaceRequest(input: unknown):
  | {
      readonly ok: true
      readonly request: ProductAppSurfaceCommandRequest
    }
  | {
      readonly ok: false
      readonly error: ProductAppSurfaceError
    } {
  try {
    const record = parseRecord(input, "surface request")
    const command = parseString(record.command, "surface request.command")
    const requestIdValue = record.requestId
    return {
      ok: true,
      request: {
        command,
        ...("input" in record ? { input: record.input } : {}),
        ...(requestIdValue === undefined
          ? {}
          : {
              requestId: parseString(
                requestIdValue,
                "surface request.requestId"
              )
            })
      }
    }
  } catch (error) {
    return {
      ok: false,
      error: normalizeProductAppSurfaceValidationError(error)
    }
  }
}

export function parseProductAppSurfaceHomeOptions(
  input: unknown
): ProductAppHomeOptions | undefined {
  if (input === undefined) {
    return undefined
  }
  const record = parseRecord(input, "readHome input")
  if (!("overview" in record)) {
    return {}
  }
  const overviewRecord = parseRecord(record.overview, "readHome input.overview")
  const overview: NonNullable<ProductAppHomeOptions["overview"]> = {
    ...optionalNumberField(overviewRecord, "now", "readHome input.overview"),
    ...optionalPositiveIntegerField(
      overviewRecord,
      "recentSessionLimit",
      "readHome input.overview"
    )
  }
  return { overview }
}

export function parseProductAppSurfaceLayout(input: unknown): ProductAppLayout {
  const layout = parseRequiredStringField(input, "layout", "setLayout input")
  if (layout === "single" || layout === "split" || layout === "diagnostics") {
    return layout
  }
  throw new ProductAppSurfaceValidationError(
    "setLayout input.layout is not supported"
  )
}

export function parseProductAppSurfaceSessionSelector(input: unknown): {
  readonly sessionId: string
} {
  return {
    sessionId: parseRequiredStringField(
      input,
      "sessionId",
      "selectSession input"
    )
  }
}

export function parseProductAppSurfaceMode(input: unknown): ProductAppMode {
  const mode = parseRequiredStringField(input, "mode", "setMode input")
  if (mode === "chat" || mode === "workbench" || mode === "diagnostics") {
    return mode
  }
  throw new ProductAppSurfaceValidationError(
    "setMode input.mode is not supported"
  )
}

export function parseProductAppSurfacePreferencesPatch(
  input: unknown
): ProductAppUpdatePreferencesRequest {
  const record = parseRecord(input, "updatePreferences input")
  const preferences = parseRecord(
    record.preferences,
    "updatePreferences input.preferences"
  )
  const patch: Partial<ProductAppRendererPreferences> = {
    ...optionalTheme(preferences),
    ...optionalDensity(preferences)
  }
  return { preferences: patch }
}

export function parseProductAppSurfaceProviderProfileSelector(input: unknown): {
  readonly profileId: string
} {
  return {
    profileId: parseRequiredStringField(
      input,
      "profileId",
      "setActiveProviderProfile input"
    )
  }
}

export function parseProductAppSurfaceProductCommandRequest(
  input: unknown
): ProductAppBackendCommandPortRequest {
  const record = parseRecord(input, "dispatchProductCommand input")
  const command = parseString(
    record.command,
    "dispatchProductCommand input.command"
  )
  return {
    command,
    ...("input" in record ? { input: record.input } : {})
  }
}

export function parseProductAppSurfaceCommandInvocationPreviewRequest(
  input: unknown
): ProductAppPreviewCommandInvocationRequest {
  const record = parseRecord(input, "previewProductCommandInvocation input")
  return {
    commandId: parseString(
      record.commandId,
      "previewProductCommandInvocation input.commandId"
    ),
    ...("input" in record ? { input: record.input } : {})
  }
}

export function parseProductAppSurfaceCommandExecutionRequest(
  input: unknown
): ProductAppExecuteCommandRequest {
  const record = parseRecord(input, "executeProductCommand input")
  return {
    commandId: parseString(
      record.commandId,
      "executeProductCommand input.commandId"
    ),
    ...("input" in record ? { input: record.input } : {})
  }
}

export function parseProductAppSurfaceExecutionReferenceRequest(
  input: unknown
): ProductAppReadExecutionReferenceRequest {
  const record = parseRecord(input, "readExecutionReference input")
  return {
    kind: parseString(
      record.kind,
      "readExecutionReference input.kind"
    ),
    id: parseString(record.id, "readExecutionReference input.id")
  }
}

export function parseProductAppSurfaceJsonBody(input: unknown): string {
  if (typeof input === "string") {
    return input
  }
  return parseRequiredStringField(
    input,
    "body",
    "dispatchProductCommandJson input"
  )
}

export function parseProductAppSurfaceOpenWorkbenchRequest(
  input: unknown
): ProductAppOpenWorkbenchRequest | undefined {
  if (input === undefined) {
    return undefined
  }
  const record = parseRecord(input, "openWorkbench input")
  return {
    ...optionalStringField(record, "sessionId", "openWorkbench input")
  }
}

export function parseProductAppSurfaceContinueWorkbenchRequest(
  input: unknown
): ProductAppContinueWorkbenchRequest {
  const record = parseRecord(input, "continueWorkbench input")
  return {
    text: parseString(record.text, "continueWorkbench input.text"),
    ...optionalStringField(record, "sessionId", "continueWorkbench input"),
    ...optionalStringField(record, "principalId", "continueWorkbench input"),
    ...optionalStringField(record, "inputId", "continueWorkbench input"),
    ...optionalStringField(record, "idempotencyKey", "continueWorkbench input"),
    ...optionalStringField(record, "jobId", "continueWorkbench input"),
    ...optionalStringField(record, "jobIdempotencyKey", "continueWorkbench input")
  }
}

export function parseProductAppSurfaceStartWorkbenchRequest(
  input: unknown
): ProductAppStartWorkbenchRequest {
  const record = parseRecord(input, "startWorkbench input")
  return {
    text: parseString(record.text, "startWorkbench input.text"),
    ...optionalStringField(record, "sessionId", "startWorkbench input"),
    ...optionalStringField(record, "principalId", "startWorkbench input"),
    ...optionalStringField(record, "inputId", "startWorkbench input"),
    ...optionalStringField(record, "idempotencyKey", "startWorkbench input"),
    ...optionalStringField(record, "jobId", "startWorkbench input"),
    ...optionalStringField(record, "jobIdempotencyKey", "startWorkbench input")
  }
}

export function expectProductAppSurfaceNoInput(
  input: unknown,
  command: string
): void {
  if (input !== undefined) {
    throw new ProductAppSurfaceValidationError(`${command} input must be omitted`)
  }
}

export class ProductAppSurfaceValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ProductAppSurfaceValidationError"
  }
}

export function normalizeProductAppSurfaceError(
  error: unknown
): ProductAppSurfaceError {
  if (error instanceof ProductAppSurfaceValidationError) {
    return normalizeProductAppSurfaceValidationError(error)
  }
  return {
    code: "command_error",
    category: "runtime",
    message: "surface command failed; see product diagnostics for details"
  }
}

export function normalizeProductAppSurfaceValidationError(
  error: unknown
): ProductAppSurfaceError {
  return {
    code: "validation_error",
    category: "validation",
    message: error instanceof Error ? error.message : "invalid surface request"
  }
}

export function optionalRequestId(requestId: string | undefined): {
  readonly requestId?: string
} {
  return requestId === undefined ? {} : { requestId }
}

function parseRequiredStringField(
  input: unknown,
  field: string,
  context: string
): string {
  const record = parseRecord(input, context)
  return parseString(record[field], `${context}.${field}`)
}

function parseRecord(
  input: unknown,
  context: string
): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new ProductAppSurfaceValidationError(`${context} must be an object`)
  }
  return input as Record<string, unknown>
}

function parseString(input: unknown, context: string): string {
  if (typeof input !== "string" || input.trim().length === 0) {
    throw new ProductAppSurfaceValidationError(
      `${context} must be a non-empty string`
    )
  }
  return input
}

function optionalStringField(
  record: Record<string, unknown>,
  field: string,
  context: string
): {
  readonly [key: string]: string
} {
  if (!(field in record) || record[field] === undefined) {
    return {}
  }
  return {
    [field]: parseString(record[field], `${context}.${field}`)
  }
}

function optionalNumberField(
  record: Record<string, unknown>,
  field: string,
  context: string
): {
  readonly [key: string]: number
} {
  if (!(field in record) || record[field] === undefined) {
    return {}
  }
  const value = record[field]
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ProductAppSurfaceValidationError(
      `${context}.${field} must be a finite number`
    )
  }
  return { [field]: value }
}

function optionalPositiveIntegerField(
  record: Record<string, unknown>,
  field: string,
  context: string
): {
  readonly [key: string]: number
} {
  if (!(field in record) || record[field] === undefined) {
    return {}
  }
  const value = record[field]
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new ProductAppSurfaceValidationError(
      `${context}.${field} must be a positive integer`
    )
  }
  return { [field]: value }
}

function optionalTheme(
  record: Record<string, unknown>
): Partial<ProductAppRendererPreferences> {
  if (!("theme" in record) || record.theme === undefined) {
    return {}
  }
  const theme = parseString(
    record.theme,
    "updatePreferences input.preferences.theme"
  )
  if (theme === "system" || theme === "light" || theme === "dark") {
    return { theme }
  }
  throw new ProductAppSurfaceValidationError(
    "updatePreferences input.preferences.theme is not supported"
  )
}

function optionalDensity(
  record: Record<string, unknown>
): Partial<ProductAppRendererPreferences> {
  if (!("density" in record) || record.density === undefined) {
    return {}
  }
  const density = parseString(
    record.density,
    "updatePreferences input.preferences.density"
  )
  if (density === "comfortable" || density === "compact") {
    return { density }
  }
  throw new ProductAppSurfaceValidationError(
    "updatePreferences input.preferences.density is not supported"
  )
}
