import { createHash } from "node:crypto"
import type {
  JsonValue,
  ModelEndpoint,
  ResourceInputEvidence,
  SessionTurnExecutionBinding,
  SessionTurnRecoveryBinding
} from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import type { PreparedAgentContext } from "../context/agent/index.js"
import {
  modelEndpointToJson,
  modelEndpointDigest,
  modelEndpointExecutionBinding,
  modelEndpointFromExecutionBinding,
  normalizeModelCapabilityRouteExecutionBindings,
  normalizeModelEndpoint,
  providerFromModelEndpoint,
  sameModelDescriptor,
  type ProviderAdapter
} from "../provider/index.js"
import type { SecretResolverPort } from "../secrets/index.js"
import { assertToolRuntimeBinding } from "../tools/evidence.js"

export interface CreateTurnExecutionBindingRequest {
  readonly modelEndpoint: ModelEndpoint
  readonly maxOutputTokens?: number
  readonly agentContext?: PreparedAgentContext
  readonly environmentSnapshot?: JsonValue
  readonly recovery?: SessionTurnRecoveryBinding
  readonly resources?: readonly ResourceInputEvidence[]
  readonly createdAt?: number
}

export const DEFAULT_TURN_RECOVERY_BINDING = {
  providerMaxAttempts: 2,
  idempotentToolMaxAttempts: 2
} as const satisfies SessionTurnRecoveryBinding

export const DEFAULT_TURN_MAX_OUTPUT_TOKENS = 4_096

export function createTurnExecutionBinding(
  request: CreateTurnExecutionBindingRequest
): SessionTurnExecutionBinding {
  const endpoint = normalizeModelEndpoint(request.modelEndpoint)
  const modelEndpoint = modelEndpointExecutionBinding(endpoint)
  const withoutDigest = {
    createdAt: request.createdAt ?? Date.now(),
    modelEndpoint,
    completion: resolveTurnCompletionBinding(
      endpoint,
      request.maxOutputTokens
    ),
    capabilityRoutes: normalizeModelCapabilityRouteExecutionBindings(
      request.agentContext?.capabilityRoutes ?? []
    ),
    resources: request.resources ?? [],
    recovery: request.recovery ?? DEFAULT_TURN_RECOVERY_BINDING,
    ...contextSnapshots(request.agentContext),
    ...(request.environmentSnapshot === undefined
      ? {}
      : { environmentSnapshot: request.environmentSnapshot })
  }
  return {
    digest: digestJson(withoutDigest),
    ...withoutDigest
  }
}

export async function providerForTurnBinding(
  binding: SessionTurnExecutionBinding,
  options: {
    readonly storage: CoreStore
    readonly directProvider?: ProviderAdapter
    readonly secretResolver?: SecretResolverPort
  }
): Promise<ProviderAdapter> {
  assertTurnExecutionBindingValid(binding)
  const direct = options.directProvider
  if (
    direct !== undefined &&
    direct.protocol.id === binding.modelEndpoint.protocol.id &&
    direct.providerId === binding.modelEndpoint.connection.providerId &&
    sameModelDescriptor(direct.model, binding.modelEndpoint.model)
  ) {
    return direct
  }
  const endpoint = modelEndpointFromBinding(binding)
  if (modelEndpointDigest(endpoint) !== binding.modelEndpoint.endpointDigest) {
    throw new Error("turn model endpoint binding digest is invalid")
  }
  normalizeModelCapabilityRouteExecutionBindings(binding.capabilityRoutes)
  assertPositiveInteger(
    binding.completion.maxOutputTokens,
    "turn completion maxOutputTokens"
  )
  assertCompletionFitsModel(endpoint, binding.completion.maxOutputTokens)
  return await providerFromModelEndpoint(endpoint, options.secretResolver)
}

export function assertTurnExecutionBindingValid(
  binding: SessionTurnExecutionBinding
): void {
  const { digest, ...unsignedBinding } = binding
  if (digestJson(unsignedBinding) !== digest) {
    throw new Error("turn execution binding digest is invalid")
  }
  const endpoint = modelEndpointFromBinding(binding)
  if (modelEndpointDigest(endpoint) !== binding.modelEndpoint.endpointDigest) {
    throw new Error("turn model endpoint binding digest is invalid")
  }
  assertPositiveInteger(
    binding.completion.maxOutputTokens,
    "turn completion maxOutputTokens"
  )
  assertCompletionFitsModel(endpoint, binding.completion.maxOutputTokens)
  assertPositiveInteger(
    binding.recovery.providerMaxAttempts,
    "turn recovery providerMaxAttempts"
  )
  assertPositiveInteger(
    binding.recovery.idempotentToolMaxAttempts,
    "turn recovery idempotentToolMaxAttempts"
  )
}

