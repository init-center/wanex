import type { BrowserWindow } from "electron";
import {
  wanexDesktopRendererProofScript,
  type WanexDesktopRendererProofResult,
} from "./proof.js";
import {
  wanexDesktopProviderGuidedFollowUpAdmissionProofScript,
  wanexDesktopProviderGuidedFollowUpSettlementProofScript,
  wanexDesktopProviderRelaunchProofScript,
  wanexDesktopProviderSideQueryAdmissionProofScript,
  wanexDesktopProviderSideQuerySettlementProofScript,
} from "./provider-relaunch-proof-script.js";
import type {
  WanexDesktopProviderRelaunchProofResult,
  WanexDesktopProviderRelaunchProofStep,
  WanexDesktopPluginProofResult,
  WanexDesktopScheduleProofResult,
  WanexDesktopTeamProofResult,
  WanexDesktopRemoteAssistantProofResult,
  WanexDesktopRemoteAssistantProofStep,
} from "./proof-contract.js";
import type {
  WanexDesktopRemoteMediaProofResult,
  WanexDesktopRemoteMediaRendererEvidence,
  WanexDesktopRemoteMediaProofStep,
  WanexDesktopRemoteMediaRestoreProofResult,
  WanexDesktopRemoteMediaUploadProofResult,
} from "./remote-media-proof.js";
import {
  WANEX_DESKTOP_PROOF_GUIDED_RELEASE_MARKER,
  WANEX_DESKTOP_PROOF_IMAGE_GENERATION_RESPONSE,
  WANEX_DESKTOP_PROOF_IMAGE_GENERATION_TEXT,
  WANEX_DESKTOP_PROOF_MULTIMODAL_IMAGE_LABEL,
  WANEX_DESKTOP_PROOF_MULTIMODAL_TEXT,
  WANEX_DESKTOP_PROOF_REMOTE_MULTIMODAL_RESPONSE,
  WANEX_DESKTOP_PROOF_UNSUPPORTED_DRAFT,
  WANEX_DESKTOP_PLUGIN_PROOF_EXPECTED,
  WANEX_DESKTOP_PROOF_SIDE_QUERY_RELEASE_MARKER,
  WANEX_DESKTOP_PROOF_SCHEDULE_HOLD_MS,
  WANEX_DESKTOP_PROOF_SCHEDULE_RELEASE_MARKER,
  WANEX_DESKTOP_PROOF_REMOTE_ASSISTANT_MESSAGE,
  WANEX_DESKTOP_PROOF_REMOTE_ASSISTANT_MODEL_ID,
  WANEX_DESKTOP_PROOF_REMOTE_ASSISTANT_PARTIAL_RESPONSE,
  WANEX_DESKTOP_PROOF_REMOTE_ASSISTANT_RELEASE_MARKER,
  WANEX_DESKTOP_PROOF_REMOTE_ASSISTANT_RESPONSE,
  WANEX_DESKTOP_PROOF_RELAUNCH_HEADING,
} from "./proof-contract.js";
import { wanexDesktopRemoteMediaProofScript } from "./remote-media-proof.js";
import {
  wanexDesktopScheduleCreateAdmissionProofScript,
  wanexDesktopScheduleCreateSettlementProofScript,
  wanexDesktopScheduleDisableBeforeReleaseProofScript,
  wanexDesktopScheduleRestoreProofScript,
} from "./schedule-proof-script.js";
import type { WanexDesktopScheduleCreateAdmission } from "./schedule-proof.js";
import type { WanexDesktopProviderGuidedFollowUpAdmission } from "./provider-guided-follow-up-proof.js";
import type { WanexDesktopProviderSideQueryAdmission } from "./provider-side-query-proof.js";
import { wanexDesktopTeamProofScript } from "./team-proof.js";
import {
  wanexDesktopPluginInstallProofScript,
  wanexDesktopPluginRestoreProofScript,
} from "./plugin-management-proof.js";
import {
  wanexDesktopRemoteAssistantAdmissionProofScript,
  wanexDesktopRemoteAssistantRestoreProofScript,
  wanexDesktopRemoteAssistantSettlementProofScript,
  type WanexDesktopRemoteAssistantProofExpectations,
  type WanexDesktopRemoteAssistantAdmission,
} from "./remote-assistant-proof.js";

