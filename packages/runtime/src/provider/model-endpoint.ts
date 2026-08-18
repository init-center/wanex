import { createHash } from "node:crypto"
import type {
  JsonValue,
  ModelBehavior,
  ModelCatalogProvenance,
  ModelDescriptor,
  ModelEndpoint,
  ModelEndpointExecutionBinding,
  ModelFeature,
  ModelInputModality,
  ModelLimits,
  ModelOperation,
  ModelOutputModality,
  ProviderConnection,
  ProviderProtocolDescriptor
} from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import type { SecretResolverPort } from "../secrets/index.js"
import { AnthropicAdapter } from "./adapters/anthropic.js"
import { FakeProviderAdapter } from "./adapters/fake.js"
import { OpenAICompatibleAdapter } from "./adapters/openai-compatible.js"
import { normalizeModelDescriptor } from "./model-descriptor.js"
import type { ProviderAdapter } from "./types.js"

export interface ModelEndpointSummary {
  readonly id: string
  readonly connection: Omit<ProviderConnection, "secretRef">
  readonly protocol: ProviderProtocolDescriptor
  readonly model: ModelDescriptor
  readonly credentialConfigured: boolean
}

export function modelEndpointConfigKey(endpointId: string): string {
  return `model.endpoint.${requireNonEmpty(endpointId, "model endpoint id")}`
}

export function modelEndpointToJson(endpoint: ModelEndpoint): JsonValue {
  const normalized = normalizeModelEndpoint(endpoint)
  return {
    id: normalized.id,
    connection: {
      id: normalized.connection.id,
      providerId: normalized.connection.providerId,
      ...(normalized.connection.baseUrl === undefined
        ? {}
        : { baseUrl: normalized.connection.baseUrl }),
      ...(normalized.connection.secretRef === undefined
        ? {}
        : { secretRef: normalized.connection.secretRef })
    },
    protocol: {
      id: normalized.protocol.id,
      ...(normalized.protocol.version === undefined
        ? {}
        : { version: normalized.protocol.version })
    },
    model: modelDescriptorToJson(normalized.model)
  }
}

export function modelEndpointFromJson(value: JsonValue): ModelEndpoint {
  const endpoint = expectRecord(value, "model endpoint")
  return normalizeModelEndpoint({
    id: expectString(endpoint.id, "model endpoint id"),
    connection: providerConnectionFromJson(endpoint.connection),
    protocol: providerProtocolFromJson(endpoint.protocol),
    model: modelDescriptorFromJson(endpoint.model)
  })
}

export function normalizeModelEndpoint(endpoint: ModelEndpoint): ModelEndpoint {
  return {
    id: requireNonEmpty(endpoint.id, "model endpoint id"),
    connection: {
      id: requireNonEmpty(endpoint.connection.id, "provider connection id"),
      providerId: requireNonEmpty(
        endpoint.connection.providerId,
        "provider connection providerId"
      ),
      ...(endpoint.connection.baseUrl === undefined
        ? {}
        : {
            baseUrl: requireNonEmpty(
              endpoint.connection.baseUrl,
              "provider connection baseUrl"
            ).replace(/\/+$/, "")
          }),
      ...(endpoint.connection.secretRef === undefined
        ? {}
        : { secretRef: normalizeSecretRef(endpoint.connection.secretRef) })
    },
    protocol: {
      id: requireNonEmpty(endpoint.protocol.id, "provider protocol id"),
      ...(endpoint.protocol.version === undefined
        ? {}
        : {
            version: requireNonEmpty(
              endpoint.protocol.version,
              "provider protocol version"
            )
          })
    },
    model: normalizeModelDescriptor(endpoint.model)
  }
}

export function modelEndpointDigest(endpoint: ModelEndpoint): string {
  return createHash("sha256")
    .update(stableJson(modelEndpointToJson(endpoint)))
    .digest("hex")
}

export function modelEndpointExecutionBinding(
  endpoint: ModelEndpoint
): ModelEndpointExecutionBinding {
  const normalized = normalizeModelEndpoint(endpoint)
  return {
    endpointId: normalized.id,
    endpointDigest: modelEndpointDigest(normalized),
    connection: normalized.connection,
    protocol: normalized.protocol,
    model: normalized.model
  }
}

