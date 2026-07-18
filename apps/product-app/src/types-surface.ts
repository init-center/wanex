import type {
  ProductAppBackendIntegrationContract
} from "@wanex/product-app/backend"
import type {
  ProductAppContinueWorkbenchResult,
  ProductAppExecuteCommandResult,
  ProductAppExecutionReferenceReadResult,
  ProductAppCommandCatalogReadModel,
  ProductAppCommandInvocationPreview,
  ProductAppHomeReadModel,
  ProductAppOpenWorkbenchResult,
  ProductAppProviderProfileListReadModel,
  ProductAppProviderProfileReadModel,
  ProductAppSettingsReadModel,
  ProductAppShellStatus,
  ProductAppStartWorkbenchResult,
  ProductAppStateSnapshot
} from "./types.js"

export const PRODUCT_APP_SURFACE_COMMANDS = {
  status: "status",
  readHome: "readHome",
  readSettings: "readSettings",
  selectSession: "selectSession",
  setLayout: "setLayout",
  setMode: "setMode",
  updatePreferences: "updatePreferences",
  listProviderProfiles: "listProviderProfiles",
  readProductCommands: "readProductCommands",
  setActiveProviderProfile: "setActiveProviderProfile",
  dispatchProductCommand: "dispatchProductCommand",
  dispatchProductCommandJson: "dispatchProductCommandJson",
  previewProductCommandInvocation: "previewProductCommandInvocation",
  executeProductCommand: "executeProductCommand",
  readExecutionReference: "readExecutionReference",
  openWorkbench: "openWorkbench",
  startWorkbench: "startWorkbench",
  continueWorkbench: "continueWorkbench"
} as const

export type ProductAppSurfaceCommand =
  (typeof PRODUCT_APP_SURFACE_COMMANDS)[keyof typeof PRODUCT_APP_SURFACE_COMMANDS]

export interface ProductAppSurfaceAdapter {
  descriptor(): ProductAppSurfaceDescriptor
  dispatchSurfaceCommand(
    request: unknown
  ): Promise<ProductAppSurfaceEnvelope>
  readSurfaceEvents(
    request?: ProductAppReadSurfaceEventsRequest
  ): readonly ProductAppSurfaceEvent[]
}

export interface ProductAppSurfaceDescriptor {
  readonly kind: "product-app.surface-descriptor"
  readonly transport: "app-owned-ipc-or-api"
  readonly commandCount: number
  readonly rendererBoundary: ProductAppBackendIntegrationContract["rendererBoundary"]
  readonly commands: readonly ProductAppSurfaceCommandDescriptor[]
}

export interface ProductAppSurfaceCommandDescriptor {
  readonly command: ProductAppSurfaceCommand
  readonly title: string
  readonly input: ProductAppSurfaceCommandInputKind
  readonly mutatesState: boolean
}

export type ProductAppSurfaceCommandInputKind =
  | "none"
  | "home-options"
  | "session-selector"
  | "layout-selector"
  | "mode-selector"
  | "preferences-patch"
  | "provider-profile-selector"
  | "product-command-request"
  | "product-command-invocation-preview"
  | "product-command-execution"
  | "execution-reference"
  | "json-body"
  | "workbench-open"
  | "workbench-start"
  | "workbench-continue"

export interface ProductAppSurfaceCommandRequest {
  readonly command: string
  readonly input?: unknown
  readonly requestId?: string
}

export type ProductAppSurfaceEnvelope =
  | ProductAppSurfaceSuccessEnvelope
  | ProductAppSurfaceErrorEnvelope

export interface ProductAppSurfaceSuccessEnvelope {
  readonly ok: true
  readonly command: string
  readonly value: ProductAppSurfaceCommandValue
  readonly event: ProductAppSurfaceEvent
}

export interface ProductAppSurfaceErrorEnvelope {
  readonly ok: false
  readonly command: string
  readonly error: ProductAppSurfaceError
  readonly event: ProductAppSurfaceEvent
}

export type ProductAppSurfaceCommandValue =
  | ProductAppShellStatus
  | ProductAppHomeReadModel
  | ProductAppSettingsReadModel
  | ProductAppProviderProfileListReadModel
  | ProductAppProviderProfileReadModel
  | ProductAppCommandCatalogReadModel
  | ProductAppCommandInvocationPreview
  | ProductAppExecuteCommandResult
  | ProductAppExecutionReferenceReadResult
  | ProductAppStateSnapshot
  | ProductAppOpenWorkbenchResult
  | ProductAppStartWorkbenchResult
  | ProductAppContinueWorkbenchResult
  | unknown

export interface ProductAppSurfaceError {
  readonly code: ProductAppSurfaceErrorCode
  readonly category: ProductAppSurfaceErrorCategory
  readonly message: string
}

export type ProductAppSurfaceErrorCode =
  | "unknown_command"
  | "validation_error"
  | "command_error"
  | "invalid_transport_response"

export type ProductAppSurfaceErrorCategory = "validation" | "runtime"

export interface ProductAppReadSurfaceEventsRequest {
  readonly limit?: number
  readonly afterSequence?: number
}

export interface ProductAppSurfaceEvent {
  readonly id: string
  readonly sequence: number
  readonly type: ProductAppSurfaceEventType
  readonly command: string
  readonly at: number
  readonly requestId?: string
  readonly state?: ProductAppStateSnapshot
  readonly error?: ProductAppSurfaceError
}

export type ProductAppSurfaceEventType =
  | "product-app.surface.command_completed"
  | "product-app.surface.command_rejected"
  | "product-app.surface.state_changed"
