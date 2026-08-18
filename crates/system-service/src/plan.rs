use std::collections::HashSet;

use crate::event_store::append_event_tx;
use crate::rows::{row_to_plan_proposal, row_to_plan_proposal_operation};
use crate::sessions::{session_has_unfinished_work_tx, submit_session_turn_tx};
use crate::{
    CreatePlanProposal, EventScope, ExecuteApprovedPlan, ExecuteApprovedPlanReceipt,
    ListPlanProposalOperations, ListPlanProposals, PlanProposalContentRecord,
    PlanProposalOperationRecord, PlanProposalRecord, PlanProposalReferenceRecord, Result,
    SubmitSessionTurnReceipt, SystemService, SystemServiceError,
};
use rusqlite::{params, params_from_iter, OptionalExtension, ToSql};
use serde_json::Value;
use uuid::Uuid;

const MAX_PLAN_TITLE_CHARS: usize = 500;
const MAX_PLAN_SUMMARY_CHARS: usize = 20_000;
const MAX_PLAN_STEP_TITLE_CHARS: usize = 500;
const MAX_PLAN_STEP_DETAIL_CHARS: usize = 20_000;
const MAX_PLAN_STEPS: usize = 256;
const MAX_PLAN_REFERENCES: usize = 256;
const MAX_PLAN_EVIDENCE_BYTES: usize = 256 * 1024;

const PLAN_PROPOSAL_SELECT: &str = "SELECT
    plan_proposal.id, plan_proposal.principal_id, plan_proposal.revision,
    plan_proposal.source_session_id, plan_proposal.source_head_sequence,
    plan_proposal.source_head_message_id, plan_proposal.source_head_turn_id,
    plan_proposal.analysis_input_digest, plan_proposal.planning_request_json,
    plan_proposal.generation_endpoint_id, plan_proposal.generation_endpoint_digest,
    plan_proposal.generation_protocol_id, plan_proposal.generation_provider_id,
    plan_proposal.generation_model_id, plan_proposal.generated_at,
    plan_proposal.generation_output_digest, plan_proposal.generation_output_json,
    plan_proposal.title, plan_proposal.summary, plan_proposal.steps_json,
    plan_proposal.references_json, plan_proposal.state,
    plan_proposal.execution_input_id, plan_proposal.execution_turn_id,
    plan_proposal.execution_job_id, plan_proposal.execution_binding_digest,
    plan_proposal.execution_digest, plan_proposal.execution_bound_at,
    plan_proposal.created_at, plan_proposal.updated_at, plan_proposal.decided_at
 FROM plan_proposal";

const PLAN_PROPOSAL_OPERATION_SELECT: &str = "SELECT
    id, proposal_id, operation, actor_kind, actor_id, from_state, to_state,
    from_revision, to_revision, content_json, reason, created_at
 FROM plan_proposal_operation";

