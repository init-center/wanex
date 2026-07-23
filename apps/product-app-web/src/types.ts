import type {
  ProductAppHomeReadModel,
  ProductAppHomeOptions,
  ProductAppCancelTrackedConversationOperationRequest,
  ProductAppCancelTrackedConversationOperationResult,
  ProductAppAttachmentDraft,
  ProductAppConversationAttachmentsReadModel,
  ProductAppConversationAssistantTextDeltaEvent,
  ProductAppConversationOperationReadModel,
  ProductAppOpenWorkbenchRequest,
  ProductAppOpenWorkbenchResult,
  ProductAppReadTrackedConversationOperationRequest,
  ProductAppReadTrackedConversationOperationResult,
  ProductAppRegenerateTrackedConversationOperationRequest,
  ProductAppRegenerateTrackedConversationOperationResult,
  ProductAppRemoveConversationAttachmentRequest,
  ProductAppProviderProfileListReadModel,
  ProductAppProviderProfileReadModel,
  ProductAppSetLayoutRequest,
  ProductAppSetModeRequest,
  ProductAppSettingsReadModel,
  ProductAppShellStatus,
  ProductAppSubmitConversationOperationRequest,
  ProductAppSubmitConversationOperationResult,
  ProductAppSurfaceClient,
  ProductAppCommandInvocationPreview,
  ProductAppCommandCatalogReadModel,
  ProductAppExecuteCommandRequest,
  ProductAppPreviewCommandInvocationRequest,
  ProductAppSurfaceClientCommandEnvelope,
  ProductAppSurfaceClientDescriptorResult,
  ProductAppSurfaceClientEventsResult,
  ProductAppUpdatePreferencesRequest
} from "@wanex/product-app/surface-client"
import type {
  ProductAppWebCommandInputValidationViewModel,
  ProductAppWebCommandExecutionViewModel,
  ProductAppWebCommandPreviewProviderViewModel
} from "./command-feedback-types.js"
import type {
  ProductAppWebExecutionActivityViewModel,
  ProductAppWebExecutionReferenceRequest
} from "./execution-activity-types.js"
import type {
  ProductAppWebCommandInputViewModel
} from "./command-input-types.js"
import type {
  ProductAppWebCommandCatalogRow,
  ProductAppWebCommandCatalogViewModel
} from "./command-catalog-types.js"

export type * from "./command-feedback-types.js"
export type * from "./execution-activity-types.js"
export type * from "./command-input-types.js"
export type * from "./command-catalog-types.js"

export interface CreateProductAppWebSurfaceOptions {
  readonly client: ProductAppSurfaceClient
  readonly homeOptions?: ProductAppHomeOptions
  readonly eventLimit?: number
  readonly now?: () => number
}

export interface CreateProductAppWebControllerOptions
  extends CreateProductAppWebSurfaceOptions {
  readonly renderHtml?: ProductAppWebHtmlRenderer
  readonly pollAfterAction?: ProductAppWebPollEventsOptions | false
}

export interface ProductAppWebSurface {
  snapshot(): ProductAppWebSnapshot
  refresh(options?: ProductAppHomeOptions): Promise<ProductAppWebSnapshot>
  pollEvents(options?: ProductAppWebPollEventsOptions): Promise<ProductAppWebSnapshot>
  dispatchAction(action: ProductAppWebAction): Promise<ProductAppWebActionResult>
}

export interface ProductAppWebController {
  snapshot(): ProductAppWebSnapshot
  document(): ProductAppWebDocument
  refresh(options?: ProductAppHomeOptions): Promise<ProductAppWebDocument>
  pollEvents(options?: ProductAppWebPollEventsOptions): Promise<ProductAppWebDocument>
  submitActionInput(
    input: unknown,
    options?: ProductAppWebControllerSubmitOptions
  ): Promise<ProductAppWebControllerSubmitResult>
}

export interface ProductAppWebControllerSubmitOptions {
  readonly pollAfterAction?: ProductAppWebPollEventsOptions | false
}

export type ProductAppWebRequestOperation =
  | "document"
  | "refresh"
  | "pollEvents"
  | "submitActionInput"

export type ProductAppWebRequest =
  | ProductAppWebDocumentRequest
  | ProductAppWebRefreshRequest
  | ProductAppWebPollEventsRequest
  | ProductAppWebSubmitActionInputRequest

