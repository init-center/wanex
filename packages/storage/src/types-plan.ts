import type {
  GetPlanProposalRequest,
  ListPlanProposalOperationsRequest,
  ListPlanProposalsRequest,
  PlanProposalOperationRecord,
  PlanProposalRecord,
  PutPlanProposalRequest,
  RecordPlanProposalOperationRequest
} from "@wanex/protocol"

export interface PlanStore {
  putPlanProposal(request: PutPlanProposalRequest): Promise<PlanProposalRecord>
  getPlanProposal(
    request: GetPlanProposalRequest
  ): Promise<PlanProposalRecord | null>
  listPlanProposals(
    request: ListPlanProposalsRequest
  ): Promise<PlanProposalRecord[]>
  recordPlanProposalOperation(
    request: RecordPlanProposalOperationRequest
  ): Promise<PlanProposalOperationRecord>
  listPlanProposalOperations(
    request: ListPlanProposalOperationsRequest
  ): Promise<PlanProposalOperationRecord[]>
}
