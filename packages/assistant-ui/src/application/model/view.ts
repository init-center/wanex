import type {
  HomeReadModel,
  CancelTrackedConversationOperationResult,
  AttachmentDraft,
  ConversationAttachmentsReadModel,
  ConversationAssistantTextDeltaEvent,
  ConversationOperationReadModel,
  OpenWorkbenchResult,
  PendingGuidedFollowUpReadModel,
  QueueGuidedFollowUpResult,
  SteerTrackedConversationOperationResult,
  ReadTrackedConversationOperationResult,
  SessionTranscriptReadResult,
  RegenerateTrackedConversationOperationResult,
  ResolveTrackedConversationApprovalResult,
  ResolveTrackedConversationRecoveryResult,
  ModelEndpointListReadModel,
  ModelEndpointReadModel,
  SettingsReadModel,
  SideQueryReadModel,
  ReadSideQueryResult,
  ShellStatus,
  SubmitConversationOperationResult,
  CommandInvocationPreview,
  CommandCatalogReadModel,
  SurfaceClientCommandEnvelope,
  SurfaceClientDescriptorResult,
  SurfaceClientEventsResult,
  ExecutePlanProposalResult,
  PlanGenerationReadModel,
  ReadPlanGenerationResult,
  ReadPlanProposalResult,
  GoalReadModel,
  ReadGoalResult,
  TeamConversationListReadModel
} from "@wanex/assistant/surface"
import type {
  ScheduleDefinitionReadResult,
  ScheduleListReadModel,
  ScheduleMutationResult,
} from "@wanex/assistant"
import type {
  CancelLocalPluginReviewResult,
  PluginInstalledVersionSummary,
  PluginManagementMutationResult,
  PluginManagementReadResult,
  RequestLocalPluginReviewResult
} from "@wanex/assistant/plugin-management"
import type {
  CommandInputValidationViewModel,
  CommandExecutionViewModel,
  CommandPreviewProviderViewModel
} from "../commands/execution/model.js"
import type {
  ExecutionActivityViewModel
} from "../execution/model.js"
import type {
  CommandPaletteItem,
  CommandPaletteViewModel
} from "../commands/palette/model.js"
import type { Action } from "./actions.js"
import type { TeamViewModel } from "../team/model.js"

export interface Snapshot {
  readonly kind: "web.snapshot"
  readonly generatedAt: number
  readonly descriptor: SurfaceClientDescriptorResult
  readonly status: SurfaceClientCommandEnvelope<ShellStatus>
  readonly home: SurfaceClientCommandEnvelope<HomeReadModel>
  readonly settings: SurfaceClientCommandEnvelope<SettingsReadModel>
  readonly modelEndpoints: SurfaceClientCommandEnvelope<ModelEndpointListReadModel>
  readonly commandCatalog: SurfaceClientCommandEnvelope<CommandCatalogReadModel>
  readonly pluginManagement: SurfaceClientCommandEnvelope<PluginManagementReadResult>
  readonly scheduleList: SurfaceClientCommandEnvelope<ScheduleListReadModel>
  readonly events: SurfaceClientEventsResult
  readonly eventStreamId?: string
  readonly eventCursor: number
  readonly operationStatus: OperationStatusViewModel
  readonly commandPreview: CommandPreviewViewModel
  readonly commandExecution: CommandExecutionViewModel
  readonly executionActivity: ExecutionActivityViewModel
  readonly conversation: ConversationViewModel
  readonly sideQuery: SideQueryViewModel
  readonly plan: PlanViewModel
  readonly goal: GoalViewModel
  readonly teamList: SurfaceClientCommandEnvelope<TeamConversationListReadModel>
  readonly team: TeamViewModel
  readonly attachments: SurfaceClientCommandEnvelope<ConversationAttachmentsReadModel>
  readonly workbench: WorkbenchViewModel
  readonly diagnostics: readonly Diagnostic[]
  readonly view: ViewModel
}

export type OperationStatusState =
  | "idle"
  | "succeeded"
  | "blocked"
  | "failed"

export interface OperationStatusViewModel {
  readonly kind: "web.operation-status"
  readonly state: OperationStatusState
  readonly message: string
  readonly updatedAt?: number
  readonly action?: Action["type"]
}

