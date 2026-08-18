import type {
  AcceptMediaGenerationOperationRequest,
  BeginMediaGenerationOperationRequest,
  CompleteMediaGenerationOperationRequest,
  GetMediaGenerationOperationRequest,
  ListMediaGenerationOperationsRequest,
  MediaGenerationBeginReceipt,
  MediaGenerationOperationRecord,
  MediaGenerationOperationSubmission,
  MediaGenerationSuspendReceipt,
  RecordMediaGenerationOutputsRequest,
  RequestMediaGenerationCancelRequest,
  SettleMediaGenerationOperationRequest,
  SuspendMediaGenerationOperationRequest,
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
  suspendMediaGenerationOperation(
    request: SuspendMediaGenerationOperationRequest
  ): Promise<MediaGenerationSuspendReceipt | null>
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