export interface ProductAppWebRequestBase {
  readonly kind: "product-app-web.request"
  readonly operation: ProductAppWebRequestOperation
  readonly requestId?: string
}

export interface ProductAppWebDocumentRequest
  extends ProductAppWebRequestBase {
  readonly operation: "document"
}

export interface ProductAppWebRefreshRequest extends ProductAppWebRequestBase {
  readonly operation: "refresh"
  readonly homeOptions?: ProductAppHomeOptions
}

export interface ProductAppWebPollEventsRequest
  extends ProductAppWebRequestBase {
  readonly operation: "pollEvents"
  readonly options?: ProductAppWebPollEventsOptions
}

export interface ProductAppWebSubmitActionInputRequest
  extends ProductAppWebRequestBase {
  readonly operation: "submitActionInput"
  readonly input: unknown
  readonly options?: ProductAppWebControllerSubmitOptions
}

export type ProductAppWebResponse =
  | ProductAppWebDocumentResponse
  | ProductAppWebSubmitActionInputResponse
  | ProductAppWebRequestErrorResponse

export interface ProductAppWebDocumentResponse {
  readonly kind: "product-app-web.response"
  readonly ok: true
  readonly operation: Exclude<ProductAppWebRequestOperation, "submitActionInput">
  readonly requestId?: string
  readonly document: ProductAppWebDocument
}

export interface ProductAppWebSubmitActionInputResponse {
  readonly kind: "product-app-web.response"
  readonly ok: true
  readonly operation: "submitActionInput"
  readonly requestId?: string
  readonly document: ProductAppWebDocument
  readonly submitResult: ProductAppWebControllerSubmitResult
}

export interface ProductAppWebRequestErrorResponse {
  readonly kind: "product-app-web.response"
  readonly ok: false
  readonly operation?: string
  readonly requestId?: string
  readonly error: ProductAppWebRequestError
  readonly document: ProductAppWebDocument
}

export interface ProductAppWebRequestError {
  readonly code: ProductAppWebRequestErrorCode
  readonly message: string
  readonly field?: string
}

export type ProductAppWebRequestErrorCode =
  | "invalid_request"
  | "unknown_operation"

export interface ProductAppWebPollEventsOptions {
  readonly limit?: number
}

export interface ProductAppWebDocument {
  readonly kind: "product-app-web.document"
  readonly snapshot: ProductAppWebSnapshot
  readonly html: string
}

export type ProductAppWebHtmlRenderer = (
  snapshot: ProductAppWebSnapshot
) => string

export interface ProductAppWebSnapshot {
  readonly kind: "product-app-web.snapshot"
  readonly generatedAt: number
  readonly descriptor: ProductAppSurfaceClientDescriptorResult
  readonly status: ProductAppSurfaceClientCommandEnvelope<ProductAppShellStatus>
  readonly home: ProductAppSurfaceClientCommandEnvelope<ProductAppHomeReadModel>
  readonly settings: ProductAppSurfaceClientCommandEnvelope<ProductAppSettingsReadModel>
  readonly providerProfiles: ProductAppSurfaceClientCommandEnvelope<ProductAppProviderProfileListReadModel>
  readonly commandCatalog: ProductAppSurfaceClientCommandEnvelope<ProductAppCommandCatalogReadModel>
  readonly events: ProductAppSurfaceClientEventsResult
  readonly eventCursor: number
  readonly operationStatus: ProductAppWebOperationStatusViewModel
  readonly commandPreview: ProductAppWebCommandPreviewViewModel
  readonly commandExecution: ProductAppWebCommandExecutionViewModel
  readonly executionActivity: ProductAppWebExecutionActivityViewModel
  readonly conversation: ProductAppWebConversationViewModel
  readonly attachments: ProductAppSurfaceClientCommandEnvelope<ProductAppConversationAttachmentsReadModel>
  readonly workbench: ProductAppWebWorkbenchViewModel
  readonly diagnostics: readonly ProductAppWebDiagnostic[]
  readonly view: ProductAppWebViewModel
}

export type ProductAppWebOperationStatusState =
  | "idle"
  | "succeeded"
  | "blocked"
  | "failed"

export interface ProductAppWebOperationStatusViewModel {
  readonly kind: "product-app-web.operation-status"
  readonly state: ProductAppWebOperationStatusState
  readonly message: string
  readonly updatedAt?: number
  readonly action?: ProductAppWebAction["type"]
}

