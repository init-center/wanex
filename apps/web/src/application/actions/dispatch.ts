import type { CreateSurfaceOptions, Action, ActionDispatchOptions } from "../model.js"
import type { SurfaceEnvelopeLike } from "./model.js"

export async function dispatchAction(
  options: CreateSurfaceOptions,
  action: Action,
  actionOptions: ActionDispatchOptions | undefined
): Promise<SurfaceEnvelopeLike> {
  switch (action.type) {
    case "refresh":
      return await options.client.status()
    case "start-new-conversation":
      return await options.client.startNewConversation()
    case "select-session":
      return await options.client.selectSession({ sessionId: action.sessionId })
    case "rename-session":
      return await options.client.renameSession(action.input)
    case "archive-session":
      return await options.client.archiveSession(action.input)
    case "restore-session":
      return await options.client.restoreSession(action.input)
    case "set-layout":
      return await options.client.setLayout(action.input)
    case "set-mode":
      return await options.client.setMode(action.input)
    case "update-preferences":
      return await options.client.updatePreferences(action.input)
    case "set-active-model-endpoint":
      return await options.client.setActiveModelEndpoint(action.input)
    case "preview-command":
      return await options.client.previewProductCommandInvocation(action.input)
    case "execute-command":
      return await options.client.executeProductCommand(action.input)
    case "refresh-execution":
      return await options.client.readExecutionReference(action.input)
    case "open-workbench":
      return await options.client.openWorkbench(action.input)
    case "submit-conversation":
      return await options.client.submitConversationOperation(action.input)
    case "queue-guided-follow-up":
      return await options.client.queueGuidedFollowUp(action.input)
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
        { requestId: actionOptions.requestId }
      )
    case "start-side-query":
      return await options.client.startSideQuery(action.input)
    case "cancel-side-query":
      return await options.client.cancelSideQuery(action.input)
    case "dismiss-side-query":
      return await options.client.dismissSideQuery(action.input)
    case "start-plan-generation":
      return await options.client.startPlanGeneration(action.input)
    case "cancel-plan-generation":
      return await options.client.cancelPlanGeneration(action.input)
    case "dismiss-plan-generation":
      return await options.client.dismissPlanGeneration(action.input)
    case "revise-plan-proposal":
      return await options.client.revisePlanProposal(action.input)
    case "decide-plan-proposal":
      return await options.client.decidePlanProposal(action.input)
    case "execute-plan-proposal":
      return await options.client.executePlanProposal(action.input)
    case "start-goal":
      return await options.client.startGoal(action.input)
    case "pause-goal":
      return await options.client.pauseGoal(action.input)
    case "resume-goal":
      return await options.client.resumeGoal(action.input)
    case "cancel-goal":
      return await options.client.cancelGoal(action.input)
    case "remove-conversation-attachment":
      return await options.client.removeConversationAttachment(action.input)
    case "refresh-conversation":
      return await options.client.readTrackedConversationOperation(action.input)
    case "load-earlier-history":
      return await options.client.readSessionTranscript(action.input)
    case "cancel-conversation":
      return await options.client.cancelTrackedConversationOperation(
        action.input
      )
    case "regenerate-conversation":
      return await options.client.regenerateTrackedConversationOperation(
        action.input
      )
    case "resolve-conversation-recovery":
      return await options.client.resolveTrackedConversationRecovery(
        action.input
      )
    case "resolve-conversation-approval":
      return await options.client.resolveTrackedConversationApproval(
        action.input
      )
    case "create-team-conversation":
      return await options.client.createTeamConversation(action.input)
    case "select-team-conversation":
      return await options.client.selectTeamConversation({
        conversationId: action.conversationId
      })
    case "close-team-conversation":
      return await options.client.closeTeamConversation(action.input)
    case "add-team-participant":
      return await options.client.addTeamParticipant(action.input)
    case "update-team-participant":
      return await options.client.updateTeamParticipant(action.input)
    case "set-team-coordinator":
      return await options.client.setTeamCoordinator(action.input)
    case "submit-team-round":
      return await options.client.submitTeamRound(action.input)
    case "load-earlier-team-history":
      return await options.client.readTeamConversation(action.input)
    case "read-plugin-management":
      return await options.client.readPluginManagement()
    case "request-local-plugin-review":
      return await options.client.requestLocalPluginReview()
    case "approve-local-plugin-review":
      return await options.client.approveLocalPluginReview(action.input)
    case "cancel-local-plugin-review":
      return await options.client.cancelLocalPluginReview(action.input)
    case "set-plugin-install-state":
      return await options.client.setPluginInstallState(action.input)
    case "retry-plugin-refresh":
      return await options.client.retryPluginRefresh()
  }
}
