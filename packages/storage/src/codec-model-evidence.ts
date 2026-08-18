import { createHash } from "node:crypto"
import type {
  JsonValue,
  ModelCapabilityRequirement,
  ModelDescriptor,
  ModelEndpointExecutionBinding,
  ModelFeature,
  ModelInputModality,
  ModelOperation,
  ModelOutputModality,
  ResourceInputEvidence
} from "@wanex/protocol"
import {
  expectArray,
  expectNumber,
  expectResourceKind,
  expectString,
  isRecord,
  optionalNumber,
  optionalString,
  withOptionalFields
} from "./codec-helpers.js"

const MODEL_OPERATIONS = [
  "conversation",
  "image.generate",
  "image.edit",
  "video.generate",
  "audio.transcribe",
  "audio.synthesize"
] as const satisfies readonly ModelOperation[]

const MODEL_INPUT_MODALITIES = [
  "text",
  "image",
  "audio",
  "video",
  "document"
] as const satisfies readonly ModelInputModality[]

const MODEL_OUTPUT_MODALITIES = [
  "text",
  "image",
  "audio",
  "video"
] as const satisfies readonly ModelOutputModality[]

const MODEL_FEATURES = [
  "tool_calling",
  "parallel_tool_calls",
  "reasoning"
] as const satisfies readonly ModelFeature[]

export function readModelEndpointExecutionBinding(
  value: JsonValue | undefined,
  label: string
): ModelEndpointExecutionBinding {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`)
  }
  requireExactKeys(
    value,
    ["endpointId", "endpointDigest", "connection", "protocol", "model"],
    label
  )
  const connection = value.connection
  const protocol = value.protocol
  if (!isRecord(connection) || !isRecord(protocol)) {
    throw new Error(`${label} connection and protocol must be objects`)
  }
  requireAllowedKeys(
    connection,
    ["id", "providerId", "baseUrl", "secretRef"],
    2,
    `${label}.connection`
  )
  requireAllowedKeys(protocol, ["id", "version"], 1, `${label}.protocol`)
  const endpointId = expectNonEmptyString(value.endpointId, `${label}.endpointId`)
  const endpointDigest = expectSha256(
    value.endpointDigest,
    `${label}.endpointDigest`
  )
  const binding: ModelEndpointExecutionBinding = {
    endpointId,
    endpointDigest,
    connection: withOptionalFields(
      {
        id: expectNonEmptyString(connection.id, `${label}.connection.id`),
        providerId: expectNonEmptyString(
          connection.providerId,
          `${label}.connection.providerId`
        )
      },
      {
        baseUrl: optionalNonEmptyString(
          connection.baseUrl,
          `${label}.connection.baseUrl`
        ),
        secretRef: optionalNonEmptyString(
          connection.secretRef,
          `${label}.connection.secretRef`
        )
      }
    ),
    protocol: withOptionalFields(
      { id: expectNonEmptyString(protocol.id, `${label}.protocol.id`) },
      {
        version: optionalNonEmptyString(
          protocol.version,
          `${label}.protocol.version`
        )
      }
    ),
    model: readModelDescriptor(value.model, `${label}.model`)
  }
  const actualDigest = digestJson({
    id: binding.endpointId,
    connection: binding.connection,
    protocol: binding.protocol,
    model: binding.model
  })
  if (actualDigest !== endpointDigest) {
    throw new Error(`${label}.endpointDigest does not match its content`)
  }
  return binding
}

export function readModelCapabilityRequirement(
  value: JsonValue | undefined,
  label: string
): ModelCapabilityRequirement {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`)
  }
  requireExactKeys(
    value,
    ["operation", "inputModalities", "outputModalities", "features"],
    label
  )
  const operation = expectAllowedString(
    value.operation,
    MODEL_OPERATIONS,
    `${label}.operation`
  )
  return {
    operation,
    inputModalities: readValues(
      value.inputModalities,
      MODEL_INPUT_MODALITIES,
      `${label}.inputModalities`,
      true,
      true
    ),
    outputModalities: readValues(
      value.outputModalities,
      MODEL_OUTPUT_MODALITIES,
      `${label}.outputModalities`,
      true,
      true
    ),
    features: readValues(
      value.features,
      MODEL_FEATURES,
      `${label}.features`,
      true,
      true
    )
  }
}

