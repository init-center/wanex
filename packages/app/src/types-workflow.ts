import type {
  JsonValue,
  MessagePart,
  RunControlPolicy,
  RuntimeAbortSignal,
  SchedulerJobState,
  SessionId,
  SessionInputIntent,
  SessionInputOriginKind
} from "@wanex/protocol"
import type {
  WanexAppRouteWorkflowEnvelopeResult,
  WanexAppWorkflowEnvelope
} from "./types-workflow-envelope.js"

export interface WanexAppWorkflowCommands {
  queueGuidedFollowUp(
    request: WanexAppQueueGuidedFollowUpRequest
  ): Promise<WanexAppQueueGuidedFollowUpResult>
  askSideQuery(
    request: WanexAppAskSideQueryRequest
  ): Promise<WanexAppAskSideQueryResult>
  routeWorkflowEnvelope(
    request: WanexAppWorkflowEnvelope
  ): Promise<WanexAppRouteWorkflowEnvelopeResult>
}

export interface WanexAppQueueGuidedFollowUpRequest {
  readonly sessionId: SessionId
  readonly activeTurnId: string
  readonly text: string
  readonly principalId?: string
  readonly inputId?: string
  readonly turnId?: string
  readonly idempotencyKey?: string
  readonly jobId?: string
  readonly jobIdempotencyKey?: string
  readonly sourceRef?: string
}

export interface WanexAppQueueGuidedFollowUpResult {
  readonly sessionId: SessionId
  readonly activeTurnId: string
  readonly modelEndpointId: string
  readonly input: WanexAppQueuedInputSummary
  readonly job: WanexAppQueuedJobSummary
  readonly receipt: import("./types-conversation-operation.js").WanexAppConversationOperationReceipt
}

export interface WanexAppQueuedInputSummary {
  readonly inputId: string
  readonly status: "admitted"
  readonly intent: Extract<SessionInputIntent, "follow_up">
  readonly originKind: Extract<SessionInputOriginKind, "interactive">
  readonly sourceRef: string
  readonly parentRef: string
  readonly runControlPolicy: Extract<RunControlPolicy, "queue_after_current">
  readonly expectedTurnId: string
}

export interface WanexAppQueuedJobSummary {
  readonly jobId: string
  readonly kind: "session.turn"
  readonly state: SchedulerJobState
  readonly modelEndpointId: string
}

export interface WanexAppAskSideQueryRequest {
  readonly question: string | readonly MessagePart[]
  readonly sessionId?: SessionId
  readonly principalId?: string
  readonly sourceRef?: string
  readonly maxOutputTokens?: number
  readonly expectedModelEndpointId?: string
  readonly signal?: RuntimeAbortSignal
}

export interface WanexAppAskSideQueryResult {
  readonly sessionId?: SessionId
  readonly answerText: string
  readonly output: readonly MessagePart[]
  readonly telemetry: Readonly<Record<string, JsonValue>>
  readonly persisted: false
  readonly modelEndpointId: string
}