export type WanexDesktopPackagedProofStep =
  | "lifecycle"
  | "relaunch-team"
  | "relaunch-plugin-install"
  | "relaunch-plugin-restore"
  | "relaunch-schedule-create"
  | "relaunch-schedule-restore"
  | WanexDesktopRemoteAssistantProofStep
  | WanexDesktopRemoteMediaProofStep
  | WanexDesktopProviderRelaunchProofStep;

export class DesktopRendererProofError extends Error {
  readonly code = "desktop_renderer_proof_failed";

  constructor(
    readonly renderer:
      | WanexDesktopRendererProofResult
      | WanexDesktopProviderRelaunchProofResult
      | WanexDesktopPluginProofResult
      | WanexDesktopScheduleProofResult
      | WanexDesktopTeamProofResult
      | WanexDesktopRemoteAssistantProofResult
      | WanexDesktopRemoteMediaProofResult,
  ) {
    super("desktop Assistant renderer proof failed");
    this.name = "DesktopRendererProofError";
  }
}

export function requiredWanexDesktopPackagedProofStep(
  value: string | undefined,
): WanexDesktopPackagedProofStep {
  if (
    value === "lifecycle" ||
    value === "relaunch-configure" ||
    value === "relaunch-chat" ||
    value === "relaunch-remote-assistant" ||
    value === "relaunch-remote-assistant-restore" ||
    value === "relaunch-remote-media" ||
    value === "relaunch-remote-media-restore" ||
    value === "relaunch-cancel-regenerate" ||
    value === "relaunch-guided-follow-up" ||
    value === "relaunch-side-query" ||
    value === "relaunch-multimodal" ||
    value === "relaunch-image-generation" ||
    value === "relaunch-plan" ||
    value === "relaunch-goal" ||
    value === "relaunch-schedule-create" ||
    value === "relaunch-schedule-restore" ||
    value === "relaunch-team" ||
    value === "relaunch-plugin-install" ||
    value === "relaunch-plugin-restore" ||
    value === "relaunch-cleanup" ||
    value === "relaunch-unconfigured"
  ) {
    return value;
  }
  throw new Error("desktop proof step is required and must be recognized");
}

export async function runWanexDesktopPackagedRendererProof(input: {
  readonly window: BrowserWindow;
  readonly step: WanexDesktopPackagedProofStep;
  readonly providerBaseUrl?: string;
  readonly providerCredential?: string;
  readonly remoteServerUrl?: string;
  readonly remoteCredential?: string;
  readonly remoteProfileId?: string;
  readonly remoteProfileName?: string;
  readonly probeResourceCapability?: (url: string) => Promise<number>;
}): Promise<
  | WanexDesktopRendererProofResult
  | WanexDesktopProviderRelaunchProofResult
  | WanexDesktopPluginProofResult
  | WanexDesktopScheduleProofResult
  | WanexDesktopTeamProofResult
  | WanexDesktopRemoteAssistantProofResult
  | WanexDesktopRemoteMediaProofResult
