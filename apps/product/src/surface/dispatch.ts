import type { Shell } from "../model.js"
import {
  expectSurfaceNoInput,
  parseSurfaceCommandExecutionRequest,
  parseSurfaceExecutionReferenceRequest,
  parseSurfaceCommandInvocationPreviewRequest,
  parseSurfaceCancelConversationRequest,
  parseSurfaceConversationReadRequest,
  parseSurfaceConversationRegenerateRequest,
  parseSurfaceConversationApprovalRequest,
  parseSurfaceConversationRecoveryRequest,
  parseSurfaceConversationSubmitRequest,
  parseSurfaceQueueGuidedFollowUpRequest,
  parseSurfaceSteerConversationRequest,
  parseSurfaceSideQueryReference,
  parseSurfaceStartSideQueryRequest,
  parseSurfaceHomeOptions,
  parseSurfaceJsonBody,
  parseSurfaceLayout,
  parseSurfaceMode,
  parseSurfaceOpenWorkbenchRequest,
  parseSurfaceReadSessionTranscriptRequest,
  parseSurfacePrepareConversationAttachmentRequest,
  parseSurfaceReadConversationAttachmentsRequest,
  parseSurfaceRemoveConversationAttachmentRequest,
  parseSurfacePreferencesPatch,
  parseSurfaceModelEndpointSelector,
  parseSurfaceProductCommandRequest,
  parseSurfaceSessionSelector,
  parseSurfaceRenameSessionRequest,
  parseSurfaceArchiveSessionRequest,
  parseSurfaceRestoreSessionRequest,
  parseSurfaceStartPlanGenerationRequest,
  parseSurfacePlanGenerationReference,
  parseSurfaceSelectPlanProposalRequest,
  parseSurfaceReadPlanProposalRequest,
  parseSurfaceListPlanProposalsRequest,
  parseSurfaceRevisePlanProposalRequest,
  parseSurfaceDecidePlanProposalRequest,
  parseSurfaceExecutePlanProposalRequest,
  parseSurfaceReadGoalRequest,
  parseSurfaceStartGoalRequest,
  parseSurfaceChangeGoalStateRequest,
  parseSurfaceCancelGoalRequest,
  parseSurfaceListTeamConversationsRequest,
  parseSurfaceReadTeamConversationRequest,
  parseSurfaceSelectTeamConversationRequest,
  parseSurfaceCreateTeamConversationRequest,
  parseSurfaceCloseTeamConversationRequest,
  parseSurfaceAddTeamParticipantRequest,
  parseSurfaceUpdateTeamParticipantRequest,
  parseSurfaceSetTeamCoordinatorRequest,
  parseSurfaceSubmitTeamRoundRequest,
  parseSurfaceApproveLocalPluginReviewRequest,
  parseSurfaceCancelLocalPluginReviewRequest,
  parseSurfaceSetPluginInstallStateRequest,
  parseSurfaceListSchedulesRequest,
  parseSurfaceReadScheduleRequest,
  parseSurfaceCreateScheduleRequest,
  parseSurfaceReplaceScheduleRequest,
  parseSurfaceSetScheduleEnabledRequest,
  parseSurfaceRemoveScheduleRequest
} from "./input.js"
import type {
  SurfaceCommand,
  SurfaceCommandRequest
} from "./model.js"
import {
  projectModelEndpoint,
  projectModelEndpoints
} from "../provider/readiness.js"

