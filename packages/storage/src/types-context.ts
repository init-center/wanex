import type {
  ActivateContextEpochRequest,
  CloneContextEpochRequest,
  ContextEpochPruneReceipt,
  ContextEpochRecord,
  ContextReplacementRecord,
  GetActiveContextEpochRequest,
  ListContextEpochsRequest,
  ListContextReplacementsRequest,
  PruneContextEpochsRequest,
  PutContextEpochRequest,
  PutContextReplacementRequest
} from "@wanex/protocol"

export interface ContextStore {
  putContextEpoch(request: PutContextEpochRequest): Promise<ContextEpochRecord>
  activateContextEpoch(
    request: ActivateContextEpochRequest
  ): Promise<ContextEpochRecord>
  cloneContextEpoch(
    request: CloneContextEpochRequest
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
  putContextReplacement(
    request: PutContextReplacementRequest
  ): Promise<ContextReplacementRecord>
  listContextReplacements(
    request: ListContextReplacementsRequest
  ): Promise<ContextReplacementRecord[]>
}
