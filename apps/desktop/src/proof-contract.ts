export const WANEX_DESKTOP_PROOF_HEADING = "Desktop assistant proof"
export const WANEX_DESKTOP_PROOF_CODE = "structured timeline"
export const WANEX_DESKTOP_PROOF_INITIAL_MODEL_ID = "desktop-proof-primary-model"
export const WANEX_DESKTOP_PROOF_SELECTED_DRAFT_MODEL_ID =
  "desktop-proof-selected-draft-model"
export const WANEX_DESKTOP_PROOF_SELECTED_MODEL_ID = "desktop-proof-selected-model"
export const WANEX_DESKTOP_PROOF_SELECTED_RESPONSE =
  `Proof response from ${WANEX_DESKTOP_PROOF_SELECTED_MODEL_ID}`
export const WANEX_DESKTOP_PROOF_FALLBACK_RESPONSE =
  `Proof response from ${WANEX_DESKTOP_PROOF_INITIAL_MODEL_ID}`
export const WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID =
  "desktop-proof-relaunch-model"
export const WANEX_DESKTOP_PROOF_RELAUNCH_RESPONSE =
  `Proof response from ${WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID}`
export const WANEX_DESKTOP_PROOF_CODING_MESSAGE =
  "WANEX_CODING_PROOF_V1 Create and review the coding proof file"
export const WANEX_DESKTOP_PROOF_CODING_TOOL_CALL_ID =
  "call_desktop_proof_coding_changes"
export const WANEX_DESKTOP_PROOF_CODING_TOOL_NAME =
  "workspace_apply_changeset"
export const WANEX_DESKTOP_PROOF_CODING_FILE = "coding-proof.txt"
export const WANEX_DESKTOP_PROOF_CODING_FILE_CONTENT =
  "created by the Wanex coding proof\n"
export const WANEX_DESKTOP_PROOF_CODING_RESPONSE =
  "The reviewed coding proof change is complete"
export const WANEX_DESKTOP_PROOF_REMOTE_CREDENTIAL =
  "wanex-packaged-remote-coding-proof-token"
export const WANEX_DESKTOP_PROOF_REMOTE_PROFILE_ID = "packaged-remote"
export const WANEX_DESKTOP_PROOF_REMOTE_PROFILE_NAME = "Packaged Remote Host"
export const WANEX_DESKTOP_PROOF_REMOTE_PROJECT_ID = "packaged-remote-project"
export const WANEX_DESKTOP_PROOF_CODING_RECOVERY_MESSAGE =
  "WANEX_CODING_RECOVERY_PROOF_V1 Reconcile the recoverable coding operation"
export const WANEX_DESKTOP_PROOF_CODING_RECOVERY_TOOL_NAME =
  "coding_recovery_probe"
export const WANEX_DESKTOP_PROOF_CODING_RECOVERY_RESPONSE =
  "The recoverable coding operation was reconciled"
export const WANEX_DESKTOP_PROOF_TEAM_TITLE = "Installed team acceptance"
export const WANEX_DESKTOP_PROOF_TEAM_MESSAGE =
  "Prove the installed team delivery path"
export const WANEX_DESKTOP_PROOF_SCHEDULE_TITLE =
  "Packaged schedule acceptance"
export const WANEX_DESKTOP_PROOF_SCHEDULE_PROMPT =
  "Packaged schedule acceptance must run through the trusted host"
export const WANEX_DESKTOP_PROOF_SCHEDULE_PARTIAL_RESPONSE =
  "The packaged schedule response started"
export const WANEX_DESKTOP_PROOF_SCHEDULE_FINAL_DELTA =
  " and completed after the overlap window"
export const WANEX_DESKTOP_PROOF_SCHEDULE_RESPONSE =
  `${WANEX_DESKTOP_PROOF_SCHEDULE_PARTIAL_RESPONSE}${WANEX_DESKTOP_PROOF_SCHEDULE_FINAL_DELTA}`
export const WANEX_DESKTOP_PROOF_SCHEDULE_RESTORED_RESPONSE =
  "The restored packaged schedule response is complete"
