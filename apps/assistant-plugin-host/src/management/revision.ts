import { createHash } from "node:crypto"
import type {
  PluginInstalledVersionSummary,
  PluginManagementSnapshot,
} from "@wanex/assistant/plugin-management"

export function createPluginManagementSnapshot(
  installs: readonly PluginInstalledVersionSummary[],
): PluginManagementSnapshot {
  const snapshot = {
    kind: "plugin.management.snapshot",
    revision: `plugin-management:sha256:${createHash("sha256")
      .update(stableJson(installs))
      .digest("hex")}`,
    installs,
  } as const
  return freezeManagementValue(snapshot)
}

export function freezeManagementValue<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    freezeManagementValue(child)
  }
  return Object.freeze(value)
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null"
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(",")}}`
}
