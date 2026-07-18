import type { ProviderProfile } from "@wanex/protocol"
import type { ProductAppShell } from "@wanex/product-app"
import type {
  ProductAppLocalProviderProfileOptions,
  ProductAppLocalProviderProfilesOptions
} from "./types.js"

export const defaultProductAppLocalProviderProfile: ProviderProfile = {
  id: "product-app-local",
  kind: "fake",
  providerId: "fake",
  modelId: "product-app-local-model"
}

export interface ResolvedProductAppLocalProviderProfiles {
  readonly profiles: readonly ProviderProfile[]
  readonly primaryProfile: ProviderProfile
  readonly activeProfileId?: string
}

export function resolveProductAppLocalProviderProfiles(
  options: ProductAppLocalProviderProfilesOptions | undefined
): ResolvedProductAppLocalProviderProfiles {
  const profiles =
    options === undefined
      ? [defaultProductAppLocalProviderProfile]
      : options.profiles.map(normalizeProductAppLocalProviderProfile)
  if (profiles.length === 0) {
    throw new Error("providerProfiles.profiles must not be empty")
  }
  assertUniqueProviderProfileIds(profiles)
  const activeProfileId = normalizeOptionalString(
    options?.activeProfileId,
    "providerProfiles.activeProfileId"
  )
  if (
    activeProfileId !== undefined &&
    !profiles.some((profile) => profile.id === activeProfileId)
  ) {
    throw new Error(
      `active provider profile must be included in providerProfiles.profiles: ${activeProfileId}`
    )
  }
  return {
    profiles,
    primaryProfile: profiles[0] as ProviderProfile,
    ...(activeProfileId === undefined ? {} : { activeProfileId })
  }
}

export async function seedProductAppLocalProviderProfiles(input: {
  readonly productApp: ProductAppShell
  readonly providerProfiles: ResolvedProductAppLocalProviderProfiles
}): Promise<void> {
  for (const profile of input.providerProfiles.profiles) {
    await input.productApp.providerProfiles.upsertProviderProfile({
      profile,
      makeActive: false
    })
  }
  if (input.providerProfiles.activeProfileId !== undefined) {
    await input.productApp.providerProfiles.setActiveProviderProfile({
      profileId: input.providerProfiles.activeProfileId
    })
  }
}

export function normalizeProductAppLocalProviderProfile(
  profile: ProductAppLocalProviderProfileOptions
): ProviderProfile {
  const id = normalizeRequiredString(profile.id, "provider profile id")
  const kind = profile.kind ?? "fake"
  const providerId = normalizeOptionalString(
    profile.providerId,
    "provider profile providerId"
  ) ?? kind
  const modelId =
    normalizeOptionalString(profile.modelId, "provider profile modelId") ??
    "product-app-local-model"
  const baseUrl = normalizeOptionalString(
    profile.baseUrl,
    "provider profile baseUrl"
  )
  const apiKey = normalizeOptionalString(
    profile.apiKey,
    "provider profile apiKey"
  )
  if (kind !== "fake") {
    if (baseUrl === undefined) {
      throw new Error(`${kind} provider requires baseUrl`)
    }
    if (apiKey === undefined) {
      throw new Error(`${kind} provider requires apiKey`)
    }
  }
  return {
    id,
    kind,
    providerId,
    modelId,
    ...(baseUrl === undefined ? {} : { baseUrl }),
    ...(apiKey === undefined ? {} : { apiKey })
  }
}

function assertUniqueProviderProfileIds(
  profiles: readonly ProviderProfile[]
): void {
  const ids = new Set<string>()
  for (const profile of profiles) {
    if (ids.has(profile.id)) {
      throw new Error(`duplicate provider profile id: ${profile.id}`)
    }
    ids.add(profile.id)
  }
}

function normalizeRequiredString(value: string, name: string): string {
  const normalized = value.trim()
  if (normalized.length === 0) {
    throw new Error(`${name} must not be empty`)
  }
  return normalized
}

function normalizeOptionalString(
  value: string | undefined,
  name: string
): string | undefined {
  if (value === undefined) {
    return undefined
  }
  const normalized = value.trim()
  if (normalized.length === 0) {
    throw new Error(`${name} must not be empty`)
  }
  return normalized
}
