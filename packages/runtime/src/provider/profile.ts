import type { JsonValue, ProviderProfile } from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import { AnthropicAdapter } from "./adapters/anthropic.js"
import { FakeProviderAdapter } from "./adapters/fake.js"
import {
  DeepSeekThinkingAdapter,
  OpenAICompatibleAdapter
} from "./adapters/openai-compatible.js"
import type { ProviderAdapter } from "./types.js"

export function providerConfigKey(profileId: string): string {
  if (profileId.length === 0) {
    throw new Error("provider profile id must not be empty")
  }
  return `provider.profile.${profileId}`
}

export function profileToJson(profile: ProviderProfile): JsonValue {
  return {
    id: profile.id,
    kind: profile.kind,
    providerId: profile.providerId,
    modelId: profile.modelId,
    ...(profile.baseUrl === undefined ? {} : { baseUrl: profile.baseUrl }),
    ...(profile.apiKey === undefined ? {} : { apiKey: profile.apiKey }),
    ...(profile.anthropicVersion === undefined
      ? {}
      : { anthropicVersion: profile.anthropicVersion })
  }
}

export function providerProfileFromJson(value: JsonValue): ProviderProfile {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("provider profile config must be an object")
  }
  const profile = value as Record<string, JsonValue>
  const kind = expectString(profile.kind, "provider.kind")
  if (
    kind !== "fake" &&
    kind !== "openai-compatible" &&
    kind !== "anthropic" &&
    kind !== "deepseek"
  ) {
    throw new Error(`invalid provider kind: ${kind}`)
  }
  return {
    id: expectString(profile.id, "provider.id"),
    kind,
    providerId: expectString(profile.providerId, "provider.providerId"),
    modelId: expectString(profile.modelId, "provider.modelId"),
    ...(profile.baseUrl === undefined
      ? {}
      : { baseUrl: expectString(profile.baseUrl, "provider.baseUrl") }),
    ...(profile.apiKey === undefined
      ? {}
      : { apiKey: expectString(profile.apiKey, "provider.apiKey") }),
    ...(profile.anthropicVersion === undefined
      ? {}
      : {
          anthropicVersion: expectString(
            profile.anthropicVersion,
            "provider.anthropicVersion"
          )
        })
  }
}

export function providerFromProfile(profile: ProviderProfile): ProviderAdapter {
  if (profile.kind === "fake") {
    return new FakeProviderAdapter({
      providerId: profile.providerId,
      modelId: profile.modelId,
      responseText: `Fake response from ${profile.modelId}`
    })
  }
  const baseUrl = requireProfileField(profile.baseUrl, profile.kind, "baseUrl")
  const apiKey = requireProfileField(profile.apiKey, profile.kind, "apiKey")
  if (profile.kind === "anthropic") {
    return new AnthropicAdapter({
      modelId: profile.modelId,
      baseUrl,
      apiKey,
      ...(profile.anthropicVersion === undefined
        ? {}
        : { anthropicVersion: profile.anthropicVersion })
    })
  }
  if (profile.kind === "deepseek") {
    return new DeepSeekThinkingAdapter({
      modelId: profile.modelId,
      baseUrl,
      apiKey
    })
  }
  return new OpenAICompatibleAdapter({
    providerId: profile.providerId,
    modelId: profile.modelId,
    baseUrl,
    apiKey
  })
}

export async function readProviderProfile(
  storage: CoreStore,
  profileId: string
): Promise<ProviderProfile | null> {
  const value = await storage.getConfig(providerConfigKey(profileId))
  return value === null ? null : providerProfileFromJson(value)
}

export async function requireProviderProfile(
  storage: CoreStore,
  profileId: string
): Promise<ProviderProfile> {
  const profile = await readProviderProfile(storage, profileId)
  if (profile === null) {
    throw new Error(`provider profile not found: ${profileId}`)
  }
  return profile
}

export async function writeProviderProfile(
  storage: CoreStore,
  profile: ProviderProfile
): Promise<void> {
  await storage.putConfig(providerConfigKey(profile.id), profileToJson(profile))
}

export async function resolveProviderProfile(
  storage: CoreStore,
  profileId: string
): Promise<ProviderAdapter> {
  return providerFromProfile(await requireProviderProfile(storage, profileId))
}

export function redactProfile(profile: ProviderProfile): ProviderProfile {
  return {
    ...profile,
    ...(profile.apiKey === undefined ? {} : { apiKey: "***" })
  }
}

function requireProfileField(
  value: string | undefined,
  kind: ProviderProfile["kind"],
  field: string
): string {
  if (value === undefined || value.length === 0) {
    throw new Error(`${kind} provider profile requires ${field}`)
  }
  return value
}

function expectString(value: JsonValue | undefined, name: string): string {
  if (typeof value !== "string") {
    throw new Error(`${name} must be a string`)
  }
  return value
}
