import type {
  SessionId,
  SessionInputIntent,
  SessionInputOrigin
} from "@wanex/protocol"
import type {
  WanexAppConversationOperationReceipt
} from "./types-conversation-operation.js"
import type {
  WanexAppAskSideQueryRequest,
  WanexAppAskSideQueryResult,
  WanexAppQueueGuidedFollowUpRequest,
  WanexAppQueueGuidedFollowUpResult
} from "./types-workflow.js"
import type {
  WanexAppScheduledTickResult,
  WanexAppSubmitScheduledTickRequest
} from "./types-schedule.js"

export type WanexAppWorkflowEnvelope =
  | WanexAppInteractiveWorkflowEnvelope
  | WanexAppScheduledWorkflowEnvelope
  | WanexAppChannelWorkflowEnvelope
  | WanexAppGuidedFollowUpWorkflowEnvelope
  | WanexAppSideQueryWorkflowEnvelope

export interface WanexAppWorkflowEnvelopeCommands {
  routeWorkflowEnvelope(
    request: WanexAppWorkflowEnvelope
  ): Promise<WanexAppRouteWorkflowEnvelopeResult>
}

export interface WanexAppClassifierHint {
  readonly classifierId: string
  readonly label: string
  readonly confidence: number
}

interface WanexAppWorkflowEnvelopeBase {
  readonly text: string
  readonly sessionId?: SessionId
  readonly classifier?: WanexAppClassifierHint
}

export interface WanexAppInteractiveWorkflowEnvelope
  extends WanexAppWorkflowEnvelopeBase {
  readonly kind: "interactive"
  readonly sourceRef?: string
  readonly gesture?: string
}

export interface WanexAppScheduledWorkflowEnvelope
  extends WanexAppWorkflowEnvelopeBase {
  readonly kind: "scheduled"
  readonly scheduleId: string
  readonly tickId: string
  readonly nonOverlap?: boolean
}

export interface WanexAppChannelWorkflowEnvelope
  extends WanexAppWorkflowEnvelopeBase {
  readonly kind: "channel"
  readonly connectorId: string
  readonly eventId: string
  readonly threadRef?: string
}

export interface WanexAppGuidedFollowUpWorkflowEnvelope
  extends WanexAppWorkflowEnvelopeBase {
  readonly kind: "guided_follow_up"
  readonly activeTurnId: string
  readonly sourceRef?: string
}

export interface WanexAppSideQueryWorkflowEnvelope
  extends WanexAppWorkflowEnvelopeBase {
  readonly kind: "side_query"
  readonly sourceRef?: string
  readonly maxOutputTokens?: number
}

export interface WanexAppNormalizedWorkflowEnvelope {
  readonly text: string
  readonly sessionId?: SessionId
  readonly agent?: WanexAppNormalizedWorkflowAgentInput
  readonly scheduledTick?: WanexAppSubmitScheduledTickRequest
  readonly guidedFollowUp?: WanexAppQueueGuidedFollowUpRequest
  readonly sideQuery?: WanexAppAskSideQueryRequest
}

export interface WanexAppNormalizedWorkflowAgentInput {
  readonly origin: SessionInputOrigin
  readonly intent?: Extract<SessionInputIntent, "normal">
}

export type WanexAppWorkflowEnvelopeNormalizationResult =
  | WanexAppWorkflowEnvelopeNormalizedResult
  | WanexAppRouteWorkflowEnvelopeErrorResult

export interface WanexAppWorkflowEnvelopeNormalizedResult {
  readonly kind: "normalized"
  readonly envelope: WanexAppNormalizedWorkflowEnvelope
}

export type WanexAppRouteWorkflowEnvelopeResult =
  | WanexAppRouteWorkflowEnvelopeAgentResult
  | WanexAppRouteWorkflowEnvelopeScheduledResult
  | WanexAppRouteWorkflowEnvelopeGuidedFollowUpResult
  | WanexAppRouteWorkflowEnvelopeSideQueryResult
  | WanexAppRouteWorkflowEnvelopeErrorResult

export interface WanexAppRouteWorkflowEnvelopeAgentResult {
  readonly kind: "agent"
  readonly command: "submitConversationOperation"
  readonly result: WanexAppConversationOperationReceipt
}

export interface WanexAppRouteWorkflowEnvelopeScheduledResult {
  readonly kind: "scheduled"
  readonly command: "submitScheduledTick"
  readonly result: WanexAppScheduledTickResult
}

export interface WanexAppRouteWorkflowEnvelopeGuidedFollowUpResult {
  readonly kind: "guided_follow_up"
  readonly command: "queueGuidedFollowUp"
  readonly result: WanexAppQueueGuidedFollowUpResult
}

export interface WanexAppRouteWorkflowEnvelopeSideQueryResult {
  readonly kind: "side_query"
  readonly command: "askSideQuery"
  readonly result: WanexAppAskSideQueryResult
}

export interface WanexAppRouteWorkflowEnvelopeErrorResult {
  readonly kind: "error"
  readonly command: "routeWorkflowEnvelope"
  readonly code: "empty_input" | "invalid_arguments"
  readonly message: string
}
