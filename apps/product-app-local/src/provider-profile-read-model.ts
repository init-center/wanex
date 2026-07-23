import type {
  ProductAppProviderProfileListReadModel,
  ProductAppProviderProfileReadModel
} from "@wanex/product-app"
import type { ProductAppLocalWebApp } from "./types.js"

type TrustedProviderProfileList = Awaited<
  ReturnType<ProductAppLocalWebApp["providerProfiles"]["listProviderProfiles"]>
>

type TrustedProviderProfile =
  TrustedProviderProfileList["profiles"][number]

export function projectProductAppLocalProviderProfiles(
  profiles: TrustedProviderProfileList
): ProductAppProviderProfileListReadModel {
  return {
    activeProfileId: profiles.activeProfileId,
    profiles: profiles.profiles.map(projectProductAppLocalProviderProfile)
  }
}

export function projectProductAppLocalProviderProfile(
  profile: TrustedProviderProfile
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