export const WANEX_DESKTOP_PROOF_SCHEDULE_RELEASE_MARKER =
  "WANEX_DESKTOP_SCHEDULE_RELEASE_V1"
export const WANEX_DESKTOP_PROOF_SCHEDULE_INTERVAL_SECONDS = 5
export const WANEX_DESKTOP_PROOF_SCHEDULE_HOLD_MS = 12_000
export const WANEX_DESKTOP_PROOF_SCHEDULE_QUIET_WINDOW_MS = 6_000
export const WANEX_DESKTOP_PROOF_RELAUNCH_HEADING =
  "Wanex relaunch continuity proof"
export const WANEX_DESKTOP_PROOF_RELAUNCH_CODE = "canonical transcript"
export const WANEX_DESKTOP_PROOF_RELAUNCH_TEXT = [
  `# ${WANEX_DESKTOP_PROOF_RELAUNCH_HEADING}`,
  "",
  "```text",
  WANEX_DESKTOP_PROOF_RELAUNCH_CODE,
  "```"
].join("\n")
export const WANEX_DESKTOP_PROOF_RELAUNCH_FOLLOW_UP =
  "Continue the existing conversation after reopening"
export const WANEX_DESKTOP_PROOF_CANCEL_REGENERATE_TEXT =
  "WANEX_CANCEL_REGENERATE_V1 Cancel this response and regenerate it"
export const WANEX_DESKTOP_PROOF_CANCEL_PARTIAL_RESPONSE =
  "This cancelled Wanex proof response must remain transient"
export const WANEX_DESKTOP_PROOF_REGENERATED_RESPONSE =
  "The regenerated Wanex proof response is complete"
export const WANEX_DESKTOP_PROOF_GUIDED_PARENT_TEXT =
  "WANEX_GUIDED_PARENT_V1 Complete the current response before the next instruction"
export const WANEX_DESKTOP_PROOF_GUIDED_FOLLOW_UP_TEXT =
  "WANEX_GUIDED_CHILD_V1 Then complete this queued follow-up"
export const WANEX_DESKTOP_PROOF_GUIDED_PARENT_PARTIAL_RESPONSE =
  "The guided Wanex parent response started"
export const WANEX_DESKTOP_PROOF_GUIDED_PARENT_FINAL_DELTA =
  " and completed before the queued follow-up"
export const WANEX_DESKTOP_PROOF_GUIDED_PARENT_RESPONSE =
  `${WANEX_DESKTOP_PROOF_GUIDED_PARENT_PARTIAL_RESPONSE}${WANEX_DESKTOP_PROOF_GUIDED_PARENT_FINAL_DELTA}`
export const WANEX_DESKTOP_PROOF_GUIDED_CHILD_RESPONSE =
  "The queued Wanex follow-up response is complete"
export const WANEX_DESKTOP_PROOF_GUIDED_RELEASE_MARKER =
  "WANEX_DESKTOP_GUIDED_FOLLOW_UP_PENDING_V1"
export const WANEX_DESKTOP_PROOF_SIDE_QUERY_PARENT_TEXT =
  "WANEX_SIDE_QUERY_PARENT_V1 Keep this parent response active"
export const WANEX_DESKTOP_PROOF_SIDE_QUERY_QUESTION =
  "WANEX_SIDE_QUERY_V1 What is the current parent instruction?"
export const WANEX_DESKTOP_PROOF_SIDE_QUERY_ANSWER =
  "The current parent instruction is still active"
export const WANEX_DESKTOP_PROOF_SIDE_QUERY_PARENT_PARTIAL_RESPONSE =
  "The Wanex side-query parent response started"
export const WANEX_DESKTOP_PROOF_SIDE_QUERY_PARENT_FINAL_DELTA =
  " and completed after the aside was dismissed"
export const WANEX_DESKTOP_PROOF_SIDE_QUERY_PARENT_RESPONSE =
  `${WANEX_DESKTOP_PROOF_SIDE_QUERY_PARENT_PARTIAL_RESPONSE}${WANEX_DESKTOP_PROOF_SIDE_QUERY_PARENT_FINAL_DELTA}`
export const WANEX_DESKTOP_PROOF_SIDE_QUERY_RELEASE_MARKER =
  "WANEX_DESKTOP_SIDE_QUERY_DISMISSED_V1"
