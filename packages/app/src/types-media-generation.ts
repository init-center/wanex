import type {
  MediaGenerationOperationRecord,
  MediaGenerationOperationState
} from "@wanex/protocol"
import type { SubmitMediaGenerationRequest } from "@wanex/runtime/media-generation"

export interface WanexAppMediaGenerationCommands {
  submitMediaGeneration(
    request: WanexAppSubmitMediaGenerationRequest
  ): Promise<WanexAppMediaGenerationReceipt>
  readMediaGenerationOperation(
    request: WanexAppReadMediaGenerationOperationRequest
  ): Promise<WanexAppMediaGenerationReadResult>
  cancelMediaGeneration(
    request: WanexAppCancelMediaGenerationRequest
  ): Promise<WanexAppCancelMediaGenerationReceipt>
}

export type WanexAppSubmitMediaGenerationRequest = Omit<
  SubmitMediaGenerationRequest,
  "modelEndpoint"
>

export interface WanexAppMediaGenerationReceipt {
  readonly operationId: string
  readonly jobId: string
  readonly state: MediaGenerationOperationState
  readonly submittedAt: number
}

export interface WanexAppReadMediaGenerationOperationRequest {
  readonly operationId: string
}

export type WanexAppMediaGenerationReadResult =
  | WanexAppMediaGenerationFoundResult
  | WanexAppMediaGenerationMissingResult

export interface WanexAppMediaGenerationFoundResult {
  readonly kind: "found"
  readonly operation: MediaGenerationOperationRecord
}

export interface WanexAppMediaGenerationMissingResult {
  readonly kind: "missing"
  readonly operationId: string
}

export interface WanexAppCancelMediaGenerationRequest {
  readonly operationId: string
  readonly reason: string
}

export interface WanexAppCancelMediaGenerationReceipt {
  readonly operationId: string
  readonly status:
    | "missing"
    | "cancel_requested"
    | "cancelled"
    | "already_terminal"
  readonly state?: MediaGenerationOperationState
}
