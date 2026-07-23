import {
  PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS,
  PRODUCT_APP_BACKEND_HANDLER_REFS,
  type ProductAppBackendShell,
  type ProductAppBackendCommandPortRequest
} from "@wanex/product-app/backend"
import {
  productAppProviderNotReadyError,
  projectProductAppProviderReadiness
} from "./provider-readiness.js"
import type {
  ProductAppCommandInvocationPreview,
  ProductAppCommandExecutionReference,
  ProductAppCommandExecutionSummary,
  ProductAppExecuteCommandRequest,
  ProductAppExecuteCommandResult,
  ProductAppCommandPortEnvelope,
  ProductAppCommandPortJsonResult,
  ProductAppPreviewCommandInvocationRequest,
  ProductAppProviderReadinessReadModel
} from "./types.js"

export async function executeProductAppCommandWithPolicy(request: {
  readonly backend: ProductAppBackendShell
  readonly command: ProductAppExecuteCommandRequest
}): Promise<ProductAppExecuteCommandResult> {
  const preview = await previewProductAppCommandInvocationWithPolicy({
    backend: request.backend,
    request: request.command
  })
  if (preview.kind === "rejected") {
    return {
      kind: "rejected",
      commandId: preview.commandId,
      reason: preview.reason,
      message: preview.message,
      ...(preview.handlerRef === undefined
        ? {}
        : { handlerRef: preview.handlerRef }),
      ...("inputValidation" in preview && preview.inputValidation !== undefined
        ? { inputValidation: preview.inputValidation }
        : {}),
      ...("providerReadiness" in preview
        ? { providerReadiness: preview.providerReadiness }
        : {})
    }
  }
  const result = await request.backend.commands.executeProductCommand(
    request.command
  )
  if (result.kind === "rejected") {
    return result
  }
  return {
    kind: "completed",
    commandId: result.commandId,
    handlerRef: result.handlerRef,
    summary: summarizeCommandValue(result.value)
  }
}

const REFERENCE_FIELDS = {
  sessionId: "session",
  jobId: "job",
  turnId: "turn",
  attemptId: "attempt",
  resourceId: "resource",
  proposalId: "proposal",
  taskId: "task",
  inputId: "input",
  messageId: "message"
} as const

function summarizeCommandValue(
  value: unknown
): ProductAppCommandExecutionSummary {
  return {
    valueKind: commandValueKind(value),
    message: "Command completed",
    references: commandValueReferences(value)
  }
}

function commandValueKind(value: unknown): string {
  if (value === null) return "null"
  if (Array.isArray(value)) return "array"
  if (typeof value !== "object") return typeof value
  const kind = (value as Record<string, unknown>).kind
  return typeof kind === "string" && /^[a-zA-Z0-9._-]{1,128}$/.test(kind)
    ? kind
    : "object"
}

function commandValueReferences(
  value: unknown
): ProductAppCommandExecutionReference[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return []
  }
  const record = value as Record<string, unknown>
  return Object.entries(REFERENCE_FIELDS).flatMap(([field, kind]) => {
    const id = record[field]
    return typeof id === "string" && id.length > 0 && id.length <= 512
      ? [{ kind, id }]
      : []
  })
}

export async function dispatchProductAppCommandWithPolicy(request: {
  readonly backend: ProductAppBackendShell
  readonly command: ProductAppBackendCommandPortRequest
}): Promise<ProductAppCommandPortEnvelope> {
  if (
    request.command.command ===
    PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.previewProductCommandInvocation
  ) {
    const parsed = parsePreviewCommandInvocationInput(request.command.input)
    if (!parsed.ok) {
      return validationErrorEnvelope(request.command.command, parsed.message)
    }
    return {
      ok: true,
      command: request.command.command,
      value: await previewProductAppCommandInvocationWithPolicy({
        backend: request.backend,
        request: parsed.request
      })
    }
  }
  if (await productAppCommandRequiresRunnableProvider(request)) {
    const readiness = await readProductAppProviderReadiness(request.backend)
    if (!readiness.canRun) {
      return blockedProductAppCommandEnvelope(request.command.command, readiness)
    }
  }
  return await request.backend.dispatch(request.command)
}

export async function previewProductAppCommandInvocationWithPolicy(request: {
  readonly backend: ProductAppBackendShell
  readonly request: ProductAppPreviewCommandInvocationRequest
}): Promise<ProductAppCommandInvocationPreview> {
  const preview =
    request.backend.commands.previewProductCommandInvocation(request.request)
  if (
    preview.kind !== "runnable" ||
    !productAppHandlerRequiresRunnableProvider(preview.handlerRef)
  ) {
    return preview
  }

  const readiness = await readProductAppProviderReadiness(request.backend)
  if (readiness.canRun) {
    return preview
  }
  return {
    kind: "rejected",
    commandId: preview.commandId,
    reason: "provider_not_ready",
    message: productAppProviderNotReadyError(readiness).message,
    handlerRef: preview.handlerRef,
    command: preview.command,
    providerReadiness: readiness
  }
}

