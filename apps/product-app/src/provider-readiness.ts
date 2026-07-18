import type {
  ProductAppSafeError,
  ProductAppProviderProfileListReadModel,
  ProductAppProviderProfileReadModel,
  ProductAppProviderReadinessReadModel
} from "./types.js"

export function projectProductAppProviderReadiness(
  profiles: ProductAppProviderProfileListReadModel
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
      requiresApiKey: false,
      hasApiKey: false
    }
  }

  const requiresApiKey = providerRequiresApiKey(activeProfile)
  if (requiresApiKey && !activeProfile.hasApiKey) {
    return {
      status: "missing_required_api_key",
      reason: "active_profile_missing_api_key",
      activeProfileId: profiles.activeProfileId,
      profileCount: profiles.profiles.length,
      canRun: false,
      attentionRequired: true,
      requiresApiKey,
      hasApiKey: false,
      activeProfile: cloneProviderProfileReadModel(activeProfile)
    }
  }

  return {
    status: "ready",
    reason: "active_profile_ready",
    activeProfileId: profiles.activeProfileId,
    profileCount: profiles.profiles.length,
    canRun: true,
    attentionRequired: false,
    requiresApiKey,
    hasApiKey: activeProfile.hasApiKey,
    activeProfile: cloneProviderProfileReadModel(activeProfile)
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
    case "missing_required_api_key":
      return `provider is not ready: active profile ${readiness.activeProfileId} is missing a required API key`
  }
}

function providerRequiresApiKey(
  profile: ProductAppProviderProfileReadModel
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

function cloneProviderProfileReadModel(
  profile: ProductAppProviderProfileReadModel
): ProductAppProviderProfileReadModel {
  return {
    id: profile.id,
    kind: profile.kind,
    providerId: profile.providerId,
    modelId: profile.modelId,
    ...(profile.baseUrl === undefined ? {} : { baseUrl: profile.baseUrl }),
    ...(profile.anthropicVersion === undefined
      ? {}
      : { anthropicVersion: profile.anthropicVersion }),
    hasApiKey: profile.hasApiKey,
    ...(profile.apiKeyRedacted === undefined
      ? {}
      : { apiKeyRedacted: profile.apiKeyRedacted }),
    active: profile.active
  }
}