export const WANEX_DESKTOP_PLUGIN_PROOF_EXPECTED = {
  pluginId: "wanex.proof.extension",
  commandId: "wanex.proof.extension.echo",
  v1Version: "1.0.0",
  v2Version: "2.0.0",
} as const
export const WANEX_DESKTOP_PROOF_MULTIMODAL_TEXT =
  "Describe the attached Wanex proof image"
export const WANEX_DESKTOP_PROOF_MULTIMODAL_IMAGE_LABEL =
  "wanex-proof-image.png"
export const WANEX_DESKTOP_PROOF_UNSUPPORTED_DRAFT =
  "Keep this draft after rejecting an unsupported attachment"
export const WANEX_DESKTOP_PROOF_IMAGE_GENERATION_MODEL_ID =
  "desktop-proof-image-model"
export const WANEX_DESKTOP_PROOF_IMAGE_GENERATION_TEXT =
  "Generate a small Wanex proof image"
export const WANEX_DESKTOP_PROOF_IMAGE_GENERATION_PROMPT =
  "a small Wanex proof image"
export const WANEX_DESKTOP_PROOF_IMAGE_GENERATION_RESPONSE =
  "The Wanex proof image is ready"
export const WANEX_DESKTOP_PROOF_PLAN_REQUEST =
  "Plan the next safe Wanex proof step"
export const WANEX_DESKTOP_PROOF_PLAN_TITLE = "Reviewed Wanex proof plan"
export const WANEX_DESKTOP_PROOF_PLAN_SUMMARY =
  "Execute one approved step through the canonical conversation path"
export const WANEX_DESKTOP_PROOF_PLAN_STEP_ID = "execute-canonically"
export const WANEX_DESKTOP_PROOF_PLAN_STEP_TITLE =
  "Execute the approved proof step"
export const WANEX_DESKTOP_PROOF_PLAN_RESPONSE =
  "The approved Wanex proof plan is complete"
export const WANEX_DESKTOP_PROOF_GOAL_OBJECTIVE =
  "Complete the installed Wanex proof goal"
export const WANEX_DESKTOP_PROOF_GOAL_CRITERION =
  "Independent verification passes after one automatic continuation"
export const WANEX_DESKTOP_PROOF_GOAL_FIRST_RESPONSE =
  "The first Wanex proof goal attempt is complete"
export const WANEX_DESKTOP_PROOF_GOAL_FINAL_RESPONSE =
  "The second Wanex proof goal attempt is complete"
export const WANEX_DESKTOP_PROOF_GOAL_FIRST_VERIFICATION_REASON =
  "One automatic continuation is required"
export const WANEX_DESKTOP_PROOF_GOAL_FINAL_VERIFICATION_REASON =
  "The installed Wanex proof goal is independently verified"
export const WANEX_DESKTOP_PROOF_TEXT = [
  `# ${WANEX_DESKTOP_PROOF_HEADING}`,
  "",
  "```text",
  WANEX_DESKTOP_PROOF_CODE,
  "```"
].join("\n")

