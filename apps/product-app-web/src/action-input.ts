import type {
  ProductAppWebAction,
  ProductAppWebActionInput,
  ProductAppWebActionInputError,
  ProductAppWebActionInputParseOptions,
  ProductAppWebActionInputParseResult
} from "./types.js"
import {
  decodeProductAppWebCommandInput,
  hasProductAppWebGeneratedCommandFields
} from "./command-input-codec.js"

const LAYOUTS = ["single", "split", "diagnostics"] as const
const MODES = ["chat", "workbench", "diagnostics"] as const
const THEMES = ["system", "light", "dark"] as const
const DENSITIES = ["comfortable", "compact"] as const
const MAX_COMMAND_ID_LENGTH = 512
const MAX_COMMAND_PREVIEW_INPUT_JSON_LENGTH = 20_000
const MAX_CONVERSATION_TEXT_LENGTH = 20_000

type FieldResult<T> =
  | {
      readonly ok: true
      readonly value: T
    }
  | {
      readonly ok: false
      readonly error: ProductAppWebActionInputError
    }

export function parseProductAppWebActionInput(
  input: unknown,
  options?: ProductAppWebActionInputParseOptions
): ProductAppWebActionInputParseResult {
  if (!isActionInput(input)) {
    return invalidInput("action input must be an object with an action string")
  }

  const fields = readFields(input)
  switch (input.action) {
    case "refresh":
      return ok({ type: "refresh" })
    case "select-session":
      return parseSelectSession(fields)
    case "set-layout":
      return parseSetLayout(fields)
    case "set-mode":
      return parseSetMode(fields)
    case "update-preferences":
      return parseUpdatePreferences(fields)
    case "set-active-provider-profile":
      return parseSetActiveProviderProfile(fields)
    case "preview-command":
      return parsePreviewCommand(fields, options)
    case "execute-command":
      return parseExecuteCommand(fields, options)
    case "refresh-execution":
      return parseRefreshExecution(fields)
    case "open-workbench":
      return parseOpenWorkbench(fields)
    case "submit-conversation":
      return parseSubmitConversation(fields)
    case "remove-conversation-attachment":
      return parseRemoveConversationAttachment(fields)
    case "refresh-conversation":
      return parseConversationSessionAction("refresh-conversation", fields)
    case "cancel-conversation":
      return parseCancelConversation(fields)
    case "regenerate-conversation":
      return parseConversationSessionAction("regenerate-conversation", fields)
    default:
      return fail({
        code: "unknown_action",
        message: `unknown Product App Web action: ${input.action}`
      })
  }
}

function parseRefreshExecution(
  fields: Readonly<Record<string, unknown>>
): ProductAppWebActionInputParseResult {
  const kind = readRequiredText(fields, "kind")
  if (!kind.ok) {
    return fail(kind.error)
  }
  const id = readRequiredText(fields, "id")
  if (!id.ok) {
    return fail(id.error)
  }
  return ok({
    type: "refresh-execution",
    input: { kind: kind.value, id: id.value }
  })
}

function parseSelectSession(
  fields: Readonly<Record<string, unknown>>
): ProductAppWebActionInputParseResult {
  const sessionId = readRequiredText(fields, "sessionId")
  if (!sessionId.ok) {
    return fail(sessionId.error)
  }
  return ok({
    type: "select-session",
    sessionId: sessionId.value
  })
}

function parseSetLayout(
  fields: Readonly<Record<string, unknown>>
): ProductAppWebActionInputParseResult {
  const layout = readRequiredEnum(fields, "layout", LAYOUTS)
  if (!layout.ok) {
    return fail(layout.error)
  }
  return ok({
    type: "set-layout",
    input: {
      layout: layout.value
    }
  })
}

function parseSetMode(
  fields: Readonly<Record<string, unknown>>
): ProductAppWebActionInputParseResult {
  const mode = readRequiredEnum(fields, "mode", MODES)
  if (!mode.ok) {
    return fail(mode.error)
  }
  return ok({
    type: "set-mode",
    input: {
      mode: mode.value
    }
  })
}

function parseUpdatePreferences(
  fields: Readonly<Record<string, unknown>>
): ProductAppWebActionInputParseResult {
  const theme = readOptionalEnum(fields, "theme", THEMES)
  if (!theme.ok) {
    return fail(theme.error)
  }
  const density = readOptionalEnum(fields, "density", DENSITIES)
  if (!density.ok) {
    return fail(density.error)
  }
  const preferences = {
    ...(theme.value === undefined ? {} : { theme: theme.value }),
    ...(density.value === undefined ? {} : { density: density.value })
  }
  if (Object.keys(preferences).length === 0) {
    return fail({
      code: "empty_update",
      message: "update-preferences requires theme or density"
    })
  }
  return ok({
    type: "update-preferences",
    input: {
      preferences
    }
  })
}

