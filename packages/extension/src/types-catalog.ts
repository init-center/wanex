import type { AppExtensionResolvedSnapshot } from "./types-resolution.js"

export interface AppExtensionCatalogGeneration {
  readonly revision: string
  readonly snapshot: AppExtensionResolvedSnapshot
}

export type AppExtensionCatalogListener = (
  generation: AppExtensionCatalogGeneration
) => void

export interface AppExtensionCatalogSource {
  current(): AppExtensionCatalogGeneration
  subscribe(listener: AppExtensionCatalogListener): () => void
}

export interface AppExtensionCatalogPublication {
  readonly changed: boolean
  readonly listenerErrors: readonly unknown[]
}

export interface AppExtensionCatalogController {
  readonly source: AppExtensionCatalogSource
  publish(
    generation: AppExtensionCatalogGeneration
  ): AppExtensionCatalogPublication
}
