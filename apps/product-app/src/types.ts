import type {
  ProductAppBackendAppOptions,
  ProductAppBackendCommandPortJsonResult,
  ProductAppBackendCommandPortRequest,
  ProductAppBackendCommandInvocationPreview,
  ProductAppBackendCommandInvocationRunnablePreview,
  ProductAppBackendCommandInputValidationDetails,
  ProductAppBackendExecuteCommandResult,
  ProductAppBackendExecutionReferenceReadResult,
  ProductAppBackendReadExecutionReferenceRequest,
  ProductAppBackendCommandRegistryReadModel,
  ProductAppBackendIntegrationContract,
  ProductAppBackendOverviewOptions,
  ProductAppBackendOverviewReadModel,
  ProductAppBackendProviderProfileCommands,
  ProductAppBackendProviderProfileReadModel,
  ProductAppBackendPreviewCommandInvocationRequest,
  ProductAppBackendSafeError,
  ProductAppBackendStatus,
  ProductAppBackendWorkbenchReadModel
} from "@wanex/product-app/backend"
import type {
  ProductAppCancelTrackedConversationOperationRequest,
  ProductAppCancelTrackedConversationOperationResult,
  ProductAppConversationEvents,
  ProductAppReadTrackedConversationOperationRequest,
  ProductAppReadTrackedConversationOperationResult,
  ProductAppRegenerateTrackedConversationOperationRequest,
  ProductAppRegenerateTrackedConversationOperationResult,
  ProductAppSubmitConversationOperationRequest,
  ProductAppSubmitConversationOperationResult,
  ProductAppTrustedConversationOperationReference
} from "./types-conversation.js"
import type {
  ProductAppConversationAttachmentsReadModel,
  ProductAppPrepareConversationAttachmentRequest,
  ProductAppPrepareConversationAttachmentResult,
  ProductAppReadConversationAttachmentsRequest,
  ProductAppRemoveConversationAttachmentRequest,
  ProductAppRemoveConversationAttachmentResult
} from "./types-attachments.js"

export type * from "./types-conversation.js"
export type * from "./types-attachments.js"

export interface ProductAppSafeError
  extends Omit<ProductAppBackendSafeError, "code"> {
  readonly code: ProductAppSafeErrorCode
}

export type ProductAppSafeErrorCode =
  | ProductAppBackendSafeError["code"]
  | "provider_not_ready"

export type ProductAppCommandPortEnvelope<T = unknown> =
  | ProductAppCommandPortSuccessEnvelope<T>
  | ProductAppCommandPortErrorEnvelope

export interface ProductAppCommandPortSuccessEnvelope<T> {
  readonly ok: true
  readonly command: string
  readonly value: T
}

export interface ProductAppCommandPortErrorEnvelope {
  readonly ok: false
  readonly command: string
  readonly error: ProductAppSafeError
}

export type ProductAppCommandPortJsonStatus =
  ProductAppBackendCommandPortJsonResult["status"]

export interface ProductAppCommandPortJsonResult {
  readonly status: ProductAppCommandPortJsonStatus
  readonly body: string
  readonly envelope: ProductAppCommandPortEnvelope
}

export interface ProductAppShellOptions extends ProductAppBackendAppOptions {
  readonly state?: ProductAppInitialState
  readonly stateStore?: ProductAppStateStore
}

export interface ProductAppInitialState {
  readonly selectedSessionId?: string
  readonly layout?: ProductAppLayout
  readonly mode?: ProductAppMode
  readonly preferences?: Partial<ProductAppRendererPreferences>
}

export type ProductAppLayout = "single" | "split" | "diagnostics"
export type ProductAppMode = "chat" | "workbench" | "diagnostics"
export type ProductAppThemePreference = "system" | "light" | "dark"
export type ProductAppDensityPreference = "comfortable" | "compact"

export interface ProductAppRendererPreferences {
  readonly theme: ProductAppThemePreference
  readonly density: ProductAppDensityPreference
}

export interface ProductAppStateSnapshot {
  readonly selectedSessionId?: string
  readonly layout: ProductAppLayout
  readonly mode: ProductAppMode
  readonly preferences: ProductAppRendererPreferences
}

export interface ProductAppStateStore {
  load(): Promise<ProductAppStateStoreLoadResult>
  save(state: ProductAppTrustedStateSnapshot): Promise<void>
}

export type ProductAppStateStoreLoadResult =
  | {
      readonly found: true
      readonly state: ProductAppTrustedStateSnapshot
    }
  | {
      readonly found: false
    }

export interface ProductAppTrustedStateSnapshot {
  readonly ui: ProductAppStateSnapshot
  readonly trackedConversationOperations: Readonly<
    Record<string, ProductAppTrustedConversationOperationReference>
  >
  readonly conversationAttachmentDrafts: Readonly<
    Record<string, readonly import("./types-attachments.js").ProductAppAttachmentDraft[]>
  >
}

export interface ProductAppShellStatus {
  readonly kind: "product-app.status"
  readonly disposed: boolean
  readonly state: ProductAppStateSnapshot
  readonly product: ProductAppBackendStatus
  readonly integrationContractKind: ProductAppBackendIntegrationContract["kind"]
}

