import type { BackendCommandPortRequest } from "@wanex/product/backend";
import type {
  ArchiveSessionRequest,
  AttachmentDraft,
  CancelSideQueryRequest,
  CancelTrackedConversationOperationRequest,
  CancelTrackedConversationOperationResult,
  CommandCatalogReadModel,
  CommandInvocationPreview,
  CommandPortEnvelope,
  CommandPortJsonResult,
  ConversationAssistantTextDeltaEvent,
  ConversationAttachmentsReadModel,
  ConversationOperationReadModel,
  DismissSideQueryRequest,
  DismissSideQueryResult,
  ExecuteCommandRequest,
  ExecuteCommandResult,
  ExecutionReferenceReadResult,
  HomeOptions,
  HomeReadModel,
  ModelEndpointListReadModel,
  ModelEndpointReadModel,
  OpenWorkbenchRequest,
  OpenWorkbenchResult,
  PendingGuidedFollowUpReadModel,
  PrepareConversationAttachmentRequest,
  PrepareConversationAttachmentResult,
  PreviewCommandInvocationRequest,
  QueueGuidedFollowUpRequest,
  QueueGuidedFollowUpResult,
  ReadConversationAttachmentsRequest,
  ReadExecutionReferenceRequest,
  ReadSessionTranscriptRequest,
  ReadSideQueryRequest,
  ReadSideQueryResult,
  ReadTrackedConversationOperationRequest,
  ReadTrackedConversationOperationResult,
  RegenerateTrackedConversationOperationRequest,
  RegenerateTrackedConversationOperationResult,
  RemoveConversationAttachmentRequest,
  RemoveConversationAttachmentResult,
  RenameSessionRequest,
  ResolveTrackedConversationApprovalRequest,
  ResolveTrackedConversationApprovalResult,
  ResolveTrackedConversationRecoveryRequest,
  ResolveTrackedConversationRecoveryResult,
  RestoreSessionRequest,
  SelectSessionRequest,
  SessionRow,
  SessionTranscriptReadResult,
  SetLayoutRequest,
  SetModeRequest,
  SettingsReadModel,
  ShellStatus,
  SideQueryReadModel,
  StartSideQueryRequest,
  StateSnapshot,
  SteerTrackedConversationOperationRequest,
  SteerTrackedConversationOperationResult,
  SubmitConversationOperationRequest,
  SubmitConversationOperationResult,
  UpdatePreferencesRequest,
} from "../../model.js";
import type {
  DecidePlanProposalRequest,
  DismissPlanGenerationResult,
  ExecutePlanProposalRequest,
  ExecutePlanProposalResult,
  ListPlanProposalsRequest,
  PlanGenerationReadModel,
  PlanGenerationReference,
  PlanProposalListReadModel,
  ReadPlanGenerationResult,
  ReadPlanProposalRequest,
  ReadPlanProposalResult,
  RevisePlanProposalRequest,
  SelectPlanProposalRequest,
  StartPlanGenerationRequest,
} from "../../plan/model.js";
import type {
  CancelGoalRequest,
  ChangeGoalStateRequest,
  GoalReadModel,
  ReadGoalRequest,
  ReadGoalResult,
  StartGoalRequest,
} from "../../goal/model.js";
import type {
  ReadTeamConversationResult,
  TeamConversationListReadModel,
  TeamConversationSummary,
  TeamParticipantReadModel,
  TeamRoundReceipt,
} from "../../team/model.js";
import type {
  AddTeamParticipantRequest,
  CloseTeamConversationRequest,
  CreateTeamConversationRequest,
  ListTeamConversationsRequest,
  SetTeamCoordinatorRequest,
  SubmitTeamRoundRequest,
  UpdateTeamParticipantRequest,
} from "../../team/port.js";
import type {
  ApproveLocalPluginReviewRequest,
  CancelLocalPluginReviewRequest,
  CancelLocalPluginReviewResult,
  PluginManagementMutationResult,
  PluginManagementReadResult,
  RequestLocalPluginReviewResult,
  SetPluginInstallStateRequest,
} from "../../plugin-management/model.js";
import type {
  ReadSurfaceEventsRequest,
  SurfaceCommand,
  SurfaceDescriptor,
  SurfaceError,
  SurfaceEvent,
  SurfaceEventListener,
  SurfaceEventPage,
  SurfaceEventUnsubscribe,
} from "../model.js";

