import {
  profileToJson,
  providerProfileFromJson,
  readProviderProfile,
  writeProviderProfile
} from "@wanex/runtime/provider"
import type { JsonValue, ProviderProfile } from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import type {
  WanexAppProviderProfileListReadModel,
  WanexAppProviderProfileReadModel
} from "./types-provider-profile.js"

export const APP_ACTIVE_PROVIDER_PROFILE_KEY =
  "wanex-app.provider.activeProfileId"
export const APP_PROVIDER_PROFILE_INDEX_KEY =
  "wanex-app.provider.profileIndex"

export async function initializeWanexAppProviderProfile(options: {
  readonly storage: CoreStore
  readonly profile: ProviderProfile
}): Promise<void> {
  await upsertWanexAppProviderProfile({
    storage: options.storage,
    profile: options.profile
  })
}

export async function upsertWanexAppProviderProfile(options: {
  readonly storage: CoreStore
  readonly profile: ProviderProfile
  readonly makeActive?: boolean
}): Promise<WanexAppProviderProfileReadModel> {
  const profile = normalizeProviderProfile(options.profile)
  const activeProfileId = await readActiveProviderProfileId(options.storage)
  const nextIndex = addProfileId(
    await readProviderProfileIndex(options.storage),
    profile.id
  )
  await writeProviderProfile(options.storage, profile)
  await writeProviderProfileIndex(
    options.storage,
    nextIndex
  )
  if (options.makeActive === true || activeProfileId === null) {
    await writeActiveProviderProfileId(options.storage, profile.id)
  }
  return projectProviderProfileReadModel(
    profile,
    await requireActiveProviderProfileId(options.storage)
  )
}

export async function setWanexAppActiveProviderProfile(options: {
  readonly storage: CoreStore
  readonly profileId: string
}): Promise<WanexAppProviderProfileReadModel> {
  const profile = await readProviderProfile(options.storage, options.profileId)
  if (profile === null) {
    throw new Error(`provider profile not found: ${options.profileId}`)
  }
  await writeActiveProviderProfileId(options.storage, options.profileId)
  await writeProviderProfileIndex(
    options.storage,
    addProfileId(await readProviderProfileIndex(options.storage), options.profileId)
  )
  return projectProviderProfileReadModel(profile, options.profileId)
}

export async function readWanexAppActiveProviderProfile(
  storage: CoreStore
): Promise<WanexAppProviderProfileReadModel> {
  const activeProfileId = await requireActiveProviderProfileId(storage)
  const profile = await readProviderProfile(storage, activeProfileId)
  if (profile === null) {
    throw new Error(`provider profile not found: ${activeProfileId}`)
  }
  return projectProviderProfileReadModel(profile, activeProfileId)
}

export async function readWanexAppProviderProfile(options: {
  readonly storage: CoreStore
  readonly profileId: string
}): Promise<WanexAppProviderProfileReadModel | null> {
  const profile = await readProviderProfile(options.storage, options.profileId)
  if (profile === null) {
    return null
  }
  return projectProviderProfileReadModel(
    profile,
    await requireActiveProviderProfileId(options.storage)
  )
}

export async function listWanexAppProviderProfiles(
  storage: CoreStore
): Promise<WanexAppProviderProfileListReadModel> {
  const activeProfileId = await requireActiveProviderProfileId(storage)
  const profiles = (
    await Promise.all(
      (await readProviderProfileIndex(storage)).map(async (profileId) => {
        const profile = await readProviderProfile(storage, profileId)
        return profile === null
          ? null
          : projectProviderProfileReadModel(profile, activeProfileId)
      })
    )
  ).filter((profile): profile is WanexAppProviderProfileReadModel =>
    profile !== null
  )
  return {
    activeProfileId,
    profiles
  }
}

export async function requireWanexAppActiveProviderProfileId(
  storage: CoreStore
): Promise<string> {
  return await requireActiveProviderProfileId(storage)
}

function projectProviderProfileReadModel(
  profile: ProviderProfile,
  activeProfileId: string
): WanexAppProviderProfileReadModel {
  return {
    id: profile.id,
    kind: profile.kind,
    providerId: profile.providerId,
    modelId: profile.modelId,
    capabilities: profile.capabilities,
    ...(profile.baseUrl === undefined ? {} : { baseUrl: profile.baseUrl }),
    ...(profile.anthropicVersion === undefined
      ? {}
      : { anthropicVersion: profile.anthropicVersion }),
    credentialConfigured: profile.secretRef !== undefined,
    active: profile.id === activeProfileId
  }
}

async function readActiveProviderProfileId(
  storage: CoreStore
): Promise<string | null> {
  const value = await storage.getConfig(APP_ACTIVE_PROVIDER_PROFILE_KEY)
  if (value === null) {
    return null
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("app active provider profile id must be a string")
  }
  return value
}

async function requireActiveProviderProfileId(
  storage: CoreStore
): Promise<string> {
  const profileId = await readActiveProviderProfileId(storage)
  if (profileId === null) {
    throw new Error("app active provider profile is not configured")
  }
  return profileId
}

async function writeActiveProviderProfileId(
  storage: CoreStore,
  profileId: string
): Promise<void> {
  if (profileId.length === 0) {
    throw new Error("provider profile id must not be empty")
  }
  await storage.putConfig(APP_ACTIVE_PROVIDER_PROFILE_KEY, profileId)
}

async function readProviderProfileIndex(
  storage: CoreStore
): Promise<readonly string[]> {
  const value = await storage.getConfig(APP_PROVIDER_PROFILE_INDEX_KEY)
  if (value === null) {
    return []
  }
  if (!Array.isArray(value) || !value.every(isNonEmptyString)) {
    throw new Error("app provider profile index must be a string array")
  }
  return [...value].sort()
}

async function writeProviderProfileIndex(
  storage: CoreStore,
  profileIds: readonly string[]
): Promise<void> {
  await storage.putConfig(
    APP_PROVIDER_PROFILE_INDEX_KEY,
    [...new Set(profileIds)].sort() as JsonValue
  )
}

function addProfileId(
  profileIds: readonly string[],
  profileId: string
): readonly string[] {
  if (profileId.length === 0) {
    throw new Error("provider profile id must not be empty")
  }
  return [...new Set([...profileIds, profileId])].sort()
}

function normalizeProviderProfile(profile: ProviderProfile): ProviderProfile {
  return providerProfileFromJson(profileToJson(profile))
}

function isNonEmptyString(value: JsonValue): value is string {
  return typeof value === "string" && value.length > 0
}