export interface ViewModel {
  readonly title: string
  readonly ready: boolean
  readonly mode: string
  readonly layout: string
  readonly selection?: ShellStatus["state"]["selection"]
  readonly selectedSessionTitle?: string
  readonly theme: string
  readonly density: string
  readonly settings: SettingsViewModel
  readonly sessionCount: number
  readonly recentSessions: readonly RecentSessionRow[]
  readonly archivedSessions: readonly RecentSessionRow[]
  readonly commandCount: number
  readonly commandPaletteCount: number
  readonly eventCount: number
  readonly workbenchState: WorkbenchState
  readonly workbenchRowCount: number
  readonly conversationCanSubmit: boolean
  readonly conversationCanQueueFollowUp: boolean
  readonly conversationCanSteer: boolean
  readonly conversationCanCancel: boolean
  readonly conversationCanRegenerate: boolean
  readonly conversationState: ConversationState
  readonly sideQueryCanStart: boolean
  readonly sideQueryState: SideQueryState
  readonly planGenerationState: PlanGenerationState
  readonly planProposalState?: string
  readonly planCanGenerate: boolean
  readonly goalState: GoalState
  readonly goalCanStart: boolean
  readonly groupCount: number
  readonly teamState: TeamViewModel["state"]
  readonly teamCanSubmit: boolean
  readonly team: TeamViewModel
  readonly conversationAttachments: readonly AttachmentDraft[]
  readonly conversationAttachmentCanUpload: boolean
  readonly conversationAttachmentAccept: string
  readonly conversationAttachmentMessage: string
  readonly transientAssistantText?: string
  readonly latestAssistantText?: string
  readonly latestUserText?: string
  readonly operationStatus: OperationStatusViewModel
  readonly commandPreview: CommandPreviewViewModel
  readonly commandExecution: CommandExecutionViewModel
  readonly executionActivity: ExecutionActivityViewModel
  readonly commandPalette: CommandPaletteViewModel
  readonly providerRunGate: ProviderRunGateViewModel
  readonly diagnostics: readonly Diagnostic[]
  readonly actions: readonly ActionDescriptor[]
}

export interface SettingsViewModel {
  readonly profile: ProfileSettingsViewModel
  readonly renderer: RendererSettingsViewModel
  readonly privacy: PrivacySettingsViewModel
  readonly integration: IntegrationSettingsViewModel
  readonly plugins: PluginSettingsViewModel
  readonly schedules: ScheduleSettingsViewModel
}

export type ScheduleSettingsState = "ready" | "unavailable" | "failed"

export interface ScheduleSettingsViewModel {
  readonly state: ScheduleSettingsState
  readonly schedules: ScheduleListReadModel["schedules"]
  readonly availability?: ScheduleListReadModel["availability"]
  readonly message?: string
}

export type PluginSettingsState = "ready" | "unavailable" | "failed"

export interface PluginSettingsViewModel {
  readonly state: PluginSettingsState
  readonly revision?: string
  readonly installs: readonly PluginInstalledVersionSummary[]
  readonly message?: string
}

export interface ProfileSettingsViewModel {
  readonly activeModelEndpointId?: string
  readonly agentContextConfigured: boolean
  readonly agentContextRevision: number
  readonly readiness: ProviderReadinessViewModel
  readonly endpointCount: number
  readonly endpoints: readonly ModelEndpointRow[]
}

export interface ProviderReadinessViewModel {
  readonly status: string
  readonly reason: string
  readonly activeEndpointId?: string
  readonly endpointCount: number
  readonly canRun: boolean
  readonly attentionRequired: boolean
  readonly requiresCredential: boolean
  readonly credentialConfigured: boolean
}

export interface ProviderRunGateViewModel {
  readonly state: "ready" | "blocked"
  readonly status: string
  readonly reason: string
  readonly activeEndpointId?: string
  readonly canRun: boolean
  readonly canSubmitConversation: boolean
  readonly attentionRequired: boolean
  readonly message: string
}

export interface ModelEndpointRow {
  readonly id: string
  readonly connection: ModelEndpointReadModel["connection"]
  readonly protocol: ModelEndpointReadModel["protocol"]
  readonly model: ModelEndpointReadModel["model"]
  readonly credentialConfigured: boolean
  readonly active: boolean
}

export type CommandPreviewState =
  | "empty"
  | CommandInvocationPreview["kind"]

