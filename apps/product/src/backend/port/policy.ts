import {
  BACKEND_COMMAND_PORT_COMMANDS
} from "./contract.js"
import { BACKEND_HANDLER_REFS } from "../commands/handlers.js"
import type { BackendShell } from "../shell.js"
import type { BackendCommandPortRequest } from "../model/command-port.js"
import {
  providerNotReadyError,
  projectProviderReadiness
} from "../../provider/readiness.js"
import type {
  CommandInvocationPreview,
  CommandExecutionReference,
  CommandExecutionSummary,
  ExecuteCommandRequest,
  ExecuteCommandResult,
  CommandPortEnvelope,
  CommandPortJsonResult,
  PreviewCommandInvocationRequest,
  ProviderReadinessReadModel
} from "../../model.js"

export async function executeCommandWithPolicy(request: {
  readonly backend: BackendShell
  readonly command: ExecuteCommandRequest
}): Promise<ExecuteCommandResult> {
  const preview = await previewCommandInvocationWithPolicy({
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
): CommandExecutionSummary {
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
): CommandExecutionReference[] {
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

export async function dispatchCommandWithPolicy(request: {
  readonly backend: BackendShell
  readonly command: BackendCommandPortRequest
}): Promise<CommandPortEnvelope> {
  if (
    request.command.command ===
    BACKEND_COMMAND_PORT_COMMANDS.previewProductCommandInvocation
  ) {
    const parsed = parsePreviewCommandInvocationInput(request.command.input)
    if (!parsed.ok) {
      return validationErrorEnvelope(request.command.command, parsed.message)
    }
    return {
      ok: true,
      command: request.command.command,
      value: await previewCommandInvocationWithPolicy({
        backend: request.backend,
        request: parsed.request
      })
    }
  }
  if (await commandRequiresRunnableProvider(request)) {
    const readiness = await readProviderReadiness(request.backend)
    if (!readiness.canRun) {
      return blockedCommandEnvelope(request.command.command, readiness)
    }
  }
  return await request.backend.dispatch(request.command)
}

export async function previewCommandInvocationWithPolicy(request: {
  readonly backend: BackendShell
  readonly request: PreviewCommandInvocationRequest
}): Promise<CommandInvocationPreview> {
  const preview =
    request.backend.commands.previewProductCommandInvocation(request.request)
  if (
    preview.kind !== "runnable" ||
    !handlerRequiresRunnableProvider(preview.handlerRef)
  ) {
    return preview
  }

  const readiness = await readProviderReadiness(request.backend)
  if (readiness.canRun) {
    return preview
  }
  return {
    kind: "rejected",
    commandId: preview.commandId,
    reason: "provider_not_ready",
    message: providerNotReadyError(readiness).message,
    handlerRef: preview.handlerRef,
    command: preview.command,
    providerReadiness: readiness
  }
}

export async function dispatchCommandJsonWithPolicy(request: {
  readonly backend: BackendShell
  readonly body: unknown
}): Promise<CommandPortJsonResult> {
  const command = parseJsonCommandPortRequest(request.body)
  if (command !== undefined) {
    const envelope = await dispatchCommandWithPolicy({
      backend: request.backend,
      command
    })
    if (
      command.command ===
        BACKEND_COMMAND_PORT_COMMANDS.previewProductCommandInvocation ||
      (!envelope.ok && envelope.error.code === "provider_not_ready")
    ) {
      return commandPortJsonResult(envelope)
    }
  }
  return await request.backend.dispatchJson(request.body)
}

async function commandRequiresRunnableProvider(request: {
  readonly backend: BackendShell
  readonly command: BackendCommandPortRequest
}): Promise<boolean> {
  switch (request.command.command) {
    case BACKEND_COMMAND_PORT_COMMANDS.submitConversationOperation:
      return true
    case BACKEND_COMMAND_PORT_COMMANDS.routeInput:
      return routeInputMayRunAgent(request.command.input)
    case BACKEND_COMMAND_PORT_COMMANDS.routeWorkflowEnvelope:
      return workflowEnvelopeMayRunProvider(request.command.input)
    case BACKEND_COMMAND_PORT_COMMANDS.executeProductCommand:
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
  readonly backend: BackendShell
  readonly command: BackendCommandPortRequest
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
    handlerRequiresRunnableProvider(explanation.handler.handlerRef)
  )
}

function handlerRequiresRunnableProvider(handlerRef: string): boolean {
  return (
    handlerRef ===
      BACKEND_HANDLER_REFS.submitConversationOperation
  )
}

function blockedCommandEnvelope(
  command: string,
  readiness: ProviderReadinessReadModel
): CommandPortEnvelope {
  return {
    ok: false,
    command,
    error: providerNotReadyError(readiness)
  }
}

function validationErrorEnvelope(
  command: string,
  message: string
): CommandPortEnvelope {
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

async function readProviderReadiness(
  backend: BackendShell
): Promise<ProviderReadinessReadModel> {
  return projectProviderReadiness(
    await backend.commands.listModelEndpoints()
  )
}

function commandPortJsonResult(
  envelope: CommandPortEnvelope
): CommandPortJsonResult {
  return {
    status: classifyCommandPortJsonStatus(envelope),
    body: JSON.stringify(envelope),
    envelope
  }
}

function classifyCommandPortJsonStatus(
  envelope: CommandPortEnvelope
): CommandPortJsonResult["status"] {
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
): BackendCommandPortRequest | undefined {
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
      readonly request: PreviewCommandInvocationRequest
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