export interface SurfaceClient {
  descriptor(): Promise<SurfaceClientDescriptorResult>;
  status(options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<ShellStatus>>;
  readHome(input?: HomeOptions, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<HomeReadModel>>;
  readSettings(options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<SettingsReadModel>>;
  selectSession(input: SelectSessionRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<StateSnapshot>>;
  renameSession(input: RenameSessionRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<SessionRow>>;
  archiveSession(input: ArchiveSessionRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<SessionRow>>;
  restoreSession(input: RestoreSessionRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<SessionRow>>;
  startNewConversation(options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<StateSnapshot>>;
  setLayout(input: SetLayoutRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<StateSnapshot>>;
  setMode(input: SetModeRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<StateSnapshot>>;
  updatePreferences(input: UpdatePreferencesRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<StateSnapshot>>;
  listModelEndpoints(options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<ModelEndpointListReadModel>>;
  readProductCommands(options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<CommandCatalogReadModel>>;
  setActiveModelEndpoint(input: { readonly endpointId: string }, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<ModelEndpointReadModel>>;
  dispatchProductCommand(input: BackendCommandPortRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<CommandPortEnvelope>>;
  dispatchProductCommandJson(body: string, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<CommandPortJsonResult>>;
  previewProductCommandInvocation(input: PreviewCommandInvocationRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<CommandInvocationPreview>>;
  executeProductCommand(input: ExecuteCommandRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<ExecuteCommandResult>>;
  readExecutionReference(input: ReadExecutionReferenceRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<ExecutionReferenceReadResult>>;
  openWorkbench(input?: OpenWorkbenchRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<OpenWorkbenchResult>>;
  readSessionTranscript(input?: ReadSessionTranscriptRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<SessionTranscriptReadResult>>;
  prepareConversationAttachment(input: PrepareConversationAttachmentRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<PrepareConversationAttachmentResult>>;
  readConversationAttachments(input?: ReadConversationAttachmentsRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<ConversationAttachmentsReadModel>>;
  removeConversationAttachment(input: RemoveConversationAttachmentRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<RemoveConversationAttachmentResult>>;
  submitConversationOperation(input: SubmitConversationOperationRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<SubmitConversationOperationResult>>;
  queueGuidedFollowUp(input: QueueGuidedFollowUpRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<QueueGuidedFollowUpResult>>;
  steerTrackedConversationOperation(input: Omit<SteerTrackedConversationOperationRequest, "requestId">, options: SurfaceClientRequiredRequestOptions): Promise<SurfaceClientCommandEnvelope<SteerTrackedConversationOperationResult>>;
  startSideQuery(input: StartSideQueryRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<SideQueryReadModel>>;
  readSideQuery(input: ReadSideQueryRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<ReadSideQueryResult>>;
  cancelSideQuery(input: CancelSideQueryRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<SideQueryReadModel>>;
  dismissSideQuery(input: DismissSideQueryRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<DismissSideQueryResult>>;
  startPlanGeneration(input: StartPlanGenerationRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<PlanGenerationReadModel>>;
  readPlanGeneration(input: PlanGenerationReference, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<ReadPlanGenerationResult>>;
  cancelPlanGeneration(input: PlanGenerationReference, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<PlanGenerationReadModel>>;
  dismissPlanGeneration(input: PlanGenerationReference, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<DismissPlanGenerationResult>>;
  selectPlanProposal(input: SelectPlanProposalRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<StateSnapshot>>;
  clearPlanProposalSelection(options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<StateSnapshot>>;
  readPlanProposal(input?: ReadPlanProposalRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<ReadPlanProposalResult>>;
  listPlanProposals(input?: ListPlanProposalsRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<PlanProposalListReadModel>>;
  revisePlanProposal(input: RevisePlanProposalRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<ReadPlanProposalResult>>;
  decidePlanProposal(input: DecidePlanProposalRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<ReadPlanProposalResult>>;
  executePlanProposal(input: ExecutePlanProposalRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<ExecutePlanProposalResult>>;
  readGoal(input?: ReadGoalRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<ReadGoalResult>>;
  startGoal(input: StartGoalRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<GoalReadModel>>;
  pauseGoal(input: ChangeGoalStateRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<GoalReadModel>>;
  resumeGoal(input: ChangeGoalStateRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<GoalReadModel>>;
  cancelGoal(input: CancelGoalRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<GoalReadModel>>;
  readTrackedConversationOperation(input?: ReadTrackedConversationOperationRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<ReadTrackedConversationOperationResult>>;
  cancelTrackedConversationOperation(input: CancelTrackedConversationOperationRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<CancelTrackedConversationOperationResult>>;
  regenerateTrackedConversationOperation(input?: RegenerateTrackedConversationOperationRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<RegenerateTrackedConversationOperationResult>>;
  resolveTrackedConversationRecovery(input: ResolveTrackedConversationRecoveryRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<ResolveTrackedConversationRecoveryResult>>;
  resolveTrackedConversationApproval(input: ResolveTrackedConversationApprovalRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<ResolveTrackedConversationApprovalResult>>;
  listTeamConversations(input?: ListTeamConversationsRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<TeamConversationListReadModel>>;
  readTeamConversation(input?: { readonly conversationId?: string; readonly cursor?: string; readonly limit?: number }, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<ReadTeamConversationResult>>;
  selectTeamConversation(input: { readonly conversationId: string }, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<TeamConversationSummary>>;
  createTeamConversation(input: CreateTeamConversationRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<TeamConversationSummary>>;
  closeTeamConversation(input: CloseTeamConversationRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<TeamConversationSummary>>;
  addTeamParticipant(input: AddTeamParticipantRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<TeamParticipantReadModel>>;
  updateTeamParticipant(input: UpdateTeamParticipantRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<TeamParticipantReadModel>>;
  setTeamCoordinator(input: SetTeamCoordinatorRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<TeamConversationSummary>>;
  submitTeamRound(input: SubmitTeamRoundRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<TeamRoundReceipt>>;
  readPluginManagement(options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<PluginManagementReadResult>>;
  requestLocalPluginReview(options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<RequestLocalPluginReviewResult>>;
  approveLocalPluginReview(input: ApproveLocalPluginReviewRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<PluginManagementMutationResult>>;
  cancelLocalPluginReview(input: CancelLocalPluginReviewRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<CancelLocalPluginReviewResult>>;
  setPluginInstallState(input: SetPluginInstallStateRequest, options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<PluginManagementMutationResult>>;
  retryPluginRefresh(options?: SurfaceClientRequestOptions): Promise<SurfaceClientCommandEnvelope<PluginManagementMutationResult>>;
  readSurfaceEvents(request?: ReadSurfaceEventsRequest): Promise<SurfaceClientEventsResult>;
  subscribeSurfaceEvents(listener: SurfaceEventListener): SurfaceEventUnsubscribe;
}

export interface SurfaceClientRequestOptions {
  readonly requestId?: string;
}

export interface SurfaceClientRequiredRequestOptions {
  readonly requestId: string;
}

export type SurfaceClientCommandEnvelope<T> =
  | {
      readonly ok: true;
      readonly command: SurfaceCommand;
      readonly value: T;
      readonly event: SurfaceEvent;
    }
  | {
      readonly ok: false;
      readonly command: SurfaceCommand;
      readonly error: SurfaceError;
      readonly event: SurfaceEvent;
    };

export type SurfaceClientDescriptorResult =
  | { readonly ok: true; readonly value: SurfaceDescriptor }
  | { readonly ok: false; readonly error: SurfaceError };

export type SurfaceClientEventsResult =
  | {
      readonly ok: true;
      readonly streamId: SurfaceEventPage["streamId"];
      readonly earliestSequence: SurfaceEventPage["earliestSequence"];
      readonly latestSequence: SurfaceEventPage["latestSequence"];
      readonly gap: SurfaceEventPage["gap"];
      readonly hasMore: SurfaceEventPage["hasMore"];
      readonly events: SurfaceEventPage["events"];
    }
  | { readonly ok: false; readonly error: SurfaceError };

export type {
  AttachmentDraft,
  ConversationAssistantTextDeltaEvent,
  ConversationOperationReadModel,
  PendingGuidedFollowUpReadModel,
};
