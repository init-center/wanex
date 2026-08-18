import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import type {
  JsonValue,
  ModelBehavior,
  ModelFeature,
  ModelInputModality,
  ModelOperation,
  ModelOutputModality
} from "@wanex/protocol"
import { modelEndpointFromJson } from "@wanex/runtime/provider"
import type {
  LocalModelEndpointOptions,
  LocalModelEndpointsOptions
} from "../model.js"

const modelOperations = [
  "conversation",
  "image.generate",
  "image.edit",
  "video.generate",
  "audio.transcribe",
  "audio.synthesize"
] as const satisfies readonly ModelOperation[]
const modelInputModalities = [
  "text",
  "image",
  "audio",
  "video",
  "document"
] as const satisfies readonly ModelInputModality[]
const modelOutputModalities = [
  "text",
  "image",
  "audio",
  "video"
] as const satisfies readonly ModelOutputModality[]
const modelFeatures = [
  "tool_calling",
  "parallel_tool_calls",
  "reasoning"
] as const satisfies readonly ModelFeature[]
const reasoningReplayPolicies = [
  "optional",
  "required",
  "forbidden"
] as const satisfies readonly NonNullable<ModelBehavior["reasoningReplay"]>[]

const singleEndpointFlags = [
  "model-endpoint-id",
  "provider-connection-id",
  "provider-protocol",
  "provider-id",
  "provider-model-id",
  "model-operations",
  "model-input-modalities",
  "model-output-modalities",
  "model-features",
  "model-reasoning-replay",
  "provider-base-url",
  "provider-secret-ref"
] as const

export function parseLocalCliModelEndpoints(input: {
  readonly cwd: string
  readonly flags: ReadonlyMap<string, string>
  readonly env: Readonly<Record<string, string | undefined>>
}): LocalModelEndpointsOptions {
  const catalogFile =
    input.flags.get("model-endpoints-file") ??
    input.env.WANEX_LOCAL_HOST_MODEL_ENDPOINTS_FILE ??
    input.env.WANEX_MODEL_ENDPOINTS_FILE
  const catalogJson =
    input.flags.get("model-endpoints-json") ??
    input.env.WANEX_LOCAL_HOST_MODEL_ENDPOINTS_JSON ??
    input.env.WANEX_MODEL_ENDPOINTS_JSON
  const activeEndpointId = optionalString(
    input.flags.get("active-model-endpoint-id") ??
      input.env.WANEX_LOCAL_HOST_ACTIVE_MODEL_ENDPOINT_ID ??
      input.env.WANEX_ACTIVE_MODEL_ENDPOINT_ID,
    "active model endpoint id"
  )

  if (catalogFile !== undefined) {
    if (catalogJson !== undefined) {
      throw new Error(
        "model-endpoints-file cannot be combined with model-endpoints-json"
      )
    }
    assertNoSingleEndpointFlags(input.flags, "model-endpoints-file")
    return parseModelEndpointCatalogJson({
      value: readTrustedModelEndpointCatalogFile(input.cwd, catalogFile),
      ...(activeEndpointId === undefined ? {} : { activeEndpointId })
    })
  }
  if (catalogJson !== undefined) {
    assertNoSingleEndpointFlags(input.flags, "model-endpoints-json")
    return parseModelEndpointCatalogJson({
      value: catalogJson,
      ...(activeEndpointId === undefined ? {} : { activeEndpointId })
    })
  }

  const endpoint = parseSingleModelEndpoint(input)
  return {
    endpoints: endpoint === undefined ? [] : [endpoint],
    ...(activeEndpointId === undefined ? {} : { activeEndpointId })
  }
}

