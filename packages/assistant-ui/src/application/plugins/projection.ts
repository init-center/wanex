import type {
  PluginManagementActionOutput,
  PluginSettingsViewModel,
  Snapshot,
} from "../model.js";
import type { SurfaceEnvelopeLike } from "../actions/model.js";

export function projectPluginSettings(
  result: Snapshot["pluginManagement"],
): PluginSettingsViewModel {
  if (!result.ok) {
    return {
      state: "failed",
      installs: [],
      message: result.error.message,
    };
  }
  if (result.value.kind === "assistant.plugin-management.unavailable") {
    return {
      state: "unavailable",
      installs: [],
      message: result.value.message,
    };
  }
  return {
    state: "ready",
    revision: result.value.revision,
    installs: result.value.installs,
  };
}

export function projectPluginManagementActionOutput(
  action: PluginManagementActionOutput["action"],
  envelope: SurfaceEnvelopeLike,
): PluginManagementActionOutput | undefined {
  if (!envelope.ok) return undefined;
  return {
    kind: "web.plugin-management-action",
    action,
    result: envelope.value as PluginManagementActionOutput["result"],
  };
}

export function pluginManagementRejectionMessage(
  output: PluginManagementActionOutput | undefined,
): string | undefined {
  return output?.result.kind === "plugin.management.rejected"
    ? output.result.message
    : undefined;
}