export interface ProductAppWebViewModel {
  readonly title: string
  readonly ready: boolean
  readonly mode: string
  readonly layout: string
  readonly selectedSessionId?: string
  readonly selectedSessionTitle?: string
  readonly theme: string
  readonly density: string
  readonly settings: ProductAppWebSettingsViewModel
  readonly sessionCount: number
  readonly recentSessions: readonly ProductAppWebRecentSessionRow[]
  readonly commandCount: number
  readonly productCommandCount: number
  readonly eventCount: number
  readonly workbenchState: ProductAppWebWorkbenchState
  readonly workbenchRowCount: number
  readonly conversationCanSubmit: boolean
  readonly conversationCanCancel: boolean
  readonly conversationCanRegenerate: boolean
  readonly conversationState: ProductAppWebConversationState
  readonly conversationAttachments: readonly ProductAppAttachmentDraft[]
  readonly transientAssistantText?: string
  readonly latestAssistantText?: string
  readonly latestUserText?: string
  readonly operationStatus: ProductAppWebOperationStatusViewModel
  readonly commandPreview: ProductAppWebCommandPreviewViewModel
  readonly commandExecution: ProductAppWebCommandExecutionViewModel
  readonly executionActivity: ProductAppWebExecutionActivityViewModel
  readonly commandCatalog: ProductAppWebCommandCatalogViewModel
  readonly providerRunGate: ProductAppWebProviderRunGateViewModel
  readonly diagnostics: readonly ProductAppWebDiagnostic[]
  readonly actions: readonly ProductAppWebActionDescriptor[]
}

export interface ProductAppWebSettingsViewModel {
  readonly profile: ProductAppWebProfileSettingsViewModel
  readonly renderer: ProductAppWebRendererSettingsViewModel
  readonly privacy: ProductAppWebPrivacySettingsViewModel
  readonly integration: ProductAppWebIntegrationSettingsViewModel
}

export interface ProductAppWebProfileSettingsViewModel {
  readonly configuredProviderProfileId: string
  readonly activeProviderProfileId: string
  readonly agentContextConfigured: boolean
  readonly agentContextRevision: number
  readonly readiness: ProductAppWebProviderReadinessViewModel
  readonly profileCount: number
  readonly profiles: readonly ProductAppWebProviderProfileRow[]
}

export interface ProductAppWebProviderReadinessViewModel {
  readonly status: string
  readonly reason: string
  readonly activeProfileId: string
  readonly profileCount: number
  readonly canRun: boolean
  readonly attentionRequired: boolean
  readonly requiresCredential: boolean
  readonly credentialConfigured: boolean
}

export interface ProductAppWebProviderRunGateViewModel {
  readonly state: "ready" | "blocked"
  readonly status: string
  readonly reason: string
  readonly activeProfileId: string
  readonly canRun: boolean
  readonly canSubmitConversation: boolean
  readonly attentionRequired: boolean
  readonly message: string
}

export interface ProductAppWebProviderProfileRow {
  readonly id: string
  readonly kind: ProductAppProviderProfileReadModel["kind"]
  readonly providerId: string
  readonly modelId: string
  readonly credentialConfigured: boolean
  readonly active: boolean
}

export type ProductAppWebCommandPreviewState =
  | "empty"
  | ProductAppCommandInvocationPreview["kind"]

export interface ProductAppWebCommandPreviewViewModel {
  readonly kind: "product-app-web.command-preview"
  readonly state: ProductAppWebCommandPreviewState
  readonly message: string
  readonly commandId?: string
  readonly commandName?: string
  readonly commandTitle?: string
  readonly handlerRef?: string
  readonly reason?: string
  readonly inputAccepted: boolean
  readonly provider?: ProductAppWebCommandPreviewProviderViewModel
  readonly inputValidation?: ProductAppWebCommandInputValidationViewModel
  readonly updatedAt?: number
}

export interface ProductAppWebRendererSettingsViewModel {
  readonly layout: string
  readonly mode: string
  readonly theme: string
  readonly density: string
  readonly availableLayouts: readonly string[]
  readonly availableModes: readonly string[]
  readonly availableThemes: readonly string[]
  readonly availableDensities: readonly string[]
}

export interface ProductAppWebPrivacySettingsViewModel {
  readonly exposesStorePath: boolean
  readonly exposesServiceBinaryPath: boolean
  readonly exposesSecrets: boolean
}

