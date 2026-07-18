import {
  listWanexAppShellProviderProfiles,
  readWanexAppShellActiveProviderProfile,
  readWanexAppShellProviderProfile,
  setWanexAppShellActiveProviderProfile,
  upsertWanexAppShellProviderProfile
} from "./provider-profile.js"
import type { WanexAppShellCommandContext } from "./command-context.js"
import type { WanexAppShellProviderProfileCommands } from "./types-provider-profile.js"

export function createWanexAppShellProviderCommands(
  context: WanexAppShellCommandContext
): WanexAppShellProviderProfileCommands {
  return {
    async readActiveProviderProfile() {
      context.assertActive()
      const profile = await readWanexAppShellActiveProviderProfile(
        context.runtime.storage
      )
      context.setActiveProviderProfileId(profile.id)
      return profile
    },
    async setActiveProviderProfile(request) {
      context.assertActive()
      const profile = await setWanexAppShellActiveProviderProfile({
        storage: context.runtime.storage,
        profileId: request.profileId
      })
      context.setActiveProviderProfileId(profile.id)
      return profile
    },
    async upsertProviderProfile(request) {
      context.assertActive()
      const profile = await upsertWanexAppShellProviderProfile({
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
      return await readWanexAppShellProviderProfile({
        storage: context.runtime.storage,
        profileId: request.profileId
      })
    },
    async listProviderProfiles() {
      context.assertActive()
      const profiles = await listWanexAppShellProviderProfiles(
        context.runtime.storage
      )
      context.setActiveProviderProfileId(profiles.activeProfileId)
      return profiles
    }
  }
}