export interface WanexDesktopRendererProofResult {
  readonly ok: boolean
  readonly failureStage?: string
  readonly failureDiagnostics?: {
    readonly surfaceCount: number
    readonly userRowCount: number
    readonly assistantRowCount: number
    readonly composerCount: number
    readonly composerDisabled: boolean
    readonly modelSelectorCount: number
    readonly modelSelectorDisabled: boolean
    readonly providerState?: string
    readonly errorVisible: boolean
    readonly activeSessionCount: number
    readonly activeSessionIdPresent: boolean
    readonly richHeadingVisible: boolean
    readonly richCodeVisible: boolean
    readonly selectedResponseVisible: boolean
  }
  readonly sessionId: string
  readonly providerConfigured: boolean
  readonly providerEditedWithoutCredential: boolean
  readonly configuredProviderCount: number
  readonly providerEvidenceRedacted: boolean
  readonly activeProviderRemoved: boolean
  readonly fallbackProviderReady: boolean
  readonly fallbackModelId: string
  readonly fallbackModelResponseVisible: boolean
  readonly providerLifecycleWithoutRestart: boolean
  readonly initialLayout: {
    readonly viewportWidth: number
    readonly viewportHeight: number
    readonly shellTop: number
    readonly shellBottom: number
    readonly sidebarWidth: number
    readonly timelineHeight: number
    readonly composerDockHeight: number
    readonly composerHeight: number
    readonly shellStartsAtViewportTop: boolean
    readonly shellFitsViewport: boolean
    readonly noHorizontalOverflow: boolean
    readonly settingsTriggerFullyVisible: boolean
    readonly settingsPanelInitiallyClosed: boolean
    readonly sidebarVisible: boolean
    readonly composerFullyVisible: boolean
    readonly initialScrollPolicyValid: boolean
  }
  readonly userVisible: boolean
  readonly assistantVisible: boolean
  readonly providerReady: boolean
  readonly modelSelectorVisible: boolean
  readonly modelSwitchAccepted: boolean
  readonly draftPreservedAcrossModelSwitch: boolean
  readonly selectedModelEndpointId: string
  readonly selectedModelId: string
  readonly selectedModelResponseVisible: boolean
  readonly richHeadingVisible: boolean
  readonly richCodeVisible: boolean
  readonly selectedSessionTitle: string
  readonly listedSessionTitle: string
  readonly conversationIdentityIntegrity: boolean
  readonly soleAssistantRenderer: boolean
  readonly unknownRouteRejected: boolean
  readonly sessionNavigationTruth: boolean
  readonly canonicalTranscriptIntegrity: boolean
  readonly conversationTimelineSemantics: boolean
  readonly chatFirstInformationArchitecture: boolean
  readonly conversationSpaceAllocation: boolean
  readonly composerVisible: boolean
  readonly latestAssistantVisible: boolean
  readonly workflowsContextual: boolean
  readonly composerControlsComplete: boolean
  readonly commandPaletteContextual: boolean
  readonly canonicalCommandPreviewed: boolean
  readonly canonicalCommandExecuted: boolean
  readonly commandCompletionVisible: boolean
  readonly internalExecutionIdentitiesHidden: boolean
  readonly developerControlsAbsent: boolean
  readonly timingsMs: {
    readonly rendererInteractive: number
    readonly conversationSettlement: number
    readonly rendererPostSettlement: number
  }
}

export type WanexDesktopProviderRelaunchProofStep =
  | "relaunch-configure"
  | "relaunch-chat"
  | "relaunch-coding"
  | "relaunch-cancel-regenerate"
  | "relaunch-guided-follow-up"
  | "relaunch-side-query"
  | "relaunch-multimodal"
  | "relaunch-image-generation"
  | "relaunch-plan"
  | "relaunch-goal"
  | "relaunch-cleanup"
  | "relaunch-unconfigured"

export type WanexDesktopRemoteCodingProofStep = "relaunch-remote-coding"

export type WanexDesktopTeamProofStep = "relaunch-team"

export type WanexDesktopScheduleProofStep =
  | "relaunch-schedule-create"
  | "relaunch-schedule-restore"

interface WanexDesktopScheduleProofResultBase {
  readonly ok: boolean
  readonly step: WanexDesktopScheduleProofStep
  readonly providerReady: boolean
  readonly providerEvidenceRedacted: boolean
  readonly internalIdentityEvidenceHidden: boolean
  readonly intervalSeconds: number
  readonly timingsMs: {
    readonly rendererInteractive: number
    readonly conversationSettlement: number
    readonly rendererPostSettlement: number
  }
}

export interface WanexDesktopScheduleCreateProofResult
  extends WanexDesktopScheduleProofResultBase {
  readonly step: "relaunch-schedule-create"
  readonly visibleFormCreated: boolean
  readonly isolatedSessionSelected: boolean
  readonly activeModelSelected: boolean
  readonly skipMisfireSelected: boolean
  readonly enabledAtCreation: boolean
  readonly scheduleCreated: boolean
  readonly scheduleSessionVisible: boolean
  readonly firstUserVisible: boolean
  readonly firstPartialResponseVisible: boolean
  readonly firstFinalResponseVisible: boolean
  readonly disabledBeforeRelease: boolean
  readonly disabledQuietWindowObserved: boolean
}

