import type { ProviderProfile } from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import {
  profileToJson,
  providerConfigKey,
  readProviderProfile,
  redactProfile
} from "@wanex/runtime/provider"

export async function providerSetValue(
  storage: CoreStore,
  profile: ProviderProfile
): Promise<unknown> {
  await storage.putConfig(providerConfigKey(profile.id), profileToJson(profile))
  return {
    command: "provider-set",
    profile: redactProfile(profile)
  }
}

export async function providerGetValue(
  storage: CoreStore,
  profileId: string
): Promise<unknown> {
  const profile = await readProviderProfile(storage, profileId)
  return {
    command: "provider-get",
    profile: profile === null ? null : redactProfile(profile)
  }
}
