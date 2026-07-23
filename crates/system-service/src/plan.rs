use std::collections::HashSet;

use crate::event_store::append_event_tx;
use crate::rows::{row_to_plan_proposal, row_to_plan_proposal_operation};
use crate::{
    EventScope, ListPlanProposalOperations, ListPlanProposals, PlanProposalOperationRecord,
    PlanProposalRecord, PlanProposalReferenceRecord, PutPlanProposal, RecordPlanProposalOperation,
    Result, SystemService, SystemServiceError,
};
use rusqlite::{params, params_from_iter, OptionalExtension, ToSql};
use serde_json::Value;
use uuid::Uuid;

const PLAN_PROPOSAL_SELECT: &str = "SELECT
    plan_proposal.id, plan_proposal.principal_id, plan_proposal.title,
    plan_proposal.summary, plan_proposal.steps_json, plan_proposal.references_json,
    plan_proposal.state, plan_proposal.metadata_json, plan_proposal.created_at,
    plan_proposal.updated_at, plan_proposal.closed_at
 FROM plan_proposal";

const PLAN_PROPOSAL_OPERATION_SELECT: &str = "SELECT
    id, proposal_id, operation, actor_id, from_state, to_state,
    reason, metadata_json, created_at
 FROM plan_proposal_operation";

impl SystemService {
    pub fn put_plan_proposal(&self, request: &PutPlanProposal) -> Result<PlanProposalRecord> {
        validate_put_plan_proposal(request)?;
        let id = request
            .id
            .clone()
            .unwrap_or_else(|| format!("planp_{}", Uuid::now_v7()));
        let references = request.references.clone().unwrap_or_default();
        let steps_json = serde_json::to_string(&request.steps)?;
        let references_json = serde_json::to_string(&references)?;
        let metadata_json = request
            .metadata
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;

        if let Some(idempotency_key) = &request.idempotency_key {
            let existing = tx
                .query_row(
                    &format!("{PLAN_PROPOSAL_SELECT} WHERE idempotency_key = ?"),
                    params![idempotency_key],
                    row_to_plan_proposal,
                )
                .optional()?;
            if let Some(record) = existing {
                validate_existing_plan_proposal(&record, request)?;
                tx.commit()?;
                return Ok(record);
            }
        }

        let existing = get_plan_proposal_tx(&tx, &id)?;
        if let Some(record) = existing {
            validate_existing_plan_proposal(&record, request)?;
            tx.commit()?;
            return Ok(record);
        }

        tx.execute(
            "INSERT INTO plan_proposal (
                id, principal_id, title, summary, steps_json, references_json,
                state, metadata_json, idempotency_key, created_at, updated_at, closed_at
             ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, NULL)",
            params![
                id,
                request.principal_id,
                request.title,
                request.summary,
                steps_json,
                references_json,
                metadata_json,
                request.idempotency_key,
                now,
                now,
            ],
        )?;
        insert_plan_references_tx(&tx, &id, &references, now)?;
        append_event_tx(
            &tx,
            &format!("evt_{}", Uuid::now_v7()),
            "plan.proposal.created",
            &EventScope {
                plan_proposal_id: Some(id.clone()),
                ..EventScope::default()
            },
            &serde_json::json!({
                "proposalId": id,
                "principalId": request.principal_id,
                "state": "open",
                "referenceCount": references.len(),
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
        if proposal_id.is_empty() {
            return Err(SystemServiceError::Invariant(
                "plan proposal id must not be empty".to_string(),
            ));
        }
        let conn = self.connect()?;
        conn.query_row(
            &format!("{PLAN_PROPOSAL_SELECT} WHERE id = ?"),
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
        if request.reference_kind.is_some() != request.reference_id.is_some() {
            return Err(SystemServiceError::Invariant(
                "plan proposal reference_kind and reference_id must be provided together"
                    .to_string(),
            ));
        }
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
        let records = collect_plan_proposals(stmt.query_map(
            params_from_iter(values.iter().map(|value| value.as_ref())),
            row_to_plan_proposal,
        )?)?;
        Ok(records)
    }

    pub fn record_plan_proposal_operation(
        &self,
        request: &RecordPlanProposalOperation,
    ) -> Result<PlanProposalOperationRecord> {
        validate_record_plan_proposal_operation(request)?;
        let id = request
            .id
            .clone()
            .unwrap_or_else(|| format!("planop_{}", Uuid::now_v7()));
        let metadata_json = request
            .metadata
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let proposal = get_plan_proposal_tx(&tx, &request.proposal_id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!(
                "plan proposal does not exist: {}",
                request.proposal_id
            ))
        })?;
        let to_state = plan_next_state(&proposal.state, &request.operation)?;
        let closed_at = if plan_state_is_terminal(to_state) {
            Some(now)
        } else {
            proposal.closed_at
        };

        tx.execute(
            "INSERT INTO plan_proposal_operation (
                id, proposal_id, operation, actor_id, from_state, to_state,
                reason, metadata_json, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                id,
                request.proposal_id,
                request.operation,
                request.actor_id,
                proposal.state,
                to_state,
                request.reason,
                metadata_json,
                now,
            ],
        )?;
        tx.execute(
            "UPDATE plan_proposal
             SET state = ?, updated_at = ?, closed_at = ?
             WHERE id = ?",
            params![to_state, now, closed_at, request.proposal_id],
        )?;
        append_event_tx(
            &tx,
            &format!("evt_{}", Uuid::now_v7()),
            "plan.proposal.operation_recorded",
            &EventScope {
                plan_proposal_id: Some(request.proposal_id.clone()),
                ..EventScope::default()
            },
            &serde_json::json!({
                "proposalId": request.proposal_id,
                "operationId": id,
                "operation": request.operation,
                "actorId": request.actor_id,
                "fromState": proposal.state,
                "toState": to_state,
                "updatedAt": now
            }),
            now,
        )?;
        let record = get_plan_proposal_operation_tx(&tx, &id)?;
        tx.commit()?;
        Ok(record)
    }