function parseSetActiveProviderProfile(
  fields: Readonly<Record<string, unknown>>
): ProductAppWebActionInputParseResult {
  const profileId = readRequiredText(fields, "profileId", {
    maxLength: 512
  })
  if (!profileId.ok) {
    return fail(profileId.error)
  }
  return ok({
    type: "set-active-provider-profile",
    input: {
      profileId: profileId.value
    }
  })
}

function parsePreviewCommand(
  fields: Readonly<Record<string, unknown>>,
  options: ProductAppWebActionInputParseOptions | undefined
): ProductAppWebActionInputParseResult {
  const request = parseCommandInvocation(fields, options)
  return request.ok
    ? ok({ type: "preview-command", input: request.value })
    : fail(request.error)
}

function parseExecuteCommand(
  fields: Readonly<Record<string, unknown>>,
  options: ProductAppWebActionInputParseOptions | undefined
): ProductAppWebActionInputParseResult {
  const request = parseCommandInvocation(fields, options)
  return request.ok
    ? ok({ type: "execute-command", input: request.value })
    : fail(request.error)
}

function parseCommandInvocation(
  fields: Readonly<Record<string, unknown>>,
  options: ProductAppWebActionInputParseOptions | undefined
): FieldResult<{ readonly commandId: string; readonly input?: unknown }> {
  const commandId = readRequiredText(fields, "commandId", {
    maxLength: MAX_COMMAND_ID_LENGTH
  })
  if (!commandId.ok) {
    return commandId
  }
  if (options === undefined) {
    return {
      ok: false,
      error: {
        code: "invalid_input",
        field: "commandId",
        message: "command catalog context is required"
      }
    }
  }
  if (options.commandCatalog.state === "ready") {
    const command = options.commandCatalog.rows.find(
      (candidate) => candidate.id === commandId.value
    )
    if (command === undefined) {
      return {
        ok: false,
        error: {
          code: "invalid_field",
          field: "commandId",
          message: "commandId is not present in the current catalog"
        }
      }
    }
    if (command.input.mode === "generated") {
      if (fields.inputJson !== undefined) {
        return {
          ok: false,
          error: {
            code: "invalid_field",
            field: "inputJson",
            message: "raw JSON is not allowed for a schema-backed command"
          }
        }
      }
      const decoded = decodeProductAppWebCommandInput(command.input, fields)
      return decoded.ok
        ? { ok: true, value: { commandId: commandId.value, input: decoded.value } }
        : decoded
    }
    if (command.input.mode === "unsupported") {
      return {
        ok: false,
        error: {
          code: "invalid_field",
          field: "commandId",
          message: command.input.message
        }
      }
    }
  }
  if (hasProductAppWebGeneratedCommandFields(fields)) {
    return {
      ok: false,
      error: {
        code: "invalid_field",
        field: "commandId",
        message: "generated fields are not allowed for a raw-input command"
      }
    }
  }
  const inputJson = readOptionalText(fields, "inputJson", {
    maxLength: MAX_COMMAND_PREVIEW_INPUT_JSON_LENGTH
  })
  if (!inputJson.ok) {
    return inputJson
  }
  if (inputJson.value === undefined) {
    return { ok: true, value: { commandId: commandId.value } }
  }
  try {
    return {
      ok: true,
      value: {
        commandId: commandId.value,
        input: JSON.parse(inputJson.value) as unknown
      }
    }
  } catch {
    return {
      ok: false,
      error: {
        code: "invalid_field",
        field: "inputJson",
        message: "inputJson must be valid JSON"
      }
    }
  }
}

function parseOpenWorkbench(
  fields: Readonly<Record<string, unknown>>
): ProductAppWebActionInputParseResult {
  const sessionId = readOptionalText(fields, "sessionId", {
    maxLength: 512
  })
  if (!sessionId.ok) {
    return fail(sessionId.error)
  }
  return ok({
    type: "open-workbench",
    ...(sessionId.value === undefined
      ? {}
      : {
          input: {
            sessionId: sessionId.value
          }
        })
  })
}

function parseSubmitConversation(
  fields: Readonly<Record<string, unknown>>
): ProductAppWebActionInputParseResult {
  const text = readOptionalText(fields, "text", {
    maxLength: MAX_CONVERSATION_TEXT_LENGTH
  })
  if (!text.ok) {
    return fail(text.error)
  }
  const sessionId = readOptionalText(fields, "sessionId", {
    maxLength: 512
  })
  if (!sessionId.ok) {
    return fail(sessionId.error)
  }
  return ok({
    type: "submit-conversation",
    input: {
      text: text.value ?? "",
      ...(sessionId.value === undefined ? {} : { sessionId: sessionId.value })
    }
  })
}

function parseRemoveConversationAttachment(
  fields: Readonly<Record<string, unknown>>
): ProductAppWebActionInputParseResult {
  const resourceId = readRequiredText(fields, "resourceId", { maxLength: 512 })
  if (!resourceId.ok) return fail(resourceId.error)
  const sessionId = readOptionalText(fields, "sessionId", { maxLength: 512 })
  if (!sessionId.ok) return fail(sessionId.error)
  return ok({
    type: "remove-conversation-attachment",
    input: {
      resourceId: resourceId.value,
      ...(sessionId.value === undefined ? {} : { sessionId: sessionId.value })
    }
  })
}

