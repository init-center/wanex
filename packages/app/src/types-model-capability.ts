import type {
  ModelCapabilityRequirement,
  ModelOperation
} from "@wanex/protocol"
import type { WanexAppModelEndpointReadModel } from "./types-model-endpoint.js"

export type WanexAppRoutableModelOperation = Exclude<
  ModelOperation,
  "conversation"
>

export interface WanexAppModelCapabilityCommands {
  listModelCapabilityRoutes(): Promise<WanexAppModelCapabilityRouteListReadModel>
  setModelCapabilityRoute(
    request: WanexAppSetModelCapabilityRouteRequest
  ): Promise<WanexAppModelCapabilityReadinessReadModel>
  clearModelCapabilityRoute(
    request: WanexAppClearModelCapabilityRouteRequest
  ): Promise<WanexAppModelCapabilityReadinessReadModel>
  readModelCapabilityReadiness(
    request: WanexAppReadModelCapabilityReadinessRequest
  ): Promise<WanexAppModelCapabilityReadinessReadModel>
}

export interface WanexAppModelCapabilityRoute {
  readonly operation: WanexAppRoutableModelOperation
  readonly modelEndpointId: string
}

export interface WanexAppModelCapabilityRouteListReadModel {
  readonly routes: readonly WanexAppModelCapabilityRoute[]
}

export interface WanexAppSetModelCapabilityRouteRequest {
  readonly operation: WanexAppRoutableModelOperation
  readonly modelEndpointId: string
}

export interface WanexAppClearModelCapabilityRouteRequest {
  readonly operation: WanexAppRoutableModelOperation
}

export interface WanexAppReadModelCapabilityReadinessRequest {
  readonly requirement: ModelCapabilityRequirement
}

export type WanexAppModelCapabilityReadinessStatus =
  | "ready"
  | "unconfigured"
  | "selection_required"
  | "configured_endpoint_missing"
  | "configured_endpoint_ineligible"
  | "configured_endpoint_unavailable"
  | "executor_unavailable"

export interface WanexAppModelCapabilityReadinessReadModel {
  readonly requirement: ModelCapabilityRequirement
  readonly status: WanexAppModelCapabilityReadinessStatus
  readonly reason: string
  readonly candidates: readonly WanexAppModelEndpointReadModel[]
  readonly candidatesTruncated: boolean
  readonly selectedEndpoint?: WanexAppModelEndpointReadModel
  readonly selectedSource?: "configured" | "single_candidate"
  readonly recommendedModelEndpointId?: string
}
