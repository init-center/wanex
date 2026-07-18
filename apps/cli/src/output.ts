import type { CliResult } from "./types.js"

export function ok(value: unknown): CliResult {
  return {
    exitCode: 0,
    stdout: `${JSON.stringify({ ok: true, value }, null, 2)}\n`,
    stderr: ""
  }
}

export function errorResult(error: unknown): CliResult {
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