export function modelEndpointFromExecutionBinding(
  binding: ModelEndpointExecutionBinding
): ModelEndpoint {
  const endpoint = normalizeModelEndpoint({
    id: binding.endpointId,
    connection: binding.connection,
    protocol: binding.protocol,
    model: binding.model
  })
  if (modelEndpointDigest(endpoint) !== binding.endpointDigest) {
    throw new Error("model endpoint execution binding digest is invalid")
  }
  return endpoint
}

export async function providerFromModelEndpoint(
  endpoint: ModelEndpoint,
  secretResolver?: SecretResolverPort
): Promise<ProviderAdapter> {
  const normalized = normalizeModelEndpoint(endpoint)
  if (normalized.protocol.id === "fake") {
    return new FakeProviderAdapter({
      providerId: normalized.connection.providerId,
      model: normalized.model,
      responseText: `Fake response from ${normalized.model.id}`
    })
  }
  const baseUrl = requireConnectionField(normalized, "baseUrl")
  const secretRef = requireConnectionField(normalized, "secretRef")
  if (secretResolver === undefined) {
    throw new Error(`${normalized.protocol.id} model endpoint requires secret resolver`)
  }
  const secret = await secretResolver.resolve(secretRef, {
    modelEndpointId: normalized.id
  })
  try {
    const apiKey = secret.reveal()
    switch (normalized.protocol.id) {
      case "openai-chat-completions":
        return new OpenAICompatibleAdapter({
          providerId: normalized.connection.providerId,
          model: normalized.model,
          baseUrl,
          apiKey
        })
      case "anthropic-messages":
        return new AnthropicAdapter({
          providerId: normalized.connection.providerId,
          model: normalized.model,
          baseUrl,
          apiKey,
          ...(normalized.protocol.version === undefined
            ? {}
            : { protocolVersion: normalized.protocol.version })
        })
      default:
        throw new Error(
          `unsupported conversation provider protocol: ${normalized.protocol.id}`
        )
    }
  } finally {
    secret.dispose()
  }
}

export async function readModelEndpoint(
  storage: CoreStore,
  endpointId: string
): Promise<ModelEndpoint | null> {
  const value = await storage.getConfig(modelEndpointConfigKey(endpointId))
  return value === null ? null : modelEndpointFromJson(value)
}

export async function requireModelEndpoint(
  storage: CoreStore,
  endpointId: string
): Promise<ModelEndpoint> {
  const endpoint = await readModelEndpoint(storage, endpointId)
  if (endpoint === null) {
    throw new Error(`model endpoint not found: ${endpointId}`)
  }
  return endpoint
}

export async function writeModelEndpoint(
  storage: CoreStore,
  endpoint: ModelEndpoint
): Promise<void> {
  const normalized = modelEndpointFromJson(modelEndpointToJson(endpoint))
  await storage.putConfig(
    modelEndpointConfigKey(normalized.id),
    modelEndpointToJson(normalized)
  )
}

export async function resolveModelEndpoint(
  storage: CoreStore,
  endpointId: string,
  secretResolver?: SecretResolverPort
): Promise<ProviderAdapter> {
  return await providerFromModelEndpoint(
    await requireModelEndpoint(storage, endpointId),
    secretResolver
  )
}

export function summarizeModelEndpoint(
  endpoint: ModelEndpoint
): ModelEndpointSummary {
  const normalized = normalizeModelEndpoint(endpoint)
  return {
    id: normalized.id,
    connection: {
      id: normalized.connection.id,
      providerId: normalized.connection.providerId,
      ...(normalized.connection.baseUrl === undefined
        ? {}
        : { baseUrl: normalized.connection.baseUrl })
    },
    protocol: normalized.protocol,
    model: normalized.model,
    credentialConfigured: normalized.connection.secretRef !== undefined
  }
}

function modelDescriptorToJson(model: ModelDescriptor): JsonValue {
  return {
    id: model.id,
    operations: [...model.operations],
    inputModalities: [...model.inputModalities],
    outputModalities: [...model.outputModalities],
    features: [...model.features],
    ...(model.limits === undefined ? {} : { limits: { ...model.limits } }),
    ...(model.behavior === undefined
      ? {}
      : { behavior: { ...model.behavior } }),
    catalog: { ...model.catalog }
  }
}

