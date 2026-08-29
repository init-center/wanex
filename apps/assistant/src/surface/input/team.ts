import type {
  AddTeamParticipantRequest,
  CloseTeamConversationRequest,
  CreateTeamConversationRequest,
  ListTeamConversationsRequest,
  SetTeamCoordinatorRequest,
  SubmitTeamRoundRequest,
  UpdateTeamParticipantRequest
} from "../../team/port.js"
import {
  optionalPositiveIntegerField,
  optionalStringField,
  parseRecord,
  parseString,
  SurfaceValidationError
} from "./common.js"

export function parseSurfaceListTeamConversationsRequest(
  input: unknown
): ListTeamConversationsRequest | undefined {
  if (input === undefined) return undefined
  const context = "listTeamConversations input"
  const record = parseRecord(input, context)
  assertFields(record, ["state", "limit"], context)
  const state = record.state
  if (state !== undefined && state !== "open" && state !== "closed") {
    throw new SurfaceValidationError(`${context}.state is not supported`)
  }
  return {
    ...(state === undefined ? {} : { state }),
    ...optionalPositiveIntegerField(record, "limit", context)
  }
}

export function parseSurfaceReadTeamConversationRequest(input: unknown): {
  readonly conversationId?: string
  readonly cursor?: string
  readonly limit?: number
} | undefined {
  if (input === undefined) return undefined
  const context = "readTeamConversation input"
  const record = parseRecord(input, context)
  assertFields(record, ["conversationId", "cursor", "limit"], context)
  return {
    ...optionalStringField(record, "conversationId", context),
    ...optionalStringField(record, "cursor", context),
    ...optionalPositiveIntegerField(record, "limit", context)
  }
}

export function parseSurfaceSelectTeamConversationRequest(input: unknown): {
  readonly conversationId: string
} {
  return requiredConversation(input, "selectTeamConversation")
}

export function parseSurfaceCreateTeamConversationRequest(
  input: unknown
): CreateTeamConversationRequest {
  const context = "createTeamConversation input"
  const record = parseRecord(input, context)
  assertFields(record, ["mode", "title", "idempotencyKey"], context)
  if (record.mode !== "discussion" && record.mode !== "coordinated") {
    throw new SurfaceValidationError(`${context}.mode is not supported`)
  }
  return {
    mode: record.mode,
    idempotencyKey: parseString(
      record.idempotencyKey,
      `${context}.idempotencyKey`
    ),
    ...optionalStringField(record, "title", context)
  }
}

export function parseSurfaceCloseTeamConversationRequest(
  input: unknown
): CloseTeamConversationRequest {
  return requiredConversation(input, "closeTeamConversation")
}

export function parseSurfaceAddTeamParticipantRequest(
  input: unknown
): AddTeamParticipantRequest {
  const context = "addTeamParticipant input"
  const record = parseRecord(input, context)
  assertFields(
    record,
    [
      "conversationId",
      "agentSessionId",
      "displayName",
      "role",
      "idempotencyKey"
    ],
    context
  )
  return {
    conversationId: parseString(
      record.conversationId,
      `${context}.conversationId`
    ),
    agentSessionId: parseString(
      record.agentSessionId,
      `${context}.agentSessionId`
    ),
    idempotencyKey: parseString(
      record.idempotencyKey,
      `${context}.idempotencyKey`
    ),
    ...optionalStringField(record, "displayName", context),
    ...optionalStringField(record, "role", context)
  }
}

export function parseSurfaceUpdateTeamParticipantRequest(
  input: unknown
): UpdateTeamParticipantRequest {
  const context = "updateTeamParticipant input"
  const record = parseRecord(input, context)
  assertFields(record, ["conversationId", "participantId", "state"], context)
  const state = record.state
  if (state !== "active" && state !== "muted" && state !== "left") {
    throw new SurfaceValidationError(`${context}.state is not supported`)
  }
  return {
    conversationId: parseString(
      record.conversationId,
      `${context}.conversationId`
    ),
    participantId: parseString(
      record.participantId,
      `${context}.participantId`
    ),
    state
  }
}

export function parseSurfaceSetTeamCoordinatorRequest(
  input: unknown
): SetTeamCoordinatorRequest {
  const context = "setTeamCoordinator input"
  const record = parseRecord(input, context)
  assertFields(record, [
    "conversationId",
    "expectedCoordinatorParticipantId",
    "coordinatorParticipantId"
  ], context)
  return {
    conversationId: parseString(
      record.conversationId,
      `${context}.conversationId`
    ),
    expectedCoordinatorParticipantId: parseNullableString(
      record.expectedCoordinatorParticipantId,
      `${context}.expectedCoordinatorParticipantId`
    ),
    coordinatorParticipantId: parseNullableString(
      record.coordinatorParticipantId,
      `${context}.coordinatorParticipantId`
    )
  }
}

export function parseSurfaceSubmitTeamRoundRequest(
  input: unknown
): SubmitTeamRoundRequest {
  const context = "submitTeamRound input"
  const record = parseRecord(input, context)
  assertFields(record, ["conversationId", "text", "idempotencyKey"], context)
  return {
    conversationId: parseString(
      record.conversationId,
      `${context}.conversationId`
    ),
    text: parseString(record.text, `${context}.text`),
    idempotencyKey: parseString(
      record.idempotencyKey,
      `${context}.idempotencyKey`
    )
  }
}

function parseNullableString(value: unknown, context: string): string | null {
  return value === null ? null : parseString(value, context)
}

function requiredConversation(
  input: unknown,
  command: "selectTeamConversation" | "closeTeamConversation"
): { readonly conversationId: string } {
  const context = `${command} input`
  const record = parseRecord(input, context)
  assertFields(record, ["conversationId"], context)
  return {
    conversationId: parseString(
      record.conversationId,
      `${context}.conversationId`
    )
  }
}

function assertFields(
  record: Record<string, unknown>,
  allowed: readonly string[],
  context: string
): void {
  const unexpected = Object.keys(record).find((key) => !allowed.includes(key))
  if (unexpected !== undefined) {
    throw new SurfaceValidationError(`${context}.${unexpected} is not supported`)
  }
}
