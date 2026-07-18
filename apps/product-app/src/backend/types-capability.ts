export interface ProductAppBackendCapabilityCommands {
  readProductCapabilities(): ProductAppBackendCapabilityReadModel
}

export interface ProductAppBackendCapabilityReadModel {
  readonly capabilities: readonly ProductAppBackendCapabilityRow[]
  readonly selectedCount: number
  readonly notSelectedCount: number
  readonly extensionConfigured: boolean
}

export type ProductAppBackendCapabilityState = "enabled" | "not_selected"

export interface ProductAppBackendCapabilityRow {
  readonly id: ProductAppBackendCapabilityId
  readonly title: string
  readonly state: ProductAppBackendCapabilityState
  readonly ownerPackage: string
  readonly defaultSelected: boolean
  readonly commandIds: readonly string[]
  readonly notes: readonly string[]
}

export type ProductAppBackendCapabilityId =
  | "app-shell"
  | "product-command-registry"
  | "agent-turn"
  | "diagnostics-support"
  | "context-profile"
  | "workflow-envelope"
  | "extension-command-discovery"
  | "plugin-action-execution"
  | "connector-runtime"
