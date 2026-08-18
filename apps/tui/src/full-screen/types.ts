import type {
  ConversationSelection,
  ConversationAttachmentsReadModel,
  ConversationHistoryReadModel,
  ConversationOperationReadModel,
  TeamConversationPageReadModel
} from "@wanex/product"
import type {
  SurfaceClient
} from "@wanex/product/surface"
import type { Terminal } from "@earendil-works/pi-tui"
import type { TuiComposerMode } from "../application/conversation-actions.js"
import type { TuiAttachmentHost } from "../model.js"

export interface TuiFullScreenOptions {
  readonly client: TuiFullScreenClient
  readonly terminal?: Terminal
  readonly attachmentHost?: TuiAttachmentHost
}

export type TuiFullScreenClient = Pick<
  SurfaceClient,
  | "readHome"
  | "readSessionTranscript"
  | "readTeamConversation"
  | "listTeamConversations"
  | "readTrackedConversationOperation"
  | "selectSession"
  | "startNewConversation"
  | "listModelEndpoints"
  | "setActiveModelEndpoint"
  | "readProductCommands"
  | "previewProductCommandInvocation"
  | "executeProductCommand"
  | "readConversationAttachments"
  | "removeConversationAttachment"
  | "submitConversationOperation"
  | "queueGuidedFollowUp"
  | "steerTrackedConversationOperation"
  | "cancelTrackedConversationOperation"
  | "regenerateTrackedConversationOperation"
  | "resolveTrackedConversationRecovery"
  | "resolveTrackedConversationApproval"
  | "startSideQuery"
  | "readSideQuery"
  | "cancelSideQuery"
  | "dismissSideQuery"
  | "startPlanGeneration"
  | "readPlanGeneration"
  | "cancelPlanGeneration"
  | "dismissPlanGeneration"
  | "readPlanProposal"
  | "revisePlanProposal"
  | "decidePlanProposal"
  | "executePlanProposal"
  | "readGoal"
  | "startGoal"
  | "pauseGoal"
  | "resumeGoal"
  | "cancelGoal"
  | "selectTeamConversation"
  | "createTeamConversation"
  | "closeTeamConversation"
  | "addTeamParticipant"
  | "updateTeamParticipant"
  | "setTeamCoordinator"
  | "submitTeamRound"
  | "subscribeSurfaceEvents"
>

export type TuiPlanClient = Pick<
  SurfaceClient,
  | "startPlanGeneration"
  | "readPlanGeneration"
  | "cancelPlanGeneration"
  | "dismissPlanGeneration"
  | "readPlanProposal"
  | "revisePlanProposal"
  | "decidePlanProposal"
  | "executePlanProposal"
>

export type TuiGoalClient = Pick<
  SurfaceClient,
  | "readGoal"
  | "startGoal"
  | "pauseGoal"
  | "resumeGoal"
  | "cancelGoal"
>

export type TuiSideQueryClient = Pick<
  SurfaceClient,
  | "startSideQuery"
  | "readSideQuery"
  | "cancelSideQuery"
  | "dismissSideQuery"
>

export type TuiConversationControlClient = Pick<
  SurfaceClient,
  | "regenerateTrackedConversationOperation"
  | "resolveTrackedConversationRecovery"
  | "resolveTrackedConversationApproval"
>

export interface TuiFullScreenState {
  readonly started: boolean
  readonly stopped: boolean
  readonly busy: boolean
  readonly selection?: ConversationSelection
  readonly mode: TuiComposerMode
  readonly draft: string
  readonly attachments?: ConversationAttachmentsReadModel
  readonly transcript?: ConversationHistoryReadModel
  readonly operation?: ConversationOperationReadModel
  readonly team?: TeamConversationPageReadModel
  readonly transientAssistantText?: string
  readonly statusMessage?: string
  readonly errorMessage?: string
  readonly lastEventSequence?: number
}

export interface TuiFullScreenHandle {
  readonly terminal: Terminal
  state(): TuiFullScreenState
  start(): Promise<void>
  stop(reason?: TuiFullScreenExitReason): Promise<void>
  waitUntilStopped(): Promise<TuiFullScreenExitReason>
  refresh(): Promise<void>
}

export type TuiFullScreenExitReason =
  | "quit"
  | "provider-management"
