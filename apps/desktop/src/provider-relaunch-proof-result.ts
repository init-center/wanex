import type {
  WanexDesktopProviderRelaunchProofResult,
  WanexDesktopProviderRelaunchProofStep
} from "./proof-contract.js"

export type WanexDesktopProviderRelaunchProofValue =
  Partial<WanexDesktopProviderRelaunchProofResult> & {
    readonly rendererInteractive?: number
    readonly conversationSettlement?: number
    readonly rendererPostSettlement?: number
  }

export function createWanexDesktopProviderRelaunchProofResult(
  step: WanexDesktopProviderRelaunchProofStep,
  value: WanexDesktopProviderRelaunchProofValue
): WanexDesktopProviderRelaunchProofResult {
  return {
    ok: value.ok ?? false,
    step,
    initialConfiguredProviderCount: value.initialConfiguredProviderCount ?? 0,
    configuredProviderCount: value.configuredProviderCount ?? 0,
    providerConfigured: value.providerConfigured ?? false,
    providerReady: value.providerReady ?? false,
    providerEvidenceRedacted: value.providerEvidenceRedacted ?? false,
    appearanceConfigured: value.appearanceConfigured ?? false,
    appearanceRestored: value.appearanceRestored ?? false,
    ...(value.redactionDiagnostics === undefined
      ? {}
      : { redactionDiagnostics: value.redactionDiagnostics }),
    modelId: value.modelId ?? "",
    sessionId: value.sessionId ?? "",
    initialTranscriptVisible: value.initialTranscriptVisible ?? false,
    initialResponseVisible: value.initialResponseVisible ?? false,
    conversationSubmitted: value.conversationSubmitted ?? false,
    userVisible: value.userVisible ?? false,
    assistantVisible: value.assistantVisible ?? false,
    responseVisible: value.responseVisible ?? false,
    followUpSessionPreserved: value.followUpSessionPreserved ?? false,
    followUpResponseVisible: value.followUpResponseVisible ?? false,
    cancellationSubmitted: value.cancellationSubmitted ?? false,
    cancellationSucceeded: value.cancellationSucceeded ?? false,
    cancellationSessionPreserved:
      value.cancellationSessionPreserved ?? false,
    cancelledUserVisible: value.cancelledUserVisible ?? false,
    cancelledAssistantAbsent: value.cancelledAssistantAbsent ?? false,
    regenerationSubmitted: value.regenerationSubmitted ?? false,
    regenerationFreshOperation: value.regenerationFreshOperation ?? false,
    regenerationSucceeded: value.regenerationSucceeded ?? false,
    regenerationSessionPreserved:
      value.regenerationSessionPreserved ?? false,
    regenerationResponseVisible: value.regenerationResponseVisible ?? false,
    guidedParentSubmitted: value.guidedParentSubmitted ?? false,
    guidedParentPartialVisible: value.guidedParentPartialVisible ?? false,
    guidedComposerModeVisible: value.guidedComposerModeVisible ?? false,
    guidedFollowUpSubmitted: value.guidedFollowUpSubmitted ?? false,
    guidedDraftClearedAfterAcceptance:
      value.guidedDraftClearedAfterAcceptance ?? false,
    guidedPendingVisible: value.guidedPendingVisible ?? false,
    guidedParentOperationPreserved:
      value.guidedParentOperationPreserved ?? false,
    guidedParentResponseVisible: value.guidedParentResponseVisible ?? false,
    guidedChildFreshOperation: value.guidedChildFreshOperation ?? false,
    guidedChildPromoted: value.guidedChildPromoted ?? false,
    guidedChildResponseVisible: value.guidedChildResponseVisible ?? false,
    guidedFollowUpSessionPreserved:
      value.guidedFollowUpSessionPreserved ?? false,
    guidedParentCompletedWithoutCancellation:
      value.guidedParentCompletedWithoutCancellation ?? false,
    sideQueryParentSubmitted: value.sideQueryParentSubmitted ?? false,
    sideQueryParentPartialVisible:
      value.sideQueryParentPartialVisible ?? false,
    sideQueryDisclosureVisible: value.sideQueryDisclosureVisible ?? false,
    sideQuerySubmitted: value.sideQuerySubmitted ?? false,
    sideQueryAnswerVisible: value.sideQueryAnswerVisible ?? false,
    sideQueryParentOperationPreserved:
      value.sideQueryParentOperationPreserved ?? false,
    sideQueryTranscriptUnchanged:
      value.sideQueryTranscriptUnchanged ?? false,
    sideQueryDismissed: value.sideQueryDismissed ?? false,
    sideQueryParentResponseVisible:
      value.sideQueryParentResponseVisible ?? false,
    sideQuerySessionPreserved: value.sideQuerySessionPreserved ?? false,
    sideQueryParentCompletedWithoutCancellation:
      value.sideQueryParentCompletedWithoutCancellation ?? false,
    attachmentPickerVisible: value.attachmentPickerVisible ?? false,
    unsupportedAttachmentRejected:
      value.unsupportedAttachmentRejected ?? false,
    unsupportedDraftPreserved: value.unsupportedDraftPreserved ?? false,
    attachmentPreviewVisible: value.attachmentPreviewVisible ?? false,
    attachmentRemoved: value.attachmentRemoved ?? false,
    attachmentReadded: value.attachmentReadded ?? false,
    attachmentPasted: value.attachmentPasted ?? false,
    attachmentDropped: value.attachmentDropped ?? false,
    multimodalConversationSubmitted:
      value.multimodalConversationSubmitted ?? false,
    multimodalResourceVisible: value.multimodalResourceVisible ?? false,
    multimodalCanonicalPreviewVisible:
      value.multimodalCanonicalPreviewVisible ?? false,
    imageGenerationEndpointReady:
      value.imageGenerationEndpointReady ?? false,
    imageGenerationConversationSubmitted:
      value.imageGenerationConversationSubmitted ?? false,
    imageGenerationSessionPreserved:
      value.imageGenerationSessionPreserved ?? false,
    imageGenerationToolSucceeded:
      value.imageGenerationToolSucceeded ?? false,
    generatedResourceEvidenceValid:
      value.generatedResourceEvidenceValid ?? false,
    generatedResourcePreviewVisible:
      value.generatedResourcePreviewVisible ?? false,
    planGenerated: value.planGenerated ?? false,
    planOpenBeforeApproval: value.planOpenBeforeApproval ?? false,
    planExecutionAbsentBeforeApproval:
      value.planExecutionAbsentBeforeApproval ?? false,
    planApproved: value.planApproved ?? false,
    planExecuted: value.planExecuted ?? false,
    planSessionPreserved: value.planSessionPreserved ?? false,
    planResponseVisible: value.planResponseVisible ?? false,
    planProposalRevision: value.planProposalRevision ?? 0,
    goalStarted: value.goalStarted ?? false,
    goalAutonomousContinuation: value.goalAutonomousContinuation ?? false,
    goalSucceeded: value.goalSucceeded ?? false,
    goalSessionPreserved: value.goalSessionPreserved ?? false,
    goalFinalResponseVisible: value.goalFinalResponseVisible ?? false,
    goalAttemptCount: value.goalAttemptCount ?? 0,
    goalVerificationResults: value.goalVerificationResults ?? [],
    cleanupCompleted: value.cleanupCompleted ?? false,
    credentialCleanupPending: value.credentialCleanupPending ?? false,
    chatBlocked: value.chatBlocked ?? false,
    timingsMs: {
      rendererInteractive: Math.max(0, value.rendererInteractive ?? 0),
      conversationSettlement: Math.max(0, value.conversationSettlement ?? 0),
      rendererPostSettlement: Math.max(0, value.rendererPostSettlement ?? 0)
    }
  }
}
