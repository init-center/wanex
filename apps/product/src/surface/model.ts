import type { BackendIntegrationContract } from "@wanex/product/backend"
import type { CommandCatalogInvalidatedEvent } from "../commands/model.js"
import type {
  CancelTrackedConversationOperationResult,
  ConversationAttachmentsReadModel,
  ConversationEvent,
  ExecuteCommandResult,
  ExecutionReferenceReadResult,
  CommandCatalogReadModel,
  CommandInvocationPreview,
  HomeReadModel,
  OpenWorkbenchResult,
  QueueGuidedFollowUpResult,
  SteerTrackedConversationOperationResult,
  DismissSideQueryResult,
  ReadSideQueryResult,
  SideQueryInvalidatedEvent,
  SideQueryReadModel,
  ReadTrackedConversationOperationResult,
  SessionTranscriptReadResult,
  RegenerateTrackedConversationOperationResult,
  ResolveTrackedConversationApprovalResult,
  ResolveTrackedConversationRecoveryResult,
  ModelEndpointListReadModel,
  ModelEndpointReadModel,
  SettingsReadModel,
  SessionRow,
  ShellStatus,
  SubmitConversationOperationResult,
  PrepareConversationAttachmentResult,
  RemoveConversationAttachmentResult,
  StateSnapshot
} from "../model.js"
import type {
  GoalInvalidatedEvent,
  GoalReadModel,
  ReadGoalResult
} from "../goal/model.js"
import type {
  DismissPlanGenerationResult,
  ExecutePlanProposalResult,
  PlanGenerationReadModel,
  PlanInvalidatedEvent,
  PlanProposalListReadModel,
  ReadPlanGenerationResult,
  ReadPlanProposalResult
} from "../plan/model.js"
import type {
  ReadTeamConversationResult,
  TeamConversationListReadModel,
  TeamConversationSummary,
  TeamInvalidatedEvent,
  TeamParticipantReadModel,
  TeamRoundReceipt
} from "../team/model.js"
import type {
  CancelLocalPluginReviewResult,
  PluginManagementMutationResult,
  PluginManagementReadResult,
  ProductPluginManagementInvalidatedEvent,
  RequestLocalPluginReviewResult
} from "../plugin-management/model.js"

export const SURFACE_COMMANDS = {
  status: "status",
  readHome: "readHome",
  readSettings: "readSettings",
  selectSession: "selectSession",
  renameSession: "renameSession",
  archiveSession: "archiveSession",
  restoreSession: "restoreSession",
  startNewConversation: "startNewConversation",
  setLayout: "setLayout",
  setMode: "setMode",
  updatePreferences: "updatePreferences",
  listModelEndpoints: "listModelEndpoints",
  readProductCommands: "readProductCommands",
  setActiveModelEndpoint: "setActiveModelEndpoint",
  dispatchProductCommand: "dispatchProductCommand",
  dispatchProductCommandJson: "dispatchProductCommandJson",
  previewProductCommandInvocation: "previewProductCommandInvocation",
  executeProductCommand: "executeProductCommand",
  readExecutionReference: "readExecutionReference",
  openWorkbench: "openWorkbench",
  readSessionTranscript: "readSessionTranscript",
  prepareConversationAttachment: "prepareConversationAttachment",
  readConversationAttachments: "readConversationAttachments",
  removeConversationAttachment: "removeConversationAttachment",
  submitConversationOperation: "submitConversationOperation",
  queueGuidedFollowUp: "queueGuidedFollowUp",
  steerTrackedConversationOperation: "steerTrackedConversationOperation",
  startSideQuery: "startSideQuery",
  readSideQuery: "readSideQuery",
  cancelSideQuery: "cancelSideQuery",
  dismissSideQuery: "dismissSideQuery",
  startPlanGeneration: "startPlanGeneration",
  readPlanGeneration: "readPlanGeneration",
  cancelPlanGeneration: "cancelPlanGeneration",
  dismissPlanGeneration: "dismissPlanGeneration",
  selectPlanProposal: "selectPlanProposal",
  clearPlanProposalSelection: "clearPlanProposalSelection",
  readPlanProposal: "readPlanProposal",
  listPlanProposals: "listPlanProposals",
  revisePlanProposal: "revisePlanProposal",
  decidePlanProposal: "decidePlanProposal",
  executePlanProposal: "executePlanProposal",
  readGoal: "readGoal",
  startGoal: "startGoal",
  pauseGoal: "pauseGoal",
  resumeGoal: "resumeGoal",
  cancelGoal: "cancelGoal",
  readTrackedConversationOperation: "readTrackedConversationOperation",
  cancelTrackedConversationOperation: "cancelTrackedConversationOperation",
  regenerateTrackedConversationOperation:
    "regenerateTrackedConversationOperation",
  resolveTrackedConversationApproval: "resolveTrackedConversationApproval",
  resolveTrackedConversationRecovery: "resolveTrackedConversationRecovery",
  listTeamConversations: "listTeamConversations",
  readTeamConversation: "readTeamConversation",
  selectTeamConversation: "selectTeamConversation",
  createTeamConversation: "createTeamConversation",
  closeTeamConversation: "closeTeamConversation",
  addTeamParticipant: "addTeamParticipant",
  updateTeamParticipant: "updateTeamParticipant",
  setTeamCoordinator: "setTeamCoordinator",
  submitTeamRound: "submitTeamRound",
  readPluginManagement: "readPluginManagement",
  requestLocalPluginReview: "requestLocalPluginReview",
  approveLocalPluginReview: "approveLocalPluginReview",
  cancelLocalPluginReview: "cancelLocalPluginReview",
  setPluginInstallState: "setPluginInstallState",
  retryPluginRefresh: "retryPluginRefresh"
} as const

