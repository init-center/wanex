import {
  SURFACE_COMMANDS,
  type SurfaceCommand,
  type SurfaceCommandDescriptor,
} from "@wanex/assistant";

export type RemoteAssistantSurfaceCommandKind =
  | "read"
  | "command"
  | "unavailable";

const ALL_COMMANDS = new Set<SurfaceCommand>(Object.values(SURFACE_COMMANDS));

// This exhaustive map is the remote authority boundary. A new Surface command
// must receive an explicit security review before this package can compile.
const REMOTE_COMMAND_POLICY = {
  [SURFACE_COMMANDS.status]: "read",
  [SURFACE_COMMANDS.readHome]: "read",
  [SURFACE_COMMANDS.readSettings]: "read",
  [SURFACE_COMMANDS.selectSession]: "command",
  [SURFACE_COMMANDS.renameSession]: "command",
  [SURFACE_COMMANDS.archiveSession]: "command",
  [SURFACE_COMMANDS.restoreSession]: "command",
  [SURFACE_COMMANDS.startNewConversation]: "command",
  [SURFACE_COMMANDS.setLayout]: "command",
  [SURFACE_COMMANDS.setMode]: "command",
  [SURFACE_COMMANDS.updatePreferences]: "command",
  [SURFACE_COMMANDS.listModelEndpoints]: "read",
  [SURFACE_COMMANDS.readAssistantCommands]: "read",
  [SURFACE_COMMANDS.setActiveModelEndpoint]: "command",
  [SURFACE_COMMANDS.dispatchAssistantCommand]: "command",
  [SURFACE_COMMANDS.dispatchAssistantCommandJson]: "command",
  [SURFACE_COMMANDS.previewAssistantCommandInvocation]: "command",
  [SURFACE_COMMANDS.executeAssistantCommand]: "command",
  [SURFACE_COMMANDS.readExecutionReference]: "read",
  [SURFACE_COMMANDS.listSchedules]: "read",
  [SURFACE_COMMANDS.readSchedule]: "read",
  [SURFACE_COMMANDS.createSchedule]: "command",
  [SURFACE_COMMANDS.replaceSchedule]: "command",
  [SURFACE_COMMANDS.setScheduleEnabled]: "command",
  [SURFACE_COMMANDS.removeSchedule]: "command",
  [SURFACE_COMMANDS.openWorkbench]: "command",
  [SURFACE_COMMANDS.readSessionTranscript]: "read",
  [SURFACE_COMMANDS.prepareConversationAttachment]: "unavailable",
  [SURFACE_COMMANDS.readConversationAttachments]: "read",
  [SURFACE_COMMANDS.removeConversationAttachment]: "command",
  [SURFACE_COMMANDS.submitConversationOperation]: "command",
  [SURFACE_COMMANDS.queueGuidedFollowUp]: "command",
  [SURFACE_COMMANDS.steerTrackedConversationOperation]: "command",
  [SURFACE_COMMANDS.startSideQuery]: "command",
  [SURFACE_COMMANDS.readSideQuery]: "read",
  [SURFACE_COMMANDS.cancelSideQuery]: "command",
  [SURFACE_COMMANDS.dismissSideQuery]: "command",
  [SURFACE_COMMANDS.startPlanGeneration]: "command",
  [SURFACE_COMMANDS.readPlanGeneration]: "read",
  [SURFACE_COMMANDS.cancelPlanGeneration]: "command",
  [SURFACE_COMMANDS.dismissPlanGeneration]: "command",
  [SURFACE_COMMANDS.selectPlanProposal]: "command",
  [SURFACE_COMMANDS.clearPlanProposalSelection]: "command",
  [SURFACE_COMMANDS.readPlanProposal]: "read",
  [SURFACE_COMMANDS.listPlanProposals]: "read",
  [SURFACE_COMMANDS.revisePlanProposal]: "command",
  [SURFACE_COMMANDS.decidePlanProposal]: "command",
  [SURFACE_COMMANDS.executePlanProposal]: "command",
  [SURFACE_COMMANDS.readGoal]: "read",
  [SURFACE_COMMANDS.startGoal]: "command",
  [SURFACE_COMMANDS.pauseGoal]: "command",
  [SURFACE_COMMANDS.resumeGoal]: "command",
  [SURFACE_COMMANDS.cancelGoal]: "command",
  [SURFACE_COMMANDS.readTrackedConversationOperation]: "read",
  [SURFACE_COMMANDS.cancelTrackedConversationOperation]: "command",
  [SURFACE_COMMANDS.regenerateTrackedConversationOperation]: "command",
  [SURFACE_COMMANDS.resolveTrackedConversationApproval]: "command",
  [SURFACE_COMMANDS.resolveTrackedConversationRecovery]: "command",
  [SURFACE_COMMANDS.listTeamConversations]: "read",
  [SURFACE_COMMANDS.readTeamConversation]: "read",
  [SURFACE_COMMANDS.selectTeamConversation]: "command",
  [SURFACE_COMMANDS.createTeamConversation]: "command",
  [SURFACE_COMMANDS.closeTeamConversation]: "command",
  [SURFACE_COMMANDS.addTeamParticipant]: "command",
  [SURFACE_COMMANDS.updateTeamParticipant]: "command",
  [SURFACE_COMMANDS.setTeamCoordinator]: "command",
  [SURFACE_COMMANDS.submitTeamRound]: "command",
  [SURFACE_COMMANDS.readPluginManagement]: "unavailable",
  [SURFACE_COMMANDS.requestLocalPluginReview]: "unavailable",
  [SURFACE_COMMANDS.approveLocalPluginReview]: "unavailable",
  [SURFACE_COMMANDS.cancelLocalPluginReview]: "unavailable",
  [SURFACE_COMMANDS.setPluginInstallState]: "unavailable",
  [SURFACE_COMMANDS.retryPluginRefresh]: "unavailable",
  [SURFACE_COMMANDS.readWorkspaceChange]: "read",
  [SURFACE_COMMANDS.decideWorkspaceChange]: "command",
  [SURFACE_COMMANDS.applyWorkspaceChange]: "command",
  [SURFACE_COMMANDS.undoWorkspaceChange]: "command",
  [SURFACE_COMMANDS.reapplyWorkspaceChange]: "command",
  [SURFACE_COMMANDS.listWorkspaceFolders]: "read",
  // Directory selection is a trusted local Host dialog; a remote client cannot open it.
  [SURFACE_COMMANDS.grantWorkspaceFolder]: "unavailable",
  [SURFACE_COMMANDS.regrantWorkspaceFolder]: "command",
  [SURFACE_COMMANDS.revokeWorkspaceFolder]: "command",
} as const satisfies Record<SurfaceCommand, RemoteAssistantSurfaceCommandKind>;

export function isSurfaceCommand(value: unknown): value is SurfaceCommand {
  return typeof value === "string" && ALL_COMMANDS.has(value as SurfaceCommand);
}

export function remoteAssistantSurfaceCommandKind(
  command: SurfaceCommand,
): RemoteAssistantSurfaceCommandKind {
  return REMOTE_COMMAND_POLICY[command];
}

export function projectRemoteAssistantSurfaceCommands(
  commands: readonly SurfaceCommandDescriptor[],
): readonly SurfaceCommandDescriptor[] {
  return commands.filter(
    ({ command }) => remoteAssistantSurfaceCommandKind(command) !== "unavailable",
  );
}
