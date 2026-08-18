import type {
  WanexAppRouteWorkflowEnvelopeResult,
  WanexAppWorkflowEnvelope
} from "@wanex/app"
import type {
  AppDiagnosticsSnapshot,
  SupportBundle
} from "@wanex/app/diagnostics"
import type {
  BackendAgentContextMonitorStatus,
  BackendAgentContextProfileReloadResult,
  BackendCommands,
  BackendShutdownResult,
  BackendStatus
} from "./app.js"
import type {
  BackendConversationOperationReceipt
} from "./conversation.js"

export interface BackendInputCommands {
  routeInput(
    request: BackendRouteInputRequest
  ): Promise<BackendRouteInputResult>
  routeWorkflowEnvelope(
    request: BackendWorkflowEnvelope
  ): Promise<BackendRouteInputResult>
}

export interface BackendInputRouterCommands
  extends BackendCommands {
  routeAppWorkflowEnvelope(
    request: WanexAppWorkflowEnvelope
  ): Promise<WanexAppRouteWorkflowEnvelopeResult>
}

export interface BackendRouteInputRequest {
  readonly text: string
  readonly sessionId?: string
}

export type BackendWorkflowEnvelope =
  | BackendCommandWorkflowEnvelope
  | WanexAppWorkflowEnvelope

export interface BackendCommandWorkflowEnvelope {
  readonly kind: "command"
  readonly text: string
  readonly sessionId?: string
  readonly sourceRef?: string
}

export type BackendRouteInputResult =
  | BackendRouteAgentResult
  | BackendRouteStatusResult
  | BackendRouteDiagnosticsResult
  | BackendRouteSupportResult
  | BackendRouteContextRefreshResult
  | BackendRouteContextMonitorResult
  | BackendRouteShutdownResult
  | Exclude<WanexAppRouteWorkflowEnvelopeResult, { readonly kind: "error" }>
  | BackendRouteErrorResult

export interface BackendRouteAgentResult {
  readonly kind: "agent"
  readonly command: "submitConversationOperation"
  readonly result: BackendConversationOperationReceipt
}

export interface BackendRouteStatusResult {
  readonly kind: "read_model"
  readonly command: "status"
  readonly result: BackendStatus
}

export interface BackendRouteDiagnosticsResult {
  readonly kind: "read_model"
  readonly command: "readDiagnostics"
  readonly result: AppDiagnosticsSnapshot
}

export interface BackendRouteSupportResult {
  readonly kind: "read_model"
  readonly command: "buildSupportBundle"
  readonly result: SupportBundle
}

export interface BackendRouteContextRefreshResult {
  readonly kind: "context"
  readonly command: "refreshAgentContextProfile"
  readonly result: BackendAgentContextProfileReloadResult
}

export interface BackendRouteContextMonitorResult {
  readonly kind: "context"
  readonly command: "startAgentContextMonitor" | "stopAgentContextMonitor"
  readonly result: BackendAgentContextMonitorStatus
}

export interface BackendRouteShutdownResult {
  readonly kind: "lifecycle"
  readonly command: "shutdown"
  readonly result: BackendShutdownResult
}

export interface BackendRouteErrorResult {
  readonly kind: "error"
  readonly command: "routeInput" | "routeWorkflowEnvelope"
  readonly code: "empty_input" | "unknown_command" | "invalid_arguments"
  readonly message: string
}