export type SurfaceCommand =
  (typeof SURFACE_COMMANDS)[keyof typeof SURFACE_COMMANDS]

export interface SurfaceAdapter {
  descriptor(): SurfaceDescriptor
  dispatchSurfaceCommand(request: unknown): Promise<SurfaceEnvelope>
  readSurfaceEvents(
    request?: ReadSurfaceEventsRequest
  ): SurfaceEventPage
  subscribeSurfaceEvents(
    listener: SurfaceEventListener
  ): SurfaceEventUnsubscribe
  dispose(): Promise<void>
}

export interface SurfaceDescriptor {
  readonly kind: "product.surface-descriptor"
  readonly transport: "app-owned-ipc-or-api"
  readonly commandCount: number
  readonly rendererBoundary: BackendIntegrationContract["rendererBoundary"]
  readonly commands: readonly SurfaceCommandDescriptor[]
}

export interface SurfaceCommandDescriptor {
  readonly command: SurfaceCommand
  readonly title: string
  readonly input: SurfaceCommandInputKind
  /** Whether the command changes the Product-owned navigation/preferences snapshot. */
  readonly mutatesState: boolean
}

export type SurfaceCommandInputKind =
  | "none"
  | "home-options"
  | "session-selector"
  | "session-rename"
  | "session-lifecycle"
  | "new-conversation"
  | "layout-selector"
  | "mode-selector"
  | "preferences-patch"
  | "model-endpoint-selector"
  | "product-command-request"
  | "product-command-invocation-preview"
  | "product-command-execution"
  | "execution-reference"
  | "json-body"
  | "workbench-open"
  | "conversation-transcript-read"
  | "conversation-attachment-prepare"
  | "conversation-attachment-read"
  | "conversation-attachment-remove"
  | "conversation-submit"
  | "conversation-guided-follow-up"
  | "conversation-steer"
  | "side-query-start"
  | "side-query-reference"
  | "plan-generation-start"
  | "plan-generation-reference"
  | "plan-proposal-selector"
  | "plan-proposal-read"
  | "plan-proposal-list"
  | "plan-proposal-revise"
  | "plan-proposal-decision"
  | "plan-proposal-execution"
  | "goal-read"
  | "goal-start"
  | "goal-state-change"
  | "goal-cancel"
  | "conversation-read"
  | "conversation-cancel"
  | "conversation-regenerate"
  | "conversation-approval-resolve"
  | "conversation-recovery-resolve"
  | "team-conversation-list"
  | "team-conversation-read"
  | "team-conversation-selector"
  | "team-conversation-create"
  | "team-conversation-close"
  | "team-participant-add"
  | "team-participant-update"
  | "team-coordinator-set"
  | "team-round-submit"
  | "plugin-review-approval"
  | "plugin-review-cancel"
  | "plugin-install-state-change"

