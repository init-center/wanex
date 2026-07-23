import { createHash } from "node:crypto"
import type {
  JsonValue,
  ProviderProfile,
  ResourceInputEvidence,
  SessionTurnExecutionBinding,
  SessionTurnRecoveryBinding
} from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import type { PreparedAgentContext } from "../context/agent/index.js"
import {
  providerFromProfile,
  sameProviderCapabilities,
  type ProviderAdapter
} from "../provider/index.js"
import type { SecretResolverPort } from "../secrets/index.js"
import { assertToolRuntimeBinding } from "../tools/evidence.js"

export interface CreateTurnExecutionBindingRequest {
  readonly profile: ProviderProfile
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

export function createTurnExecutionBinding(
  request: CreateTurnExecutionBindingRequest
): SessionTurnExecutionBinding {
  const provider = {
    profileId: request.profile.id,
    profileDigest: providerProfileDigest(request.profile),
    adapterId: request.profile.kind,
    providerId: request.profile.providerId,
    modelId: request.profile.modelId,
    capabilities: request.profile.capabilities,
    ...(request.profile.baseUrl === undefined
      ? {}
      : { baseUrl: request.profile.baseUrl }),
    ...(request.profile.secretRef === undefined
      ? {}
      : { secretRef: request.profile.secretRef }),
    ...(request.profile.anthropicVersion === undefined
      ? {}
      : { anthropicVersion: request.profile.anthropicVersion })
  } as const
  const withoutDigest = {
    createdAt: request.createdAt ?? Date.now(),
    provider,
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
    direct.providerId === binding.provider.providerId &&
    direct.modelId === binding.provider.modelId &&
    sameProviderCapabilities(direct.capabilities, binding.provider.capabilities)
  ) {
    return direct
  }
  const profile = profileFromBinding(binding)
  if (providerProfileDigest(profile) !== binding.provider.profileDigest) {
    throw new Error("turn provider binding digest is invalid")
  }
  return await providerFromProfile(profile, options.secretResolver)
}

export function assertTurnExecutionBindingValid(
  binding: SessionTurnExecutionBinding
): void {
  const { digest, ...unsignedBinding } = binding
  if (digestJson(unsignedBinding) !== digest) {
    throw new Error("turn execution binding digest is invalid")
  }
  const profile = profileFromBinding(binding)
  if (providerProfileDigest(profile) !== binding.provider.profileDigest) {
    throw new Error("turn provider binding digest is invalid")
  }
  assertPositiveInteger(
    binding.recovery.providerMaxAttempts,
    "turn recovery providerMaxAttempts"
  )
  assertPositiveInteger(
    binding.recovery.idempotentToolMaxAttempts,
    "turn recovery idempotentToolMaxAttempts"
  )
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
    stableJson(snapshots.permissionSnapshot ?? null) !==
      stableJson(binding.permissionSnapshot ?? null)
  ) {
    throw new Error("resolved agent context does not match the admitted turn binding")
  }
}

export function providerProfileDigest(profile: ProviderProfile): string {
  return digestJson({
    id: profile.id,
    kind: profile.kind,
    providerId: profile.providerId,
    modelId: profile.modelId,
    capabilities: profile.capabilities,
    ...(profile.baseUrl === undefined ? {} : { baseUrl: profile.baseUrl }),
    ...(profile.secretRef === undefined ? {} : { secretRef: profile.secretRef }),
    ...(profile.anthropicVersion === undefined
      ? {}
      : { anthropicVersion: profile.anthropicVersion })
  })
}

function profileFromBinding(
  binding: SessionTurnExecutionBinding
): ProviderProfile {
  return {
    id: binding.provider.profileId,
    kind: binding.provider.adapterId,
    providerId: binding.provider.providerId,
    modelId: binding.provider.modelId,
    capabilities: binding.provider.capabilities,
    ...(binding.provider.baseUrl === undefined
      ? {}
      : { baseUrl: binding.provider.baseUrl }),
    ...(binding.provider.secretRef === undefined
      ? {}
      : { secretRef: binding.provider.secretRef }),
    ...(binding.provider.anthropicVersion === undefined
      ? {}
      : { anthropicVersion: binding.provider.anthropicVersion })
  }
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
