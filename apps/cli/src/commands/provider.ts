import type { ProviderProfile } from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import {
  readProviderProfile,
  summarizeProviderProfile,
  writeProviderProfile
} from "@wanex/runtime/provider"

export async function providerSetValue(
  storage: CoreStore,
  profile: ProviderProfile
): Promise<unknown> {
  await writeProviderProfile(storage, profile)
  return {
    command: "provider-set",
    profile: summarizeProviderProfile(profile)
  }
}

export async function providerGetValue(
  storage: CoreStore,
  profileId: string
): Promise<unknown> {
  const profile = await readProviderProfile(storage, profileId)
  return {
    command: "provider-get",
    profile: profile === null ? null : summarizeProviderProfile(profile)
  }
}
