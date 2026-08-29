import type { PluginManagementRejectedResult } from "@wanex/assistant/plugin-management"

const MESSAGES: Record<PluginManagementRejectedResult["reason"], string> = {
  not_configured: "Plugin management is not configured.",
  selection_failed: "Local Plugin selection failed.",
  inspection_failed: "The selected Plugin package could not be inspected.",
  review_failed: "The Plugin review could not be created.",
  review_capacity_reached: "Too many Plugin reviews are pending.",
  review_not_found: "The Plugin review is no longer available.",
  review_expired: "The Plugin review expired.",
  review_stale: "The Plugin package changed after review.",
  install_failed: "The Plugin package could not be installed.",
  install_not_found: "The Plugin installation was not found.",
  state_conflict: "The Plugin state changed before this request was applied.",
  state_transition_invalid: "The requested Plugin state transition is not allowed.",
  invalid_request: "The Plugin management request is invalid.",
  storage_failed: "Plugin storage is unavailable.",
  disposed: "Plugin management is disposed.",
}

export function rejected(
  reason: PluginManagementRejectedResult["reason"],
): PluginManagementRejectedResult {
  return {
    kind: "plugin.management.rejected",
    reason,
    message: MESSAGES[reason],
  }
}

export function mutationError(error: unknown): PluginManagementRejectedResult {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes("plugin install state conflict")) {
    return rejected("state_conflict")
  }
  if (message.includes("plugin install does not exist")) {
    return rejected("install_not_found")
  }
  return rejected("storage_failed")
}

export function installError(error: unknown): PluginManagementRejectedResult {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes("inspection is stale")) return rejected("review_stale")
  if (message.includes("plugin install state conflict")) {
    return rejected("state_conflict")
  }
  return rejected("install_failed")
}
