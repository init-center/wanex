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
} from "./proof-contract.js";
import type {
  WanexDesktopNarrowVisualAccessibilityProofResult,
  WanexDesktopNormalVisualAccessibilityProofResult,
} from "./visual-accessibility-contract.js";
import {
  WANEX_DESKTOP_PROOF_GUIDED_RELEASE_MARKER,
  WANEX_DESKTOP_PLUGIN_PROOF_EXPECTED,
  WANEX_DESKTOP_PROOF_SIDE_QUERY_RELEASE_MARKER,
  WANEX_DESKTOP_PROOF_SCHEDULE_HOLD_MS,
  WANEX_DESKTOP_PROOF_SCHEDULE_RELEASE_MARKER,
} from "./proof-contract.js";
import {
  wanexDesktopScheduleCreateAdmissionProofScript,
  wanexDesktopScheduleCreateSettlementProofScript,
  wanexDesktopScheduleRestoreProofScript,
} from "./schedule-proof-script.js";
import type {
  WanexDesktopScheduleCreateAdmission,
} from "./schedule-proof.js";
import type {
  WanexDesktopProviderGuidedFollowUpAdmission,
} from "./provider-guided-follow-up-proof.js";
import type {
  WanexDesktopProviderSideQueryAdmission,
} from "./provider-side-query-proof.js";
import {
  wanexDesktopNarrowVisualAccessibilityProofScript,
  wanexDesktopNormalVisualAccessibilityProofScript,
} from "./visual-accessibility-proof.js";
import {
  readVisualAccessibilityExecutionResult,
} from "./visual-accessibility-result.js";
import { wanexDesktopTeamProofScript } from "./team-proof.js";
import {
  wanexDesktopPluginInstallProofScript,
  wanexDesktopPluginRestoreProofScript,
} from "./plugin-management-proof.js";

export type WanexDesktopPackagedProofStep =
  | "lifecycle"
  | "relaunch-team"
  | "relaunch-plugin-install"
  | "relaunch-plugin-restore"
  | "relaunch-schedule-create"
  | "relaunch-schedule-restore"
  | WanexDesktopProviderRelaunchProofStep;

export class DesktopRendererProofError extends Error {
  readonly code = "desktop_renderer_proof_failed";

  constructor(
    readonly renderer:
      | WanexDesktopRendererProofResult
      | WanexDesktopProviderRelaunchProofResult
      | WanexDesktopPluginProofResult
      | WanexDesktopScheduleProofResult
      | WanexDesktopTeamProofResult,
  ) {
    super("desktop Product renderer proof failed");
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
}): Promise<
  | WanexDesktopRendererProofResult
  | WanexDesktopProviderRelaunchProofResult
  | WanexDesktopPluginProofResult
  | WanexDesktopScheduleProofResult
  | WanexDesktopTeamProofResult
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
    await new Promise((resolve) => setTimeout(resolve, WANEX_DESKTOP_PROOF_SCHEDULE_HOLD_MS));
    process.stdout.write(`${WANEX_DESKTOP_PROOF_SCHEDULE_RELEASE_MARKER}\n`);
    return (await input.window.webContents.executeJavaScript(
      wanexDesktopScheduleCreateSettlementProofScript(admission),
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
  const script = input.step === "relaunch-configure"
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

export async function runWanexDesktopNormalVisualAccessibilityProof(
  window: BrowserWindow,
): Promise<WanexDesktopNormalVisualAccessibilityProofResult> {
  const execution = await window.webContents.executeJavaScript(
    wanexDesktopNormalVisualAccessibilityProofScript(),
    true,
  ) as unknown;
  return readVisualAccessibilityExecutionResult<
    WanexDesktopNormalVisualAccessibilityProofResult
  >(execution);
}

export async function runWanexDesktopNarrowVisualAccessibilityProof(
  window: BrowserWindow,
): Promise<WanexDesktopNarrowVisualAccessibilityProofResult> {
  const execution = await window.webContents.executeJavaScript(
    wanexDesktopNarrowVisualAccessibilityProofScript(),
    true,
  ) as unknown;
  return readVisualAccessibilityExecutionResult<
    WanexDesktopNarrowVisualAccessibilityProofResult
  >(execution);
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
    !validDuration(admission.rendererInteractive) ||
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
    !validDuration(admission.rendererInteractive) ||
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
  return value.every((item) => typeof item === "string" && item.length > 0) &&
    new Set(value).size === value.length;
}

function validDuration(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function requiredProofValue(
  value: string | undefined,
  label: string,
): string {
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`desktop proof ${label} is required`);
  }
  return value;
}