impl SystemService {
    pub fn create_plan_proposal(&self, request: &CreatePlanProposal) -> Result<PlanProposalRecord> {
        validate_create_plan_proposal(request)?;
        let id = request
            .id
            .clone()
            .unwrap_or_else(|| format!("planp_{}", Uuid::now_v7()));
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;

        if let Some(record) = tx
            .query_row(
                &format!("{PLAN_PROPOSAL_SELECT} WHERE idempotency_key = ?"),
                params![request.idempotency_key],
                row_to_plan_proposal,
            )
            .optional()?
        {
            validate_existing_plan_proposal(&record, request)?;
            tx.commit()?;
            return Ok(record);
        }
        if let Some(record) = get_plan_proposal_tx(&tx, &id)? {
            validate_existing_plan_proposal(&record, request)?;
            tx.commit()?;
            return Ok(record);
        }

        require_exact_source_head_tx(&tx, request)?;
        if session_has_unfinished_work_tx(&tx, &request.source.session_id)? {
            return Err(SystemServiceError::Conflict(format!(
                "plan source session has unfinished work: {}",
                request.source.session_id
            )));
        }

        tx.execute(
            "INSERT INTO plan_proposal (
                id, principal_id, revision, source_session_id,
                source_head_sequence, source_head_message_id, source_head_turn_id,
                analysis_input_digest, planning_request_json,
                generation_endpoint_id, generation_endpoint_digest,
                generation_protocol_id, generation_provider_id, generation_model_id,
                generated_at, generation_output_digest, generation_output_json,
                title, summary, steps_json, references_json, state, idempotency_key,
                execution_input_id, execution_turn_id, execution_job_id,
                execution_binding_digest, execution_digest,
                execution_idempotency_key, execution_bound_at,
                created_at, updated_at, decided_at
             ) VALUES (
                ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                'open', ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, NULL
             )",
            params![
                id,
                request.principal_id,
                request.source.session_id,
                request.source.head_sequence,
                request.source.head_message_id,
                request.source.head_turn_id,
                request.source.analysis_input_digest,
                serde_json::to_string(&request.source.planning_request)?,
                request.generation.endpoint_id,
                request.generation.endpoint_digest,
                request.generation.protocol_id,
                request.generation.provider_id,
                request.generation.model_id,
                request.generation.generated_at,
                request.generation.output_digest,
                serde_json::to_string(&request.generation.output)?,
                request.content.title,
                request.content.summary,
                serde_json::to_string(&request.content.steps)?,
                serde_json::to_string(&request.content.references)?,
                request.idempotency_key,
                now,
                now,
            ],
        )?;
        insert_plan_references_tx(&tx, &id, &request.content.references, now)?;
        append_event_tx(
            &tx,
            &format!("evt_{}", Uuid::now_v7()),
            "plan.proposal.created",
            &EventScope {
                session_id: Some(request.source.session_id.clone()),
                plan_proposal_id: Some(id.clone()),
                ..EventScope::default()
            },
            &serde_json::json!({
                "proposalId": id,
                "principalId": request.principal_id,
                "revision": 1,
                "sourceSessionId": request.source.session_id,
                "sourceHeadSequence": request.source.head_sequence,
                "state": "open",
                "updatedAt": now
            }),
            now,
        )?;
        let record = get_plan_proposal_tx(&tx, &id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!("plan proposal insert missing: {id}"))
        })?;
        tx.commit()?;
        Ok(record)
    }

    pub fn get_plan_proposal(&self, proposal_id: &str) -> Result<Option<PlanProposalRecord>> {
        validate_non_empty(proposal_id, "plan proposal id")?;
        let conn = self.connect()?;
        conn.query_row(
            &format!("{PLAN_PROPOSAL_SELECT} WHERE plan_proposal.id = ?"),
            params![proposal_id],
            row_to_plan_proposal,
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn list_plan_proposals(
        &self,
        request: &ListPlanProposals,
    ) -> Result<Vec<PlanProposalRecord>> {
        validate_optional_plan_state(request.state.as_deref())?;
        validate_optional_non_empty(request.principal_id.as_deref(), "principal_id")?;
        validate_optional_non_empty(request.source_session_id.as_deref(), "source_session_id")?;
        if request.reference_kind.is_some() != request.reference_id.is_some() {
            return Err(SystemServiceError::Invariant(
                "plan proposal reference_kind and reference_id must be provided together"
                    .to_string(),
            ));
        }
        if let Some(kind) = request.reference_kind.as_deref() {
            validate_plan_reference_kind(kind)?;
        }
        validate_optional_non_empty(request.reference_id.as_deref(), "reference_id")?;

        let mut sql = if request.reference_kind.is_some() {
            format!(
                "{PLAN_PROPOSAL_SELECT}
                 JOIN plan_proposal_reference ppr ON ppr.proposal_id = plan_proposal.id
                 WHERE 1 = 1"
            )
        } else {
            format!("{PLAN_PROPOSAL_SELECT} WHERE 1 = 1")
        };
        let mut values: Vec<Box<dyn ToSql>> = Vec::new();
        if let Some(principal_id) = &request.principal_id {
            sql.push_str(" AND plan_proposal.principal_id = ?");
            values.push(Box::new(principal_id.clone()));
        }
        if let Some(session_id) = &request.source_session_id {
            sql.push_str(" AND plan_proposal.source_session_id = ?");
            values.push(Box::new(session_id.clone()));
        }
        if let Some(state) = &request.state {
            sql.push_str(" AND plan_proposal.state = ?");
            values.push(Box::new(state.clone()));
        }
        if let (Some(reference_kind), Some(reference_id)) =
            (&request.reference_kind, &request.reference_id)
        {
            sql.push_str(" AND ppr.kind = ? AND ppr.reference_id = ?");
            values.push(Box::new(reference_kind.clone()));
            values.push(Box::new(reference_id.clone()));
        }
        sql.push_str(" ORDER BY plan_proposal.updated_at DESC, plan_proposal.id ASC LIMIT ?");
        values.push(Box::new(request.limit.unwrap_or(100).clamp(1, 1000)));

        let conn = self.connect()?;
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(
            params_from_iter(values.iter().map(|value| value.as_ref())),
            row_to_plan_proposal,
        )?;
        collect_plan_proposals(rows)
    }

    pub fn record_plan_proposal_operation(
        &self,
        request: &crate::RecordPlanProposalOperation,
    ) -> Result<PlanProposalOperationRecord> {
        validate_record_plan_proposal_operation(request)?;
        let id = request
            .id
            .clone()
            .unwrap_or_else(|| format!("planop_{}", Uuid::now_v7()));
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;

        if let Some(existing) = get_plan_operation_by_idempotency_tx(&tx, &request.idempotency_key)?
        {
            validate_existing_plan_operation(&existing, request)?;
            tx.commit()?;
            return Ok(existing);
        }
        if let Some(existing) = get_plan_proposal_operation_tx(&tx, &id)? {
            validate_existing_plan_operation(&existing, request)?;
            tx.commit()?;
            return Ok(existing);
        }

        let proposal = get_plan_proposal_tx(&tx, &request.proposal_id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!(
                "plan proposal does not exist: {}",
                request.proposal_id
            ))
        })?;
        if proposal.revision != request.expected_revision {
            return Err(plan_revision_conflict(
                &request.proposal_id,
                request.expected_revision,
                proposal.revision,
            ));
        }
        if proposal.state != "open" {
            return Err(SystemServiceError::Conflict(format!(
                "plan proposal is not open: {}",
                request.proposal_id
            )));
        }
        let to_state = operation_target_state(&request.operation)?;
        let to_revision = proposal.revision + 1;
        let content_json = request
            .content
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;

        let updated = if request.operation == "revise" {
            let content = request.content.as_ref().ok_or_else(|| {
                SystemServiceError::Invariant(
                    "revise plan operation requires replacement content".to_string(),
                )
            })?;
            tx.execute(
                "UPDATE plan_proposal
                 SET revision = ?, title = ?, summary = ?, steps_json = ?,
                     references_json = ?, updated_at = ?
                 WHERE id = ? AND state = 'open' AND revision = ?",
                params![
                    to_revision,
                    content.title,
                    content.summary,
                    serde_json::to_string(&content.steps)?,
                    serde_json::to_string(&content.references)?,
                    now,
                    request.proposal_id,
                    request.expected_revision,
                ],
            )?
        } else {
            tx.execute(
                "UPDATE plan_proposal
                 SET revision = ?, state = ?, updated_at = ?, decided_at = ?
                 WHERE id = ? AND state = 'open' AND revision = ?",
                params![
                    to_revision,
                    to_state,
                    now,
                    now,
                    request.proposal_id,
                    request.expected_revision,
                ],
            )?
        };
        if updated != 1 {
            return Err(plan_revision_conflict(
                &request.proposal_id,
                request.expected_revision,
                proposal.revision,
            ));
        }
        if let Some(content) = &request.content {
            tx.execute(
                "DELETE FROM plan_proposal_reference WHERE proposal_id = ?",
                params![request.proposal_id],
            )?;
            insert_plan_references_tx(&tx, &request.proposal_id, &content.references, now)?;
        }
        tx.execute(
            "INSERT INTO plan_proposal_operation (
                id, proposal_id, operation, actor_kind, actor_id,
                from_state, to_state, from_revision, to_revision,
                content_json, reason, idempotency_key, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                id,
                request.proposal_id,
                request.operation,
                request.actor_kind,
                request.actor_id,
                proposal.state,
                to_state,
                proposal.revision,
                to_revision,
                content_json,
                request.reason,
                request.idempotency_key,
                now,
            ],
        )?;
        append_event_tx(
            &tx,
            &format!("evt_{}", Uuid::now_v7()),
            "plan.proposal.operation_recorded",
            &EventScope {
                session_id: Some(proposal.source.session_id.clone()),
                plan_proposal_id: Some(request.proposal_id.clone()),
                ..EventScope::default()
            },
            &serde_json::json!({
                "proposalId": request.proposal_id,
                "operationId": id,
                "operation": request.operation,
                "actorKind": request.actor_kind,
                "actorId": request.actor_id,
                "fromState": proposal.state,
                "toState": to_state,
                "fromRevision": proposal.revision,
                "toRevision": to_revision,
                "updatedAt": now
            }),
            now,
        )?;
        let record = get_plan_proposal_operation_tx(&tx, &id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!("plan operation insert missing: {id}"))
        })?;
        tx.commit()?;
        Ok(record)
    }

    pub fn execute_approved_plan(
        &self,
        request: &ExecuteApprovedPlan,
    ) -> Result<ExecuteApprovedPlanReceipt> {
        validate_execute_approved_plan(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;
        let proposal = get_plan_proposal_tx(&tx, &request.proposal_id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!(
                "plan proposal does not exist: {}",
                request.proposal_id
            ))
        })?;
        if proposal.state != "approved" {
            return Err(SystemServiceError::Conflict(format!(
                "plan proposal is not approved: {}",
                request.proposal_id
            )));
        }
        if proposal.revision != request.expected_revision {
            return Err(plan_revision_conflict(
                &request.proposal_id,
                request.expected_revision,
                proposal.revision,
            ));
        }
        if request.turn.session_id != proposal.source.session_id {
            return Err(SystemServiceError::Invariant(
                "plan execution turn must target the source session".to_string(),
            ));
        }

        if let Some(existing_binding) = &proposal.execution {
            let existing_key: String = tx.query_row(
                "SELECT execution_idempotency_key FROM plan_proposal WHERE id = ?",
                params![request.proposal_id],
                |row| row.get(0),
            )?;
            if existing_key != request.idempotency_key {
                return Err(SystemServiceError::Conflict(format!(
                    "plan proposal already has an execution binding: {}",
                    request.proposal_id
                )));
            }
            let submission = submit_session_turn_tx(&tx, &request.turn, now)?;
            validate_existing_plan_submission(existing_binding, &submission, &request.turn)?;
            tx.commit()?;
            return Ok(ExecuteApprovedPlanReceipt {
                proposal,
                submission,
            });
        }

        require_exact_source_record_head_tx(&tx, &proposal)?;
        if session_has_unfinished_work_tx(&tx, &proposal.source.session_id)? {
            return Err(SystemServiceError::Conflict(format!(
                "plan source session has unfinished work: {}",
                proposal.source.session_id
            )));
        }

        let submission = submit_session_turn_tx(&tx, &request.turn, now)?;
        let execution_digest = plan_execution_digest(&proposal.id, proposal.revision, &submission)?;
        let updated = tx.execute(
            "UPDATE plan_proposal
             SET execution_input_id = ?, execution_turn_id = ?, execution_job_id = ?,
                 execution_binding_digest = ?, execution_digest = ?,
                 execution_idempotency_key = ?, execution_bound_at = ?, updated_at = ?
             WHERE id = ? AND state = 'approved' AND revision = ?
               AND execution_input_id IS NULL",
            params![
                submission.admission.input_id,
                submission.turn.id,
                submission.job.id,
                submission.turn.execution_binding_digest,
                execution_digest,
                request.idempotency_key,
                now,
                now,
                request.proposal_id,
                request.expected_revision,
            ],
        )?;
        if updated != 1 {
            return Err(SystemServiceError::Conflict(format!(
                "plan proposal execution binding changed concurrently: {}",
                request.proposal_id
            )));
        }
        append_event_tx(
            &tx,
            &format!("evt_{}", Uuid::now_v7()),
            "plan.proposal.execution_bound",
            &EventScope {
                session_id: Some(proposal.source.session_id.clone()),
                turn_id: Some(submission.turn.id.clone()),
                input_id: Some(submission.admission.input_id.clone()),
                plan_proposal_id: Some(proposal.id.clone()),
                ..EventScope::default()
            },
            &serde_json::json!({
                "proposalId": proposal.id,
                "revision": proposal.revision,
                "inputId": submission.admission.input_id,
                "turnId": submission.turn.id,
                "jobId": submission.job.id,
                "executionDigest": execution_digest,
                "boundAt": now
            }),
            now,
        )?;
        let proposal = get_plan_proposal_tx(&tx, &request.proposal_id)?.ok_or_else(|| {
            SystemServiceError::Invariant(
                "executed plan proposal disappeared in transaction".to_string(),
            )
        })?;
        tx.commit()?;
        Ok(ExecuteApprovedPlanReceipt {
            proposal,
            submission,
        })
    }

    pub fn list_plan_proposal_operations(
        &self,
        request: &ListPlanProposalOperations,
    ) -> Result<Vec<PlanProposalOperationRecord>> {
        validate_non_empty(&request.proposal_id, "plan proposal operation proposal_id")?;
        let conn = self.connect()?;
        let mut stmt = conn.prepare(&format!(
            "{PLAN_PROPOSAL_OPERATION_SELECT}
             WHERE proposal_id = ? ORDER BY from_revision ASC, id ASC"
        ))?;
        let rows = stmt.query_map(params![request.proposal_id], row_to_plan_proposal_operation)?;
        collect_plan_operations(rows)
    }
}

