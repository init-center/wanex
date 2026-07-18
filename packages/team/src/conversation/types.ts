import type {
  AppendTeamTurnRequest,
  EnqueueJobRequest,
  JsonValue,
  MessagePart,
  PrincipalId,
  TeamConversationMode,
  TeamConversationRecord,
  TeamConversationState,
  TeamParticipantKind,
  TeamParticipantRecord,
  TeamParticipantState,
  TeamTurnRecord
} from "@wanex/protocol"
import type { TeamConversationRuntime } from "./runtime.js"
import type { TeamConversationRuntimeStorage } from "./storage.js"

export interface TeamConversationRuntimeOptions {
  readonly storage: TeamConversationRuntimeStorage
  readonly principalId?: PrincipalId
}

export interface CreateTeamConversationRequest {
  readonly id?: string
  readonly principalId?: PrincipalId
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

export interface AddTeamParticipantRequest {
  readonly id?: string
  readonly conversationId: string
  readonly principalId: PrincipalId
  readonly kind: TeamParticipantKind
  readonly displayName?: string
  readonly role?: string
  readonly metadata?: JsonValue
  readonly idempotencyKey?: string
}

export interface AppendTeamMessageRequest {
  readonly id?: string
  readonly conversationId: string
  readonly speakerParticipantId: string
  readonly audienceParticipantIds?: readonly string[]
  readonly kind?: AppendTeamTurnRequest["kind"]
  readonly content: readonly MessagePart[]
  readonly metadata?: JsonValue
}

export interface ListTeamTurnsRequest {
  readonly afterCreatedAt?: number
  readonly afterTurnId?: string
  readonly limit?: number
}

export interface TeamRoundPolicy {
  readonly maxTurns: number
  readonly mode?: TeamConversationMode
  readonly includeParticipantKinds?: readonly TeamParticipantKind[]
  readonly metadata?: JsonValue
}

export interface TeamSpeakerContext {
  readonly conversation: TeamConversationRecord
  readonly speaker: TeamParticipantRecord
  readonly participants: readonly TeamParticipantRecord[]
  readonly turns: readonly TeamTurnRecord[]
  readonly turnIndex: number
}

export interface TeamSpeakerResponse {
  readonly content: readonly MessagePart[]
  readonly audienceParticipantIds?: readonly string[]
  readonly kind?: AppendTeamTurnRequest["kind"]
  readonly metadata?: JsonValue
}

export type TeamSpeakerHandler = (
  context: TeamSpeakerContext
) => Promise<TeamSpeakerResponse | null | undefined> | TeamSpeakerResponse | null | undefined

export type TeamSpeakerHandlers =
  | ReadonlyMap<string, TeamSpeakerHandler>
  | Record<string, TeamSpeakerHandler>

export interface OrchestrateTeamRoundRequest {
  readonly conversationId: string
  readonly policy: TeamRoundPolicy
  readonly speakers: TeamSpeakerHandlers
}

export type TeamRoundStopReason =
  | "max_turns"
  | "conversation_not_open"
  | "no_active_speaker"
  | "speaker_not_registered"
  | "empty_response"

export interface TeamRoundResult {
  readonly conversation: TeamConversationRecord
  readonly turns: readonly TeamTurnRecord[]
  readonly stopReason: TeamRoundStopReason
}

export interface TeamRoundJobPayload {
  readonly conversationId: string
  readonly policy: TeamRoundPolicy
  readonly metadata?: JsonValue
}

export interface SubmitTeamRoundJobRequest extends TeamRoundJobPayload {
  readonly id?: string
  readonly principalId: PrincipalId
  readonly scheduledAt?: number
  readonly notBefore?: number
  readonly priority?: number
  readonly maxAttempts?: number
  readonly retryPolicy?: EnqueueJobRequest["retryPolicy"]
  readonly idempotencyKey?: string
  readonly budgetGrantId?: string
}

export interface TeamRoundJobHandlerOptions {
  readonly runtime: TeamConversationRuntime
  readonly speakers: TeamSpeakerHandlers
}

export interface TeamRoundJobResult {
  readonly conversationId: string
  readonly stopReason: TeamRoundStopReason
  readonly turnIds: readonly string[]
  readonly metadata?: JsonValue
}

export type {
  TeamConversationMode,
  TeamConversationRecord,
  TeamConversationState,
  TeamParticipantKind,
  TeamParticipantRecord,
  TeamParticipantState,
  TeamTurnRecord
}
