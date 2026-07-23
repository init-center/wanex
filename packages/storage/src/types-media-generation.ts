import type {
  AcceptMediaGenerationOperationRequest,
  BeginMediaGenerationOperationRequest,
  CompleteMediaGenerationOperationRequest,
  CheckpointMediaGenerationOperationRequest,
  GetMediaGenerationOperationRequest,
  ListMediaGenerationOperationsRequest,
  MediaGenerationBeginReceipt,
  MediaGenerationOperationRecord,
  MediaGenerationOperationSubmission,
  RecordMediaGenerationOutputsRequest,
  RequestMediaGenerationCancelRequest,
  SettleMediaGenerationOperationRequest,
  SubmitMediaGenerationOperationRequest
} from "@wanex/protocol"

export interface MediaGenerationStore {
  submitMediaGenerationOperation(
    request: SubmitMediaGenerationOperationRequest
  ): Promise<MediaGenerationOperationSubmission>
  beginMediaGenerationOperation(
    request: BeginMediaGenerationOperationRequest
  ): Promise<MediaGenerationBeginReceipt | null>
  acceptMediaGenerationOperation(
    request: AcceptMediaGenerationOperationRequest
  ): Promise<MediaGenerationOperationRecord | null>
  checkpointMediaGenerationOperation(
    request: CheckpointMediaGenerationOperationRequest
  ): Promise<MediaGenerationOperationRecord | null>
  recordMediaGenerationOutputs(
    request: RecordMediaGenerationOutputsRequest
  ): Promise<MediaGenerationOperationRecord | null>
  completeMediaGenerationOperation(
    request: CompleteMediaGenerationOperationRequest
  ): Promise<MediaGenerationOperationRecord | null>
  settleMediaGenerationOperation(
    request: SettleMediaGenerationOperationRequest
  ): Promise<MediaGenerationOperationRecord | null>
  requestMediaGenerationCancel(
    request: RequestMediaGenerationCancelRequest
  ): Promise<MediaGenerationOperationRecord | null>
  getMediaGenerationOperation(
    request: GetMediaGenerationOperationRequest
  ): Promise<MediaGenerationOperationRecord | null>
  listMediaGenerationOperations(
    request: ListMediaGenerationOperationsRequest
  ): Promise<MediaGenerationOperationRecord[]>
}
