import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import type {
  ProductAppLocalProviderProfileOptions,
  ProductAppLocalProviderProfilesOptions
} from "./types.js"

export function parseProductAppLocalCliProviderProfiles(input: {
  readonly cwd: string
  readonly flags: ReadonlyMap<string, string>
  readonly env: Readonly<Record<string, string | undefined>>
}): ProductAppLocalProviderProfilesOptions {
  const catalogFile =
    input.flags.get("provider-profiles-file") ??
    input.env.WANEX_PRODUCT_APP_LOCAL_PROVIDER_PROFILES_FILE ??
    input.env.WANEX_PROVIDER_PROFILES_FILE
  const catalogJson =
    input.flags.get("provider-profiles-json") ??
    input.env.WANEX_PRODUCT_APP_LOCAL_PROVIDER_PROFILES_JSON ??
    input.env.WANEX_PROVIDER_PROFILES_JSON
  const activeProfileId =
    input.flags.get("active-provider-profile-id") ??
    input.env.WANEX_PRODUCT_APP_LOCAL_ACTIVE_PROVIDER_PROFILE_ID ??
      input.env.WANEX_ACTIVE_PROVIDER_PROFILE_ID
  if (catalogFile !== undefined) {
    assertNoCatalogJson(catalogJson)
    assertNoSingleProviderFlags(input.flags, "provider-profiles-file")
    return parseProviderProfileCatalogJson({
      value: readTrustedProviderProfileCatalogFile(input.cwd, catalogFile),
      env: input.env,
      ...(activeProfileId === undefined ? {} : { activeProfileId })
    })
  }
  if (catalogJson !== undefined) {
    assertNoSingleProviderFlags(input.flags, "provider-profiles-json")
    return parseProviderProfileCatalogJson({
      value: catalogJson,
      env: input.env,
      ...(activeProfileId === undefined ? {} : { activeProfileId })
    })
  }

  const kind = parseProviderKind(
    input.flags.get("provider-kind") ??
      input.env.WANEX_PRODUCT_APP_LOCAL_PROVIDER_KIND ??
      input.env.WANEX_PROVIDER_KIND ??
      "fake"
  )
  const id =
    input.flags.get("provider-profile-id") ??
    input.env.WANEX_PRODUCT_APP_LOCAL_PROVIDER_PROFILE_ID ??
    input.env.WANEX_PROVIDER_PROFILE_ID ??
    "product-app-local-cli"
  const providerId =
    input.flags.get("provider-id") ??
    input.env.WANEX_PRODUCT_APP_LOCAL_PROVIDER_ID ??
    input.env.WANEX_PROVIDER_ID ??
    kind
  const modelId =
    input.flags.get("provider-model-id") ??
    input.env.WANEX_PRODUCT_APP_LOCAL_PROVIDER_MODEL_ID ??
    input.env.WANEX_PROVIDER_MODEL_ID ??
    "product-app-local-cli-model"
  const baseUrl =
    input.flags.get("provider-base-url") ??
    input.env.WANEX_PRODUCT_APP_LOCAL_PROVIDER_BASE_URL ??
    input.env.WANEX_PROVIDER_BASE_URL
  const apiKey = readProviderApiKey(input)

  if (kind !== "fake") {
    if (baseUrl === undefined || baseUrl.trim().length === 0) {
      throw new Error(`${kind} provider requires provider-base-url`)
    }
    if (apiKey === undefined || apiKey.trim().length === 0) {
      throw new Error(
        `${kind} provider requires provider-api-key-env or provider API key environment`
      )
    }
  }

  return {
    profiles: [
      {
        id,
        kind,
        providerId,
        modelId,
        ...(baseUrl === undefined ? {} : { baseUrl: baseUrl.trim() }),
        ...(apiKey === undefined ? {} : { apiKey })
      }
    ],
    ...(activeProfileId === undefined ? {} : { activeProfileId })
  }
}

function parseProviderProfileCatalogJson(input: {
  readonly value: string
  readonly env: Readonly<Record<string, string | undefined>>
  readonly activeProfileId?: string
}): ProductAppLocalProviderProfilesOptions {
  const parsed = parseJson(input.value, "provider profile catalog")
  if (!isRecord(parsed)) {
    throw new Error("provider profile catalog must be an object")
  }
  const rawProfiles = parsed.profiles
  if (!Array.isArray(rawProfiles)) {
    throw new Error("provider profile catalog profiles must be an array")
  }
  const profiles = rawProfiles.map((profile, index) =>
    parseCatalogProviderProfile(profile, input.env, index)
  )
  const catalogActiveProfileId = optionalString(
    parsed.activeProfileId,
    "provider profile catalog activeProfileId"
  )
  if (parsed.apiKey !== undefined) {
    throw new Error("provider profile catalog must not include raw apiKey")
  }
  const activeProfileId = input.activeProfileId ?? catalogActiveProfileId
  return {
    profiles,
    ...(activeProfileId === undefined ? {} : { activeProfileId })
  }
}

