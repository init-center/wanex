import type {
  HomeOptions
} from "@wanex/assistant/surface"
import type { Action } from "./actions.js"
import type { ActionResult, Snapshot } from "./view.js"

export type RequestOperation =
  | "snapshot"
  | "refresh"
  | "reconcileEvents"
  | "dispatchAction"

export type Request =
  | SnapshotRequest
  | RefreshRequest
  | ReconcileEventsRequest
  | DispatchActionRequest

export interface RequestBase {
  readonly kind: "web.request"
  readonly operation: RequestOperation
  readonly requestId?: string
}

export interface SnapshotRequest extends RequestBase {
  readonly operation: "snapshot"
}

export interface RefreshRequest extends RequestBase {
  readonly operation: "refresh"
  readonly homeOptions?: HomeOptions
}

export interface ReconcileEventsRequest extends RequestBase {
  readonly operation: "reconcileEvents"
  readonly options?: ReconcileEventsOptions
}

export interface DispatchActionRequest extends RequestBase {
  readonly operation: "dispatchAction"
  readonly action: Action
}

export type ApplicationResponse =
  | SnapshotResponse
  | DispatchActionResponse
  | RequestErrorResponse

export interface SnapshotResponse {
  readonly kind: "web.response"
  readonly ok: true
  readonly operation: Exclude<
    RequestOperation,
    "dispatchAction"
  >
  readonly requestId?: string
  readonly snapshot: Snapshot
}

export interface DispatchActionResponse {
  readonly kind: "web.response"
  readonly ok: true
  readonly operation: "dispatchAction"
  readonly requestId?: string
  readonly actionResult: ActionResult
}

export interface RequestErrorResponse {
  readonly kind: "web.response"
  readonly ok: false
  readonly operation?: string
  readonly requestId?: string
  readonly error: RequestError
  readonly snapshot: Snapshot
}

export interface RequestError {
  readonly code: RequestErrorCode
  readonly message: string
  readonly field?: string
}

export type RequestErrorCode =
  | "invalid_request"
  | "unknown_operation"

export interface ReconcileEventsOptions {
  readonly limit?: number
}
