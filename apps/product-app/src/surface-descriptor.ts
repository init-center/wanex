import {
  PRODUCT_APP_BACKEND_INTEGRATION_CONTRACT
} from "@wanex/product-app/backend"
import {
  PRODUCT_APP_SURFACE_COMMANDS,
  type ProductAppSurfaceCommand,
  type ProductAppSurfaceCommandDescriptor,
  type ProductAppSurfaceDescriptor
} from "./types-surface.js"

export const productAppSurfaceCommandDescriptors: readonly ProductAppSurfaceCommandDescriptor[] = [
  {
    command: PRODUCT_APP_SURFACE_COMMANDS.status,
    title: "Read app status",
    input: "none",
    mutatesState: false
  },
  {
    command: PRODUCT_APP_SURFACE_COMMANDS.readHome,
    title: "Read app home",
    input: "home-options",
    mutatesState: false
  },
  {
    command: PRODUCT_APP_SURFACE_COMMANDS.readSettings,
    title: "Read app settings",
    input: "none",
    mutatesState: false
  },
  {
    command: PRODUCT_APP_SURFACE_COMMANDS.selectSession,
    title: "Select session",
    input: "session-selector",
    mutatesState: true
  },
  {
    command: PRODUCT_APP_SURFACE_COMMANDS.setLayout,
    title: "Set layout",
    input: "layout-selector",
    mutatesState: true
  },
  {
    command: PRODUCT_APP_SURFACE_COMMANDS.setMode,
    title: "Set mode",
    input: "mode-selector",
    mutatesState: true
  },
  {
    command: PRODUCT_APP_SURFACE_COMMANDS.updatePreferences,
    title: "Update renderer preferences",
    input: "preferences-patch",
    mutatesState: true
  },
  {
    command: PRODUCT_APP_SURFACE_COMMANDS.listProviderProfiles,
    title: "List provider profiles",
    input: "none",
    mutatesState: false
  },
  {
    command: PRODUCT_APP_SURFACE_COMMANDS.readProductCommands,
    title: "Read product commands",
    input: "none",
    mutatesState: false
  },
  {
    command: PRODUCT_APP_SURFACE_COMMANDS.setActiveProviderProfile,
    title: "Set active provider profile",
    input: "provider-profile-selector",
    mutatesState: false
  },
  {
    command: PRODUCT_APP_SURFACE_COMMANDS.dispatchProductCommand,
    title: "Dispatch product command",
    input: "product-command-request",
    mutatesState: false
  },
  {
    command: PRODUCT_APP_SURFACE_COMMANDS.dispatchProductCommandJson,
    title: "Dispatch product JSON command",
    input: "json-body",
    mutatesState: false
  },
  {
    command: PRODUCT_APP_SURFACE_COMMANDS.previewProductCommandInvocation,
    title: "Preview product command invocation",
    input: "product-command-invocation-preview",
    mutatesState: false
  },
  {
    command: PRODUCT_APP_SURFACE_COMMANDS.executeProductCommand,
    title: "Execute product command",
    input: "product-command-execution",
    mutatesState: true
  },
  {
    command: PRODUCT_APP_SURFACE_COMMANDS.readExecutionReference,
    title: "Read execution reference",
    input: "execution-reference",
    mutatesState: false
  },
  {
    command: PRODUCT_APP_SURFACE_COMMANDS.openWorkbench,
    title: "Open workbench",
    input: "workbench-open",
    mutatesState: true
  },
  {
    command: PRODUCT_APP_SURFACE_COMMANDS.startWorkbench,
    title: "Start workbench",
    input: "workbench-start",
    mutatesState: true
  },
  {
    command: PRODUCT_APP_SURFACE_COMMANDS.continueWorkbench,
    title: "Continue workbench",
    input: "workbench-continue",
    mutatesState: true
  }
]

export const knownProductAppSurfaceCommands = new Set<string>(
  productAppSurfaceCommandDescriptors.map((descriptor) => descriptor.command)
)

export function productAppSurfaceDescriptor(): ProductAppSurfaceDescriptor {
  return {
    kind: "product-app.surface-descriptor",
    transport: "app-owned-ipc-or-api",
    commandCount: productAppSurfaceCommandDescriptors.length,
    rendererBoundary: PRODUCT_APP_BACKEND_INTEGRATION_CONTRACT.rendererBoundary,
    commands: productAppSurfaceCommandDescriptors
  }
}

export function productAppSurfaceCommandMutatesState(
  command: ProductAppSurfaceCommand
): boolean {
  return productAppSurfaceCommandDescriptors.find(
    (descriptor) => descriptor.command === command
  )?.mutatesState ?? false
}
