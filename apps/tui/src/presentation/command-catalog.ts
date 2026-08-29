import type {
  CommandCatalogReadModel,
  SurfaceClientCommandEnvelope
} from "@wanex/assistant/surface"
import type {
  TuiRenderedCommandCatalog
} from "../model.js"

export function renderTuiCommandCatalog(
  result: SurfaceClientCommandEnvelope<CommandCatalogReadModel>
): TuiRenderedCommandCatalog {
  if (!result.ok) {
    const lines = [
      "Commands",
      "status:error",
      `error:${result.error.message}`
    ]
    return {
      kind: "tui.command-catalog",
      ok: false,
      commandCount: 0,
      diagnosticCount: 0,
      commands: [],
      diagnostics: [],
      lines,
      text: lines.join("\n")
    }
  }

  const lines = [
    "Commands",
    `commands:${result.value.commands.length}`,
    `diagnostics:${result.value.diagnostics.length}`,
    ...result.value.commands.map((command, index) =>
      [
        `  ${index + 1}. ${command.id} - ${command.title}`,
        `category:${command.category ?? "uncategorized"}`,
        `handler:${command.handlerRef}`,
        inputSummary(command),
        `source:${command.sourceKind}/${command.sourceId}`
      ].join(" | ")
    ),
    ...result.value.diagnostics.map(
      (diagnostic) =>
        `  diagnostic:${diagnostic.severity}:${diagnostic.code}:${diagnostic.message}`
    )
  ]
  return {
    kind: "tui.command-catalog",
    ok: true,
    commandCount: result.value.commands.length,
    diagnosticCount: result.value.diagnostics.length,
    commands: result.value.commands,
    diagnostics: result.value.diagnostics,
    lines,
    text: lines.join("\n")
  }
}

function inputSummary(
  command: CommandCatalogReadModel["commands"][number]
): string {
  const schema = command.inputSchema
  if (schema === undefined) return "input:none"
  const required = schema.required ?? []
  return required.length === 0
    ? "input:schema optional"
    : `input:schema required:${required.join(",")}`
}
