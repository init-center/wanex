use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct EventScope {
    pub session_id: Option<String>,
    pub run_id: Option<String>,
    pub input_id: Option<String>,
    pub message_id: Option<String>,
    pub resource_id: Option<String>,
    pub plan_proposal_id: Option<String>,
    pub objective_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RuntimeEvent {
    pub id: String,
    pub event_type: String,
    pub scope: EventScope,
    pub payload: Value,
    pub occurred_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SessionRecord {
    pub id: String,
    pub title: Option<String>,
    pub kind: String,
    pub status: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub archived_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListSessions {
    pub kind: Option<String>,
    pub status: Option<String>,
    pub updated_before: Option<i64>,
    pub updated_after: Option<i64>,
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SessionInputRecord {
    pub id: String,
    pub session_id: String,
    pub principal_id: String,
    pub idempotency_key: String,
    pub input_type: String,
    pub content: Value,
    pub origin: Option<Value>,
    pub intent: String,
    pub run_control_policy: Option<String>,
    pub expected_run_id: Option<String>,
    pub status: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AdmitSessionInput {
    pub id: Option<String>,
    pub session_id: String,
    pub principal_id: String,
    pub idempotency_key: String,
    pub input_type: Option<String>,
    pub content: Value,
    pub origin: Option<Value>,
    pub intent: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SessionMessageRecord {
    pub id: String,
    pub session_id: String,
    pub run_id: Option<String>,
    pub input_id: Option<String>,
    pub role: String,
    pub status: String,
    pub content: Value,
    pub provider_state: Option<Value>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ContextEpochRecord {
    pub id: String,
    pub session_id: String,
    pub policy_version: String,
    pub state: String,
    pub token_estimate_before: i64,
    pub token_estimate_after: i64,
    pub token_savings: i64,
    pub replacement_count: i64,
    pub metadata: Option<Value>,
    pub created_at: i64,
    pub activated_at: Option<i64>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PutContextEpoch {
    pub id: Option<String>,
    pub session_id: String,
    pub policy_version: String,
    pub state: Option<String>,
    pub token_estimate_before: Option<i64>,
    pub token_estimate_after: Option<i64>,
    pub token_savings: Option<i64>,
    pub replacement_count: Option<i64>,
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ActivateContextEpoch {
    pub epoch_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CloneContextEpoch {
    pub source_epoch_id: String,
    pub id: Option<String>,
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PruneContextEpochs {
    pub session_id: String,
    pub policy_version: String,
    pub keep_last_superseded: Option<i64>,
    pub older_than_updated_at: Option<i64>,
    pub dry_run: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ContextEpochPruneReceipt {
    pub session_id: String,
    pub policy_version: String,
    pub scanned_count: i64,
    pub deleted_epoch_ids: Vec<String>,
    pub deleted_replacement_count: i64,
    pub dry_run: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListContextEpochs {
    pub session_id: String,
    pub policy_version: Option<String>,
    pub state: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GetActiveContextEpoch {
    pub session_id: String,
    pub policy_version: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ContextReplacementRecord {
    pub id: String,
    pub epoch_id: String,
    pub session_id: String,
    pub policy_version: String,
    pub message_id: Option<String>,
    pub part_id: String,
    pub tier: String,
    pub original_token_estimate: i64,
    pub replacement_token_estimate: i64,
    pub replacement: Value,
    pub metadata: Option<Value>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PutContextReplacement {
    pub id: Option<String>,
    pub epoch_id: String,
    pub session_id: String,
    pub policy_version: String,
    pub message_id: Option<String>,
    pub part_id: String,
    pub tier: String,
    pub original_token_estimate: i64,
    pub replacement_token_estimate: i64,
    pub replacement: Value,
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListContextReplacements {
    pub session_id: String,
    pub policy_version: Option<String>,
    pub epoch_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WorkspaceChangeSetRecord {
    pub id: String,
    pub workspace_id: String,
    pub principal_id: String,
    pub title: Option<String>,
    pub base_revision: Option<String>,
    pub changeset: Value,
    pub current_state: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WorkspaceChangeOperationRecord {
    pub id: String,
    pub changeset_id: String,
    pub operation: String,
    pub status: String,
    pub receipt: Value,
    pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WorkspaceChangeProposalRecord {
    pub id: String,
    pub workspace_id: String,
    pub changeset_id: String,
    pub principal_id: String,
    pub title: Option<String>,
    pub summary: Option<String>,
    pub state: String,
    pub metadata: Option<Value>,
    pub created_at: i64,
    pub updated_at: i64,
    pub closed_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WorkspaceChangeProposalOperationRecord {
    pub id: String,
    pub proposal_id: String,
    pub operation: String,
    pub actor_id: String,
    pub from_state: String,
    pub to_state: String,
    pub reason: Option<String>,
    pub metadata: Option<Value>,
    pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlanProposalReferenceRecord {
    pub kind: String,
    pub reference_id: String,
    pub role: Option<String>,
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlanProposalRecord {
    pub id: String,
    pub principal_id: String,
    pub title: Option<String>,
    pub summary: Option<String>,
    pub steps: Value,
    pub references: Vec<PlanProposalReferenceRecord>,
    pub state: String,
    pub metadata: Option<Value>,
    pub created_at: i64,
    pub updated_at: i64,
    pub closed_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlanProposalOperationRecord {
    pub id: String,
    pub proposal_id: String,
    pub operation: String,
    pub actor_id: String,
    pub from_state: String,
    pub to_state: String,
    pub reason: Option<String>,
    pub metadata: Option<Value>,
    pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PutPlanProposal {
    pub id: Option<String>,
    pub principal_id: String,
    pub title: Option<String>,
    pub summary: Option<String>,
    pub steps: Value,
    pub references: Option<Vec<PlanProposalReferenceRecord>>,
    pub metadata: Option<Value>,
    pub idempotency_key: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListPlanProposals {
    pub principal_id: Option<String>,
    pub state: Option<String>,
    pub reference_kind: Option<String>,
    pub reference_id: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RecordPlanProposalOperation {
    pub id: Option<String>,
    pub proposal_id: String,
    pub operation: String,
    pub actor_id: String,
    pub reason: Option<String>,
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListPlanProposalOperations {
    pub proposal_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ObjectiveReferenceRecord {
    pub kind: String,
    pub reference_id: String,
    pub role: Option<String>,
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ObjectiveRunRecord {
    pub id: String,
    pub principal_id: String,
    pub objective: String,
    pub scope: Option<String>,
    pub constraints: Vec<String>,
    pub success_criteria: Vec<String>,
    pub stop_policy: Option<Value>,
    pub references: Vec<ObjectiveReferenceRecord>,
    pub state: String,
    pub metadata: Option<Value>,
    pub created_at: i64,
    pub updated_at: i64,
    pub closed_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ObjectiveRunOperationRecord {
    pub id: String,
    pub objective_id: String,
    pub operation: String,
    pub actor_id: String,
    pub from_state: String,
    pub to_state: String,
    pub reason: Option<String>,
    pub metadata: Option<Value>,
    pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ObjectiveAttemptRecord {
    pub id: String,
    pub objective_id: String,
    pub attempt_number: i64,
    pub state: String,
    pub session_id: Option<String>,
    pub session_input_id: Option<String>,
    pub session_run_id: Option<String>,
    pub scheduler_job_id: Option<String>,
    pub delegation_graph_id: Option<String>,
    pub plan_proposal_id: Option<String>,
    pub workspace_change_proposal_id: Option<String>,
    pub summary: Option<String>,
    pub result: Option<Value>,
    pub error: Option<Value>,
    pub metadata: Option<Value>,
    pub started_at: Option<i64>,
    pub finished_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ObjectiveVerificationRecord {
    pub id: String,
    pub objective_id: String,
    pub attempt_id: Option<String>,
    pub kind: String,
    pub state: String,
    pub reason: Option<String>,
    pub evidence: Option<Value>,
    pub verifier_ref: Option<String>,
    pub metadata: Option<Value>,
    pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PutObjectiveRun {
    pub id: Option<String>,
    pub principal_id: String,
    pub objective: String,
    pub scope: Option<String>,
    pub constraints: Option<Vec<String>>,
    pub success_criteria: Option<Vec<String>>,
    pub stop_policy: Option<Value>,
    pub references: Option<Vec<ObjectiveReferenceRecord>>,
    pub metadata: Option<Value>,
    pub idempotency_key: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListObjectiveRuns {
    pub principal_id: Option<String>,
    pub state: Option<String>,
    pub reference_kind: Option<String>,
    pub reference_id: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RecordObjectiveRunOperation {
    pub id: Option<String>,
    pub objective_id: String,
    pub operation: String,
    pub actor_id: String,
    pub reason: Option<String>,
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListObjectiveRunOperations {
    pub objective_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PutObjectiveAttempt {
    pub id: Option<String>,
    pub objective_id: String,
    pub attempt_number: Option<i64>,
    pub state: Option<String>,
    pub session_id: Option<String>,
    pub session_input_id: Option<String>,
    pub session_run_id: Option<String>,
    pub scheduler_job_id: Option<String>,
    pub delegation_graph_id: Option<String>,
    pub plan_proposal_id: Option<String>,
    pub workspace_change_proposal_id: Option<String>,
    pub summary: Option<String>,
    pub result: Option<Value>,
    pub error: Option<Value>,
    pub metadata: Option<Value>,
    pub started_at: Option<i64>,
    pub finished_at: Option<i64>,
    pub idempotency_key: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListObjectiveAttempts {
    pub objective_id: String,
    pub state: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PutObjectiveVerification {
    pub id: Option<String>,
    pub objective_id: String,
    pub attempt_id: Option<String>,
    pub kind: String,
    pub state: String,
    pub reason: Option<String>,
    pub evidence: Option<Value>,
    pub verifier_ref: Option<String>,
    pub metadata: Option<Value>,
    pub idempotency_key: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListObjectiveVerifications {
    pub objective_id: String,
    pub attempt_id: Option<String>,
    pub state: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PutWorkspaceChangeSet {
    pub workspace_id: String,
    pub principal_id: String,
    pub changeset: Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RecordWorkspaceChangeOperation {
    pub id: Option<String>,
    pub changeset_id: String,
    pub operation: String,
    pub receipt: Value,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListWorkspaceChangeSets {
    pub workspace_id: Option<String>,
    pub state: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListWorkspaceChangeOperations {
    pub changeset_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PutWorkspaceChangeProposal {
    pub id: Option<String>,
    pub workspace_id: String,
    pub changeset_id: String,
    pub principal_id: String,
    pub title: Option<String>,
    pub summary: Option<String>,
    pub metadata: Option<Value>,
    pub idempotency_key: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListWorkspaceChangeProposals {
    pub workspace_id: Option<String>,
    pub state: Option<String>,
    pub changeset_id: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RecordWorkspaceChangeProposalOperation {
    pub id: Option<String>,
    pub proposal_id: String,
    pub operation: String,
    pub actor_id: String,
    pub reason: Option<String>,
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListWorkspaceChangeProposalOperations {
    pub proposal_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DelegationGraphRecord {
    pub id: String,
    pub principal_id: String,
    pub title: Option<String>,
    pub state: String,
    pub metadata: Option<Value>,
    pub created_at: i64,
    pub updated_at: i64,
    pub closed_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DelegationGraphNodeRecord {
    pub id: String,
    pub graph_id: String,
    pub kind: String,
    pub principal_id: String,
    pub state: String,
    pub payload: Value,
    pub scheduler_job_id: Option<String>,
    pub metadata: Option<Value>,
    pub created_at: i64,
    pub updated_at: i64,
    pub started_at: Option<i64>,
    pub finished_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DelegationGraphDependencyRecord {
    pub id: String,
    pub graph_id: String,
    pub from_node_id: String,
    pub to_node_id: String,
    pub kind: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PutDelegationGraph {
    pub id: Option<String>,
    pub principal_id: String,
    pub title: Option<String>,
    pub metadata: Option<Value>,
    pub idempotency_key: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListDelegationGraphs {
    pub principal_id: Option<String>,
    pub state: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PutDelegationGraphNode {
    pub id: Option<String>,
    pub graph_id: String,
    pub kind: String,
    pub principal_id: String,
    pub payload: Value,
    pub metadata: Option<Value>,
    pub idempotency_key: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GetDelegationGraphNode {
    pub node_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListDelegationGraphNodes {
    pub graph_id: String,
    pub state: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PutDelegationGraphDependency {
    pub id: Option<String>,
    pub graph_id: String,
    pub from_node_id: String,
    pub to_node_id: String,
    pub kind: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListDelegationGraphDependencies {
    pub graph_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UpdateDelegationGraphState {
    pub graph_id: String,
    pub state: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct UpdateDelegationGraphNodeState {
    pub node_id: String,
    pub state: String,
    pub scheduler_job_id: Option<String>,
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AttachDelegationGraphNodeJob {
    pub node_id: String,
    pub scheduler_job_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListReadyDelegationGraphNodes {
    pub graph_id: String,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MaterializeReadyDelegationGraphNode {
    pub graph_id: String,
    pub node_id: Option<String>,
    pub worker_id: String,
    pub job_id: Option<String>,
    pub job_kind: SchedulerJobKind,
    pub job_payload: Option<Value>,
    pub scheduled_at: Option<i64>,
    pub not_before: Option<i64>,
    pub priority: Option<i64>,
    pub max_attempts: Option<i64>,
    pub retry_policy: Option<RetryPolicy>,
    pub job_idempotency_key: Option<String>,
    pub budget_grant_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MaterializedDelegationGraphNode {
    pub node: DelegationGraphNodeRecord,
    pub job: SchedulerJobRecord,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TeamConversationRecord {
    pub id: String,
    pub principal_id: String,
    pub title: Option<String>,
    pub mode: String,
    pub state: String,
    pub metadata: Option<Value>,
    pub created_at: i64,
    pub updated_at: i64,
    pub closed_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TeamParticipantRecord {
    pub id: String,
    pub conversation_id: String,
    pub principal_id: String,
    pub kind: String,
    pub display_name: Option<String>,
    pub role: Option<String>,
    pub state: String,
    pub metadata: Option<Value>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TeamTurnRecord {
    pub id: String,
    pub conversation_id: String,
    pub speaker_participant_id: String,
    pub audience_participant_ids: Option<Vec<String>>,
    pub kind: String,
    pub content: Value,
    pub metadata: Option<Value>,
    pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PutTeamConversation {
    pub id: Option<String>,
    pub principal_id: String,
    pub title: Option<String>,
    pub mode: Option<String>,
    pub metadata: Option<Value>,
    pub idempotency_key: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListTeamConversations {
    pub principal_id: Option<String>,
    pub state: Option<String>,
    pub mode: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PutTeamParticipant {
    pub id: Option<String>,
    pub conversation_id: String,
    pub principal_id: String,
    pub kind: String,
    pub display_name: Option<String>,
    pub role: Option<String>,
    pub metadata: Option<Value>,
    pub idempotency_key: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListTeamParticipants {
    pub conversation_id: String,
    pub state: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AppendTeamTurn {
    pub id: Option<String>,
    pub conversation_id: String,
    pub speaker_participant_id: String,
    pub audience_participant_ids: Option<Vec<String>>,
    pub kind: Option<String>,
    pub content: Value,
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListTeamTurns {
    pub conversation_id: String,
    pub after_created_at: Option<i64>,
    pub after_turn_id: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UpdateTeamConversationState {
    pub conversation_id: String,
    pub state: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UpdateTeamParticipantState {
    pub participant_id: String,
    pub state: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PluginManifestRecord {
    pub id: String,
    pub plugin_id: String,
    pub version: String,
    pub name: Option<String>,
    pub entry: Option<Value>,
    pub capabilities: Vec<String>,
    pub state: String,
    pub metadata: Option<Value>,
    pub created_at: i64,
    pub updated_at: i64,
    pub disabled_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PutPluginManifest {
    pub id: Option<String>,
    pub plugin_id: String,
    pub version: String,
    pub name: Option<String>,
    pub entry: Option<Value>,
    pub capabilities: Vec<String>,
    pub metadata: Option<Value>,
    pub idempotency_key: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GetPluginManifest {
    pub plugin_id: String,
    pub version: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListPluginManifests {
    pub state: Option<String>,
    pub capability: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UpdatePluginManifestState {
    pub plugin_id: String,
    pub version: Option<String>,
    pub state: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SubmitPluginAction {
    pub plugin_id: String,
    pub version: Option<String>,
    pub action_id: String,
    pub principal_id: String,
    pub payload: Value,
    pub required_capability: Option<String>,
    pub job_id: Option<String>,
    pub job_idempotency_key: Option<String>,
    pub scheduled_at: Option<i64>,
    pub not_before: Option<i64>,
    pub priority: Option<i64>,
    pub max_attempts: Option<i64>,
    pub retry_policy: Option<RetryPolicy>,
    pub budget_grant_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PluginActionSubmission {
    pub manifest: PluginManifestRecord,
    pub job: SchedulerJobRecord,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PluginInstallRecord {
    pub id: String,
    pub plugin_id: String,
    pub version: String,
    pub state: String,
    pub layout: Value,
    pub trust: Value,
    pub install_root_dir: String,
    pub metadata: Option<Value>,
    pub installed_at: i64,
    pub updated_at: i64,
    pub disabled_at: Option<i64>,
    pub removed_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PutPluginInstall {
    pub id: Option<String>,
    pub plugin_id: String,
    pub version: String,
    pub layout: Value,
    pub trust: Value,
    pub install_root_dir: String,
    pub metadata: Option<Value>,
    pub idempotency_key: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GetPluginInstall {
    pub plugin_id: String,
    pub version: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListPluginInstalls {
    pub plugin_id: Option<String>,
    pub state: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UpdatePluginInstallState {
    pub plugin_id: String,
    pub version: Option<String>,
    pub state: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ConnectorRegistrationRecord {
    pub id: String,
    pub connector_id: String,
    pub plugin_id: String,
    pub plugin_version: String,
    pub state: String,
    pub metadata: Option<Value>,
    pub created_at: i64,
    pub updated_at: i64,
    pub disabled_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ConnectorCredentialRecord {
    pub id: String,
    pub connector_id: String,
    pub kind: String,
    pub secret_ref: String,
    pub state: String,
    pub metadata: Option<Value>,
    pub created_at: i64,
    pub updated_at: i64,
    pub revoked_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PutConnectorCredential {
    pub id: Option<String>,
    pub connector_id: String,
    pub kind: String,
    pub secret_ref: String,
    pub metadata: Option<Value>,
    pub idempotency_key: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListConnectorCredentials {
    pub connector_id: Option<String>,
    pub state: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RevokeConnectorCredential {
    pub credential_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ConnectorSessionRecord {
    pub id: String,
    pub connector_id: String,
    pub credential_id: String,
    pub state: String,
    pub owner_id: String,
    pub lease_token: String,
    pub lease_expires_at: i64,
    pub metadata: Option<Value>,
    pub last_error: Option<Value>,
    pub created_at: i64,
    pub updated_at: i64,
    pub finished_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StartConnectorSession {
    pub id: Option<String>,
    pub connector_id: String,
    pub credential_id: String,
    pub owner_id: String,
    pub lease_ms: i64,
    pub state: Option<String>,
    pub metadata: Option<Value>,
    pub idempotency_key: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HeartbeatConnectorSession {
    pub session_id: String,
    pub owner_id: String,
    pub lease_token: String,
    pub lease_ms: i64,
    pub state: Option<String>,
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FinishConnectorSession {
    pub session_id: String,
    pub owner_id: String,
    pub lease_token: String,
    pub state: String,
    pub metadata: Option<Value>,
    pub error: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListConnectorSessions {
    pub connector_id: Option<String>,
    pub state: Option<String>,
    pub owner_id: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PutConnectorRegistration {
    pub id: Option<String>,
    pub connector_id: String,
    pub plugin_id: String,
    pub version: Option<String>,
    pub metadata: Option<Value>,
    pub idempotency_key: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListConnectorRegistrations {
    pub connector_id: Option<String>,
    pub plugin_id: Option<String>,
    pub state: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UpdateConnectorRegistrationState {
    pub connector_id: String,
    pub state: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChannelBindingRecord {
    pub id: String,
    pub connector_id: String,
    pub channel_kind: String,
    pub channel_id: String,
    pub external_identity_id: String,
    pub principal_id: String,
    pub display_name: Option<String>,
    pub state: String,
    pub metadata: Option<Value>,
    pub created_at: i64,
    pub updated_at: i64,
    pub revoked_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PutChannelBinding {
    pub id: Option<String>,
    pub connector_id: String,
    pub channel_kind: String,
    pub channel_id: String,
    pub external_identity_id: String,
    pub principal_id: String,
    pub display_name: Option<String>,
    pub metadata: Option<Value>,
    pub idempotency_key: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListChannelBindings {
    pub connector_id: Option<String>,
    pub channel_kind: Option<String>,
    pub channel_id: Option<String>,
    pub principal_id: Option<String>,
    pub external_identity_id: Option<String>,
    pub state: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RevokeChannelBinding {
    pub binding_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChannelInboundEventRecord {
    pub id: String,
    pub connector_id: String,
    pub channel_kind: String,
    pub channel_id: String,
    pub external_event_id: String,
    pub external_thread_id: Option<String>,
    pub sender_external_identity_id: String,
    pub principal_id: Option<String>,
    pub payload: Value,
    pub state: String,
    pub metadata: Option<Value>,
    pub received_at: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct IngestChannelInboundEvent {
    pub id: Option<String>,
    pub connector_id: String,
    pub channel_kind: String,
    pub channel_id: String,
    pub external_event_id: String,
    pub external_thread_id: Option<String>,
    pub sender_external_identity_id: String,
    pub principal_id: Option<String>,
    pub payload: Value,
    pub metadata: Option<Value>,
    pub received_at: Option<i64>,
    pub idempotency_key: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListChannelInboundEvents {
    pub connector_id: Option<String>,
    pub channel_kind: Option<String>,
    pub channel_id: Option<String>,
    pub state: Option<String>,
    pub after_received_at: Option<i64>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct UpdateChannelInboundEventState {
    pub event_id: String,
    pub state: String,
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChannelDeliveryRecord {
    pub id: String,
    pub connector_id: String,
    pub channel_kind: String,
    pub channel_id: String,
    pub target_external_identity_id: Option<String>,
    pub external_thread_id: Option<String>,
    pub principal_id: String,
    pub payload: Value,
    pub state: String,
    pub metadata: Option<Value>,
    pub scheduler_job_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub finished_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SubmitChannelDelivery {
    pub id: Option<String>,
    pub connector_id: String,
    pub channel_kind: String,
    pub channel_id: String,
    pub target_external_identity_id: Option<String>,
    pub external_thread_id: Option<String>,
    pub principal_id: String,
    pub payload: Value,
    pub metadata: Option<Value>,
    pub job_id: Option<String>,
    pub idempotency_key: Option<String>,
    pub scheduled_at: Option<i64>,
    pub not_before: Option<i64>,
    pub priority: Option<i64>,
    pub max_attempts: Option<i64>,
    pub retry_policy: Option<RetryPolicy>,
    pub budget_grant_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChannelDeliverySubmission {
    pub delivery: ChannelDeliveryRecord,
    pub job: SchedulerJobRecord,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CompleteChannelDelivery {
    pub delivery_id: String,
    pub worker_id: String,
    pub lease_token: String,
    pub result: Option<Value>,
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FailChannelDelivery {
    pub delivery_id: String,
    pub worker_id: String,
    pub lease_token: String,
    pub error: Value,
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChannelDeliveryAcknowledgement {
    pub delivery: ChannelDeliveryRecord,
    pub job: SchedulerJobRecord,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChannelProjectionRecord {
    pub id: String,
    pub inbound_event_id: String,
    pub target_kind: String,
    pub target_id: Option<String>,
    pub target_job_id: Option<String>,
    pub state: String,
    pub target: Value,
    pub metadata: Option<Value>,
    pub idempotency_key: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProjectChannelInboundEvent {
    pub id: Option<String>,
    pub inbound_event_id: String,
    pub target: Value,
    pub metadata: Option<Value>,
    pub idempotency_key: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListChannelProjections {
    pub inbound_event_id: Option<String>,
    pub target_kind: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChannelProjectionReceipt {
    pub projection: ChannelProjectionRecord,
    pub job: Option<SchedulerJobRecord>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AppendSessionMessage {
    pub session_id: String,
    pub run_id: String,
    pub input_id: String,
    pub runner_id: String,
    pub lease_token: String,
    pub idempotency_key: String,
    pub role: String,
    pub content: Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FailRun {
    pub session_id: String,
    pub run_id: String,
    pub input_id: String,
    pub runner_id: String,
    pub lease_token: String,
    pub error: Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CancelRun {
    pub session_id: String,
    pub run_id: String,
    pub input_id: String,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct InterruptSessionRun {
    pub session_id: String,
    pub run_id: String,
    pub reason: String,
    pub principal_id: Option<String>,
    pub idempotency_key: Option<String>,
    pub origin: Option<Value>,
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InterruptSessionRunReceipt {
    pub session_id: String,
    pub run_id: String,
    pub durability: String,
    pub status: String,
    pub accepted_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SteerSessionRun {
    pub session_id: String,
    pub principal_id: String,
    pub expected_run_id: String,
    pub idempotency_key: String,
    pub content: Value,
    pub origin: Option<Value>,
    pub provider_profile_id: Option<String>,
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SteerSessionRunReceipt {
    pub session_id: String,
    pub run_id: String,
    pub durability: String,
    pub status: String,
    pub accepted_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SessionRunControlRecord {
    pub id: String,
    pub session_id: String,
    pub run_id: String,
    pub input_id: Option<String>,
    pub principal_id: Option<String>,
    pub idempotency_key: String,
    pub kind: String,
    pub status: String,
    pub content: Option<Value>,
    pub reason: Option<String>,
    pub origin: Option<Value>,
    pub provider_profile_id: Option<String>,
    pub metadata: Option<Value>,
    pub created_at: i64,
    pub updated_at: i64,
    pub applied_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApplySessionRunControl {
    pub session_id: String,
    pub run_id: String,
    pub control_id: String,
    pub runner_id: String,
    pub lease_token: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ApplySessionRunControlReceipt {
    pub control: SessionRunControlRecord,
    pub effect: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListSessionRunControls {
    pub session_id: String,
    pub run_id: Option<String>,
    pub kind: Option<String>,
    pub status: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AdmissionReceipt {
    pub input_id: String,
    pub session_id: String,
    pub durability: String,
    pub status: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SubmitSessionRun {
    pub id: Option<String>,
    pub session_id: String,
    pub principal_id: String,
    pub idempotency_key: String,
    pub input_type: Option<String>,
    pub content: Value,
    pub origin: Option<Value>,
    pub intent: Option<String>,
    pub run_control_policy: Option<String>,
    pub expected_run_id: Option<String>,
    pub job_id: Option<String>,
    pub job_idempotency_key: Option<String>,
    pub mode: Option<String>,
    pub max_steps: Option<i64>,
    pub provider_profile_id: Option<String>,
    pub scheduled_at: Option<i64>,
    pub not_before: Option<i64>,
    pub priority: Option<i64>,
    pub max_attempts: Option<i64>,
    pub retry_policy: Option<RetryPolicy>,
    pub budget_grant_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SubmitSessionRunReceipt {
    pub admission: AdmissionReceipt,
    pub job: SchedulerJobRecord,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RunnerClaim {
    pub session_id: String,
    pub input_id: String,
    pub run_id: String,
    pub runner_id: String,
    pub lease_token: String,
    pub lease_expires_at: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BudgetScopeKind {
    Session,
    Turn,
    TeamRound,
    Plugin,
    Principal,
    ProviderModel,
}

impl BudgetScopeKind {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Session => "session",
            Self::Turn => "turn",
            Self::TeamRound => "team_round",
            Self::Plugin => "plugin",
            Self::Principal => "principal",
            Self::ProviderModel => "provider_model",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BudgetWindowKind {
    Run,
    Session,
    Day,
    Month,
}

impl BudgetWindowKind {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Run => "run",
            Self::Session => "session",
            Self::Day => "day",
            Self::Month => "month",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct BudgetAmount {
    pub tokens: Option<i64>,
    pub cost_micros: Option<i64>,
    pub wall_time_ms: Option<i64>,
    pub tool_calls: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BudgetScopeRef {
    pub kind: BudgetScopeKind,
    pub owner_id: String,
    pub window_kind: Option<BudgetWindowKind>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ReserveBudget {
    pub scope: BudgetScopeRef,
    pub limit: BudgetAmount,
    pub requested: BudgetAmount,
    pub principal_id: String,
    pub reason: String,
    pub idempotency_key: String,
    pub expires_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CommitBudget {
    pub grant_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RecordBudgetUsage {
    pub grant_id: String,
    pub usage: BudgetAmount,
    pub source: String,
    pub source_id: String,
    pub idempotency_key: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BudgetUsageEntryRecord {
    pub id: String,
    pub grant_id: String,
    pub usage: BudgetAmount,
    pub source: String,
    pub source_id: String,
    pub idempotency_key: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RecordBudgetUsageReceipt {
    pub entry: BudgetUsageEntryRecord,
    pub created: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BudgetScopeRecord {
    pub id: String,
    pub kind: String,
    pub owner_id: String,
    pub limit: BudgetAmount,
    pub usage: BudgetAmount,
    pub window_kind: String,
    pub state: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BudgetGrantRecord {
    pub id: String,
    pub scope_id: String,
    pub principal_id: String,
    pub reason: String,
    pub requested: BudgetAmount,
    pub committed: Option<BudgetAmount>,
    pub state: String,
    pub idempotency_key: String,
    pub expires_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SchedulerJobKind {
    #[serde(rename = "session.run")]
    SessionRun,
    #[serde(rename = "workspace.task")]
    WorkspaceTask,
    #[serde(rename = "team.delivery")]
    TeamDelivery,
    #[serde(rename = "team.round.close")]
    TeamRoundClose,
    #[serde(rename = "plugin.action")]
    PluginAction,
    #[serde(rename = "channel.delivery")]
    ChannelDelivery,
    #[serde(rename = "tool.deferred_result")]
    ToolDeferredResult,
    #[serde(rename = "gateway.delivery")]
    GatewayDelivery,
    #[serde(rename = "memory.compaction")]
    MemoryCompaction,
    #[serde(rename = "resource.cleanup")]
    ResourceCleanup,
    #[serde(rename = "budget.grant_expire")]
    BudgetGrantExpire,
    #[serde(rename = "provider.retry")]
    ProviderRetry,
    #[serde(rename = "config.sync")]
    ConfigSync,
}

impl SchedulerJobKind {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::SessionRun => "session.run",
            Self::WorkspaceTask => "workspace.task",
            Self::TeamDelivery => "team.delivery",
            Self::TeamRoundClose => "team.round.close",
            Self::PluginAction => "plugin.action",
            Self::ChannelDelivery => "channel.delivery",
            Self::ToolDeferredResult => "tool.deferred_result",
            Self::GatewayDelivery => "gateway.delivery",
            Self::MemoryCompaction => "memory.compaction",
            Self::ResourceCleanup => "resource.cleanup",
            Self::BudgetGrantExpire => "budget.grant_expire",
            Self::ProviderRetry => "provider.retry",
            Self::ConfigSync => "config.sync",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RetryStrategy {
    None,
    Fixed,
    Exponential,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RetryPolicy {
    pub strategy: RetryStrategy,
    pub initial_delay_ms: Option<i64>,
    pub max_delay_ms: Option<i64>,
}

impl Default for RetryPolicy {
    fn default() -> Self {
        Self {
            strategy: RetryStrategy::None,
            initial_delay_ms: None,
            max_delay_ms: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EnqueueJob {
    pub id: Option<String>,
    pub kind: SchedulerJobKind,
    pub principal_id: String,
    pub payload: Value,
    pub scheduled_at: Option<i64>,
    pub not_before: Option<i64>,
    pub priority: Option<i64>,
    pub max_attempts: Option<i64>,
    pub retry_policy: Option<RetryPolicy>,
    pub idempotency_key: Option<String>,
    pub budget_grant_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ClaimJob {
    pub worker_id: String,
    pub lease_ms: i64,
    pub kinds: Option<Vec<SchedulerJobKind>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HeartbeatJob {
    pub job_id: String,
    pub worker_id: String,
    pub lease_token: String,
    pub lease_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CompleteJob {
    pub job_id: String,
    pub worker_id: String,
    pub lease_token: String,
    pub result: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FailJob {
    pub job_id: String,
    pub worker_id: String,
    pub lease_token: String,
    pub error: Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CancelJob {
    pub job_id: String,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GetJob {
    pub job_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ListJobs {
    pub state: Option<String>,
    pub kind: Option<String>,
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SchedulerJobRecord {
    pub id: String,
    pub kind: String,
    pub state: String,
    pub principal_id: String,
    pub payload: Value,
    pub scheduled_at: i64,
    pub not_before: Option<i64>,
    pub priority: i64,
    pub attempt: i64,
    pub max_attempts: i64,
    pub retry_policy: RetryPolicy,
    pub idempotency_key: Option<String>,
    pub budget_grant_id: Option<String>,
    pub lease_owner: Option<String>,
    pub lease_token: Option<String>,
    pub lease_expires_at: Option<i64>,
    pub result: Option<Value>,
    pub last_error: Option<Value>,
    pub created_at: i64,
    pub updated_at: i64,
    pub finished_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryEvents {
    pub session_id: Option<String>,
    pub plan_proposal_id: Option<String>,
    pub objective_id: Option<String>,
    pub after_occurred_at: Option<i64>,
    pub after_event_id: Option<String>,
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileRecord {
    pub resource_id: String,
    pub logical_path: String,
    pub absolute_path: PathBuf,
    pub size_bytes: u64,
    pub sha256: String,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ResourceSource {
    pub provider: Option<String>,
    pub provider_file_id: Option<String>,
    pub provider_operation_id: Option<String>,
    pub source_url: Option<String>,
    pub source_expires_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ResourceRecord {
    pub id: String,
    pub logical_path: String,
    pub kind: String,
    pub origin: String,
    pub state: String,
    pub media_type: Option<String>,
    pub label: Option<String>,
    pub size_bytes: i64,
    pub sha256: String,
    pub source: Option<ResourceSource>,
    pub metadata: Option<Value>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub duration_ms: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct IngestResource {
    pub id: Option<String>,
    pub logical_path: Option<String>,
    pub content: Vec<u8>,
    pub media_type: Option<String>,
    pub kind: Option<String>,
    pub origin: Option<String>,
    pub label: Option<String>,
    pub source: Option<ResourceSource>,
    pub metadata: Option<Value>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub duration_ms: Option<i64>,
    pub expected_sha256: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListResources {
    pub kind: Option<String>,
    pub origin: Option<String>,
    pub state: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResourceTicket {
    pub id: String,
    pub principal_id: String,
    pub resource_id: String,
    pub capability: ResourceCapability,
    pub expires_at: i64,
    pub revoked_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CleanupExpiredResourceTickets {
    pub now_ms: Option<i64>,
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResourceTicketCleanupReceipt {
    pub revoked_count: u32,
    pub revoked_ticket_ids: Vec<String>,
    pub now_ms: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResourceCapability {
    Read,
    Write,
}

impl ResourceCapability {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Read => "read",
            Self::Write => "write",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DoctorReport {
    pub store_path: PathBuf,
    pub schema_version: i64,
    pub checks: Vec<DoctorCheck>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DoctorCheck {
    pub name: String,
    pub state: DoctorCheckState,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ToolExecutionRecord {
    pub id: String,
    pub session_id: String,
    pub run_id: String,
    pub input_id: String,
    pub principal_id: String,
    pub tool_call_id: String,
    pub tool_name: String,
    pub input: Value,
    pub descriptor: Value,
    pub permission: Value,
    pub state: String,
    pub attempt: i64,
    pub idempotency_key: String,
    pub result: Option<Value>,
    pub is_error: Option<bool>,
    pub error: Option<Value>,
    pub created_at: i64,
    pub started_at: Option<i64>,
    pub finished_at: Option<i64>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BeginToolExecution {
    pub session_id: String,
    pub run_id: String,
    pub input_id: String,
    pub principal_id: String,
    pub tool_call_id: String,
    pub tool_name: String,
    pub input: Value,
    pub descriptor: Value,
    pub permission: Value,
    pub idempotency_key: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BeginToolExecutionReceipt {
    pub execution: ToolExecutionRecord,
    pub created: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FinishToolExecution {
    pub execution_id: String,
    pub state: String,
    pub result: Option<Value>,
    pub is_error: Option<bool>,
    pub error: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RecoverToolExecution {
    pub execution_id: String,
    pub action: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListToolExecutions {
    pub session_id: Option<String>,
    pub run_id: Option<String>,
    pub state: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DoctorCheckState {
    Ok,
    Warn,
    Error,
}