fn validate_create_plan_proposal(request: &CreatePlanProposal) -> Result<()> {
    validate_non_empty(&request.principal_id, "plan proposal principal_id")?;
    validate_optional_non_empty(request.id.as_deref(), "plan proposal id")?;
    validate_non_empty(&request.idempotency_key, "plan proposal idempotency_key")?;
    validate_non_empty(&request.source.session_id, "plan source session_id")?;
    if request.source.head_sequence < 0 {
        return Err(SystemServiceError::Invariant(
            "plan source head_sequence must not be negative".to_string(),
        ));
    }
    let has_head_ids =
        request.source.head_message_id.is_some() && request.source.head_turn_id.is_some();
    if (request.source.head_sequence == 0
        && (request.source.head_message_id.is_some() || request.source.head_turn_id.is_some()))
        || (request.source.head_sequence > 0 && !has_head_ids)
    {
        return Err(SystemServiceError::Invariant(
            "plan source head ids must exactly match head_sequence emptiness".to_string(),
        ));
    }
    validate_sha256(
        &request.source.analysis_input_digest,
        "plan source analysis_input_digest",
    )?;
    validate_json_array_evidence(
        &request.source.planning_request,
        "plan source planning_request",
    )?;
    validate_non_empty(
        &request.generation.endpoint_id,
        "plan generation endpoint_id",
    )?;
    validate_sha256(
        &request.generation.endpoint_digest,
        "plan generation endpoint_digest",
    )?;
    validate_non_empty(
        &request.generation.protocol_id,
        "plan generation protocol_id",
    )?;
    validate_non_empty(
        &request.generation.provider_id,
        "plan generation provider_id",
    )?;
    validate_non_empty(&request.generation.model_id, "plan generation model_id")?;
    if request.generation.generated_at <= 0 {
        return Err(SystemServiceError::Invariant(
            "plan generation generated_at must be positive".to_string(),
        ));
    }
    validate_sha256(
        &request.generation.output_digest,
        "plan generation output_digest",
    )?;
    validate_json_array_evidence(&request.generation.output, "plan generation output")?;
    if digest_json(&request.generation.output)? != request.generation.output_digest {
        return Err(SystemServiceError::Invariant(
            "plan generation output_digest does not match output".to_string(),
        ));
    }
    validate_plan_content(&request.content)
}

