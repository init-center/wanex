import type {
  ProductAppWebResponse
} from "@wanex/product-app-web"
import type {
  ProductAppProviderProfileListReadModel,
  ProductAppProviderProfileReadModel
} from "@wanex/product-app"
import type {
  ProductAppLocalSnapshot,
  ProductAppLocalWebApp,
  StartProductAppLocalWebAppOptions
} from "./types.js"

export const PRODUCT_APP_DESKTOP_MAIN_REQUEST_KIND =
  "product-app-desktop-main.request"
export const PRODUCT_APP_DESKTOP_MAIN_RESPONSE_KIND =
  "product-app-desktop-main.response"

export type StartProductAppDesktopMainHostOptions =
  StartProductAppLocalWebAppOptions

export interface ProductAppDesktopMainHost {
  readonly kind: "product-app-desktop-main.host"
  readonly url: string
  readonly settings: ProductAppLocalWebApp["settings"]
  readonly providerProfiles: ProductAppLocalWebApp["providerProfiles"]
  readonly providerSetup: ProductAppLocalWebApp["providerSetup"]
  readonly attachments: ProductAppLocalWebApp["attachments"]
  readSnapshot(): Promise<ProductAppDesktopMainSnapshot>
  handleWebRequest(request: unknown): Promise<ProductAppWebResponse>
  handleRequest(request: unknown): Promise<ProductAppDesktopMainResponse>
  close(): Promise<void>
}

export type ProductAppDesktopMainRequest =
  | ProductAppDesktopMainSnapshotRequest
  | ProductAppDesktopMainWebRequest
  | ProductAppDesktopMainListProviderProfilesRequest
  | ProductAppDesktopMainSetActiveProviderProfileRequest

export interface ProductAppDesktopMainRequestBase {
  readonly kind: typeof PRODUCT_APP_DESKTOP_MAIN_REQUEST_KIND
  readonly operation: ProductAppDesktopMainOperation
  readonly requestId?: string
}

export type ProductAppDesktopMainOperation =
  | "snapshot"
  | "webRequest"
  | "listProviderProfiles"
  | "setActiveProviderProfile"

export interface ProductAppDesktopMainSnapshotRequest
  extends ProductAppDesktopMainRequestBase {
  readonly operation: "snapshot"
}

export interface ProductAppDesktopMainWebRequest
  extends ProductAppDesktopMainRequestBase {
  readonly operation: "webRequest"
  readonly request: unknown
}

export interface ProductAppDesktopMainListProviderProfilesRequest
  extends ProductAppDesktopMainRequestBase {
  readonly operation: "listProviderProfiles"
}

export interface ProductAppDesktopMainSetActiveProviderProfileRequest
  extends ProductAppDesktopMainRequestBase {
  readonly operation: "setActiveProviderProfile"
  readonly input: {
    readonly profileId: string
  }
}

export type ProductAppDesktopMainResponse =
  | ProductAppDesktopMainSnapshotResponse
  | ProductAppDesktopMainWebResponse
  | ProductAppDesktopMainProviderProfilesResponse
  | ProductAppDesktopMainProviderProfileResponse
  | ProductAppDesktopMainErrorResponse

export interface ProductAppDesktopMainResponseBase {
  readonly kind: typeof PRODUCT_APP_DESKTOP_MAIN_RESPONSE_KIND
  readonly ok: boolean
  readonly operation?: string
  readonly requestId?: string
}

export interface ProductAppDesktopMainSnapshotResponse
  extends ProductAppDesktopMainResponseBase {
  readonly ok: true
  readonly operation: "snapshot"
  readonly snapshot: ProductAppDesktopMainSnapshot
}

export interface ProductAppDesktopMainWebResponse
  extends ProductAppDesktopMainResponseBase {
  readonly ok: true
  readonly operation: "webRequest"
  readonly webResponse: ProductAppWebResponse
}

export interface ProductAppDesktopMainProviderProfilesResponse
  extends ProductAppDesktopMainResponseBase {
  readonly ok: true
  readonly operation: "listProviderProfiles"
  readonly providerProfiles: ProductAppDesktopProviderProfilesReadModel
}

export interface ProductAppDesktopMainProviderProfileResponse
  extends ProductAppDesktopMainResponseBase {
  readonly ok: true
  readonly operation: "setActiveProviderProfile"
  readonly providerProfile: ProductAppDesktopProviderProfileReadModel
}

export type ProductAppDesktopProviderProfilesReadModel =
  ProductAppProviderProfileListReadModel

export type ProductAppDesktopProviderProfileReadModel =
  ProductAppProviderProfileReadModel

export interface ProductAppDesktopMainErrorResponse
  extends ProductAppDesktopMainResponseBase {
  readonly ok: false
  readonly error: ProductAppDesktopMainRequestError
}

export interface ProductAppDesktopMainRequestError {
  readonly code: ProductAppDesktopMainRequestErrorCode
  readonly message: string
  readonly field?: string
}

export type ProductAppDesktopMainRequestErrorCode =
  | "invalid_request"
  | "unknown_operation"
  | "host_error"

export interface ProductAppDesktopMainSnapshot {
  readonly kind: "product-app-desktop-main.snapshot"
  readonly url: string
  readonly local: ProductAppLocalSnapshot
  readonly privacy: ProductAppDesktopMainSnapshotPrivacy
}

export interface ProductAppDesktopMainSnapshotPrivacy {
  readonly exposesStorePath: false
  readonly exposesServiceBinaryPath: false
  readonly exposesSecrets: false
  readonly exposesRawStorageClient: false
  readonly exposesRendererMutationApi: false
}
