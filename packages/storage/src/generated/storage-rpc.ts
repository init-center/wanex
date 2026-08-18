/* Generated from schemas/storage-rpc/storage-rpc.schema.json. Do not edit. */

/**
 * Wanex storage RPC protocol spine. Domain command schemas are added atomically during Phase 747.
 */
export type StorageRpcWireEnvelope = StorageRpcRequestEnvelope | StorageRpcSuccessEnvelope | StorageRpcErrorEnvelope;
export type StorageRpcVersion = 1;
export type StorageRpcRequestId = string;
export type StorageRpcCommand =
  | StorageRpcDescribeCommand
  | RuntimeStorageRpcCommand
  | SessionsStorageRpcCommand
  | ContextStorageRpcCommand
  | SchedulerStorageRpcCommand
  | ToolsStorageRpcCommand
  | WorkspaceStorageRpcCommand
  | PlanStorageRpcCommand
  | ObjectiveStorageRpcCommand
  | DelegationStorageRpcCommand
  | TeamStorageRpcCommand
  | PluginStorageRpcCommand
  | ConnectorStorageRpcCommand
  | ChannelStorageRpcCommand
  | MediaGenerationStorageRpcCommand;
export type RuntimeStorageRpcCommand =
  | AppendEventCommand
  | QueryEventsCommand
  | PutConfigCommand
  | ApplyConfigMutationsCommand
  | CompareAndApplyConfigMutationsCommand
  | HasLiveSecretReferenceCommand
  | GetConfigCommand
  | GetConfigEntryCommand
  | ListConfigEntriesCommand
  | WriteAtomicFileCommand
  | IngestResourceCommand
  | GetResourceCommand
  | ReadResourceContentCommand
  | ListResourcesCommand
  | CreateResourceTicketCommand
  | CleanupExpiredResourceTicketsCommand
  | RecordResourceProvenanceCommand
  | ListResourceProvenanceCommand
  | DoctorCommand;
export type NullableString = string | null;
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | {
      [k: string]: JsonValue;
    };
export type NullableInteger = number | null;
export type NullableUnsigned32 = Unsigned32 | null;
export type Unsigned32 = number;
export type ConfigExpectedRevisionWire = number | null;
export type NullableResourceKindWire = ResourceKindWire | null;
export type ResourceKindWire = "file" | "image" | "video" | "audio" | "document" | "artifact" | "log" | "patch" | "url";
export type NullableResourceOriginWire = ResourceOriginWire | null;
export type ResourceOriginWire =
  "user_upload" | "model_output" | "tool_output" | "provider_file" | "remote_url" | "system";
export type NullableResourceSourceWire = ResourceSourceWire | null;
export type NullableResourceStateWire = ResourceStateWire | null;
export type ResourceStateWire = "pending" | "fetching" | "available" | "failed" | "expired" | "deleted";
export type ResourceProvenanceCauseWire =
  ToolExecutionResourceProvenanceCauseWire | MediaGenerationResourceProvenanceCauseWire;
export type NullableResourceProvenanceCauseKindWire = ResourceProvenanceCauseKindWire | null;
export type ResourceProvenanceCauseKindWire = "tool_execution" | "media_generation";
export type SessionsStorageRpcCommand =
  | CreateSessionCommand
  | GetSessionCommand
  | ListSessionsCommand
  | RenameSessionCommand
  | ArchiveSessionCommand
  | RestoreSessionCommand
  | AdmitSessionInputCommand
  | SubmitSessionTurnCommand
  | StartSessionTurnAttemptCommand
  | SettleSessionTurnCommand
  | BeginProviderInvocationCommand
  | MarkProviderInvocationOutputCommand
  | FinishProviderInvocationCommand
  | ListProviderInvocationsCommand
  | RequestSessionTurnCancelCommand
  | InterruptSessionTurnCommand
  | SteerSessionTurnCommand
  | ListSessionTurnControlsCommand
  | ApplySessionTurnControlCommand
  | ListSessionInputsCommand
  | ListSessionMessagesCommand
  | ListSessionTurnsCommand
  | ListSessionAttemptsCommand
  | AppendSessionMessageCommand;
export type NullableSessionKindWire = SessionKindWire | null;
export type SessionKindWire = "chat" | "agent";
export type NullableSessionStatusWire = SessionStatusWire | null;
export type SessionStatusWire = "active" | "archived";
export type MessagePartsWire = JsonValue[];
export type NullableSessionInputOriginWire = SessionInputOriginWire | null;
export type NullableSessionInputIntentWire = SessionInputIntentWire | null;
export type SessionInputIntentWire = "normal" | "follow_up" | "steer" | "interrupt";
export type NullableRunControlPolicyWire = RunControlPolicyWire | null;
export type RunControlPolicyWire = "queue_after_current" | "abort_current_then_run" | "steer_at_safe_point";
export type SessionTurnSettlementOutcomeWire =
  "succeeded" | "failed" | "cancelled" | "interrupted" | "recovery_required";
export type NullableMessagePartsWire = MessagePartsWire | null;
export type NullableJsonObjectWire = JsonObjectWire | null;
export type NullableSessionTurnControlKindWire = SessionTurnControlKindWire | null;
export type SessionTurnControlKindWire = "interrupt" | "steer";
export type NullableSessionTurnControlStatusWire = SessionTurnControlStatusWire | null;
export type SessionTurnControlStatusWire = "pending" | "applied" | "rejected" | "cancelled";
export type NullableSessionInputStateWire = SessionInputStateWire | null;
export type SessionInputStateWire =
  "admitted" | "control_pending" | "promoted" | "completed" | "failed" | "cancelled" | "rejected";
export type NullableSessionTurnStateWire = SessionTurnStateWire | null;
export type SessionTurnStateWire =
  | "queued"
  | "running"
  | "waiting"
  | "cancel_requested"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "interrupted"
  | "recovery_required";
export type ContextStorageRpcCommand =
  | BeginContextEpochCommand
  | MarkContextEpochDispatchedCommand
  | MarkContextEpochOutputObservedCommand
  | FinishContextEpochGenerationCommand
  | ActivateContextEpochCommand
  | PruneContextEpochsCommand
  | ListContextEpochsCommand
  | GetActiveContextEpochCommand;
export type ContextEpochGenerationOutcomeWire = "succeeded" | "failed_before_output" | "ambiguous";
export type NullableBoolean = boolean | null;
export type NullableContextEpochStateWire = ContextEpochStateWire | null;
export type ContextEpochStateWire = "building" | "active" | "superseded" | "failed";
export type SchedulerStorageRpcCommand =
  | ReserveBudgetCommand
  | CommitBudgetCommand
  | RecordBudgetUsageCommand
  | ReleaseBudgetCommand
  | GetBudgetScopeCommand
  | ListBudgetGrantsCommand
  | EnqueueJobCommand
  | ClaimJobCommand
  | HeartbeatJobCommand
  | CompleteJobCommand
  | FailJobCommand
  | CancelJobCommand
  | GetJobCommand
  | ListJobsCommand;
export type BudgetScopeKindWire =
  "session" | "turn" | "objective" | "team_round" | "plugin" | "principal" | "provider_model";
export type NullableBudgetWindowKindWire = BudgetWindowKindWire | null;
export type BudgetWindowKindWire = "run" | "session" | "day" | "month";
export type SchedulerJobKindWire =
  | "session.turn"
  | "workspace.task"
  | "team.delivery"
  | "team.delivery.outcome"
  | "plugin.action"
  | "channel.delivery"
  | "gateway.delivery"
  | "memory.compaction"
  | "resource.cleanup"
  | "budget.grant_expire"
  | "provider.retry"
  | "config.sync"
  | "media.generate";
export type NullableRetryPolicyWire = RetryPolicyWire | null;
export type NullableSchedulerJobKindsWire = SchedulerJobKindsWire | null;
export type SchedulerJobKindsWire = SchedulerJobKindWire[];
export type NullableSchedulerJobStateWire = SchedulerJobStateWire | null;
export type SchedulerJobStateWire =
  "pending" | "ready" | "running" | "waiting" | "succeeded" | "retry_scheduled" | "failed" | "cancelled";
export type NullableSchedulerJobKindWire = SchedulerJobKindWire | null;
export type ToolsStorageRpcCommand =
  | BeginToolExecutionCommand
  | DeferToolExecutionCommand
  | FinishToolExecutionCommand
  | RequireToolExecutionRecoveryCommand
  | ResolveToolExecutionRecoveryCommand
  | ResolveToolExecutionApprovalCommand
  | GetToolExecutionCommand
  | GetToolExecutionByCallCommand
  | ListToolExecutionsCommand
  | ListToolActivitiesCommand
  | ListToolExecutionAttemptsCommand;
export type NullableToolActivityEvidenceWire = ToolActivityEvidenceWire | null;
export type DeferredToolOperationWire = DeferredMediaGenerationOperationWire | DeferredTeamDelegationOperationWire;
export type NullableToolResultContentWire = [ToolResultContentPartWire, ...ToolResultContentPartWire[]] | null;
export type ToolResultContentPartWire =
  ToolResultTextContentPartWire | ToolResultJsonContentPartWire | ToolResultResourceContentPartWire;
export type ToolExecutionRecoveryDecisionWire = "confirm_succeeded" | "confirm_failed" | "retry" | "abandon_turn";
export type ToolExecutionApprovalDecisionWire = "approve_once" | "deny";
export type NullableToolExecutionStateWire = ToolExecutionStateWire | null;
export type ToolExecutionStateWire =
  | "running"
  | "waiting"
  | "retry_ready"
  | "approved"
  | "denied"
  | "approval_required"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "recovery_required";
export type WorkspaceStorageRpcCommand =
  | PutWorkspaceChangeSetCommand
  | GetWorkspaceChangeSetCommand
  | ListWorkspaceChangeSetsCommand
  | RecordWorkspaceChangeOperationCommand
  | ListWorkspaceChangeOperationsCommand
  | PutWorkspaceChangeProposalCommand
  | GetWorkspaceChangeProposalCommand
  | ListWorkspaceChangeProposalsCommand
  | RecordWorkspaceChangeProposalOperationCommand
  | ListWorkspaceChangeProposalOperationsCommand;
export type NullableWorkspaceChangeSetStateWire = WorkspaceChangeSetStateWire | null;
export type WorkspaceChangeSetStateWire =
  "submitted" | "applied" | "already_applied" | "conflicted" | "undone" | "undo_conflicted";
export type WorkspaceChangeOperationWire = "apply" | "undo";
export type NullableWorkspaceChangeProposalStateWire = WorkspaceChangeProposalStateWire | null;
export type WorkspaceChangeProposalStateWire =
  "open" | "approved" | "rejected" | "withdrawn" | "apply_requested" | "applied" | "apply_failed";
export type WorkspaceChangeProposalOperationWire =
  "approve" | "reject" | "withdraw" | "request_apply" | "mark_applied" | "mark_apply_failed";
