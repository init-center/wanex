import type { CreateSurfaceOptions, Action, ActionDispatchOptions } from "../model.js"
import type { SurfaceEnvelopeLike } from "./model.js"

export async function dispatchAction(
  options: CreateSurfaceOptions,
  action: Action,
  actionOptions: ActionDispatchOptions | undefined
): Promise<SurfaceEnvelopeLike> {
  const requestOptions = actionOptions?.requestId === undefined
    ? undefined
    : { requestId: actionOptions.requestId }
  switch (action.type) {
    case "refresh":
      return await options.client.status(requestOptions)
    case "start-new-conversation":
      return await options.client.startNewConversation(requestOptions)
    case "select-session":
      return await options.client.selectSession(
        { sessionId: action.sessionId },
        requestOptions
      )
    case "rename-session":
      return await options.client.renameSession(action.input, requestOptions)
    case "archive-session":
      return await options.client.archiveSession(action.input, requestOptions)
    case "restore-session":
      return await options.client.restoreSession(action.input, requestOptions)
    case "set-layout":
      return await options.client.setLayout(action.input, requestOptions)
    case "set-mode":
      return await options.client.setMode(action.input, requestOptions)
    case "update-preferences":
      return await options.client.updatePreferences(action.input, requestOptions)
    case "set-active-model-endpoint":
      return await options.client.setActiveModelEndpoint(action.input, requestOptions)
    case "preview-command":
      return await options.client.previewAssistantCommandInvocation(
        action.input,
        requestOptions
      )
    case "execute-command":
      return await options.client.executeAssistantCommand(action.input, requestOptions)
    case "read-schedule":
      return await options.client.readSchedule(action.input, requestOptions)
    case "create-schedule":
      return await options.client.createSchedule(action.input, requestOptions)
    case "replace-schedule":
      return await options.client.replaceSchedule(action.input, requestOptions)
    case "set-schedule-enabled":
      return await options.client.setScheduleEnabled(action.input, requestOptions)
    case "remove-schedule":
      return await options.client.removeSchedule(action.input, requestOptions)
    case "refresh-execution":
      return await options.client.readExecutionReference(action.input, requestOptions)
    case "open-workbench":
      return await options.client.openWorkbench(action.input, requestOptions)
    case "submit-conversation":
      return await options.client.submitConversationOperation(action.input, requestOptions)
    case "queue-guided-follow-up":
      return await options.client.queueGuidedFollowUp(action.input, requestOptions)
    case "steer-current-response":
      if (actionOptions?.requestId === undefined) {
        return {
          ok: false,
          error: {
            message: "Guide current requires a trusted request identity"
          }
        }
      }
      return await options.client.steerTrackedConversationOperation(
        action.input,
        requestOptions as { readonly requestId: string }
      )
    case "start-side-query":
      return await options.client.startSideQuery(action.input, requestOptions)
    case "cancel-side-query":
      return await options.client.cancelSideQuery(action.input, requestOptions)
    case "dismiss-side-query":
      return await options.client.dismissSideQuery(action.input, requestOptions)
    case "start-plan-generation":
      return await options.client.startPlanGeneration(action.input, requestOptions)
    case "cancel-plan-generation":
      return await options.client.cancelPlanGeneration(action.input, requestOptions)
    case "dismiss-plan-generation":
      return await options.client.dismissPlanGeneration(action.input, requestOptions)
    case "revise-plan-proposal":
      return await options.client.revisePlanProposal(action.input, requestOptions)
    case "decide-plan-proposal":
      return await options.client.decidePlanProposal(action.input, requestOptions)
    case "execute-plan-proposal":
      return await options.client.executePlanProposal(action.input, requestOptions)
    case "start-goal":
      return await options.client.startGoal(action.input, requestOptions)
    case "pause-goal":
      return await options.client.pauseGoal(action.input, requestOptions)
    case "resume-goal":
      return await options.client.resumeGoal(action.input, requestOptions)
    case "cancel-goal":
      return await options.client.cancelGoal(action.input, requestOptions)
    case "remove-conversation-attachment":
      return await options.client.removeConversationAttachment(action.input, requestOptions)
    case "grant-workspace-folder":
      return await options.client.grantWorkspaceFolder(action.input, requestOptions)
    case "regrant-workspace-folder":
      return await options.client.regrantWorkspaceFolder(action.input, requestOptions)
    case "revoke-workspace-folder":
      return await options.client.revokeWorkspaceFolder(action.input, requestOptions)
    case "read-workspace-change":
      return await options.client.readWorkspaceChange(action.input, requestOptions)
    case "decide-workspace-change":
      return await options.client.decideWorkspaceChange(action.input, requestOptions)
    case "apply-workspace-change":
      return await options.client.applyWorkspaceChange(action.input, requestOptions)
    case "undo-workspace-change":
      return await options.client.undoWorkspaceChange(action.input, requestOptions)
    case "reapply-workspace-change":
      return await options.client.reapplyWorkspaceChange(action.input, requestOptions)
    case "refresh-conversation":
      return await options.client.readTrackedConversationOperation(
        action.input,
        requestOptions
      )
    case "load-earlier-history":
      return await options.client.readSessionTranscript(action.input, requestOptions)
    case "cancel-conversation":
      return await options.client.cancelTrackedConversationOperation(
        action.input,
        requestOptions
      )
    case "regenerate-conversation":
      return await options.client.regenerateTrackedConversationOperation(
        action.input,
        requestOptions
      )
    case "resolve-conversation-recovery":
      return await options.client.resolveTrackedConversationRecovery(
        action.input,
        requestOptions
      )
    case "resolve-conversation-approval":
      return await options.client.resolveTrackedConversationApproval(
        action.input,
        requestOptions
      )
    case "create-team-conversation":
      return await options.client.createTeamConversation(action.input, requestOptions)
    case "select-team-conversation":
      return await options.client.selectTeamConversation({
        conversationId: action.conversationId
      }, requestOptions)
    case "close-team-conversation":
      return await options.client.closeTeamConversation(action.input, requestOptions)
    case "add-team-participant":
      return await options.client.addTeamParticipant(action.input, requestOptions)
    case "update-team-participant":
      return await options.client.updateTeamParticipant(action.input, requestOptions)
    case "set-team-coordinator":
      return await options.client.setTeamCoordinator(action.input, requestOptions)
    case "submit-team-round":
      return await options.client.submitTeamRound(action.input, requestOptions)
    case "load-earlier-team-history":
      return await options.client.readTeamConversation(action.input, requestOptions)
    case "read-plugin-management":
      return await options.client.readPluginManagement(requestOptions)
    case "request-local-plugin-review":
      return await options.client.requestLocalPluginReview(requestOptions)
    case "approve-local-plugin-review":
      return await options.client.approveLocalPluginReview(action.input, requestOptions)
    case "cancel-local-plugin-review":
      return await options.client.cancelLocalPluginReview(action.input, requestOptions)
    case "set-plugin-install-state":
      return await options.client.setPluginInstallState(action.input, requestOptions)
    case "retry-plugin-refresh":
      return await options.client.retryPluginRefresh(requestOptions)
  }
}