fn validate_record_plan_proposal_operation(
    request: &crate::RecordPlanProposalOperation,
) -> Result<()> {
    validate_non_empty(&request.proposal_id, "plan operation proposal_id")?;
    validate_optional_non_empty(request.id.as_deref(), "plan operation id")?;
    validate_non_empty(&request.actor_id, "plan operation actor_id")?;
    validate_non_empty(&request.idempotency_key, "plan operation idempotency_key")?;
    if request.actor_kind != "human" {
        return Err(SystemServiceError::Invariant(
            "plan decision actor_kind must be human".to_string(),
        ));
    }
    if request.expected_revision <= 0 {
        return Err(SystemServiceError::Invariant(
            "plan operation expected_revision must be positive".to_string(),
        ));
    }
    operation_target_state(&request.operation)?;
    if request.operation == "revise" {
        let content = request.content.as_ref().ok_or_else(|| {
            SystemServiceError::Invariant(
                "revise plan operation requires replacement content".to_string(),
            )
        })?;
        validate_plan_content(content)?;
    } else if request.content.is_some() {
        return Err(SystemServiceError::Invariant(
            "plan decision operation must not contain replacement content".to_string(),
        ));
    }
    validate_optional_non_empty(request.reason.as_deref(), "plan operation reason")
}