export type PlanStorageRpcCommand =
  | CreatePlanProposalCommand
  | GetPlanProposalCommand
  | ListPlanProposalsCommand
  | RecordPlanProposalOperationCommand
  | ExecuteApprovedPlanCommand
  | ListPlanProposalOperationsCommand;
export type PlanReferenceKindWire =
  | "workspace_change_proposal"
  | "delegation_graph"
  | "delegation_graph_node"
  | "team_conversation"
  | "resource"
  | "context_epoch";
export type NullablePlanProposalStateWire = PlanProposalStateWire | null;
export type PlanProposalStateWire = "open" | "approved" | "rejected" | "withdrawn";
export type NullablePlanReferenceKindWire = PlanReferenceKindWire | null;
export type PlanProposalOperationWire = "revise" | "approve" | "reject" | "withdraw";
export type NullablePlanProposalContentWire = PlanProposalContentWire | null;
export type ObjectiveStorageRpcCommand =
  | CreateObjectiveCommand
  | GetObjectiveCommand
  | ListObjectivesCommand
  | PauseObjectiveCommand
  | ResumeObjectiveCommand
  | AdmitObjectiveAttemptCommand
  | ReviewObjectiveAttemptCommand
  | RequestObjectiveCancelCommand
  | ReconcileObjectiveCancellationCommand
  | ListObjectiveAttemptsCommand
  | ListObjectiveAttemptReviewsCommand
  | ListObjectiveVerificationsCommand;
export type NullableObjectiveStatesWire = ObjectiveStatesWire | null;
export type ObjectiveStateWire =
  "active" | "paused" | "blocked" | "limit_reached" | "succeeded" | "failed" | "cancel_requested" | "cancelled";
export type ObjectiveStatesWire = ObjectiveStateWire[];
export type ObjectiveAttemptTriggerWire = "initial" | "automatic_continuation" | "user_resume";
export type ObjectiveAttemptDispositionWire = "continue" | "blocked" | "succeeded" | "failed";
export type NullableObjectiveVerificationResultWire = ObjectiveVerificationResultWire | null;
export type ObjectiveVerificationResultWire = "passed" | "failed" | "inconclusive" | "blocked";
export type DelegationStorageRpcCommand =
  | PutDelegationGraphCommand
  | GetDelegationGraphCommand
  | ListDelegationGraphsCommand
  | PutDelegationGraphNodeCommand
  | GetDelegationGraphNodeCommand
  | ListDelegationGraphNodesCommand
  | PutDelegationGraphDependencyCommand
  | ListDelegationGraphDependenciesCommand
  | UpdateDelegationGraphStateCommand
  | UpdateDelegationGraphNodeStateCommand
  | AttachDelegationGraphNodeJobCommand
  | ListReadyDelegationGraphNodesCommand
  | MaterializeReadyDelegationGraphNodeCommand;
export type NullableDelegationGraphStateWire = DelegationGraphStateWire | null;
export type DelegationGraphStateWire = "open" | "running" | "succeeded" | "failed" | "cancelled";
export type DelegationNodeKindWire = "agent_task" | "workspace_task" | "tool_task" | "aggregation";
export type NullableDelegationNodeStateWire = DelegationNodeStateWire | null;
export type DelegationNodeStateWire =
  "pending" | "ready" | "running" | "succeeded" | "failed" | "cancelled" | "skipped";
export type NullableDelegationDependencyKindWire = DelegationDependencyKindWire | null;
export type DelegationDependencyKindWire = "after_success" | "after_terminal";
export type TeamStorageRpcCommand =
  | PutTeamConversationCommand
  | GetTeamConversationCommand
  | ListTeamConversationsCommand
  | UpdateTeamConversationStateCommand
  | SetTeamConversationLeadCommand
  | PutTeamParticipantCommand
  | ListTeamParticipantsCommand
  | UpdateTeamParticipantStateCommand
  | AdmitTeamMessageCommand
  | GetTeamMessageCommand
  | ListTeamMessagesCommand
  | RouteTeamMessageCommand
  | GetTeamRoutingDecisionByMessageCommand
  | ListTeamRoutingDecisionsCommand
  | ListTeamDeliveriesCommand
  | GetTeamDiscussionRoundCommand
  | ListTeamDiscussionRoundsCommand
  | GetTeamDelegationOperationCommand
  | GetTeamDelegationOperationByToolExecutionCommand
  | ListTeamDelegationTasksCommand
  | ReadTeamConversationPageCommand
  | GetTeamDeliveryMaterializationContextCommand
  | MaterializeTeamDeliveryCommand
  | FailTeamDeliveryMaterializationCommand
  | ProjectTeamDeliveryOutcomeCommand;
export type NullableTeamConversationModeWire = TeamConversationModeWire | null;
export type TeamConversationModeWire = "orchestrated" | "peer" | "hybrid";
export type NullableTeamConversationStateWire = TeamConversationStateWire | null;
export type TeamConversationStateWire = "open" | "paused" | "closed" | "cancelled";
export type TeamParticipantKindWire = "user" | "agent" | "tool" | "system";
export type NullableTeamParticipantStateWire = TeamParticipantStateWire | null;
export type TeamParticipantStateWire = "active" | "muted" | "left";
export type NullableTeamMessageKindWire = TeamMessageKindWire | null;
export type TeamMessageKindWire = "message" | "decision" | "handoff" | "system";
export type TeamTargetKindWire = "participant" | "lead" | "all";
/**
 * @maxItems 64
 */
export type TeamTargetsWire = TeamTargetWire[];
export type NullableTeamMessageStateWire = TeamMessageStateWire | null;
export type TeamMessageStateWire = "admitted" | "routed" | "visible" | "blocked" | "superseded";
export type TeamRoutingOutcomeWire = "deliver" | "blocked";
export type TeamDeliveryRoleWire = "speaker" | "observer" | "summarizer";
export type TeamDeliveryTriggerWire = "direct" | "mention" | "lead" | "round" | "delegation";
/**
 * @maxItems 64
 */
export type RouteTeamDeliveriesWire = RouteTeamDeliveryWire[];
export type NullableTeamDeliveryStateWire = TeamDeliveryStateWire | null;
export type TeamDeliveryStateWire = "queued" | "dispatched" | "responded" | "passed" | "failed" | "cancelled";
export type NullableTeamDiscussionRoundStateWire = TeamDiscussionRoundStateWire | null;
export type TeamDiscussionRoundStateWire = "open" | "closed";
export type PluginStorageRpcCommand =
  | PutPluginManifestCommand
  | GetPluginManifestCommand
  | ListPluginManifestsCommand
  | PutPluginInstallCommand
  | ActivatePluginInstallCommand
  | GetPluginInstallCommand
  | ListPluginInstallsCommand
  | UpdatePluginInstallStateCommand
  | UpdatePluginManifestStateCommand
  | GetPluginActionExecutionAdmissionCommand
  | SubmitPluginActionCommand;
export type PluginCapabilityWire =
  | "resource.read"
  | "resource.write"
  | "workspace.change.propose"
  | "delegation.graph.read"
  | "delegation.graph.write"
  | "team.conversation.read"
  | "team.conversation.write"
  | "channel.connect"
  | "channel.receive"
  | "channel.deliver"
  | "config.read"
  | "config.write"
  | "network.fetch";
export type PluginCapabilitiesWire = PluginCapabilityWire[];
export type NullablePluginManifestStateWire = PluginManifestStateWire | null;
export type PluginManifestStateWire = "registered" | "disabled";
export type NullablePluginCapabilityWire = PluginCapabilityWire | null;
export type NullablePluginInstallStateWire = PluginInstallStateWire | null;
export type PluginInstallStateWire = "installed" | "disabled" | "removed";
export type ConnectorStorageRpcCommand =
  | PutConnectorRegistrationCommand
  | ListConnectorRegistrationsCommand
  | UpdateConnectorRegistrationStateCommand
  | PutConnectorCredentialCommand
  | ListConnectorCredentialsCommand
  | RevokeConnectorCredentialCommand
  | StartConnectorSessionCommand
  | HeartbeatConnectorSessionCommand
  | FinishConnectorSessionCommand
  | ListConnectorSessionsCommand;
export type NullableConnectorRegistrationStateWire = ConnectorRegistrationStateWire | null;
export type ConnectorRegistrationStateWire = "active" | "disabled";
export type NullableConnectorCredentialStateWire = ConnectorCredentialStateWire | null;
export type ConnectorCredentialStateWire = "active" | "revoked";
export type NullableConnectorLiveSessionStateWire = ConnectorLiveSessionStateWire | null;
export type ConnectorLiveSessionStateWire = "connecting" | "connected";
export type ConnectorFinishedSessionStateWire = "disconnected" | "failed";
export type NullableConnectorSessionStateWire = ConnectorSessionStateWire | null;
export type ConnectorSessionStateWire = "connecting" | "connected" | "disconnected" | "expired" | "failed";
export type ChannelStorageRpcCommand =
  | PutChannelBindingCommand
  | ListChannelBindingsCommand
  | RevokeChannelBindingCommand
  | IngestChannelInboundEventCommand
  | ListChannelInboundEventsCommand
  | UpdateChannelInboundEventStateCommand
  | SubmitChannelDeliveryCommand
  | CompleteChannelDeliveryCommand
  | FailChannelDeliveryCommand
  | ProjectChannelInboundEventCommand
  | ListChannelProjectionsCommand;
export type NullableChannelBindingStateWire = ChannelBindingStateWire | null;
export type ChannelBindingStateWire = "active" | "revoked";
export type NullableChannelInboundEventStateWire = ChannelInboundEventStateWire | null;
export type ChannelInboundEventStateWire = "received" | "projected" | "ignored" | "failed";
export type NullableChannelProjectionTargetKindWire = ChannelProjectionTargetKindWire | null;
export type ChannelProjectionTargetKindWire = "session.turn" | "team.message" | "workspace.task" | "ignored";
export type MediaGenerationStorageRpcCommand =
  | SubmitMediaGenerationCommand
  | BeginMediaGenerationCommand
  | AcceptMediaGenerationCommand
  | SuspendMediaGenerationCommand
  | RecordMediaGenerationOutputsCommand
  | CompleteMediaGenerationCommand
  | SettleMediaGenerationCommand
  | RequestMediaGenerationCancelCommand
  | GetMediaGenerationCommand
  | ListMediaGenerationCommand;
export type MediaGenerationSuspensionOutcomeWire = "scheduled" | "pending" | "transient_error";
export type MediaGenerationTerminalPollOutcomeWire = "none" | "completed" | "provider_failure" | "transient_error";
export type NullableMediaGenerationOperationStateWire = MediaGenerationOperationStateWire | null;
export type MediaGenerationOperationStateWire =
  | "queued"
  | "submitting"
  | "polling"
  | "materializing"
  | "cancel_requested"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "recovery_required";