export interface ProductAppWebIntegrationSettingsViewModel {
  readonly rendererCalls: string
  readonly rendererMayOpenStorage: boolean
  readonly rendererMayReceiveStorePath: boolean
  readonly rendererMayReceiveServiceBinaryPath: boolean
}

export interface ProductAppWebActionDescriptor {
  readonly id: ProductAppWebAction["type"]
  readonly label: string
  readonly mutatesState: boolean
  readonly fields: readonly ProductAppWebActionFieldDescriptor[]
  readonly commandInput?: ProductAppWebCommandActionInputDescriptor
}

export interface ProductAppWebCommandActionInputDescriptor {
  readonly catalogState: ProductAppWebCommandCatalogViewModel["state"]
  readonly commands: readonly ProductAppWebCommandCatalogRow[]
}

export interface ProductAppWebActionFieldDescriptor {
  readonly name: string
  readonly label: string
  readonly required: boolean
  readonly kind: "text" | "textarea" | "select"
  readonly options?: readonly ProductAppWebActionFieldOption[]
}

export interface ProductAppWebActionFieldOption {
  readonly value: string
  readonly label: string
}

export interface ProductAppWebRecentSessionRow {
  readonly sessionId: string
  readonly label: string
  readonly kind: string
  readonly status: string
  readonly createdAt: number
  readonly updatedAt: number
  readonly selected: boolean
  readonly archived: boolean
}

export type ProductAppWebAction =
  | {
      readonly type: "refresh"
    }
  | {
      readonly type: "select-session"
      readonly sessionId: string
    }
  | {
      readonly type: "set-layout"
      readonly input: ProductAppSetLayoutRequest
    }
  | {
      readonly type: "set-mode"
      readonly input: ProductAppSetModeRequest
    }
  | {
      readonly type: "update-preferences"
      readonly input: ProductAppUpdatePreferencesRequest
    }
  | {
      readonly type: "set-active-provider-profile"
      readonly input: {
        readonly profileId: string
      }
    }
  | {
      readonly type: "preview-command"
      readonly input: ProductAppPreviewCommandInvocationRequest
    }
  | {
      readonly type: "execute-command"
      readonly input: ProductAppExecuteCommandRequest
    }
  | {
      readonly type: "refresh-execution"
      readonly input: ProductAppWebExecutionReferenceRequest
    }
  | {
      readonly type: "open-workbench"
      readonly input?: ProductAppOpenWorkbenchRequest
    }
  | {
      readonly type: "submit-conversation"
      readonly input: ProductAppSubmitConversationOperationRequest
    }
  | {
      readonly type: "remove-conversation-attachment"
      readonly input: ProductAppRemoveConversationAttachmentRequest
    }
  | {
      readonly type: "refresh-conversation"
      readonly input?: ProductAppReadTrackedConversationOperationRequest
    }
  | {
      readonly type: "cancel-conversation"
      readonly input: ProductAppCancelTrackedConversationOperationRequest
    }
  | {
      readonly type: "regenerate-conversation"
      readonly input?: ProductAppRegenerateTrackedConversationOperationRequest
    }

export type ProductAppWebWorkbenchSourceResult = ProductAppOpenWorkbenchResult

export type ProductAppWebConversationSourceResult =
  | ProductAppSubmitConversationOperationResult
  | ProductAppReadTrackedConversationOperationResult
  | ProductAppCancelTrackedConversationOperationResult
  | ProductAppRegenerateTrackedConversationOperationResult

export type ProductAppWebConversationState =
  | "idle"
  | "untracked"
  | "missing"
  | "rejected"
  | ProductAppConversationOperationReadModel["state"]

export interface ProductAppWebConversationViewModel {
  readonly kind: "product-app-web.conversation"
  readonly state: ProductAppWebConversationState
  readonly operationId?: string
  readonly sessionId?: string
  readonly message?: string
  readonly operation?: ProductAppConversationOperationReadModel
  readonly transientAssistantText?: string
  readonly canSubmit: boolean
  readonly canCancel: boolean
  readonly canRegenerate: boolean
}

export interface ProductAppWebConversationDeltaBuffer {
  readonly operationId: string
  readonly sessionId: string
  readonly text: string
  readonly truncated: boolean
  readonly lastSequence: number
}

export type ProductAppWebConversationDeltaEvent =
  ProductAppConversationAssistantTextDeltaEvent

export type ProductAppWebWorkbenchState =
  | "idle"
  | "ready"
  | "no-session"
  | "failed"