fn validate_execute_approved_plan(request: &ExecuteApprovedPlan) -> Result<()> {
    validate_non_empty(&request.proposal_id, "plan execution proposal_id")?;
    validate_non_empty(&request.idempotency_key, "plan execution idempotency_key")?;
    if request.expected_revision <= 0 {
        return Err(SystemServiceError::Invariant(
            "plan execution expected_revision must be positive".to_string(),
        ));
    }
    let origin = request
        .turn
        .origin
        .as_ref()
        .and_then(Value::as_object)
        .ok_or_else(|| {
            SystemServiceError::Invariant("plan execution turn requires a Plan origin".to_string())
        })?;
    if origin.get("kind").and_then(Value::as_str) != Some("plan")
        || origin.get("sourceRef").and_then(Value::as_str) != Some(request.proposal_id.as_str())
    {
        return Err(SystemServiceError::Invariant(
            "plan execution origin must use kind plan and sourceRef proposalId".to_string(),
        ));
    }
    if request
        .turn
        .input_type
        .as_deref()
        .is_some_and(|value| value != "user")
        || request
            .turn
            .intent
            .as_deref()
            .is_some_and(|value| value != "normal")
        || request.turn.run_control_policy.is_some()
        || request.turn.expected_turn_id.is_some()
        || request.turn.regenerates_turn_id.is_some()
        || request.turn.scheduled_at.is_some()
        || request.turn.not_before.is_some()
    {
        return Err(SystemServiceError::Invariant(
            "plan execution must be a fresh immediate normal user turn".to_string(),
        ));
    }
    Ok(())
}

