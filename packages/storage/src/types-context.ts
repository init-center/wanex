import type {
  ActivateContextEpochRequest,
  BeginContextEpochRequest,
  ContextEpochPruneReceipt,
  ContextEpochRecord,
  FinishContextEpochGenerationRequest,
  GetActiveContextEpochRequest,
  ListContextEpochsRequest,
  MarkContextEpochDispatchedRequest,
  MarkContextEpochOutputObservedRequest,
  PruneContextEpochsRequest
} from "@wanex/protocol"

export interface ContextStore {
  beginContextEpoch(request: BeginContextEpochRequest): Promise<ContextEpochRecord>
  markContextEpochDispatched(
    request: MarkContextEpochDispatchedRequest
  ): Promise<ContextEpochRecord>
  markContextEpochOutputObserved(
    request: MarkContextEpochOutputObservedRequest
  ): Promise<ContextEpochRecord>
  finishContextEpochGeneration(
    request: FinishContextEpochGenerationRequest
  ): Promise<ContextEpochRecord>
  activateContextEpoch(
    request: ActivateContextEpochRequest
  ): Promise<ContextEpochRecord>
  pruneContextEpochs(
    request: PruneContextEpochsRequest
  ): Promise<ContextEpochPruneReceipt>
  listContextEpochs(
    request: ListContextEpochsRequest
  ): Promise<ContextEpochRecord[]>
  getActiveContextEpoch(
    request: GetActiveContextEpochRequest
  ): Promise<ContextEpochRecord | null>
}
