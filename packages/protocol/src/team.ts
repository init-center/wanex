import type { JsonValue } from "./json.js"
import type { PrincipalId } from "./ids.js"
import type { MessagePart } from "./message.js"

export type TeamConversationMode = "tl" | "free" | "hybrid"
export type TeamConversationState = "open" | "paused" | "closed" | "cancelled"
export type TeamParticipantKind = "user" | "agent" | "tool" | "system"
export type TeamParticipantState = "active" | "muted" | "left"
export type TeamTurnKind = "message" | "decision" | "handoff" | "system"

export interface TeamConversationRecord {
  readonly id: string
  readonly principalId: PrincipalId
  readonly title?: string
  readonly mode: TeamConversationMode
  readonly state: TeamConversationState
  readonly metadata?: JsonValue
  readonly createdAt: number
  readonly updatedAt: number
  readonly closedAt?: number
}

export interface TeamParticipantRecord {
  readonly id: string
  readonly conversationId: string
  readonly principalId: PrincipalId
  readonly kind: TeamParticipantKind
  readonly displayName?: string
  readonly role?: string
  readonly state: TeamParticipantState
  readonly metadata?: JsonValue
  readonly createdAt: number
  readonly updatedAt: number
}

export interface TeamTurnRecord {
  readonly id: string
  readonly conversationId: string
  readonly speakerParticipantId: string
  readonly audienceParticipantIds?: readonly string[]
  readonly kind: TeamTurnKind
  readonly content: readonly MessagePart[]
  readonly metadata?: JsonValue
  readonly createdAt: number
}

export interface PutTeamConversationRequest {
  readonly id?: string
  readonly principalId: PrincipalId
  readonly title?: string
  readonly mode?: TeamConversationMode
  readonly metadata?: JsonValue
  readonly idempotencyKey?: string
}

export interface ListTeamConversationsRequest {
  readonly principalId?: PrincipalId
  readonly state?: TeamConversationState
  readonly mode?: TeamConversationMode
  readonly limit?: number
}

export interface PutTeamParticipantRequest {
  readonly id?: string
  readonly conversationId: string
  readonly principalId: PrincipalId
  readonly kind: TeamParticipantKind
  readonly displayName?: string
  readonly role?: string
  readonly metadata?: JsonValue
  readonly idempotencyKey?: string
}

export interface ListTeamParticipantsRequest {
  readonly conversationId: string
  readonly state?: TeamParticipantState
}

export interface AppendTeamTurnRequest {
  readonly id?: string
  readonly conversationId: string
  readonly speakerParticipantId: string
  readonly audienceParticipantIds?: readonly string[]
  readonly kind?: TeamTurnKind
  readonly content: readonly MessagePart[]
  readonly metadata?: JsonValue
}

export interface ListTeamTurnsRequest {
  readonly conversationId: string
  readonly afterCreatedAt?: number
  readonly afterTurnId?: string
  readonly limit?: number
}

export interface UpdateTeamConversationStateRequest {
  readonly conversationId: string
  readonly state: TeamConversationState
}

export interface UpdateTeamParticipantStateRequest {
  readonly participantId: string
  readonly state: TeamParticipantState
}
