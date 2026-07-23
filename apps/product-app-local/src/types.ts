import type {
  ProductAppInitialState,
  ProductAppProviderProfileReadModel,
  ProductAppProviderProfileCommands,
  ProductAppProviderProfileListReadModel,
  ProductAppProviderReadinessReadModel,
  ProductAppSelectSessionRequest,
  ProductAppSetLayoutRequest,
  ProductAppSetModeRequest,
  ProductAppSettingsReadModel,
  ProductAppShell,
  ProductAppStateSnapshot,
  ProductAppUpdatePreferencesRequest
} from "@wanex/product-app"
import type { ProviderProfile } from "@wanex/protocol"
import type { SecretResolverPort } from "@wanex/runtime/secrets"
import type {
  ProductAppWebController,
  ProductAppWebSnapshot
} from "@wanex/product-app-web"
import type {
  ProductAppWebNodeHostServer
} from "./web-host/types.js"
import type {
  ProductAppLocalAttachmentUploadPort
} from "./attachment-upload.js"

export type ProductAppLocalStorageMode = "oneshot" | "persistent"

export type ProductAppLocalStorageConfig =
  | ProductAppLocalStoreDirStorageConfig
  | ProductAppLocalProfileStorageConfig

export interface ProductAppLocalStoreDirStorageConfig {
  readonly kind: "store-dir"
  readonly storeDir: string
  readonly mode?: ProductAppLocalStorageMode
}

export interface ProductAppLocalProfileStorageConfig {
  readonly kind: "profile"
  readonly rootDir: string
  readonly profileId?: string
  readonly mode?: ProductAppLocalStorageMode
}

export type ProductAppLocalProviderProfileOptions =
  Omit<
    ProviderProfile,
    "kind" | "providerId" | "modelId" | "capabilities"
  > &
    Partial<
      Pick<
        ProviderProfile,
        "kind" | "providerId" | "modelId" | "capabilities"
      >
    >

export interface ProductAppLocalProviderProfilesOptions {
  readonly profiles: readonly ProductAppLocalProviderProfileOptions[]
  readonly activeProfileId?: string
}

export interface ProductAppLocalWebHostOptions {
  readonly hostname?: string
  readonly port?: number
  readonly pollIntervalMs?: number
  readonly requestPath?: string
  readonly clientScriptPath?: string
  readonly stylesheetPath?: string
  readonly maxBodyBytes?: number
  readonly attachmentPath?: string
  readonly maxAttachmentBytes?: number
}

export interface StartProductAppLocalWebAppOptions {
  readonly storage: ProductAppLocalStorageConfig
  readonly serviceBin: string
  readonly providerProfiles?: ProductAppLocalProviderProfilesOptions
  readonly secretResolver?: SecretResolverPort
  readonly initialState?: ProductAppInitialState
  readonly web?: ProductAppLocalWebHostOptions
}

export interface ProductAppLocalWebApp {
  readonly productApp: ProductAppShell
  readonly providerProfiles: ProductAppProviderProfileCommands
  readonly providerSetup: ProductAppLocalProviderSetupCommands
  readonly settings: ProductAppLocalSettingsCommands
  readonly attachments: ProductAppLocalAttachmentUploadPort
  readonly webController: ProductAppWebController
  readonly host: ProductAppWebNodeHostServer
  readonly url: string
  readSnapshot(): Promise<ProductAppLocalSnapshot>
  close(): Promise<void>
}

export interface ProductAppLocalSnapshot {
  readonly kind: "product-app-local.snapshot"
  readonly url: string
  readonly settings: ProductAppSettingsReadModel
  readonly providerProfiles: ProductAppProviderProfileListReadModel
  readonly web: ProductAppWebSnapshot
  readonly privacy: ProductAppLocalSnapshotPrivacy
}

export interface ProductAppLocalSnapshotPrivacy {
  readonly exposesStorePath: false
  readonly exposesServiceBinaryPath: false
  readonly exposesSecrets: false
  readonly exposesRawStorageClient: false
  readonly exposesRendererMutationApi: false
}

export interface ProductAppLocalSettingsCommands {
  readSettings(): ProductAppSettingsReadModel
  selectSession(
    request: ProductAppSelectSessionRequest
  ): Promise<ProductAppStateSnapshot>
  setLayout(request: ProductAppSetLayoutRequest): Promise<ProductAppStateSnapshot>
  setMode(request: ProductAppSetModeRequest): Promise<ProductAppStateSnapshot>
  updatePreferences(
    request: ProductAppUpdatePreferencesRequest
  ): Promise<ProductAppStateSnapshot>
}

export interface ProductAppLocalProviderSetupCommands {
  configureProviderProfile(
    request: ProductAppLocalConfigureProviderProfileRequest
  ): Promise<ProductAppLocalConfigureProviderProfileResult>
}

export interface ProductAppLocalConfigureProviderProfileRequest
  extends ProductAppLocalProviderProfileOptions {
  readonly makeActive?: boolean
}

export interface ProductAppLocalConfigureProviderProfileResult {
  readonly kind: "product-app-local.provider-setup.configured"
  readonly profile: ProductAppProviderProfileReadModel
  readonly readiness: ProductAppProviderReadinessReadModel
}
