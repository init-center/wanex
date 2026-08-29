import type {
  TuiDiagnostic,
  TuiSurfaceSnapshot
} from "../model.js"

export function tuiDiagnostics(
  snapshot: Pick<
    TuiSurfaceSnapshot,
    "descriptor" | "status" | "home" | "settings" | "commandCatalog" | "conversation" | "goal" | "events"
  >
): readonly TuiDiagnostic[] {
  return [
    ...errorDiagnostic(
      snapshot.descriptor,
      "tui.descriptor_failed",
      "surface descriptor"
    ),
    ...commandDiagnostic(
      snapshot.status,
      "tui.status_failed",
      "status"
    ),
    ...commandDiagnostic(
      snapshot.home,
      "tui.home_failed",
      "readHome"
    ),
    ...commandDiagnostic(
      snapshot.settings,
      "tui.settings_failed",
      "readSettings"
    ),
    ...commandDiagnostic(
      snapshot.commandCatalog,
      "tui.command_catalog_failed",
      "readAssistantCommands"
    ),
    ...commandDiagnostic(
      snapshot.conversation,
      "tui.conversation_failed",
      "readTrackedConversationOperation"
    ),
    ...commandDiagnostic(
      snapshot.goal,
      "tui.goal_failed",
      "readGoal"
    ),
    ...eventsDiagnostic(snapshot.events)
  ]
}

function errorDiagnostic(
  result: { readonly ok: boolean; readonly error?: { readonly message: string } },
  code: TuiDiagnostic["code"],
  label: string
): readonly TuiDiagnostic[] {
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
  code: TuiDiagnostic["code"],
  label: string
): readonly TuiDiagnostic[] {
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
  result: TuiSurfaceSnapshot["events"]
): readonly TuiDiagnostic[] {
  if (result.ok) {
    return []
  }
  return [
    {
      code: "tui.events_failed",
      severity: "warning",
      message: `surface events failed: ${result.error.message}`
    }
  ]
}
