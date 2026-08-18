import type {
  CreatePlanProposalRequest,
  ExecuteApprovedPlanReceipt,
  ExecuteApprovedPlanRequest,
  GetPlanProposalRequest,
  ListPlanProposalOperationsRequest,
  ListPlanProposalsRequest,
  PlanProposalOperationRecord,
  PlanProposalRecord,
  RecordPlanProposalOperationRequest
} from "@wanex/protocol"

export interface PlanStore {
  createPlanProposal(
    request: CreatePlanProposalRequest
  ): Promise<PlanProposalRecord>
  getPlanProposal(
    request: GetPlanProposalRequest
  ): Promise<PlanProposalRecord | null>
  listPlanProposals(
    request: ListPlanProposalsRequest
  ): Promise<PlanProposalRecord[]>
  recordPlanProposalOperation(
    request: RecordPlanProposalOperationRequest
  ): Promise<PlanProposalOperationRecord>
  executeApprovedPlan(
    request: ExecuteApprovedPlanRequest
  ): Promise<ExecuteApprovedPlanReceipt>
  listPlanProposalOperations(
    request: ListPlanProposalOperationsRequest
  ): Promise<PlanProposalOperationRecord[]>
}
