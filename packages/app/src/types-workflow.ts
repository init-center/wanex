import type {
  JsonValue,
  MessagePart,
  RunControlPolicy,
  SchedulerJobState,
  SessionId,
  SessionInputIntent,
  SessionInputOriginKind,
  SubmitSessionRunReceipt
} from "@wanex/protocol"
import type {
  WanexAppShellRouteWorkflowEnvelopeResult,
  WanexAppShellWorkflowEnvelope
} from "./types-workflow-envelope.js"

export interface WanexAppShellWorkflowCommands {
  queueGuidedFollowUp(
    request: WanexAppShellQueueGuidedFollowUpRequest
  ): Promise<WanexAppShellQueueGuidedFollowUpResult>
  askSideQuery(
    request: WanexAppShellAskSideQueryRequest
  ): Promise<WanexAppShellAskSideQueryResult>
  routeWorkflowEnvelope(
    request: WanexAppShellWorkflowEnvelope
  ): Promise<WanexAppShellRouteWorkflowEnvelopeResult>
}

export interface WanexAppShellQueueGuidedFollowUpRequest {
  readonly sessionId: SessionId
  readonly activeRunId: string
  readonly text: string
  readonly principalId?: string
  readonly inputId?: string
  readonly idempotencyKey?: string
  readonly jobId?: string
  readonly jobIdempotencyKey?: string
  readonly sourceRef?: string
}

export interface WanexAppShellQueueGuidedFollowUpResult {
  readonly sessionId: SessionId
  readonly activeRunId: string
  readonly providerProfileId: string
  readonly input: WanexAppShellQueuedInputSummary
  readonly job: WanexAppShellQueuedJobSummary
  readonly receipt: SubmitSessionRunReceipt
}

export interface WanexAppShellQueuedInputSummary {
  readonly inputId: string
  readonly status: "admitted"
  readonly intent: Extract<SessionInputIntent, "follow_up">
  readonly originKind: Extract<SessionInputOriginKind, "interactive">
  readonly sourceRef: string
  readonly parentRef: string
  readonly runControlPolicy: Extract<RunControlPolicy, "queue_after_current">
  readonly expectedRunId: string
}

export interface WanexAppShellQueuedJobSummary {
  readonly jobId: string
  readonly kind: "session.run"
  readonly state: SchedulerJobState
  readonly providerProfileId: string
}

export interface WanexAppShellAskSideQueryRequest {
  readonly question: string | readonly MessagePart[]
  readonly sessionId?: SessionId
  readonly principalId?: string
  readonly sourceRef?: string
  readonly maxOutputTokens?: number
}

export interface WanexAppShellAskSideQueryResult {
  readonly sessionId?: SessionId
  readonly answerText: string
  readonly output: readonly MessagePart[]
  readonly telemetry: Readonly<Record<string, JsonValue>>
  readonly persisted: false
  readonly providerProfileId: string
}
