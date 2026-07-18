import type {
  AppExtensionContributionDomain,
  AppExtensionSourceKind
} from "./types.js"

export const WANEX_EXTENSION = "wanex-extension" as const

export const APP_EXTENSION_DOMAINS = [
  "instruction",
  "skill",
  "command",
  "agent",
  "tool",
  "provider_catalog",
  "lifecycle_hook"
] as const satisfies readonly AppExtensionContributionDomain[]

export const DEFAULT_APP_EXTENSION_SOURCE_ORDER = [
  "builtin",
  "policy",
  "global_file",
  "project_file",
  "config",
  "plugin",
  "marketplace",
  "connector",
  "runtime_override"
] as const satisfies readonly AppExtensionSourceKind[]
