import type {
  ProductAppTuiDiagnostic,
  ProductAppTuiSurfaceSnapshot
} from "./types.js"

export function productAppTuiDiagnostics(
  snapshot: Pick<
    ProductAppTuiSurfaceSnapshot,
    "descriptor" | "status" | "home" | "settings" | "commandCatalog" | "events"
  >
): readonly ProductAppTuiDiagnostic[] {
  return [
    ...errorDiagnostic(
      snapshot.descriptor,
      "product-app-tui.descriptor_failed",
      "surface descriptor"
    ),
    ...commandDiagnostic(
      snapshot.status,
      "product-app-tui.status_failed",
      "status"
    ),
    ...commandDiagnostic(
      snapshot.home,
      "product-app-tui.home_failed",
      "readHome"
    ),
    ...commandDiagnostic(
      snapshot.settings,
      "product-app-tui.settings_failed",
      "readSettings"
    ),
    ...commandDiagnostic(
      snapshot.commandCatalog,
      "product-app-tui.command_catalog_failed",
      "readProductCommands"
    ),
    ...eventsDiagnostic(snapshot.events)
  ]
}

function errorDiagnostic(
  result: { readonly ok: boolean; readonly error?: { readonly message: string } },
  code: ProductAppTuiDiagnostic["code"],
  label: string
): readonly ProductAppTuiDiagnostic[] {
  if (result.ok) {
    return []
  }
  return [
    {
      code,
      severity: "error",
      message: `${label} failed: ${result.error?.message ?? "unknown error"}`
    }
  ]
}

function commandDiagnostic(
  result: {
    readonly ok: boolean
    readonly command: string
    readonly error?: { readonly message: string }
  },
  code: ProductAppTuiDiagnostic["code"],
  label: string
): readonly ProductAppTuiDiagnostic[] {
  if (result.ok) {
    return []
  }
  return [
    {
      code,
      severity: "error",
      command: result.command,
      message: `${label} failed: ${result.error?.message ?? "unknown error"}`
    }
  ]
}

function eventsDiagnostic(
  result: ProductAppTuiSurfaceSnapshot["events"]
): readonly ProductAppTuiDiagnostic[] {
  if (result.ok) {
    return []
  }
  return [
    {
      code: "product-app-tui.events_failed",
      severity: "warning",
      message: `surface events failed: ${result.error.message}`
    }
  ]
}