export interface CommandPreviewViewModel {
  readonly kind: "web.command-preview"
  readonly state: CommandPreviewState
  readonly message: string
  readonly commandId?: string
  readonly commandName?: string
  readonly commandTitle?: string
  readonly handlerRef?: string
  readonly reason?: string
  readonly inputAccepted: boolean
  readonly provider?: CommandPreviewProviderViewModel
  readonly inputValidation?: CommandInputValidationViewModel
  readonly updatedAt?: number
}

export interface RendererSettingsViewModel {
  readonly layout: string
  readonly mode: string
  readonly theme: string
  readonly density: string
  readonly availableLayouts: readonly string[]
  readonly availableModes: readonly string[]
  readonly availableThemes: readonly string[]
  readonly availableDensities: readonly string[]
}

export interface PrivacySettingsViewModel {
  readonly exposesStorePath: boolean
  readonly exposesServiceBinaryPath: boolean
  readonly exposesSecrets: boolean
}

export interface IntegrationSettingsViewModel {
  readonly rendererCalls: string
  readonly rendererMayOpenStorage: boolean
  readonly rendererMayReceiveStorePath: boolean
  readonly rendererMayReceiveServiceBinaryPath: boolean
}

export interface ActionDescriptor {
  readonly id: Action["type"]
  readonly label: string
  readonly mutatesState: boolean
  readonly fields: readonly ActionFieldDescriptor[]
  readonly commandInput?: CommandActionInputDescriptor
}

export interface CommandActionInputDescriptor {
  readonly paletteState: CommandPaletteViewModel["state"]
  readonly commands: readonly CommandPaletteItem[]
}

export interface ActionFieldDescriptor {
  readonly name: string
  readonly label: string
  readonly required: boolean
  readonly kind: "text" | "textarea" | "select"
  readonly options?: readonly ActionFieldOption[]
}

export interface ActionFieldOption {
  readonly value: string
  readonly label: string
}

export interface RecentSessionRow {
  readonly sessionId: string
  readonly label: string
  readonly kind: string
  readonly status: string
  readonly revision: number
  readonly createdAt: number
  readonly updatedAt: number
  readonly selected: boolean
  readonly archived: boolean
}

export type WorkbenchSourceResult = OpenWorkbenchResult

export type ConversationSourceResult =
  | SubmitConversationOperationResult
  | QueueGuidedFollowUpResult
  | SteerTrackedConversationOperationResult
  | ReadTrackedConversationOperationResult
  | CancelTrackedConversationOperationResult
  | RegenerateTrackedConversationOperationResult
  | ResolveTrackedConversationApprovalResult
  | ResolveTrackedConversationRecoveryResult

export type SideQuerySourceResult =
  | SideQueryReadModel
  | ReadSideQueryResult
  | {
      readonly kind: "assistant.side-query.dismissed"
      readonly queryId: string
    }

export type SideQueryState =
  | "idle"
  | SideQueryReadModel["state"]

export interface SideQueryViewModel {
  readonly kind: "web.side-query"
  readonly state: SideQueryState
  readonly queryId?: string
  readonly sessionId?: string
  readonly question?: string
  readonly answerText?: string
  readonly answerTruncated?: boolean
  readonly errorMessage?: string
  readonly startedAt?: number
  readonly updatedAt?: number
  readonly finishedAt?: number
}

export type PlanGenerationState =
  | "idle"
  | PlanGenerationReadModel["state"]

export interface PlanViewModel {
  readonly kind: "web.plan"
  readonly generation?: PlanGenerationReadModel
  readonly proposal: ReadPlanProposalResult
}

export type PlanSourceResult =
  | PlanGenerationReadModel
  | ReadPlanGenerationResult
  | ReadPlanProposalResult
  | ExecutePlanProposalResult

export type GoalState =
  | "unavailable"
  | "no-session"
  | "missing"
  | GoalReadModel["state"]

export interface GoalViewModel {
  readonly kind: "web.goal"
  readonly state: GoalState
  readonly sessionId?: string
  readonly goal?: GoalReadModel
  readonly message?: string
}

export type GoalSourceResult =
  | ReadGoalResult
  | GoalReadModel

export type ConversationState =
  | "idle"
  | "untracked"
  | "missing"
  | "rejected"
  | ConversationOperationReadModel["state"]

