import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  createStorageTestStore,
  type StorageTestStore
} from "@wanex/storage/testing"
import { BUNDLED_LOCAL_MODEL_CATALOG } from "../src/provider/catalog/snapshot.generated.js"
import {
  LocalModelCatalogResolver,
  LOCAL_MODEL_SUGGESTION_LIMIT,
  LOCAL_MODEL_CATALOG_CONFIG_KEY,
  LOCAL_MODEL_CATALOG_MAX_BYTES,
  LOCAL_MODEL_CATALOG_URL,
  createLocalModelCatalogService,
  modelCatalogToJson,
  parseLocalModelCatalog,
  projectModelsDevCatalog,
  renderLocalModelCatalogSource
} from "../src/provider/catalog/index.js"
import type {
  LocalModelCatalog,
  LocalModelCatalogEntry
} from "../src/provider/catalog/types.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)
const tempDirs: string[] = []
const stores: StorageTestStore[] = []

afterEach(async () => {
  while (stores.length > 0) await stores.pop()?.dispose()
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

describe("local host model catalog", () => {
  it("resolves truthful bundled descriptors and keeps unknown models conservative", () => {
    const resolver = new LocalModelCatalogResolver()

    expect(resolver.resolveConversationModel("openai", "gpt-5.2")).toEqual({
      id: "gpt-5.2",
      operations: ["conversation"],
      inputModalities: ["text", "image"],
      outputModalities: ["text"],
      features: ["tool_calling", "reasoning"],
      limits: {
        contextWindowTokens: 400_000,
        maxInputTokens: 272_000,
        maxOutputTokens: 128_000
      },
      catalog: {
        source: "builtin",
        catalogId: "models.dev/openai",
        revision: BUNDLED_LOCAL_MODEL_CATALOG.revision
      }
    })
    expect(
      resolver.resolveConversationModel("anthropic", "claude-sonnet-4-5")
    ).toMatchObject({
      inputModalities: ["text", "image", "document"],
      limits: {
        contextWindowTokens: 1_000_000,
        maxOutputTokens: 64_000
      }
    })
    expect(
      resolver.resolveConversationModel("anthropic", "claude-sonnet-4-5")
        .limits
    ).not.toHaveProperty("maxInputTokens")
    expect(resolver.resolveConversationModel("deepseek", "deepseek-chat"))
      .toMatchObject({ features: ["tool_calling"] })
    expect(resolver.resolveConversationModel("deepseek", "deepseek-chat"))
      .not.toHaveProperty("behavior")
    expect(resolver.resolveConversationModel("deepseek", "deepseek-reasoner"))
      .toMatchObject({
        features: ["tool_calling", "reasoning"],
        behavior: { reasoningReplay: "required" }
      })

    expect(resolver.resolveConversationModel("openai", "private-model"))
      .toEqual({
        id: "private-model",
        operations: ["conversation"],
        inputModalities: ["text"],
        outputModalities: ["text"],
        features: [],
        catalog: {
          source: "custom",
          catalogId: "openai.unresolved",
          revision: "unresolved"
        }
      })
    expect(resolver.listConversationModelIds("openai")).toEqual(
      [...resolver.listConversationModelIds("openai")].sort()
    )
    expect(resolver.listConversationModelIds("openai")).toContain("gpt-5.2")
    expect(resolver.listConversationModelIds("anthropic"))
      .toContain("claude-sonnet-4-5")
    expect(resolver.listConversationModelIds("deepseek"))
      .toContain("deepseek-reasoner")
  })

  it("bounds suggestions while preferring validated cache models", () => {
    const bundledIds = Array.from(
      { length: LOCAL_MODEL_SUGGESTION_LIMIT },
      (_, index) => `bundled-${String(index).padStart(3, "0")}`
    )
    const cachedIds = Array.from(
      { length: LOCAL_MODEL_SUGGESTION_LIMIT },
      (_, index) => `cached-${String(index).padStart(3, "0")}`
    )
    const resolver = new LocalModelCatalogResolver(
      catalogWithOpenAIModels("builtin", bundledIds)
    )
    resolver.replaceCache(catalogWithOpenAIModels("provider", cachedIds))

    expect(resolver.listConversationModelIds("openai")).toEqual(cachedIds)
    expect(resolver.listConversationModelIds("openai")).toHaveLength(
      LOCAL_MODEL_SUGGESTION_LIMIT
    )
  })

  it("projects only model metadata and produces deterministic strict cache JSON", () => {
    const payload = modelsDevPayload({
      openai: model("gpt-test", {
        input: ["image", "text", "pdf"],
        context: 12_000,
        inputLimit: 10_000,
        outputLimit: 2_000,
        reasoning: true,
        toolCall: true,
        extra: {
          baseUrl: "https://attacker.example.test",
          protocol: { id: "attacker" },
          secretRef: "env://stolen"
        }
      })
    })
    ;(payload.openai as Record<string, unknown>).baseUrl =
      "https://provider-attacker.example.test"

    const first = projectModelsDevCatalog(payload, "provider")
    const reordered = modelsDevPayload({
      openai: model("gpt-test", {
        input: ["pdf", "text", "image"],
        context: 12_000,
        inputLimit: 10_000,
        outputLimit: 2_000,
        reasoning: true,
        toolCall: true
      })
    })
    const second = projectModelsDevCatalog(reordered, "provider")

    expect(first.revision).toBe(second.revision)
    expect(first.providers.openai["gpt-test"]).toEqual({
      id: "gpt-test",
      inputModalities: ["text", "image"],
      outputModalities: ["text"],
      features: ["tool_calling", "reasoning"],
      limits: {
        contextWindowTokens: 12_000,
        maxInputTokens: 10_000,
        maxOutputTokens: 2_000
      }
    })
    expect(JSON.stringify(first)).not.toContain("attacker")
    expect(JSON.stringify(first)).not.toContain("secretRef")
    expect(parseLocalModelCatalog(modelCatalogToJson(first))).toEqual(first)
    expect(renderLocalModelCatalogSource({
      ...first,
      source: "builtin"
    })).toBe(renderLocalModelCatalogSource({
      ...second,
      source: "builtin"
    }))

    const forgedCache = modelCatalogToJson(first) as Record<string, unknown>
    forgedCache.revision = "sha256:forged"
    expect(() => parseLocalModelCatalog(
      forgedCache as import("@wanex/protocol").JsonValue
    )).toThrow("revision does not match")
  })

  it("refreshes through the fixed URL and restores validated cache after restart", async () => {
    const storeDir = await createTempDir("wanex-model-catalog-")
    const calls: string[] = []
    const payload = modelsDevPayload({
      openai: model("new-exact-model", {
        context: 50_000,
        inputLimit: 40_000,
        outputLimit: 10_000,
        toolCall: true
      })
    })
    const firstStore = createStore(storeDir)
    const first = await createLocalModelCatalogService({
      storage: firstStore,
      fetch: async (input, init) => {
        calls.push(input)
        expect(init.method).toBe("GET")
        return jsonResponse(payload)
      }
    })
    const existing = first.resolver.resolveConversationModel("openai", "gpt-5.2")
    await expect(first.refresh()).resolves.toMatchObject({
      kind: "local-host.model-catalog.refreshed",
      providerCount: 3,
      modelCount: 3,
      revision: expect.stringMatching(/^sha256:[a-f0-9]{64}$/)
    })
    expect(calls).toEqual([LOCAL_MODEL_CATALOG_URL])
    expect(first.resolver.resolveConversationModel("openai", "new-exact-model"))
      .toMatchObject({
        limits: {
          contextWindowTokens: 50_000,
          maxInputTokens: 40_000,
          maxOutputTokens: 10_000
        },
        catalog: { source: "provider" }
      })
    expect(first.readConversationModelSuggestions().providers.openai)
      .toEqual(expect.arrayContaining(["new-exact-model", "gpt-5.2"]))
    expect(existing.catalog.source).toBe("builtin")

    await firstStore.dispose()
    stores.splice(stores.indexOf(firstStore), 1)
    const secondStore = createStore(storeDir)
    const second = await createLocalModelCatalogService({
      storage: secondStore,
      fetch: async () => {
        throw new Error("refresh must not run during startup")
      }
    })
    expect(second.resolver.resolveConversationModel("openai", "new-exact-model"))
      .toMatchObject({ catalog: { source: "provider" } })
    await expect(secondStore.getConfig(LOCAL_MODEL_CATALOG_CONFIG_KEY))
      .resolves.not.toBeNull()
  })

  it("keeps the previous cache after timeout, malformed, oversized, or failed writes", async () => {
    const values = new Map<string, import("@wanex/protocol").JsonValue>()
    const storage = {
      async getConfig(key: string) { return values.get(key) ?? null },
      async putConfig(key: string, value: import("@wanex/protocol").JsonValue) {
        values.set(key, value)
      }
    }
    const validPayload = modelsDevPayload({
      openai: model("cached-model", { context: 9_000 })
    })
    const service = await createLocalModelCatalogService({
      storage,
      fetch: async () => jsonResponse(validPayload)
    })
    expect((await service.refresh()).kind).toBe(
      "local-host.model-catalog.refreshed"
    )
    const cached = service.resolver.resolveConversationModel("openai", "cached-model")

    const failures = [
      await (await createLocalModelCatalogService({
        storage,
        timeoutMs: 5,
        fetch: async (_input, init) => await new Promise<Response>((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true
          })
        })
      })).refresh(),
      await (await createLocalModelCatalogService({
        storage,
        fetch: async () => new Response("not json", { status: 200 })
      })).refresh(),
      await (await createLocalModelCatalogService({
        storage,
        fetch: async () => new Response("{}", {
          status: 200,
          headers: {
            "content-length": String(
              LOCAL_MODEL_CATALOG_MAX_BYTES + 1
            )
          }
        })
      })).refresh()
    ]
    expect(failures.map((failure) => failure.kind)).toEqual([
      "local-host.model-catalog.refresh-failed",
      "local-host.model-catalog.refresh-failed",
      "local-host.model-catalog.refresh-failed"
    ])
    expect(failures.map((failure) =>
      failure.kind === "local-host.model-catalog.refresh-failed"
        ? failure.code
        : "unexpected"
    )).toEqual(["timeout", "malformed_catalog", "response_too_large"])

    const persistenceFailure = await createLocalModelCatalogService({
      storage: {
        getConfig: storage.getConfig,
        async putConfig() { throw new Error("database unavailable: sensitive detail") }
      },
      fetch: async () => jsonResponse(modelsDevPayload({
        openai: model("replacement-model", { context: 11_000 })
      }))
    })
    await expect(persistenceFailure.refresh()).resolves.toEqual({
      kind: "local-host.model-catalog.refresh-failed",
      code: "persistence_failed",
      message: "Model catalog could not be persisted"
    })
    expect(
      persistenceFailure.resolver.resolveConversationModel("openai", "cached-model")
    ).toEqual(cached)
    expect(
      persistenceFailure.resolver.resolveConversationModel("openai", "replacement-model")
        .catalog.source
    ).toBe("custom")
  })
})

