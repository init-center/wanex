import type { PluginCapability, PluginInstallState } from "@wanex/protocol"

export type PluginManagementRuntimeState =
  | "loaded"
  | "inactive"
  | "attention_required"

export type PluginManagementSignatureStatus =
  | "unsigned"
  | "verified"
  | "invalid"
  | "unknown"

export type PluginManagementSourceKind =
  | "local"
  | "registry"
  | "archive"
  | "git"
  | "builtin"
  | "unknown"

export type PluginManagementDependencyLoading = "lazy" | "startup"

export type PluginManagementDependencyDistribution =
  | "bundled"
  | "peer"
  | "optional"
  | "external-artifact"

export interface PluginManagementDiagnostic {
  readonly code:
    | "record_invalid"
    | "catalog_refresh_failed"
    | "runtime_not_loaded"
  readonly message: string
}

export interface PluginInstalledVersionSummary {
  readonly pluginId: string
  readonly displayName: string
  readonly version: string
  readonly state: PluginInstallState
  readonly runtimeState: PluginManagementRuntimeState
  readonly capabilities: readonly PluginCapability[]
  readonly sourceKind: PluginManagementSourceKind
  readonly signatureStatus: PluginManagementSignatureStatus
  readonly artifactSha256?: string
  readonly totalBytes?: number
  readonly fileCount?: number
  readonly commandCount: number
  readonly updatedAt: number
  readonly diagnostic?: PluginManagementDiagnostic
}

export interface PluginManagementSnapshot {
  readonly kind: "plugin.management.snapshot"
  readonly revision: string
  readonly installs: readonly PluginInstalledVersionSummary[]
}

export interface PluginManagementUnavailable {
  readonly kind: "assistant.plugin-management.unavailable"
  readonly reason: "not_configured"
  readonly message: string
}

export type PluginManagementReadResult =
  | PluginManagementSnapshot
  | PluginManagementUnavailable

export interface PluginReviewDependencySummary {
  readonly name: string
  readonly distribution: PluginManagementDependencyDistribution
  readonly loading: PluginManagementDependencyLoading
  readonly observedBytes: number
  readonly maxPackedBytes?: number
}

export interface PluginReviewCommandSummary {
  readonly id: string
  readonly title: string
}

export interface LocalPluginReview {
  readonly kind: "plugin.management.local-review"
  readonly reviewId: string
  readonly expiresAt: number
  readonly pluginId: string
  readonly displayName: string
  readonly version: string
  readonly sourceKind: "local"
  readonly signatureStatus: "unsigned"
  readonly artifactSha256: string
  readonly totalBytes: number
  readonly fileCount: number
  readonly capabilities: readonly PluginCapability[]
  readonly commands: readonly PluginReviewCommandSummary[]
  readonly dependencies: readonly PluginReviewDependencySummary[]
}

export type RequestLocalPluginReviewResult =
  | {
      readonly kind: "plugin.management.review-ready"
      readonly review: LocalPluginReview
    }
  | { readonly kind: "plugin.management.review-cancelled" }
  | PluginManagementRejectedResult

export interface ApproveLocalPluginReviewRequest {
  readonly reviewId: string
  readonly reason?: string
}

export interface CancelLocalPluginReviewRequest {
  readonly reviewId: string
}

export interface SetPluginInstallStateRequest {
  readonly pluginId: string
  readonly version: string
  readonly expectedState: PluginInstallState
  readonly state: PluginInstallState
}

export type PluginManagementOperation =
  | "install"
  | "set_state"
  | "retry_refresh"

export interface PluginManagementAppliedResult {
  readonly kind: "plugin.management.applied"
  readonly operation: PluginManagementOperation
  readonly snapshot: PluginManagementSnapshot
  readonly catalogRevision: string
}

export interface PluginManagementAttentionRequiredResult {
  readonly kind: "plugin.management.attention-required"
  readonly operation: PluginManagementOperation
  readonly snapshot: PluginManagementSnapshot
  readonly catalogRevision: string
  readonly diagnostic: {
    readonly code: string
    readonly message: string
  }
}

export interface PluginManagementRejectedResult {
  readonly kind: "plugin.management.rejected"
  readonly reason:
    | "not_configured"
    | "selection_failed"
    | "inspection_failed"
    | "review_failed"
    | "review_capacity_reached"
    | "review_not_found"
    | "review_expired"
    | "review_stale"
    | "install_failed"
    | "install_not_found"
    | "state_conflict"
    | "state_transition_invalid"
    | "invalid_request"
    | "storage_failed"
    | "disposed"
  readonly message: string
}

export type PluginManagementMutationResult =
  | PluginManagementAppliedResult
  | PluginManagementAttentionRequiredResult
  | PluginManagementRejectedResult

export type CancelLocalPluginReviewResult =
  | { readonly kind: "plugin.management.review-cancelled" }
  | PluginManagementRejectedResult

export interface PluginManagementInvalidatedEvent {
  readonly kind: "plugin.management.invalidated"
  readonly sequence: number
  readonly at: number
  readonly revision: string
}

export type PluginManagementEventListener = (
  event: PluginManagementInvalidatedEvent,
) => void

export interface PluginManagementPort {
  read(): Promise<PluginManagementSnapshot>
  requestLocalReview(): Promise<RequestLocalPluginReviewResult>
  approveLocalReview(
    request: ApproveLocalPluginReviewRequest,
  ): Promise<PluginManagementMutationResult>
  cancelLocalReview(
    request: CancelLocalPluginReviewRequest,
  ): Promise<CancelLocalPluginReviewResult>
  setInstallState(
    request: SetPluginInstallStateRequest,
  ): Promise<PluginManagementMutationResult>
  retryRefresh(): Promise<PluginManagementMutationResult>
  subscribe(listener: PluginManagementEventListener): () => void
}

export interface AssistantPluginManagementInvalidatedEvent {
  readonly kind: "assistant.plugin-management.invalidated"
  readonly sequence: number
  readonly at: number
  readonly revision: string
}

export type AssistantPluginManagementEventListener = (
  event: AssistantPluginManagementInvalidatedEvent,
) => void

export interface AssistantPluginManagementEvents {
  subscribePluginManagementEvents(
    listener: AssistantPluginManagementEventListener,
  ): () => void
}

export interface AssistantPluginManagementCommands {
  read(): Promise<PluginManagementReadResult>
  requestLocalReview(): Promise<RequestLocalPluginReviewResult>
  approveLocalReview(
    request: ApproveLocalPluginReviewRequest,
  ): Promise<PluginManagementMutationResult>
  cancelLocalReview(
    request: CancelLocalPluginReviewRequest,
  ): Promise<CancelLocalPluginReviewResult>
  setInstallState(
    request: SetPluginInstallStateRequest,
  ): Promise<PluginManagementMutationResult>
  retryRefresh(): Promise<PluginManagementMutationResult>
}
