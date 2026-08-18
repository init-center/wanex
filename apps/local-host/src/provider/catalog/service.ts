import type { CoreStore } from "@wanex/storage"
import type {
  LocalModelCatalogCommands,
  LocalModelCatalogRefreshFailure,
  LocalModelCatalogRefreshResult
} from "../../model.js"
import { LocalModelCatalogResolver } from "./resolver.js"
import {
  LOCAL_MODEL_CATALOG_CONFIG_KEY,
  LOCAL_CATALOG_PROVIDER_IDS
} from "./types.js"
import {
  LocalModelCatalogValidationError,
  modelCatalogToJson,
  parseLocalModelCatalog,
  projectModelsDevCatalog
} from "./validator.js"

export const LOCAL_MODEL_CATALOG_URL =
  "https://models.dev/api.json" as const
export const LOCAL_MODEL_CATALOG_MAX_BYTES = 8 * 1024 * 1024
export const LOCAL_MODEL_CATALOG_TIMEOUT_MS = 10_000

type ModelCatalogStorage = Pick<CoreStore, "getConfig" | "putConfig">
type ModelCatalogFetch = (
  input: string,
  init: { readonly method: "GET"; readonly signal: AbortSignal }
) => Promise<Response>

export interface LocalModelCatalogService
  extends LocalModelCatalogCommands {
  readonly resolver: LocalModelCatalogResolver
}

export async function createLocalModelCatalogService(options: {
  readonly storage: ModelCatalogStorage
  readonly fetch?: ModelCatalogFetch
  readonly timeoutMs?: number
  readonly maxResponseBytes?: number
}): Promise<LocalModelCatalogService> {
  const resolver = new LocalModelCatalogResolver()
  const persisted = await options.storage.getConfig(
    LOCAL_MODEL_CATALOG_CONFIG_KEY
  )
  if (persisted !== null) {
    try {
      resolver.replaceCache(parseLocalModelCatalog(persisted))
    } catch (error) {
      if (!(error instanceof LocalModelCatalogValidationError)) {
        throw error
      }
    }
  }
  return {
    resolver,
    readConversationModelSuggestions() {
      return {
        kind: "local-host.conversation-model-suggestions",
        providers: {
          openai: resolver.listConversationModelIds("openai"),
          anthropic: resolver.listConversationModelIds("anthropic"),
          deepseek: resolver.listConversationModelIds("deepseek")
        }
      }
    },
    async refresh() {
      return await refreshCatalog({
        storage: options.storage,
        resolver,
        fetch: options.fetch ?? globalThis.fetch,
        timeoutMs: boundedOption(
          options.timeoutMs,
          LOCAL_MODEL_CATALOG_TIMEOUT_MS,
          1,
          60_000,
          "model catalog timeoutMs"
        ),
        maxResponseBytes: boundedOption(
          options.maxResponseBytes,
          LOCAL_MODEL_CATALOG_MAX_BYTES,
          1_024,
          LOCAL_MODEL_CATALOG_MAX_BYTES,
          "model catalog maxResponseBytes"
        )
      })
    }
  }
}

async function refreshCatalog(options: {
  readonly storage: ModelCatalogStorage
  readonly resolver: LocalModelCatalogResolver
  readonly fetch: ModelCatalogFetch
  readonly timeoutMs: number
  readonly maxResponseBytes: number
}): Promise<LocalModelCatalogRefreshResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs)
  let response: Response
  try {
    response = await options.fetch(LOCAL_MODEL_CATALOG_URL, {
      method: "GET",
      signal: controller.signal
    })
  } catch {
    clearTimeout(timeout)
    return failure(
      controller.signal.aborted ? "timeout" : "transport_failed",
      controller.signal.aborted
        ? "Model catalog refresh timed out"
        : "Model catalog could not be reached"
    )
  }
  if (!response.ok) {
    clearTimeout(timeout)
    await cancelResponse(response)
    return failure("unexpected_status", "Model catalog returned an unexpected status")
  }

  let bytes: Uint8Array
  try {
    bytes = await readBoundedResponse(response, options.maxResponseBytes)
  } catch (error) {
    return error instanceof ResponseTooLargeError
      ? failure("response_too_large", "Model catalog response is too large")
      : failure("transport_failed", "Model catalog response could not be read")
  } finally {
    clearTimeout(timeout)
  }

  let catalog
  try {
    catalog = projectModelsDevCatalog(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
      "provider"
    )
  } catch {
    return failure("malformed_catalog", "Model catalog response is invalid")
  }

  try {
    await options.storage.putConfig(
      LOCAL_MODEL_CATALOG_CONFIG_KEY,
      modelCatalogToJson(catalog)
    )
  } catch {
    return failure("persistence_failed", "Model catalog could not be persisted")
  }
  options.resolver.replaceCache(catalog)
  return {
    kind: "local-host.model-catalog.refreshed",
    revision: catalog.revision,
    providerCount: LOCAL_CATALOG_PROVIDER_IDS.length,
    modelCount: LOCAL_CATALOG_PROVIDER_IDS.reduce(
      (total, providerId) => total + Object.keys(catalog.providers[providerId]).length,
      0
    )
  }
}

async function readBoundedResponse(
  response: Response,
  maxBytes: number
): Promise<Uint8Array> {
  const declared = response.headers.get("content-length")
  if (declared !== null) {
    const size = Number(declared)
    if (!Number.isSafeInteger(size) || size < 0 || size > maxBytes) {
      await cancelResponse(response)
      throw new ResponseTooLargeError()
    }
  }
  if (response.body === null) throw new Error("model catalog response body is missing")
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      total += next.value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        throw new ResponseTooLargeError()
      }
      chunks.push(next.value)
    }
  } finally {
    reader.releaseLock()
  }
  if (total === 0) throw new Error("model catalog response body is empty")
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

async function cancelResponse(response: Response): Promise<void> {
  try {
    await response.body?.cancel()
  } catch {}
}

function failure(
  code: LocalModelCatalogRefreshFailure["code"],
  message: string
): LocalModelCatalogRefreshFailure {
  return {
    kind: "local-host.model-catalog.refresh-failed",
    code,
    message
  }
}

function boundedOption(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string
): number {
  const result = value ?? fallback
  if (!Number.isSafeInteger(result) || result < minimum || result > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}`)
  }
  return result
}

class ResponseTooLargeError extends Error {}
