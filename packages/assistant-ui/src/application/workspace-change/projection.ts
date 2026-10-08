import type { SurfaceEnvelopeLike } from "../actions/model.js"
import type { Action } from "../model.js"
import type { WorkspaceChangeActionOutput } from "../model/view.js"

export function isWorkspaceChangeAction(action: Action): action is Extract<Action, { readonly type: WorkspaceChangeActionOutput["action"] }> {
  return action.type === "read-workspace-change" ||
    action.type === "decide-workspace-change" ||
    action.type === "apply-workspace-change" ||
    action.type === "undo-workspace-change" ||
    action.type === "reapply-workspace-change"
}

export function projectWorkspaceChangeActionOutput(
  action: Action,
  result: SurfaceEnvelopeLike,
): WorkspaceChangeActionOutput | undefined {
  if (!isWorkspaceChangeAction(action) || !result.ok || typeof result.value !== "object" || result.value === null) return undefined
  const value = result.value as { readonly kind?: unknown }
  const expected = action.type === "read-workspace-change" || action.type === "decide-workspace-change"
    ? "assistant.workspace-change"
    : "assistant.workspace-change-mutation"
  if (value.kind !== expected) return undefined
  return {
    kind: "web.workspace-change-action",
    action: action.type,
    result: result.value as WorkspaceChangeActionOutput["result"],
  }
}
