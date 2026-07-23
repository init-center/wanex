import {
  listWanexAppProviderProfiles,
  readWanexAppActiveProviderProfile,
  readWanexAppProviderProfile,
  setWanexAppActiveProviderProfile,
  upsertWanexAppProviderProfile
} from "./provider-profile.js"
import type { WanexAppCommandContext } from "./command-context.js"
import type { WanexAppProviderProfileCommands } from "./types-provider-profile.js"

export function createWanexAppProviderCommands(
  context: WanexAppCommandContext
): WanexAppProviderProfileCommands {
  return {
    async readActiveProviderProfile() {
      context.assertActive()
      const profile = await readWanexAppActiveProviderProfile(
        context.runtime.storage
      )
      context.setActiveProviderProfileId(profile.id)
      return profile
    },
    async setActiveProviderProfile(request) {
      context.assertActive()
      const profile = await setWanexAppActiveProviderProfile({
        storage: context.runtime.storage,
        profileId: request.profileId
      })
      context.setActiveProviderProfileId(profile.id)
      return profile
    },
    async upsertProviderProfile(request) {
      context.assertActive()
      const profile = await upsertWanexAppProviderProfile({
        storage: context.runtime.storage,
        profile: request.profile,
        ...(request.makeActive === undefined
          ? {}
          : { makeActive: request.makeActive })
      })
      if (profile.active) {
        context.setActiveProviderProfileId(profile.id)
      }
      return profile
    },
    async readProviderProfile(request) {
      context.assertActive()
      return await readWanexAppProviderProfile({
        storage: context.runtime.storage,
        profileId: request.profileId
      })
    },
    async listProviderProfiles() {
      context.assertActive()
      const profiles = await listWanexAppProviderProfiles(
        context.runtime.storage
      )
      context.setActiveProviderProfileId(profiles.activeProfileId)
      return profiles
    }
  }
}
