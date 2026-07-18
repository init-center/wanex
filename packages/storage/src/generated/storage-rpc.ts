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
  | ChannelStorageRpcCommand;
export type RuntimeStorageRpcCommand =
  | AppendEventCommand
  | QueryEventsCommand
  | PutConfigCommand
  | GetConfigCommand
  | WriteAtomicFileCommand
  | IngestResourceCommand
  | GetResourceCommand
  | ListResourcesCommand
  | CreateResourceTicketCommand
  | CleanupExpiredResourceTicketsCommand
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
export type NullableResourceKindWire = ResourceKindWire | null;
export type ResourceKindWire = "file" | "image" | "video" | "audio" | "document" | "artifact" | "log" | "patch" | "url";
export type NullableResourceOriginWire = ResourceOriginWire | null;
export type ResourceOriginWire =
  "user_upload" | "model_output" | "tool_output" | "provider_file" | "remote_url" | "system";
export type NullableResourceSourceWire = ResourceSourceWire | null;
export type NullableResourceStateWire = ResourceStateWire | null;
export type ResourceStateWire = "pending" | "fetching" | "available" | "failed" | "expired" | "deleted";
export type SessionsStorageRpcCommand =
  | CreateSessionCommand
  | GetSessionCommand
  | ListSessionsCommand
  | AdmitSessionInputCommand
  | SubmitSessionRunCommand
  | InterruptSessionRunCommand
  | SteerSessionRunCommand
  | ListSessionRunControlsCommand
  | ApplySessionRunControlCommand
  | ListSessionInputsCommand
  | ListSessionMessagesCommand
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
export type NullableSessionRunModeWire = SessionRunModeWire | null;
export type SessionRunModeWire = "once" | "to_completion";
export type NullableRetryPolicyWire = RetryPolicyWire | null;
export type NullableJsonObjectWire = JsonObjectWire | null;
export type NullableSessionRunControlKindWire = SessionRunControlKindWire | null;
export type SessionRunControlKindWire = "interrupt" | "steer";
export type NullableSessionRunControlStatusWire = SessionRunControlStatusWire | null;
export type SessionRunControlStatusWire = "pending" | "applied" | "rejected" | "cancelled";
export type ContextStorageRpcCommand =
  | PutContextEpochCommand
  | ActivateContextEpochCommand
  | CloneContextEpochCommand
  | PruneContextEpochsCommand
  | ListContextEpochsCommand
  | GetActiveContextEpochCommand
  | PutContextReplacementCommand
  | ListContextReplacementsCommand;
export type NullableContextEpochStateWire = ContextEpochStateWire | null;
export type ContextEpochStateWire = "building" | "active" | "superseded";
export type NullableBoolean = boolean | null;
export type ContextReplacementTierWire = "tier1_snip" | "tier2_placeholder";
export type SchedulerStorageRpcCommand =
  | ClaimRunnerCommand
  | HeartbeatRunnerCommand
  | CompleteRunCommand
  | FailRunCommand
  | ReleaseRunnerCommand
  | CancelRunCommand
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
export type NullableMessagePartsWire = MessagePartsWire | null;
export type BudgetScopeKindWire = "session" | "turn" | "team_round" | "plugin" | "principal" | "provider_model";
export type NullableBudgetWindowKindWire = BudgetWindowKindWire | null;
export type BudgetWindowKindWire = "run" | "session" | "day" | "month";
export type SchedulerJobKindWire =
  | "session.run"
  | "workspace.task"
  | "team.delivery"
  | "team.round.close"
  | "plugin.action"
  | "channel.delivery"
  | "tool.deferred_result"
  | "gateway.delivery"
  | "memory.compaction"
  | "resource.cleanup"
  | "budget.grant_expire"
  | "provider.retry"
  | "config.sync";
export type NullableSchedulerJobKindsWire = SchedulerJobKindsWire | null;
export type SchedulerJobKindsWire = SchedulerJobKindWire[];
export type NullableSchedulerJobStateWire = SchedulerJobStateWire | null;
export type SchedulerJobStateWire =
  "pending" | "ready" | "running" | "succeeded" | "retry_scheduled" | "failed" | "cancelled";
export type NullableSchedulerJobKindWire = SchedulerJobKindWire | null;
export type ToolsStorageRpcCommand =
  | BeginToolExecutionCommand
  | FinishToolExecutionCommand
  | RecoverToolExecutionCommand
  | GetToolExecutionCommand
  | ListToolExecutionsCommand;
