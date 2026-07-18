import type {
  TuiContributionDomain,
  TuiContributionSourceKind
} from "./types.js"

export const TUI_CONTRIBUTION_DOMAINS = [
  "command_palette",
  "keybinding",
  "panel",
  "status_item",
  "prompt_decoration",
  "theme",
  "notification"
] as const satisfies readonly TuiContributionDomain[]

export const DEFAULT_TUI_CONTRIBUTION_SOURCE_ORDER = [
  "builtin",
  "policy",
  "global_config",
  "project_config",
  "plugin",
  "marketplace",
  "connector",
  "runtime_override"
] as const satisfies readonly TuiContributionSourceKind[]