export async function runSurfaceCommand(
  app: Shell,
  request: SurfaceCommandRequest
): Promise<unknown> {
  switch (request.command as SurfaceCommand) {
    case "status":
      expectSurfaceNoInput(request.input, "status")
      return app.status()
    case "readHome":
      return await app.readHome(
        parseSurfaceHomeOptions(request.input)
      )
    case "readSettings":
      expectSurfaceNoInput(request.input, "readSettings")
      return app.readSettings()
    case "selectSession":
      return app.selectSession(
        parseSurfaceSessionSelector(request.input)
      )
    case "renameSession":
      return await app.renameSession(
        parseSurfaceRenameSessionRequest(request.input)
      )
    case "archiveSession":
      return await app.archiveSession(
        parseSurfaceArchiveSessionRequest(request.input)
      )
    case "restoreSession":
      return await app.restoreSession(
        parseSurfaceRestoreSessionRequest(request.input)
      )
    case "startNewConversation":
      expectSurfaceNoInput(request.input, "startNewConversation")
      return await app.startNewConversation()
    case "setLayout":
      return app.setLayout({
        layout: parseSurfaceLayout(request.input)
      })
    case "setMode":
      return app.setMode({
        mode: parseSurfaceMode(request.input)
      })
    case "updatePreferences":
      return app.updatePreferences(
        parseSurfacePreferencesPatch(request.input)
      )
    case "listModelEndpoints":
      expectSurfaceNoInput(request.input, "listModelEndpoints")
      return projectModelEndpoints(
        await app.modelEndpoints.listModelEndpoints()
      )
    case "readProductCommands":
      expectSurfaceNoInput(request.input, "readProductCommands")
      return app.readProductCommands()
    case "setActiveModelEndpoint":
      return projectModelEndpoint(
        await app.modelEndpoints.setActiveModelEndpoint(
          parseSurfaceModelEndpointSelector(request.input)
        )
      )
    case "dispatchProductCommand":
      return await app.dispatchProductCommand(
        parseSurfaceProductCommandRequest(request.input)
      )
    case "dispatchProductCommandJson":
      return await app.dispatchProductCommandJson(
        parseSurfaceJsonBody(request.input)
      )
    case "previewProductCommandInvocation":
      return await app.previewProductCommandInvocation(
        parseSurfaceCommandInvocationPreviewRequest(request.input)
      )
    case "executeProductCommand":
      return await app.executeProductCommand(
        parseSurfaceCommandExecutionRequest(request.input)
      )
    case "readExecutionReference":
      return await app.readExecutionReference(
        parseSurfaceExecutionReferenceRequest(request.input)
      )
    case "listSchedules":
      return await app.schedules.listDefinitions(
        parseSurfaceListSchedulesRequest(request.input)
      )
    case "readSchedule":
      return await app.schedules.readDefinition(
        parseSurfaceReadScheduleRequest(request.input)
      )
    case "createSchedule":
      return await app.schedules.createDefinition(
        parseSurfaceCreateScheduleRequest(request.input)
      )
    case "replaceSchedule":
      return await app.schedules.replaceDefinition(
        parseSurfaceReplaceScheduleRequest(request.input)
      )
    case "setScheduleEnabled":
      return await app.schedules.setEnabled(
        parseSurfaceSetScheduleEnabledRequest(request.input)
      )
    case "removeSchedule":
      return await app.schedules.removeDefinition(
        parseSurfaceRemoveScheduleRequest(request.input)
      )
    case "openWorkbench":
      return await app.openWorkbench(
        parseSurfaceOpenWorkbenchRequest(request.input)
      )
    case "readSessionTranscript":
      return await app.readSessionTranscript(
        parseSurfaceReadSessionTranscriptRequest(request.input)
      )
    case "prepareConversationAttachment":
      return await app.prepareConversationAttachment(
        parseSurfacePrepareConversationAttachmentRequest(
          request.input
        )
      )
    case "readConversationAttachments":
      return app.readConversationAttachments(
        parseSurfaceReadConversationAttachmentsRequest(request.input)
      )
    case "removeConversationAttachment":
      return await app.removeConversationAttachment(
        parseSurfaceRemoveConversationAttachmentRequest(request.input)
      )
    case "submitConversationOperation":
      return await app.submitConversationOperation(
        parseSurfaceConversationSubmitRequest(request.input)
      )
    case "queueGuidedFollowUp":
      return await app.queueGuidedFollowUp(
        parseSurfaceQueueGuidedFollowUpRequest(request.input)
      )
    case "steerTrackedConversationOperation": {
      return await app.steerTrackedConversationOperation(
        parseSurfaceSteerConversationRequest(
          request.input,
          request.requestId
        )
      )
    }
    case "startSideQuery":
      return await app.startSideQuery(
        parseSurfaceStartSideQueryRequest(request.input)
      )
    case "readSideQuery":
      return app.readSideQuery(
        parseSurfaceSideQueryReference(request.input, "readSideQuery")
      )
    case "cancelSideQuery":
      return await app.cancelSideQuery(
        parseSurfaceSideQueryReference(
          request.input,
          "cancelSideQuery"
        )
      )
    case "dismissSideQuery":
      return await app.dismissSideQuery(
        parseSurfaceSideQueryReference(
          request.input,
          "dismissSideQuery"
        )
      )
    case "startPlanGeneration":
      return await app.startPlanGeneration(
        parseSurfaceStartPlanGenerationRequest(request.input)
      )
    case "readPlanGeneration":
      return app.readPlanGeneration(
        parseSurfacePlanGenerationReference(
          request.input,
          "readPlanGeneration"
        )
      )
    case "cancelPlanGeneration":
      return await app.cancelPlanGeneration(
        parseSurfacePlanGenerationReference(
          request.input,
          "cancelPlanGeneration"
        )
      )
    case "dismissPlanGeneration":
      return await app.dismissPlanGeneration(
        parseSurfacePlanGenerationReference(
          request.input,
          "dismissPlanGeneration"
        )
      )
    case "selectPlanProposal":
      return await app.selectPlanProposal(
        parseSurfaceSelectPlanProposalRequest(request.input)
      )
    case "clearPlanProposalSelection":
      expectSurfaceNoInput(
        request.input,
        "clearPlanProposalSelection"
      )
      return await app.clearPlanProposalSelection()
    case "readPlanProposal":
      return await app.readPlanProposal(
        parseSurfaceReadPlanProposalRequest(request.input)
      )
    case "listPlanProposals":
      return await app.listPlanProposals(
        parseSurfaceListPlanProposalsRequest(request.input)
      )
    case "revisePlanProposal":
      return await app.revisePlanProposal(
        parseSurfaceRevisePlanProposalRequest(request.input)
      )
    case "decidePlanProposal":
      return await app.decidePlanProposal(
        parseSurfaceDecidePlanProposalRequest(request.input)
      )
    case "executePlanProposal":
      return await app.executePlanProposal(
        parseSurfaceExecutePlanProposalRequest(request.input)
      )
    case "readGoal":
      return await app.readGoal(
        parseSurfaceReadGoalRequest(request.input)
      )
    case "startGoal":
      return await app.startGoal(
        parseSurfaceStartGoalRequest(request.input)
      )
    case "pauseGoal":
      return await app.pauseGoal(
        parseSurfaceChangeGoalStateRequest(request.input, "pauseGoal")
      )
    case "resumeGoal":
      return await app.resumeGoal(
        parseSurfaceChangeGoalStateRequest(request.input, "resumeGoal")
      )
    case "cancelGoal":
      return await app.cancelGoal(
        parseSurfaceCancelGoalRequest(request.input)
      )
    case "readTrackedConversationOperation":
      return await app.readTrackedConversationOperation(
        parseSurfaceConversationReadRequest(request.input)
      )
    case "cancelTrackedConversationOperation":
      return await app.cancelTrackedConversationOperation(
        parseSurfaceCancelConversationRequest(request.input)
      )
    case "regenerateTrackedConversationOperation":
      return await app.regenerateTrackedConversationOperation(
        parseSurfaceConversationRegenerateRequest(request.input)
      )
    case "resolveTrackedConversationRecovery":
      return await app.resolveTrackedConversationRecovery(
        parseSurfaceConversationRecoveryRequest(request.input)
      )
    case "resolveTrackedConversationApproval":
      return await app.resolveTrackedConversationApproval(
        parseSurfaceConversationApprovalRequest(request.input)
      )
    case "listTeamConversations":
      return await app.teamConversations.listConversations(
        parseSurfaceListTeamConversationsRequest(request.input)
      )
    case "readTeamConversation":
      return await app.teamConversations.readConversation(
        parseSurfaceReadTeamConversationRequest(request.input)
      )
    case "selectTeamConversation":
      return await app.teamConversations.selectConversation(
        parseSurfaceSelectTeamConversationRequest(request.input)
      )
    case "createTeamConversation":
      return await app.teamConversations.createConversation(
        parseSurfaceCreateTeamConversationRequest(request.input)
      )
    case "closeTeamConversation":
      return await app.teamConversations.closeConversation(
        parseSurfaceCloseTeamConversationRequest(request.input)
      )
    case "addTeamParticipant":
      return await app.teamConversations.addParticipant(
        parseSurfaceAddTeamParticipantRequest(request.input)
      )
    case "updateTeamParticipant":
      return await app.teamConversations.updateParticipant(
        parseSurfaceUpdateTeamParticipantRequest(request.input)
      )
    case "setTeamCoordinator":
      return await app.teamConversations.setCoordinator(
        parseSurfaceSetTeamCoordinatorRequest(request.input)
      )
    case "submitTeamRound":
      return await app.teamConversations.submitRound(
        parseSurfaceSubmitTeamRoundRequest(request.input)
      )
    case "readPluginManagement":
      expectSurfaceNoInput(request.input, "readPluginManagement")
      return await app.pluginManagement.read()
    case "requestLocalPluginReview":
      expectSurfaceNoInput(request.input, "requestLocalPluginReview")
      return await app.pluginManagement.requestLocalReview()
    case "approveLocalPluginReview":
      return await app.pluginManagement.approveLocalReview(
        parseSurfaceApproveLocalPluginReviewRequest(request.input)
      )
    case "cancelLocalPluginReview":
      return await app.pluginManagement.cancelLocalReview(
        parseSurfaceCancelLocalPluginReviewRequest(request.input)
      )
    case "setPluginInstallState":
      return await app.pluginManagement.setInstallState(
        parseSurfaceSetPluginInstallStateRequest(request.input)
      )
    case "retryPluginRefresh":
      expectSurfaceNoInput(request.input, "retryPluginRefresh")
      return await app.pluginManagement.retryRefresh()
  }
}
