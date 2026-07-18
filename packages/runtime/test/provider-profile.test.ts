import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createStorageTestStore } from "@wanex/storage/testing"
import {
  AnthropicAdapter,
  DeepSeekThinkingAdapter,
  profileToJson,
  providerConfigKey,
  providerFromProfile,
  providerProfileFromJson,
  redactProfile,
  readProviderProfile,
  resolveProviderProfile,
  writeProviderProfile
} from "../src/provider/index.js"

const serviceBin = join(import.meta.dirname, "../../../target/debug/wanex-system-service")
const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("Runtime provider profiles", () => {
  it("persists profiles through the storage boundary", async () => {
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-provider-profile-"))
    tempDirs.push(storeDir)
    const storage = createStorageTestStore({ kind: "local-system-service", mode: "oneshot", storeDir, serviceBin })
    const profile = {
      id: "anthropic-main",
      kind: "anthropic" as const,
      providerId: "anthropic",
      modelId: "claude-fixture",
      baseUrl: "https://api.anthropic.com/v1",
      apiKey: "secret",
      anthropicVersion: "2023-06-01"
    }
    await writeProviderProfile(storage, profile)
    await expect(readProviderProfile(storage, profile.id)).resolves.toEqual(profile)
    expect(profileToJson(profile)).toMatchObject({ apiKey: "secret" })
    expect(redactProfile(profile).apiKey).toBe("***")
    expect(providerConfigKey(profile.id)).toBe("provider.profile.anthropic-main")
    expect(() => providerConfigKey("")).toThrow("must not be empty")
    await expect(resolveProviderProfile(storage, profile.id)).resolves.toBeInstanceOf(
      AnthropicAdapter
    )
    await expect(storage.queryEvents({ limit: 10 })).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "config.updated",
          payload: expect.objectContaining({ key: providerConfigKey(profile.id) })
        })
      ])
    )
  })

  it("resolves explicit Anthropic and DeepSeek fidelity adapters", () => {
    expect(providerFromProfile({
      id: "a", kind: "anthropic", providerId: "anthropic", modelId: "claude",
      baseUrl: "https://api.example", apiKey: "secret"
    })).toBeInstanceOf(AnthropicAdapter)
    expect(providerFromProfile({
      id: "d", kind: "deepseek", providerId: "deepseek", modelId: "deepseek-v4",
      baseUrl: "https://api.example", apiKey: "secret"
    })).toBeInstanceOf(DeepSeekThinkingAdapter)
    expect(providerProfileFromJson({
      id: "d", kind: "deepseek", providerId: "deepseek", modelId: "deepseek-v4",
      baseUrl: "https://api.example", apiKey: "secret"
    }).kind).toBe("deepseek")
    expect(() => providerFromProfile({
      id: "broken", kind: "openai-compatible", providerId: "openai", modelId: "model"
    })).toThrow("requires baseUrl")
  })
})
