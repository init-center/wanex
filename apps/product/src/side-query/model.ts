import type { BackendSafeError } from "@wanex/product/backend"

export type SideQueryState =
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"

export interface StartSideQueryRequest {
  readonly question: string
  readonly maxOutputTokens?: number
}

export interface ReadSideQueryRequest {
  readonly queryId: string
}

export interface CancelSideQueryRequest {
  readonly queryId: string
}

export interface DismissSideQueryRequest {
  readonly queryId: string
}

export interface SideQueryReadModel {
  readonly kind: "product.side-query"
  readonly queryId: string
  readonly sessionId: string
  readonly modelEndpointId: string
  readonly state: SideQueryState
  readonly question: string
  readonly maxOutputTokens?: number
  readonly answerText?: string
  readonly answerTruncated?: boolean
  readonly error?: BackendSafeError
  readonly startedAt: number
  readonly updatedAt: number
  readonly finishedAt?: number
}

export type ReadSideQueryResult =
  | {
      readonly kind: "product.side-query.found"
      readonly query: SideQueryReadModel
    }
  | {
      readonly kind: "product.side-query.missing"
      readonly queryId: string
    }

export interface DismissSideQueryResult {
  readonly kind: "product.side-query.dismissed"
  readonly queryId: string
}

export type SideQueryInvalidationCause =
  | "started"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "dismissed"

export interface SideQueryInvalidatedEvent {
  readonly kind: "product.side-query.invalidated"
  readonly sequence: number
  readonly at: number
  readonly queryId: string
  readonly cause: SideQueryInvalidationCause
}

export type SideQueryEventListener = (
  event: SideQueryInvalidatedEvent
) => void

export type SideQueryEventUnsubscribe = () => void

export interface SideQueryEvents {
  subscribeSideQueryEvents(
    listener: SideQueryEventListener
  ): SideQueryEventUnsubscribe
}
