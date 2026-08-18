import type {
  CancelTrackedConversationOperationResult,
  CommandCatalogReadModel,
  CommandInvocationPreview,
  CommandPortEnvelope,
  CommandPortJsonResult,
  ConversationAttachmentsReadModel,
  DismissSideQueryResult,
  ExecuteCommandResult,
  ExecutionReferenceReadResult,
  HomeReadModel,
  ModelEndpointListReadModel,
  ModelEndpointReadModel,
  OpenWorkbenchResult,
  PrepareConversationAttachmentResult,
  QueueGuidedFollowUpResult,
  ReadSideQueryResult,
  ReadTrackedConversationOperationResult,
  RegenerateTrackedConversationOperationResult,
  RemoveConversationAttachmentResult,
  ResolveTrackedConversationApprovalResult,
  ResolveTrackedConversationRecoveryResult,
  SessionRow,
  SessionTranscriptReadResult,
  SettingsReadModel,
  ShellStatus,
  SideQueryReadModel,
  StateSnapshot,
  SteerTrackedConversationOperationResult,
  SubmitConversationOperationResult,
} from "../../model.js";
import type {
  DismissPlanGenerationResult,
  ExecutePlanProposalResult,
  PlanGenerationReadModel,
  PlanProposalListReadModel,
  ReadPlanGenerationResult,
  ReadPlanProposalResult,
} from "../../plan/model.js";
import type {
  GoalReadModel,
  ReadGoalResult,
} from "../../goal/model.js";
import type {
  ReadTeamConversationResult,
  TeamConversationListReadModel,
  TeamConversationSummary,
  TeamParticipantReadModel,
  TeamRoundReceipt,
} from "../../team/model.js";
import type {
  CancelLocalPluginReviewResult,
  PluginManagementMutationResult,
  PluginManagementReadResult,
  RequestLocalPluginReviewResult,
} from "../../plugin-management/model.js";
import { SURFACE_COMMANDS, type SurfaceCommand } from "../model.js";
import type { SurfaceClientTransport } from "../client-model.js";
import { createSurfaceClientEventFactory } from "../events.js";
import {
  invalidTransportResponseError,
  isSurfaceDescriptor,
  isSurfaceEvent,
  isSurfaceEventPage,
  normalizeSurfaceClientTransportFailure,
} from "../validation.js";
import type {
  SurfaceClient,
  SurfaceClientCommandEnvelope,
  SurfaceClientRequestOptions,
} from "./contracts.js";
import { dispatchTyped, invalidDescriptorResult } from "./transport.js";