function modelsDevPayload(options: {
  readonly openai?: Record<string, unknown>
} = {}): Record<string, unknown> {
  return {
    openai: provider("openai", options.openai ?? model("openai-test")),
    anthropic: provider("anthropic", model("anthropic-test")),
    deepseek: provider("deepseek", model("deepseek-test"))
  }
}

function provider(id: string, value: Record<string, unknown>) {
  return { id, models: { [value.id as string]: value } }
}

function model(
  id: string,
  options: {
    readonly input?: readonly string[]
    readonly output?: readonly string[]
    readonly context?: number
    readonly inputLimit?: number
    readonly outputLimit?: number
    readonly reasoning?: boolean
    readonly toolCall?: boolean
    readonly interleaved?: unknown
    readonly extra?: Readonly<Record<string, unknown>>
  } = {}
): Record<string, unknown> {
  return {
    id,
    attachment: (options.input ?? ["text"]).some((value) => value !== "text"),
    reasoning: options.reasoning ?? false,
    tool_call: options.toolCall ?? false,
    ...(options.interleaved === undefined ? {} : { interleaved: options.interleaved }),
    modalities: {
      input: options.input ?? ["text"],
      output: options.output ?? ["text"]
    },
    limit: {
      context: options.context ?? 8_000,
      ...(options.inputLimit === undefined ? {} : { input: options.inputLimit }),
      ...(options.outputLimit === undefined ? {} : { output: options.outputLimit })
    },
    ...(options.extra ?? {})
  }
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" }
  })
}

function catalogWithOpenAIModels(
  source: LocalModelCatalog["source"],
  modelIds: readonly string[]
): LocalModelCatalog {
  const entry = (id: string): LocalModelCatalogEntry => ({
    id,
    inputModalities: ["text"],
    outputModalities: ["text"],
    features: []
  })
  return {
    kind: "local-host.model-catalog",
    catalogId: "models.dev",
    source,
    revision: `sha256:${source.padEnd(64, "0")}`,
    providers: {
      openai: Object.fromEntries(modelIds.map((id) => [id, entry(id)])),
      anthropic: {},
      deepseek: {}
    }
  }
}

async function createTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

function createStore(storeDir: string): StorageTestStore {
  const storage = createStorageTestStore({
    kind: "local-system-service",
    mode: "persistent",
    storeDir,
    serviceBin
  })
  stores.push(storage)
  return storage
}
