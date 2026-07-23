import type {
  WanexAppRouteWorkflowEnvelopeResult,
  WanexAppWorkflowEnvelope
} from "@wanex/app"
import type {
  AppDiagnosticsSnapshot,
  SupportBundle
} from "@wanex/app/diagnostics"
import type {
  ProductAppBackendAgentContextMonitorStatus,
  ProductAppBackendAgentContextProfileReloadResult,
  ProductAppBackendCommands,
  ProductAppBackendShutdownResult,
  ProductAppBackendStatus
} from "./types-app.js"
import type {
  ProductAppBackendConversationOperationReceipt
} from "./types-conversation.js"

export interface ProductAppBackendInputCommands {
  routeInput(
    request: ProductAppBackendRouteInputRequest
  ): Promise<ProductAppBackendRouteInputResult>
  routeWorkflowEnvelope(
    request: ProductAppBackendWorkflowEnvelope
  ): Promise<ProductAppBackendRouteInputResult>
}

export interface ProductAppBackendInputRouterCommands
  extends ProductAppBackendCommands {
  routeAppWorkflowEnvelope(
    request: ProductAppBackendAppWorkflowEnvelope
  ): Promise<ProductAppBackendAppRouteWorkflowEnvelopeResult>
}

export interface ProductAppBackendRouteInputRequest {
  readonly text: string
  readonly sessionId?: string
}

export type ProductAppBackendWorkflowEnvelope =
  | ProductAppBackendInteractiveWorkflowEnvelope
  | ProductAppBackendCommandWorkflowEnvelope
  | ProductAppBackendScheduledWorkflowEnvelope
  | ProductAppBackendChannelWorkflowEnvelope
  | ProductAppBackendGuidedFollowUpWorkflowEnvelope
  | ProductAppBackendSideQueryWorkflowEnvelope

export interface ProductAppBackendClassifierHint {
  readonly classifierId: string
  readonly label: string
  readonly confidence: number
}

interface ProductAppBackendWorkflowEnvelopeBase {
  readonly text: string
  readonly sessionId?: string
  readonly classifier?: ProductAppBackendClassifierHint
}

export interface ProductAppBackendInteractiveWorkflowEnvelope
  extends ProductAppBackendWorkflowEnvelopeBase {
  readonly kind: "interactive"
  readonly sourceRef?: string
  readonly gesture?: string
}

export interface ProductAppBackendCommandWorkflowEnvelope
  extends ProductAppBackendWorkflowEnvelopeBase {
  readonly kind: "command"
  readonly sourceRef?: string
}

export interface ProductAppBackendScheduledWorkflowEnvelope
  extends ProductAppBackendWorkflowEnvelopeBase {
  readonly kind: "scheduled"
  readonly scheduleId: string
  readonly tickId: string
  readonly nonOverlap?: boolean
}

export interface ProductAppBackendChannelWorkflowEnvelope
  extends ProductAppBackendWorkflowEnvelopeBase {
  readonly kind: "channel"
  readonly connectorId: string
  readonly eventId: string
  readonly threadRef?: string
}

export interface ProductAppBackendGuidedFollowUpWorkflowEnvelope
  extends ProductAppBackendWorkflowEnvelopeBase {
  readonly kind: "guided_follow_up"
  readonly activeTurnId: string
  readonly sourceRef?: string
}

export interface ProductAppBackendSideQueryWorkflowEnvelope
  extends ProductAppBackendWorkflowEnvelopeBase {
  readonly kind: "side_query"
  readonly sourceRef?: string
  readonly maxOutputTokens?: number
}

export type ProductAppBackendAppWorkflowEnvelope =
  WanexAppWorkflowEnvelope
export type ProductAppBackendAppRouteWorkflowEnvelopeResult =
  WanexAppRouteWorkflowEnvelopeResult

export type ProductAppBackendRouteInputResult =
  | ProductAppBackendRouteAgentResult
  | ProductAppBackendRouteStatusResult
  | ProductAppBackendRouteDiagnosticsResult
  | ProductAppBackendRouteSupportResult
  | ProductAppBackendRouteContextRefreshResult
  | ProductAppBackendRouteContextMonitorResult
  | ProductAppBackendRouteShutdownResult
  | ProductAppBackendRouteWorkflowEnvelopePassThroughResult
  | ProductAppBackendRouteErrorResult

export interface ProductAppBackendRouteAgentResult {
  readonly kind: "agent"
  readonly command: "submitConversationOperation"
  readonly result: ProductAppBackendConversationOperationReceipt
}

export interface ProductAppBackendRouteStatusResult {
  readonly kind: "read_model"
  readonly command: "status"
  readonly result: ProductAppBackendStatus
}

export interface ProductAppBackendRouteDiagnosticsResult {
  readonly kind: "read_model"
  readonly command: "readDiagnostics"
  readonly result: AppDiagnosticsSnapshot
}

export interface ProductAppBackendRouteSupportResult {
  readonly kind: "read_model"
  readonly command: "buildSupportBundle"
  readonly result: SupportBundle
}

export interface ProductAppBackendRouteContextRefreshResult {
  readonly kind: "context"
  readonly command: "refreshAgentContextProfile"
  readonly result: ProductAppBackendAgentContextProfileReloadResult
}

export interface ProductAppBackendRouteContextMonitorResult {
  readonly kind: "context"
  readonly command: "startAgentContextMonitor" | "stopAgentContextMonitor"
  readonly result: ProductAppBackendAgentContextMonitorStatus
}

export interface ProductAppBackendRouteShutdownResult {
  readonly kind: "lifecycle"
  readonly command: "shutdown"
  readonly result: ProductAppBackendShutdownResult
}

export interface ProductAppBackendRouteWorkflowEnvelopePassThroughResult {
  readonly kind: "guided_follow_up" | "side_query"
  readonly command: "queueGuidedFollowUp" | "askSideQuery"
  readonly result: ProductAppBackendAppRouteWorkflowEnvelopeResult extends infer R
    ? R extends { readonly result: infer Result }
      ? Result
      : never
    : never
}

export interface ProductAppBackendRouteErrorResult {
  readonly kind: "error"
  readonly command: "routeInput" | "routeWorkflowEnvelope"
  readonly code: "empty_input" | "unknown_command" | "invalid_arguments"
  readonly message: string
}
