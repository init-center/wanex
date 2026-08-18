use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct EventScope {
    pub session_id: Option<String>,
    pub turn_id: Option<String>,
    pub attempt_id: Option<String>,
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
    pub revision: i64,
    pub created_at: i64,
    pub updated_at: i64,
    pub archived_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RenameSession {
    pub session_id: String,
    pub title: String,
    pub expected_revision: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SessionStateTransition {
    pub session_id: String,
    pub expected_revision: i64,
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
    pub expected_turn_id: Option<String>,
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
    pub sequence: i64,
    pub turn_id: String,
    pub attempt_id: Option<String>,
    pub input_id: Option<String>,
    pub role: String,
    pub status: String,
    pub content: Value,
    pub provider_state: Option<Value>,
    pub execution_binding_digest: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ContextEpochRecord {
    pub id: String,
    pub session_id: String,
    pub job_id: String,
    pub state: String,
    pub generation_state: String,
    pub generation_attempt: i64,
    pub max_provider_attempts: i64,
    pub previous_epoch_id: Option<String>,
    pub previous_summary_digest: Option<String>,
    pub source_head_sequence: i64,
    pub source_head_message_id: String,
    pub cut_sequence: i64,
    pub cut_message_id: String,
    pub retained_from_sequence: i64,
    pub retained_from_message_id: String,
    pub source_digest: String,
    pub policy: Value,
    pub policy_digest: String,
    pub model_endpoint: Value,
    pub request_digest: String,
    pub summary: Option<String>,
    pub summary_digest: Option<String>,
    pub usage: Option<Value>,
    pub error: Option<Value>,
    pub token_estimate_before: i64,
    pub token_estimate_after: i64,
    pub token_savings: i64,
    pub created_at: i64,
    pub activated_at: Option<i64>,
    pub finished_at: Option<i64>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BeginContextEpoch {
    pub id: String,
    pub session_id: String,
    pub job_id: String,
    pub worker_id: String,
    pub lease_token: String,
    pub max_provider_attempts: i64,
    pub previous_epoch_id: Option<String>,
    pub previous_summary_digest: Option<String>,
    pub source_head_sequence: i64,
    pub source_head_message_id: String,
    pub cut_sequence: i64,
    pub cut_message_id: String,
    pub retained_from_sequence: i64,
    pub retained_from_message_id: String,
    pub source_digest: String,
    pub policy: Value,
    pub policy_digest: String,
    pub model_endpoint: Value,
    pub request_digest: String,
    pub token_estimate_before: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ContextEpochMutationIdentity {
    pub epoch_id: String,
    pub job_id: String,
    pub worker_id: String,
    pub lease_token: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MarkContextEpochOutputObserved {
    pub epoch_id: String,
    pub job_id: String,
    pub worker_id: String,
    pub lease_token: String,
    pub generation_attempt: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FinishContextEpochGeneration {
    pub epoch_id: String,
    pub job_id: String,
    pub worker_id: String,
    pub lease_token: String,
    pub generation_attempt: i64,
    pub outcome: String,
    pub retryable: Option<bool>,
    pub summary: Option<String>,
    pub summary_digest: Option<String>,
    pub usage: Option<Value>,
    pub error: Option<Value>,
    pub token_estimate_after: Option<i64>,
    pub token_savings: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ActivateContextEpoch {
    pub epoch_id: String,
    pub job_id: String,
    pub worker_id: String,
    pub lease_token: String,
    pub expected_previous_epoch_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PruneContextEpochs {
    pub session_id: String,
    pub keep_last_superseded: Option<i64>,
    pub older_than_updated_at: Option<i64>,
    pub dry_run: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ContextEpochPruneReceipt {
    pub session_id: String,
    pub scanned_count: i64,
    pub deleted_epoch_ids: Vec<String>,
    pub dry_run: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListContextEpochs {
    pub session_id: String,
    pub state: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GetActiveContextEpoch {
    pub session_id: String,
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
pub struct PlanProposalContentRecord {
    pub title: String,
    pub summary: String,
    pub steps: Value,
    pub references: Vec<PlanProposalReferenceRecord>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlanProposalSourceRecord {
    pub session_id: String,
    pub head_sequence: i64,
    pub head_message_id: Option<String>,
    pub head_turn_id: Option<String>,
    pub analysis_input_digest: String,
    pub planning_request: Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlanProposalGenerationRecord {
    pub endpoint_id: String,
    pub endpoint_digest: String,
    pub protocol_id: String,
    pub provider_id: String,
    pub model_id: String,
    pub generated_at: i64,
    pub output_digest: String,
    pub output: Value,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PlanProposalExecutionBindingRecord {
    pub input_id: String,
    pub turn_id: String,
    pub job_id: String,
    pub execution_binding_digest: String,
    pub digest: String,
    pub bound_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlanProposalRecord {
    pub id: String,
    pub principal_id: String,
    pub revision: i64,
    pub source: PlanProposalSourceRecord,
    pub generation: PlanProposalGenerationRecord,
    pub title: String,
    pub summary: String,
    pub steps: Value,
    pub references: Vec<PlanProposalReferenceRecord>,
    pub state: String,
    pub execution: Option<PlanProposalExecutionBindingRecord>,
    pub created_at: i64,
    pub updated_at: i64,
    pub decided_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlanProposalOperationRecord {
    pub id: String,
    pub proposal_id: String,
    pub operation: String,
    pub actor_kind: String,
    pub actor_id: String,
    pub from_state: String,
    pub to_state: String,
    pub from_revision: i64,
    pub to_revision: i64,
    pub content: Option<PlanProposalContentRecord>,
    pub reason: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CreatePlanProposal {
    pub id: Option<String>,
    pub principal_id: String,
    pub source: PlanProposalSourceRecord,
    pub generation: PlanProposalGenerationRecord,
    pub content: PlanProposalContentRecord,
    pub idempotency_key: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListPlanProposals {
    pub principal_id: Option<String>,
    pub source_session_id: Option<String>,
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
    pub expected_revision: i64,
    pub actor_kind: String,
    pub actor_id: String,
    pub content: Option<PlanProposalContentRecord>,
    pub reason: Option<String>,
    pub idempotency_key: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExecuteApprovedPlan {
    pub proposal_id: String,
    pub expected_revision: i64,
    pub idempotency_key: String,
    pub turn: SubmitSessionTurn,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExecuteApprovedPlanReceipt {
    pub proposal: PlanProposalRecord,
    pub submission: SubmitSessionTurnReceipt,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListPlanProposalOperations {
    pub proposal_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObjectiveSuccessCriterion {
    pub id: String,
    pub description: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObjectiveVerificationRequirement {
    pub id: String,
    pub criterion_ids: Vec<String>,
    pub verifier_kind: String,
    pub verifier_ref: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObjectiveVerificationPolicy {
    pub requirements: Vec<ObjectiveVerificationRequirement>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObjectiveStopPolicy {
    pub max_attempts: i64,
    pub max_consecutive_blocked_attempts: i64,
    pub deadline_at: Option<i64>,
    #[serde(default, with = "objective_budget_limit_serde")]
    pub budget: Option<BudgetAmount>,
}

mod objective_budget_limit_serde {
    use super::BudgetAmount;
    use serde::{Deserialize, Deserializer, Serialize, Serializer};

    #[derive(Serialize, Deserialize)]
    #[serde(rename_all = "camelCase", deny_unknown_fields)]
    struct ObjectiveBudgetLimit {
        tokens: Option<i64>,
        cost_micros: Option<i64>,
        wall_time_ms: Option<i64>,
        tool_calls: Option<i64>,
    }

    pub fn serialize<S>(value: &Option<BudgetAmount>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        value
            .as_ref()
            .map(|amount| ObjectiveBudgetLimit {
                tokens: amount.tokens,
                cost_micros: amount.cost_micros,
                wall_time_ms: amount.wall_time_ms,
                tool_calls: amount.tool_calls,
            })
            .serialize(serializer)
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Option<BudgetAmount>, D::Error>
    where
        D: Deserializer<'de>,
    {
        Ok(
            Option::<ObjectiveBudgetLimit>::deserialize(deserializer)?.map(|amount| BudgetAmount {
                tokens: amount.tokens,
                cost_micros: amount.cost_micros,
                wall_time_ms: amount.wall_time_ms,
                tool_calls: amount.tool_calls,
            }),
        )
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObjectiveStateReason {
    pub code: String,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ObjectiveRecord {
    pub id: String,
    pub session_id: String,
    pub principal_id: String,
    pub objective: String,
    pub boundaries: Vec<String>,
    pub constraints: Vec<String>,
    pub success_criteria: Vec<ObjectiveSuccessCriterion>,
    pub verification_policy: ObjectiveVerificationPolicy,
    pub stop_policy: ObjectiveStopPolicy,
    pub revision: i64,
    pub state: String,
    pub reason: ObjectiveStateReason,
    pub active_attempt_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub closed_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ObjectiveAttemptRecord {
    pub id: String,
    pub objective_id: String,
    pub attempt_number: i64,
    pub input_id: String,
    pub turn_id: String,
    pub job_id: String,
    pub execution_binding_digest: String,
    pub trigger: String,
    pub budget_grant_id: Option<String>,
    pub idempotency_key: String,
    pub bound_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObjectiveVerificationEvidence {
    pub kind: String,
    pub reference_id: String,
    pub digest: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ObjectiveVerificationRecord {
    pub id: String,
    pub objective_id: String,
    pub attempt_id: String,
    pub requirement_id: String,
    pub verifier_kind: String,
    pub verifier_ref: String,
    pub result: String,
    pub reason: Option<String>,
    pub evidence: Vec<ObjectiveVerificationEvidence>,
    pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ObjectiveAttemptReviewRecord {
    pub id: String,
    pub objective_id: String,
    pub attempt_id: String,
    pub disposition: String,
    pub reason: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CreateObjective {
    pub id: Option<String>,
    pub session_id: String,
    pub principal_id: String,
    pub objective: String,
    pub boundaries: Value,
    pub constraints: Value,
    pub success_criteria: Value,
    pub verification_policy: Value,
    pub stop_policy: Value,
    pub idempotency_key: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListObjectives {
    pub session_id: Option<String>,
    pub principal_id: Option<String>,
    pub states: Option<Vec<String>>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChangeObjectiveState {
    pub objective_id: String,
    pub expected_revision: i64,
    pub reason: Option<String>,
    pub idempotency_key: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AdmitObjectiveAttempt {
    pub objective_id: String,
    pub expected_revision: i64,
    pub trigger: String,
    pub idempotency_key: String,
    pub turn: SubmitSessionTurn,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum AdmitObjectiveAttemptReceipt {
    Admitted {
        objective: Box<ObjectiveRecord>,
        attempt: ObjectiveAttemptRecord,
        submission: Box<SubmitSessionTurnReceipt>,
    },
    LimitReached {
        objective: ObjectiveRecord,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObjectiveVerificationSubmission {
    pub requirement_id: String,
    pub verifier_kind: String,
    pub verifier_ref: String,
    pub result: String,
    pub reason: Option<String>,
    pub evidence: Vec<ObjectiveVerificationEvidence>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ReviewObjectiveAttempt {
    pub id: Option<String>,
    pub objective_id: String,
    pub attempt_id: String,
    pub expected_revision: i64,
    pub disposition: String,
    pub reason: Option<String>,
    pub verifications: Value,
    pub idempotency_key: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ReviewObjectiveAttemptReceipt {
    pub objective: ObjectiveRecord,
    pub attempt: ObjectiveAttemptRecord,
    pub review: ObjectiveAttemptReviewRecord,
    pub verifications: Vec<ObjectiveVerificationRecord>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RequestObjectiveCancel {
    pub objective_id: String,
    pub expected_revision: i64,
    pub reason: String,
    pub idempotency_key: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RequestObjectiveCancelReceipt {
    pub objective: ObjectiveRecord,
    pub turn_cancellation: Option<RequestSessionTurnCancelReceipt>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReconcileObjectiveCancellation {
    pub objective_id: String,
    pub attempt_id: String,
    pub expected_revision: i64,
    pub idempotency_key: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListObjectiveAttempts {
    pub objective_id: String,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListObjectiveAttemptReviews {
    pub objective_id: String,
    pub attempt_id: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListObjectiveVerifications {
    pub objective_id: String,
    pub attempt_id: Option<String>,
    pub requirement_id: Option<String>,
    pub result: Option<String>,
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
    pub lead_participant_id: Option<String>,
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
    pub agent_session_id: Option<String>,
    pub state: String,
    pub metadata: Option<Value>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TeamTarget {
    pub kind: String,
    pub participant_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TeamMessageRecord {
    pub id: String,
    pub conversation_id: String,
    pub author_participant_id: String,
    pub parent_message_id: Option<String>,
    pub discussion_round_id: Option<String>,
    pub kind: String,
    pub state: String,
    pub targets: Vec<TeamTarget>,
    pub content: Value,
    pub metadata: Option<Value>,
    pub idempotency_key: String,
    pub revision: i64,
    pub created_at: i64,
    pub updated_at: i64,
    pub visible_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TeamRoutingDecisionRecord {
    pub id: String,
    pub conversation_id: String,
    pub message_id: String,
    pub mode: String,
    pub outcome: String,
    pub lead_participant_id: Option<String>,
    pub actor_principal_id: String,
    pub reason: String,
    pub metadata: Option<Value>,
    pub idempotency_key: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TeamDiscussionRoundResult {
    pub expected: i64,
    pub responded: i64,
    pub passed: i64,
    pub failed: i64,
    pub cancelled: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TeamDiscussionRoundRecord {
    pub id: String,
    pub conversation_id: String,
    pub source_message_id: String,
    pub routing_decision_id: String,
    pub mode: String,
    pub state: String,
    pub expected_delivery_count: i64,
    pub outcome: Option<String>,
    pub result: Option<TeamDiscussionRoundResult>,
    pub idempotency_key: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub closed_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TeamDeliveryRecord {
    pub id: String,
    pub conversation_id: String,
    pub message_id: String,
    pub routing_decision_id: String,
    pub discussion_round_id: String,
    pub target_participant_id: String,
    pub role: String,
    pub trigger: String,
    pub state: String,
    pub target_session_id: String,
    pub dispatch_job_id: String,
    pub child_input_id: Option<String>,
    pub child_turn_id: Option<String>,
    pub child_turn_job_id: Option<String>,
    pub outcome_job_id: Option<String>,
    pub reply_message_id: Option<String>,
    pub participation_tool_execution_id: Option<String>,
    pub budget_grant_id: Option<String>,
    pub last_error: Option<Value>,
    pub idempotency_key: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub materialized_at: Option<i64>,
    pub finished_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TeamDelegationOperationRecord {
    pub id: String,
    pub conversation_id: String,
    pub source_delivery_id: String,
    pub source_routing_decision_id: String,
    pub source_discussion_round_id: String,
    pub lead_participant_id: String,
    pub parent_session_id: String,
    pub parent_input_id: String,
    pub parent_turn_id: String,
    pub parent_session_attempt_id: String,
    pub parent_session_job_id: String,
    pub parent_tool_execution_id: String,
    pub parent_tool_invocation_attempt_id: String,
    pub parent_tool_call_id: String,
    pub delegation_graph_id: String,
    pub state: String,
    pub idempotency_key: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub finished_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TeamDelegationTaskRecord {
    pub id: String,
    pub operation_id: String,
    pub graph_node_id: String,
    pub target_participant_id: String,
    pub target_session_id: String,
    pub prompt: String,
    pub child_input_id: String,
    pub child_turn_id: String,
    pub child_job_id: String,
    pub input_idempotency_key: String,
    pub job_idempotency_key: String,
    pub execution_binding: Value,
    pub execution_binding_digest: String,
    pub max_steps: Option<i64>,
    pub priority: Option<i64>,
    pub materialized_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RouteTeamMessageReceipt {
    pub message: TeamMessageRecord,
    pub decision: TeamRoutingDecisionRecord,
    pub round: Option<TeamDiscussionRoundRecord>,
    pub deliveries: Vec<TeamDeliveryRecord>,
    pub dispatch_jobs: Vec<SchedulerJobRecord>,
    pub created: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TeamDeliveryMaterializationContext {
    pub conversation: TeamConversationRecord,
    pub participant: TeamParticipantRecord,
    pub message: TeamMessageRecord,
    pub delivery: TeamDeliveryRecord,
    pub dispatch_job: SchedulerJobRecord,
    pub child_plan: TeamDeliveryChildTurnPlan,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TeamDeliveryChildTurnPlan {
    pub session_id: String,
    pub input_id: String,
    pub turn_id: String,
    pub job_id: String,
    pub principal_id: String,
    pub input_type: String,
    pub content: Value,
    pub origin: Value,
    pub intent: String,
    pub input_idempotency_key: String,
    pub job_idempotency_key: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MaterializeTeamDelivery {
    pub delivery_id: String,
    pub dispatch_job_id: String,
    pub worker_id: String,
    pub lease_token: String,
    pub execution_binding: Value,
    pub max_steps: Option<i64>,
    pub child_priority: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MaterializeTeamDeliveryReceipt {
    pub delivery: TeamDeliveryRecord,
    pub dispatch_job: SchedulerJobRecord,
    pub submission: SubmitSessionTurnReceipt,
    pub created: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FailTeamDeliveryMaterialization {
    pub delivery_id: String,
    pub dispatch_job_id: String,
    pub worker_id: String,
    pub lease_token: String,
    pub error: Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FailTeamDeliveryMaterializationReceipt {
    pub delivery: TeamDeliveryRecord,
    pub dispatch_job: SchedulerJobRecord,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProjectTeamDeliveryOutcome {
    pub delivery_id: String,
    pub outcome_job_id: String,
    pub worker_id: String,
    pub lease_token: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProjectTeamDeliveryOutcomeReceipt {
    pub delivery: TeamDeliveryRecord,
    pub outcome_job: SchedulerJobRecord,
    pub child_turn: SessionTurnRecord,
    pub child_assistant_message: Option<SessionMessageRecord>,
    pub reply_message: Option<TeamMessageRecord>,
    pub created: bool,
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SetTeamConversationLead {
    pub conversation_id: String,
    pub expected_lead_participant_id: Option<String>,
    pub lead_participant_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PutTeamParticipant {
    pub id: Option<String>,
    pub conversation_id: String,
    pub principal_id: String,
    pub kind: String,
    pub display_name: Option<String>,
    pub role: Option<String>,
    pub agent_session_id: Option<String>,
    pub metadata: Option<Value>,
    pub idempotency_key: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListTeamParticipants {
    pub conversation_id: String,
    pub state: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AdmitTeamMessage {
    pub id: Option<String>,
    pub conversation_id: String,
    pub author_participant_id: String,
    pub parent_message_id: Option<String>,
    pub kind: Option<String>,
    pub targets: Vec<TeamTarget>,
    pub content: Value,
    pub metadata: Option<Value>,
    pub idempotency_key: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListTeamMessages {
    pub conversation_id: String,
    pub state: Option<String>,
    pub after_created_at: Option<i64>,
    pub after_message_id: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RouteTeamDelivery {
    pub id: Option<String>,
    pub target_participant_id: String,
    pub role: String,
    pub trigger: String,
    pub budget_grant_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RouteTeamMessage {
    pub id: Option<String>,
    pub message_id: String,
    pub expected_revision: i64,
    pub expected_lead_participant_id: Option<String>,
    pub mode: String,
    pub outcome: String,
    pub actor_principal_id: String,
    pub reason: String,
    pub metadata: Option<Value>,
    pub idempotency_key: String,
    pub deliveries: Vec<RouteTeamDelivery>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListTeamRoutingDecisions {
    pub conversation_id: Option<String>,
    pub message_id: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListTeamDiscussionRounds {
    pub conversation_id: String,
    pub state: Option<String>,
    pub after_created_at: Option<i64>,
    pub after_round_id: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TeamConversationPageCursor {
    pub created_at: i64,
    pub message_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReadTeamConversationPage {
    pub conversation_id: String,
    pub before_created_at: Option<i64>,
    pub before_message_id: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TeamConversationPage {
    pub conversation: TeamConversationRecord,
    pub participants: Vec<TeamParticipantRecord>,
    pub messages: Vec<TeamMessageRecord>,
    pub routing_decisions: Vec<TeamRoutingDecisionRecord>,
    pub rounds: Vec<TeamDiscussionRoundRecord>,
    pub deliveries: Vec<TeamDeliveryRecord>,
    pub observed_at: i64,
    pub next_cursor: Option<TeamConversationPageCursor>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListTeamDeliveries {
    pub conversation_id: Option<String>,
    pub message_id: Option<String>,
    pub routing_decision_id: Option<String>,
    pub state: Option<String>,
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
    pub version: String,
    pub state: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SubmitPluginAction {
    pub plugin_id: String,
    pub version: String,
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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ActivatePluginInstall {
    pub manifest: PutPluginManifest,
    pub install: PutPluginInstall,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PluginInstallActivation {
    pub manifest: PluginManifestRecord,
    pub install: PluginInstallRecord,
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
    pub version: String,
    pub expected_state: String,
    pub state: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GetPluginActionExecutionAdmission {
    pub plugin_id: String,
    pub version: String,
    pub required_capability: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PluginActionExecutionAdmission {
    pub manifest: PluginManifestRecord,
    pub install: PluginInstallRecord,
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
    pub turn_id: String,
    pub attempt_id: String,
    pub input_id: String,
    pub job_id: String,
    pub worker_id: String,
    pub lease_token: String,
    pub idempotency_key: String,
    pub role: String,
    pub content: Value,
    pub provider_state: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SettleSessionTurn {
    pub session_id: String,
    pub turn_id: String,
    pub attempt_id: String,
    pub input_id: String,
    pub job_id: String,
    pub worker_id: String,
    pub lease_token: String,
    pub outcome: String,
    pub provider_invocation_id: Option<String>,
    pub assistant_message: Option<Value>,
    pub provider_state: Option<Value>,
    pub result: Option<Value>,
    pub error: Option<Value>,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProviderInvocationRecord {
    pub id: String,
    pub session_id: String,
    pub turn_id: String,
    pub attempt_id: String,
    pub input_id: String,
    pub job_id: String,
    pub step: i64,
    pub invocation_number: i64,
    pub execution_binding_digest: String,
    pub request_digest: String,
    pub state: String,
    pub output_observed: bool,
    pub provider_request_id: Option<String>,
    pub assistant_message_id: Option<String>,
    pub error: Option<Value>,
    pub started_at: i64,
    pub updated_at: i64,
    pub finished_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MediaGenerationOperationRecord {
    pub id: String,
    pub job_id: String,
    pub principal_id: String,
    pub idempotency_key: String,
    pub conversation: Option<MediaGenerationConversationRelation>,
    pub state: String,
    pub binding: Value,
    pub dispatch_attempt: i64,
    pub external_operation_id: Option<String>,
    pub provider_checkpoint: Option<Value>,
    pub poll_count: i64,
    pub consecutive_poll_failures: i64,
    pub next_poll_at: Option<i64>,
    pub last_poll_error: Option<Value>,
    pub output_references: Vec<Value>,
    pub output_resource_ids: Vec<String>,
    pub progress: Option<Value>,
    pub error: Option<Value>,
    pub cancel_requested_at: Option<i64>,
    pub cancel_reason: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub finished_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MediaGenerationConversationRelation {
    pub session_id: String,
    pub turn_id: String,
    pub source_message_id: String,
    pub tool_execution_id: String,
    pub tool_call_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SubmitMediaGenerationOperation {
    pub id: Option<String>,
    pub job_id: Option<String>,
    pub principal_id: String,
    pub idempotency_key: String,
    pub binding: Value,
    pub priority: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MediaGenerationOperationSubmission {
    pub operation: MediaGenerationOperationRecord,
    pub job: SchedulerJobRecord,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum DeferredToolOperation {
    MediaGeneration {
        binding: Value,
        priority: Option<i64>,
    },
    TeamDelegation {
        operation_id: String,
        conversation_id: String,
        source_delivery_id: String,
        lead_participant_id: String,
        graph_id: String,
        tasks: Vec<DeferredTeamDelegationTask>,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DeferredTeamDelegationTask {
    pub id: String,
    pub graph_node_id: String,
    pub target_participant_id: String,
    pub target_session_id: String,
    pub prompt: String,
    pub depends_on_task_ids: Vec<String>,
    pub child_input_id: String,
    pub child_turn_id: String,
    pub child_job_id: String,
    pub input_idempotency_key: String,
    pub job_idempotency_key: String,
    pub execution_binding: Value,
    pub max_steps: Option<i64>,
    pub priority: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DeferToolExecution {
    pub session_id: String,
    pub turn_id: String,
    pub session_attempt_id: String,
    pub input_id: String,
    pub source_message_id: String,
    pub session_job_id: String,
    pub worker_id: String,
    pub lease_token: String,
    pub tool_execution_id: String,
    pub tool_invocation_attempt_id: String,
    pub tool_call_id: String,
    pub operation: DeferredToolOperation,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum DeferredToolOperationReceipt {
    MediaGeneration {
        record: MediaGenerationOperationRecord,
        job: SchedulerJobRecord,
    },
    TeamDelegation {
        record: TeamDelegationOperationRecord,
        tasks: Vec<TeamDelegationTaskRecord>,
        graph: DelegationGraphRecord,
        nodes: Vec<DelegationGraphNodeRecord>,
        dependencies: Vec<DelegationGraphDependencyRecord>,
        jobs: Vec<SchedulerJobRecord>,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DeferToolExecutionReceipt {
    pub turn: SessionTurnRecord,
    pub session_attempt: SessionAttemptRecord,
    pub session_job: SchedulerJobRecord,
    pub tool_execution: ToolExecutionRecord,
    pub tool_invocation_attempt: ToolExecutionAttemptRecord,
    pub operation: DeferredToolOperationReceipt,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BeginMediaGenerationOperation {
    pub operation_id: String,
    pub worker_id: String,
    pub lease_token: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MediaGenerationBeginReceipt {
    pub operation: MediaGenerationOperationRecord,
    pub job: SchedulerJobRecord,
    pub action: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AcceptMediaGenerationOperation {
    pub operation_id: String,
    pub worker_id: String,
    pub lease_token: String,
    pub external_operation_id: String,
    pub provider_checkpoint: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SuspendMediaGenerationOperation {
    pub operation_id: String,
    pub worker_id: String,
    pub lease_token: String,
    pub next_poll_at: i64,
    pub outcome: String,
    pub provider_checkpoint: Option<Value>,
    pub progress: Option<Value>,
    pub error: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MediaGenerationSuspendReceipt {
    pub operation: MediaGenerationOperationRecord,
    pub job: SchedulerJobRecord,
    pub action: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RecordMediaGenerationOutputs {
    pub operation_id: String,
    pub worker_id: String,
    pub lease_token: String,
    pub poll_outcome: String,
    pub output_references: Vec<Value>,
    pub progress: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CompleteMediaGenerationOperation {
    pub operation_id: String,
    pub worker_id: String,
    pub lease_token: String,
    pub poll_outcome: String,
    pub output_resource_ids: Vec<String>,
    pub result: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SettleMediaGenerationOperation {
    pub operation_id: String,
    pub worker_id: String,
    pub lease_token: String,
    pub poll_outcome: String,
    pub outcome: String,
    pub error: Option<Value>,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RequestMediaGenerationCancel {
    pub operation_id: String,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GetMediaGenerationOperation {
    pub operation_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListMediaGenerationOperations {
    pub principal_id: Option<String>,
    pub state: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BeginProviderInvocation {
    pub id: Option<String>,
    pub session_id: String,
    pub turn_id: String,
    pub attempt_id: String,
    pub input_id: String,
    pub job_id: String,
    pub worker_id: String,
    pub lease_token: String,
    pub step: i64,
    pub invocation_number: i64,
    pub request_digest: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MarkProviderInvocationOutput {
    pub session_id: String,
    pub turn_id: String,
    pub attempt_id: String,
    pub input_id: String,
    pub job_id: String,
    pub worker_id: String,
    pub lease_token: String,
    pub invocation_id: String,
    pub provider_request_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FinishProviderInvocation {
    pub session_id: String,
    pub turn_id: String,
    pub attempt_id: String,
    pub input_id: String,
    pub job_id: String,
    pub worker_id: String,
    pub lease_token: String,
    pub invocation_id: String,
    pub outcome: String,
    pub assistant_message: Option<Value>,
    pub provider_state: Option<Value>,
    pub provider_request_id: Option<String>,
    pub error: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FinishProviderInvocationReceipt {
    pub invocation: ProviderInvocationRecord,
    pub assistant_message: Option<SessionMessageRecord>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListProviderInvocations {
    pub turn_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SettleSessionTurnReceipt {
    pub turn: SessionTurnRecord,
    pub attempt: SessionAttemptRecord,
    pub job: SchedulerJobRecord,
    pub assistant_message: Option<SessionMessageRecord>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RequestSessionTurnCancel {
    pub session_id: String,
    pub turn_id: String,
    pub input_id: String,
    pub job_id: String,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RequestSessionTurnCancelReceipt {
    pub status: String,
    pub turn: Option<SessionTurnRecord>,
    pub job: Option<SchedulerJobRecord>,
    pub cascade_job_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct InterruptSessionTurn {
    pub session_id: String,
    pub turn_id: String,
    pub attempt_id: String,
    pub reason: String,
    pub principal_id: Option<String>,
    pub idempotency_key: Option<String>,
    pub origin: Option<Value>,
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InterruptSessionTurnReceipt {
    pub session_id: String,
    pub turn_id: String,
    pub attempt_id: String,
    pub durability: String,
    pub status: String,
    pub accepted_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SteerSessionTurn {
    pub session_id: String,
    pub principal_id: String,
    pub expected_turn_id: String,
    pub expected_attempt_id: String,
    pub idempotency_key: String,
    pub content: Value,
    pub origin: Option<Value>,
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SteerSessionTurnReceipt {
    pub session_id: String,
    pub turn_id: String,
    pub attempt_id: String,
    pub durability: String,
    pub status: String,
    pub accepted_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SessionTurnControlRecord {
    pub id: String,
    pub session_id: String,
    pub turn_id: String,
    pub attempt_id: String,
    pub input_id: Option<String>,
    pub principal_id: Option<String>,
    pub idempotency_key: String,
    pub kind: String,
    pub status: String,
    pub content: Option<Value>,
    pub reason: Option<String>,
    pub origin: Option<Value>,
    pub metadata: Option<Value>,
    pub created_at: i64,
    pub updated_at: i64,
    pub applied_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApplySessionTurnControl {
    pub session_id: String,
    pub turn_id: String,
    pub attempt_id: String,
    pub control_id: String,
    pub job_id: String,
    pub worker_id: String,
    pub lease_token: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ApplySessionTurnControlReceipt {
    pub control: SessionTurnControlRecord,
    pub effect: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListSessionTurnControls {
    pub session_id: String,
    pub turn_id: Option<String>,
    pub attempt_id: Option<String>,
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
pub struct SubmitSessionTurn {
    pub id: Option<String>,
    pub turn_id: Option<String>,
    pub session_id: String,
    pub principal_id: String,
    pub idempotency_key: String,
    pub input_type: Option<String>,
    pub content: Value,
    pub origin: Option<Value>,
    pub intent: Option<String>,
    pub run_control_policy: Option<String>,
    pub expected_turn_id: Option<String>,
    pub job_id: Option<String>,
    pub job_idempotency_key: Option<String>,
    pub execution_binding: Value,
    pub max_steps: Option<i64>,
    pub regenerates_turn_id: Option<String>,
    pub scheduled_at: Option<i64>,
    pub not_before: Option<i64>,
    pub priority: Option<i64>,
    pub budget_grant_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SubmitSessionTurnReceipt {
    pub admission: AdmissionReceipt,
    pub turn: SessionTurnRecord,
    pub job: SchedulerJobRecord,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SessionTurnRecord {
    pub id: String,
    pub session_id: String,
    pub primary_input_id: String,
    pub job_id: String,
    pub state: String,
    pub execution_binding: Value,
    pub execution_binding_digest: String,
    pub max_steps: i64,
    pub current_attempt_id: Option<String>,
    pub regenerates_turn_id: Option<String>,
    pub cancel_requested_at: Option<i64>,
    pub cancel_reason: Option<String>,
    pub result: Option<Value>,
    pub error: Option<Value>,
    pub created_at: i64,
    pub updated_at: i64,
    pub finished_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SessionAttemptRecord {
    pub id: String,
    pub session_id: String,
    pub turn_id: String,
    pub input_id: String,
    pub job_id: String,
    pub attempt_number: i64,
    pub worker_id: String,
    pub lease_token: String,
    pub state: String,
    pub error: Option<Value>,
    pub started_at: i64,
    pub updated_at: i64,
    pub finished_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StartSessionTurnAttempt {
    pub session_id: String,
    pub turn_id: String,
    pub input_id: String,
    pub job_id: String,
    pub worker_id: String,
    pub lease_token: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StartSessionTurnAttemptReceipt {
    pub turn: SessionTurnRecord,
    pub attempt: SessionAttemptRecord,
    pub input_message: SessionMessageRecord,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListSessionTurns {
    pub session_id: String,
    pub state: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListSessionAttempts {
    pub turn_id: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BudgetScopeKind {
    Session,
    Turn,
    Objective,
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
            Self::Objective => "objective",
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
    #[serde(rename = "session.turn")]
    SessionTurn,
    #[serde(rename = "workspace.task")]
    WorkspaceTask,
    #[serde(rename = "team.delivery")]
    TeamDelivery,
    #[serde(rename = "team.delivery.outcome")]
    TeamDeliveryOutcome,
    #[serde(rename = "plugin.action")]
    PluginAction,
    #[serde(rename = "channel.delivery")]
    ChannelDelivery,
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
    #[serde(rename = "media.generate")]
    MediaGenerate,
}

impl SchedulerJobKind {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::SessionTurn => "session.turn",
            Self::WorkspaceTask => "workspace.task",
            Self::TeamDelivery => "team.delivery",
            Self::TeamDeliveryOutcome => "team.delivery.outcome",
            Self::PluginAction => "plugin.action",
            Self::ChannelDelivery => "channel.delivery",
            Self::GatewayDelivery => "gateway.delivery",
            Self::MemoryCompaction => "memory.compaction",
            Self::ResourceCleanup => "resource.cleanup",
            Self::BudgetGrantExpire => "budget.grant_expire",
            Self::ProviderRetry => "provider.retry",
            Self::ConfigSync => "config.sync",
            Self::MediaGenerate => "media.generate",
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
    pub concurrency_key: Option<String>,
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
    pub concurrency_key: Option<String>,
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResourceInputEvidence {
    #[serde(alias = "resourceId")]
    pub resource_id: String,
    pub sha256: String,
    #[serde(alias = "sizeBytes")]
    pub size_bytes: i64,
    pub kind: String,
    #[serde(alias = "mediaType")]
    pub media_type: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ResourceProvenanceCause {
    ToolExecution {
        #[serde(alias = "executionId")]
        execution_id: String,
        #[serde(alias = "sessionId")]
        session_id: String,
        #[serde(alias = "turnId")]
        turn_id: String,
        #[serde(alias = "sourceMessageId")]
        source_message_id: String,
        #[serde(alias = "toolCallId")]
        tool_call_id: String,
    },
    MediaGeneration {
        #[serde(alias = "operationId")]
        operation_id: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResourceProvenanceRecord {
    pub id: String,
    pub resource: ResourceInputEvidence,
    pub cause: ResourceProvenanceCause,
    pub input_resources: Vec<ResourceInputEvidence>,
    pub digest: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RecordResourceProvenance {
    pub resource: ResourceInputEvidence,
    pub cause: ResourceProvenanceCause,
    pub input_resources: Vec<ResourceInputEvidence>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListResourceProvenance {
    pub resource_id: Option<String>,
    pub cause_kind: Option<String>,
    pub cause_id: Option<String>,
    pub limit: Option<i64>,
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
pub struct ResourceContentChunk {
    pub resource_id: String,
    pub sha256: String,
    pub total_size_bytes: u64,
    pub offset: u64,
    pub content: Vec<u8>,
    pub eof: bool,
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
pub struct ToolActivityPresentationDetail {
    pub label: String,
    pub value: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ToolActivityPresentation {
    pub summary: String,
    pub details: Option<Vec<ToolActivityPresentationDetail>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ToolActivityEvidence {
    pub call: ToolActivityPresentation,
    pub result: Option<ToolActivityPresentation>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ToolActivityRecord {
    pub session_id: String,
    pub turn_id: String,
    pub source_message_id: String,
    pub tool_call_id: String,
    pub tool_name: String,
    pub state: String,
    pub activity: Option<ToolActivityEvidence>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ToolExecutionRecord {
    pub id: String,
    pub session_id: String,
    pub turn_id: String,
    pub input_id: String,
    pub source_message_id: String,
    pub principal_id: String,
    pub tool_call_id: String,
    pub tool_name: String,
    pub input: Value,
    pub descriptor: Value,
    pub permission: Value,
    pub activity: Option<ToolActivityEvidence>,
    pub state: String,
    pub current_invocation_attempt_id: Option<String>,
    pub attempt_count: i64,
    pub idempotency_key: String,
    pub approval_revision: i64,
    pub recovery_revision: i64,
    pub recovery: Option<Value>,
    pub content: Option<Vec<ToolResultContentPart>>,
    pub content_digest: Option<String>,
    pub is_error: Option<bool>,
    pub error: Option<Value>,
    pub created_at: i64,
    pub finished_at: Option<i64>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ToolResultContentPart {
    Text {
        text: String,
    },
    Json {
        value: Value,
    },
    Resource {
        resource_id: String,
        sha256: String,
        size_bytes: i64,
        kind: String,
        media_type: Option<String>,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ToolExecutionAttemptRecord {
    pub id: String,
    pub execution_id: String,
    pub session_attempt_id: String,
    pub job_id: String,
    pub worker_id: String,
    pub attempt_number: i64,
    pub state: String,
    pub error: Option<Value>,
    pub started_at: i64,
    pub updated_at: i64,
    pub finished_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BeginToolExecution {
    pub session_id: String,
    pub turn_id: String,
    pub attempt_id: String,
    pub input_id: String,
    pub source_message_id: String,
    pub job_id: String,
    pub worker_id: String,
    pub lease_token: String,
    pub principal_id: String,
    pub tool_call_id: String,
    pub tool_name: String,
    pub input: Value,
    pub descriptor: Value,
    pub permission: Value,
    pub activity: Option<ToolActivityEvidence>,
    pub state: String,
    pub idempotency_key: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BeginToolExecutionReceipt {
    pub execution: ToolExecutionRecord,
    pub invocation_attempt: Option<ToolExecutionAttemptRecord>,
    pub approval_suspension: Option<ToolExecutionApprovalSuspensionReceipt>,
    pub created: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ToolExecutionApprovalSuspensionReceipt {
    pub execution: ToolExecutionRecord,
    pub turn: SessionTurnRecord,
    pub attempt: SessionAttemptRecord,
    pub job: SchedulerJobRecord,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FinishToolExecution {
    pub session_id: String,
    pub turn_id: String,
    pub session_attempt_id: String,
    pub input_id: String,
    pub job_id: String,
    pub worker_id: String,
    pub lease_token: String,
    pub execution_id: String,
    pub invocation_attempt_id: String,
    pub state: String,
    pub content: Option<Vec<ToolResultContentPart>>,
    pub content_digest: Option<String>,
    pub is_error: Option<bool>,
    pub result_presentation: Option<ToolActivityPresentation>,
    pub error: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RequireToolExecutionRecovery {
    pub session_id: String,
    pub turn_id: String,
    pub session_attempt_id: String,
    pub input_id: String,
    pub job_id: String,
    pub worker_id: String,
    pub lease_token: String,
    pub execution_id: String,
    pub invocation_attempt_id: String,
    pub evidence: Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RequireToolExecutionRecoveryReceipt {
    pub execution: ToolExecutionRecord,
    pub turn: SessionTurnRecord,
    pub attempt: SessionAttemptRecord,
    pub job: SchedulerJobRecord,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ResolveToolExecutionRecovery {
    pub execution_id: String,
    pub expected_recovery_revision: i64,
    pub decision: String,
    pub principal_id: String,
    pub reason: String,
    pub idempotency_key: String,
    pub content: Option<Vec<ToolResultContentPart>>,
    pub content_digest: Option<String>,
    pub error: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ToolExecutionRecoveryDecisionRecord {
    pub id: String,
    pub execution_id: String,
    pub recovery_revision: i64,
    pub decision: String,
    pub principal_id: String,
    pub reason: String,
    pub idempotency_key: String,
    pub content: Option<Vec<ToolResultContentPart>>,
    pub content_digest: Option<String>,
    pub error: Option<Value>,
    pub action: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ResolveToolExecutionRecoveryReceipt {
    pub execution: ToolExecutionRecord,
    pub recovery_decision: ToolExecutionRecoveryDecisionRecord,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResolveToolExecutionApproval {
    pub execution_id: String,
    pub expected_approval_revision: i64,
    pub decision: String,
    pub principal_id: String,
    pub reason: String,
    pub idempotency_key: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ToolExecutionApprovalDecisionRecord {
    pub id: String,
    pub execution_id: String,
    pub approval_revision: i64,
    pub decision: String,
    pub principal_id: String,
    pub reason: String,
    pub idempotency_key: String,
    pub action: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ResolveToolExecutionApprovalReceipt {
    pub execution: ToolExecutionRecord,
    pub approval_decision: ToolExecutionApprovalDecisionRecord,
    pub turn: SessionTurnRecord,
    pub job: SchedulerJobRecord,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListToolExecutionAttempts {
    pub execution_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GetToolExecutionByCall {
    pub turn_id: String,
    pub source_message_id: String,
    pub tool_call_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListToolExecutions {
    pub session_id: Option<String>,
    pub turn_id: Option<String>,
    pub state: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListToolActivities {
    pub session_id: String,
    pub source_message_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DoctorCheckState {
    Ok,
    Warn,
    Error,
}
