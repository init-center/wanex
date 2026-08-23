import {
  DesktopRendererProofError,
} from "./packaged-renderer-proof.js";
import {
  DesktopVisualAccessibilityProofError,
} from "./visual-accessibility-result.js";

export function createWanexDesktopProofFailureReceipt(input: {
  readonly error: unknown;
  readonly failurePhase: string;
  readonly proofStep?: string;
}): unknown {
  const visual = input.error instanceof DesktopVisualAccessibilityProofError
    ? input.error
    : undefined;
  return {
    kind: "wanex.product-desktop.runtime-receipt",
    ok: false,
    failurePhase: input.failurePhase,
    ...(input.proofStep === undefined
      ? {}
      : { failureProofStep: input.proofStep }),
    ...failureDiagnostic(input.error, input.failurePhase),
    error: boundedDesktopError(input.error),
    ...(input.error instanceof DesktopRendererProofError
      ? { renderer: input.error.renderer }
      : {}),
    ...(visual === undefined
      ? {}
      : {
          visualAccessibility: visual.visualAccessibility,
          ...(visual.failure === undefined
            ? {}
            : { visualAccessibilityFailure: visual.failure }),
        }),
  };
}

export function formatWanexDesktopError(error: unknown): string {
  const value = boundedDesktopError(error);
  return `[wanex-desktop] ${value.name}: ${value.code}`;
}

function failureDiagnostic(
  error: unknown,
  failurePhase: string,
): { readonly failureDiagnostic?: string } {
  if (error instanceof DesktopVisualAccessibilityProofError) {
    if (error.failure !== undefined) {
      return { failureDiagnostic: error.failure.stage };
    }
    return {
      failureDiagnostic: failurePhase === "normal_visual_accessibility"
        ? "normal_visual_contract_failed"
        : failurePhase === "narrow_visual_accessibility"
        ? "narrow_visual_contract_failed"
        : "visual_contract_failed",
    };
  }
  if (failurePhase === "normal_visual_accessibility") {
    return { failureDiagnostic: "normal_visual_execution_exception" };
  }
  if (failurePhase === "narrow_visual_accessibility") {
    return { failureDiagnostic: "narrow_visual_execution_exception" };
  }
  if (failurePhase === "renderer_proof") {
    return { failureDiagnostic: classifyRendererProofFailure(error) };
  }
  return {};
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
  return "product_desktop_failed";
}
