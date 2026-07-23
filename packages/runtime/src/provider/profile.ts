import type { JsonValue, ProviderProfile } from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import type { SecretResolverPort } from "../secrets/index.js"
import { AnthropicAdapter } from "./adapters/anthropic.js"
import { FakeProviderAdapter } from "./adapters/fake.js"
import {
  DeepSeekThinkingAdapter,
  OpenAICompatibleAdapter
} from "./adapters/openai-compatible.js"
import type { ProviderAdapter } from "./types.js"
import {
  assertProfileCapabilitiesSupported,
  normalizeProviderCapabilities
} from "./capabilities.js"

export interface ProviderProfileSummary {
  readonly id: string
  readonly kind: ProviderProfile["kind"]
  readonly providerId: string
  readonly modelId: string
  readonly capabilities: ProviderProfile["capabilities"]
  readonly baseUrl?: string
  readonly anthropicVersion?: string
  readonly credentialConfigured: boolean
}

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
    capabilities: {
      input: [...normalizeProviderCapabilities(profile.capabilities).input],
      output: [...normalizeProviderCapabilities(profile.capabilities).output]
    },
    ...(profile.baseUrl === undefined ? {} : { baseUrl: profile.baseUrl }),
    ...(profile.secretRef === undefined ? {} : { secretRef: profile.secretRef }),
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
    capabilities: assertProfileCapabilitiesSupported(
      kind,
      expectProviderCapabilities(profile.capabilities)
    ),
    ...(profile.baseUrl === undefined
      ? {}
      : { baseUrl: expectString(profile.baseUrl, "provider.baseUrl") }),
    ...(profile.secretRef === undefined
      ? {}
      : { secretRef: expectSecretRef(profile.secretRef) }),
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

export async function providerFromProfile(
  profile: ProviderProfile,
  secretResolver?: SecretResolverPort
): Promise<ProviderAdapter> {
  if (profile.kind === "fake") {
    return new FakeProviderAdapter({
      providerId: profile.providerId,
      modelId: profile.modelId,
      responseText: `Fake response from ${profile.modelId}`,
      capabilities: profile.capabilities
    })
  }
  const baseUrl = requireProfileField(profile.baseUrl, profile.kind, "baseUrl")
  const secretRef = requireProfileField(
    profile.secretRef,
    profile.kind,
    "secretRef"
  )
  if (secretResolver === undefined) {
    throw new Error(`${profile.kind} provider profile requires secret resolver`)
  }
  const secret = await secretResolver.resolve(secretRef, {
    providerProfileId: profile.id
  })
  try {
    const apiKey = secret.reveal()
    if (profile.kind === "anthropic") {
      return new AnthropicAdapter({
        modelId: profile.modelId,
        baseUrl,
        apiKey,
        capabilities: profile.capabilities,
        ...(profile.anthropicVersion === undefined
          ? {}
          : { anthropicVersion: profile.anthropicVersion })
      })
    }
    if (profile.kind === "deepseek") {
      return new DeepSeekThinkingAdapter({
        modelId: profile.modelId,
        baseUrl,
        apiKey,
        capabilities: profile.capabilities
      })
    }
    return new OpenAICompatibleAdapter({
      providerId: profile.providerId,
      modelId: profile.modelId,
      baseUrl,
      apiKey,
      capabilities: profile.capabilities
    })
  } finally {
    secret.dispose()
  }
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
  const normalized = providerProfileFromJson(profileToJson(profile))
  await storage.putConfig(
    providerConfigKey(normalized.id),
    profileToJson(normalized)
  )
}

export async function resolveProviderProfile(
  storage: CoreStore,
  profileId: string,
  secretResolver?: SecretResolverPort
): Promise<ProviderAdapter> {
  return await providerFromProfile(
    await requireProviderProfile(storage, profileId),
    secretResolver
  )
}

export function summarizeProviderProfile(
  profile: ProviderProfile
): ProviderProfileSummary {
  return {
    id: profile.id,
    kind: profile.kind,
    providerId: profile.providerId,
    modelId: profile.modelId,
    capabilities: profile.capabilities,
    ...(profile.baseUrl === undefined ? {} : { baseUrl: profile.baseUrl }),
    ...(profile.anthropicVersion === undefined
      ? {}
      : { anthropicVersion: profile.anthropicVersion }),
    credentialConfigured: profile.secretRef !== undefined
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

function expectSecretRef(value: JsonValue): string {
  const ref = expectString(value, "provider.secretRef")
  if (!/^[A-Za-z][A-Za-z0-9+.-]*:/.test(ref)) {
    throw new Error(`provider.secretRef must include a URI scheme: ${ref}`)
  }
  return ref
}

function expectProviderCapabilities(
  value: JsonValue | undefined
): ProviderProfile["capabilities"] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("provider.capabilities must be an object")
  }
  const record = value as Record<string, JsonValue>
  return {
    input: expectStringArray(record.input, "provider.capabilities.input"),
    output: expectStringArray(record.output, "provider.capabilities.output")
  } as ProviderProfile["capabilities"]
}

function expectStringArray(value: JsonValue | undefined, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`)
  }
  return value.map((item, index) => expectString(item, `${label}[${index}]`))
}
