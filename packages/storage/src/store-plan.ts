import type {
  GetPlanProposalRequest,
  ListPlanProposalOperationsRequest,
  ListPlanProposalsRequest,
  PlanProposalOperationRecord,
  PlanProposalRecord,
  PutPlanProposalRequest,
  RecordPlanProposalOperationRequest
} from "@wanex/protocol"

import {
  fromRpcPlanProposalOperationRecord,
  fromRpcPlanProposalRecord,
  toRpcListPlanProposalOperationsRequest,
  toRpcListPlanProposalsRequest,
  toRpcPutPlanProposalRequest,
  toRpcRecordPlanProposalOperationRequest
} from "./codec-plan.js"
import { assertArray } from "./codec-helpers.js"
import { RpcStoreFacetBase } from "./rpc-store-base.js"
import type { PlanStorageRpcCommand } from "./generated/storage-rpc.js"

export class PlanStoreMethods extends RpcStoreFacetBase {
  async putPlanProposal(
    request: PutPlanProposalRequest
  ): Promise<PlanProposalRecord> {
    const value = await this.callPlan({
      command: "put-plan-proposal",
      request: toRpcPutPlanProposalRequest(request)
    })
    return fromRpcPlanProposalRecord(value)
  }

  async getPlanProposal(
    request: GetPlanProposalRequest
  ): Promise<PlanProposalRecord | null> {
    const value = await this.callPlan({
      command: "get-plan-proposal",
      proposal_id: request.proposalId
    })
    return value === null ? null : fromRpcPlanProposalRecord(value)
  }

  async listPlanProposals(
    request: ListPlanProposalsRequest
  ): Promise<PlanProposalRecord[]> {
    const value = await this.callPlan({
      command: "list-plan-proposals",
      request: toRpcListPlanProposalsRequest(request)
    })
    assertArray(value, "plan proposals")
    return value.map(fromRpcPlanProposalRecord)
  }

  async recordPlanProposalOperation(
    request: RecordPlanProposalOperationRequest
  ): Promise<PlanProposalOperationRecord> {
    const value = await this.callPlan({
      command: "record-plan-proposal-operation",
      request: toRpcRecordPlanProposalOperationRequest(request)
    })
    return fromRpcPlanProposalOperationRecord(value)
  }

  async listPlanProposalOperations(
    request: ListPlanProposalOperationsRequest
  ): Promise<PlanProposalOperationRecord[]> {
    const value = await this.callPlan({
      command: "list-plan-proposal-operations",
      request: toRpcListPlanProposalOperationsRequest(request)
    })
    assertArray(value, "plan proposal operations")
    return value.map(fromRpcPlanProposalOperationRecord)
  }

  private callPlan(request: PlanStorageRpcCommand) {
    return this.call(request)
  }
}