export type NullableToolExecutionStateWire = ToolExecutionStateWire | null;
export type ToolExecutionStateWire =
  "running" | "denied" | "approval_required" | "succeeded" | "failed" | "cancelled" | "recovery_required";
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
  | PutPlanProposalCommand
  | GetPlanProposalCommand
  | ListPlanProposalsCommand
  | RecordPlanProposalOperationCommand
  | ListPlanProposalOperationsCommand;
export type NullablePlanProposalStateWire = PlanProposalStateWire | null;
export type PlanProposalStateWire =
  "open" | "approved" | "rejected" | "withdrawn" | "execution_requested" | "executed" | "execution_failed";
export type NullablePlanReferenceKindWire = PlanReferenceKindWire | null;
export type PlanReferenceKindWire =
  | "session"
  | "session_input"
  | "session_run"
  | "scheduler_job"
  | "workspace_change_proposal"
  | "delegation_graph"
  | "delegation_graph_node"
  | "team_conversation"
  | "resource"
  | "context_epoch";
export type PlanProposalOperationWire =
  "approve" | "reject" | "withdraw" | "request_execution" | "mark_executed" | "mark_execution_failed";
export type ObjectiveStorageRpcCommand =
  | PutObjectiveRunCommand
  | GetObjectiveRunCommand
  | ListObjectiveRunsCommand
  | RecordObjectiveRunOperationCommand
  | ListObjectiveRunOperationsCommand
  | PutObjectiveAttemptCommand
  | ListObjectiveAttemptsCommand
  | PutObjectiveVerificationCommand
  | ListObjectiveVerificationsCommand;
export type NullableObjectiveRunStateWire = ObjectiveRunStateWire | null;
export type ObjectiveRunStateWire = "open" | "running" | "blocked" | "succeeded" | "failed" | "cancelled";
export type NullableObjectiveReferenceKindWire = ObjectiveReferenceKindWire | null;
export type ObjectiveReferenceKindWire =
  | "session"
  | "session_input"
  | "session_run"
  | "scheduler_job"
  | "plan_proposal"
  | "workspace_change_proposal"
  | "delegation_graph"
  | "resource"
  | "context_epoch";
export type ObjectiveRunOperationWire = "start" | "record_blocked" | "mark_succeeded" | "mark_failed" | "cancel";
export type NullableObjectiveAttemptStateWire = ObjectiveAttemptStateWire | null;
export type ObjectiveAttemptStateWire = "planned" | "running" | "succeeded" | "failed" | "blocked" | "cancelled";
export type ObjectiveVerificationKindWire = "script" | "model" | "human" | "runtime";
export type ObjectiveVerificationStateWire = "passed" | "failed" | "inconclusive" | "blocked";
export type NullableObjectiveVerificationStateWire = ObjectiveVerificationStateWire | null;
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
  | PutTeamParticipantCommand
  | ListTeamParticipantsCommand
  | UpdateTeamParticipantStateCommand
  | AppendTeamTurnCommand
  | ListTeamTurnsCommand;