export function readResourceInputEvidenceList(
  value: JsonValue | undefined,
  label: string
): readonly ResourceInputEvidence[] {
  const values = expectArray(value, label)
  const resources = values.map((item, index) =>
    readResourceInputEvidence(item, `${label}.${index}`)
  )
  const resourceIds = resources.map((resource) => resource.resourceId)
  if (new Set(resourceIds).size !== resourceIds.length) {
    throw new Error(`${label} must not contain duplicate resource ids`)
  }
  return resources
}

export function assertModelSupportsRequirement(
  model: ModelDescriptor,
  requirement: ModelCapabilityRequirement,
  label: string
): void {
  if (
    !model.operations.includes(requirement.operation) ||
    !requirement.inputModalities.every((item) =>
      model.inputModalities.includes(item)
    ) ||
    !requirement.outputModalities.every((item) =>
      model.outputModalities.includes(item)
    ) ||
    !requirement.features.every((item) => model.features.includes(item))
  ) {
    throw new Error(`${label} does not satisfy its capability requirement`)
  }
}

export function expectSha256(value: JsonValue | undefined, label: string): string {
  const digest = expectString(value, label)
  if (!/^[a-f0-9]{64}$/.test(digest)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest`)
  }
  return digest
}

export function digestJson(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex")
}

export function requireExactKeys(
  value: Record<string, JsonValue>,
  keys: readonly string[],
  label: string
): void {
  if (
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key))
  ) {
    throw new Error(`${label} contains missing or unknown fields`)
  }
}

export function requireAllowedKeys(
  value: Record<string, JsonValue>,
  keys: readonly string[],
  minimum: number,
  label: string
): void {
  if (
    Object.keys(value).length < minimum ||
    Object.keys(value).some((key) => !keys.includes(key))
  ) {
    throw new Error(`${label} contains missing or unknown fields`)
  }
}

function readModelDescriptor(
  value: JsonValue | undefined,
  label: string
): ModelDescriptor {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`)
  }
  requireAllowedKeys(
    value,
    [
      "id",
      "operations",
      "inputModalities",
      "outputModalities",
      "features",
      "limits",
      "behavior",
      "catalog"
    ],
    6,
    label
  )
  const catalog = value.catalog
  if (!isRecord(catalog)) {
    throw new Error(`${label}.catalog must be an object`)
  }
  requireExactKeys(catalog, ["source", "catalogId", "revision"], `${label}.catalog`)
  const source = expectString(catalog.source, `${label}.catalog.source`)
  if (source !== "builtin" && source !== "provider" && source !== "custom") {
    throw new Error(`invalid model catalog source: ${source}`)
  }
  const limits = value.limits
  const behavior = value.behavior
  if (limits !== undefined && !isRecord(limits)) {
    throw new Error(`${label}.limits must be an object`)
  }
  if (behavior !== undefined && !isRecord(behavior)) {
    throw new Error(`${label}.behavior must be an object`)
  }
  if (limits !== undefined) {
    requireAllowedKeys(
      limits,
      [
        "contextWindowTokens",
        "maxInputTokens",
        "maxOutputTokens",
        "maxInputResources"
      ],
      0,
      `${label}.limits`
    )
  }
  if (behavior !== undefined) {
    requireAllowedKeys(behavior, ["reasoningReplay"], 0, `${label}.behavior`)
  }
  const features = readValues(
    value.features,
    MODEL_FEATURES,
    `${label}.features`,
    true,
    true
  )
  if (
    features.includes("parallel_tool_calls") &&
    !features.includes("tool_calling")
  ) {
    throw new Error("parallel_tool_calls requires tool_calling")
  }
  const reasoningReplay =
    behavior === undefined
      ? undefined
      : optionalString(behavior.reasoningReplay, `${label}.behavior.reasoningReplay`)
  if (
    reasoningReplay !== undefined &&
    reasoningReplay !== "optional" &&
    reasoningReplay !== "required" &&
    reasoningReplay !== "forbidden"
  ) {
    throw new Error(`invalid model reasoning replay behavior: ${reasoningReplay}`)
  }
  if (reasoningReplay !== undefined && !features.includes("reasoning")) {
    throw new Error("model reasoning replay behavior requires reasoning")
  }
  const readLimit = (key: string): number | undefined => {
    if (limits === undefined) return undefined
    const result = optionalNumber(limits[key], `${label}.limits.${key}`)
    if (result !== undefined && (!Number.isSafeInteger(result) || result <= 0)) {
      throw new Error(`${label}.limits.${key} must be a positive safe integer`)
    }
    return result
  }
  return withOptionalFields(
    {
      id: expectNonEmptyString(value.id, `${label}.id`),
      operations: readValues(
        value.operations,
        MODEL_OPERATIONS,
        `${label}.operations`,
        false,
        true
      ),
      inputModalities: readValues(
        value.inputModalities,
        MODEL_INPUT_MODALITIES,
        `${label}.inputModalities`,
        false,
        true
      ),
      outputModalities: readValues(
        value.outputModalities,
        MODEL_OUTPUT_MODALITIES,
        `${label}.outputModalities`,
        false,
        true
      ),
      features,
      catalog: {
        source,
        catalogId: expectNonEmptyString(catalog.catalogId, `${label}.catalog.catalogId`),
        revision: expectNonEmptyString(catalog.revision, `${label}.catalog.revision`)
      }
    },
    {
      limits:
        limits === undefined
          ? undefined
          : withOptionalFields(
              {},
              {
                contextWindowTokens: readLimit("contextWindowTokens"),
                maxInputTokens: readLimit("maxInputTokens"),
                maxOutputTokens: readLimit("maxOutputTokens"),
                maxInputResources: readLimit("maxInputResources")
              }
            ),
      behavior:
        reasoningReplay === undefined ? undefined : { reasoningReplay }
    }
  )
}