function resolveTurnCompletionBinding(
  endpoint: ModelEndpoint,
  requested: number | undefined
): SessionTurnExecutionBinding["completion"] {
  const contextWindowTokens = endpoint.model.limits?.contextWindowTokens
  const maxOutputTokens = endpoint.model.limits?.maxOutputTokens
  const contextDefault =
    contextWindowTokens === undefined
      ? DEFAULT_TURN_MAX_OUTPUT_TOKENS
      : Math.max(1, Math.floor(contextWindowTokens / 4))
  const resolved =
    requested ??
    Math.min(
      DEFAULT_TURN_MAX_OUTPUT_TOKENS,
      contextDefault,
      maxOutputTokens ?? DEFAULT_TURN_MAX_OUTPUT_TOKENS
    )
  assertPositiveInteger(resolved, "turn completion maxOutputTokens")
  assertCompletionFitsModel(endpoint, resolved)
  return { maxOutputTokens: resolved }
}

function assertCompletionFitsModel(
  endpoint: ModelEndpoint,
  maxOutputTokens: number
): void {
  const modelMaximum = endpoint.model.limits?.maxOutputTokens
  if (modelMaximum !== undefined && maxOutputTokens > modelMaximum) {
    throw new Error(
      "turn completion maxOutputTokens exceeds the model output limit"
    )
  }
  const contextWindow = endpoint.model.limits?.contextWindowTokens
  if (contextWindow !== undefined && maxOutputTokens >= contextWindow) {
    throw new Error(
      "turn completion maxOutputTokens must be smaller than the model context window"
    )
  }
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
}

export function assertAgentContextMatchesBinding(
  binding: SessionTurnExecutionBinding,
  context: PreparedAgentContext | undefined
): void {
  assertTurnExecutionBindingValid(binding)
  const snapshots = contextSnapshots(context)
  if (
    stableJson(snapshots.contextSnapshot ?? null) !==
      stableJson(binding.contextSnapshot ?? null) ||
    stableJson(snapshots.toolSnapshot ?? null) !==
      stableJson(binding.toolSnapshot ?? null) ||
    stableJson(context?.capabilityRoutes ?? []) !==
      stableJson(binding.capabilityRoutes) ||
    stableJson(snapshots.permissionSnapshot ?? null) !==
      stableJson(binding.permissionSnapshot ?? null)
  ) {
    throw new Error("resolved agent context does not match the admitted turn binding")
  }
}

function modelEndpointFromBinding(
  binding: SessionTurnExecutionBinding
): ModelEndpoint {
  return modelEndpointFromExecutionBinding(binding.modelEndpoint)
}

function contextSnapshots(context: PreparedAgentContext | undefined): {
  readonly contextSnapshot?: JsonValue
  readonly toolSnapshot?: JsonValue
  readonly permissionSnapshot?: JsonValue
} {
  if (context === undefined) {
    return {}
  }
  const permissionSnapshot = context.toolPermissionPolicy?.snapshot()
  if (permissionSnapshot !== undefined) {
    assertToolRuntimeBinding(permissionSnapshot)
  }
  const contextSnapshot = {
    ...(context.instructionSnapshot === undefined
      ? {}
      : { instructions: context.instructionSnapshot }),
    ...(context.skillSnapshot === undefined
      ? {}
      : { skills: context.skillSnapshot })
  } as unknown as JsonValue
  return {
    ...(stableJson(contextSnapshot) === "{}" ? {} : { contextSnapshot }),
    ...(context.tools === undefined
      ? {}
      : { toolSnapshot: context.tools.snapshot() as unknown as JsonValue }),
    ...(permissionSnapshot === undefined
      ? {}
      : {
          permissionSnapshot:
            permissionSnapshot as unknown as JsonValue
        })
  }
}

function digestJson(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex")
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value))
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson)
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJson(item)])
    )
  }
  return value
}