export type NullableTeamConversationModeWire = TeamConversationModeWire | null;
export type TeamConversationModeWire = "tl" | "free" | "hybrid";
export type NullableTeamConversationStateWire = TeamConversationStateWire | null;
export type TeamConversationStateWire = "open" | "paused" | "closed" | "cancelled";
export type TeamParticipantKindWire = "user" | "agent" | "tool" | "system";
export type NullableTeamParticipantStateWire = TeamParticipantStateWire | null;
export type TeamParticipantStateWire = "active" | "muted" | "left";
export type NullableTeamAudienceParticipantIdsWire = TeamAudienceParticipantIdsWire | null;
export type TeamAudienceParticipantIdsWire = string[];
export type NullableTeamTurnKindWire = TeamTurnKindWire | null;
export type TeamTurnKindWire = "message" | "decision" | "handoff" | "system";
export type PluginStorageRpcCommand =
  | PutPluginManifestCommand
  | GetPluginManifestCommand
  | ListPluginManifestsCommand
  | PutPluginInstallCommand
  | GetPluginInstallCommand
  | ListPluginInstallsCommand
  | UpdatePluginInstallStateCommand
  | UpdatePluginManifestStateCommand
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
export type ChannelProjectionTargetKindWire = "session.run" | "team.turn" | "workspace.task" | "ignored";
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
  | "storage.channel";
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
  run_id: NullableString;
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
export interface GetConfigCommand {
  command: "get-config";
  key: string;
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
  kind: "interactive" | "scheduler" | "connector" | "agent" | "system" | "objective" | "plan";
  sourceRef?: string;
  parentRef?: string;
  metadata?: JsonObjectWire;
}
export interface JsonObjectWire {
  [k: string]: JsonValue;
}
export interface SubmitSessionRunCommand {
  command: "submit-session-run";
  request: SubmitSessionRunWire;
}
export interface SubmitSessionRunWire {
  id: NullableString;
  session_id: string;
  principal_id: string;
  idempotency_key: string;
  input_type: ("user" | "system") | null;
  content: MessagePartsWire;
  origin: NullableSessionInputOriginWire;
  intent: NullableSessionInputIntentWire;
  run_control_policy: NullableRunControlPolicyWire;
  expected_run_id: NullableString;
  job_id: NullableString;
  job_idempotency_key: NullableString;
  mode: NullableSessionRunModeWire;
  max_steps: NullableInteger;
  provider_profile_id: NullableString;
  scheduled_at: NullableInteger;
  not_before: NullableInteger;
  priority: NullableInteger;
  max_attempts: NullableInteger;
  retry_policy: NullableRetryPolicyWire;
  budget_grant_id: NullableString;
}
export interface RetryPolicyWire {
  strategy: "none" | "fixed" | "exponential";
  initial_delay_ms: NullableInteger;
  max_delay_ms: NullableInteger;
}
export interface InterruptSessionRunCommand {
  command: "interrupt-session-run";
  request: InterruptSessionRunWire;
}
export interface InterruptSessionRunWire {
  session_id: string;
  run_id: string;
  reason: string;
  principal_id: NullableString;
  idempotency_key: NullableString;
  origin: NullableSessionInputOriginWire;
  metadata: NullableJsonObjectWire;
}
export interface SteerSessionRunCommand {
  command: "steer-session-run";
  request: SteerSessionRunWire;
}
export interface SteerSessionRunWire {
  session_id: string;
  principal_id: string;
  expected_run_id: string;
  idempotency_key: string;
  content: MessagePartsWire;
  origin: NullableSessionInputOriginWire;
  provider_profile_id: NullableString;
  metadata: NullableJsonObjectWire;
}
export interface ListSessionRunControlsCommand {
  command: "list-session-run-controls";
  request: ListSessionRunControlsWire;
}
export interface ListSessionRunControlsWire {
  session_id: string;
  run_id: NullableString;
  kind: NullableSessionRunControlKindWire;
  status: NullableSessionRunControlStatusWire;
  limit: NullableInteger;
}
export interface ApplySessionRunControlCommand {
  command: "apply-session-run-control";
  request: ApplySessionRunControlWire;
}
export interface ApplySessionRunControlWire {
  session_id: string;
  run_id: string;
  control_id: string;
  runner_id: string;
  lease_token: string;
}
export interface ListSessionInputsCommand {
  command: "list-session-inputs";
  session_id: string;
}
export interface ListSessionMessagesCommand {
  command: "list-session-messages";
  session_id: string;
}
export interface AppendSessionMessageCommand {
  command: "append-session-message";
  session_id: string;
  run_id: string;
  input_id: string;
  runner_id: string;
  lease_token: string;
  idempotency_key: string;
  role: "user" | "assistant" | "tool" | "system";
  content: MessagePartsWire;
}
export interface PutContextEpochCommand {
  command: "put-context-epoch";
  request: PutContextEpochWire;
}
export interface PutContextEpochWire {
  id: NullableString;
  session_id: string;
  policy_version: string;
  state: NullableContextEpochStateWire;
  token_estimate_before: NullableInteger;
  token_estimate_after: NullableInteger;
  token_savings: NullableInteger;
  replacement_count: NullableInteger;
  metadata: JsonValue;
}
export interface ActivateContextEpochCommand {
  command: "activate-context-epoch";
  request: ActivateContextEpochWire;
}
export interface ActivateContextEpochWire {
  epoch_id: string;
}
export interface CloneContextEpochCommand {
  command: "clone-context-epoch";
  request: CloneContextEpochWire;
}
export interface CloneContextEpochWire {
  source_epoch_id: string;
  id: NullableString;
  metadata: JsonValue;
}
export interface PruneContextEpochsCommand {
  command: "prune-context-epochs";
  request: PruneContextEpochsWire;
}
export interface PruneContextEpochsWire {
  session_id: string;
  policy_version: string;
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
  policy_version: NullableString;
  state: NullableContextEpochStateWire;
}
export interface GetActiveContextEpochCommand {
  command: "get-active-context-epoch";
  request: GetActiveContextEpochWire;
}
export interface GetActiveContextEpochWire {
  session_id: string;
  policy_version: string;
}
export interface PutContextReplacementCommand {
  command: "put-context-replacement";
  request: PutContextReplacementWire;
}
export interface PutContextReplacementWire {
  id: NullableString;
  epoch_id: string;
  session_id: string;
  policy_version: string;
  message_id: NullableString;
  part_id: string;
  tier: ContextReplacementTierWire;
  original_token_estimate: number;
  replacement_token_estimate: number;
  replacement: JsonValue;
  metadata: JsonValue;
}
export interface ListContextReplacementsCommand {
  command: "list-context-replacements";
  request: ListContextReplacementsWire;
}
export interface ListContextReplacementsWire {
  session_id: string;
  policy_version: NullableString;
  epoch_id: NullableString;
}
export interface ClaimRunnerCommand {
  command: "claim-runner";
  session_id: string;
  runner_id: string;
  lease_ms: number;
}
export interface HeartbeatRunnerCommand {
  command: "heartbeat-runner";
  session_id: string;
  runner_id: string;
  lease_token: string;
  lease_ms: number;
}
export interface CompleteRunCommand {
  command: "complete-run";
  session_id: string;
  run_id: string;
  input_id: string;
  runner_id: string;
  lease_token: string;
  assistant_message: NullableMessagePartsWire;
}
export interface FailRunCommand {
  command: "fail-run";
  session_id: string;
  run_id: string;
  input_id: string;
  runner_id: string;
  lease_token: string;
  error: JsonValue;
}
export interface ReleaseRunnerCommand {
  command: "release-runner";
  session_id: string;
  runner_id: string;
  lease_token: string;
}
export interface CancelRunCommand {
  command: "cancel-run";
  session_id: string;
  run_id: string;
  input_id: string;
  reason: string;
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
  max_attempts: NullableInteger;
  retry_policy: NullableRetryPolicyWire;
  idempotency_key: NullableString;
  budget_grant_id: NullableString;
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
  run_id: string;
  input_id: string;
  principal_id: string;
  tool_call_id: string;
  tool_name: string;
  input: JsonValue;
  descriptor: JsonValue;
  permission: JsonValue;
  idempotency_key: string;
}
export interface FinishToolExecutionCommand {
  command: "finish-tool-execution";
  request: FinishToolExecutionWire;
}
export interface FinishToolExecutionWire {
  execution_id: string;
  state: "succeeded" | "failed" | "cancelled";
  result: JsonValue;
  is_error: NullableBoolean;
  error: JsonValue;
}
export interface RecoverToolExecutionCommand {
  command: "recover-tool-execution";
  request: RecoverToolExecutionWire;
}
export interface RecoverToolExecutionWire {
  execution_id: string;
  action: "retry" | "require_recovery";
}
export interface GetToolExecutionCommand {
  command: "get-tool-execution";
  execution_id: string;
}
export interface ListToolExecutionsCommand {
  command: "list-tool-executions";
  request: ListToolExecutionsWire;
}
export interface ListToolExecutionsWire {
  session_id: NullableString;
  run_id: NullableString;
  state: NullableToolExecutionStateWire;
  limit: NullableInteger;
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
export interface PutPlanProposalCommand {
  command: "put-plan-proposal";
  request: PutPlanProposalWire;
}
export interface PutPlanProposalWire {
  id: NullableString;
  principal_id: string;
  title: NullableString;
  summary: NullableString;
  steps: JsonValue;
  references: JsonValue;
  metadata: JsonValue;
  idempotency_key: NullableString;
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
  actor_id: string;
  reason: NullableString;
  metadata: JsonValue;
}
export interface ListPlanProposalOperationsCommand {
  command: "list-plan-proposal-operations";
  request: ListPlanProposalOperationsWire;
}
export interface ListPlanProposalOperationsWire {
  proposal_id: string;
}
export interface PutObjectiveRunCommand {
  command: "put-objective-run";
  request: PutObjectiveRunWire;
}
export interface PutObjectiveRunWire {
  id: NullableString;
  principal_id: string;
  objective: string;
  scope: NullableString;
  constraints: JsonValue;
  success_criteria: JsonValue;
  stop_policy: JsonValue;
  references: JsonValue;
  metadata: JsonValue;
  idempotency_key: NullableString;
}
export interface GetObjectiveRunCommand {
  command: "get-objective-run";
  objective_id: string;
}
export interface ListObjectiveRunsCommand {
  command: "list-objective-runs";
  request: ListObjectiveRunsWire;
}
export interface ListObjectiveRunsWire {
  principal_id: NullableString;
  state: NullableObjectiveRunStateWire;
  reference_kind: NullableObjectiveReferenceKindWire;
  reference_id: NullableString;
  limit: NullableInteger;
}
export interface RecordObjectiveRunOperationCommand {
  command: "record-objective-run-operation";
  request: RecordObjectiveRunOperationWire;
}
export interface RecordObjectiveRunOperationWire {
  id: NullableString;
  objective_id: string;
  operation: ObjectiveRunOperationWire;
  actor_id: string;
  reason: NullableString;
  metadata: JsonValue;
}
export interface ListObjectiveRunOperationsCommand {
  command: "list-objective-run-operations";
  request: ListObjectiveRunOperationsWire;
}
export interface ListObjectiveRunOperationsWire {
  objective_id: string;
}
export interface PutObjectiveAttemptCommand {
  command: "put-objective-attempt";
  request: PutObjectiveAttemptWire;
}
export interface PutObjectiveAttemptWire {
  id: NullableString;
  objective_id: string;
  attempt_number: NullableInteger;
  state: NullableObjectiveAttemptStateWire;
  session_id: NullableString;
  session_input_id: NullableString;
  session_run_id: NullableString;
  scheduler_job_id: NullableString;
  delegation_graph_id: NullableString;
  plan_proposal_id: NullableString;
  workspace_change_proposal_id: NullableString;
  summary: NullableString;
  result: JsonValue;
  error: JsonValue;
  metadata: JsonValue;
  started_at: NullableInteger;
  finished_at: NullableInteger;
  idempotency_key: NullableString;
}
export interface ListObjectiveAttemptsCommand {
  command: "list-objective-attempts";
  request: ListObjectiveAttemptsWire;
}
export interface ListObjectiveAttemptsWire {
  objective_id: string;
  state: NullableObjectiveAttemptStateWire;
  limit: NullableInteger;
}
export interface PutObjectiveVerificationCommand {
  command: "put-objective-verification";
  request: PutObjectiveVerificationWire;
}
export interface PutObjectiveVerificationWire {
  id: NullableString;
  objective_id: string;
  attempt_id: NullableString;
  kind: ObjectiveVerificationKindWire;
  state: ObjectiveVerificationStateWire;
  reason: NullableString;
  evidence: JsonValue;
  verifier_ref: NullableString;
  metadata: JsonValue;
  idempotency_key: NullableString;
}
export interface ListObjectiveVerificationsCommand {
  command: "list-objective-verifications";
  request: ListObjectiveVerificationsWire;
}
export interface ListObjectiveVerificationsWire {
  objective_id: string;
  attempt_id: NullableString;
  state: NullableObjectiveVerificationStateWire;
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
export interface AppendTeamTurnCommand {
  command: "append-team-turn";
  request: AppendTeamTurnWire;
}
export interface AppendTeamTurnWire {
  id: NullableString;
  conversation_id: string;
  speaker_participant_id: string;
  audience_participant_ids: NullableTeamAudienceParticipantIdsWire;
  kind: NullableTeamTurnKindWire;
  content: MessagePartsWire;
  metadata: JsonValue;
}
export interface ListTeamTurnsCommand {
  command: "list-team-turns";
  request: ListTeamTurnsWire;
}
export interface ListTeamTurnsWire {
  conversation_id: string;
  after_created_at: NullableInteger;
  after_turn_id: NullableString;
  limit: NullableInteger;
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
  version: NullableString;
  state: PluginInstallStateWire;
}
export interface UpdatePluginManifestStateCommand {
  command: "update-plugin-manifest-state";
  request: UpdatePluginManifestStateWire;
}
export interface UpdatePluginManifestStateWire {
  plugin_id: string;
  version: NullableString;
  state: PluginManifestStateWire;
}
export interface SubmitPluginActionCommand {
  command: "submit-plugin-action";
  request: SubmitPluginActionWire;
}
export interface SubmitPluginActionWire {
  plugin_id: string;
  version: NullableString;
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

export const STORAGE_RPC_SCHEMA_SHA256 = "ee5daeea5adec04a7b839ed1908bb5aeb127b65856c07a7beea1339c54f75db9" as const