export interface SurfaceCommandRequest {
  readonly command: string
  readonly input?: unknown
  readonly requestId?: string
}

export type SurfaceEnvelope =
  | SurfaceSuccessEnvelope
  | SurfaceErrorEnvelope

export interface SurfaceSuccessEnvelope {
  readonly ok: true
  readonly command: string
  readonly value: SurfaceCommandValue
  readonly event: SurfaceEvent
}

export interface SurfaceErrorEnvelope {
  readonly ok: false
  readonly command: string
  readonly error: SurfaceError
  readonly event: SurfaceEvent
}

export type SurfaceCommandValue =
  | ShellStatus
  | HomeReadModel
  | SettingsReadModel
  | ModelEndpointListReadModel
  | ModelEndpointReadModel
  | CommandCatalogReadModel
  | CommandInvocationPreview
  | ExecuteCommandResult
  | ExecutionReferenceReadResult
  | StateSnapshot
  | SessionRow
  | OpenWorkbenchResult
  | SessionTranscriptReadResult
  | ConversationAttachmentsReadModel
  | PrepareConversationAttachmentResult
  | RemoveConversationAttachmentResult
  | SubmitConversationOperationResult
  | QueueGuidedFollowUpResult
  | SteerTrackedConversationOperationResult
  | SideQueryReadModel
  | ReadSideQueryResult
  | DismissSideQueryResult
  | PlanGenerationReadModel
  | ReadPlanGenerationResult
  | DismissPlanGenerationResult
  | ReadPlanProposalResult
  | PlanProposalListReadModel
  | ExecutePlanProposalResult
  | ReadGoalResult
  | GoalReadModel
  | ReadTrackedConversationOperationResult
  | CancelTrackedConversationOperationResult
  | RegenerateTrackedConversationOperationResult
  | ResolveTrackedConversationApprovalResult
  | ResolveTrackedConversationRecoveryResult
  | TeamConversationListReadModel
  | ReadTeamConversationResult
  | TeamConversationSummary
  | TeamParticipantReadModel
  | TeamRoundReceipt
  | PluginManagementReadResult
  | RequestLocalPluginReviewResult
  | CancelLocalPluginReviewResult
  | PluginManagementMutationResult
  | unknown

export interface SurfaceError {
  readonly code: SurfaceErrorCode
  readonly category: SurfaceErrorCategory
  readonly message: string
}

export type SurfaceErrorCode =
  | "unknown_command"
  | "validation_error"
  | "command_error"
  | "invalid_transport_response"

export type SurfaceErrorCategory = "validation" | "runtime"

export interface ReadSurfaceEventsRequest {
  readonly limit?: number
  readonly afterSequence?: number
  readonly streamId?: string
}

export interface SurfaceEventPage {
  readonly streamId: string
  readonly earliestSequence: number
  readonly latestSequence: number
  readonly gap: boolean
  readonly hasMore: boolean
  readonly events: readonly SurfaceEvent[]
}

export type SurfaceEventListener = (
  event: SurfaceEvent
) => void

export type SurfaceEventUnsubscribe = () => void

export interface SurfaceEvent {
  readonly id: string
  readonly sequence: number
  readonly type: SurfaceEventType
  readonly command: string
  readonly at: number
  readonly requestId?: string
  readonly state?: StateSnapshot
  readonly commandCatalog?: CommandCatalogInvalidatedEvent
  readonly conversation?: ConversationEvent
  readonly sideQuery?: SideQueryInvalidatedEvent
  readonly plan?: PlanInvalidatedEvent
  readonly goal?: GoalInvalidatedEvent
  readonly team?: TeamInvalidatedEvent
  readonly pluginManagement?: ProductPluginManagementInvalidatedEvent
  readonly error?: SurfaceError
}

export type SurfaceEventType =
  | "product.surface.command_completed"
  | "product.surface.command_rejected"
  | "product.surface.state_changed"
  | "product.surface.command-catalog.invalidated"
  | "product.surface.conversation.assistant-text-delta"
  | "product.surface.conversation.operation-invalidated"
  | "product.surface.side-query.invalidated"
  | "product.surface.plan.invalidated"
  | "product.surface.goal.invalidated"
  | "product.surface.team.invalidated"
  | "product.surface.plugin-management.invalidated"