    pub fn list_plan_proposal_operations(
        &self,
        request: &ListPlanProposalOperations,
    ) -> Result<Vec<PlanProposalOperationRecord>> {
        if request.proposal_id.is_empty() {
            return Err(SystemServiceError::Invariant(
                "plan proposal operation proposal_id must not be empty".to_string(),
            ));
        }
        let conn = self.connect()?;
        let mut stmt = conn.prepare(&format!(
            "{PLAN_PROPOSAL_OPERATION_SELECT}
             WHERE proposal_id = ?
             ORDER BY created_at ASC, id ASC"
        ))?;
        let records = collect_plan_proposal_operations(
            stmt.query_map(params![request.proposal_id], row_to_plan_proposal_operation)?,
        )?;
        Ok(records)
    }
}

fn insert_plan_references_tx(
    tx: &rusqlite::Transaction<'_>,
    proposal_id: &str,
    references: &[PlanProposalReferenceRecord],
    now: i64,
) -> Result<()> {
    for reference in references {
        let metadata_json = reference
            .metadata
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        tx.execute(
            "INSERT INTO plan_proposal_reference (
                proposal_id, kind, reference_id, role, metadata_json, created_at
             ) VALUES (?, ?, ?, ?, ?, ?)",
            params![
                proposal_id,
                reference.kind,
                reference.reference_id,
                reference.role.clone().unwrap_or_default(),
                metadata_json,
                now,
            ],
        )?;
    }
    Ok(())
}

fn validate_put_plan_proposal(request: &PutPlanProposal) -> Result<()> {
    if request.principal_id.is_empty() {
        return Err(SystemServiceError::Invariant(
            "plan proposal principal_id must not be empty".to_string(),
        ));
    }
    if request.id.as_deref() == Some("") {
        return Err(SystemServiceError::Invariant(
            "plan proposal id must not be empty".to_string(),
        ));
    }
    if request.idempotency_key.as_deref() == Some("") {
        return Err(SystemServiceError::Invariant(
            "plan proposal idempotency_key must not be empty".to_string(),
        ));
    }
    let steps = request.steps.as_array().ok_or_else(|| {
        SystemServiceError::Invariant("plan proposal steps must be an array".to_string())
    })?;
    if steps.is_empty() {
        return Err(SystemServiceError::Invariant(
            "plan proposal must include at least one step".to_string(),
        ));
    }
    for (index, step) in steps.iter().enumerate() {
        validate_plan_step(step, index)?;
    }
    let mut reference_keys = HashSet::new();
    for reference in request.references.as_deref().unwrap_or_default() {
        validate_plan_reference(reference)?;
        let role_key = reference.role.clone().unwrap_or_default();
        if !reference_keys.insert((
            reference.kind.clone(),
            reference.reference_id.clone(),
            role_key,
        )) {
            return Err(SystemServiceError::Invariant(
                "plan proposal references must not contain duplicates".to_string(),
            ));
        }
    }
    Ok(())
}

fn validate_plan_step(step: &Value, index: usize) -> Result<()> {
    let object = step.as_object().ok_or_else(|| {
        SystemServiceError::Invariant(format!("plan proposal step {index} must be an object"))
    })?;
    let Some(title) = object.get("title").and_then(Value::as_str) else {
        return Err(SystemServiceError::Invariant(format!(
            "plan proposal step {index} title must be a string"
        )));
    };
    if title.is_empty() {
        return Err(SystemServiceError::Invariant(format!(
            "plan proposal step {index} title must not be empty"
        )));
    }
    if let Some(status) = object.get("status").and_then(Value::as_str) {
        if !matches!(status, "pending" | "in_progress" | "completed" | "blocked") {
            return Err(SystemServiceError::Invariant(format!(
                "invalid plan proposal step status: {status}"
            )));
        }
    }
    Ok(())
}

