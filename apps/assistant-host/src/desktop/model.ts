import type {
  ApplicationResponse
} from "@wanex/assistant-ui"
import type {
  ModelEndpointListReadModel,
  ModelEndpointReadModel
} from "@wanex/assistant"
import type {
  AssistantHostSnapshot,
  AssistantWebApp,
  StartAssistantWebAppOptions
} from "../model.js"

export const DESKTOP_MAIN_REQUEST_KIND =
  "desktop.request"
export const DESKTOP_MAIN_RESPONSE_KIND =
  "desktop.response"

export type StartDesktopMainHostOptions =
  StartAssistantWebAppOptions

export interface DesktopMainHost {
  readonly kind: "desktop.host"
  readonly url: string
  readonly settings: AssistantWebApp["settings"]
  readonly modelEndpoints: AssistantWebApp["modelEndpoints"]
  readonly mcpSettings: AssistantWebApp["mcpSettings"]
  readonly providers: AssistantWebApp["providers"]
  readonly modelCatalog: AssistantWebApp["modelCatalog"]
  readonly attachments: AssistantWebApp["attachments"]
  readonly resourceDeliveries: AssistantWebApp["resourceDeliveries"]
  readSnapshot(): Promise<DesktopMainSnapshot>
  handleWebRequest(request: unknown): Promise<ApplicationResponse>
  handleRequest(request: unknown): Promise<DesktopMainResponse>
  close(): Promise<void>
}

export type DesktopMainRequest =
  | DesktopMainSnapshotRequest
  | DesktopMainWebRequest
  | DesktopMainListModelEndpointsRequest
  | DesktopMainSetActiveModelEndpointRequest

export interface DesktopMainRequestBase {
  readonly kind: typeof DESKTOP_MAIN_REQUEST_KIND
  readonly operation: DesktopMainOperation
  readonly requestId?: string
}

export type DesktopMainOperation =
  | "snapshot"
  | "webRequest"
  | "listModelEndpoints"
  | "setActiveModelEndpoint"

export interface DesktopMainSnapshotRequest
  extends DesktopMainRequestBase {
  readonly operation: "snapshot"
}

export interface DesktopMainWebRequest
  extends DesktopMainRequestBase {
  readonly operation: "webRequest"
  readonly request: unknown
}

export interface DesktopMainListModelEndpointsRequest
  extends DesktopMainRequestBase {
  readonly operation: "listModelEndpoints"
}

export interface DesktopMainSetActiveModelEndpointRequest
  extends DesktopMainRequestBase {
  readonly operation: "setActiveModelEndpoint"
  readonly input: {
    readonly endpointId: string
  }
}

export type DesktopMainResponse =
  | DesktopMainSnapshotResponse
  | DesktopMainWebResponse
  | DesktopMainModelEndpointsResponse
  | DesktopMainModelEndpointResponse
  | DesktopMainErrorResponse

export interface DesktopMainResponseBase {
  readonly kind: typeof DESKTOP_MAIN_RESPONSE_KIND
  readonly ok: boolean
  readonly operation?: string
  readonly requestId?: string
}

export interface DesktopMainSnapshotResponse
  extends DesktopMainResponseBase {
  readonly ok: true
  readonly operation: "snapshot"
  readonly snapshot: DesktopMainSnapshot
}

export interface DesktopMainWebResponse
  extends DesktopMainResponseBase {
  readonly ok: true
  readonly operation: "webRequest"
  readonly webResponse: ApplicationResponse
}

export interface DesktopMainModelEndpointsResponse
  extends DesktopMainResponseBase {
  readonly ok: true
  readonly operation: "listModelEndpoints"
  readonly modelEndpoints: DesktopModelEndpointsReadModel
}

export interface DesktopMainModelEndpointResponse
  extends DesktopMainResponseBase {
  readonly ok: true
  readonly operation: "setActiveModelEndpoint"
  readonly modelEndpoint: DesktopModelEndpointReadModel
}

export type DesktopModelEndpointsReadModel =
  ModelEndpointListReadModel

export type DesktopModelEndpointReadModel =
  ModelEndpointReadModel

export interface DesktopMainErrorResponse
  extends DesktopMainResponseBase {
  readonly ok: false
  readonly error: DesktopMainRequestError
}

export interface DesktopMainRequestError {
  readonly code: DesktopMainRequestErrorCode
  readonly message: string
  readonly field?: string
}

export type DesktopMainRequestErrorCode =
  | "invalid_request"
  | "unknown_operation"
  | "host_error"

export interface DesktopMainSnapshot {
  readonly kind: "desktop.snapshot"
  readonly url: string
  readonly local: AssistantHostSnapshot
  readonly privacy: DesktopMainSnapshotPrivacy
}

export interface DesktopMainSnapshotPrivacy {
  readonly exposesStorePath: false
  readonly exposesServiceBinaryPath: false
  readonly exposesSecrets: false
  readonly exposesRawStorageClient: false
  readonly exposesRendererMutationApi: false
}