function modelDescriptorFromJson(value: JsonValue | undefined): ModelDescriptor {
  const model = expectRecord(value, "model descriptor")
  return {
    id: expectString(model.id, "model descriptor id"),
    operations: expectStringArray(model.operations, "model operations") as ModelOperation[],
    inputModalities: expectStringArray(
      model.inputModalities,
      "model input modalities"
    ) as ModelInputModality[],
    outputModalities: expectStringArray(
      model.outputModalities,
      "model output modalities"
    ) as ModelOutputModality[],
    features: expectStringArray(model.features, "model features") as ModelFeature[],
    ...(model.limits === undefined
      ? {}
      : { limits: modelLimitsFromJson(model.limits) }),
    ...(model.behavior === undefined
      ? {}
      : { behavior: modelBehaviorFromJson(model.behavior) }),
    catalog: modelCatalogFromJson(model.catalog)
  }
}

function providerConnectionFromJson(value: JsonValue | undefined): ProviderConnection {
  const connection = expectRecord(value, "provider connection")
  return {
    id: expectString(connection.id, "provider connection id"),
    providerId: expectString(
      connection.providerId,
      "provider connection providerId"
    ),
    ...(connection.baseUrl === undefined
      ? {}
      : { baseUrl: expectString(connection.baseUrl, "provider connection baseUrl") }),
    ...(connection.secretRef === undefined
      ? {}
      : { secretRef: expectString(connection.secretRef, "provider connection secretRef") })
  }
}

function providerProtocolFromJson(
  value: JsonValue | undefined
): ProviderProtocolDescriptor {
  const protocol = expectRecord(value, "provider protocol")
  return {
    id: expectString(protocol.id, "provider protocol id"),
    ...(protocol.version === undefined
      ? {}
      : { version: expectString(protocol.version, "provider protocol version") })
  }
}

function modelLimitsFromJson(value: JsonValue): ModelLimits {
  const limits = expectRecord(value, "model limits")
  return {
    ...(limits.contextWindowTokens === undefined
      ? {}
      : {
          contextWindowTokens: expectNumber(
            limits.contextWindowTokens,
            "contextWindowTokens"
          )
        }),
    ...(limits.maxInputTokens === undefined
      ? {}
      : { maxInputTokens: expectNumber(limits.maxInputTokens, "maxInputTokens") }),
    ...(limits.maxOutputTokens === undefined
      ? {}
      : { maxOutputTokens: expectNumber(limits.maxOutputTokens, "maxOutputTokens") }),
    ...(limits.maxInputResources === undefined
      ? {}
      : {
          maxInputResources: expectNumber(
            limits.maxInputResources,
            "maxInputResources"
          )
        })
  }
}

function modelBehaviorFromJson(value: JsonValue): ModelBehavior {
  const behavior = expectRecord(value, "model behavior")
  return {
    ...(behavior.reasoningReplay === undefined
      ? {}
      : {
          reasoningReplay: expectString(
            behavior.reasoningReplay,
            "model reasoningReplay"
          ) as NonNullable<ModelBehavior["reasoningReplay"]>
        })
  }
}

function modelCatalogFromJson(value: JsonValue | undefined): ModelCatalogProvenance {
  const catalog = expectRecord(value, "model catalog")
  return {
    source: expectString(catalog.source, "model catalog source") as ModelCatalogProvenance["source"],
    catalogId: expectString(catalog.catalogId, "model catalog id"),
    revision: expectString(catalog.revision, "model catalog revision")
  }
}

function requireConnectionField(
  endpoint: ModelEndpoint,
  field: "baseUrl" | "secretRef"
): string {
  const value = endpoint.connection[field]
  if (value === undefined || value.length === 0) {
    throw new Error(`${endpoint.protocol.id} model endpoint requires ${field}`)
  }
  return value
}

function expectRecord(
  value: JsonValue | undefined,
  label: string
): Record<string, JsonValue> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, JsonValue>
}

function expectString(value: JsonValue | undefined, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`)
  }
  return value
}

function expectNumber(value: JsonValue, label: string): number {
  if (typeof value !== "number") {
    throw new Error(`${label} must be a number`)
  }
  return value
}

function expectStringArray(value: JsonValue | undefined, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`)
  }
  return value.map((item, index) => expectString(item, `${label}[${index}]`))
}

function normalizeSecretRef(ref: string): string {
  const normalized = requireNonEmpty(ref, "provider connection secretRef")
  if (!/^[A-Za-z][A-Za-z0-9+.-]*:/.test(normalized)) {
    throw new Error(`provider connection secretRef must include a URI scheme: ${ref}`)
  }
  return normalized
}

function requireNonEmpty(value: string, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must not be empty`)
  }
  return value.trim()
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