fn validate_plan_reference(reference: &PlanProposalReferenceRecord) -> Result<()> {
    if reference.kind.is_empty() {
        return Err(SystemServiceError::Invariant(
            "plan proposal reference kind must not be empty".to_string(),
        ));
    }
    if reference.reference_id.is_empty() {
        return Err(SystemServiceError::Invariant(
            "plan proposal reference id must not be empty".to_string(),
        ));
    }
    if reference.role.as_deref() == Some("") {
        return Err(SystemServiceError::Invariant(
            "plan proposal reference role must not be empty".to_string(),
        ));
    }
    Ok(())
}

fn validate_record_plan_proposal_operation(request: &RecordPlanProposalOperation) -> Result<()> {
    if request.proposal_id.is_empty() {
        return Err(SystemServiceError::Invariant(
            "plan proposal operation proposal_id must not be empty".to_string(),
        ));
    }
    if request.actor_id.is_empty() {
        return Err(SystemServiceError::Invariant(
            "plan proposal operation actor_id must not be empty".to_string(),
        ));
    }
    if request.id.as_deref() == Some("") {
        return Err(SystemServiceError::Invariant(
            "plan proposal operation id must not be empty".to_string(),
        ));
    }
    if !matches!(
        request.operation.as_str(),
        "approve"
            | "reject"
            | "withdraw"
            | "request_execution"
            | "mark_executed"
            | "mark_execution_failed"
    ) {
        return Err(SystemServiceError::Invariant(format!(
            "invalid plan proposal operation: {}",
            request.operation
        )));
    }
    Ok(())
}

fn validate_optional_plan_state(state: Option<&str>) -> Result<()> {
    if let Some(state) = state {
        if !plan_state_is_known(state) {
            return Err(SystemServiceError::Invariant(format!(
                "invalid plan proposal state: {state}"
            )));
        }
    }
    Ok(())
}

fn validate_existing_plan_proposal(
    record: &PlanProposalRecord,
    request: &PutPlanProposal,
) -> Result<()> {
    let references = request.references.clone().unwrap_or_default();
    let metadata_matches = match (&record.metadata, &request.metadata) {
        (None, None) => true,
        (Some(left), Some(right)) => left == right,
        _ => false,
    };
    if record.principal_id != request.principal_id
        || record.title != request.title
        || record.summary != request.summary
        || record.steps != request.steps
        || record.references != references
        || !metadata_matches
    {
        return Err(SystemServiceError::Invariant(format!(
            "plan proposal id already exists with different content: {}",
            record.id
        )));
    }
    Ok(())
}

fn plan_next_state(from_state: &str, operation: &str) -> Result<&'static str> {
    match (from_state, operation) {
        ("open", "approve") => Ok("approved"),
        ("open", "reject") => Ok("rejected"),
        ("open", "withdraw") => Ok("withdrawn"),
        ("approved", "request_execution") => Ok("execution_requested"),
        ("execution_requested", "mark_executed") => Ok("executed"),
        ("execution_requested", "mark_execution_failed") => Ok("execution_failed"),
        _ => Err(SystemServiceError::Invariant(format!(
            "invalid plan proposal transition: {from_state}/{operation}"
        ))),
    }
}

fn plan_state_is_known(state: &str) -> bool {
    matches!(
        state,
        "open"
            | "approved"
            | "rejected"
            | "withdrawn"
            | "execution_requested"
            | "executed"
            | "execution_failed"
    )
}

fn plan_state_is_terminal(state: &str) -> bool {
    matches!(
        state,
        "rejected" | "withdrawn" | "executed" | "execution_failed"
    )
}

fn get_plan_proposal_tx(
    tx: &rusqlite::Transaction<'_>,
    proposal_id: &str,
) -> Result<Option<PlanProposalRecord>> {
    tx.query_row(
        &format!("{PLAN_PROPOSAL_SELECT} WHERE id = ?"),
        params![proposal_id],
        row_to_plan_proposal,
    )
    .optional()
    .map_err(Into::into)
}

fn get_plan_proposal_operation_tx(
    tx: &rusqlite::Transaction<'_>,
    operation_id: &str,
) -> Result<PlanProposalOperationRecord> {
    tx.query_row(
        &format!("{PLAN_PROPOSAL_OPERATION_SELECT} WHERE id = ?"),
        params![operation_id],
        row_to_plan_proposal_operation,
    )
    .map_err(Into::into)
}

fn collect_plan_proposals(
    rows: impl Iterator<Item = rusqlite::Result<PlanProposalRecord>>,
) -> Result<Vec<PlanProposalRecord>> {
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}

fn collect_plan_proposal_operations(
    rows: impl Iterator<Item = rusqlite::Result<PlanProposalOperationRecord>>,
) -> Result<Vec<PlanProposalOperationRecord>> {
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}
