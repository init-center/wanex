import type {
  ProductAppTuiRenderedCommandCatalog,
  ProductAppTuiRenderedExecutionActivity,
  ProductAppTuiRenderedEvents,
  ProductAppTuiRenderedFrame
} from "./types.js"
import type {
  ProductAppTuiCliResult
} from "./cli-types.js"

export function okRenderedText(
  value:
    | ProductAppTuiRenderedFrame
    | ProductAppTuiRenderedEvents
    | ProductAppTuiRenderedCommandCatalog
    | ProductAppTuiRenderedExecutionActivity
): ProductAppTuiCliResult {
  return {
    exitCode: 0,
    stdout: `${value.text}\n`,
    stderr: ""
  }
}

export function okJson(value: unknown): ProductAppTuiCliResult {
  return {
    exitCode: 0,
    stdout: `${JSON.stringify({ ok: true, value }, null, 2)}\n`,
    stderr: ""
  }
}

export function okEmpty(): ProductAppTuiCliResult {
  return {
    exitCode: 0,
    stdout: "",
    stderr: ""
  }
}

export function fail(error: unknown): ProductAppTuiCliResult {
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