fn validate_plan_content(content: &PlanProposalContentRecord) -> Result<()> {
    validate_bounded_text(&content.title, "plan proposal title", MAX_PLAN_TITLE_CHARS)?;
    validate_bounded_text(
        &content.summary,
        "plan proposal summary",
        MAX_PLAN_SUMMARY_CHARS,
    )?;
    let steps = content.steps.as_array().ok_or_else(|| {
        SystemServiceError::Invariant("plan proposal steps must be an array".to_string())
    })?;
    if steps.is_empty() || steps.len() > MAX_PLAN_STEPS {
        return Err(SystemServiceError::Invariant(format!(
            "plan proposal steps must contain 1..={MAX_PLAN_STEPS} entries"
        )));
    }
    let mut step_ids = HashSet::new();
    for step in steps {
        let object = step.as_object().ok_or_else(|| {
            SystemServiceError::Invariant("plan proposal step must be an object".to_string())
        })?;
        if object
            .keys()
            .any(|key| !matches!(key.as_str(), "id" | "title" | "detail" | "metadata"))
        {
            return Err(SystemServiceError::Invariant(
                "plan proposal step contains an unknown field".to_string(),
            ));
        }
        let id = required_json_string(object, "id", "plan proposal step")?;
        if !step_ids.insert(id.to_string()) {
            return Err(SystemServiceError::Invariant(format!(
                "duplicate plan proposal step id: {id}"
            )));
        }
        validate_bounded_text(
            required_json_string(object, "title", "plan proposal step")?,
            "plan proposal step title",
            MAX_PLAN_STEP_TITLE_CHARS,
        )?;
        if let Some(detail) = object.get("detail").filter(|value| !value.is_null()) {
            validate_bounded_text(
                detail.as_str().ok_or_else(|| {
                    SystemServiceError::Invariant(
                        "plan proposal step detail must be a string".to_string(),
                    )
                })?,
                "plan proposal step detail",
                MAX_PLAN_STEP_DETAIL_CHARS,
            )?;
        }
    }
    if content.references.len() > MAX_PLAN_REFERENCES {
        return Err(SystemServiceError::Invariant(format!(
            "plan proposal references exceed {MAX_PLAN_REFERENCES}"
        )));
    }
    let mut references = HashSet::new();
    for reference in &content.references {
        validate_plan_reference(reference)?;
        let key = (
            reference.kind.clone(),
            reference.reference_id.clone(),
            reference.role.clone().unwrap_or_default(),
        );
        if !references.insert(key) {
            return Err(SystemServiceError::Invariant(
                "duplicate plan proposal reference".to_string(),
            ));
        }
    }
    Ok(())
}

fn validate_plan_reference(reference: &PlanProposalReferenceRecord) -> Result<()> {
    validate_plan_reference_kind(&reference.kind)?;
    validate_non_empty(&reference.reference_id, "plan proposal reference id")?;
    validate_optional_non_empty(reference.role.as_deref(), "plan proposal reference role")
}

fn validate_plan_reference_kind(kind: &str) -> Result<()> {
    if !matches!(
        kind,
        "workspace_change_proposal"
            | "delegation_graph"
            | "delegation_graph_node"
            | "team_conversation"
            | "resource"
            | "context_epoch"
    ) {
        return Err(SystemServiceError::Invariant(format!(
            "invalid plan proposal reference kind: {kind}"
        )));
    }
    Ok(())
}

fn validate_optional_plan_state(state: Option<&str>) -> Result<()> {
    if state.is_some_and(|state| !matches!(state, "open" | "approved" | "rejected" | "withdrawn")) {
        return Err(SystemServiceError::Invariant(
            "invalid plan proposal state filter".to_string(),
        ));
    }
    Ok(())
}

fn operation_target_state(operation: &str) -> Result<&'static str> {
    match operation {
        "revise" => Ok("open"),
        "approve" => Ok("approved"),
        "reject" => Ok("rejected"),
        "withdraw" => Ok("withdrawn"),
        _ => Err(SystemServiceError::Invariant(format!(
            "invalid plan proposal operation: {operation}"
        ))),
    }
}

fn require_exact_source_head_tx(
    tx: &rusqlite::Transaction<'_>,
    request: &CreatePlanProposal,
) -> Result<()> {
    require_active_source_session_tx(tx, &request.source.session_id)?;
    let actual = canonical_session_head_tx(tx, &request.source.session_id)?;
    if actual
        != (
            request.source.head_sequence,
            request.source.head_message_id.clone(),
            request.source.head_turn_id.clone(),
        )
    {
        return Err(SystemServiceError::Conflict(format!(
            "plan source session head changed: {}",
            request.source.session_id
        )));
    }
    Ok(())
}

fn require_exact_source_record_head_tx(
    tx: &rusqlite::Transaction<'_>,
    proposal: &PlanProposalRecord,
) -> Result<()> {
    require_active_source_session_tx(tx, &proposal.source.session_id)?;
    let actual = canonical_session_head_tx(tx, &proposal.source.session_id)?;
    if actual
        != (
            proposal.source.head_sequence,
            proposal.source.head_message_id.clone(),
            proposal.source.head_turn_id.clone(),
        )
    {
        return Err(SystemServiceError::Conflict(format!(
            "plan source session head changed: {}",
            proposal.source.session_id
        )));
    }
    Ok(())
}

