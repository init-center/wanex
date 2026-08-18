import type {
  ExecuteApprovedPlanReceipt,
  PlanProposalOperationRecord,
  PlanProposalRecord
} from "@wanex/protocol"
import type {
  DecidePlanProposalRequest,
  ExecutePlanProposalRequest,
  GeneratePlanProposalRequest,
  ListPlanProposalsRuntimeRequest,
  PlanProposalHistory,
  PlanProposalView,
  RevisePlanProposalRequest
} from "./workflows/plan/types.js"

export interface WanexAppPlanCommands {
  generatePlanProposal(
    request: WanexAppGeneratePlanProposalRequest
  ): Promise<PlanProposalRecord>
  revisePlanProposal(
    request: WanexAppRevisePlanProposalRequest
  ): Promise<PlanProposalOperationRecord>
  approvePlanProposal(
    request: WanexAppDecidePlanProposalRequest
  ): Promise<PlanProposalOperationRecord>
  rejectPlanProposal(
    request: WanexAppDecidePlanProposalRequest
  ): Promise<PlanProposalOperationRecord>
  withdrawPlanProposal(
    request: WanexAppDecidePlanProposalRequest
  ): Promise<PlanProposalOperationRecord>
  executePlanProposal(
    request: WanexAppExecutePlanProposalRequest
  ): Promise<ExecuteApprovedPlanReceipt>
  readPlanProposal(
    request: WanexAppReadPlanProposalRequest
  ): Promise<PlanProposalView | null>
  listPlanProposals(
    request?: WanexAppListPlanProposalsRequest
  ): Promise<PlanProposalRecord[]>
  readPlanProposalHistory(
    request: WanexAppReadPlanProposalRequest
  ): Promise<PlanProposalHistory | null>
}

export type WanexAppGeneratePlanProposalRequest = Omit<
  GeneratePlanProposalRequest,
  "modelEndpointId"
>

export type WanexAppRevisePlanProposalRequest = RevisePlanProposalRequest
export type WanexAppDecidePlanProposalRequest = DecidePlanProposalRequest

export type WanexAppExecutePlanProposalRequest = Omit<
  ExecutePlanProposalRequest,
  "modelEndpointId"
>

export interface WanexAppReadPlanProposalRequest {
  readonly proposalId: string
}

export type WanexAppListPlanProposalsRequest = ListPlanProposalsRuntimeRequest

export type WanexAppPlanProposalView = PlanProposalView
export type WanexAppPlanProposalHistory = PlanProposalHistory