export interface ConversationViewModel {
  readonly kind: "web.conversation"
  readonly state: ConversationState
  readonly operationId?: string
  readonly sessionId?: string
  readonly message?: string
  readonly operation?: ConversationOperationReadModel
  readonly pendingFollowUp?: PendingGuidedFollowUpReadModel
  readonly historyRows: readonly ConversationHistoryRow[]
  readonly historyPage: ConversationHistoryPage
  readonly historyExpanded: boolean
  readonly transientAssistantText?: string
  readonly canSubmit: boolean
  readonly canQueueFollowUp: boolean
  readonly canSteer: boolean
  readonly canCancel: boolean
  readonly canRegenerate: boolean
}

export type ConversationHistorySourceResult =
  SessionTranscriptReadResult

export type ConversationHistoryRow = Extract<
  SessionTranscriptReadResult,
  { readonly kind: "assistant.session-transcript.found" }
>["transcript"]["rows"][number]

export type ConversationHistoryPage = Extract<
  SessionTranscriptReadResult,
  { readonly kind: "assistant.session-transcript.found" }
>["transcript"]["page"]

export interface ConversationDeltaBuffer {
  readonly operationId: string
  readonly sessionId: string
  readonly text: string
  readonly truncated: boolean
  readonly lastSequence: number
}

export type ConversationDeltaEvent =
  ConversationAssistantTextDeltaEvent

export type WorkbenchState =
  | "idle"
  | "ready"
  | "no-session"
  | "failed"

export interface WorkbenchViewModel {
  readonly kind: "web.workbench"
  readonly state: WorkbenchState
  readonly sessionId?: string
  readonly message?: string
  readonly error?: WorkbenchError
  readonly summary: WorkbenchSummary
  readonly provenance: WorkbenchProvenance
  readonly rows: readonly WorkbenchTranscriptRow[]
  readonly canOpen: boolean
}

export interface WorkbenchError {
  readonly code: string
  readonly category: string
  readonly message: string
}

export interface WorkbenchSummary {
  readonly rowCount: number
  readonly inputCount: number
  readonly messageCount: number
  readonly visibleTextRows: number
  readonly latestUpdatedAt?: number
  readonly latestAssistantText?: string
  readonly latestUserText?: string
  readonly originKinds: readonly string[]
}

export interface WorkbenchProvenance {
  readonly rowCount: number
  readonly hasClientField: boolean
  readonly originKinds: readonly string[]
}

export interface WorkbenchTranscriptRow {
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

export type ActionResult =
  | {
      readonly ok: true
      readonly action: Action["type"]
      readonly output?: ActionOutput
      readonly snapshot: Snapshot
    }
  | {
      readonly ok: false
      readonly action: Action["type"]
      readonly message: string
      readonly output?: ActionOutput
      readonly snapshot: Snapshot
    }

export interface PluginManagementActionOutput {
  readonly kind: "web.plugin-management-action"
  readonly action:
    | "read-plugin-management"
    | "request-local-plugin-review"
    | "approve-local-plugin-review"
    | "cancel-local-plugin-review"
    | "set-plugin-install-state"
    | "retry-plugin-refresh"
  readonly result:
    | PluginManagementReadResult
    | RequestLocalPluginReviewResult
    | CancelLocalPluginReviewResult
    | PluginManagementMutationResult
}

export type ActionOutput =
  | PluginManagementActionOutput
  | ScheduleActionOutput

export type ScheduleActionType =
  | "read-schedule"
  | "create-schedule"
  | "replace-schedule"
  | "set-schedule-enabled"
  | "remove-schedule"

export interface ScheduleActionOutput {
  readonly kind: "web.schedule-action"
  readonly action: ScheduleActionType
  readonly result: ScheduleDefinitionReadResult | ScheduleMutationResult
}

export type ActionSuccessResult = Extract<
  ActionResult,
  { readonly ok: true }
>

export type ActionFailureResult = Extract<
  ActionResult,
  { readonly ok: false }
>

export interface Diagnostic {
  readonly code: DiagnosticCode
  readonly severity: "warning" | "error"
  readonly message: string
}

export type DiagnosticCode =
  | "web.descriptor_failed"
  | "web.status_failed"
  | "web.home_failed"
  | "web.settings_failed"
  | "web.model_endpoints_failed"
  | "web.command_catalog_failed"
  | "web.plugin_management_failed"
  | "web.schedule_list_failed"
  | "web.attachments_failed"
  | "web.team_list_failed"
  | "web.events_failed"
  | "web.action_failed"