export interface ProductAppWebWorkbenchViewModel {
  readonly kind: "product-app-web.workbench"
  readonly state: ProductAppWebWorkbenchState
  readonly sessionId?: string
  readonly message?: string
  readonly error?: ProductAppWebWorkbenchError
  readonly summary: ProductAppWebWorkbenchSummary
  readonly provenance: ProductAppWebWorkbenchProvenance
  readonly rows: readonly ProductAppWebWorkbenchTranscriptRow[]
  readonly canOpen: boolean
}

export interface ProductAppWebWorkbenchError {
  readonly code: string
  readonly category: string
  readonly message: string
}

export interface ProductAppWebWorkbenchSummary {
  readonly rowCount: number
  readonly inputCount: number
  readonly messageCount: number
  readonly visibleTextRows: number
  readonly latestUpdatedAt?: number
  readonly latestAssistantText?: string
  readonly latestUserText?: string
  readonly originKinds: readonly string[]
}

export interface ProductAppWebWorkbenchProvenance {
  readonly rowCount: number
  readonly hasProductClientField: boolean
  readonly originKinds: readonly string[]
}

export interface ProductAppWebWorkbenchTranscriptRow {
  readonly id: string
  readonly kind: string
  readonly role: string
  readonly status: string
  readonly createdAt: number
  readonly updatedAt: number
  readonly text: string
  readonly partCount: number
  readonly inputId?: string
  readonly turnId?: string
  readonly attemptId?: string
}

export interface ProductAppWebActionInput {
  readonly action: string
  readonly fields?: Readonly<Record<string, unknown>>
}

export interface ProductAppWebActionInputParseOptions {
  readonly commandCatalog: ProductAppWebCommandCatalogViewModel
}

export type ProductAppWebActionInputParseResult =
  | {
      readonly ok: true
      readonly action: ProductAppWebAction
    }
  | {
      readonly ok: false
      readonly error: ProductAppWebActionInputError
    }

export type ProductAppWebActionInputParseSuccess = Extract<
  ProductAppWebActionInputParseResult,
  { readonly ok: true }
>

export type ProductAppWebActionInputParseFailure = Extract<
  ProductAppWebActionInputParseResult,
  { readonly ok: false }
>

export interface ProductAppWebActionInputError {
  readonly code: ProductAppWebActionInputErrorCode
  readonly message: string
  readonly field?: string
}

export type ProductAppWebActionInputErrorCode =
  | "invalid_input"
  | "unknown_action"
  | "missing_field"
  | "invalid_field"
  | "empty_update"

export type ProductAppWebActionResult =
  | {
      readonly ok: true
      readonly action: ProductAppWebAction["type"]
      readonly snapshot: ProductAppWebSnapshot
    }
  | {
      readonly ok: false
      readonly action: ProductAppWebAction["type"]
      readonly message: string
      readonly snapshot: ProductAppWebSnapshot
    }

export type ProductAppWebActionSuccessResult = Extract<
  ProductAppWebActionResult,
  { readonly ok: true }
>

export type ProductAppWebActionFailureResult = Extract<
  ProductAppWebActionResult,
  { readonly ok: false }
>

export type ProductAppWebControllerSubmitResult =
  | {
      readonly ok: true
      readonly parse: ProductAppWebActionInputParseSuccess
      readonly actionResult: ProductAppWebActionSuccessResult
      readonly document: ProductAppWebDocument
    }
  | {
      readonly ok: false
      readonly parse: ProductAppWebActionInputParseFailure
      readonly document: ProductAppWebDocument
    }
  | {
      readonly ok: false
      readonly parse: ProductAppWebActionInputParseSuccess
      readonly actionResult: ProductAppWebActionFailureResult
      readonly document: ProductAppWebDocument
    }

export interface ProductAppWebDiagnostic {
  readonly code: ProductAppWebDiagnosticCode
  readonly severity: "warning" | "error"
  readonly message: string
}

export type ProductAppWebDiagnosticCode =
  | "product-app-web.descriptor_failed"
  | "product-app-web.status_failed"
  | "product-app-web.home_failed"
  | "product-app-web.settings_failed"
  | "product-app-web.provider_profiles_failed"
  | "product-app-web.command_catalog_failed"
  | "product-app-web.attachments_failed"
  | "product-app-web.events_failed"
  | "product-app-web.action_failed"
