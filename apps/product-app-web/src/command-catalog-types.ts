import type {
  ProductAppWebCommandInputViewModel
} from "./command-input-types.js"

export interface ProductAppWebCommandCatalogViewModel {
  readonly kind: "product-app-web.command-catalog"
  readonly state: "ready" | "unavailable"
  readonly message: string
  readonly rows: readonly ProductAppWebCommandCatalogRow[]
  readonly diagnostics: readonly ProductAppWebCommandCatalogDiagnostic[]
}

export interface ProductAppWebCommandCatalogRow {
  readonly id: string
  readonly name: string
  readonly title: string
  readonly handlerRef: string
  readonly sourceKind: string
  readonly sourceId: string
  readonly trust: string
  readonly category?: string
  readonly input: ProductAppWebCommandInputViewModel
}

export interface ProductAppWebCommandCatalogDiagnostic {
  readonly code: string
  readonly severity: string
  readonly message: string
  readonly contributionId?: string
  readonly sourceId?: string
}
