import type {
  ProductAppBackendProviderProfileListReadModel,
  ProductAppBackendProviderProfileReadModel
} from "@wanex/product-app/backend"
import type {
  ProductAppSafeError,
  ProductAppProviderProfileReadModel,
  ProductAppProviderReadinessReadModel
} from "./types.js"

export function projectProductAppProviderReadiness(
  profiles: ProductAppBackendProviderProfileListReadModel
): ProductAppProviderReadinessReadModel {
  const activeProfile = profiles.profiles.find(
    (profile) => profile.id === profiles.activeProfileId
  )
  if (activeProfile === undefined) {
    return {
      status: "missing_active_profile",
      reason: "active_profile_missing",
      activeProfileId: profiles.activeProfileId,
      profileCount: profiles.profiles.length,
      canRun: false,
      attentionRequired: true,
      requiresCredential: false,
      credentialConfigured: false
    }
  }

  const requiresCredential = providerRequiresCredential(activeProfile)
  if (requiresCredential && !activeProfile.credentialConfigured) {
    return {
      status: "missing_required_credential",
      reason: "active_profile_missing_credential",
      activeProfileId: profiles.activeProfileId,
      profileCount: profiles.profiles.length,
      canRun: false,
      attentionRequired: true,
      requiresCredential,
      credentialConfigured: false,
      activeProfile: projectProductAppProviderProfile(activeProfile)
    }
  }

  return {
    status: "ready",
    reason: "active_profile_ready",
    activeProfileId: profiles.activeProfileId,
    profileCount: profiles.profiles.length,
    canRun: true,
    attentionRequired: false,
    requiresCredential,
    credentialConfigured: activeProfile.credentialConfigured,
    activeProfile: projectProductAppProviderProfile(activeProfile)
  }
}

export function productAppProviderNotReadyError(
  readiness: ProductAppProviderReadinessReadModel
): ProductAppSafeError {
  return {
    code: "provider_not_ready",
    category: "validation",
    message: productAppProviderNotReadyMessage(readiness)
  }
}

function productAppProviderNotReadyMessage(
  readiness: ProductAppProviderReadinessReadModel
): string {
  switch (readiness.status) {
    case "ready":
      return "provider is ready"
    case "missing_active_profile":
      return `provider is not ready: active profile ${readiness.activeProfileId} is missing`
    case "missing_required_credential":
      return `provider is not ready: active profile ${readiness.activeProfileId} is missing a required credential`
  }
}

function providerRequiresCredential(
  profile: ProductAppBackendProviderProfileReadModel
): boolean {
  switch (profile.kind) {
    case "fake":
      return false
    case "openai-compatible":
    case "anthropic":
    case "deepseek":
      return true
  }
}

export function projectProductAppProviderProfile(
  profile: ProductAppBackendProviderProfileReadModel
): ProductAppProviderProfileReadModel {
  return {
    id: profile.id,
    kind: profile.kind,
    providerId: profile.providerId,
    modelId: profile.modelId,
    capabilities: profile.capabilities,
    credentialConfigured: profile.credentialConfigured,
    active: profile.active
  }
}

export function projectProductAppProviderProfiles(
  profiles: ProductAppBackendProviderProfileListReadModel
) {
  return {
    activeProfileId: profiles.activeProfileId,
    profiles: profiles.profiles.map(projectProductAppProviderProfile)
  }
}
