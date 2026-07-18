import {
  type AppendTeamTurnRequest,
  type JsonValue,
  type ListTeamConversationsRequest,
  type ListTeamParticipantsRequest,
  type ListTeamTurnsRequest,
  type PutTeamConversationRequest,
  type PutTeamParticipantRequest,
  type TeamConversationRecord,
  type TeamParticipantRecord,
  type TeamTurnRecord,
  type UpdateTeamConversationStateRequest,
  type UpdateTeamParticipantStateRequest
} from "@wanex/protocol"

import {
  expectNumber,
  expectOptionalStringArray,
  expectString,
  isRecord,
  messagePartsFromJson,
  messagePartsToJson,
  optionalNumber,
  optionalString,
  withOptionalFields
} from "./codec-helpers.js"
import {
  expectTeamConversationMode,
  expectTeamConversationState,
  expectTeamParticipantKind,
  expectTeamParticipantState,
  expectTeamTurnKind
} from "./codec-team-enums.js"
import { toRpcJsonValue } from "./codec-common.js"
import type {
  AppendTeamTurnWire,
  ListTeamConversationsWire,
  ListTeamParticipantsWire,
  ListTeamTurnsWire,
  PutTeamConversationWire,
  PutTeamParticipantWire,
  UpdateTeamConversationStateWire,
  UpdateTeamParticipantStateWire
} from "./generated/storage-rpc.js"

export function toRpcPutTeamConversationRequest(
  request: PutTeamConversationRequest
): PutTeamConversationWire {
  return {
    id: request.id ?? null,
    principal_id: request.principalId,
    title: request.title ?? null,
    mode: request.mode ?? null,
    metadata: toRpcJsonValue(request.metadata ?? null),
    idempotency_key: request.idempotencyKey ?? null
  }
}

export function toRpcListTeamConversationsRequest(
  request: ListTeamConversationsRequest
): ListTeamConversationsWire {
  return {
    principal_id: request.principalId ?? null,
    state: request.state ?? null,
    mode: request.mode ?? null,
    limit: request.limit ?? null
  }
}

export function toRpcUpdateTeamConversationStateRequest(
  request: UpdateTeamConversationStateRequest
): UpdateTeamConversationStateWire {
  return {
    conversation_id: request.conversationId,
    state: request.state
  }
}

export function toRpcPutTeamParticipantRequest(
  request: PutTeamParticipantRequest
): PutTeamParticipantWire {
  return {
    id: request.id ?? null,
    conversation_id: request.conversationId,
    principal_id: request.principalId,
    kind: request.kind,
    display_name: request.displayName ?? null,
    role: request.role ?? null,
    metadata: toRpcJsonValue(request.metadata ?? null),
    idempotency_key: request.idempotencyKey ?? null
  }
}

export function toRpcListTeamParticipantsRequest(
  request: ListTeamParticipantsRequest
): ListTeamParticipantsWire {
  return {
    conversation_id: request.conversationId,
    state: request.state ?? null
  }
}

export function toRpcUpdateTeamParticipantStateRequest(
  request: UpdateTeamParticipantStateRequest
): UpdateTeamParticipantStateWire {
  return {
    participant_id: request.participantId,
    state: request.state
  }
}

export function toRpcAppendTeamTurnRequest(
  request: AppendTeamTurnRequest
): AppendTeamTurnWire {
  return {
    id: request.id ?? null,
    conversation_id: request.conversationId,
    speaker_participant_id: request.speakerParticipantId,
    audience_participant_ids: request.audienceParticipantIds?.slice() ?? null,
    kind: request.kind ?? null,
    content: messagePartsToJson(request.content),
    metadata: toRpcJsonValue(request.metadata ?? null)
  }
}

export function toRpcListTeamTurnsRequest(
  request: ListTeamTurnsRequest
): ListTeamTurnsWire {
  return {
    conversation_id: request.conversationId,
    after_created_at: request.afterCreatedAt ?? null,
    after_turn_id: request.afterTurnId ?? null,
    limit: request.limit ?? null
  }
}

export function fromRpcTeamConversationRecord(
  value: JsonValue
): TeamConversationRecord {
  if (!isRecord(value)) {
    throw new Error("team conversation must be an object")
  }
  return withOptionalFields(
    {
      id: expectString(value.id, "team_conversation.id"),
      principalId: expectString(
        value.principal_id,
        "team_conversation.principal_id"
      ),
      mode: expectTeamConversationMode(value.mode),
      state: expectTeamConversationState(value.state),
      createdAt: expectNumber(value.created_at, "team_conversation.created_at"),
      updatedAt: expectNumber(value.updated_at, "team_conversation.updated_at")
    },
    {
      title: optionalString(value.title, "team_conversation.title"),
      metadata: value.metadata ?? undefined,
      closedAt: optionalNumber(value.closed_at, "team_conversation.closed_at")
    }
  )
}

export function fromRpcTeamParticipantRecord(
  value: JsonValue
): TeamParticipantRecord {
  if (!isRecord(value)) {
    throw new Error("team participant must be an object")
  }
  return withOptionalFields(
    {
      id: expectString(value.id, "team_participant.id"),
      conversationId: expectString(
        value.conversation_id,
        "team_participant.conversation_id"
      ),
      principalId: expectString(
        value.principal_id,
        "team_participant.principal_id"
      ),
      kind: expectTeamParticipantKind(value.kind),
      state: expectTeamParticipantState(value.state),
      createdAt: expectNumber(value.created_at, "team_participant.created_at"),
      updatedAt: expectNumber(value.updated_at, "team_participant.updated_at")
    },
    {
      displayName: optionalString(
        value.display_name,
        "team_participant.display_name"
      ),
      role: optionalString(value.role, "team_participant.role"),
      metadata: value.metadata ?? undefined
    }
  )
}

export function fromRpcTeamTurnRecord(value: JsonValue): TeamTurnRecord {
  if (!isRecord(value)) {
    throw new Error("team turn must be an object")
  }
  return withOptionalFields(
    {
      id: expectString(value.id, "team_turn.id"),
      conversationId: expectString(
        value.conversation_id,
        "team_turn.conversation_id"
      ),
      speakerParticipantId: expectString(
        value.speaker_participant_id,
        "team_turn.speaker_participant_id"
      ),
      kind: expectTeamTurnKind(value.kind),
      content: messagePartsFromJson(value.content),
      createdAt: expectNumber(value.created_at, "team_turn.created_at")
    },
    {
      audienceParticipantIds: expectOptionalStringArray(
        value.audience_participant_ids,
        "team_turn.audience_participant_ids"
      ),
      metadata: value.metadata ?? undefined
    }
  )
}