export interface WanexDesktopScheduleRestoreProofResult
  extends WanexDesktopScheduleProofResultBase {
  readonly step: "relaunch-schedule-restore"
  readonly restoredDefinitionVisible: boolean
  readonly restoredDisabledState: boolean
  readonly persistedTranscriptVisible: boolean
  readonly reenabled: boolean
  readonly restoredExecutionUserVisible: boolean
  readonly restoredExecutionResponseVisible: boolean
  readonly disabledAfterExecution: boolean
  readonly disabledQuietWindowObserved: boolean
  readonly removed: boolean
  readonly canonicalRemovedStateVisible: boolean
}

export type WanexDesktopScheduleProofResult =
  | WanexDesktopScheduleCreateProofResult
  | WanexDesktopScheduleRestoreProofResult

export type WanexDesktopPluginProofStep =
  | "relaunch-plugin-install"
  | "relaunch-plugin-restore"

export interface WanexDesktopPluginProofExpected {
  readonly pluginId: string
  readonly commandId: string
  readonly v1Version: string
  readonly v2Version: string
}

interface WanexDesktopPluginProofResultBase
  extends WanexDesktopPluginProofExpected {
  readonly ok: boolean
  readonly step: WanexDesktopPluginProofStep
  readonly providerEvidenceRedacted: boolean
  readonly pathEvidenceHidden: boolean
  readonly internalIdentityEvidenceHidden: boolean
  readonly timingsMs: {
    readonly rendererInteractive: number
    readonly conversationSettlement: number
    readonly rendererPostSettlement: number
  }
}

export interface WanexDesktopPluginInstallProofResult
  extends WanexDesktopPluginProofResultBase {
  readonly step: "relaunch-plugin-install"
  readonly initialEmptyStateVisible: boolean
  readonly cancelReviewEvidenceVisible: boolean
  readonly reviewCancelled: boolean
  readonly cancelledReviewNotInstalled: boolean
  readonly v1Installed: boolean
  readonly v1CommandAvailable: boolean
  readonly v1CommandExecuted: boolean
  readonly v1Disabled: boolean
  readonly commandAbsentWhileDisabled: boolean
  readonly v1Enabled: boolean
  readonly commandReturnedAfterEnable: boolean
  readonly v2ReviewEvidenceVisible: boolean
  readonly attentionVisible: boolean
  readonly attentionDiagnosticVisible: boolean
  readonly retryAvailable: boolean
  readonly retryRecovered: boolean
  readonly v2Installed: boolean
  readonly v1DisabledAfterReplacement: boolean
  readonly singleActiveVersion: boolean
  readonly v2CommandExecuted: boolean
}

export interface WanexDesktopPluginRestoreProofResult
  extends WanexDesktopPluginProofResultBase {
  readonly step: "relaunch-plugin-restore"
  readonly reviewTransientAbsent: boolean
  readonly busyTransientAbsent: boolean
  readonly v1DisabledRestored: boolean
  readonly v2InstalledRestored: boolean
  readonly singleActiveVersionRestored: boolean
  readonly commandRestored: boolean
  readonly restoredCommandExecuted: boolean
  readonly v2Removed: boolean
  readonly v1Removed: boolean
  readonly canonicalRemovedStateVisible: boolean
  readonly commandAbsentAfterRemoval: boolean
}

export type WanexDesktopPluginProofResult =
  | WanexDesktopPluginInstallProofResult
  | WanexDesktopPluginRestoreProofResult

