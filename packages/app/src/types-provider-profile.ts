import type { ProviderCapabilities, ProviderProfile } from "@wanex/protocol"

export interface WanexAppProviderProfileOptions {
  readonly id?: string
  readonly kind?: ProviderProfile["kind"]
  readonly providerId?: string
  readonly modelId?: string
  readonly capabilities?: ProviderCapabilities
  readonly baseUrl?: string
  readonly secretRef?: string
  readonly anthropicVersion?: string
}

export interface WanexAppProviderProfileCommands {
  readActiveProviderProfile(): Promise<WanexAppProviderProfileReadModel>
  setActiveProviderProfile(
    request: WanexAppSetActiveProviderProfileRequest
  ): Promise<WanexAppProviderProfileReadModel>
  upsertProviderProfile(
    request: WanexAppUpsertProviderProfileRequest
  ): Promise<WanexAppProviderProfileReadModel>
  readProviderProfile(
    request: WanexAppReadProviderProfileRequest
  ): Promise<WanexAppProviderProfileReadModel | null>
  listProviderProfiles(): Promise<WanexAppProviderProfileListReadModel>
}

export interface WanexAppSetActiveProviderProfileRequest {
  readonly profileId: string
}

export interface WanexAppUpsertProviderProfileRequest {
  readonly profile: ProviderProfile
  readonly makeActive?: boolean
}

export interface WanexAppReadProviderProfileRequest {
  readonly profileId: string
}

export interface WanexAppProviderProfileReadModel {
  readonly id: string
  readonly kind: ProviderProfile["kind"]
  readonly providerId: string
  readonly modelId: string
  readonly capabilities: ProviderCapabilities
  readonly baseUrl?: string
  readonly anthropicVersion?: string
  readonly credentialConfigured: boolean
  readonly active: boolean
}

export interface WanexAppProviderProfileListReadModel {
  readonly activeProfileId: string
  readonly profiles: readonly WanexAppProviderProfileReadModel[]
}
