import type { ExecuteCommandResult } from "@wanex/product/surface"
import type { TuiRenderedCommandExecution } from "../model.js"

export function renderTuiCommandExecution(
  result: ExecuteCommandResult
): TuiRenderedCommandExecution {
  const lines = [
    "Command execution",
    `status:${result.kind}`,
    `command:${result.commandId}`
  ]
  if (result.kind !== "rejected") {
    lines.push(`handler:${result.handlerRef}`)
    lines.push(`valueKind:${result.summary.valueKind}`)
    lines.push(`message:${result.summary.message}`)
    lines.push(
      ...result.summary.references.map(
        (reference) => `reference:${reference.kind}:${reference.id}`
      )
    )
    return {
      kind: "tui.command-execution",
      state: result.kind,
      commandId: result.commandId,
      referenceCount: result.summary.references.length,
      lines,
      text: lines.join("\n")
    }
  }
  lines.push(`reason:${result.reason}`)
  if (result.handlerRef !== undefined) {
    lines.push(`handler:${result.handlerRef}`)
  }
  lines.push(`message:${result.message}`)
  if (result.providerReadiness !== undefined) {
    lines.push(`provider:${result.providerReadiness.status}`)
    lines.push(`canRun:${result.providerReadiness.canRun ? "yes" : "no"}`)
  }
  return {
    kind: "tui.command-execution",
    state: "rejected",
    commandId: result.commandId,
    referenceCount: 0,
    lines,
    text: lines.join("\n")
  }
}
