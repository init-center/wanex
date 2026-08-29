import type {
  ModelBehavior,
  ModelFeature,
  ModelInputModality,
  ModelLimits,
  ModelOutputModality
} from "@wanex/protocol"

export const LOCAL_MODEL_CATALOG_ID = "models.dev" as const
export const LOCAL_MODEL_CATALOG_CONFIG_KEY =
  "assistant-host.model-catalog" as const

export const LOCAL_CATALOG_PROVIDER_IDS = [
  "openai",
  "anthropic",
  "deepseek"
] as const

export type LocalCatalogProviderId =
  typeof LOCAL_CATALOG_PROVIDER_IDS[number]

export interface LocalModelCatalogEntry {
  readonly id: string
  readonly inputModalities: readonly ModelInputModality[]
  readonly outputModalities: readonly ModelOutputModality[]
  readonly features: readonly ModelFeature[]
  readonly limits?: ModelLimits
  readonly behavior?: ModelBehavior
}

export interface LocalModelCatalog {
  readonly kind: "assistant-host.model-catalog"
  readonly catalogId: typeof LOCAL_MODEL_CATALOG_ID
  readonly source: "builtin" | "provider"
  readonly revision: string
  readonly providers: Readonly<
    Record<
      LocalCatalogProviderId,
      Readonly<Record<string, LocalModelCatalogEntry>>
    >
  >
}