export interface ProductAppHomeOptions {
  readonly overview?: ProductAppBackendOverviewOptions
}

export interface ProductAppHomeReadModel {
  readonly kind: "product-app.home"
  readonly state: ProductAppStateSnapshot
  readonly product: ProductAppBackendOverviewReadModel
  readonly providerReadiness: ProductAppProviderReadinessReadModel
  readonly integration: ProductAppBackendIntegrationContract
  readonly rendererBoundary: ProductAppBackendIntegrationContract["rendererBoundary"]
  readonly commandPort: ProductAppCommandPortSummary
}

export type ProductAppProviderReadinessStatus =
  | "ready"
  | "missing_active_profile"
  | "missing_required_credential"

export type ProductAppProviderReadinessReason =
  | "active_profile_ready"
  | "active_profile_missing"
  | "active_profile_missing_credential"

export interface ProductAppProviderReadinessReadModel {
  readonly status: ProductAppProviderReadinessStatus
  readonly reason: ProductAppProviderReadinessReason
  readonly activeProfileId: string
  readonly profileCount: number
  readonly canRun: boolean
  readonly attentionRequired: boolean
  readonly requiresCredential: boolean
  readonly credentialConfigured: boolean
  readonly activeProfile?: ProductAppProviderProfileReadModel
}

export interface ProductAppSettingsReadModel {
  readonly kind: "product-app.settings"
  readonly state: ProductAppStateSnapshot
  readonly profile: ProductAppProfileSummary
  readonly renderer: ProductAppRendererSettings
  readonly privacy: ProductAppSettingsPrivacy
  readonly integration: ProductAppSettingsIntegrationSummary
}

export interface ProductAppProfileSummary {
  readonly configuredProviderProfileId: string
  readonly activeProviderProfileId: string
  readonly agentContextConfigured: boolean
  readonly agentContextRevision: number
}

export interface ProductAppRendererSettings {
  readonly layout: ProductAppLayout
  readonly mode: ProductAppMode
  readonly preferences: ProductAppRendererPreferences
  readonly availableLayouts: readonly ProductAppLayout[]
  readonly availableModes: readonly ProductAppMode[]
  readonly availableThemes: readonly ProductAppThemePreference[]
  readonly availableDensities: readonly ProductAppDensityPreference[]
}

export interface ProductAppSettingsPrivacy {
  readonly exposesStorePath: false
  readonly exposesServiceBinaryPath: false
  readonly exposesSecrets: false
}

export interface ProductAppSettingsIntegrationSummary {
  readonly rendererCalls: ProductAppBackendIntegrationContract["rendererBoundary"]["rendererCalls"]
  readonly rendererMayOpenStorage: false
  readonly rendererMayReceiveStorePath: false
  readonly rendererMayReceiveServiceBinaryPath: false
}

export interface ProductAppCommandPortSummary {
  readonly adapter: "app-owned-command-port"
  readonly commandCount: number
}

export interface ProductAppShell {
  readonly events: ProductAppConversationEvents
  readonly trustedResources: import("@wanex/product-app/backend").ProductAppBackendResourceCommands
  status(): ProductAppShellStatus
  readHome(options?: ProductAppHomeOptions): Promise<ProductAppHomeReadModel>
  readSettings(): ProductAppSettingsReadModel
  selectSession(
    request: ProductAppSelectSessionRequest
  ): Promise<ProductAppStateSnapshot>
  setLayout(request: ProductAppSetLayoutRequest): Promise<ProductAppStateSnapshot>
  setMode(request: ProductAppSetModeRequest): Promise<ProductAppStateSnapshot>
  updatePreferences(
    request: ProductAppUpdatePreferencesRequest
  ): Promise<ProductAppStateSnapshot>
  readonly providerProfiles: ProductAppProviderProfileCommands
  readProductCommands(): ProductAppCommandCatalogReadModel
  dispatchProductCommand(
    request: ProductAppBackendCommandPortRequest
  ): Promise<ProductAppCommandPortEnvelope>
  dispatchProductCommandJson(
    body: unknown
  ): Promise<ProductAppCommandPortJsonResult>
  previewProductCommandInvocation(
    request: ProductAppPreviewCommandInvocationRequest
  ): Promise<ProductAppCommandInvocationPreview>
  executeProductCommand(
    request: ProductAppExecuteCommandRequest
  ): Promise<ProductAppExecuteCommandResult>
  readExecutionReference(
    request: ProductAppReadExecutionReferenceRequest
  ): Promise<ProductAppExecutionReferenceReadResult>
  openWorkbench(
    request?: ProductAppOpenWorkbenchRequest
  ): Promise<ProductAppOpenWorkbenchResult>
  prepareConversationAttachment(
    request: ProductAppPrepareConversationAttachmentRequest
  ): Promise<ProductAppPrepareConversationAttachmentResult>
  readConversationAttachments(
    request?: ProductAppReadConversationAttachmentsRequest
  ): ProductAppConversationAttachmentsReadModel
  removeConversationAttachment(
    request: ProductAppRemoveConversationAttachmentRequest
  ): Promise<ProductAppRemoveConversationAttachmentResult>
  submitConversationOperation(
    request: ProductAppSubmitConversationOperationRequest
  ): Promise<ProductAppSubmitConversationOperationResult>
  readTrackedConversationOperation(
    request?: ProductAppReadTrackedConversationOperationRequest
  ): Promise<ProductAppReadTrackedConversationOperationResult>
  cancelTrackedConversationOperation(
    request: ProductAppCancelTrackedConversationOperationRequest
  ): Promise<ProductAppCancelTrackedConversationOperationResult>
  regenerateTrackedConversationOperation(
    request?: ProductAppRegenerateTrackedConversationOperationRequest
  ): Promise<ProductAppRegenerateTrackedConversationOperationResult>
  dispose(): Promise<void>
}

