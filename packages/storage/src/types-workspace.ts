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

export interface WorkspaceStore {
  putWorkspaceChangeSet(
    request: PutWorkspaceChangeSetRequest
  ): Promise<WorkspaceChangeSetRecord>
  getWorkspaceChangeSet(
    request: GetWorkspaceChangeSetRequest
  ): Promise<WorkspaceChangeSetRecord | null>
  listWorkspaceChangeSets(
    request: ListWorkspaceChangeSetsRequest
  ): Promise<WorkspaceChangeSetRecord[]>
  recordWorkspaceChangeOperation(
    request: RecordWorkspaceChangeOperationRequest
  ): Promise<WorkspaceChangeOperationRecord>
  listWorkspaceChangeOperations(
    request: ListWorkspaceChangeOperationsRequest
  ): Promise<WorkspaceChangeOperationRecord[]>
  putWorkspaceChangeProposal(
    request: PutWorkspaceChangeProposalRequest
  ): Promise<WorkspaceChangeProposalRecord>
  getWorkspaceChangeProposal(
    request: GetWorkspaceChangeProposalRequest
  ): Promise<WorkspaceChangeProposalRecord | null>
  listWorkspaceChangeProposals(
    request: ListWorkspaceChangeProposalsRequest
  ): Promise<WorkspaceChangeProposalRecord[]>
  recordWorkspaceChangeProposalOperation(
    request: RecordWorkspaceChangeProposalOperationRequest
  ): Promise<WorkspaceChangeProposalOperationRecord>
  listWorkspaceChangeProposalOperations(
    request: ListWorkspaceChangeProposalOperationsRequest
  ): Promise<WorkspaceChangeProposalOperationRecord[]>
}