> {
  if (input.step === "lifecycle") {
    return (await input.window.webContents.executeJavaScript(
      wanexDesktopRendererProofScript({
        providerBaseUrl: requiredProofValue(
          input.providerBaseUrl,
          "Provider base URL",
        ),
        credential: requiredProofValue(
          input.providerCredential,
          "Provider credential",
        ),
      }),
      true,
    )) as WanexDesktopRendererProofResult;
  }
  if (input.step === "relaunch-guided-follow-up") {
    const admission = (await input.window.webContents.executeJavaScript(
      wanexDesktopProviderGuidedFollowUpAdmissionProofScript(),
      true,
    )) as WanexDesktopProviderGuidedFollowUpAdmission;
    assertGuidedFollowUpAdmission(admission);
    process.stdout.write(`${WANEX_DESKTOP_PROOF_GUIDED_RELEASE_MARKER}\n`);
    return (await input.window.webContents.executeJavaScript(
      wanexDesktopProviderGuidedFollowUpSettlementProofScript(admission),
      true,
    )) as WanexDesktopProviderRelaunchProofResult;
  }
  if (input.step === "relaunch-side-query") {
    const admission = (await input.window.webContents.executeJavaScript(
      wanexDesktopProviderSideQueryAdmissionProofScript(),
      true,
    )) as WanexDesktopProviderSideQueryAdmission;
    assertSideQueryAdmission(admission);
    process.stdout.write(`${WANEX_DESKTOP_PROOF_SIDE_QUERY_RELEASE_MARKER}\n`);
    return (await input.window.webContents.executeJavaScript(
      wanexDesktopProviderSideQuerySettlementProofScript(admission),
      true,
    )) as WanexDesktopProviderRelaunchProofResult;
  }
  if (input.step === "relaunch-team") {
    return (await input.window.webContents.executeJavaScript(
      wanexDesktopTeamProofScript(),
      true,
    )) as WanexDesktopTeamProofResult;
  }
  if (input.step === "relaunch-remote-assistant") {
    const expected = remoteAssistantExpectations(input);
    const admission = (await input.window.webContents.executeJavaScript(
      wanexDesktopRemoteAssistantAdmissionProofScript(expected),
      true,
    )) as WanexDesktopRemoteAssistantAdmission;
    assertRemoteAssistantAdmission(admission);
    process.stdout.write(
      `${WANEX_DESKTOP_PROOF_REMOTE_ASSISTANT_RELEASE_MARKER}\n`,
    );
    return (await input.window.webContents.executeJavaScript(
      wanexDesktopRemoteAssistantSettlementProofScript(expected, admission),
      true,
    )) as WanexDesktopRemoteAssistantProofResult;
  }
  if (input.step === "relaunch-remote-assistant-restore") {
    return (await input.window.webContents.executeJavaScript(
      wanexDesktopRemoteAssistantRestoreProofScript(
        remoteAssistantExpectations(input),
      ),
      true,
    )) as WanexDesktopRemoteAssistantProofResult;
  }
  if (
    input.step === "relaunch-remote-media" ||
    input.step === "relaunch-remote-media-restore"
  ) {
    const evidence = (await input.window.webContents.executeJavaScript(
      wanexDesktopRemoteMediaProofScript(
        remoteMediaExpectations({
          step: input.step,
          ...(input.remoteProfileId === undefined
            ? {}
            : { remoteProfileId: input.remoteProfileId }),
        }),
      ),
      true,
    )) as WanexDesktopRemoteMediaRendererEvidence;
    const probe = input.probeResourceCapability;
    if (probe === undefined) {
      throw new Error("remote media Resource capability probe is unavailable");
    }
    const capabilityUrls = [...new Set(evidence.retiredCapabilityUrls)].map(
      requireRetiredResourceCapabilityUrl,
    );
    const statuses = await Promise.all(capabilityUrls.map(probe));
    const { retiredCapabilityUrls: _retiredCapabilityUrls, ...renderer } =
      evidence;
    const capabilityRetired =
      capabilityUrls.length > 0 &&
      statuses.every((status) => status === 404 || status === 410);
    return {
      ...renderer,
      ok: remoteMediaRendererEvidenceValid(renderer) && capabilityRetired,
      capabilityRetired,
    };
  }
  if (input.step === "relaunch-schedule-create") {
    const admission = (await input.window.webContents.executeJavaScript(
      wanexDesktopScheduleCreateAdmissionProofScript(),
      true,
    )) as WanexDesktopScheduleCreateAdmission;
    if (
      admission?.ok !== true ||
      admission.scheduleId.length === 0 ||
      admission.sessionId.length === 0
    ) {
      throw new Error("desktop Schedule admission proof failed");
    }
    await new Promise((resolve) =>
      setTimeout(resolve, WANEX_DESKTOP_PROOF_SCHEDULE_HOLD_MS),
    );
    const preRelease = (await input.window.webContents.executeJavaScript(
      wanexDesktopScheduleDisableBeforeReleaseProofScript(admission),
      true,
    )) as {
      readonly disabledBeforeRelease: true;
      readonly userCountAtDisable: 1;
    };
    if (
      preRelease?.disabledBeforeRelease !== true ||
      preRelease.userCountAtDisable !== 1
    ) {
      throw new Error("desktop Schedule pre-release proof failed");
    }
    process.stdout.write(`${WANEX_DESKTOP_PROOF_SCHEDULE_RELEASE_MARKER}\n`);
    return (await input.window.webContents.executeJavaScript(
      wanexDesktopScheduleCreateSettlementProofScript(admission, preRelease),
      true,
    )) as WanexDesktopScheduleProofResult;
  }
  if (input.step === "relaunch-schedule-restore") {
    return (await input.window.webContents.executeJavaScript(
      wanexDesktopScheduleRestoreProofScript(),
      true,
    )) as WanexDesktopScheduleProofResult;
  }
  if (input.step === "relaunch-plugin-install") {
    return (await input.window.webContents.executeJavaScript(
      wanexDesktopPluginInstallProofScript(WANEX_DESKTOP_PLUGIN_PROOF_EXPECTED),
      true,
    )) as WanexDesktopPluginProofResult;
  }
  if (input.step === "relaunch-plugin-restore") {
    return (await input.window.webContents.executeJavaScript(
      wanexDesktopPluginRestoreProofScript(WANEX_DESKTOP_PLUGIN_PROOF_EXPECTED),
      true,
    )) as WanexDesktopPluginProofResult;
  }
  const script =
    input.step === "relaunch-configure"
      ? wanexDesktopProviderRelaunchProofScript({
          step: input.step,
          providerBaseUrl: requiredProofValue(
            input.providerBaseUrl,
            "Provider base URL",
          ),
          credential: requiredProofValue(
            input.providerCredential,
            "Provider credential",
          ),
        })
      : wanexDesktopProviderRelaunchProofScript({ step: input.step });
  return (await input.window.webContents.executeJavaScript(
    script,
    true,
  )) as WanexDesktopProviderRelaunchProofResult;
}

