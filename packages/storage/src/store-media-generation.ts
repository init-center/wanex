import type {
  AcceptMediaGenerationOperationRequest,
  BeginMediaGenerationOperationRequest,
  CheckpointMediaGenerationOperationRequest,
  CompleteMediaGenerationOperationRequest,
  GetMediaGenerationOperationRequest,
  ListMediaGenerationOperationsRequest,
  RecordMediaGenerationOutputsRequest,
  RequestMediaGenerationCancelRequest,
  SettleMediaGenerationOperationRequest,
  SubmitMediaGenerationOperationRequest
} from "@wanex/protocol"
import {
  fromRpcMediaGenerationBeginReceipt,
  fromRpcMediaGenerationOperation,
  fromRpcMediaGenerationOperationSubmission,
  toRpcAcceptMediaGenerationOperationRequest,
  toRpcBeginMediaGenerationOperationRequest,
  toRpcCheckpointMediaGenerationOperationRequest,
  toRpcCompleteMediaGenerationOperationRequest,
  toRpcGetMediaGenerationOperationRequest,
  toRpcListMediaGenerationOperationsRequest,
  toRpcRecordMediaGenerationOutputsRequest,
  toRpcRequestMediaGenerationCancelRequest,
  toRpcSettleMediaGenerationOperationRequest,
  toRpcSubmitMediaGenerationOperationRequest
} from "./codec-media-generation.js"
import { assertArray } from "./codec-helpers.js"
import { RpcStoreFacetBase } from "./rpc-store-base.js"
import type { MediaGenerationStorageRpcCommand } from "./generated/storage-rpc.js"
import type { MediaGenerationStore } from "./types-media-generation.js"

export class MediaGenerationStoreMethods
  extends RpcStoreFacetBase
  implements MediaGenerationStore {
  async submitMediaGenerationOperation(request: SubmitMediaGenerationOperationRequest) {
    const value = await this.callMediaGeneration({
      command: "submit-media-generation",
      request: toRpcSubmitMediaGenerationOperationRequest(request)
    })
    return fromRpcMediaGenerationOperationSubmission(value)
  }

  async beginMediaGenerationOperation(request: BeginMediaGenerationOperationRequest) {
    const value = await this.callMediaGeneration({
      command: "begin-media-generation",
      request: toRpcBeginMediaGenerationOperationRequest(request)
    })
    return value === null ? null : fromRpcMediaGenerationBeginReceipt(value)
  }

  async acceptMediaGenerationOperation(request: AcceptMediaGenerationOperationRequest) {
    const value = await this.callMediaGeneration({
      command: "accept-media-generation",
      request: toRpcAcceptMediaGenerationOperationRequest(request)
    })
    return value === null ? null : fromRpcMediaGenerationOperation(value)
  }

  async checkpointMediaGenerationOperation(request: CheckpointMediaGenerationOperationRequest) {
    const value = await this.callMediaGeneration({
      command: "checkpoint-media-generation",
      request: toRpcCheckpointMediaGenerationOperationRequest(request)
    })
    return value === null ? null : fromRpcMediaGenerationOperation(value)
  }

  async recordMediaGenerationOutputs(request: RecordMediaGenerationOutputsRequest) {
    const value = await this.callMediaGeneration({
      command: "record-media-generation-outputs",
      request: toRpcRecordMediaGenerationOutputsRequest(request)
    })
    return value === null ? null : fromRpcMediaGenerationOperation(value)
  }

  async completeMediaGenerationOperation(request: CompleteMediaGenerationOperationRequest) {
    const value = await this.callMediaGeneration({
      command: "complete-media-generation",
      request: toRpcCompleteMediaGenerationOperationRequest(request)
    })
    return value === null ? null : fromRpcMediaGenerationOperation(value)
  }

  async settleMediaGenerationOperation(request: SettleMediaGenerationOperationRequest) {
    const value = await this.callMediaGeneration({
      command: "settle-media-generation",
      request: toRpcSettleMediaGenerationOperationRequest(request)
    })
    return value === null ? null : fromRpcMediaGenerationOperation(value)
  }

  async requestMediaGenerationCancel(request: RequestMediaGenerationCancelRequest) {
    const value = await this.callMediaGeneration({
      command: "request-media-generation-cancel",
      request: toRpcRequestMediaGenerationCancelRequest(request)
    })
    return value === null ? null : fromRpcMediaGenerationOperation(value)
  }

  async getMediaGenerationOperation(request: GetMediaGenerationOperationRequest) {
    const value = await this.callMediaGeneration({
      command: "get-media-generation",
      operation_id: request.operationId
    })
    return value === null ? null : fromRpcMediaGenerationOperation(value)
  }

  async listMediaGenerationOperations(request: ListMediaGenerationOperationsRequest) {
    const value = await this.callMediaGeneration({
      command: "list-media-generation",
      request: toRpcListMediaGenerationOperationsRequest(request)
    })
    assertArray(value, "media generation operations")
    return value.map(fromRpcMediaGenerationOperation)
  }

  private callMediaGeneration(request: MediaGenerationStorageRpcCommand) {
    return this.call(request)
  }
}