function parseConversationSessionAction(
  type: "refresh-conversation" | "regenerate-conversation",
  fields: Readonly<Record<string, unknown>>
): ProductAppWebActionInputParseResult {
  const sessionId = readOptionalText(fields, "sessionId", {
    maxLength: 512
  })
  if (!sessionId.ok) {
    return fail(sessionId.error)
  }
  return ok({
    type,
    ...(sessionId.value === undefined
      ? {}
      : { input: { sessionId: sessionId.value } })
  })
}

function parseCancelConversation(
  fields: Readonly<Record<string, unknown>>
): ProductAppWebActionInputParseResult {
  const sessionId = readOptionalText(fields, "sessionId", { maxLength: 512 })
  if (!sessionId.ok) {
    return fail(sessionId.error)
  }
  const reason = readOptionalText(fields, "reason", { maxLength: 512 })
  if (!reason.ok) {
    return fail(reason.error)
  }
  return ok({
    type: "cancel-conversation",
    input: {
      reason: reason.value ?? "user requested cancellation",
      ...(sessionId.value === undefined ? {} : { sessionId: sessionId.value })
    }
  })
}

function readFields(
  input: ProductAppWebActionInput
): Readonly<Record<string, unknown>> {
  return isRecord(input.fields) ? input.fields : {}
}

function readRequiredText(
  fields: Readonly<Record<string, unknown>>,
  field: string,
  options: {
    readonly maxLength?: number
  } = {}
): FieldResult<string> {
  const value = fields[field]
  if (typeof value !== "string") {
    return fieldError({
      code: "missing_field",
      field,
      message: `${field} is required`
    })
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return fieldError({
      code: "invalid_field",
      field,
      message: `${field} must not be empty`
    })
  }
  if (options.maxLength !== undefined && trimmed.length > options.maxLength) {
    return fieldError({
      code: "invalid_field",
      field,
      message: `${field} must be at most ${options.maxLength} characters`
    })
  }
  return { ok: true, value: trimmed }
}

function readOptionalText(
  fields: Readonly<Record<string, unknown>>,
  field: string,
  options: {
    readonly maxLength?: number
  } = {}
): FieldResult<string | undefined> {
  const value = fields[field]
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: undefined }
  }
  if (typeof value !== "string") {
    return fieldError({
      code: "invalid_field",
      field,
      message: `${field} must be a string`
    })
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return { ok: true, value: undefined }
  }
  if (options.maxLength !== undefined && trimmed.length > options.maxLength) {
    return fieldError({
      code: "invalid_field",
      field,
      message: `${field} must be at most ${options.maxLength} characters`
    })
  }
  return { ok: true, value: trimmed }
}

function readRequiredEnum<const T extends readonly string[]>(
  fields: Readonly<Record<string, unknown>>,
  field: string,
  allowed: T
): FieldResult<T[number]> {
  const value = fields[field]
  if (typeof value !== "string") {
    return fieldError({
      code: "missing_field",
      field,
      message: `${field} is required`
    })
  }
  return readEnumValue(value, field, allowed)
}

function readOptionalEnum<const T extends readonly string[]>(
  fields: Readonly<Record<string, unknown>>,
  field: string,
  allowed: T
): FieldResult<T[number] | undefined> {
  const value = fields[field]
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: undefined }
  }
  if (typeof value !== "string") {
    return fieldError({
      code: "invalid_field",
      field,
      message: `${field} must be a string`
    })
  }
  return readEnumValue(value, field, allowed)
}

function readEnumValue<const T extends readonly string[]>(
  value: string,
  field: string,
  allowed: T
): FieldResult<T[number]> {
  const trimmed = value.trim()
  if ((allowed as readonly string[]).includes(trimmed)) {
    return {
      ok: true,
      value: trimmed as T[number]
    }
  }
  return fieldError({
    code: "invalid_field",
    field,
    message: `${field} must be one of: ${allowed.join(", ")}`
  })
}

function ok(action: ProductAppWebAction): ProductAppWebActionInputParseResult {
  return {
    ok: true,
    action
  }
}

function invalidInput(message: string): ProductAppWebActionInputParseResult {
  return fail({
    code: "invalid_input",
    message
  })
}

function fail(
  error: ProductAppWebActionInputError
): ProductAppWebActionInputParseResult {
  return {
    ok: false,
    error
  }
}

function fieldError(error: ProductAppWebActionInputError): FieldResult<never> {
  return {
    ok: false,
    error
  }
}

function isActionInput(value: unknown): value is ProductAppWebActionInput {
  return (
    isRecord(value) &&
    typeof value.action === "string" &&
    value.action.trim().length > 0 &&
    (value.fields === undefined || isRecord(value.fields))
  )
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
