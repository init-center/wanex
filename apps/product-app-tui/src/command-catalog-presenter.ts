import type {
  ProductAppCommandCatalogReadModel,
  ProductAppSurfaceClientCommandEnvelope
} from "@wanex/product-app/surface-client"
import type {
  ProductAppTuiRenderedCommandCatalog
} from "./types.js"

export function renderProductAppTuiCommandCatalog(
  result: ProductAppSurfaceClientCommandEnvelope<ProductAppCommandCatalogReadModel>
): ProductAppTuiRenderedCommandCatalog {
  if (!result.ok) {
    const lines = [
      "Wanex Product App Commands",
      "status:error",
      `error:${result.error.message}`
    ]
    return {
      kind: "product-app-tui.command-catalog",
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
    "Wanex Product App Commands",
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
    kind: "product-app-tui.command-catalog",
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
  command: ProductAppCommandCatalogReadModel["commands"][number]
): string {
  const schema = command.inputSchema
  if (schema === undefined) return "input:none"
  const required = schema.required ?? []
  return required.length === 0
    ? "input:schema optional"
    : `input:schema required:${required.join(",")}`
}
