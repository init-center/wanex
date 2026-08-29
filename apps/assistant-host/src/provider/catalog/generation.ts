import type { LocalModelCatalog } from "./types.js"

export function renderLocalModelCatalogSource(
  catalog: LocalModelCatalog
): string {
  return [
    "/* Generated from a validated models.dev API payload. Do not edit. */",
    'import type { LocalModelCatalog } from "./types.js"',
    "",
    `export const BUNDLED_LOCAL_MODEL_CATALOG = ${JSON.stringify(catalog)} as const satisfies LocalModelCatalog`,
    ""
  ].join("\n")
}