function readValues<T extends string>(
  value: JsonValue | undefined,
  allowed: readonly T[],
  label: string,
  allowEmpty: boolean,
  requireCanonicalOrder: boolean
): readonly T[] {
  const values = expectArray(value, label)
  if (!allowEmpty && values.length === 0) {
    throw new Error(`${label} must not be empty`)
  }
  const result = values.map((item, index) =>
    expectAllowedString(item, allowed, `${label}.${index}`)
  )
  if (new Set(result).size !== result.length) {
    throw new Error(`${label} must not contain duplicates`)
  }
  if (
    requireCanonicalOrder &&
    result.some(
      (item, index) => index > 0 && allowed.indexOf(result[index - 1]!) >= allowed.indexOf(item)
    )
  ) {
    throw new Error(`${label} must use canonical order`)
  }
  return result
}

function readResourceInputEvidence(
  value: JsonValue,
  label: string
): ResourceInputEvidence {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`)
  }
  requireAllowedKeys(
    value,
    ["resourceId", "sha256", "sizeBytes", "kind", "mediaType"],
    4,
    label
  )
  const sizeBytes = expectNumber(value.sizeBytes, `${label}.sizeBytes`)
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    throw new Error(`${label}.sizeBytes must be a positive safe integer`)
  }
  return withOptionalFields(
    {
      resourceId: expectNonEmptyString(value.resourceId, `${label}.resourceId`),
      sha256: expectSha256(value.sha256, `${label}.sha256`),
      sizeBytes,
      kind: expectResourceKind(value.kind, `${label}.kind`)
    },
    {
      mediaType: optionalNonEmptyString(value.mediaType, `${label}.mediaType`)
    }
  )
}

function expectAllowedString<T extends string>(
  value: JsonValue | undefined,
  allowed: readonly T[],
  label: string
): T {
  const result = expectString(value, label)
  if (!allowed.includes(result as T)) {
    throw new Error(`invalid ${label} value: ${result}`)
  }
  return result as T
}

function expectNonEmptyString(value: JsonValue | undefined, label: string): string {
  const result = expectString(value, label)
  if (result.length === 0) {
    throw new Error(`${label} must not be empty`)
  }
  return result
}

function optionalNonEmptyString(
  value: JsonValue | undefined,
  label: string
): string | undefined {
  const result = optionalString(value, label)
  if (result !== undefined && result.length === 0) {
    throw new Error(`${label} must not be empty`)
  }
  return result
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`
    )
    .join(",")}}`
}
