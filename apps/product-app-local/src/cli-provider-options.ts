import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import type {
  ProviderCapabilities,
  ProviderInputModality,
  ProviderOutputModality
} from "@wanex/protocol"
import type {
  ProductAppLocalProviderProfileOptions,
  ProductAppLocalProviderProfilesOptions
} from "./types.js"

const providerInputModalities = [
  "text",
  "image",
  "audio",
  "video",
  "document"
] as const satisfies readonly ProviderInputModality[]
const providerOutputModalities = [
  "text",
  "image",
  "audio",
  "video"
] as const satisfies readonly ProviderOutputModality[]

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
      ...(activeProfileId === undefined ? {} : { activeProfileId })
    })
  }
  if (catalogJson !== undefined) {
    assertNoSingleProviderFlags(input.flags, "provider-profiles-json")
    return parseProviderProfileCatalogJson({
      value: catalogJson,
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
  const secretRef =
    input.flags.get("provider-secret-ref") ??
    input.env.WANEX_PRODUCT_APP_LOCAL_PROVIDER_SECRET_REF ??
    input.env.WANEX_PROVIDER_SECRET_REF
  const capabilities = {
    input: parseModalityCsv(
      input.flags.get("provider-input-modalities") ??
        input.env.WANEX_PRODUCT_APP_LOCAL_PROVIDER_INPUT_MODALITIES ??
        input.env.WANEX_PROVIDER_INPUT_MODALITIES ??
        "text",
      providerInputModalities,
      "provider input modalities"
    ),
    output: parseModalityCsv(
      input.flags.get("provider-output-modalities") ??
        input.env.WANEX_PRODUCT_APP_LOCAL_PROVIDER_OUTPUT_MODALITIES ??
        input.env.WANEX_PROVIDER_OUTPUT_MODALITIES ??
        "text",
      providerOutputModalities,
      "provider output modalities"
    )
  } satisfies ProviderCapabilities

  if (kind !== "fake") {
    if (baseUrl === undefined || baseUrl.trim().length === 0) {
      throw new Error(`${kind} provider requires provider-base-url`)
    }
    if (secretRef === undefined || secretRef.trim().length === 0) {
      throw new Error(`${kind} provider requires provider-secret-ref`)
    }
  }

  return {
    profiles: [
      {
        id,
        kind,
        providerId,
        modelId,
        capabilities,
        ...(baseUrl === undefined ? {} : { baseUrl: baseUrl.trim() }),
        ...(secretRef === undefined ? {} : { secretRef: secretRef.trim() })
      }
    ],
    ...(activeProfileId === undefined ? {} : { activeProfileId })
  }
}

function parseProviderProfileCatalogJson(input: {
  readonly value: string
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
    parseCatalogProviderProfile(profile, index)
  )
  const catalogActiveProfileId = optionalString(
    parsed.activeProfileId,
    "provider profile catalog activeProfileId"
  )
  const activeProfileId = input.activeProfileId ?? catalogActiveProfileId
  return {
    profiles,
    ...(activeProfileId === undefined ? {} : { activeProfileId })
  }
}

function parseCatalogProviderProfile(
  value: unknown,
  index: number
): ProductAppLocalProviderProfileOptions {
  if (!isRecord(value)) {
    throw new Error(`provider profile catalog profile ${index} must be an object`)
  }
  if (value.apiKey !== undefined || value.apiKeyEnv !== undefined) {
    throw new Error(
      `provider profile catalog profile ${index} must use secretRef`
    )
  }
  const kind = parseProviderKind(
    optionalString(value.kind, `provider profile catalog profile ${index} kind`) ??
      "fake"
  )
  const secretRef = optionalString(
    value.secretRef,
    `provider profile catalog profile ${index} secretRef`
  )
  const baseUrl = optionalString(
    value.baseUrl,
    `provider profile catalog profile ${index} baseUrl`
  )
  const capabilities = parseProviderCapabilities(
    value.capabilities,
    `provider profile catalog profile ${index} capabilities`
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
    ...(capabilities === undefined ? {} : { capabilities }),
    ...(baseUrl === undefined ? {} : { baseUrl }),
    ...(secretRef === undefined ? {} : { secretRef })
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
    "provider-input-modalities",
    "provider-output-modalities",
    "provider-base-url",
    "provider-secret-ref"
  ]) {
    if (flags.has(key)) {
      throw new Error(
        `${option} cannot be combined with --${key}`
      )
    }
  }
}

function parseProviderCapabilities(
  value: unknown,
  name: string
): ProviderCapabilities | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  if (!isRecord(value)) {
    throw new Error(`${name} must be an object`)
  }
  return {
    input: parseModalityArray(
      value.input,
      providerInputModalities,
      `${name}.input`
    ),
    output: parseModalityArray(
      value.output,
      providerOutputModalities,
      `${name}.output`
    )
  }
}

function parseModalityCsv<T extends string>(
  value: string,
  allowed: readonly T[],
  name: string
): T[] {
  return parseModalities(value.split(","), allowed, name)
}

function parseModalityArray<T extends string>(
  value: unknown,
  allowed: readonly T[],
  name: string
): T[] {
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be an array`)
  }
  return parseModalities(value, allowed, name)
}

function parseModalities<T extends string>(
  values: readonly unknown[],
  allowed: readonly T[],
  name: string
): T[] {
  if (values.length === 0) {
    throw new Error(`${name} must not be empty`)
  }
  const modalities = values.map((value) => {
    if (typeof value !== "string") {
      throw new Error(`${name} must contain strings`)
    }
    const modality = value.trim()
    if (!allowed.includes(modality as T)) {
      throw new Error(`invalid ${name} modality: ${modality}`)
    }
    return modality as T
  })
  if (new Set(modalities).size !== modalities.length) {
    throw new Error(`${name} must not contain duplicates`)
  }
  return modalities
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