function parseSingleModelEndpoint(input: {
  readonly flags: ReadonlyMap<string, string>
  readonly env: Readonly<Record<string, string | undefined>>
}): LocalModelEndpointOptions | undefined {
  const endpointId = valueFromFlagOrEnv(
    input,
    "model-endpoint-id",
    "WANEX_LOCAL_HOST_MODEL_ENDPOINT_ID",
    "WANEX_MODEL_ENDPOINT_ID"
  )
  const connectionId = valueFromFlagOrEnv(
    input,
    "provider-connection-id",
    "WANEX_LOCAL_HOST_PROVIDER_CONNECTION_ID",
    "WANEX_PROVIDER_CONNECTION_ID"
  )
  const protocolId = valueFromFlagOrEnv(
    input,
    "provider-protocol",
    "WANEX_LOCAL_HOST_PROVIDER_PROTOCOL",
    "WANEX_PROVIDER_PROTOCOL"
  )
  const providerId = valueFromFlagOrEnv(
    input,
    "provider-id",
    "WANEX_LOCAL_HOST_PROVIDER_ID",
    "WANEX_PROVIDER_ID"
  )
  const modelId = valueFromFlagOrEnv(
    input,
    "provider-model-id",
    "WANEX_LOCAL_HOST_PROVIDER_MODEL_ID",
    "WANEX_PROVIDER_MODEL_ID"
  )
  const operations = valueFromFlagOrEnv(
    input,
    "model-operations",
    "WANEX_LOCAL_HOST_MODEL_OPERATIONS",
    "WANEX_MODEL_OPERATIONS"
  )
  const inputModalities = valueFromFlagOrEnv(
    input,
    "model-input-modalities",
    "WANEX_LOCAL_HOST_MODEL_INPUT_MODALITIES",
    "WANEX_MODEL_INPUT_MODALITIES"
  )
  const outputModalities = valueFromFlagOrEnv(
    input,
    "model-output-modalities",
    "WANEX_LOCAL_HOST_MODEL_OUTPUT_MODALITIES",
    "WANEX_MODEL_OUTPUT_MODALITIES"
  )
  const features = valueFromFlagOrEnv(
    input,
    "model-features",
    "WANEX_LOCAL_HOST_MODEL_FEATURES",
    "WANEX_MODEL_FEATURES"
  )
  const reasoningReplay = valueFromFlagOrEnv(
    input,
    "model-reasoning-replay",
    "WANEX_LOCAL_HOST_MODEL_REASONING_REPLAY",
    "WANEX_MODEL_REASONING_REPLAY"
  )
  const baseUrl = valueFromFlagOrEnv(
    input,
    "provider-base-url",
    "WANEX_LOCAL_HOST_PROVIDER_BASE_URL",
    "WANEX_PROVIDER_BASE_URL"
  )
  const secretRef = valueFromFlagOrEnv(
    input,
    "provider-secret-ref",
    "WANEX_LOCAL_HOST_PROVIDER_SECRET_REF",
    "WANEX_PROVIDER_SECRET_REF"
  )
  const values = [
    endpointId,
    connectionId,
    protocolId,
    providerId,
    modelId,
    operations,
    inputModalities,
    outputModalities,
    features,
    reasoningReplay,
    baseUrl,
    secretRef
  ]
  if (values.every((value) => value === undefined)) {
    return undefined
  }

  const id = requiredCliValue(endpointId, "model-endpoint-id")
  const protocol = requiredCliValue(protocolId, "provider-protocol")
  const connectionProviderId = requiredCliValue(providerId, "provider-id")
  const descriptorId = requiredCliValue(modelId, "provider-model-id")
  if (protocol !== "fake") {
    requiredCliValue(baseUrl, "provider-base-url")
    requiredCliValue(secretRef, "provider-secret-ref")
  }
  const replay = parseOptionalValue(
    reasoningReplay,
    reasoningReplayPolicies,
    "model reasoning replay"
  )

  return modelEndpointFromJson({
    id,
    connection: {
      id: connectionId ?? id,
      providerId: connectionProviderId,
      ...(baseUrl === undefined ? {} : { baseUrl }),
      ...(secretRef === undefined ? {} : { secretRef })
    },
    protocol: { id: protocol },
    model: {
      id: descriptorId,
      operations: parseCsv(
        operations ?? "conversation",
        modelOperations,
        "model operations"
      ),
      inputModalities: parseCsv(
        inputModalities ?? "text",
        modelInputModalities,
        "model input modalities"
      ),
      outputModalities: parseCsv(
        outputModalities ?? "text",
        modelOutputModalities,
        "model output modalities"
      ),
      features: parseCsv(features ?? "", modelFeatures, "model features", true),
      ...(replay === undefined
        ? {}
        : { behavior: { reasoningReplay: replay } }),
      catalog: {
        source: "custom",
        catalogId: `cli.${id}`,
        revision: "1"
      }
    }
  })
}