export function createSurfaceClient(
  transport: SurfaceClientTransport,
): SurfaceClient {
  const events = createSurfaceClientEventFactory(Date.now);
  const send = <T>(
    command: SurfaceCommand,
    input: unknown,
    options: SurfaceClientRequestOptions | undefined,
  ): Promise<SurfaceClientCommandEnvelope<T>> =>
    dispatchTyped<T>({ transport, events, command, input, options });

  return {
    async descriptor() {
      try {
        const descriptor = await transport.descriptor();
        return isSurfaceDescriptor(descriptor)
          ? { ok: true, value: descriptor }
          : invalidDescriptorResult();
      } catch (error) {
        return {
          ok: false,
          error: normalizeSurfaceClientTransportFailure(
            error,
            "surface descriptor transport failed",
          ),
        };
      }
    },
    status: (options) => send<ShellStatus>(SURFACE_COMMANDS.status, undefined, options),
    readHome: (input, options) => send<HomeReadModel>(SURFACE_COMMANDS.readHome, input, options),
    readSettings: (options) => send<SettingsReadModel>(SURFACE_COMMANDS.readSettings, undefined, options),
    selectSession: (input, options) => send<StateSnapshot>(SURFACE_COMMANDS.selectSession, input, options),
    renameSession: (input, options) => send<SessionRow>(SURFACE_COMMANDS.renameSession, input, options),
    archiveSession: (input, options) => send<SessionRow>(SURFACE_COMMANDS.archiveSession, input, options),
    restoreSession: (input, options) => send<SessionRow>(SURFACE_COMMANDS.restoreSession, input, options),
    startNewConversation: (options) => send<StateSnapshot>(SURFACE_COMMANDS.startNewConversation, undefined, options),
    setLayout: (input, options) => send<StateSnapshot>(SURFACE_COMMANDS.setLayout, input, options),
    setMode: (input, options) => send<StateSnapshot>(SURFACE_COMMANDS.setMode, input, options),
    updatePreferences: (input, options) => send<StateSnapshot>(SURFACE_COMMANDS.updatePreferences, input, options),
    listModelEndpoints: (options) => send<ModelEndpointListReadModel>(SURFACE_COMMANDS.listModelEndpoints, undefined, options),
    readProductCommands: (options) => send<CommandCatalogReadModel>(SURFACE_COMMANDS.readProductCommands, undefined, options),
    setActiveModelEndpoint: (input, options) => send<ModelEndpointReadModel>(SURFACE_COMMANDS.setActiveModelEndpoint, input, options),
    dispatchProductCommand: (input, options) => send<CommandPortEnvelope>(SURFACE_COMMANDS.dispatchProductCommand, input, options),
    dispatchProductCommandJson: (input, options) => send<CommandPortJsonResult>(SURFACE_COMMANDS.dispatchProductCommandJson, input, options),
    previewProductCommandInvocation: (input, options) => send<CommandInvocationPreview>(SURFACE_COMMANDS.previewProductCommandInvocation, input, options),
    executeProductCommand: (input, options) => send<ExecuteCommandResult>(SURFACE_COMMANDS.executeProductCommand, input, options),
    readExecutionReference: (input, options) => send<ExecutionReferenceReadResult>(SURFACE_COMMANDS.readExecutionReference, input, options),
    openWorkbench: (input, options) => send<OpenWorkbenchResult>(SURFACE_COMMANDS.openWorkbench, input, options),
    readSessionTranscript: (input, options) => send<SessionTranscriptReadResult>(SURFACE_COMMANDS.readSessionTranscript, input, options),
    prepareConversationAttachment: (input, options) => send<PrepareConversationAttachmentResult>(SURFACE_COMMANDS.prepareConversationAttachment, input, options),
    readConversationAttachments: (input, options) => send<ConversationAttachmentsReadModel>(SURFACE_COMMANDS.readConversationAttachments, input, options),
    removeConversationAttachment: (input, options) => send<RemoveConversationAttachmentResult>(SURFACE_COMMANDS.removeConversationAttachment, input, options),
    submitConversationOperation: (input, options) => send<SubmitConversationOperationResult>(SURFACE_COMMANDS.submitConversationOperation, input, options),
    queueGuidedFollowUp: (input, options) => send<QueueGuidedFollowUpResult>(SURFACE_COMMANDS.queueGuidedFollowUp, input, options),
    steerTrackedConversationOperation: (input, options) => send<SteerTrackedConversationOperationResult>(SURFACE_COMMANDS.steerTrackedConversationOperation, input, options),
    startSideQuery: (input, options) => send<SideQueryReadModel>(SURFACE_COMMANDS.startSideQuery, input, options),
    readSideQuery: (input, options) => send<ReadSideQueryResult>(SURFACE_COMMANDS.readSideQuery, input, options),
    cancelSideQuery: (input, options) => send<SideQueryReadModel>(SURFACE_COMMANDS.cancelSideQuery, input, options),
    dismissSideQuery: (input, options) => send<DismissSideQueryResult>(SURFACE_COMMANDS.dismissSideQuery, input, options),
    startPlanGeneration: (input, options) => send<PlanGenerationReadModel>(SURFACE_COMMANDS.startPlanGeneration, input, options),
    readPlanGeneration: (input, options) => send<ReadPlanGenerationResult>(SURFACE_COMMANDS.readPlanGeneration, input, options),
    cancelPlanGeneration: (input, options) => send<PlanGenerationReadModel>(SURFACE_COMMANDS.cancelPlanGeneration, input, options),
    dismissPlanGeneration: (input, options) => send<DismissPlanGenerationResult>(SURFACE_COMMANDS.dismissPlanGeneration, input, options),
    selectPlanProposal: (input, options) => send<StateSnapshot>(SURFACE_COMMANDS.selectPlanProposal, input, options),
    clearPlanProposalSelection: (options) => send<StateSnapshot>(SURFACE_COMMANDS.clearPlanProposalSelection, undefined, options),
    readPlanProposal: (input, options) => send<ReadPlanProposalResult>(SURFACE_COMMANDS.readPlanProposal, input, options),
    listPlanProposals: (input, options) => send<PlanProposalListReadModel>(SURFACE_COMMANDS.listPlanProposals, input, options),
    revisePlanProposal: (input, options) => send<ReadPlanProposalResult>(SURFACE_COMMANDS.revisePlanProposal, input, options),
    decidePlanProposal: (input, options) => send<ReadPlanProposalResult>(SURFACE_COMMANDS.decidePlanProposal, input, options),
    executePlanProposal: (input, options) => send<ExecutePlanProposalResult>(SURFACE_COMMANDS.executePlanProposal, input, options),
    readGoal: (input, options) => send<ReadGoalResult>(SURFACE_COMMANDS.readGoal, input, options),
    startGoal: (input, options) => send<GoalReadModel>(SURFACE_COMMANDS.startGoal, input, options),
    pauseGoal: (input, options) => send<GoalReadModel>(SURFACE_COMMANDS.pauseGoal, input, options),
    resumeGoal: (input, options) => send<GoalReadModel>(SURFACE_COMMANDS.resumeGoal, input, options),
    cancelGoal: (input, options) => send<GoalReadModel>(SURFACE_COMMANDS.cancelGoal, input, options),
    readTrackedConversationOperation: (input, options) => send<ReadTrackedConversationOperationResult>(SURFACE_COMMANDS.readTrackedConversationOperation, input, options),
    cancelTrackedConversationOperation: (input, options) => send<CancelTrackedConversationOperationResult>(SURFACE_COMMANDS.cancelTrackedConversationOperation, input, options),
    regenerateTrackedConversationOperation: (input, options) => send<RegenerateTrackedConversationOperationResult>(SURFACE_COMMANDS.regenerateTrackedConversationOperation, input, options),
    resolveTrackedConversationRecovery: (input, options) => send<ResolveTrackedConversationRecoveryResult>(SURFACE_COMMANDS.resolveTrackedConversationRecovery, input, options),
    resolveTrackedConversationApproval: (input, options) => send<ResolveTrackedConversationApprovalResult>(SURFACE_COMMANDS.resolveTrackedConversationApproval, input, options),
    listTeamConversations: (input, options) => send<TeamConversationListReadModel>(SURFACE_COMMANDS.listTeamConversations, input, options),
    readTeamConversation: (input, options) => send<ReadTeamConversationResult>(SURFACE_COMMANDS.readTeamConversation, input, options),
    selectTeamConversation: (input, options) => send<TeamConversationSummary>(SURFACE_COMMANDS.selectTeamConversation, input, options),
    createTeamConversation: (input, options) => send<TeamConversationSummary>(SURFACE_COMMANDS.createTeamConversation, input, options),
    closeTeamConversation: (input, options) => send<TeamConversationSummary>(SURFACE_COMMANDS.closeTeamConversation, input, options),
    addTeamParticipant: (input, options) => send<TeamParticipantReadModel>(SURFACE_COMMANDS.addTeamParticipant, input, options),
    updateTeamParticipant: (input, options) => send<TeamParticipantReadModel>(SURFACE_COMMANDS.updateTeamParticipant, input, options),
    setTeamCoordinator: (input, options) => send<TeamConversationSummary>(SURFACE_COMMANDS.setTeamCoordinator, input, options),
    submitTeamRound: (input, options) => send<TeamRoundReceipt>(SURFACE_COMMANDS.submitTeamRound, input, options),
    readPluginManagement: (options) => send<PluginManagementReadResult>(SURFACE_COMMANDS.readPluginManagement, undefined, options),
    requestLocalPluginReview: (options) => send<RequestLocalPluginReviewResult>(SURFACE_COMMANDS.requestLocalPluginReview, undefined, options),
    approveLocalPluginReview: (input, options) => send<PluginManagementMutationResult>(SURFACE_COMMANDS.approveLocalPluginReview, input, options),
    cancelLocalPluginReview: (input, options) => send<CancelLocalPluginReviewResult>(SURFACE_COMMANDS.cancelLocalPluginReview, input, options),
    setPluginInstallState: (input, options) => send<PluginManagementMutationResult>(SURFACE_COMMANDS.setPluginInstallState, input, options),
    retryPluginRefresh: (options) => send<PluginManagementMutationResult>(SURFACE_COMMANDS.retryPluginRefresh, undefined, options),
    async readSurfaceEvents(request) {
      try {
        const page = await transport.readSurfaceEvents(request);
        return isSurfaceEventPage(page)
          ? { ok: true, ...page }
          : { ok: false, error: invalidTransportResponseError() };
      } catch (error) {
        return {
          ok: false,
          error: normalizeSurfaceClientTransportFailure(
            error,
            "surface event transport failed",
          ),
        };
      }
    },
    subscribeSurfaceEvents(listener) {
      try {
        return transport.subscribeSurfaceEvents((event) => {
          if (!isSurfaceEvent(event)) return;
          try {
            listener(event);
          } catch {
            // A listener cannot affect the shared event transport.
          }
        });
      } catch {
        return () => {};
      }
    },
  };
}
