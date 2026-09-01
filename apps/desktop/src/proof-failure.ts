import {
  DesktopRendererProofError,
} from "./packaged-renderer-proof.js";
import { boundedCodingHostDiagnostics } from "./proof/coding-diagnostics.js";
export function createWanexDesktopProofFailureReceipt(input: {
  readonly error: unknown;
  readonly failurePhase: string;
  readonly proofStep?: string;
  readonly codingDiagnostics?: unknown;
}): unknown {
  const diagnostic = failureDiagnostic(input.error, input.failurePhase);
  const coding = boundedCodingHostDiagnostics(input.codingDiagnostics);
  return {
    kind: "wanex.desktop.runtime-receipt",
    ok: false,
    failurePhase: input.failurePhase,
    ...(input.proofStep === undefined
      ? {}
      : { failureProofStep: input.proofStep }),
    ...diagnostic,
    error: boundedDesktopError(input.error),
    ...(input.error instanceof DesktopRendererProofError
      ? { renderer: input.error.renderer }
      : {}),
    ...(coding === undefined ? {} : { coding }),
  };
}

export function formatWanexDesktopError(error: unknown): string {
  const value = boundedDesktopError(error);
  const diagnostic = safeDiagnosticMessage(error);
  return diagnostic === undefined
    ? `[wanex-desktop] ${value.name}: ${value.code}`
    : `[wanex-desktop] ${value.name}: ${value.code}: ${diagnostic}`;
}

function failureDiagnostic(
  error: unknown,
  failurePhase: string,
): {
  readonly failureDiagnostic?: string;
  readonly failureDiagnosticMessage?: string;
} {
  if (failurePhase === "renderer_proof") {
    const message = safeDiagnosticMessage(error);
    return {
      failureDiagnostic: classifyRendererProofFailure(error),
      ...(message === undefined ? {} : { failureDiagnosticMessage: message }),
    };
  }
  return {};
}

function safeDiagnosticMessage(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  const message = error.message.trim();
  if (message.length === 0) return undefined;
  return redactDiagnostic(message).slice(0, 512);
}

function redactDiagnostic(message: string): string {
  return message
    .replaceAll(/wanex-[a-z0-9-]+(?:-[a-z0-9-]+)*-proof-[a-z0-9-]+/gi, "<proof-secret>")
    .replaceAll(/\b(Bearer|token|credential|password|secret)[=: ]+[^,;\s)]+/gi, "$1=<redacted>")
    .replaceAll(/(?:https?|wss?):\/\/[^\s)]+/gi, "<endpoint>");
}

function boundedDesktopError(error: unknown): {
  readonly name: string;
  readonly code: string;
} {
  return {
    name: error instanceof Error ? error.name.slice(0, 128) : "UnknownError",
    code: readErrorCode(error).slice(0, 128),
  };
}