export interface WanexDesktopTeamProofResult {
  readonly ok: boolean
  readonly step: WanexDesktopTeamProofStep
  readonly providerReady: boolean
  readonly providerEvidenceRedacted: boolean
  readonly existingAgentSessionAvailable: boolean
  readonly groupCreated: boolean
  readonly groupSelected: boolean
  readonly groupTitleVisible: boolean
  readonly coordinatedModeDefault: boolean
  readonly zeroAgentStateTruthful: boolean
  readonly coordinatorRequired: boolean
  readonly coordinatorAssigned: boolean
  readonly coordinatorMemberGuards: boolean
  readonly contextAutoOpened: boolean
  readonly teamTimelineVisible: boolean
  readonly teamComposerVisible: boolean
  readonly contextVisible: boolean
  readonly participantAdded: boolean
  readonly participantCount: number
  readonly participantNameVisible: boolean
  readonly roundSubmitted: boolean
  readonly activeRoundObserved: boolean
  readonly automaticTerminalRefresh: boolean
  readonly roundCompleted: boolean
  readonly deliveryReplied: boolean
  readonly singleCoordinatorDelivery: boolean
  readonly publicAgentReplyVisible: boolean
  readonly singlePublicCoordinatorReply: boolean
  readonly sessionOnlyComposerAbsent: boolean
  readonly sessionOnlyControlsAbsent: boolean
  readonly internalIdentityEvidenceHidden: boolean
  readonly hostPathEvidenceHidden: boolean
  readonly originalSessionRestored: boolean
  readonly timingsMs: {
    readonly rendererInteractive: number
    readonly conversationSettlement: number
    readonly rendererPostSettlement: number
  }
}

export interface WanexDesktopProviderRelaunchProofResult {
  readonly ok: boolean
  readonly step: WanexDesktopProviderRelaunchProofStep
  readonly initialConfiguredProviderCount: number
  readonly configuredProviderCount: number
  readonly providerConfigured: boolean
  readonly providerReady: boolean
  readonly providerEvidenceRedacted: boolean
  readonly appearanceConfigured: boolean
  readonly appearanceRestored: boolean
  readonly redactionDiagnostics?: {
    readonly credentialLiteralVisible: boolean
    readonly secretReferenceVisible: boolean
    readonly nonemptyPasswordInputCount: number
  }
  readonly modelId: string
  readonly sessionId: string
  readonly initialTranscriptVisible: boolean
  readonly initialResponseVisible: boolean
  readonly conversationSubmitted: boolean
  readonly userVisible: boolean
  readonly assistantVisible: boolean
  readonly responseVisible: boolean
  readonly followUpSessionPreserved: boolean
  readonly followUpResponseVisible: boolean
  readonly cancellationSubmitted: boolean
  readonly cancellationSucceeded: boolean
  readonly cancellationSessionPreserved: boolean
  readonly cancelledUserVisible: boolean
  readonly cancelledAssistantAbsent: boolean
  readonly regenerationSubmitted: boolean
  readonly regenerationFreshOperation: boolean
  readonly regenerationSucceeded: boolean
  readonly regenerationSessionPreserved: boolean
  readonly regenerationResponseVisible: boolean
  readonly guidedParentSubmitted: boolean
  readonly guidedParentPartialVisible: boolean
  readonly guidedComposerModeVisible: boolean
  readonly guidedFollowUpSubmitted: boolean
  readonly guidedDraftClearedAfterAcceptance: boolean
  readonly guidedPendingVisible: boolean
  readonly guidedParentOperationPreserved: boolean
  readonly guidedParentResponseVisible: boolean
  readonly guidedChildFreshOperation: boolean
  readonly guidedChildPromoted: boolean
  readonly guidedChildResponseVisible: boolean
  readonly guidedFollowUpSessionPreserved: boolean
  readonly guidedParentCompletedWithoutCancellation: boolean
  readonly sideQueryParentSubmitted: boolean
  readonly sideQueryParentPartialVisible: boolean
  readonly sideQueryDisclosureVisible: boolean
  readonly sideQuerySubmitted: boolean
  readonly sideQueryAnswerVisible: boolean
  readonly sideQueryParentOperationPreserved: boolean
  readonly sideQueryTranscriptUnchanged: boolean
  readonly sideQueryDismissed: boolean
  readonly sideQueryParentResponseVisible: boolean
  readonly sideQuerySessionPreserved: boolean
  readonly sideQueryParentCompletedWithoutCancellation: boolean
  readonly attachmentPickerVisible: boolean
  readonly unsupportedAttachmentRejected: boolean
  readonly unsupportedDraftPreserved: boolean
  readonly attachmentPreviewVisible: boolean
  readonly attachmentRemoved: boolean
  readonly attachmentReadded: boolean
  readonly attachmentPasted: boolean
  readonly attachmentDropped: boolean
  readonly multimodalConversationSubmitted: boolean
  readonly multimodalResourceVisible: boolean
  readonly multimodalCanonicalPreviewVisible: boolean
  readonly imageGenerationEndpointReady: boolean
  readonly imageGenerationConversationSubmitted: boolean
  readonly imageGenerationSessionPreserved: boolean
  readonly imageGenerationToolSucceeded: boolean
  readonly generatedResourceEvidenceValid: boolean
  readonly generatedResourcePreviewVisible: boolean
  readonly planGenerated: boolean
  readonly planOpenBeforeApproval: boolean
  readonly planExecutionAbsentBeforeApproval: boolean
  readonly planApproved: boolean
  readonly planExecuted: boolean
  readonly planSessionPreserved: boolean
  readonly planResponseVisible: boolean
  readonly planProposalRevision: number
  readonly goalStarted: boolean
  readonly goalAutonomousContinuation: boolean
  readonly goalSucceeded: boolean
  readonly goalSessionPreserved: boolean
  readonly goalFinalResponseVisible: boolean
  readonly goalAttemptCount: number
  readonly goalVerificationResults: readonly string[]
  readonly cleanupCompleted: boolean
  readonly credentialCleanupPending: boolean
  readonly chatBlocked: boolean
  readonly timingsMs: {
    readonly rendererInteractive: number
    readonly conversationSettlement: number
    readonly rendererPostSettlement: number
  }
}

