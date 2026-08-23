import type {
  WanexDesktopVisualAccessibilityFailureEvidence,
  WanexDesktopVisualAccessibilityProofFailure,
  WanexDesktopVisualAccessibilityProofResult,
} from "./visual-accessibility-contract.js";
import {
  WANEX_DESKTOP_VISUAL_ACCESSIBILITY_PROOF_STAGES,
} from "./visual-accessibility-contract.js";

export class DesktopVisualAccessibilityProofError extends Error {
  readonly code = "desktop_visual_accessibility_proof_failed";

  constructor(
    readonly visualAccessibility: Partial<
      WanexDesktopVisualAccessibilityProofResult
    >,
    readonly failure?: WanexDesktopVisualAccessibilityProofFailure,
  ) {
    super("desktop Product visual accessibility proof failed");
    this.name = "DesktopVisualAccessibilityProofError";
  }
}

export function readVisualAccessibilityExecutionResult<Result>(
  value: unknown,
): Result {
  if (!isRecord(value) || typeof value.completed !== "boolean") {
    throw new Error("desktop visual accessibility execution result is invalid");
  }
  if (value.completed) {
    if (!("result" in value) || !isRecord(value.result) ||
      typeof value.result.ok !== "boolean") {
      throw new Error("desktop visual accessibility result is invalid");
    }
    return value.result as Result;
  }
  const failure = readVisualAccessibilityFailure(value.failure);
  throw new DesktopVisualAccessibilityProofError({}, failure);
}

function readVisualAccessibilityFailure(
  value: unknown,
): WanexDesktopVisualAccessibilityProofFailure {
  if (!isRecord(value) ||
    (value.code !== "condition_timeout" &&
      value.code !== "unexpected_exception") ||
    typeof value.stage !== "string" ||
    !WANEX_DESKTOP_VISUAL_ACCESSIBILITY_PROOF_STAGES.includes(
      value.stage as typeof WANEX_DESKTOP_VISUAL_ACCESSIBILITY_PROOF_STAGES[number],
    )) {
    throw new Error("desktop visual accessibility failure is invalid");
  }
  return {
    code: value.code,
    stage: value.stage as WanexDesktopVisualAccessibilityProofFailure["stage"],
    evidence: readVisualAccessibilityFailureEvidence(value.evidence),
  };
}

function readVisualAccessibilityFailureEvidence(
  value: unknown,
): WanexDesktopVisualAccessibilityFailureEvidence {
  if (!isRecord(value) || !isRecord(value.viewport)) {
    throw new Error("desktop visual accessibility failure evidence is invalid");
  }
  const activeElement = readEnum(value.activeElement, [
    "none",
    "other",
    "settings",
    "sidebar",
    "open_settings",
    "open_conversations",
  ] as const);
  const drawerState = readEnum(value.drawerState, [
    "missing",
    "open",
    "closed",
    "invalid",
  ] as const);
  return {
    viewport: {
      width: readFiniteNumber(value.viewport.width),
      height: readFiniteNumber(value.viewport.height),
      documentScrollWidth: readFiniteNumber(
        value.viewport.documentScrollWidth,
      ),
      bodyScrollWidth: readFiniteNumber(value.viewport.bodyScrollWidth),
    },
    productSurfacePresent: readBoolean(value.productSurfacePresent),
    composer: readVisualElementEvidence(value.composer),
    sidebar: readVisualElementEvidence(value.sidebar),
    drawerState,
    settingsPresent: readBoolean(value.settingsPresent),
    activeElement,
  };
}

function readVisualElementEvidence(
  value: unknown,
): WanexDesktopVisualAccessibilityFailureEvidence["composer"] {
  if (!isRecord(value)) {
    throw new Error("desktop visual element evidence is invalid");
  }
  const present = readBoolean(value.present);
  const visibility = readEnum(value.visibility, [
    "missing",
    "visible",
    "hidden",
    "other",
  ] as const);
  const pointerInteractive = readBoolean(value.pointerInteractive);
  if (value.rect === null) {
    return { present, rect: null, visibility, pointerInteractive };
  }
  if (!isRecord(value.rect)) {
    throw new Error("desktop visual element rectangle is invalid");
  }
  return {
    present,
    rect: {
      left: readFiniteNumber(value.rect.left),
      top: readFiniteNumber(value.rect.top),
      right: readFiniteNumber(value.rect.right),
      bottom: readFiniteNumber(value.rect.bottom),
      width: readFiniteNumber(value.rect.width),
      height: readFiniteNumber(value.rect.height),
    },
    visibility,
    pointerInteractive,
  };
}

function readFiniteNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("desktop visual numeric evidence is invalid");
  }
  return value;
}

function readBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new Error("desktop visual boolean evidence is invalid");
  }
  return value;
}

function readEnum<const Value extends string>(
  value: unknown,
  allowed: readonly Value[],
): Value {
  if (typeof value !== "string" || !allowed.includes(value as Value)) {
    throw new Error("desktop visual enum evidence is invalid");
  }
  return value as Value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
