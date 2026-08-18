export interface BackendCapabilityCommands {
  readProductCapabilities(): BackendCapabilityReadModel
}

export interface BackendCapabilityReadModel {
  readonly capabilities: readonly BackendCapabilityRow[]
  readonly selectedCount: number
  readonly notSelectedCount: number
  readonly extensionConfigured: boolean
}

export type BackendCapabilityState = "enabled" | "not_selected"

export interface BackendCapabilityRow {
  readonly id: BackendCapabilityId
  readonly title: string
  readonly state: BackendCapabilityState
  readonly ownerPackage: string
  readonly defaultSelected: boolean
  readonly commandIds: readonly string[]
  readonly notes: readonly string[]
}

export type BackendCapabilityId =
  | "wanex-app"
  | "product-command-registry"
  | "agent-turn"
  | "diagnostics-support"
  | "context-profile"
  | "workflow-envelope"
  | "extension-command-discovery"
  | "plugin-action-execution"
  | "connector-runtime"