function parseCatalogProviderProfile(
  value: unknown,
  env: Readonly<Record<string, string | undefined>>,
  index: number
): ProductAppLocalProviderProfileOptions {
  if (!isRecord(value)) {
    throw new Error(`provider profile catalog profile ${index} must be an object`)
  }
  if (value.apiKey !== undefined) {
    throw new Error(
      `provider profile catalog profile ${index} must use apiKeyEnv instead of raw apiKey`
    )
  }
  const kind = parseProviderKind(
    optionalString(value.kind, `provider profile catalog profile ${index} kind`) ??
      "fake"
  )
  const apiKeyEnv = optionalString(
    value.apiKeyEnv,
    `provider profile catalog profile ${index} apiKeyEnv`
  )
  const apiKey =
    apiKeyEnv === undefined
      ? undefined
      : readRequiredEnv(env, apiKeyEnv)
  const baseUrl = optionalString(
    value.baseUrl,
    `provider profile catalog profile ${index} baseUrl`
  )
  return {
    id: requiredString(value.id, `provider profile catalog profile ${index} id`),
    kind,
    providerId:
      optionalString(
        value.providerId,
        `provider profile catalog profile ${index} providerId`
      ) ?? kind,
    modelId:
      optionalString(
        value.modelId,
        `provider profile catalog profile ${index} modelId`
      ) ?? "product-app-local-model",
    ...(baseUrl === undefined ? {} : { baseUrl }),
    ...(apiKey === undefined ? {} : { apiKey })
  }
}

function parseProviderKind(
  value: string
): NonNullable<ProductAppLocalProviderProfileOptions["kind"]> {
  const normalized = value.trim()
  switch (normalized) {
    case "fake":
    case "openai-compatible":
    case "anthropic":
    case "deepseek":
      return normalized
    default:
      throw new Error(`invalid provider kind: ${value}`)
  }
}

function readProviderApiKey(input: {
  readonly flags: ReadonlyMap<string, string>
  readonly env: Readonly<Record<string, string | undefined>>
}): string | undefined {
  const envName =
    input.flags.get("provider-api-key-env") ??
    input.env.WANEX_PRODUCT_APP_LOCAL_PROVIDER_API_KEY_ENV ??
    input.env.WANEX_PROVIDER_API_KEY_ENV
  if (envName !== undefined) {
    const normalizedEnvName = envName.trim()
    if (normalizedEnvName.length === 0) {
      throw new Error("provider API key environment name must not be empty")
    }
    const value = input.env[normalizedEnvName]
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(
        `provider API key environment variable is not set: ${normalizedEnvName}`
      )
    }
    return value
  }
  return (
    input.env.WANEX_PRODUCT_APP_LOCAL_PROVIDER_API_KEY ??
    input.env.WANEX_PROVIDER_API_KEY
  )
}

function assertNoCatalogJson(catalogJson: string | undefined): void {
  if (catalogJson !== undefined) {
    throw new Error(
      "provider-profiles-file cannot be combined with provider-profiles-json"
    )
  }
}

function assertNoSingleProviderFlags(
  flags: ReadonlyMap<string, string>,
  option: "provider-profiles-file" | "provider-profiles-json"
): void {
  for (const key of [
    "provider-profile-id",
    "provider-kind",
    "provider-id",
    "provider-model-id",
    "provider-base-url",
    "provider-api-key-env"
  ]) {
    if (flags.has(key)) {
      throw new Error(
        `${option} cannot be combined with --${key}`
      )
    }
  }
}

function readTrustedProviderProfileCatalogFile(
  cwd: string,
  filePath: string
): string {
  const normalized = filePath.trim()
  if (normalized.length === 0) {
    throw new Error("provider profile catalog file path must not be empty")
  }
  const resolved = resolve(cwd, normalized)
  try {
    return readFileSync(resolved, "utf8")
  } catch (error) {
    throw new Error(
      `failed to read provider profile catalog file: ${resolved}: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
}

function parseJson(value: string, name: string): unknown {
  try {
    return JSON.parse(value)
  } catch (error) {
    throw new Error(
      `invalid ${name} JSON: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

function readRequiredEnv(
  env: Readonly<Record<string, string | undefined>>,
  name: string
): string {
  const value = env[name]
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`provider API key environment variable is not set: ${name}`)
  }
  return value
}

function requiredString(value: unknown, name: string): string {
  const normalized = optionalString(value, name)
  if (normalized === undefined) {
    throw new Error(`${name} is required`)
  }
  return normalized
}

function optionalString(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  if (typeof value !== "string") {
    throw new Error(`${name} must be a string`)
  }
  const normalized = value.trim()
  if (normalized.length === 0) {
    throw new Error(`${name} must not be empty`)
  }
  return normalized
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
