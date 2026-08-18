import type { ModelDescriptor } from "@wanex/protocol"
import {
  unresolvedConversationModel,
  type ConversationModelResolver
} from "@wanex/product"
import { BUNDLED_LOCAL_MODEL_CATALOG } from "./snapshot.generated.js"
import type {
  LocalCatalogProviderId,
  LocalModelCatalog
} from "./types.js"

export const LOCAL_MODEL_SUGGESTION_LIMIT = 512

export class LocalModelCatalogResolver
  implements ConversationModelResolver {
  private cached: LocalModelCatalog | undefined

  constructor(
    private readonly bundled: LocalModelCatalog =
      BUNDLED_LOCAL_MODEL_CATALOG
  ) {}

  replaceCache(catalog: LocalModelCatalog | undefined): void {
    this.cached = catalog
  }

  resolveConversationModel(
    providerId: LocalCatalogProviderId,
    modelId: string
  ): ModelDescriptor {
    const normalizedModelId = requireModelId(modelId)
    const source = this.cached?.providers[providerId][normalizedModelId] === undefined
      ? this.bundled
      : this.cached
    const entry = source.providers[providerId][normalizedModelId]
    if (entry === undefined) {
      return unresolvedConversationModel(providerId, normalizedModelId)
    }
    return {
      id: entry.id,
      operations: ["conversation"],
      inputModalities: entry.inputModalities,
      outputModalities: entry.outputModalities,
      features: entry.features,
      ...(entry.limits === undefined ? {} : { limits: entry.limits }),
      ...(entry.behavior === undefined ? {} : { behavior: entry.behavior }),
      catalog: {
        source: source.source,
        catalogId: `${source.catalogId}/${providerId}`,
        revision: source.revision
      }
    }
  }

  listConversationModelIds(
    providerId: LocalCatalogProviderId
  ): readonly string[] {
    const preferred = this.cached === undefined
      ? []
      : Object.keys(this.cached.providers[providerId]).sort()
    const fallback = Object.keys(this.bundled.providers[providerId]).sort()
    const selected = new Set<string>()
    for (const modelId of [...preferred, ...fallback]) {
      if (selected.size >= LOCAL_MODEL_SUGGESTION_LIMIT) break
      selected.add(modelId)
    }
    return [...selected].sort()
  }
}

function requireModelId(value: string): string {
  const normalized = value.trim()
  if (normalized.length === 0 || Buffer.byteLength(normalized, "utf8") > 256) {
    throw new Error("conversation model ID must contain 1 to 256 bytes")
  }
  return normalized
}
