import type { ProviderProfile } from "@wanex/protocol"

export interface WanexAppShellProviderProfileOptions {
  readonly id?: string
  readonly kind?: ProviderProfile["kind"]
  readonly providerId?: string
  readonly modelId?: string
  readonly baseUrl?: string
  readonly apiKey?: string
  readonly anthropicVersion?: string
}

export interface WanexAppShellProviderProfileCommands {
  readActiveProviderProfile(): Promise<WanexAppShellProviderProfileReadModel>
  setActiveProviderProfile(
    request: WanexAppShellSetActiveProviderProfileRequest
  ): Promise<WanexAppShellProviderProfileReadModel>
  upsertProviderProfile(
    request: WanexAppShellUpsertProviderProfileRequest
  ): Promise<WanexAppShellProviderProfileReadModel>
  readProviderProfile(
    request: WanexAppShellReadProviderProfileRequest
  ): Promise<WanexAppShellProviderProfileReadModel | null>
  listProviderProfiles(): Promise<WanexAppShellProviderProfileListReadModel>
}

export interface WanexAppShellSetActiveProviderProfileRequest {
  readonly profileId: string
}

export interface WanexAppShellUpsertProviderProfileRequest {
  readonly profile: ProviderProfile
  readonly makeActive?: boolean
}

export interface WanexAppShellReadProviderProfileRequest {
  readonly profileId: string
}

export interface WanexAppShellProviderProfileReadModel {
  readonly id: string
  readonly kind: ProviderProfile["kind"]
  readonly providerId: string
  readonly modelId: string
  readonly baseUrl?: string
  readonly anthropicVersion?: string
  readonly hasApiKey: boolean
  readonly apiKeyRedacted?: string
  readonly active: boolean
}

export interface WanexAppShellProviderProfileListReadModel {
  readonly activeProfileId: string
  readonly profiles: readonly WanexAppShellProviderProfileReadModel[]
}