export type StorageRpcCapability =
  | "storage.runtime"
  | "storage.sessions"
  | "storage.context"
  | "storage.scheduler"
  | "storage.tools"
  | "storage.workspace"
  | "storage.plan"
  | "storage.objective"
  | "storage.delegation"
  | "storage.team"
  | "storage.plugin"
  | "storage.connector"
  | "storage.channel"
  | "storage.media_generation";
export type StorageRpcErrorCode = StorageRpcProtocolErrorCode | StorageRpcServiceErrorCode;
export type StorageRpcProtocolErrorCode =
  | "unsupported_storage_rpc_version"
  | "invalid_storage_rpc_envelope"
  | "unknown_storage_rpc_command"
  | "storage_rpc_request_id_mismatch"
  | "storage_rpc_response_version_mismatch";
export type StorageRpcServiceErrorCode =
  | "sqlite"
  | "io"
  | "json"
  | "invalid_input"
  | "not_found"
  | "conflict"
  | "sha256_mismatch"
  | "budget_denied"
  | "invalid_job_request"
  | "invariant";

export interface StorageRpcRequestEnvelope {
  storage_rpc_version: StorageRpcVersion;
  request_id: StorageRpcRequestId;
  request: StorageRpcCommand;
}
export interface StorageRpcDescribeCommand {
  command: "rpc-describe";
}
export interface AppendEventCommand {
  command: "append-event";
  event: RuntimeEventInputWire;
}
export interface RuntimeEventInputWire {
  id: string;
  type: string;
  scope: RuntimeEventScopeWire;
  payload: JsonValue;
  occurredAt: number;
}
export interface RuntimeEventScopeWire {
  session_id: NullableString;
  turn_id: NullableString;
  attempt_id: NullableString;
  input_id: NullableString;
  message_id: NullableString;
  resource_id: NullableString;
  plan_proposal_id: NullableString;
  objective_id: NullableString;
}
export interface QueryEventsCommand {
  command: "query-events";
  query: QueryEventsWire;
}
export interface QueryEventsWire {
  session_id: NullableString;
  plan_proposal_id: NullableString;
  objective_id: NullableString;
  after_occurred_at: NullableInteger;
  after_event_id: NullableString;
  limit: NullableUnsigned32;
}
export interface PutConfigCommand {
  command: "put-config";
  key: string;
  value: JsonValue;
}
export interface ApplyConfigMutationsCommand {
  command: "apply-config-mutations";
  /**
   * @maxItems 64
   */
  puts: ConfigPutWire[];
  /**
   * @maxItems 64
   */
  deletes: string[];
}
export interface ConfigPutWire {
  key: string;
  value: JsonValue;
}
export interface CompareAndApplyConfigMutationsCommand {
  command: "compare-and-apply-config-mutations";
  /**
   * @minItems 1
   * @maxItems 64
   */
  conditions: [ConfigMutationConditionWire, ...ConfigMutationConditionWire[]];
  /**
   * @maxItems 64
   */
  puts: ConfigPutWire[];
  /**
   * @maxItems 64
   */
  deletes: string[];
}
export interface ConfigMutationConditionWire {
  key: string;
  expected_revision: ConfigExpectedRevisionWire;
}
export interface HasLiveSecretReferenceCommand {
  command: "has-live-secret-reference";
  secret_ref: string;
}
export interface GetConfigCommand {
  command: "get-config";
  key: string;
}
export interface GetConfigEntryCommand {
  command: "get-config-entry";
  key: string;
}
export interface ListConfigEntriesCommand {
  command: "list-config-entries";
  prefix: string;
  after_key: NullableString;
  limit: number | null;
}
export interface WriteAtomicFileCommand {
  command: "write-atomic-file";
  logical_path: string;
  content_base64: string;
  expected_sha256: NullableString;
}
export interface IngestResourceCommand {
  command: "ingest-resource";
  request: IngestResourceWire;
}
export interface IngestResourceWire {
  id: NullableString;
  logical_path: NullableString;
  content_base64: string;
  media_type: NullableString;
  kind: NullableResourceKindWire;
  origin: NullableResourceOriginWire;
  label: NullableString;
  source: NullableResourceSourceWire;
  metadata: JsonValue;
  width: NullableInteger;
  height: NullableInteger;
  duration_ms: NullableInteger;
  expected_sha256: NullableString;
}
export interface ResourceSourceWire {
  provider: NullableString;
  provider_file_id: NullableString;
  provider_operation_id: NullableString;
  source_url: NullableString;
  source_expires_at: NullableInteger;
}
export interface GetResourceCommand {
  command: "get-resource";
  resource_id: string;
}
export interface ReadResourceContentCommand {
  command: "read-resource-content";
  resource_id: string;
  expected_sha256: string;
  offset: number;
  limit: number;
}
export interface ListResourcesCommand {
  command: "list-resources";
  request: ListResourcesWire;
}
export interface ListResourcesWire {
  kind: NullableResourceKindWire;
  origin: NullableResourceOriginWire;
  state: NullableResourceStateWire;
  limit: NullableUnsigned32;
}
export interface CreateResourceTicketCommand {
  command: "create-resource-ticket";
  principal_id: string;
  resource_id: string;
  capability: "read" | "write";
  expires_at: number;
}
export interface CleanupExpiredResourceTicketsCommand {
  command: "cleanup-expired-resource-tickets";
  request: CleanupExpiredResourceTicketsWire;
}
export interface CleanupExpiredResourceTicketsWire {
  now_ms: NullableInteger;
  limit: NullableUnsigned32;
}
export interface RecordResourceProvenanceCommand {
  command: "record-resource-provenance";
  request: RecordResourceProvenanceWire;
}
export interface RecordResourceProvenanceWire {
  resource: ResourceInputEvidenceWire;
  cause: ResourceProvenanceCauseWire;
  /**
   * @maxItems 64
   */
  input_resources: ResourceInputEvidenceWire[];
}
export interface ResourceInputEvidenceWire {
  resource_id: string;
  sha256: string;
  size_bytes: number;
  kind: ResourceKindWire;
  media_type: NullableString;
}
export interface ToolExecutionResourceProvenanceCauseWire {
  kind: "tool_execution";
  execution_id: string;
  session_id: string;
  turn_id: string;
  source_message_id: string;
  tool_call_id: string;
}
export interface MediaGenerationResourceProvenanceCauseWire {
  kind: "media_generation";
  operation_id: string;
}
export interface ListResourceProvenanceCommand {
  command: "list-resource-provenance";
  request: ListResourceProvenanceWire;
}
export interface ListResourceProvenanceWire {
  resource_id: NullableString;
  cause_kind: NullableResourceProvenanceCauseKindWire;
  cause_id: NullableString;
  limit: NullableUnsigned32;
}
export interface DoctorCommand {
  command: "doctor";
}
export interface CreateSessionCommand {
  command: "create-session";
  id: NullableString;
  title: NullableString;
  kind: NullableSessionKindWire;
}
export interface GetSessionCommand {
  command: "get-session";
  id: string;
}
export interface ListSessionsCommand {
  command: "list-sessions";
  request: ListSessionsWire;
}
export interface ListSessionsWire {
  kind: NullableSessionKindWire;
  status: NullableSessionStatusWire;
  updated_before: NullableInteger;
  updated_after: NullableInteger;
  limit: NullableUnsigned32;
}
export interface RenameSessionCommand {
  command: "rename-session";
  request: RenameSessionWire;
}
export interface RenameSessionWire {
  session_id: string;
  title: string;
  expected_revision: number;
}
export interface ArchiveSessionCommand {
  command: "archive-session";
  request: SessionStateTransitionWire;
}
export interface SessionStateTransitionWire {
  session_id: string;
  expected_revision: number;
}
export interface RestoreSessionCommand {
  command: "restore-session";
  request: SessionStateTransitionWire;
}
export interface AdmitSessionInputCommand {
  command: "admit-session-input";
  id: NullableString;
  session_id: string;
  principal_id: string;
  idempotency_key: string;
  input_type: "user" | "system";
  content: MessagePartsWire;
  origin: NullableSessionInputOriginWire;
  intent: NullableSessionInputIntentWire;
}
export interface SessionInputOriginWire {
  kind: string;
  sourceRef?: string;
  parentRef?: string;
  metadata?: JsonObjectWire;
}
export interface JsonObjectWire {
  [k: string]: JsonValue;
}
export interface SubmitSessionTurnCommand {
  command: "submit-session-turn";
  request: SubmitSessionTurnWire;
}
export interface SubmitSessionTurnWire {
  id: NullableString;
  turn_id: NullableString;
  session_id: string;
  principal_id: string;
  idempotency_key: string;
  input_type: ("user" | "system") | null;
  content: MessagePartsWire;
  origin: NullableSessionInputOriginWire;
  intent: NullableSessionInputIntentWire;
  run_control_policy: NullableRunControlPolicyWire;
  expected_turn_id: NullableString;
  job_id: NullableString;
  job_idempotency_key: NullableString;
  execution_binding: JsonValue;
  max_steps: NullableInteger;
  regenerates_turn_id: NullableString;
  scheduled_at: NullableInteger;
  not_before: NullableInteger;
  priority: NullableInteger;
  budget_grant_id: NullableString;
}
export interface StartSessionTurnAttemptCommand {
  command: "start-session-turn-attempt";
  request: StartSessionTurnAttemptWire;
}
export interface StartSessionTurnAttemptWire {
  session_id: string;
  turn_id: string;
  input_id: string;
  job_id: string;
  worker_id: string;
  lease_token: string;
}
export interface SettleSessionTurnCommand {
  command: "settle-session-turn";
  request: SettleSessionTurnWire;
}
export interface SettleSessionTurnWire {
  session_id: string;
  turn_id: string;
  attempt_id: string;
  input_id: string;
  job_id: string;
  worker_id: string;
  lease_token: string;
  outcome: SessionTurnSettlementOutcomeWire;
  provider_invocation_id: NullableString;
  assistant_message: NullableMessagePartsWire;
  provider_state: JsonValue;
  result: JsonValue;
  error: JsonValue;
  reason: NullableString;
}
export interface BeginProviderInvocationCommand {
  command: "begin-provider-invocation";
  request: BeginProviderInvocationWire;
}
export interface BeginProviderInvocationWire {
  id: NullableString;
  session_id: string;
  turn_id: string;
  attempt_id: string;
  input_id: string;
  job_id: string;
  worker_id: string;
  lease_token: string;
  step: number;
  invocation_number: number;
  request_digest: string;
}
export interface MarkProviderInvocationOutputCommand {
  command: "mark-provider-invocation-output";
  request: MarkProviderInvocationOutputWire;
}
export interface MarkProviderInvocationOutputWire {
  session_id: string;
  turn_id: string;
  attempt_id: string;
  input_id: string;
  job_id: string;
  worker_id: string;
  lease_token: string;
  invocation_id: string;
  provider_request_id: NullableString;
}
export interface FinishProviderInvocationCommand {
  command: "finish-provider-invocation";
  request: FinishProviderInvocationWire;
}
export interface FinishProviderInvocationWire {
  session_id: string;
  turn_id: string;
  attempt_id: string;
  input_id: string;
  job_id: string;
  worker_id: string;
  lease_token: string;
  invocation_id: string;
  outcome: "succeeded" | "failed_before_output" | "ambiguous";
  assistant_message: NullableMessagePartsWire;
  provider_state: JsonValue;
  provider_request_id: NullableString;
  error: JsonValue;
}
export interface ListProviderInvocationsCommand {
  command: "list-provider-invocations";
  request: ListProviderInvocationsWire;
}
export interface ListProviderInvocationsWire {
  turn_id: string;
}
export interface RequestSessionTurnCancelCommand {
  command: "request-session-turn-cancel";
  request: RequestSessionTurnCancelWire;
}
export interface RequestSessionTurnCancelWire {
  session_id: string;
  turn_id: string;
  input_id: string;
  job_id: string;
  reason: string;
}
export interface InterruptSessionTurnCommand {
  command: "interrupt-session-turn";
  request: InterruptSessionTurnWire;
}
export interface InterruptSessionTurnWire {
  session_id: string;
  turn_id: string;
  attempt_id: string;
  reason: string;
  principal_id: NullableString;
  idempotency_key: NullableString;
  origin: NullableSessionInputOriginWire;
  metadata: NullableJsonObjectWire;
}
export interface SteerSessionTurnCommand {
  command: "steer-session-turn";
  request: SteerSessionTurnWire;
}
export interface SteerSessionTurnWire {
  session_id: string;
  principal_id: string;
  expected_turn_id: string;
  expected_attempt_id: string;
  idempotency_key: string;
  content: MessagePartsWire;
  origin: NullableSessionInputOriginWire;
  metadata: NullableJsonObjectWire;
}
export interface ListSessionTurnControlsCommand {
  command: "list-session-turn-controls";
  request: ListSessionTurnControlsWire;
}
export interface ListSessionTurnControlsWire {
  session_id: string;
  turn_id: NullableString;
  attempt_id: NullableString;
  kind: NullableSessionTurnControlKindWire;
  status: NullableSessionTurnControlStatusWire;
  limit: NullableInteger;
}
export interface ApplySessionTurnControlCommand {
  command: "apply-session-turn-control";
  request: ApplySessionTurnControlWire;
}
export interface ApplySessionTurnControlWire {
  session_id: string;
  turn_id: string;
  attempt_id: string;
  control_id: string;
  job_id: string;
  worker_id: string;
  lease_token: string;
}
export interface ListSessionInputsCommand {
  command: "list-session-inputs";
  session_id: string;
  status: NullableSessionInputStateWire;
  limit: number | null;
}
export interface ListSessionMessagesCommand {
  command: "list-session-messages";
  session_id: string;
  before_sequence: number | null;
  limit: number | null;
  turn_ids: string[] | null;
}
export interface ListSessionTurnsCommand {
  command: "list-session-turns";
  session_id: string;
  state: NullableSessionTurnStateWire;
  turn_ids: string[] | null;
}
export interface ListSessionAttemptsCommand {
  command: "list-session-attempts";
  turn_id: string;
}
export interface AppendSessionMessageCommand {
  command: "append-session-message";
  session_id: string;
  turn_id: string;
  attempt_id: string;
  input_id: string;
  job_id: string;
  worker_id: string;
  lease_token: string;
  idempotency_key: string;
  role: "assistant" | "tool" | "system";
  content: MessagePartsWire;
  provider_state: JsonValue;
}
export interface BeginContextEpochCommand {
  command: "begin-context-epoch";
  request: BeginContextEpochWire;
}
export interface BeginContextEpochWire {
  id: string;
  session_id: string;
  job_id: string;
  worker_id: string;
  lease_token: string;
  max_provider_attempts: number;
  previous_epoch_id: NullableString;
  previous_summary_digest: NullableString;
  source_head_sequence: number;
  source_head_message_id: string;
  cut_sequence: number;
  cut_message_id: string;
  retained_from_sequence: number;
  retained_from_message_id: string;
  source_digest: string;
  policy: JsonValue;
  policy_digest: string;
  model_endpoint: JsonValue;
  request_digest: string;
  token_estimate_before: number;
}
export interface MarkContextEpochDispatchedCommand {
  command: "mark-context-epoch-dispatched";
  request: ContextEpochMutationIdentityWire;
}
export interface ContextEpochMutationIdentityWire {
  epoch_id: string;
  job_id: string;
  worker_id: string;
  lease_token: string;
}
export interface MarkContextEpochOutputObservedCommand {
  command: "mark-context-epoch-output-observed";
  request: MarkContextEpochOutputObservedWire;
}
export interface MarkContextEpochOutputObservedWire {
  epoch_id: string;
  job_id: string;
  worker_id: string;
  lease_token: string;
  generation_attempt: number;
}
export interface FinishContextEpochGenerationCommand {
  command: "finish-context-epoch-generation";
  request: FinishContextEpochGenerationWire;
}
export interface FinishContextEpochGenerationWire {
  epoch_id: string;
  job_id: string;
  worker_id: string;
  lease_token: string;
  generation_attempt: number;
  outcome: ContextEpochGenerationOutcomeWire;
  retryable: NullableBoolean;
  summary: NullableString;
  summary_digest: NullableString;
  usage: JsonValue;
  error: JsonValue;
  token_estimate_after: NullableInteger;
  token_savings: NullableInteger;
}
export interface ActivateContextEpochCommand {
  command: "activate-context-epoch";
  request: ActivateContextEpochWire;
}
export interface ActivateContextEpochWire {
  epoch_id: string;
  job_id: string;
  worker_id: string;
  lease_token: string;
  expected_previous_epoch_id: NullableString;
}
export interface PruneContextEpochsCommand {
  command: "prune-context-epochs";
  request: PruneContextEpochsWire;
}
export interface PruneContextEpochsWire {
  session_id: string;
  keep_last_superseded: NullableInteger;
  older_than_updated_at: NullableInteger;
  dry_run: NullableBoolean;
}
export interface ListContextEpochsCommand {
  command: "list-context-epochs";
  request: ListContextEpochsWire;
}
export interface ListContextEpochsWire {
  session_id: string;
  state: NullableContextEpochStateWire;
}
export interface GetActiveContextEpochCommand {
  command: "get-active-context-epoch";
  request: GetActiveContextEpochWire;
}
export interface GetActiveContextEpochWire {
  session_id: string;
}
export interface ReserveBudgetCommand {
  command: "reserve-budget";
  request: ReserveBudgetWire;
}
export interface ReserveBudgetWire {
  scope: BudgetScopeRefWire;
  limit: BudgetAmountWire;
  requested: BudgetAmountWire;
  principal_id: string;
  reason: string;
  idempotency_key: string;
  expires_at: NullableInteger;
}
export interface BudgetScopeRefWire {
  kind: BudgetScopeKindWire;
  owner_id: string;
  window_kind: NullableBudgetWindowKindWire;
}
export interface BudgetAmountWire {
  tokens: NullableInteger;
  cost_micros: NullableInteger;
  wall_time_ms: NullableInteger;
  tool_calls: NullableInteger;
}
export interface CommitBudgetCommand {
  command: "commit-budget";
  request: CommitBudgetWire;
}
export interface CommitBudgetWire {
  grant_id: string;
}
export interface RecordBudgetUsageCommand {
  command: "record-budget-usage";
  request: RecordBudgetUsageWire;
}
export interface RecordBudgetUsageWire {
  grant_id: string;
  usage: BudgetAmountWire;
  source: string;
  source_id: string;
  idempotency_key: string;
}
export interface ReleaseBudgetCommand {
  command: "release-budget";
  grant_id: string;
}
export interface GetBudgetScopeCommand {
  command: "get-budget-scope";
  scope_id: string;
}
export interface ListBudgetGrantsCommand {
  command: "list-budget-grants";
  scope_id: string;
}
export interface EnqueueJobCommand {
  command: "enqueue-job";
  request: EnqueueJobWire;
}
export interface EnqueueJobWire {
  id: NullableString;
  kind: SchedulerJobKindWire;
  principal_id: string;
  payload: JsonValue;
  scheduled_at: NullableInteger;
  not_before: NullableInteger;
  priority: NullableInteger;
  concurrency_key: NullableString;
  max_attempts: NullableInteger;
  retry_policy: NullableRetryPolicyWire;
  idempotency_key: NullableString;
  budget_grant_id: NullableString;
}
export interface RetryPolicyWire {
  strategy: "none" | "fixed" | "exponential";
  initial_delay_ms: NullableInteger;
  max_delay_ms: NullableInteger;
}
export interface ClaimJobCommand {
  command: "claim-job";
  request: ClaimJobWire;
}
export interface ClaimJobWire {
  worker_id: string;
  lease_ms: number;
  kinds: NullableSchedulerJobKindsWire;
}
export interface HeartbeatJobCommand {
  command: "heartbeat-job";
  request: HeartbeatJobWire;
}
export interface HeartbeatJobWire {
  job_id: string;
  worker_id: string;
  lease_token: string;
  lease_ms: number;
}
export interface CompleteJobCommand {
  command: "complete-job";
  request: CompleteJobWire;
}
export interface CompleteJobWire {
  job_id: string;
  worker_id: string;
  lease_token: string;
  result: JsonValue;
}
export interface FailJobCommand {
  command: "fail-job";
  request: FailJobWire;
}
export interface FailJobWire {
  job_id: string;
  worker_id: string;
  lease_token: string;
  error: JsonValue;
}
export interface CancelJobCommand {
  command: "cancel-job";
  request: CancelJobWire;
}
export interface CancelJobWire {
  job_id: string;
  reason: string;
}
export interface GetJobCommand {
  command: "get-job";
  request: GetJobWire;
}
export interface GetJobWire {
  job_id: string;
}
export interface ListJobsCommand {
  command: "list-jobs";
  request: ListJobsWire;
}
export interface ListJobsWire {
  state: NullableSchedulerJobStateWire;
  kind: NullableSchedulerJobKindWire;
  limit: NullableUnsigned32;
}
export interface BeginToolExecutionCommand {
  command: "begin-tool-execution";
  request: BeginToolExecutionWire;
}
export interface BeginToolExecutionWire {
  session_id: string;
  turn_id: string;
  attempt_id: string;
  input_id: string;
  source_message_id: string;
  job_id: string;
  worker_id: string;
  lease_token: string;
  principal_id: string;
  tool_call_id: string;
  tool_name: string;
  input: JsonValue;
  descriptor: JsonValue;
  permission: JsonValue;
  activity: NullableToolActivityEvidenceWire;
  state: "running" | "denied" | "approval_required";
  idempotency_key: string;
}
export interface ToolActivityEvidenceWire {
  call: ToolActivityPresentationWire;
  result: ToolActivityPresentationWire | null;
}
export interface ToolActivityPresentationWire {
  summary: string;
  details:
    | []
    | [ToolActivityPresentationDetailWire]
    | [ToolActivityPresentationDetailWire, ToolActivityPresentationDetailWire]
    | [ToolActivityPresentationDetailWire, ToolActivityPresentationDetailWire, ToolActivityPresentationDetailWire]
    | [
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire
      ]
    | [
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire
      ]
    | [
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire
      ]
    | [
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire
      ]
    | [
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire
      ]
    | [
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire
      ]
    | [
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire
      ]
    | [
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire
      ]
    | [
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire
      ]
    | [
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire
      ]
    | [
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire
      ]
    | [
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire
      ]
    | [
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire,
        ToolActivityPresentationDetailWire
      ]
    | null;
}
export interface ToolActivityPresentationDetailWire {
  label: string;
  value: string;
}
export interface DeferToolExecutionCommand {
  command: "defer-tool-execution";
  request: DeferToolExecutionWire;
}
export interface DeferToolExecutionWire {
  session_id: string;
  turn_id: string;
  session_attempt_id: string;
  input_id: string;
  source_message_id: string;
  session_job_id: string;
  worker_id: string;
  lease_token: string;
  tool_execution_id: string;
  tool_invocation_attempt_id: string;
  tool_call_id: string;
  operation: DeferredToolOperationWire;
}
export interface DeferredMediaGenerationOperationWire {
  kind: "media_generation";
  binding: JsonValue;
  priority: NullableInteger;
}
export interface DeferredTeamDelegationOperationWire {
  kind: "team_delegation";
  operation_id: string;
  conversation_id: string;
  source_delivery_id: string;
  lead_participant_id: string;
  graph_id: string;
  /**
   * @minItems 1
   * @maxItems 8
   */
  tasks:
    | [DeferredTeamDelegationTaskWire]
    | [DeferredTeamDelegationTaskWire, DeferredTeamDelegationTaskWire]
    | [DeferredTeamDelegationTaskWire, DeferredTeamDelegationTaskWire, DeferredTeamDelegationTaskWire]
    | [
        DeferredTeamDelegationTaskWire,
        DeferredTeamDelegationTaskWire,
        DeferredTeamDelegationTaskWire,
        DeferredTeamDelegationTaskWire
      ]
    | [
        DeferredTeamDelegationTaskWire,
        DeferredTeamDelegationTaskWire,
        DeferredTeamDelegationTaskWire,
        DeferredTeamDelegationTaskWire,
        DeferredTeamDelegationTaskWire
      ]
    | [
        DeferredTeamDelegationTaskWire,
        DeferredTeamDelegationTaskWire,
        DeferredTeamDelegationTaskWire,
        DeferredTeamDelegationTaskWire,
        DeferredTeamDelegationTaskWire,
        DeferredTeamDelegationTaskWire
      ]
    | [
        DeferredTeamDelegationTaskWire,
        DeferredTeamDelegationTaskWire,
        DeferredTeamDelegationTaskWire,
        DeferredTeamDelegationTaskWire,
        DeferredTeamDelegationTaskWire,
        DeferredTeamDelegationTaskWire,
        DeferredTeamDelegationTaskWire
      ]
    | [
        DeferredTeamDelegationTaskWire,
        DeferredTeamDelegationTaskWire,
        DeferredTeamDelegationTaskWire,
        DeferredTeamDelegationTaskWire,
        DeferredTeamDelegationTaskWire,
        DeferredTeamDelegationTaskWire,
        DeferredTeamDelegationTaskWire,
        DeferredTeamDelegationTaskWire
      ];
}
export interface DeferredTeamDelegationTaskWire {
  id: string;
  graph_node_id: string;
  target_participant_id: string;
  target_session_id: string;
  prompt: string;
  /**
   * @maxItems 7
   */
  depends_on_task_ids:
    | []
    | [string]
    | [string, string]
    | [string, string, string]
    | [string, string, string, string]
    | [string, string, string, string, string]
    | [string, string, string, string, string, string]
    | [string, string, string, string, string, string, string];
  child_input_id: string;
  child_turn_id: string;
  child_job_id: string;
  input_idempotency_key: string;
  job_idempotency_key: string;
  execution_binding: JsonValue;
  max_steps: NullableInteger;
  priority: NullableInteger;
}
export interface FinishToolExecutionCommand {
  command: "finish-tool-execution";
  request: FinishToolExecutionWire;
}
export interface FinishToolExecutionWire {
  session_id: string;
  turn_id: string;
  session_attempt_id: string;
  input_id: string;
  job_id: string;
  worker_id: string;
  lease_token: string;
  execution_id: string;
  invocation_attempt_id: string;
  state: "succeeded" | "failed" | "cancelled";
  content: NullableToolResultContentWire;
  content_digest: NullableString;
  is_error: NullableBoolean;
  result_presentation: ToolActivityPresentationWire | null;
  error: JsonValue;
}
export interface ToolResultTextContentPartWire {
  type: "text";
  text: string;
}
export interface ToolResultJsonContentPartWire {
  type: "json";
  value: JsonValue;
}
export interface ToolResultResourceContentPartWire {
  type: "resource";
  resource_id: string;
  sha256: string;
  size_bytes: number;
  kind: ResourceKindWire;
  media_type: NullableString;
}
export interface RequireToolExecutionRecoveryCommand {
  command: "require-tool-execution-recovery";
  request: RequireToolExecutionRecoveryWire;
}
export interface RequireToolExecutionRecoveryWire {
  session_id: string;
  turn_id: string;
  session_attempt_id: string;
  input_id: string;
  job_id: string;
  worker_id: string;
  lease_token: string;
  execution_id: string;
  invocation_attempt_id: string;
  evidence: JsonValue;
}
export interface ResolveToolExecutionRecoveryCommand {
  command: "resolve-tool-execution-recovery";
  request: ResolveToolExecutionRecoveryWire;
}
export interface ResolveToolExecutionRecoveryWire {
  execution_id: string;
  expected_recovery_revision: number;
  decision: ToolExecutionRecoveryDecisionWire;
  principal_id: string;
  reason: string;
  idempotency_key: string;
  content: NullableToolResultContentWire;
  content_digest: NullableString;
  error: JsonValue;
}
export interface ResolveToolExecutionApprovalCommand {
  command: "resolve-tool-execution-approval";
  request: ResolveToolExecutionApprovalWire;
}
export interface ResolveToolExecutionApprovalWire {
  execution_id: string;
  expected_approval_revision: number;
  decision: ToolExecutionApprovalDecisionWire;
  principal_id: string;
  reason: string;
  idempotency_key: string;
}
export interface GetToolExecutionCommand {
  command: "get-tool-execution";
  execution_id: string;
}
export interface GetToolExecutionByCallCommand {
  command: "get-tool-execution-by-call";
  request: GetToolExecutionByCallWire;
}
export interface GetToolExecutionByCallWire {
  turn_id: string;
  source_message_id: string;
  tool_call_id: string;
}
export interface ListToolExecutionsCommand {
  command: "list-tool-executions";
  request: ListToolExecutionsWire;
}
export interface ListToolExecutionsWire {
  session_id: NullableString;
  turn_id: NullableString;
  state: NullableToolExecutionStateWire;
  limit: NullableInteger;
}
export interface ListToolActivitiesCommand {
  command: "list-tool-activities";
  request: ListToolActivitiesWire;
}
export interface ListToolActivitiesWire {
  session_id: string;
  /**
   * @minItems 1
   * @maxItems 200
   */
  source_message_ids: [string, ...string[]];
}
export interface ListToolExecutionAttemptsCommand {
  command: "list-tool-execution-attempts";
  request: ListToolExecutionAttemptsWire;
}
export interface ListToolExecutionAttemptsWire {
  execution_id: string;
}
export interface PutWorkspaceChangeSetCommand {
  command: "put-workspace-change-set";
  request: PutWorkspaceChangeSetWire;
}
export interface PutWorkspaceChangeSetWire {
  workspace_id: string;
  principal_id: string;
  changeset: JsonValue;
}
export interface GetWorkspaceChangeSetCommand {
  command: "get-workspace-change-set";
  change_set_id: string;
}
export interface ListWorkspaceChangeSetsCommand {
  command: "list-workspace-change-sets";
  request: ListWorkspaceChangeSetsWire;
}
export interface ListWorkspaceChangeSetsWire {
  workspace_id: NullableString;
  state: NullableWorkspaceChangeSetStateWire;
  limit: NullableInteger;
}
export interface RecordWorkspaceChangeOperationCommand {
  command: "record-workspace-change-operation";
  request: RecordWorkspaceChangeOperationWire;
}
export interface RecordWorkspaceChangeOperationWire {
  id: NullableString;
  changeset_id: string;
  operation: WorkspaceChangeOperationWire;
  receipt: JsonValue;
}
export interface ListWorkspaceChangeOperationsCommand {
  command: "list-workspace-change-operations";
  request: ListWorkspaceChangeOperationsWire;
}
export interface ListWorkspaceChangeOperationsWire {
  changeset_id: string;
}
export interface PutWorkspaceChangeProposalCommand {
  command: "put-workspace-change-proposal";
  request: PutWorkspaceChangeProposalWire;
}
export interface PutWorkspaceChangeProposalWire {
  id: NullableString;
  workspace_id: string;
  changeset_id: string;
  principal_id: string;
  title: NullableString;
  summary: NullableString;
  metadata: JsonValue;
  idempotency_key: NullableString;
}
export interface GetWorkspaceChangeProposalCommand {
  command: "get-workspace-change-proposal";
  proposal_id: string;
}
export interface ListWorkspaceChangeProposalsCommand {
  command: "list-workspace-change-proposals";
  request: ListWorkspaceChangeProposalsWire;
}
export interface ListWorkspaceChangeProposalsWire {
  workspace_id: NullableString;
  state: NullableWorkspaceChangeProposalStateWire;
  changeset_id: NullableString;
  limit: NullableInteger;
}
export interface RecordWorkspaceChangeProposalOperationCommand {
  command: "record-workspace-change-proposal-operation";
  request: RecordWorkspaceChangeProposalOperationWire;
}
export interface RecordWorkspaceChangeProposalOperationWire {
  id: NullableString;
  proposal_id: string;
  operation: WorkspaceChangeProposalOperationWire;
  actor_id: string;
  reason: NullableString;
  metadata: JsonValue;
}
export interface ListWorkspaceChangeProposalOperationsCommand {
  command: "list-workspace-change-proposal-operations";
  request: ListWorkspaceChangeProposalOperationsWire;
}
export interface ListWorkspaceChangeProposalOperationsWire {
  proposal_id: string;
}
export interface CreatePlanProposalCommand {
  command: "create-plan-proposal";
  request: CreatePlanProposalWire;
}
export interface CreatePlanProposalWire {
  id: NullableString;
  principal_id: string;
  source: PlanProposalSourceWire;
  generation: PlanProposalGenerationWire;
  content: PlanProposalContentWire;
  idempotency_key: string;
}
export interface PlanProposalSourceWire {
  session_id: string;
  head_sequence: number;
  head_message_id: NullableString;
  head_turn_id: NullableString;
  analysis_input_digest: string;
  planning_request: JsonValue;
}
export interface PlanProposalGenerationWire {
  endpoint_id: string;
  endpoint_digest: string;
  protocol_id: string;
  provider_id: string;
  model_id: string;
  generated_at: number;
  output_digest: string;
  output: JsonValue;
}
export interface PlanProposalContentWire {
  title: string;
  summary: string;
  /**
   * @minItems 1
   * @maxItems 256
   */
  steps: [PlanProposalStepWire, ...PlanProposalStepWire[]];
  /**
   * @maxItems 256
   */
  references: PlanProposalReferenceWire[];
}
export interface PlanProposalStepWire {
  id: string;
  title: string;
  detail: NullableString;
  metadata: JsonValue;
}
export interface PlanProposalReferenceWire {
  kind: PlanReferenceKindWire;
  reference_id: string;
  role: NullableString;
  metadata: JsonValue;
}
export interface GetPlanProposalCommand {
  command: "get-plan-proposal";
  proposal_id: string;
}
export interface ListPlanProposalsCommand {
  command: "list-plan-proposals";
  request: ListPlanProposalsWire;
}
export interface ListPlanProposalsWire {
  principal_id: NullableString;
  source_session_id: NullableString;
  state: NullablePlanProposalStateWire;
  reference_kind: NullablePlanReferenceKindWire;
  reference_id: NullableString;
  limit: NullableInteger;
}
export interface RecordPlanProposalOperationCommand {
  command: "record-plan-proposal-operation";
  request: RecordPlanProposalOperationWire;
}
export interface RecordPlanProposalOperationWire {
  id: NullableString;
  proposal_id: string;
  operation: PlanProposalOperationWire;
  expected_revision: number;
  actor_kind: "human";
  actor_id: string;
  content: NullablePlanProposalContentWire;
  reason: NullableString;
  idempotency_key: string;
}
export interface ExecuteApprovedPlanCommand {
  command: "execute-approved-plan";
  request: ExecuteApprovedPlanWire;
}
export interface ExecuteApprovedPlanWire {
  proposal_id: string;
  expected_revision: number;
  idempotency_key: string;
  turn: SubmitSessionTurnWire;
}
export interface ListPlanProposalOperationsCommand {
  command: "list-plan-proposal-operations";
  request: ListPlanProposalOperationsWire;
}
export interface ListPlanProposalOperationsWire {
  proposal_id: string;
}
export interface CreateObjectiveCommand {
  command: "create-objective";
  request: CreateObjectiveWire;
}
export interface CreateObjectiveWire {
  id: NullableString;
  session_id: string;
  principal_id: string;
  objective: string;
  boundaries: JsonValue;
  constraints: JsonValue;
  success_criteria: JsonValue;
  verification_policy: JsonValue;
  stop_policy: JsonValue;
  idempotency_key: string;
}
export interface GetObjectiveCommand {
  command: "get-objective";
  objective_id: string;
}
export interface ListObjectivesCommand {
  command: "list-objectives";
  request: ListObjectivesWire;
}
export interface ListObjectivesWire {
  session_id: NullableString;
  principal_id: NullableString;
  states: NullableObjectiveStatesWire;
  limit: NullableInteger;
}
export interface PauseObjectiveCommand {
  command: "pause-objective";
  request: ChangeObjectiveStateWire;
}
export interface ChangeObjectiveStateWire {
  objective_id: string;
  expected_revision: number;
  reason: NullableString;
  idempotency_key: string;
}
export interface ResumeObjectiveCommand {
  command: "resume-objective";
  request: ChangeObjectiveStateWire;
}
export interface AdmitObjectiveAttemptCommand {
  command: "admit-objective-attempt";
  request: AdmitObjectiveAttemptWire;
}
export interface AdmitObjectiveAttemptWire {
  objective_id: string;
  expected_revision: number;
  trigger: ObjectiveAttemptTriggerWire;
  idempotency_key: string;
  turn: SubmitSessionTurnWire;
}
export interface ReviewObjectiveAttemptCommand {
  command: "review-objective-attempt";
  request: ReviewObjectiveAttemptWire;
}
export interface ReviewObjectiveAttemptWire {
  id: NullableString;
  objective_id: string;
  attempt_id: string;
  expected_revision: number;
  disposition: ObjectiveAttemptDispositionWire;
  reason: NullableString;
  verifications: JsonValue;
  idempotency_key: string;
}
export interface RequestObjectiveCancelCommand {
  command: "request-objective-cancel";
  request: RequestObjectiveCancelWire;
}
export interface RequestObjectiveCancelWire {
  objective_id: string;
  expected_revision: number;
  reason: string;
  idempotency_key: string;
}
export interface ReconcileObjectiveCancellationCommand {
  command: "reconcile-objective-cancellation";
  request: ReconcileObjectiveCancellationWire;
}
export interface ReconcileObjectiveCancellationWire {
  objective_id: string;
  attempt_id: string;
  expected_revision: number;
  idempotency_key: string;
}
export interface ListObjectiveAttemptsCommand {
  command: "list-objective-attempts";
  request: ListObjectiveAttemptsWire;
}
export interface ListObjectiveAttemptsWire {
  objective_id: string;
  limit: NullableInteger;
}
export interface ListObjectiveAttemptReviewsCommand {
  command: "list-objective-attempt-reviews";
  request: ListObjectiveAttemptReviewsWire;
}
export interface ListObjectiveAttemptReviewsWire {
  objective_id: string;
  attempt_id: NullableString;
  limit: NullableInteger;
}
export interface ListObjectiveVerificationsCommand {
  command: "list-objective-verifications";
  request: ListObjectiveVerificationsWire;
}
export interface ListObjectiveVerificationsWire {
  objective_id: string;
  attempt_id: NullableString;
  requirement_id: NullableString;
  result: NullableObjectiveVerificationResultWire;
  limit: NullableInteger;
}
export interface PutDelegationGraphCommand {
  command: "put-delegation-graph";
  request: PutDelegationGraphWire;
}
export interface PutDelegationGraphWire {
  id: NullableString;
  principal_id: string;
  title: NullableString;
  metadata: JsonValue;
  idempotency_key: NullableString;
}
export interface GetDelegationGraphCommand {
  command: "get-delegation-graph";
  graph_id: string;
}
export interface ListDelegationGraphsCommand {
  command: "list-delegation-graphs";
  request: ListDelegationGraphsWire;
}
export interface ListDelegationGraphsWire {
  principal_id: NullableString;
  state: NullableDelegationGraphStateWire;
  limit: NullableInteger;
}
export interface PutDelegationGraphNodeCommand {
  command: "put-delegation-graph-node";
  request: PutDelegationGraphNodeWire;
}
export interface PutDelegationGraphNodeWire {
  id: NullableString;
  graph_id: string;
  kind: DelegationNodeKindWire;
  principal_id: string;
  payload: JsonValue;
  metadata: JsonValue;
  idempotency_key: NullableString;
}
export interface GetDelegationGraphNodeCommand {
  command: "get-delegation-graph-node";
  request: GetDelegationGraphNodeWire;
}
export interface GetDelegationGraphNodeWire {
  node_id: string;
}
export interface ListDelegationGraphNodesCommand {
  command: "list-delegation-graph-nodes";
  request: ListDelegationGraphNodesWire;
}
export interface ListDelegationGraphNodesWire {
  graph_id: string;
  state: NullableDelegationNodeStateWire;
}
export interface PutDelegationGraphDependencyCommand {
  command: "put-delegation-graph-dependency";
  request: PutDelegationGraphDependencyWire;
}
export interface PutDelegationGraphDependencyWire {
  id: NullableString;
  graph_id: string;
  from_node_id: string;
  to_node_id: string;
  kind: NullableDelegationDependencyKindWire;
}
export interface ListDelegationGraphDependenciesCommand {
  command: "list-delegation-graph-dependencies";
  request: ListDelegationGraphDependenciesWire;
}
export interface ListDelegationGraphDependenciesWire {
  graph_id: string;
}
export interface UpdateDelegationGraphStateCommand {
  command: "update-delegation-graph-state";
  request: UpdateDelegationGraphStateWire;
}
export interface UpdateDelegationGraphStateWire {
  graph_id: string;
  state: DelegationGraphStateWire;
}
export interface UpdateDelegationGraphNodeStateCommand {
  command: "update-delegation-graph-node-state";
  request: UpdateDelegationGraphNodeStateWire;
}
export interface UpdateDelegationGraphNodeStateWire {
  node_id: string;
  state: DelegationNodeStateWire;
  scheduler_job_id: NullableString;
  metadata: JsonValue;
}
export interface AttachDelegationGraphNodeJobCommand {
  command: "attach-delegation-graph-node-job";
  request: AttachDelegationGraphNodeJobWire;
}
export interface AttachDelegationGraphNodeJobWire {
  node_id: string;
  scheduler_job_id: string;
}
export interface ListReadyDelegationGraphNodesCommand {
  command: "list-ready-delegation-graph-nodes";
  request: ListReadyDelegationGraphNodesWire;
}
export interface ListReadyDelegationGraphNodesWire {
  graph_id: string;
  limit: NullableInteger;
}
export interface MaterializeReadyDelegationGraphNodeCommand {
  command: "materialize-ready-delegation-graph-node";
  request: MaterializeReadyDelegationGraphNodeWire;
}
export interface MaterializeReadyDelegationGraphNodeWire {
  graph_id: string;
  node_id: NullableString;
  worker_id: string;
  job_id: NullableString;
  job_kind: SchedulerJobKindWire;
  job_payload: JsonValue;
  scheduled_at: NullableInteger;
  not_before: NullableInteger;
  priority: NullableInteger;
  max_attempts: NullableInteger;
  retry_policy: NullableRetryPolicyWire;
  job_idempotency_key: NullableString;
  budget_grant_id: NullableString;
}
export interface PutTeamConversationCommand {
  command: "put-team-conversation";
  request: PutTeamConversationWire;
}
export interface PutTeamConversationWire {
  id: NullableString;
  principal_id: string;
  title: NullableString;
  mode: NullableTeamConversationModeWire;
  metadata: JsonValue;
  idempotency_key: NullableString;
}
export interface GetTeamConversationCommand {
  command: "get-team-conversation";
  conversation_id: string;
}
export interface ListTeamConversationsCommand {
  command: "list-team-conversations";
  request: ListTeamConversationsWire;
}
export interface ListTeamConversationsWire {
  principal_id: NullableString;
  state: NullableTeamConversationStateWire;
  mode: NullableTeamConversationModeWire;
  limit: NullableInteger;
}
export interface UpdateTeamConversationStateCommand {
  command: "update-team-conversation-state";
  request: UpdateTeamConversationStateWire;
}
export interface UpdateTeamConversationStateWire {
  conversation_id: string;
  state: TeamConversationStateWire;
}
export interface SetTeamConversationLeadCommand {
  command: "set-team-conversation-lead";
  request: SetTeamConversationLeadWire;
}
export interface SetTeamConversationLeadWire {
  conversation_id: string;
  expected_lead_participant_id: NullableString;
  lead_participant_id: NullableString;
}
export interface PutTeamParticipantCommand {
  command: "put-team-participant";
  request: PutTeamParticipantWire;
}
export interface PutTeamParticipantWire {
  id: NullableString;
  conversation_id: string;
  principal_id: string;
  kind: TeamParticipantKindWire;
  display_name: NullableString;
  role: NullableString;
  agent_session_id: NullableString;
  metadata: JsonValue;
  idempotency_key: NullableString;
}
export interface ListTeamParticipantsCommand {
  command: "list-team-participants";
  request: ListTeamParticipantsWire;
}
export interface ListTeamParticipantsWire {
  conversation_id: string;
  state: NullableTeamParticipantStateWire;
}
export interface UpdateTeamParticipantStateCommand {
  command: "update-team-participant-state";
  request: UpdateTeamParticipantStateWire;
}
export interface UpdateTeamParticipantStateWire {
  participant_id: string;
  state: TeamParticipantStateWire;
}
export interface AdmitTeamMessageCommand {
  command: "admit-team-message";
  request: AdmitTeamMessageWire;
}
export interface AdmitTeamMessageWire {
  id: NullableString;
  conversation_id: string;
  author_participant_id: string;
  parent_message_id: NullableString;
  kind: NullableTeamMessageKindWire;
  targets: TeamTargetsWire;
  content: MessagePartsWire;
  metadata: JsonValue;
  idempotency_key: string;
}
export interface TeamTargetWire {
  kind: TeamTargetKindWire;
  participant_id: NullableString;
}
export interface GetTeamMessageCommand {
  command: "get-team-message";
  message_id: string;
}
export interface ListTeamMessagesCommand {
  command: "list-team-messages";
  request: ListTeamMessagesWire;
}
export interface ListTeamMessagesWire {
  conversation_id: string;
  state: NullableTeamMessageStateWire;
  after_created_at: NullableInteger;
  after_message_id: NullableString;
  limit: NullableInteger;
}
export interface RouteTeamMessageCommand {
  command: "route-team-message";
  request: RouteTeamMessageWire;
}
export interface RouteTeamMessageWire {
  id: NullableString;
  message_id: string;
  expected_revision: number;
  expected_lead_participant_id: NullableString;
  mode: TeamConversationModeWire;
  outcome: TeamRoutingOutcomeWire;
  actor_principal_id: string;
  reason: string;
  metadata: JsonValue;
  idempotency_key: string;
  deliveries: RouteTeamDeliveriesWire;
}
export interface RouteTeamDeliveryWire {
  id: NullableString;
  target_participant_id: string;
  role: TeamDeliveryRoleWire;
  trigger: TeamDeliveryTriggerWire;
  budget_grant_id: NullableString;
}
export interface GetTeamRoutingDecisionByMessageCommand {
  command: "get-team-routing-decision-by-message";
  message_id: string;
}
export interface ListTeamRoutingDecisionsCommand {
  command: "list-team-routing-decisions";
  request: ListTeamRoutingDecisionsWire;
}
export interface ListTeamRoutingDecisionsWire {
  conversation_id: NullableString;
  message_id: NullableString;
  limit: NullableInteger;
}
export interface ListTeamDeliveriesCommand {
  command: "list-team-deliveries";
  request: ListTeamDeliveriesWire;
}
export interface ListTeamDeliveriesWire {
  conversation_id: NullableString;
  message_id: NullableString;
  routing_decision_id: NullableString;
  state: NullableTeamDeliveryStateWire;
  limit: NullableInteger;
}
export interface GetTeamDiscussionRoundCommand {
  command: "get-team-discussion-round";
  round_id: string;
}
export interface ListTeamDiscussionRoundsCommand {
  command: "list-team-discussion-rounds";
  request: ListTeamDiscussionRoundsWire;
}
export interface ListTeamDiscussionRoundsWire {
  conversation_id: string;
  state: NullableTeamDiscussionRoundStateWire;
  after_created_at: NullableInteger;
  after_round_id: NullableString;
  limit: NullableInteger;
}
export interface GetTeamDelegationOperationCommand {
  command: "get-team-delegation-operation";
  operation_id: string;
}
export interface GetTeamDelegationOperationByToolExecutionCommand {
  command: "get-team-delegation-operation-by-tool-execution";
  tool_execution_id: string;
}
export interface ListTeamDelegationTasksCommand {
  command: "list-team-delegation-tasks";
  operation_id: string;
}
export interface ReadTeamConversationPageCommand {
  command: "read-team-conversation-page";
  request: ReadTeamConversationPageWire;
}
export interface ReadTeamConversationPageWire {
  conversation_id: string;
  before_created_at: NullableInteger;
  before_message_id: NullableString;
  limit: NullableInteger;
}
export interface GetTeamDeliveryMaterializationContextCommand {
  command: "get-team-delivery-materialization-context";
  delivery_id: string;
}
export interface MaterializeTeamDeliveryCommand {
  command: "materialize-team-delivery";
  request: MaterializeTeamDeliveryWire;
}
export interface MaterializeTeamDeliveryWire {
  delivery_id: string;
  dispatch_job_id: string;
  worker_id: string;
  lease_token: string;
  execution_binding: JsonValue;
  max_steps: NullableInteger;
  child_priority: NullableInteger;
}
export interface FailTeamDeliveryMaterializationCommand {
  command: "fail-team-delivery-materialization";
  request: FailTeamDeliveryMaterializationWire;
}
export interface FailTeamDeliveryMaterializationWire {
  delivery_id: string;
  dispatch_job_id: string;
  worker_id: string;
  lease_token: string;
  error: JsonValue;
}
export interface ProjectTeamDeliveryOutcomeCommand {
  command: "project-team-delivery-outcome";
  request: ProjectTeamDeliveryOutcomeWire;
}
export interface ProjectTeamDeliveryOutcomeWire {
  delivery_id: string;
  outcome_job_id: string;
  worker_id: string;
  lease_token: string;
}
export interface PutPluginManifestCommand {
  command: "put-plugin-manifest";
  request: PutPluginManifestWire;
}
export interface PutPluginManifestWire {
  id: NullableString;
  plugin_id: string;
  version: string;
  name: NullableString;
  entry: JsonValue;
  capabilities: PluginCapabilitiesWire;
  metadata: JsonValue;
  idempotency_key: NullableString;
}
export interface GetPluginManifestCommand {
  command: "get-plugin-manifest";
  request: GetPluginManifestWire;
}
export interface GetPluginManifestWire {
  plugin_id: string;
  version: NullableString;
}
export interface ListPluginManifestsCommand {
  command: "list-plugin-manifests";
  request: ListPluginManifestsWire;
}
export interface ListPluginManifestsWire {
  state: NullablePluginManifestStateWire;
  capability: NullablePluginCapabilityWire;
  limit: NullableInteger;
}
export interface PutPluginInstallCommand {
  command: "put-plugin-install";
  request: PutPluginInstallWire;
}
export interface PutPluginInstallWire {
  id: NullableString;
  plugin_id: string;
  version: string;
  layout: JsonValue;
  trust: JsonValue;
  install_root_dir: string;
  metadata: JsonValue;
  idempotency_key: NullableString;
}
export interface ActivatePluginInstallCommand {
  command: "activate-plugin-install";
  request: ActivatePluginInstallWire;
}
export interface ActivatePluginInstallWire {
  manifest: PutPluginManifestWire;
  install: PutPluginInstallWire;
}
export interface GetPluginInstallCommand {
  command: "get-plugin-install";
  request: GetPluginInstallWire;
}
export interface GetPluginInstallWire {
  plugin_id: string;
  version: NullableString;
}
export interface ListPluginInstallsCommand {
  command: "list-plugin-installs";
  request: ListPluginInstallsWire;
}
export interface ListPluginInstallsWire {
  plugin_id: NullableString;
  state: NullablePluginInstallStateWire;
  limit: NullableInteger;
}
export interface UpdatePluginInstallStateCommand {
  command: "update-plugin-install-state";
  request: UpdatePluginInstallStateWire;
}
export interface UpdatePluginInstallStateWire {
  plugin_id: string;
  version: string;
  expected_state: PluginInstallStateWire;
  state: PluginInstallStateWire;
}
export interface UpdatePluginManifestStateCommand {
  command: "update-plugin-manifest-state";
  request: UpdatePluginManifestStateWire;
}
export interface UpdatePluginManifestStateWire {
  plugin_id: string;
  version: string;
  state: PluginManifestStateWire;
}
export interface GetPluginActionExecutionAdmissionCommand {
  command: "get-plugin-action-execution-admission";
  request: GetPluginActionExecutionAdmissionWire;
}
export interface GetPluginActionExecutionAdmissionWire {
  plugin_id: string;
  version: string;
  required_capability: PluginCapabilityWire;
}
export interface SubmitPluginActionCommand {
  command: "submit-plugin-action";
  request: SubmitPluginActionWire;
}
export interface SubmitPluginActionWire {
  plugin_id: string;
  version: string;
  action_id: string;
  principal_id: string;
  payload: JsonValue;
  required_capability: NullablePluginCapabilityWire;
  job_id: NullableString;
  job_idempotency_key: NullableString;
  scheduled_at: NullableInteger;
  not_before: NullableInteger;
  priority: NullableInteger;
  max_attempts: NullableInteger;
  retry_policy: NullableRetryPolicyWire;
  budget_grant_id: NullableString;
}
export interface PutConnectorRegistrationCommand {
  command: "put-connector-registration";
  request: PutConnectorRegistrationWire;
}
export interface PutConnectorRegistrationWire {
  id: NullableString;
  connector_id: string;
  plugin_id: string;
  version: NullableString;
  metadata: JsonValue;
  idempotency_key: NullableString;
}
export interface ListConnectorRegistrationsCommand {
  command: "list-connector-registrations";
  request: ListConnectorRegistrationsWire;
}
export interface ListConnectorRegistrationsWire {
  connector_id: NullableString;
  plugin_id: NullableString;
  state: NullableConnectorRegistrationStateWire;
  limit: NullableInteger;
}
export interface UpdateConnectorRegistrationStateCommand {
  command: "update-connector-registration-state";
  request: UpdateConnectorRegistrationStateWire;
}
export interface UpdateConnectorRegistrationStateWire {
  connector_id: string;
  state: ConnectorRegistrationStateWire;
}
export interface PutConnectorCredentialCommand {
  command: "put-connector-credential";
  request: PutConnectorCredentialWire;
}
export interface PutConnectorCredentialWire {
  id: NullableString;
  connector_id: string;
  kind: string;
  secret_ref: string;
  metadata: JsonValue;
  idempotency_key: NullableString;
}
export interface ListConnectorCredentialsCommand {
  command: "list-connector-credentials";
  request: ListConnectorCredentialsWire;
}
export interface ListConnectorCredentialsWire {
  connector_id: NullableString;
  state: NullableConnectorCredentialStateWire;
  limit: NullableInteger;
}
export interface RevokeConnectorCredentialCommand {
  command: "revoke-connector-credential";
  request: RevokeConnectorCredentialWire;
}
export interface RevokeConnectorCredentialWire {
  credential_id: string;
}
export interface StartConnectorSessionCommand {
  command: "start-connector-session";
  request: StartConnectorSessionWire;
}
export interface StartConnectorSessionWire {
  id: NullableString;
  connector_id: string;
  credential_id: string;
  owner_id: string;
  lease_ms: number;
  state: NullableConnectorLiveSessionStateWire;
  metadata: JsonValue;
  idempotency_key: NullableString;
}
export interface HeartbeatConnectorSessionCommand {
  command: "heartbeat-connector-session";
  request: HeartbeatConnectorSessionWire;
}
export interface HeartbeatConnectorSessionWire {
  session_id: string;
  owner_id: string;
  lease_token: string;
  lease_ms: number;
  state: NullableConnectorLiveSessionStateWire;
  metadata: JsonValue;
}
export interface FinishConnectorSessionCommand {
  command: "finish-connector-session";
  request: FinishConnectorSessionWire;
}
export interface FinishConnectorSessionWire {
  session_id: string;
  owner_id: string;
  lease_token: string;
  state: ConnectorFinishedSessionStateWire;
  metadata: JsonValue;
  error: JsonValue;
}
export interface ListConnectorSessionsCommand {
  command: "list-connector-sessions";
  request: ListConnectorSessionsWire;
}
export interface ListConnectorSessionsWire {
  connector_id: NullableString;
  state: NullableConnectorSessionStateWire;
  owner_id: NullableString;
  limit: NullableInteger;
}
export interface PutChannelBindingCommand {
  command: "put-channel-binding";
  request: PutChannelBindingWire;
}
export interface PutChannelBindingWire {
  id: NullableString;
  connector_id: string;
  channel_kind: string;
  channel_id: string;
  external_identity_id: string;
  principal_id: string;
  display_name: NullableString;
  metadata: JsonValue;
  idempotency_key: NullableString;
}
export interface ListChannelBindingsCommand {
  command: "list-channel-bindings";
  request: ListChannelBindingsWire;
}
export interface ListChannelBindingsWire {
  connector_id: NullableString;
  channel_kind: NullableString;
  channel_id: NullableString;
  principal_id: NullableString;
  external_identity_id: NullableString;
  state: NullableChannelBindingStateWire;
  limit: NullableInteger;
}
export interface RevokeChannelBindingCommand {
  command: "revoke-channel-binding";
  request: RevokeChannelBindingWire;
}
export interface RevokeChannelBindingWire {
  binding_id: string;
}
export interface IngestChannelInboundEventCommand {
  command: "ingest-channel-inbound-event";
  request: IngestChannelInboundEventWire;
}
export interface IngestChannelInboundEventWire {
  id: NullableString;
  connector_id: string;
  channel_kind: string;
  channel_id: string;
  external_event_id: string;
  external_thread_id: NullableString;
  sender_external_identity_id: string;
  principal_id: NullableString;
  payload: JsonValue;
  metadata: JsonValue;
  received_at: NullableInteger;
  idempotency_key: NullableString;
}
export interface ListChannelInboundEventsCommand {
  command: "list-channel-inbound-events";
  request: ListChannelInboundEventsWire;
}
export interface ListChannelInboundEventsWire {
  connector_id: NullableString;
  channel_kind: NullableString;
  channel_id: NullableString;
  state: NullableChannelInboundEventStateWire;
  after_received_at: NullableInteger;
  limit: NullableInteger;
}
export interface UpdateChannelInboundEventStateCommand {
  command: "update-channel-inbound-event-state";
  request: UpdateChannelInboundEventStateWire;
}
export interface UpdateChannelInboundEventStateWire {
  event_id: string;
  state: ChannelInboundEventStateWire;
  metadata: JsonValue;
}
export interface SubmitChannelDeliveryCommand {
  command: "submit-channel-delivery";
  request: SubmitChannelDeliveryWire;
}
export interface SubmitChannelDeliveryWire {
  id: NullableString;
  connector_id: string;
  channel_kind: string;
  channel_id: string;
  target_external_identity_id: NullableString;
  external_thread_id: NullableString;
  principal_id: string;
  payload: JsonValue;
  metadata: JsonValue;
  job_id: NullableString;
  idempotency_key: NullableString;
  scheduled_at: NullableInteger;
  not_before: NullableInteger;
  priority: NullableInteger;
  max_attempts: NullableInteger;
  retry_policy: NullableRetryPolicyWire;
  budget_grant_id: NullableString;
}
export interface CompleteChannelDeliveryCommand {
  command: "complete-channel-delivery";
  request: CompleteChannelDeliveryWire;
}
export interface CompleteChannelDeliveryWire {
  delivery_id: string;
  worker_id: string;
  lease_token: string;
  result: JsonValue;
  metadata: JsonValue;
}
export interface FailChannelDeliveryCommand {
  command: "fail-channel-delivery";
  request: FailChannelDeliveryWire;
}
export interface FailChannelDeliveryWire {
  delivery_id: string;
  worker_id: string;
  lease_token: string;
  error: JsonValue;
  metadata: JsonValue;
}
export interface ProjectChannelInboundEventCommand {
  command: "project-channel-inbound-event";
  request: ProjectChannelInboundEventWire;
}
export interface ProjectChannelInboundEventWire {
  id: NullableString;
  inbound_event_id: string;
  target: JsonValue;
  metadata: JsonValue;
  idempotency_key: NullableString;
}
export interface ListChannelProjectionsCommand {
  command: "list-channel-projections";
  request: ListChannelProjectionsWire;
}
export interface ListChannelProjectionsWire {
  inbound_event_id: NullableString;
  target_kind: NullableChannelProjectionTargetKindWire;
  limit: NullableInteger;
}
export interface SubmitMediaGenerationCommand {
  command: "submit-media-generation";
  request: MediaGenerationSubmitWire;
}
export interface MediaGenerationSubmitWire {
  id: NullableString;
  job_id: NullableString;
  principal_id: string;
  idempotency_key: string;
  binding: JsonValue;
  priority: NullableInteger;
}
export interface BeginMediaGenerationCommand {
  command: "begin-media-generation";
  request: MediaGenerationLeaseWire;
}
export interface MediaGenerationLeaseWire {
  operation_id: string;
  worker_id: string;
  lease_token: string;
}
export interface AcceptMediaGenerationCommand {
  command: "accept-media-generation";
  request: MediaGenerationAcceptWire;
}
export interface MediaGenerationAcceptWire {
  operation_id: string;
  worker_id: string;
  lease_token: string;
  external_operation_id: string;
  provider_checkpoint: JsonValue;
}
export interface SuspendMediaGenerationCommand {
  command: "suspend-media-generation";
  request: MediaGenerationSuspendWire;
}
export interface MediaGenerationSuspendWire {
  operation_id: string;
  worker_id: string;
  lease_token: string;
  next_poll_at: number;
  outcome: MediaGenerationSuspensionOutcomeWire;
  provider_checkpoint: JsonValue;
  progress: JsonValue;
  error: JsonValue;
}
export interface RecordMediaGenerationOutputsCommand {
  command: "record-media-generation-outputs";
  request: MediaGenerationOutputsWire;
}
export interface MediaGenerationOutputsWire {
  operation_id: string;
  worker_id: string;
  lease_token: string;
  poll_outcome: MediaGenerationTerminalPollOutcomeWire;
  output_references: JsonValue[];
  progress: JsonValue;
}
export interface CompleteMediaGenerationCommand {
  command: "complete-media-generation";
  request: MediaGenerationCompleteWire;
}
export interface MediaGenerationCompleteWire {
  operation_id: string;
  worker_id: string;
  lease_token: string;
  poll_outcome: MediaGenerationTerminalPollOutcomeWire;
  output_resource_ids: string[];
  result: JsonValue;
}
export interface SettleMediaGenerationCommand {
  command: "settle-media-generation";
  request: MediaGenerationSettleWire;
}
export interface MediaGenerationSettleWire {
  operation_id: string;
  worker_id: string;
  lease_token: string;
  poll_outcome: MediaGenerationTerminalPollOutcomeWire;
  outcome: "failed" | "cancelled" | "recovery_required";
  error: JsonValue;
  reason: NullableString;
}
export interface RequestMediaGenerationCancelCommand {
  command: "request-media-generation-cancel";
  request: MediaGenerationCancelWire;
}
export interface MediaGenerationCancelWire {
  operation_id: string;
  reason: string;
}
export interface GetMediaGenerationCommand {
  command: "get-media-generation";
  operation_id: string;
}
export interface ListMediaGenerationCommand {
  command: "list-media-generation";
  request: MediaGenerationListWire;
}
export interface MediaGenerationListWire {
  principal_id: NullableString;
  state: NullableMediaGenerationOperationStateWire;
  limit: NullableUnsigned32;
}
export interface StorageRpcSuccessEnvelope {
  storage_rpc_version: StorageRpcVersion;
  request_id: StorageRpcRequestId;
  ok: true;
  value: StorageRpcDescriptor | JsonValue;
}
export interface StorageRpcDescriptor {
  selected_version: StorageRpcVersion;
  /**
   * @minItems 1
   */
  supported_versions: [StorageRpcVersion, ...StorageRpcVersion[]];
  service_version: string;
  schema_sha256: string;
  capabilities: StorageRpcCapability[];
}
export interface StorageRpcErrorEnvelope {
  storage_rpc_version: StorageRpcVersion;
  request_id: StorageRpcRequestId | null;
  ok: false;
  error: StorageRpcError;
}
export interface StorageRpcError {
  code: StorageRpcErrorCode;
  message: string;
}

export const STORAGE_RPC_SCHEMA_SHA256 = "d735e9c1c9c0f9f37517f8d1085058835dcc9079de0278d6bb6c0dbab2d495a6" as const