function remoteMediaExpectations(input: {
  readonly step: WanexDesktopRemoteMediaProofStep;
  readonly remoteProfileId?: string;
}) {
  return {
    step: input.step,
    profileId: requiredProofValue(input.remoteProfileId, "remote Profile ID"),
    modelId: WANEX_DESKTOP_PROOF_REMOTE_ASSISTANT_MODEL_ID,
    multimodalText: WANEX_DESKTOP_PROOF_MULTIMODAL_TEXT,
    multimodalResponse: WANEX_DESKTOP_PROOF_REMOTE_MULTIMODAL_RESPONSE,
    unsupportedDraft: WANEX_DESKTOP_PROOF_UNSUPPORTED_DRAFT,
    imageLabel: WANEX_DESKTOP_PROOF_MULTIMODAL_IMAGE_LABEL,
    pngBase64:
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    generationText: WANEX_DESKTOP_PROOF_IMAGE_GENERATION_TEXT,
    generationResponse: WANEX_DESKTOP_PROOF_IMAGE_GENERATION_RESPONSE,
  };
}

function remoteMediaRendererEvidenceValid(
  renderer:
    | Omit<WanexDesktopRemoteMediaUploadProofResult, "ok" | "capabilityRetired">
    | Omit<
        WanexDesktopRemoteMediaRestoreProofResult,
        "ok" | "capabilityRetired"
      >,
): boolean {
  const common =
    renderer.providerEvidenceRedacted &&
    renderer.profileRestored &&
    renderer.remoteLocationSelected &&
    renderer.remoteModelReady &&
    renderer.sessionId.length > 0 &&
    renderer.remoteEvidenceHidden;
  if (!common) return false;
  return renderer.step === "relaunch-remote-media"
    ? renderer.attachmentPickerVisible &&
        renderer.unsupportedAttachmentRejected &&
        renderer.unsupportedDraftPreserved &&
        renderer.attachmentPreviewVisible &&
        renderer.attachmentCapabilityUrlLocal &&
        renderer.multimodalConversationSubmitted &&
        renderer.multimodalResponseVisible &&
        renderer.uploadedResourceVisible &&
        renderer.imageGenerationToolSucceeded &&
        renderer.generatedResourceVisible &&
        renderer.generatedResourceEvidenceValid &&
        renderer.generatedPreviewVisible &&
        renderer.staleUploadRejected &&
        renderer.staleUploadAbsent
    : renderer.uploadedTranscriptRestored &&
        renderer.uploadedResourceRestored &&
        renderer.uploadedPreviewRestored &&
        renderer.generatedTranscriptRestored &&
        renderer.generatedResourceRestored &&
        renderer.generatedPreviewRestored &&
        renderer.attachmentDraftEmpty;
}

function requireRetiredResourceCapabilityUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 2_048) {
    throw new Error("remote media Resource capability URL is invalid");
  }
  const url = new URL(value);
  if (
    url.protocol !== "wanex-resource:" ||
    url.hostname !== "delivery" ||
    url.port.length !== 0 ||
    url.username.length !== 0 ||
    url.password.length !== 0 ||
    url.search.length !== 0 ||
    url.hash.length !== 0 ||
    !/^\/wrc_[A-Za-z0-9_-]{43}$/u.test(url.pathname)
  ) {
    throw new Error("remote media Resource capability URL is invalid");
  }
  return url.toString();
}