function parseModelEndpointCatalogJson(input: {
  readonly value: string
  readonly activeEndpointId?: string
}): LocalModelEndpointsOptions {
  const parsed = parseJson(input.value, "model endpoint catalog")
  if (!isRecord(parsed)) {
    throw new Error("model endpoint catalog must be an object")
  }
  if (!Array.isArray(parsed.endpoints)) {
    throw new Error("model endpoint catalog endpoints must be an array")
  }
  const endpoints = parsed.endpoints.map((endpoint, index) => {
    assertNoRawCredential(endpoint, index)
    try {
      return modelEndpointFromJson(endpoint as JsonValue)
    } catch (error) {
      throw new Error(
        `invalid model endpoint catalog endpoint ${index}: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  })
  const catalogActiveEndpointId = optionalString(
    parsed.activeEndpointId,
    "model endpoint catalog activeEndpointId"
  )
  const activeEndpointId = input.activeEndpointId ?? catalogActiveEndpointId
  return {
    endpoints,
    ...(activeEndpointId === undefined ? {} : { activeEndpointId })
  }
}

function assertNoRawCredential(value: unknown, index: number): void {
  if (!isRecord(value)) {
    return
  }
  const connection = value.connection
  if (
    value.apiKey !== undefined ||
    value.apiKeyEnv !== undefined ||
    value.credential !== undefined ||
    (isRecord(connection) &&
      (connection.apiKey !== undefined ||
        connection.apiKeyEnv !== undefined ||
        connection.credential !== undefined))
  ) {
    throw new Error(
      `model endpoint catalog endpoint ${index} must reference credentials with connection.secretRef`
    )
  }
}

function valueFromFlagOrEnv(
  input: {
    readonly flags: ReadonlyMap<string, string>
    readonly env: Readonly<Record<string, string | undefined>>
  },
  flag: string,
  localEnv: string,
  sharedEnv: string
): string | undefined {
  return optionalString(
    input.flags.get(flag) ?? input.env[localEnv] ?? input.env[sharedEnv],
    flag
  )
}

function requiredCliValue(value: string | undefined, name: string): string {
  if (value === undefined) {
    throw new Error(`${name} is required when configuring a model endpoint`)
  }
  return value
}

function assertNoSingleEndpointFlags(
  flags: ReadonlyMap<string, string>,
  option: "model-endpoints-file" | "model-endpoints-json"
): void {
  for (const key of singleEndpointFlags) {
    if (flags.has(key)) {
      throw new Error(`${option} cannot be combined with --${key}`)
    }
  }
}

function parseCsv<T extends string>(
  value: string,
  allowed: readonly T[],
  name: string,
  allowEmpty = false
): T[] {
  const raw = value.length === 0 ? [] : value.split(",")
  if (raw.length === 0 && !allowEmpty) {
    throw new Error(`${name} must not be empty`)
  }
  const values = raw.map((item) => {
    const normalized = item.trim()
    if (!allowed.includes(normalized as T)) {
      throw new Error(`invalid ${name} value: ${normalized}`)
    }
    return normalized as T
  })
  if (new Set(values).size !== values.length) {
    throw new Error(`${name} must not contain duplicates`)
  }
  return values
}

function parseOptionalValue<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  name: string
): T | undefined {
  if (value === undefined) {
    return undefined
  }
  if (!allowed.includes(value as T)) {
    throw new Error(`invalid ${name}: ${value}`)
  }
  return value as T
}

function readTrustedModelEndpointCatalogFile(
  cwd: string,
  filePath: string
): string {
  const normalized = optionalString(filePath, "model endpoint catalog file path")
  if (normalized === undefined) {
    throw new Error("model endpoint catalog file path must not be empty")
  }
  const resolved = resolve(cwd, normalized)
  try {
    return readFileSync(resolved, "utf8")
  } catch (error) {
    throw new Error(
      `failed to read model endpoint catalog file: ${resolved}: ${
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