fn require_active_source_session_tx(
    tx: &rusqlite::Transaction<'_>,
    session_id: &str,
) -> Result<()> {
    let status: Option<String> = tx
        .query_row(
            "SELECT status FROM session WHERE id = ?",
            params![session_id],
            |row| row.get(0),
        )
        .optional()?;
    match status.as_deref() {
        Some("active") => Ok(()),
        Some(_) => Err(SystemServiceError::Conflict(format!(
            "plan source session is not active: {session_id}"
        ))),
        None => Err(SystemServiceError::Invariant(format!(
            "plan source session does not exist: {session_id}"
        ))),
    }
}

fn canonical_session_head_tx(
    tx: &rusqlite::Transaction<'_>,
    session_id: &str,
) -> Result<(i64, Option<String>, Option<String>)> {
    let head = tx
        .query_row(
            "SELECT sequence, id, turn_id
             FROM session_message
             WHERE session_id = ?
             ORDER BY sequence DESC
             LIMIT 1",
            params![session_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?;
    Ok(match head {
        Some((sequence, message_id, turn_id)) => (sequence, Some(message_id), Some(turn_id)),
        None => (0, None, None),
    })
}

fn validate_existing_plan_proposal(
    record: &PlanProposalRecord,
    request: &CreatePlanProposal,
) -> Result<()> {
    if record.principal_id != request.principal_id
        || record.source != request.source
        || record.generation != request.generation
        || record.title != request.content.title
        || record.summary != request.content.summary
        || record.steps != request.content.steps
        || record.references != request.content.references
    {
        return Err(SystemServiceError::Invariant(
            "conflicting repeated plan proposal creation".to_string(),
        ));
    }
    Ok(())
}

fn validate_existing_plan_operation(
    record: &PlanProposalOperationRecord,
    request: &crate::RecordPlanProposalOperation,
) -> Result<()> {
    if request.id.as_ref().is_some_and(|id| id != &record.id)
        || record.proposal_id != request.proposal_id
        || record.operation != request.operation
        || record.actor_kind != request.actor_kind
        || record.actor_id != request.actor_id
        || record.from_revision != request.expected_revision
        || record.content != request.content
        || record.reason != request.reason
    {
        return Err(SystemServiceError::Invariant(
            "conflicting repeated plan proposal operation".to_string(),
        ));
    }
    Ok(())
}

fn validate_existing_plan_submission(
    binding: &crate::PlanProposalExecutionBindingRecord,
    submission: &SubmitSessionTurnReceipt,
    request: &crate::SubmitSessionTurn,
) -> Result<()> {
    if binding.input_id != submission.admission.input_id
        || binding.turn_id != submission.turn.id
        || binding.job_id != submission.job.id
        || binding.execution_binding_digest != submission.turn.execution_binding_digest
        || submission.turn.execution_binding != request.execution_binding
        || submission.turn.max_steps != request.max_steps.unwrap_or(32)
        || submission.turn.regenerates_turn_id != request.regenerates_turn_id
        || request
            .id
            .as_ref()
            .is_some_and(|id| id != &binding.input_id)
        || request
            .turn_id
            .as_ref()
            .is_some_and(|id| id != &binding.turn_id)
        || request
            .job_id
            .as_ref()
            .is_some_and(|id| id != &binding.job_id)
    {
        return Err(SystemServiceError::Invariant(
            "conflicting repeated approved plan execution".to_string(),
        ));
    }
    Ok(())
}

fn plan_execution_digest(
    proposal_id: &str,
    revision: i64,
    submission: &SubmitSessionTurnReceipt,
) -> Result<String> {
    digest_json(&serde_json::json!({
        "proposalId": proposal_id,
        "revision": revision,
        "inputId": submission.admission.input_id,
        "turnId": submission.turn.id,
        "jobId": submission.job.id,
        "executionBindingDigest": submission.turn.execution_binding_digest
    }))
}

fn insert_plan_references_tx(
    tx: &rusqlite::Transaction<'_>,
    proposal_id: &str,
    references: &[PlanProposalReferenceRecord],
    now: i64,
) -> Result<()> {
    for reference in references {
        tx.execute(
            "INSERT INTO plan_proposal_reference (
                proposal_id, kind, reference_id, role, metadata_json, created_at
             ) VALUES (?, ?, ?, ?, ?, ?)",
            params![
                proposal_id,
                reference.kind,
                reference.reference_id,
                reference.role.as_deref().unwrap_or(""),
                reference
                    .metadata
                    .as_ref()
                    .map(serde_json::to_string)
                    .transpose()?,
                now,
            ],
        )?;
    }
    Ok(())
}

fn get_plan_proposal_tx(
    tx: &rusqlite::Transaction<'_>,
    proposal_id: &str,
) -> Result<Option<PlanProposalRecord>> {
    tx.query_row(
        &format!("{PLAN_PROPOSAL_SELECT} WHERE plan_proposal.id = ?"),
        params![proposal_id],
        row_to_plan_proposal,
    )
    .optional()
    .map_err(Into::into)
}

fn get_plan_proposal_operation_tx(
    tx: &rusqlite::Transaction<'_>,
    operation_id: &str,
) -> Result<Option<PlanProposalOperationRecord>> {
    tx.query_row(
        &format!("{PLAN_PROPOSAL_OPERATION_SELECT} WHERE id = ?"),
        params![operation_id],
        row_to_plan_proposal_operation,
    )
    .optional()
    .map_err(Into::into)
}

fn get_plan_operation_by_idempotency_tx(
    tx: &rusqlite::Transaction<'_>,
    idempotency_key: &str,
) -> Result<Option<PlanProposalOperationRecord>> {
    tx.query_row(
        &format!("{PLAN_PROPOSAL_OPERATION_SELECT} WHERE idempotency_key = ?"),
        params![idempotency_key],
        row_to_plan_proposal_operation,
    )
    .optional()
    .map_err(Into::into)
}

fn collect_plan_proposals(
    rows: impl Iterator<Item = rusqlite::Result<PlanProposalRecord>>,
) -> Result<Vec<PlanProposalRecord>> {
    rows.collect::<std::result::Result<Vec<_>, _>>()
        .map_err(Into::into)
}

fn collect_plan_operations(
    rows: impl Iterator<Item = rusqlite::Result<PlanProposalOperationRecord>>,
) -> Result<Vec<PlanProposalOperationRecord>> {
    rows.collect::<std::result::Result<Vec<_>, _>>()
        .map_err(Into::into)
}

fn plan_revision_conflict(proposal_id: &str, expected: i64, actual: i64) -> SystemServiceError {
    SystemServiceError::Conflict(format!(
        "plan proposal revision changed: {proposal_id} expected {expected} actual {actual}"
    ))
}

fn validate_json_array_evidence(value: &Value, label: &str) -> Result<()> {
    if value.as_array().is_none_or(Vec::is_empty) {
        return Err(SystemServiceError::Invariant(format!(
            "{label} must be a non-empty array"
        )));
    }
    if serde_json::to_vec(value)?.len() > MAX_PLAN_EVIDENCE_BYTES {
        return Err(SystemServiceError::Invariant(format!(
            "{label} exceeds {MAX_PLAN_EVIDENCE_BYTES} bytes"
        )));
    }
    Ok(())
}

fn validate_bounded_text(value: &str, label: &str, max_chars: usize) -> Result<()> {
    if value.trim().is_empty() || value.chars().count() > max_chars {
        return Err(SystemServiceError::Invariant(format!(
            "{label} must contain 1..={max_chars} characters"
        )));
    }
    Ok(())
}

fn required_json_string<'a>(
    object: &'a serde_json::Map<String, Value>,
    key: &str,
    label: &str,
) -> Result<&'a str> {
    object
        .get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            SystemServiceError::Invariant(format!("{label} {key} must be a non-empty string"))
        })
}