export async function dispatchProductAppCommandJsonWithPolicy(request: {
  readonly backend: ProductAppBackendShell
  readonly body: unknown
}): Promise<ProductAppCommandPortJsonResult> {
  const command = parseJsonCommandPortRequest(request.body)
  if (command !== undefined) {
    const envelope = await dispatchProductAppCommandWithPolicy({
      backend: request.backend,
      command
    })
    if (
      command.command ===
        PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.previewProductCommandInvocation ||
      (!envelope.ok && envelope.error.code === "provider_not_ready")
    ) {
      return productAppCommandPortJsonResult(envelope)
    }
  }
  return await request.backend.dispatchJson(request.body)
}

async function productAppCommandRequiresRunnableProvider(request: {
  readonly backend: ProductAppBackendShell
  readonly command: ProductAppBackendCommandPortRequest
}): Promise<boolean> {
  switch (request.command.command) {
    case PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.submitConversationOperation:
      return true
    case PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.routeInput:
      return routeInputMayRunAgent(request.command.input)
    case PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.routeWorkflowEnvelope:
      return workflowEnvelopeMayRunProvider(request.command.input)
    case PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.executeProductCommand:
      return await executeProductCommandMayRunProvider(request)
    default:
      return false
  }
}

function routeInputMayRunAgent(input: unknown): boolean {
  const text = readStringField(input, "text")?.trim()
  return text !== undefined && text.length > 0 && !text.startsWith("/")
}

function workflowEnvelopeMayRunProvider(input: unknown): boolean {
  if (!isRecord(input)) {
    return false
  }
  const kind = input.kind
  const text = typeof input.text === "string" ? input.text.trim() : undefined
  if (typeof kind !== "string" || text === undefined || text.length === 0) {
    return false
  }
  if (kind === "command") {
    return false
  }
  if (kind === "interactive" && text.startsWith("/")) {
    return false
  }
  return (
    kind === "interactive" ||
    kind === "scheduled" ||
    kind === "channel" ||
    kind === "guided_follow_up" ||
    kind === "side_query"
  )
}

async function executeProductCommandMayRunProvider(request: {
  readonly backend: ProductAppBackendShell
  readonly command: ProductAppBackendCommandPortRequest
}): Promise<boolean> {
  const commandId = readStringField(request.command.input, "commandId")
  if (commandId === undefined) {
    return false
  }
  const explanation =
    request.backend.commands.explainProductCommandContribution({ commandId })
  if (explanation.kind !== "found") {
    return false
  }
  return (
    productAppHandlerRequiresRunnableProvider(explanation.handler.handlerRef)
  )
}

function productAppHandlerRequiresRunnableProvider(handlerRef: string): boolean {
  return (
    handlerRef ===
      PRODUCT_APP_BACKEND_HANDLER_REFS.submitConversationOperation
  )
}

function blockedProductAppCommandEnvelope(
  command: string,
  readiness: ProductAppProviderReadinessReadModel
): ProductAppCommandPortEnvelope {
  return {
    ok: false,
    command,
    error: productAppProviderNotReadyError(readiness)
  }
}

function validationErrorEnvelope(
  command: string,
  message: string
): ProductAppCommandPortEnvelope {
  return {
    ok: false,
    command,
    error: {
      code: "validation_error",
      category: "validation",
      message
    }
  }
}

async function readProductAppProviderReadiness(
  backend: ProductAppBackendShell
): Promise<ProductAppProviderReadinessReadModel> {
  return projectProductAppProviderReadiness(
    await backend.commands.listProviderProfiles()
  )
}

function productAppCommandPortJsonResult(
  envelope: ProductAppCommandPortEnvelope
): ProductAppCommandPortJsonResult {
  return {
    status: classifyProductAppCommandPortJsonStatus(envelope),
    body: JSON.stringify(envelope),
    envelope
  }
}

function classifyProductAppCommandPortJsonStatus(
  envelope: ProductAppCommandPortEnvelope
): ProductAppCommandPortJsonResult["status"] {
  if (envelope.ok) {
    return "success"
  }
  if (envelope.error.code === "unknown_command") {
    return "unknown_command"
  }
  if (
    envelope.error.code === "validation_error" ||
    envelope.error.category === "validation"
  ) {
    return "validation_error"
  }
  return "command_error"
}

function parseJsonCommandPortRequest(
  body: unknown
): ProductAppBackendCommandPortRequest | undefined {
  if (typeof body !== "string") {
    return undefined
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(body) as unknown
  } catch {
    return undefined
  }
  if (!isRecord(parsed) || typeof parsed.command !== "string") {
    return undefined
  }
  return {
    command: parsed.command,
    ...(Object.hasOwn(parsed, "input") ? { input: parsed.input } : {})
  }
}

function parsePreviewCommandInvocationInput(input: unknown):
  | {
      readonly ok: true
      readonly request: ProductAppPreviewCommandInvocationRequest
    }
  | {
      readonly ok: false
      readonly message: string
    } {
  if (!isRecord(input)) {
    return {
      ok: false,
      message: "previewProductCommandInvocation input must be an object"
    }
  }
  if (typeof input.commandId !== "string" || input.commandId.trim().length === 0) {
    return {
      ok: false,
      message:
        "previewProductCommandInvocation input.commandId must be a non-empty string"
    }
  }
  return {
    ok: true,
    request: {
      commandId: input.commandId,
      ...(Object.hasOwn(input, "input") ? { input: input.input } : {})
    }
  }
}

function readStringField(input: unknown, field: string): string | undefined {
  if (!isRecord(input)) {
    return undefined
  }
  const value = input[field]
  return typeof value === "string" ? value : undefined
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input)
}
