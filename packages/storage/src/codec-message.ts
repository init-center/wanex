import {
  type AdmissionReceipt,
  type AppendTeamTurnRequest,
  type BudgetGrantRecord,
  type BudgetLimit,
  type BudgetScopeRecord,
  type BudgetUsage,
  type AttachDelegationGraphNodeJobRequest,
  type CancelJobRequest,
  type ChannelBindingRecord,
  type ChannelBindingState,
  type ChannelDeliveryAcknowledgement,
  type ChannelDeliveryRecord,
  type ChannelDeliveryState,
  type ChannelDeliverySubmission,
  type ChannelInboundEventRecord,
  type ChannelInboundEventState,
  type ChannelProjectionReceipt,
  type ChannelProjectionRecord,
  type ChannelProjectionTargetKind,
  type ConnectorCredentialRecord,
  type ConnectorCredentialState,
  type ConnectorRegistrationRecord,
  type ConnectorRegistrationState,
  type ConnectorSessionRecord,
  type ConnectorSessionState,
  type ClaimJobRequest,
  type CompleteChannelDeliveryRequest,
  type FinishConnectorSessionRequest,
  type ContextReplacementTier,
  type CleanupExpiredResourceTicketsRequest,
  type CommitBudgetRequest,
  type CompleteJobRequest,
  type ContextReplacementRecord,
  type DelegationDependencyKind,
  type DelegationGraphDependencyRecord,
  type DelegationGraphNodeRecord,
  type DelegationGraphRecord,
  type DelegationGraphState,
  type DelegationNodeKind,
  type DelegationNodeState,
  type DoctorReport,
  type EnqueueJobRequest,
  type FailJobRequest,
  type FailChannelDeliveryRequest,
  type FileRecord,
  type GetPluginInstallRequest,
  type GetPluginManifestRequest,
  type GetResourceRequest,
  type GetDelegationGraphRequest,
  type GetWorkspaceChangeProposalRequest,
  type HeartbeatConnectorSessionRequest,
  type HeartbeatJobRequest,
  type IngestChannelInboundEventRequest,
  type IngestResourceRequest,
  type JsonValue,
  type GetWorkspaceChangeSetRequest,
  type ListContextReplacementsRequest,
  type ListDelegationGraphDependenciesRequest,
  type ListDelegationGraphNodesRequest,
  type ListDelegationGraphsRequest,
  type ListResourcesRequest,
  type ListReadyDelegationGraphNodesRequest,
  type MaterializeReadyDelegationGraphNodeRequest,
  type MaterializedDelegationGraphNode,
  type ListTeamConversationsRequest,
  type ListTeamParticipantsRequest,
  type ListTeamTurnsRequest,
  type ListWorkspaceChangeProposalOperationsRequest,
  type ListWorkspaceChangeProposalsRequest,
  type ListWorkspaceChangeOperationsRequest,
  type ListWorkspaceChangeSetsRequest,
  type ListJobsRequest,
  type ListChannelBindingsRequest,
  type ListChannelInboundEventsRequest,
  type ListChannelProjectionsRequest,
  type ListConnectorCredentialsRequest,
  type ListConnectorRegistrationsRequest,
  type ListConnectorSessionsRequest,
  type ListPluginInstallsRequest,
  type ListPluginManifestsRequest,
  type MessagePart,
  type ProviderState,
  type PluginActionSubmission,
  type PluginCapability,
  type PluginInstallRecord,
  type PluginInstallState,
  type PluginManifestRecord,
  type PluginManifestState,
  type QueryEventsInput,
  type ResourceKind,
  type ResourceOrigin,
  type ResourceRecord,
  type ResourceSource,
  type ResourceState,
  type ResourceTicketCleanupReceipt,
  type ResourceTicket,
  type ReserveBudgetRequest,
  type RuntimeEvent,
  type RunnerClaim,
  type SchedulerJobKind,
  type SchedulerJobRecord,
  type SchedulerJobState,
  type SubmitSessionRunReceipt,
  type SubmitChannelDeliveryRequest,
  type SubmitPluginActionRequest,
  type SubmitSessionRunRequest,
  type PutContextReplacementRequest,
  type PutChannelBindingRequest,
  type PutConnectorCredentialRequest,
  type PutConnectorRegistrationRequest,
  type ProjectChannelInboundEventRequest,
  type PutDelegationGraphDependencyRequest,
  type PutDelegationGraphNodeRequest,
  type PutDelegationGraphRequest,
  type PutPluginInstallRequest,
  type PutPluginManifestRequest,
  type PutTeamConversationRequest,
  type PutTeamParticipantRequest,
  type PutWorkspaceChangeProposalRequest,
  type SessionInputRecord,
  type SessionMessageRecord,
  type SessionRecord,
  type PutWorkspaceChangeSetRequest,
  type RecordWorkspaceChangeProposalOperationRequest,
  type RecordWorkspaceChangeOperationRequest,
  type UpdateDelegationGraphNodeStateRequest,
  type UpdateDelegationGraphStateRequest,
  type RevokeChannelBindingRequest,
  type RevokeConnectorCredentialRequest,
  type StartConnectorSessionRequest,
  type UpdateConnectorRegistrationStateRequest,
  type UpdatePluginInstallStateRequest,
  type UpdatePluginManifestStateRequest,
  type UpdateChannelInboundEventStateRequest,
  type TeamConversationMode,
  type TeamConversationRecord,
  type TeamConversationState,
  type TeamParticipantKind,
  type TeamParticipantRecord,
  type TeamParticipantState,
  type TeamTurnKind,
  type TeamTurnRecord,
  type UpdateTeamConversationStateRequest,
  type UpdateTeamParticipantStateRequest,
  type WorkspaceAppliedFileChange,
  type WorkspaceChangeOperationRecord,
  type WorkspaceChangeProposalOperationRecord,
  type WorkspaceChangeProposalRecord,
  type WorkspaceChangeSetRecord,
  type WorkspaceChangeSetReceipt,
  type WorkspaceFileChange,
  type WorkspaceFileConflict,
  WANEX_PROTOCOL_VERSION
} from "@wanex/protocol"

import {
  expectArray,
  expectString,
  isRecord,
  toRpcJsonValueFromUnknown
} from "./codec-common.js"
import type { MessagePartsWire } from "./generated/storage-rpc.js"

export function messagePartsToJson(
  parts: readonly MessagePart[]
): MessagePartsWire {
  return parts.map(toRpcJsonValueFromUnknown)
}

export function expectProviderState(value: unknown): ProviderState {
  if (!isRecord(value)) {
    throw new Error("provider state must be an object")
  }
  return value as unknown as ProviderState
}

export function messagePartFromJson(value: unknown): MessagePart {
  if (!isRecord(value)) {
    throw new Error("message part must be an object")
  }
  expectString(value.type, "message part.type")
  expectString(value.id, "message part.id")
  return value as unknown as MessagePart
}

export function messagePartsFromJson(value: unknown): readonly MessagePart[] {
  const parts = expectArray(value, "message parts")
  return parts.map((part, index) => {
    try {
      return messagePartFromJson(part)
    } catch (error) {
      throw new Error(`message part ${index}: ${(error as Error).message}`)
    }
  })
}
