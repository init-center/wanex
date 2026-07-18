import type {
  SessionId,
  SessionInputIntent,
  SessionInputOrigin
} from "@wanex/protocol"
import type {
  WanexAppShellRunAgentTurnResult
} from "./types-agent.js"
import type {
  WanexAppShellAskSideQueryRequest,
  WanexAppShellAskSideQueryResult,
  WanexAppShellQueueGuidedFollowUpRequest,
  WanexAppShellQueueGuidedFollowUpResult
} from "./types-workflow.js"

export type WanexAppShellWorkflowEnvelope =
  | WanexAppShellInteractiveWorkflowEnvelope
  | WanexAppShellScheduledWorkflowEnvelope
  | WanexAppShellChannelWorkflowEnvelope
  | WanexAppShellGuidedFollowUpWorkflowEnvelope
  | WanexAppShellSideQueryWorkflowEnvelope

export interface WanexAppShellWorkflowEnvelopeCommands {
  routeWorkflowEnvelope(
    request: WanexAppShellWorkflowEnvelope
  ): Promise<WanexAppShellRouteWorkflowEnvelopeResult>
}

export interface WanexAppShellClassifierHint {
  readonly classifierId: string
  readonly label: string
  readonly confidence: number
}

interface WanexAppShellWorkflowEnvelopeBase {
  readonly text: string
  readonly sessionId?: SessionId
  readonly classifier?: WanexAppShellClassifierHint
}

export interface WanexAppShellInteractiveWorkflowEnvelope
  extends WanexAppShellWorkflowEnvelopeBase {
  readonly kind: "interactive"
  readonly sourceRef?: string
  readonly gesture?: string
}

export interface WanexAppShellScheduledWorkflowEnvelope
  extends WanexAppShellWorkflowEnvelopeBase {
  readonly kind: "scheduled"
  readonly scheduleId: string
  readonly tickId: string
  readonly nonOverlap?: boolean
}

export interface WanexAppShellChannelWorkflowEnvelope
  extends WanexAppShellWorkflowEnvelopeBase {
  readonly kind: "channel"
  readonly connectorId: string
  readonly eventId: string
  readonly threadRef?: string
}

export interface WanexAppShellGuidedFollowUpWorkflowEnvelope
  extends WanexAppShellWorkflowEnvelopeBase {
  readonly kind: "guided_follow_up"
  readonly activeRunId: string
  readonly sourceRef?: string
}

export interface WanexAppShellSideQueryWorkflowEnvelope
  extends WanexAppShellWorkflowEnvelopeBase {
  readonly kind: "side_query"
  readonly sourceRef?: string
  readonly maxOutputTokens?: number
}

export interface WanexAppShellNormalizedWorkflowEnvelope {
  readonly text: string
  readonly sessionId?: SessionId
  readonly agent?: WanexAppShellNormalizedWorkflowAgentInput
  readonly guidedFollowUp?: WanexAppShellQueueGuidedFollowUpRequest
  readonly sideQuery?: WanexAppShellAskSideQueryRequest
}

export interface WanexAppShellNormalizedWorkflowAgentInput {
  readonly origin: SessionInputOrigin
  readonly intent?: Extract<SessionInputIntent, "normal">
  readonly runControlPolicy?: never
  readonly expectedRunId?: never
}

export type WanexAppShellWorkflowEnvelopeNormalizationResult =
  | WanexAppShellWorkflowEnvelopeNormalizedResult
  | WanexAppShellRouteWorkflowEnvelopeErrorResult

export interface WanexAppShellWorkflowEnvelopeNormalizedResult {
  readonly kind: "normalized"
  readonly envelope: WanexAppShellNormalizedWorkflowEnvelope
}

export type WanexAppShellRouteWorkflowEnvelopeResult =
  | WanexAppShellRouteWorkflowEnvelopeAgentResult
  | WanexAppShellRouteWorkflowEnvelopeGuidedFollowUpResult
  | WanexAppShellRouteWorkflowEnvelopeSideQueryResult
  | WanexAppShellRouteWorkflowEnvelopeErrorResult

export interface WanexAppShellRouteWorkflowEnvelopeAgentResult {
  readonly kind: "agent"
  readonly command: "runAgentTurn"
  readonly result: WanexAppShellRunAgentTurnResult
}

export interface WanexAppShellRouteWorkflowEnvelopeGuidedFollowUpResult {
  readonly kind: "guided_follow_up"
  readonly command: "queueGuidedFollowUp"
  readonly result: WanexAppShellQueueGuidedFollowUpResult
}

export interface WanexAppShellRouteWorkflowEnvelopeSideQueryResult {
  readonly kind: "side_query"
  readonly command: "askSideQuery"
  readonly result: WanexAppShellAskSideQueryResult
}

export interface WanexAppShellRouteWorkflowEnvelopeErrorResult {
  readonly kind: "error"
  readonly command: "routeWorkflowEnvelope"
  readonly code: "empty_input" | "invalid_arguments"
  readonly message: string
}
