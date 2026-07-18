import type {
  ProductAppWebCommandCatalogViewModel,
  ProductAppWebSnapshot
} from "./types.js"
import { projectProductAppWebCommandInput } from "./command-input-view.js"

export function projectProductAppWebCommandCatalog(
  result: ProductAppWebSnapshot["commandCatalog"]
): ProductAppWebCommandCatalogViewModel {
  if (!result.ok) {
    return {
      kind: "product-app-web.command-catalog",
      state: "unavailable",
      message: "Product command catalog unavailable",
      rows: [],
      diagnostics: []
    }
  }

  return {
    kind: "product-app-web.command-catalog",
    state: "ready",
    message: commandCatalogMessage(result.value.commands.length),
    rows: result.value.commands.map((command) => ({
      id: command.id,
      name: command.name,
      title: command.title,
      handlerRef: command.handlerRef,
      sourceKind: command.sourceKind,
      sourceId: command.sourceId,
      trust: command.trust,
      input: projectProductAppWebCommandInput(command.inputSchema),
      ...(command.category === undefined ? {} : { category: command.category })
    })),
    diagnostics: result.value.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      severity: diagnostic.severity,
      message: diagnostic.message,
      ...(diagnostic.contributionId === undefined
        ? {}
        : { contributionId: diagnostic.contributionId }),
      ...(diagnostic.sourceId === undefined
        ? {}
        : { sourceId: diagnostic.sourceId })
    }))
  }
}

function commandCatalogMessage(count: number): string {
  if (count === 0) {
    return "No product commands available"
  }
  return `${count} product command${count === 1 ? "" : "s"} available`
}
