import type {
  GetWorkspaceChangeProposalRequest,
  GetWorkspaceChangeSetRequest,
  ListWorkspaceChangeOperationsRequest,
  ListWorkspaceChangeProposalOperationsRequest,
  ListWorkspaceChangeProposalsRequest,
  ListWorkspaceChangeSetsRequest,
  PutWorkspaceChangeProposalRequest,
  PutWorkspaceChangeSetRequest,
  RecordWorkspaceChangeOperationRequest,
  RecordWorkspaceChangeProposalOperationRequest,
  WorkspaceChangeOperationRecord,
  WorkspaceChangeProposalOperationRecord,
  WorkspaceChangeProposalRecord,
  WorkspaceChangeSetRecord
} from "@wanex/protocol"

import {
  fromRpcWorkspaceChangeOperationRecord,
  fromRpcWorkspaceChangeProposalOperationRecord,
  fromRpcWorkspaceChangeProposalRecord,
  fromRpcWorkspaceChangeSetRecord,
  toRpcListWorkspaceChangeOperationsRequest,
  toRpcListWorkspaceChangeProposalOperationsRequest,
  toRpcListWorkspaceChangeProposalsRequest,
  toRpcListWorkspaceChangeSetsRequest,
  toRpcPutWorkspaceChangeProposalRequest,
  toRpcPutWorkspaceChangeSetRequest,
  toRpcRecordWorkspaceChangeOperationRequest,
  toRpcRecordWorkspaceChangeProposalOperationRequest
} from "./codec-workspace.js"
import { assertArray } from "./codec-helpers.js"
import { RpcStoreFacetBase } from "./rpc-store-base.js"
import type { WorkspaceStorageRpcCommand } from "./generated/storage-rpc.js"

export class WorkspaceStoreMethods extends RpcStoreFacetBase {
  async putWorkspaceChangeSet(
    request: PutWorkspaceChangeSetRequest
  ): Promise<WorkspaceChangeSetRecord> {
    const value = await this.callWorkspace({
      command: "put-workspace-change-set",
      request: toRpcPutWorkspaceChangeSetRequest(request)
    })
    return fromRpcWorkspaceChangeSetRecord(value)
  }

  async getWorkspaceChangeSet(
    request: GetWorkspaceChangeSetRequest
  ): Promise<WorkspaceChangeSetRecord | null> {
    const value = await this.callWorkspace({
      command: "get-workspace-change-set",
      change_set_id: request.changeSetId
    })
    return value === null ? null : fromRpcWorkspaceChangeSetRecord(value)
  }

  async listWorkspaceChangeSets(
    request: ListWorkspaceChangeSetsRequest
  ): Promise<WorkspaceChangeSetRecord[]> {
    const value = await this.callWorkspace({
      command: "list-workspace-change-sets",
      request: toRpcListWorkspaceChangeSetsRequest(request)
    })
    assertArray(value, "workspace changesets")
    return value.map(fromRpcWorkspaceChangeSetRecord)
  }

  async recordWorkspaceChangeOperation(
    request: RecordWorkspaceChangeOperationRequest
  ): Promise<WorkspaceChangeOperationRecord> {
    const value = await this.callWorkspace({
      command: "record-workspace-change-operation",
      request: toRpcRecordWorkspaceChangeOperationRequest(request)
    })
    return fromRpcWorkspaceChangeOperationRecord(value)
  }

  async listWorkspaceChangeOperations(
    request: ListWorkspaceChangeOperationsRequest
  ): Promise<WorkspaceChangeOperationRecord[]> {
    const value = await this.callWorkspace({
      command: "list-workspace-change-operations",
      request: toRpcListWorkspaceChangeOperationsRequest(request)
    })
    assertArray(value, "workspace change operations")
    return value.map(fromRpcWorkspaceChangeOperationRecord)
  }

  async putWorkspaceChangeProposal(
    request: PutWorkspaceChangeProposalRequest
  ): Promise<WorkspaceChangeProposalRecord> {
    const value = await this.callWorkspace({
      command: "put-workspace-change-proposal",
      request: toRpcPutWorkspaceChangeProposalRequest(request)
    })
    return fromRpcWorkspaceChangeProposalRecord(value)
  }

  async getWorkspaceChangeProposal(
    request: GetWorkspaceChangeProposalRequest
  ): Promise<WorkspaceChangeProposalRecord | null> {
    const value = await this.callWorkspace({
      command: "get-workspace-change-proposal",
      proposal_id: request.proposalId
    })
    return value === null ? null : fromRpcWorkspaceChangeProposalRecord(value)
  }

  async listWorkspaceChangeProposals(
    request: ListWorkspaceChangeProposalsRequest
  ): Promise<WorkspaceChangeProposalRecord[]> {
    const value = await this.callWorkspace({
      command: "list-workspace-change-proposals",
      request: toRpcListWorkspaceChangeProposalsRequest(request)
    })
    assertArray(value, "workspace change proposals")
    return value.map(fromRpcWorkspaceChangeProposalRecord)
  }

  async recordWorkspaceChangeProposalOperation(
    request: RecordWorkspaceChangeProposalOperationRequest
  ): Promise<WorkspaceChangeProposalOperationRecord> {
    const value = await this.callWorkspace({
      command: "record-workspace-change-proposal-operation",
      request: toRpcRecordWorkspaceChangeProposalOperationRequest(request)
    })
    return fromRpcWorkspaceChangeProposalOperationRecord(value)
  }

  async listWorkspaceChangeProposalOperations(
    request: ListWorkspaceChangeProposalOperationsRequest
  ): Promise<WorkspaceChangeProposalOperationRecord[]> {
    const value = await this.callWorkspace({
      command: "list-workspace-change-proposal-operations",
      request: toRpcListWorkspaceChangeProposalOperationsRequest(request)
    })
    assertArray(value, "workspace change proposal operations")
    return value.map(fromRpcWorkspaceChangeProposalOperationRecord)
  }

  private callWorkspace(request: WorkspaceStorageRpcCommand) {
    return this.call(request)
  }
}
