import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  createStorageTestStore,
  type StorageTestStore
} from "@wanex/storage/testing"
import {
  AnthropicAdapter,
  OpenAICompatibleAdapter,
  modelEndpointConfigKey,
  modelEndpointToJson,
  providerFromModelEndpoint,
  modelEndpointFromJson,
  readModelEndpoint,
  resolveModelEndpoint,
  summarizeModelEndpoint,
  writeModelEndpoint
} from "../src/provider/index.js"
import {
  SecretResolver,
  StaticSecretProvider
} from "../src/secrets/index.js"
import { testModelEndpoint } from "./model-endpoint-fixture.js"

const serviceBin = join(import.meta.dirname, `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`)
const tempDirs: string[] = []
const clients: StorageTestStore[] = []

afterEach(async () => {
  while (clients.length > 0) {
    await clients.pop()?.dispose()
  }
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("Runtime model endpoints", () => {
  it("persists complete endpoints through the storage boundary", async () => {
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-model-endpoint-"))
    tempDirs.push(storeDir)
    const storage = createStorageTestStore({ kind: "local-system-service", mode: "persistent", storeDir, serviceBin })
    clients.push(storage)
    const secretValue = "provider-secret-value"
    const secretRef = "static://provider/anthropic-main"
    const secretResolver = new SecretResolver([
      new StaticSecretProvider({ values: { [secretRef]: secretValue } })
    ])
    const endpoint = testModelEndpoint({
      endpointId: "anthropic-main",
      protocolId: "anthropic-messages",
      providerId: "anthropic",
      modelId: "claude-fixture",
      baseUrl: "https://api.anthropic.com/v1",
      secretRef,
      protocolVersion: "2023-06-01"
    })
    const boundedEndpoint = {
      ...endpoint,
      model: {
        ...endpoint.model,
        limits: {
          contextWindowTokens: 1_000_000,
          maxInputTokens: 900_000,
          maxOutputTokens: 100_000,
          maxInputResources: 32
        }
      }
    }
    expect(modelEndpointFromJson(modelEndpointToJson(boundedEndpoint))).toEqual(
      boundedEndpoint
    )
    await writeModelEndpoint(storage, endpoint)
    await expect(readModelEndpoint(storage, endpoint.id)).resolves.toEqual(endpoint)
    expect(modelEndpointToJson(endpoint)).toMatchObject({
      connection: { secretRef }
    })
    expect(JSON.stringify(modelEndpointToJson(endpoint))).not.toContain(secretValue)
    expect(summarizeModelEndpoint(endpoint)).toEqual({
      id: "anthropic-main",
      connection: {
        id: "connection_anthropic-main",
        providerId: "anthropic",
        baseUrl: "https://api.anthropic.com/v1"
      },
      protocol: { id: "anthropic-messages", version: "2023-06-01" },
      model: endpoint.model,
      credentialConfigured: true
    })
    expect(JSON.stringify(summarizeModelEndpoint(endpoint))).not.toContain(
      secretRef
    )
    expect(modelEndpointConfigKey(endpoint.id)).toBe("model.endpoint.anthropic-main")
    expect(() => modelEndpointConfigKey("")).toThrow("must not be empty")
    await expect(resolveModelEndpoint(storage, endpoint.id, secretResolver)).resolves.toBeInstanceOf(
      AnthropicAdapter
    )
    expect((await readFile(join(storeDir, "state.db"))).includes(secretValue)).toBe(false)
    await expect(storage.queryEvents({ limit: 10 })).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "config.updated",
          payload: expect.objectContaining({ key: modelEndpointConfigKey(endpoint.id) })
        })
      ])
    )
  })

  it("uses one OpenAI protocol adapter for distinct OpenAI and DeepSeek providers", async () => {
    const secretResolver = new SecretResolver([
      new StaticSecretProvider({
        values: {
          "static://provider/a": "anthropic-secret",
          "static://provider/o": "openai-secret",
          "static://provider/d": "deepseek-secret"
        }
      })
    ])
    const anthropic = testModelEndpoint({
      endpointId: "a",
      protocolId: "anthropic-messages",
      providerId: "anthropic",
      modelId: "claude",
      baseUrl: "https://api.example",
      secretRef: "static://provider/a"
    })
    const deepseek = testModelEndpoint({
      endpointId: "d",
      protocolId: "openai-chat-completions",
      providerId: "deepseek",
      modelId: "deepseek-v4",
      baseUrl: "https://api.example",
      secretRef: "static://provider/d",
      behavior: { reasoningReplay: "required" }
    })
    const openai = testModelEndpoint({
      endpointId: "o",
      protocolId: "openai-chat-completions",
      providerId: "openai",
      modelId: "gpt-4.1",
      baseUrl: "https://api.example",
      secretRef: "static://provider/o"
    })
    await expect(providerFromModelEndpoint(anthropic, secretResolver))
      .resolves.toBeInstanceOf(AnthropicAdapter)
    const openaiAdapter = await providerFromModelEndpoint(openai, secretResolver)
    const deepseekAdapter = await providerFromModelEndpoint(deepseek, secretResolver)
    expect(openaiAdapter).toBeInstanceOf(OpenAICompatibleAdapter)
    expect(deepseekAdapter).toBeInstanceOf(OpenAICompatibleAdapter)
    expect(openai.protocol.id).toBe("openai-chat-completions")
    expect(deepseek.protocol.id).toBe(openai.protocol.id)
    expect(openai.connection.providerId).not.toBe(deepseek.connection.providerId)
    expect(deepseek.model.behavior?.reasoningReplay).toBe("required")
    expect(openaiAdapter.providerId).toBe("openai")
    expect(deepseekAdapter.providerId).toBe("deepseek")
    expect(modelEndpointFromJson(modelEndpointToJson(deepseek))).toEqual(deepseek)
    await expect(providerFromModelEndpoint(testModelEndpoint({
      endpointId: "broken",
      protocolId: "openai-chat-completions",
      providerId: "openai",
      modelId: "model"
    }), secretResolver)).rejects.toThrow("requires baseUrl")
  })
})
