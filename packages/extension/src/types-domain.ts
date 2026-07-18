export type AppExtensionContributionDomain =
  | "instruction"
  | "skill"
  | "command"
  | "agent"
  | "tool"
  | "provider_catalog"
  | "lifecycle_hook"

export type AppExtensionConflictPolicy =
  | "replace"
  | "append"
  | "merge"
  | "error"
