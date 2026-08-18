import type {
  TuiRenderedCommandCatalog,
  TuiRenderedExecutionActivity,
  TuiRenderedEvents,
  TuiRenderedFrame
} from "../model.js"
import type {
  TuiCliResult
} from "./model.js"

export function okRenderedText(
  value:
    | TuiRenderedFrame
    | TuiRenderedEvents
    | TuiRenderedCommandCatalog
    | TuiRenderedExecutionActivity
): TuiCliResult {
  return {
    exitCode: 0,
    stdout: `${value.text}\n`,
    stderr: ""
  }
}

export function okJson(value: unknown): TuiCliResult {
  return {
    exitCode: 0,
    stdout: `${JSON.stringify({ ok: true, value }, null, 2)}\n`,
    stderr: ""
  }
}

export function okEmpty(): TuiCliResult {
  return {
    exitCode: 0,
    stdout: "",
    stderr: ""
  }
}

export function fail(error: unknown): TuiCliResult {
  return {
    exitCode: 1,
    stdout: "",
    stderr: `${JSON.stringify({
      ok: false,
      error: {
        message: error instanceof Error ? error.message : String(error)
      }
    })}\n`
  }
}
