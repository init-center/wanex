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
  DeepSeekThinkingAdapter,
  profileToJson,
  providerConfigKey,
  providerFromProfile,
  providerProfileFromJson,
  readProviderProfile,
  resolveProviderProfile,
  summarizeProviderProfile,
  writeProviderProfile
} from "../src/provider/index.js"
import {
  SecretResolver,
  StaticSecretProvider
} from "../src/secrets/index.js"

const serviceBin = join(import.meta.dirname, `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`)
const tempDirs: string[] = []
const clients: StorageTestStore[] = []

afterEach(async () => {
  while (clients.length > 0) {
    await clients.pop()?.dispose()
  }
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("Runtime provider profiles", () => {
  it("persists profiles through the storage boundary", async () => {
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-provider-profile-"))
    tempDirs.push(storeDir)
    const storage = createStorageTestStore({ kind: "local-system-service", mode: "persistent", storeDir, serviceBin })
    clients.push(storage)
    const secretValue = "provider-secret-value"
    const secretRef = "static://provider/anthropic-main"
    const secretResolver = new SecretResolver([
      new StaticSecretProvider({ values: { [secretRef]: secretValue } })
    ])
    const profile = {
      id: "anthropic-main",
      kind: "anthropic" as const,
      capabilities: { input: ["text"], output: ["text"] } as const,
      providerId: "anthropic",
      modelId: "claude-fixture",
      baseUrl: "https://api.anthropic.com/v1",
      secretRef,
      anthropicVersion: "2023-06-01"
    }
    await writeProviderProfile(storage, profile)
    await expect(readProviderProfile(storage, profile.id)).resolves.toEqual(profile)
    expect(profileToJson(profile)).toMatchObject({ secretRef })
    expect(JSON.stringify(profileToJson(profile))).not.toContain(secretValue)
    expect(summarizeProviderProfile(profile)).toEqual({
      id: "anthropic-main",
      kind: "anthropic",
      capabilities: { input: ["text"], output: ["text"] },
      providerId: "anthropic",
      modelId: "claude-fixture",
      baseUrl: "https://api.anthropic.com/v1",
      anthropicVersion: "2023-06-01",
      credentialConfigured: true
    })
    expect(JSON.stringify(summarizeProviderProfile(profile))).not.toContain(
      secretRef
    )
    expect(providerConfigKey(profile.id)).toBe("provider.profile.anthropic-main")
    expect(() => providerConfigKey("")).toThrow("must not be empty")
    await expect(resolveProviderProfile(storage, profile.id, secretResolver)).resolves.toBeInstanceOf(
      AnthropicAdapter
    )
    expect((await readFile(join(storeDir, "state.db"))).includes(secretValue)).toBe(false)
    await expect(storage.queryEvents({ limit: 10 })).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "config.updated",
          payload: expect.objectContaining({ key: providerConfigKey(profile.id) })
        })
      ])
    )
  })

  it("resolves explicit Anthropic and DeepSeek fidelity adapters", async () => {
    const secretResolver = new SecretResolver([
      new StaticSecretProvider({
        values: {
          "static://provider/a": "anthropic-secret",
          "static://provider/d": "deepseek-secret"
        }
      })
    ])
    await expect(providerFromProfile({
      id: "a", kind: "anthropic", providerId: "anthropic", modelId: "claude",
      capabilities: { input: ["text"], output: ["text"] },
      baseUrl: "https://api.example", secretRef: "static://provider/a"
    }, secretResolver)).resolves.toBeInstanceOf(AnthropicAdapter)
    await expect(providerFromProfile({
      id: "d", kind: "deepseek", providerId: "deepseek", modelId: "deepseek-v4",
      capabilities: { input: ["text"], output: ["text"] },
      baseUrl: "https://api.example", secretRef: "static://provider/d"
    }, secretResolver)).resolves.toBeInstanceOf(DeepSeekThinkingAdapter)
    expect(providerProfileFromJson({
      id: "d", kind: "deepseek", providerId: "deepseek", modelId: "deepseek-v4",
      capabilities: { input: ["text"], output: ["text"] },
      baseUrl: "https://api.example", secretRef: "static://provider/d"
    }).kind).toBe("deepseek")
    await expect(providerFromProfile({
      id: "broken", kind: "openai-compatible", providerId: "openai", modelId: "model"
      ,capabilities: { input: ["text"], output: ["text"] }
    }, secretResolver)).rejects.toThrow("requires baseUrl")
  })
})