function classifyRendererProofFailure(error: unknown): string {
  if (error instanceof DesktopRendererProofError) {
    if ("failureStage" in error.renderer) {
      const stage = error.renderer.failureStage;
      if (typeof stage === "string" && stage.length > 0) {
        return `renderer_${stage}`;
      }
    }
  }
  const message = error instanceof Error ? error.message : String(error);
  const pluginTimeout = message.match(
    /Plugin(?: restore)? proof timed out during ([a-z0-9_]+)/,
  );
  if (pluginTimeout !== null) {
    return `plugin_${pluginTimeout[1] ?? "renderer"}_timeout`.slice(0, 256);
  }
  const pluginRejected = message.match(
    /Plugin proof ([a-z0-9_]+) rejected:/,
  );
  if (pluginRejected !== null) {
    return `plugin_${pluginRejected[1] ?? "review"}_rejected`.slice(0, 256);
  }
  for (const stage of [
    "guided_follow_up_ready",
    "guided_parent_draft",
    "guided_parent_running",
    "guided_queue_mode",
    "guided_queue_draft",
    "guided_follow_up_pending",
    "guided_follow_up_settlement",
    "side_query_ready",
    "side_query_parent_draft",
    "side_query_parent_running",
    "side_query_workflows_open",
    "side_query_disclosure_open",
    "side_query_draft",
    "side_query_answer",
    "side_query_dismissal",
    "side_query_parent_settlement",
  ]) {
    const marker = `during ${stage}:`;
    const index = message.indexOf(marker);
    if (index >= 0) {
      const detail = message.slice(index + marker.length).split("`")[0] ?? "";
      return detail.length > 0
        ? `${stage}_${detail}`.slice(0, 256)
        : `${stage}_timeout`;
    }
    if (message.includes(`during ${stage}`)) return `${stage}_timeout`;
  }
  if (message.includes("guided follow-up proof timed out during settlement")) {
    return "guided_follow_up_settlement_timeout";
  }
  if (message.includes("side-query proof timed out during parent settlement")) {
    return "side_query_parent_settlement_timeout";
  }
  const codingTimeout = message.match(/Coding proof timed out: ([a-z_]+)/);
  if (codingTimeout !== null) {
    const stage = codingTimeout[1] ?? "renderer";
    return `${stage.startsWith("coding_") ? stage : `coding_${stage}`}_timeout`;
  }
  const relaunchTimeout = message.match(
    /Provider relaunch proof timed out during [^:]+:([a-z_]+):([^`\n]*)/,
  );
  if (relaunchTimeout !== null) {
    const stage = relaunchTimeout[1] ?? "renderer";
    const detail = relaunchTimeout[2] ?? "timeout";
    return `${stage}_${detail}`.slice(0, 256);
  }
  const teamTimeout = message.match(
    /Desktop Team proof timed out during ([a-z_]+)(?::([a-z0-9_-]+))?/,
  );
  if (teamTimeout !== null) {
    return `team_${teamTimeout[1] ?? "renderer"}_${teamTimeout[2] ?? "timeout"}`
      .slice(0, 256);
  }
  const scheduleTimeout = message.match(
    /Desktop Schedule proof timed out during ([a-z_]+)/,
  );
  if (scheduleTimeout !== null) {
    return `schedule_${scheduleTimeout[1] ?? "renderer"}_timeout`.slice(0, 256);
  }
  for (const stage of [
    "coding_navigation",
    "coding_surface",
    "coding_project",
    "coding_composer",
    "coding_submit",
    "coding_user_message",
    "coding_approval",
    "coding_proposal",
    "coding_turn",
    "coding_response",
    "coding_proposal_review",
    "coding_proposal_apply_request",
    "coding_proposal_apply",
    "coding_proposal_undo",
    "chat_ready",
    "transcript_restore",
    "composer_ready",
    "conversation_settlement",
    "cancel_regenerate_ready",
    "cancel_available",
    "cancelled",
    "regenerated",
    "multimodal_ready",
    "unsupported_rejection",
    "attachment_picker",
    "attachment_preview",
    "attachment_remove_ready",
    "attachment_removal",
    "canonical_resource_preview",
    "image_generation_ready",
    "image_generation_settlement",
    "plan_ready",
    "plan_option",
    "plan_form",
    "plan_open",
    "plan_approval_ready",
    "plan_approved",
    "plan_execution_ready",
    "plan_execution",
    "goal_ready",
    "goal_option",
    "goal_form",
    "goal_started",
    "goal_terminal",
  ]) {
    const marker = `:${stage}`;
    const index = message.indexOf(marker);
    if (index >= 0) {
      const detail = message.slice(index + marker.length + 1).split("`")[0] ?? "";
      return detail.length > 0 ? `${stage}_${detail}` : `${stage}_timeout`;
    }
  }
  if (message.includes("timed out")) return "renderer_timeout";
  if (message.includes("conversation composer is unavailable")) {
    return "composer_unavailable";
  }
  if (message.includes("conversation was not submitted")) {
    return "conversation_not_submitted";
  }
  if (message.includes("image capability control is unavailable")) {
    return "image_capability_control_unavailable";
  }
  if (message.includes("attachment remove control is unavailable")) {
    return "attachment_remove_control_unavailable";
  }
  if (message.includes("DataTransfer")) return "data_transfer_failed";
  if (message.includes("File")) return "file_creation_failed";
  return "renderer_exception";
}

function readErrorCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return "assistant_desktop_failed";
}