export type ProductAppProviderProfileCommands =
  ProductAppBackendProviderProfileCommands
export interface ProductAppProviderProfileReadModel {
  readonly id: string
  readonly kind: ProductAppBackendProviderProfileReadModel["kind"]
  readonly providerId: string
  readonly modelId: string
  readonly capabilities: ProductAppBackendProviderProfileReadModel["capabilities"]
  readonly credentialConfigured: boolean
  readonly active: boolean
}
export interface ProductAppProviderProfileListReadModel {
  readonly activeProfileId: string
  readonly profiles: readonly ProductAppProviderProfileReadModel[]
}
export type ProductAppCommandCatalogReadModel =
  ProductAppBackendCommandRegistryReadModel

export interface ProductAppSelectSessionRequest {
  readonly sessionId: string
}

export interface ProductAppSetLayoutRequest {
  readonly layout: ProductAppLayout
}

export interface ProductAppSetModeRequest {
  readonly mode: ProductAppMode
}

export interface ProductAppUpdatePreferencesRequest {
  readonly preferences: Partial<ProductAppRendererPreferences>
}

export type ProductAppPreviewCommandInvocationRequest =
  ProductAppBackendPreviewCommandInvocationRequest

export type ProductAppExecuteCommandRequest =
  ProductAppBackendPreviewCommandInvocationRequest

export type ProductAppReadExecutionReferenceRequest =
  ProductAppBackendReadExecutionReferenceRequest
export type ProductAppExecutionReferenceReadResult =
  ProductAppBackendExecutionReferenceReadResult

export type ProductAppExecuteCommandResult =
  | ProductAppExecuteCommandCompletedResult
  | ProductAppExecuteCommandRejectedResult

export interface ProductAppExecuteCommandCompletedResult {
  readonly kind: "completed"
  readonly commandId: string
  readonly handlerRef: string
  readonly summary: ProductAppCommandExecutionSummary
}

export interface ProductAppCommandExecutionSummary {
  readonly valueKind: string
  readonly message: "Command completed"
  readonly references: readonly ProductAppCommandExecutionReference[]
}

export interface ProductAppCommandExecutionReference {
  readonly kind:
    | "session"
    | "job"
    | "turn"
    | "attempt"
    | "resource"
    | "proposal"
    | "task"
    | "input"
    | "message"
  readonly id: string
}

export interface ProductAppExecuteCommandRejectedResult {
  readonly kind: "rejected"
  readonly commandId: string
  readonly reason:
    | Extract<ProductAppBackendExecuteCommandResult, { readonly kind: "rejected" }>["reason"]
    | "provider_not_ready"
  readonly message: string
  readonly handlerRef?: string
  readonly providerReadiness?: ProductAppProviderReadinessReadModel
  readonly inputValidation?: ProductAppBackendCommandInputValidationDetails
}

export type ProductAppCommandInvocationPreview =
  | ProductAppBackendCommandInvocationPreview
  | ProductAppProviderBlockedCommandInvocationPreview

export interface ProductAppProviderBlockedCommandInvocationPreview {
  readonly kind: "rejected"
  readonly commandId: string
  readonly reason: "provider_not_ready"
  readonly message: string
  readonly handlerRef: string
  readonly command: ProductAppBackendCommandInvocationRunnablePreview["command"]
  readonly providerReadiness: ProductAppProviderReadinessReadModel
}

export interface ProductAppOpenWorkbenchRequest {
  readonly sessionId?: string
}

export type ProductAppOpenWorkbenchResult =
  | ProductAppWorkbenchOpenedResult
  | ProductAppWorkbenchNoSessionResult
  | ProductAppWorkbenchFailedResult

export interface ProductAppWorkbenchOpenedResult {
  readonly kind: "product-app.workbench.opened"
  readonly sessionId: string
  readonly workbench: ProductAppBackendWorkbenchReadModel
}

export interface ProductAppWorkbenchNoSessionResult {
  readonly kind: "product-app.workbench.no-session"
  readonly message: string
}

export interface ProductAppWorkbenchFailedResult {
  readonly kind: "product-app.workbench.failed"
  readonly sessionId?: string
  readonly error: ProductAppSafeError
}