export interface WanexDesktopCodingProofResult {
  readonly ok: boolean
  readonly step: "relaunch-coding"
  readonly providerReady: boolean
  readonly providerEvidenceRedacted: boolean
  readonly initialAssistantVisible: boolean
  readonly codingSurfaceSelected: boolean
  readonly emptyProjectStateVisible: boolean
  readonly projectSelected: boolean
  readonly projectId: string
  readonly projectPathEvidenceHidden: boolean
  readonly sessionCreated: boolean
  readonly sessionId: string
  readonly userMessageVisible: boolean
  readonly approvalVisible: boolean
  readonly toolNameVisible: boolean
  readonly approvalResolved: boolean
  readonly turnSucceeded: boolean
  readonly proposalVisible: boolean
  readonly responseVisible: boolean
  readonly proposalReviewed: boolean
  readonly proposalApplyRequested: boolean
  readonly proposalApplied: boolean
  readonly proposalUndone: boolean
  readonly noFabricatedToolResult: boolean
  readonly recoveryVisible: boolean
  readonly recoveryToolNameVisible: boolean
  readonly recoveryRetryAvailable: boolean
  readonly recoveryRetried: boolean
  readonly recoveryTurnSucceeded: boolean
  readonly recoveryResponseVisible: boolean
  readonly recoverySessionPreserved: boolean
  readonly timingsMs: {
    readonly rendererInteractive: number
    readonly conversationSettlement: number
    readonly rendererPostSettlement: number
  }
}

export interface WanexDesktopRemoteCodingProofResult {
  readonly ok: boolean
  readonly step: WanexDesktopRemoteCodingProofStep
  readonly providerEvidenceRedacted: boolean
  readonly codingSurfaceSelected: boolean
  readonly remoteProfileFormVisible: boolean
  readonly profileInputSubmitted: boolean
  readonly credentialAcceptedByForm: boolean
  readonly profilePersistedAfterSave: boolean
  readonly credentialAbsentAfterSave: boolean
  readonly endpointAbsentAfterSave: boolean
  readonly remoteProjectVisible: boolean
  readonly opaqueProjectSelected: boolean
  readonly sharedWorkbenchVisible: boolean
  readonly idleInspectorHidden: boolean
  readonly projectId: string
  readonly profileRemoved: boolean
  readonly removedProfileListEmpty: boolean
  readonly reconnectRejectedAfterRemoval: boolean
  readonly internalIdentityEvidenceHidden: boolean
  readonly timingsMs: {
    readonly rendererInteractive: number
    readonly conversationSettlement: number
    readonly rendererPostSettlement: number
  }
}
