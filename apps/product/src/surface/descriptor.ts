import { BACKEND_INTEGRATION_CONTRACT } from "@wanex/product/backend"
import {
  SURFACE_COMMANDS,
  type SurfaceCommand,
  type SurfaceCommandDescriptor,
  type SurfaceDescriptor
} from "./model.js"

export const surfaceCommandDescriptors: readonly SurfaceCommandDescriptor[] =
  [
    {
      command: SURFACE_COMMANDS.status,
      title: "Read app status",
      input: "none",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.readHome,
      title: "Read app home",
      input: "home-options",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.readSettings,
      title: "Read app settings",
      input: "none",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.selectSession,
      title: "Select session",
      input: "session-selector",
      mutatesState: true
    },
    {
      command: SURFACE_COMMANDS.renameSession,
      title: "Rename session",
      input: "session-rename",
      mutatesState: true
    },
    {
      command: SURFACE_COMMANDS.archiveSession,
      title: "Archive session",
      input: "session-lifecycle",
      mutatesState: true
    },
    {
      command: SURFACE_COMMANDS.restoreSession,
      title: "Restore session",
      input: "session-lifecycle",
      mutatesState: true
    },
    {
      command: SURFACE_COMMANDS.startNewConversation,
      title: "Start new conversation",
      input: "new-conversation",
      mutatesState: true
    },
    {
      command: SURFACE_COMMANDS.setLayout,
      title: "Set layout",
      input: "layout-selector",
      mutatesState: true
    },
    {
      command: SURFACE_COMMANDS.setMode,
      title: "Set mode",
      input: "mode-selector",
      mutatesState: true
    },
    {
      command: SURFACE_COMMANDS.updatePreferences,
      title: "Update renderer preferences",
      input: "preferences-patch",
      mutatesState: true
    },
    {
      command: SURFACE_COMMANDS.listModelEndpoints,
      title: "List model endpoints",
      input: "none",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.readProductCommands,
      title: "Read product commands",
      input: "none",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.setActiveModelEndpoint,
      title: "Set active model endpoint",
      input: "model-endpoint-selector",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.dispatchProductCommand,
      title: "Dispatch product command",
      input: "product-command-request",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.dispatchProductCommandJson,
      title: "Dispatch product JSON command",
      input: "json-body",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.previewProductCommandInvocation,
      title: "Preview product command invocation",
      input: "product-command-invocation-preview",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.executeProductCommand,
      title: "Execute product command",
      input: "product-command-execution",
      mutatesState: true
    },
    {
      command: SURFACE_COMMANDS.readExecutionReference,
      title: "Read execution reference",
      input: "execution-reference",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.listSchedules,
      title: "List schedules",
      input: "schedule-list",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.readSchedule,
      title: "Read schedule",
      input: "schedule-read",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.createSchedule,
      title: "Create schedule",
      input: "schedule-create",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.replaceSchedule,
      title: "Replace schedule",
      input: "schedule-replace",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.setScheduleEnabled,
      title: "Enable or disable schedule",
      input: "schedule-enabled",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.removeSchedule,
      title: "Remove schedule",
      input: "schedule-remove",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.openWorkbench,
      title: "Open workbench",
      input: "workbench-open",
      mutatesState: true
    },
    {
      command: SURFACE_COMMANDS.readSessionTranscript,
      title: "Read session transcript",
      input: "conversation-transcript-read",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.prepareConversationAttachment,
      title: "Prepare conversation attachment",
      input: "conversation-attachment-prepare",
      mutatesState: true
    },
    {
      command: SURFACE_COMMANDS.readConversationAttachments,
      title: "Read conversation attachments",
      input: "conversation-attachment-read",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.removeConversationAttachment,
      title: "Remove conversation attachment",
      input: "conversation-attachment-remove",
      mutatesState: true
    },
    {
      command: SURFACE_COMMANDS.submitConversationOperation,
      title: "Submit conversation operation",
      input: "conversation-submit",
      mutatesState: true
    },
    {
      command: SURFACE_COMMANDS.queueGuidedFollowUp,
      title: "Queue guided follow-up",
      input: "conversation-guided-follow-up",
      mutatesState: true
    },
    {
      command: SURFACE_COMMANDS.steerTrackedConversationOperation,
      title: "Guide current conversation response",
      input: "conversation-steer",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.startSideQuery,
      title: "Start side query",
      input: "side-query-start",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.readSideQuery,
      title: "Read side query",
      input: "side-query-reference",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.cancelSideQuery,
      title: "Cancel side query",
      input: "side-query-reference",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.dismissSideQuery,
      title: "Dismiss side query",
      input: "side-query-reference",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.startPlanGeneration,
      title: "Start Plan generation",
      input: "plan-generation-start",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.readPlanGeneration,
      title: "Read Plan generation",
      input: "plan-generation-reference",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.cancelPlanGeneration,
      title: "Cancel Plan generation",
      input: "plan-generation-reference",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.dismissPlanGeneration,
      title: "Dismiss Plan generation",
      input: "plan-generation-reference",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.selectPlanProposal,
      title: "Select Plan proposal",
      input: "plan-proposal-selector",
      mutatesState: true
    },
    {
      command: SURFACE_COMMANDS.clearPlanProposalSelection,
      title: "Clear Plan proposal selection",
      input: "none",
      mutatesState: true
    },
    {
      command: SURFACE_COMMANDS.readPlanProposal,
      title: "Read Plan proposal",
      input: "plan-proposal-read",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.listPlanProposals,
      title: "List Plan proposals",
      input: "plan-proposal-list",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.revisePlanProposal,
      title: "Revise Plan proposal",
      input: "plan-proposal-revise",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.decidePlanProposal,
      title: "Decide Plan proposal",
      input: "plan-proposal-decision",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.executePlanProposal,
      title: "Execute approved Plan proposal",
      input: "plan-proposal-execution",
      mutatesState: true
    },
    {
      command: SURFACE_COMMANDS.readGoal,
      title: "Read Session Goal",
      input: "goal-read",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.startGoal,
      title: "Start Session Goal",
      input: "goal-start",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.pauseGoal,
      title: "Pause Session Goal",
      input: "goal-state-change",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.resumeGoal,
      title: "Resume Session Goal",
      input: "goal-state-change",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.cancelGoal,
      title: "Cancel Session Goal",
      input: "goal-cancel",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.readTrackedConversationOperation,
      title: "Read tracked conversation operation",
      input: "conversation-read",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.cancelTrackedConversationOperation,
      title: "Cancel tracked conversation operation",
      input: "conversation-cancel",
      mutatesState: false
    },
    {
      command:
        SURFACE_COMMANDS.regenerateTrackedConversationOperation,
      title: "Regenerate tracked conversation operation",
      input: "conversation-regenerate",
      mutatesState: true
    },
    {
      command: SURFACE_COMMANDS.resolveTrackedConversationApproval,
      title: "Resolve tracked conversation approval",
      input: "conversation-approval-resolve",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.resolveTrackedConversationRecovery,
      title: "Resolve tracked conversation recovery",
      input: "conversation-recovery-resolve",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.listTeamConversations,
      title: "List group conversations",
      input: "team-conversation-list",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.readTeamConversation,
      title: "Read group conversation",
      input: "team-conversation-read",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.selectTeamConversation,
      title: "Select group conversation",
      input: "team-conversation-selector",
      mutatesState: true
    },
    {
      command: SURFACE_COMMANDS.createTeamConversation,
      title: "Create group conversation",
      input: "team-conversation-create",
      mutatesState: true
    },
    {
      command: SURFACE_COMMANDS.closeTeamConversation,
      title: "Close group conversation",
      input: "team-conversation-close",
      mutatesState: true
    },
    {
      command: SURFACE_COMMANDS.addTeamParticipant,
      title: "Add group participant",
      input: "team-participant-add",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.updateTeamParticipant,
      title: "Update group participant",
      input: "team-participant-update",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.setTeamCoordinator,
      title: "Set group coordinator",
      input: "team-coordinator-set",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.submitTeamRound,
      title: "Submit group round",
      input: "team-round-submit",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.readPluginManagement,
      title: "Read Plugin management",
      input: "none",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.requestLocalPluginReview,
      title: "Choose a local Plugin for review",
      input: "none",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.approveLocalPluginReview,
      title: "Approve a local Plugin review",
      input: "plugin-review-approval",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.cancelLocalPluginReview,
      title: "Cancel a local Plugin review",
      input: "plugin-review-cancel",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.setPluginInstallState,
      title: "Change a Plugin install state",
      input: "plugin-install-state-change",
      mutatesState: false
    },
    {
      command: SURFACE_COMMANDS.retryPluginRefresh,
      title: "Retry Plugin refresh",
      input: "none",
      mutatesState: false
    }
  ]

export const knownSurfaceCommands = new Set<string>(
  surfaceCommandDescriptors.map((descriptor) => descriptor.command)
)

export function surfaceDescriptor(): SurfaceDescriptor {
  return {
    kind: "product.surface-descriptor",
    transport: "app-owned-ipc-or-api",
    commandCount: surfaceCommandDescriptors.length,
    rendererBoundary: BACKEND_INTEGRATION_CONTRACT.rendererBoundary,
    commands: surfaceCommandDescriptors
  }
}

export function surfaceCommandMutatesState(
  command: SurfaceCommand
): boolean {
  return (
    surfaceCommandDescriptors.find(
      (descriptor) => descriptor.command === command
    )?.mutatesState ?? false
  )
}
