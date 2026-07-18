export type AppExtensionSourceKind =
  | "builtin"
  | "policy"
  | "global_file"
  | "project_file"
  | "config"
  | "plugin"
  | "marketplace"
  | "connector"
  | "runtime_override"

export type AppExtensionSourceScope =
  | "builtin"
  | "enterprise"
  | "global"
  | "project"
  | "workspace"
  | "user"
  | "runtime"

export type AppExtensionTrustLevel =
  | "trusted"
  | "user_enabled"
  | "untrusted"
  | "blocked"

export interface AppExtensionSource {
  readonly kind: AppExtensionSourceKind
  readonly scope: AppExtensionSourceScope
  readonly id: string
  readonly label?: string
  readonly path?: string
  readonly packageName?: string
  readonly version?: string
}

export interface AppExtensionProvenance {
  readonly source: AppExtensionSource
  readonly trust: AppExtensionTrustLevel
  readonly originId?: string
  readonly originLabel?: string
  readonly loadedAt?: number
}
