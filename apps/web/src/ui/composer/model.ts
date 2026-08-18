import type { Action } from "../../application/model.js";

export type ComposerMode = "submit" | "queue" | "steer";

export function actionType(mode: ComposerMode): Action["type"] {
  if (mode === "queue") return "queue-guided-follow-up";
  if (mode === "steer") return "steer-current-response";
  return "submit-conversation";
}

export function placeholder(mode: ComposerMode): string {
  if (mode === "steer") return "Guide the current response...";
  if (mode === "queue") return "Add the next instruction...";
  return "Ask anything...";
}