function remoteAssistantExpectations(input: {
  readonly remoteProfileId?: string;
  readonly remoteProfileName?: string;
  readonly remoteServerUrl?: string;
  readonly remoteCredential?: string;
}): WanexDesktopRemoteAssistantProofExpectations {
  return {
    profileId: requiredProofValue(input.remoteProfileId, "remote Profile ID"),
    profileName: requiredProofValue(
      input.remoteProfileName,
      "remote Profile name",
    ),
    serverUrl: requiredProofValue(input.remoteServerUrl, "remote Server URL"),
    credential: requiredProofValue(
      input.remoteCredential,
      "remote Host credential",
    ),
    modelId: WANEX_DESKTOP_PROOF_REMOTE_ASSISTANT_MODEL_ID,
    message: WANEX_DESKTOP_PROOF_REMOTE_ASSISTANT_MESSAGE,
    partialResponse: WANEX_DESKTOP_PROOF_REMOTE_ASSISTANT_PARTIAL_RESPONSE,
    response: WANEX_DESKTOP_PROOF_REMOTE_ASSISTANT_RESPONSE,
    localTranscriptMarker: WANEX_DESKTOP_PROOF_RELAUNCH_HEADING,
  };
}

function assertRemoteAssistantAdmission(
  admission: WanexDesktopRemoteAssistantAdmission,
): void {
  if (
    admission.profileSavedThroughVisibleForm !== true ||
    admission.profilePersisted !== true ||
    admission.credentialAbsentFromRenderer !== true ||
    admission.serverUrlAbsentFromRenderer !== true ||
    admission.authenticationFailureVisible !== true ||
    admission.authenticationFailurePreservedLocal !== true ||
    admission.credentialCorrectedThroughVisibleForm !== true ||
    admission.remoteLocationSelected !== true ||
    admission.remoteModelReady !== true ||
    admission.remoteMessageSubmitted !== true ||
    admission.remotePartialVisible !== true ||
    admission.switchedToLocalWhileRemoteRunning !== true ||
    admission.localTranscriptRestored !== true ||
    admission.remotePromptAbsentLocally !== true ||
    admission.attachmentUploadAvailable !== true ||
    admission.localSessionId.length === 0 ||
    admission.remoteSessionId.length === 0 ||
    admission.localSessionId === admission.remoteSessionId
  ) {
    throw new Error("desktop Remote Assistant admission proof failed");
  }
}

function assertSideQueryAdmission(
  admission: WanexDesktopProviderSideQueryAdmission,
): void {
  if (
    admission?.ok !== true ||
    admission.sessionId.length === 0 ||
    admission.parentOperationId.length === 0 ||
    !validRowIds(admission.initialUserRowIds) ||
    !validRowIds(admission.initialAssistantRowIds) ||
    !validDuration(admission.submittedAt) ||
    !validDuration(admission.journeyPreparation) ||
    admission.parentPartialVisible !== true ||
    admission.disclosureVisible !== true ||
    admission.querySubmitted !== true ||
    admission.answerVisible !== true ||
    admission.parentOperationPreserved !== true ||
    admission.transcriptUnchanged !== true ||
    admission.dismissed !== true
  ) {
    throw new Error("desktop Side Query admission proof failed");
  }
}

function assertGuidedFollowUpAdmission(
  admission: WanexDesktopProviderGuidedFollowUpAdmission,
): void {
  if (
    admission?.ok !== true ||
    admission.sessionId.length === 0 ||
    admission.parentOperationId.length === 0 ||
    admission.childOperationId.length === 0 ||
    admission.childOperationId === admission.parentOperationId ||
    !validRowIds(admission.initialUserRowIds) ||
    !validRowIds(admission.initialAssistantRowIds) ||
    !validDuration(admission.submittedAt) ||
    !validDuration(admission.journeyPreparation) ||
    admission.parentPartialVisible !== true ||
    admission.composerModeVisible !== true ||
    admission.followUpSubmitted !== true ||
    admission.draftClearedAfterAcceptance !== true ||
    admission.pendingVisible !== true ||
    admission.parentOperationPreserved !== true
  ) {
    throw new Error("desktop guided follow-up admission proof failed");
  }
}

function validRowIds(value: readonly string[]): boolean {
  return (
    value.every((item) => typeof item === "string" && item.length > 0) &&
    new Set(value).size === value.length
  );
}

function validDuration(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function requiredProofValue(value: string | undefined, label: string): string {
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`desktop proof ${label} is required`);
  }
  return value;
}