fn validate_sha256(value: &str, label: &str) -> Result<()> {
    if value.len() != 64
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(SystemServiceError::Invariant(format!(
            "{label} must be a lowercase sha256 digest"
        )));
    }
    Ok(())
}

fn digest_json(value: &Value) -> Result<String> {
    Ok(crate::util::hex_sha256(canonical_json(value).as_bytes()))
}

fn canonical_json(value: &Value) -> String {
    match value {
        Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_) => value.to_string(),
        Value::Array(values) => format!(
            "[{}]",
            values
                .iter()
                .map(canonical_json)
                .collect::<Vec<_>>()
                .join(",")
        ),
        Value::Object(object) => {
            let mut entries = object.iter().collect::<Vec<_>>();
            entries.sort_by_key(|(key, _)| *key);
            format!(
                "{{{}}}",
                entries
                    .into_iter()
                    .map(|(key, value)| format!(
                        "{}:{}",
                        serde_json::to_string(key).expect("JSON object key serialization"),
                        canonical_json(value)
                    ))
                    .collect::<Vec<_>>()
                    .join(",")
            )
        }
    }
}

fn validate_non_empty(value: &str, label: &str) -> Result<()> {
    if value.is_empty() {
        return Err(SystemServiceError::Invariant(format!(
            "{label} must not be empty"
        )));
    }
    Ok(())
}

fn validate_optional_non_empty(value: Option<&str>, label: &str) -> Result<()> {
    if value == Some("") {
        return Err(SystemServiceError::Invariant(format!(
            "{label} must not be empty"
        )));
    }
    Ok(())
}
