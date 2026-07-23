use std::collections::HashSet;

use crate::event_store::append_event_tx;
use crate::rows::{
    row_to_objective_attempt, row_to_objective_run, row_to_objective_run_operation,
    row_to_objective_verification,
};
use crate::{
    EventScope, ListObjectiveAttempts, ListObjectiveRunOperations, ListObjectiveRuns,
    ListObjectiveVerifications, ObjectiveAttemptRecord, ObjectiveReferenceRecord,
    ObjectiveRunOperationRecord, ObjectiveRunRecord, ObjectiveVerificationRecord,
    PutObjectiveAttempt, PutObjectiveRun, PutObjectiveVerification, RecordObjectiveRunOperation,
    Result, SystemService, SystemServiceError,
};
use rusqlite::{params, params_from_iter, OptionalExtension, ToSql};
use serde_json::Value;
use uuid::Uuid;

const OBJECTIVE_RUN_SELECT: &str = "SELECT
    objective_run.id, objective_run.principal_id, objective_run.objective, objective_run.scope,
    objective_run.constraints_json, objective_run.success_criteria_json,
    objective_run.stop_policy_json, objective_run.references_json, objective_run.state,
    objective_run.metadata_json, objective_run.created_at, objective_run.updated_at,
    objective_run.closed_at
 FROM objective_run";

const OBJECTIVE_RUN_OPERATION_SELECT: &str = "SELECT
    id, objective_id, operation, actor_id, from_state, to_state,
    reason, metadata_json, created_at
 FROM objective_run_operation";

const OBJECTIVE_ATTEMPT_SELECT: &str = "SELECT
    id, objective_id, attempt_number, state, session_id, session_input_id,
    session_turn_id, scheduler_job_id, delegation_graph_id, plan_proposal_id,
    workspace_change_proposal_id, summary, result_json, error_json,
    metadata_json, started_at, finished_at, created_at, updated_at
 FROM objective_attempt";

const OBJECTIVE_VERIFICATION_SELECT: &str = "SELECT
    id, objective_id, attempt_id, kind, state, reason, evidence_json,
    verifier_ref, metadata_json, created_at
 FROM objective_verification";

impl SystemService {
    pub fn put_objective_run(&self, request: &PutObjectiveRun) -> Result<ObjectiveRunRecord> {
        validate_put_objective_run(request)?;
        let id = request
            .id
            .clone()
            .unwrap_or_else(|| format!("objective_{}", Uuid::now_v7()));
        let constraints = request.constraints.clone().unwrap_or_default();
        let success_criteria = request.success_criteria.clone().unwrap_or_default();
        let references = request.references.clone().unwrap_or_default();
        let constraints_json = serde_json::to_string(&constraints)?;
        let success_criteria_json = serde_json::to_string(&success_criteria)?;
        let stop_policy_json = request
            .stop_policy
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
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
                    &format!("{OBJECTIVE_RUN_SELECT} WHERE idempotency_key = ?"),
                    params![idempotency_key],
                    row_to_objective_run,
                )
                .optional()?;
            if let Some(record) = existing {
                validate_existing_objective_run(&record, request)?;
                tx.commit()?;
                return Ok(record);
            }
        }

        let existing = get_objective_run_tx(&tx, &id)?;
        if let Some(record) = existing {
            validate_existing_objective_run(&record, request)?;
            tx.commit()?;
            return Ok(record);
        }

        tx.execute(
            "INSERT INTO objective_run (
                id, principal_id, objective, scope, constraints_json,
                success_criteria_json, stop_policy_json, references_json,
                state, metadata_json, idempotency_key, created_at, updated_at, closed_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, NULL)",
            params![
                id,
                request.principal_id,
                request.objective,
                request.scope,
                constraints_json,
                success_criteria_json,
                stop_policy_json,
                references_json,
                metadata_json,
                request.idempotency_key,
                now,
                now,
            ],
        )?;
        insert_objective_references_tx(&tx, &id, &references, now)?;
        append_event_tx(
            &tx,
            &format!("evt_{}", Uuid::now_v7()),
            "objective.run.created",
            &EventScope {
                objective_id: Some(id.clone()),
                ..EventScope::default()
            },
            &serde_json::json!({
                "objectiveId": id,
                "principalId": request.principal_id,
                "state": "open",
                "referenceCount": references.len(),
                "updatedAt": now
            }),
            now,
        )?;
        let record = get_objective_run_tx(&tx, &id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!("objective run insert missing: {id}"))
        })?;
        tx.commit()?;
        Ok(record)
    }

    pub fn get_objective_run(&self, objective_id: &str) -> Result<Option<ObjectiveRunRecord>> {
        if objective_id.is_empty() {
            return Err(SystemServiceError::Invariant(
                "objective run id must not be empty".to_string(),
            ));
        }
        let conn = self.connect()?;
        conn.query_row(
            &format!("{OBJECTIVE_RUN_SELECT} WHERE id = ?"),
            params![objective_id],
            row_to_objective_run,
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn list_objective_runs(
        &self,
        request: &ListObjectiveRuns,
    ) -> Result<Vec<ObjectiveRunRecord>> {
        validate_optional_objective_state(request.state.as_deref())?;
        if request.reference_kind.is_some() != request.reference_id.is_some() {
            return Err(SystemServiceError::Invariant(
                "objective reference_kind and reference_id must be provided together".to_string(),
            ));
        }

        let mut sql = if request.reference_kind.is_some() {
            format!(
                "{OBJECTIVE_RUN_SELECT}
                 JOIN objective_reference gr ON gr.objective_id = objective_run.id
                 WHERE 1 = 1"
            )
        } else {
            format!("{OBJECTIVE_RUN_SELECT} WHERE 1 = 1")
        };
        let mut values: Vec<Box<dyn ToSql>> = Vec::new();
        if let Some(principal_id) = &request.principal_id {
            sql.push_str(" AND objective_run.principal_id = ?");
            values.push(Box::new(principal_id.clone()));
        }
        if let Some(state) = &request.state {
            sql.push_str(" AND objective_run.state = ?");
            values.push(Box::new(state.clone()));
        }
        if let (Some(reference_kind), Some(reference_id)) =
            (&request.reference_kind, &request.reference_id)
        {
            sql.push_str(" AND gr.kind = ? AND gr.reference_id = ?");
            values.push(Box::new(reference_kind.clone()));
            values.push(Box::new(reference_id.clone()));
        }
        sql.push_str(" ORDER BY objective_run.updated_at DESC, objective_run.id ASC LIMIT ?");
        values.push(Box::new(request.limit.unwrap_or(100).clamp(1, 1000)));

        let conn = self.connect()?;
        let mut stmt = conn.prepare(&sql)?;
        let records = collect_objective_runs(stmt.query_map(
            params_from_iter(values.iter().map(|value| value.as_ref())),
            row_to_objective_run,
        )?)?;
        Ok(records)
    }

    pub fn record_objective_run_operation(
        &self,
        request: &RecordObjectiveRunOperation,
    ) -> Result<ObjectiveRunOperationRecord> {
        validate_record_objective_run_operation(request)?;
        let id = request
            .id
            .clone()
            .unwrap_or_else(|| format!("objectiveop_{}", Uuid::now_v7()));
        let metadata_json = request
            .metadata
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let objective = get_objective_run_tx(&tx, &request.objective_id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!(
                "objective run does not exist: {}",
                request.objective_id
            ))
        })?;
        let to_state = objective_next_state(&objective.state, &request.operation)?;
        let closed_at = if objective_state_is_terminal(to_state) {
            Some(now)
        } else {
            objective.closed_at
        };

        tx.execute(
            "INSERT INTO objective_run_operation (
                id, objective_id, operation, actor_id, from_state, to_state,
                reason, metadata_json, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                id,
                request.objective_id,
                request.operation,
                request.actor_id,
                objective.state,
                to_state,
                request.reason,
                metadata_json,
                now,
            ],
        )?;
        tx.execute(
            "UPDATE objective_run
             SET state = ?, updated_at = ?, closed_at = ?
             WHERE id = ?",
            params![to_state, now, closed_at, request.objective_id],
        )?;
        append_event_tx(
            &tx,
            &format!("evt_{}", Uuid::now_v7()),
            "objective.run.operation_recorded",
            &EventScope {
                objective_id: Some(request.objective_id.clone()),
                ..EventScope::default()
            },
            &serde_json::json!({
                "objectiveId": request.objective_id,
                "operationId": id,
                "operation": request.operation,
                "actorId": request.actor_id,
                "fromState": objective.state,
                "toState": to_state,
                "updatedAt": now
            }),
            now,
        )?;
        let record = get_objective_run_operation_tx(&tx, &id)?;
        tx.commit()?;
        Ok(record)
    }

    pub fn list_objective_run_operations(
        &self,
        request: &ListObjectiveRunOperations,
    ) -> Result<Vec<ObjectiveRunOperationRecord>> {
        if request.objective_id.is_empty() {
            return Err(SystemServiceError::Invariant(
                "objective run operation objective_id must not be empty".to_string(),
            ));
        }
        let conn = self.connect()?;
        let mut stmt = conn.prepare(&format!(
            "{OBJECTIVE_RUN_OPERATION_SELECT}
             WHERE objective_id = ?
             ORDER BY created_at ASC, id ASC"
        ))?;
        let records = collect_objective_run_operations(stmt.query_map(
            params![request.objective_id],
            row_to_objective_run_operation,
        )?)?;
        Ok(records)
    }

    pub fn put_objective_attempt(
        &self,
        request: &PutObjectiveAttempt,
    ) -> Result<ObjectiveAttemptRecord> {
        validate_put_objective_attempt(request)?;
        let id = request
            .id
            .clone()
            .unwrap_or_else(|| format!("objectiveatt_{}", Uuid::now_v7()));
        let state = request
            .state
            .clone()
            .unwrap_or_else(|| "planned".to_string());
        let result_json = request
            .result
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let error_json = request
            .error
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let metadata_json = request
            .metadata
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;

        let _objective = get_objective_run_tx(&tx, &request.objective_id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!(
                "objective run does not exist: {}",
                request.objective_id
            ))
        })?;

        if let Some(idempotency_key) = &request.idempotency_key {
            let existing = tx
                .query_row(
                    &format!("{OBJECTIVE_ATTEMPT_SELECT} WHERE idempotency_key = ?"),
                    params![idempotency_key],
                    row_to_objective_attempt,
                )
                .optional()?;
            if let Some(record) = existing {
                validate_existing_objective_attempt(&record, request)?;
                tx.commit()?;
                return Ok(record);
            }
        }

        let existing = get_objective_attempt_tx(&tx, &id)?;
        if let Some(record) = existing {
            validate_existing_objective_attempt(&record, request)?;
            tx.commit()?;
            return Ok(record);
        }

        let attempt_number = match request.attempt_number {
            Some(value) => value,
            None => next_attempt_number_tx(&tx, &request.objective_id)?,
        };

        tx.execute(
            "INSERT INTO objective_attempt (
                id, objective_id, attempt_number, state, session_id, session_input_id,
                session_turn_id, scheduler_job_id, delegation_graph_id, plan_proposal_id,
                workspace_change_proposal_id, summary, result_json, error_json,
                metadata_json, idempotency_key, started_at, finished_at, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                id,
                request.objective_id,
                attempt_number,
                state,
                request.session_id,
                request.session_input_id,
                request.session_turn_id,
                request.scheduler_job_id,
                request.delegation_graph_id,
                request.plan_proposal_id,
                request.workspace_change_proposal_id,
                request.summary,
                result_json,
                error_json,
                metadata_json,
                request.idempotency_key,
                request.started_at,
                request.finished_at,
                now,
                now,
            ],
        )?;
        append_event_tx(
            &tx,
            &format!("evt_{}", Uuid::now_v7()),
            "objective.attempt.recorded",
            &EventScope {
                session_id: request.session_id.clone(),
                turn_id: request.session_turn_id.clone(),
                input_id: request.session_input_id.clone(),
                plan_proposal_id: request.plan_proposal_id.clone(),
                objective_id: Some(request.objective_id.clone()),
                ..EventScope::default()
            },
            &serde_json::json!({
                "objectiveId": request.objective_id,
                "attemptId": id,
                "attemptNumber": attempt_number,
                "state": state,
                "updatedAt": now
            }),
            now,
        )?;
        let record = get_objective_attempt_tx(&tx, &id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!("objective attempt insert missing: {id}"))
        })?;
        tx.commit()?;
        Ok(record)
    }

    pub fn list_objective_attempts(
        &self,
        request: &ListObjectiveAttempts,
    ) -> Result<Vec<ObjectiveAttemptRecord>> {
        validate_list_objective_attempts(request)?;
        let mut sql = format!("{OBJECTIVE_ATTEMPT_SELECT} WHERE objective_id = ?");
        let mut values: Vec<Box<dyn ToSql>> = vec![Box::new(request.objective_id.clone())];
        if let Some(state) = &request.state {
            sql.push_str(" AND state = ?");
            values.push(Box::new(state.clone()));
        }
        sql.push_str(" ORDER BY attempt_number ASC, id ASC LIMIT ?");
        values.push(Box::new(request.limit.unwrap_or(100).clamp(1, 1000)));

        let conn = self.connect()?;
        let mut stmt = conn.prepare(&sql)?;
        let records = collect_objective_attempts(stmt.query_map(
            params_from_iter(values.iter().map(|value| value.as_ref())),
            row_to_objective_attempt,
        )?)?;
        Ok(records)
    }

    pub fn put_objective_verification(
        &self,
        request: &PutObjectiveVerification,
    ) -> Result<ObjectiveVerificationRecord> {
        validate_put_objective_verification(request)?;
        let id = request
            .id
            .clone()
            .unwrap_or_else(|| format!("objectivever_{}", Uuid::now_v7()));
        let evidence_json = request
            .evidence
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let metadata_json = request
            .metadata
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;

        let _objective = get_objective_run_tx(&tx, &request.objective_id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!(
                "objective run does not exist: {}",
                request.objective_id
            ))
        })?;
        if let Some(attempt_id) = &request.attempt_id {
            let attempt = get_objective_attempt_tx(&tx, attempt_id)?.ok_or_else(|| {
                SystemServiceError::Invariant(format!(
                    "objective attempt does not exist: {attempt_id}"
                ))
            })?;
            if attempt.objective_id != request.objective_id {
                return Err(SystemServiceError::Invariant(format!(
                    "objective verification attempt belongs to different objective: {attempt_id}"
                )));
            }
        }

        if let Some(idempotency_key) = &request.idempotency_key {
            let existing = tx
                .query_row(
                    &format!("{OBJECTIVE_VERIFICATION_SELECT} WHERE idempotency_key = ?"),
                    params![idempotency_key],
                    row_to_objective_verification,
                )
                .optional()?;
            if let Some(record) = existing {
                validate_existing_objective_verification(&record, request)?;
                tx.commit()?;
                return Ok(record);
            }
        }

        let existing = get_objective_verification_tx(&tx, &id)?;
        if let Some(record) = existing {
            validate_existing_objective_verification(&record, request)?;
            tx.commit()?;
            return Ok(record);
        }

        tx.execute(
            "INSERT INTO objective_verification (
                id, objective_id, attempt_id, kind, state, reason, evidence_json,
                verifier_ref, metadata_json, idempotency_key, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                id,
                request.objective_id,
                request.attempt_id,
                request.kind,
                request.state,
                request.reason,
                evidence_json,
                request.verifier_ref,
                metadata_json,
                request.idempotency_key,
                now,
            ],
        )?;
        append_event_tx(
            &tx,
            &format!("evt_{}", Uuid::now_v7()),
            "objective.verification.recorded",
            &EventScope {
                objective_id: Some(request.objective_id.clone()),
                ..EventScope::default()
            },
            &serde_json::json!({
                "objectiveId": request.objective_id,
                "verificationId": id,
                "attemptId": request.attempt_id,
                "kind": request.kind,
                "state": request.state,
                "updatedAt": now
            }),
            now,
        )?;
        let record = get_objective_verification_tx(&tx, &id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!("objective verification insert missing: {id}"))
        })?;
        tx.commit()?;
        Ok(record)
    }

    pub fn list_objective_verifications(
        &self,
        request: &ListObjectiveVerifications,
    ) -> Result<Vec<ObjectiveVerificationRecord>> {
        validate_list_objective_verifications(request)?;
        let mut sql = format!("{OBJECTIVE_VERIFICATION_SELECT} WHERE objective_id = ?");
        let mut values: Vec<Box<dyn ToSql>> = vec![Box::new(request.objective_id.clone())];
        if let Some(attempt_id) = &request.attempt_id {
            sql.push_str(" AND attempt_id = ?");
            values.push(Box::new(attempt_id.clone()));
        }
        if let Some(state) = &request.state {
            sql.push_str(" AND state = ?");
            values.push(Box::new(state.clone()));
        }
        sql.push_str(" ORDER BY created_at ASC, id ASC LIMIT ?");
        values.push(Box::new(request.limit.unwrap_or(100).clamp(1, 1000)));

        let conn = self.connect()?;
        let mut stmt = conn.prepare(&sql)?;
        let records = collect_objective_verifications(stmt.query_map(
            params_from_iter(values.iter().map(|value| value.as_ref())),
            row_to_objective_verification,
        )?)?;
        Ok(records)
    }
}

fn insert_objective_references_tx(
    tx: &rusqlite::Transaction<'_>,
    objective_id: &str,
    references: &[ObjectiveReferenceRecord],
    now: i64,
) -> Result<()> {
    for reference in references {
        let metadata_json = reference
            .metadata
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        tx.execute(
            "INSERT INTO objective_reference (
                objective_id, kind, reference_id, role, metadata_json, created_at
             ) VALUES (?, ?, ?, ?, ?, ?)",
            params![
                objective_id,
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

fn validate_put_objective_run(request: &PutObjectiveRun) -> Result<()> {
    if request.principal_id.is_empty() {
        return Err(SystemServiceError::Invariant(
            "objective run principal_id must not be empty".to_string(),
        ));
    }
    if request.objective.is_empty() {
        return Err(SystemServiceError::Invariant(
            "objective run objective must not be empty".to_string(),
        ));
    }
    if request.id.as_deref() == Some("") {
        return Err(SystemServiceError::Invariant(
            "objective run id must not be empty".to_string(),
        ));
    }
    if request.scope.as_deref() == Some("") {
        return Err(SystemServiceError::Invariant(
            "objective run scope must not be empty".to_string(),
        ));
    }
    if request.idempotency_key.as_deref() == Some("") {
        return Err(SystemServiceError::Invariant(
            "objective run idempotency_key must not be empty".to_string(),
        ));
    }
    validate_string_list(
        request.constraints.as_deref().unwrap_or_default(),
        "constraint",
    )?;
    validate_string_list(
        request.success_criteria.as_deref().unwrap_or_default(),
        "success criterion",
    )?;
    validate_stop_policy(request.stop_policy.as_ref())?;

    let mut reference_keys = HashSet::new();
    for reference in request.references.as_deref().unwrap_or_default() {
        validate_objective_reference(reference)?;
        let role_key = reference.role.clone().unwrap_or_default();
        if !reference_keys.insert((
            reference.kind.clone(),
            reference.reference_id.clone(),
            role_key,
        )) {
            return Err(SystemServiceError::Invariant(
                "objective references must not contain duplicates".to_string(),
            ));
        }
    }
    Ok(())
}

fn validate_string_list(values: &[String], label: &str) -> Result<()> {
    for value in values {
        if value.is_empty() {
            return Err(SystemServiceError::Invariant(format!(
                "objective run {label} must not be empty"
            )));
        }
    }
    Ok(())
}

fn validate_stop_policy(stop_policy: Option<&Value>) -> Result<()> {
    let Some(stop_policy) = stop_policy else {
        return Ok(());
    };
    let object = stop_policy.as_object().ok_or_else(|| {
        SystemServiceError::Invariant("objective run stop_policy must be an object".to_string())
    })?;
    for key in [
        "maxAttempts",
        "maxElapsedMs",
        "maxTokens",
        "repeatedBlockThreshold",
    ] {
        if let Some(value) = object.get(key) {
            let Some(number) = value.as_i64() else {
                return Err(SystemServiceError::Invariant(format!(
                    "objective run stop_policy {key} must be an integer"
                )));
            };
            if number <= 0 {
                return Err(SystemServiceError::Invariant(format!(
                    "objective run stop_policy {key} must be positive"
                )));
            }
        }
    }
    if let Some(value) = object.get("requireVerification") {
        if !value.is_boolean() {
            return Err(SystemServiceError::Invariant(
                "objective run stop_policy requireVerification must be a boolean".to_string(),
            ));
        }
    }
    Ok(())
}

fn validate_objective_reference(reference: &ObjectiveReferenceRecord) -> Result<()> {
    if reference.kind.is_empty() {
        return Err(SystemServiceError::Invariant(
            "objective reference kind must not be empty".to_string(),
        ));
    }
    if reference.reference_id.is_empty() {
        return Err(SystemServiceError::Invariant(
            "objective reference id must not be empty".to_string(),
        ));
    }
    if reference.role.as_deref() == Some("") {
        return Err(SystemServiceError::Invariant(
            "objective reference role must not be empty".to_string(),
        ));
    }
    Ok(())
}

fn validate_record_objective_run_operation(request: &RecordObjectiveRunOperation) -> Result<()> {
    if request.objective_id.is_empty() {
        return Err(SystemServiceError::Invariant(
            "objective run operation objective_id must not be empty".to_string(),
        ));
    }
    if request.actor_id.is_empty() {
        return Err(SystemServiceError::Invariant(
            "objective run operation actor_id must not be empty".to_string(),
        ));
    }
    if request.id.as_deref() == Some("") {
        return Err(SystemServiceError::Invariant(
            "objective run operation id must not be empty".to_string(),
        ));
    }
    if !matches!(
        request.operation.as_str(),
        "start" | "record_blocked" | "mark_succeeded" | "mark_failed" | "cancel"
    ) {
        return Err(SystemServiceError::Invariant(format!(
            "invalid objective run operation: {}",
            request.operation
        )));
    }
    Ok(())
}

fn validate_optional_objective_state(state: Option<&str>) -> Result<()> {
    if let Some(state) = state {
        if !objective_state_is_known(state) {
            return Err(SystemServiceError::Invariant(format!(
                "invalid objective run state: {state}"
            )));
        }
    }
    Ok(())
}

fn validate_put_objective_attempt(request: &PutObjectiveAttempt) -> Result<()> {
    if request.objective_id.is_empty() {
        return Err(SystemServiceError::Invariant(
            "objective attempt objective_id must not be empty".to_string(),
        ));
    }
    if request.id.as_deref() == Some("") {
        return Err(SystemServiceError::Invariant(
            "objective attempt id must not be empty".to_string(),
        ));
    }
    if request.idempotency_key.as_deref() == Some("") {
        return Err(SystemServiceError::Invariant(
            "objective attempt idempotency_key must not be empty".to_string(),
        ));
    }
    if let Some(attempt_number) = request.attempt_number {
        if attempt_number <= 0 {
            return Err(SystemServiceError::Invariant(
                "objective attempt attempt_number must be positive".to_string(),
            ));
        }
    }
    validate_optional_objective_attempt_state(request.state.as_deref())?;
    validate_optional_nonempty(
        "objective attempt session_id",
        request.session_id.as_deref(),
    )?;
    validate_optional_nonempty(
        "objective attempt session_input_id",
        request.session_input_id.as_deref(),
    )?;
    validate_optional_nonempty(
        "objective attempt session_turn_id",
        request.session_turn_id.as_deref(),
    )?;
    validate_optional_nonempty(
        "objective attempt scheduler_job_id",
        request.scheduler_job_id.as_deref(),
    )?;
    validate_optional_nonempty(
        "objective attempt delegation_graph_id",
        request.delegation_graph_id.as_deref(),
    )?;
    validate_optional_nonempty(
        "objective attempt plan_proposal_id",
        request.plan_proposal_id.as_deref(),
    )?;
    validate_optional_nonempty(
        "objective attempt workspace_change_proposal_id",
        request.workspace_change_proposal_id.as_deref(),
    )?;
    validate_optional_nonempty("objective attempt summary", request.summary.as_deref())?;
    Ok(())
}

fn validate_list_objective_attempts(request: &ListObjectiveAttempts) -> Result<()> {
    if request.objective_id.is_empty() {
        return Err(SystemServiceError::Invariant(
            "objective attempt list objective_id must not be empty".to_string(),
        ));
    }
    validate_optional_objective_attempt_state(request.state.as_deref())
}

fn validate_put_objective_verification(request: &PutObjectiveVerification) -> Result<()> {
    if request.objective_id.is_empty() {
        return Err(SystemServiceError::Invariant(
            "objective verification objective_id must not be empty".to_string(),
        ));
    }
    if request.id.as_deref() == Some("") {
        return Err(SystemServiceError::Invariant(
            "objective verification id must not be empty".to_string(),
        ));
    }
    if request.idempotency_key.as_deref() == Some("") {
        return Err(SystemServiceError::Invariant(
            "objective verification idempotency_key must not be empty".to_string(),
        ));
    }
    validate_optional_nonempty(
        "objective verification attempt_id",
        request.attempt_id.as_deref(),
    )?;
    validate_optional_nonempty("objective verification reason", request.reason.as_deref())?;
    validate_optional_nonempty(
        "objective verification verifier_ref",
        request.verifier_ref.as_deref(),
    )?;
    if !matches!(
        request.kind.as_str(),
        "script" | "model" | "human" | "runtime"
    ) {
        return Err(SystemServiceError::Invariant(format!(
            "invalid objective verification kind: {}",
            request.kind
        )));
    }
    validate_objective_verification_state(&request.state)
}

fn validate_list_objective_verifications(request: &ListObjectiveVerifications) -> Result<()> {
    if request.objective_id.is_empty() {
        return Err(SystemServiceError::Invariant(
            "objective verification list objective_id must not be empty".to_string(),
        ));
    }
    validate_optional_nonempty(
        "objective verification attempt_id",
        request.attempt_id.as_deref(),
    )?;
    if let Some(state) = &request.state {
        validate_objective_verification_state(state)?;
    }
    Ok(())
}

fn validate_optional_nonempty(label: &str, value: Option<&str>) -> Result<()> {
    if value == Some("") {
        return Err(SystemServiceError::Invariant(format!(
            "{label} must not be empty"
        )));
    }
    Ok(())
}

fn validate_optional_objective_attempt_state(state: Option<&str>) -> Result<()> {
    if let Some(state) = state {
        if !matches!(
            state,
            "planned" | "running" | "succeeded" | "failed" | "blocked" | "cancelled"
        ) {
            return Err(SystemServiceError::Invariant(format!(
                "invalid objective attempt state: {state}"
            )));
        }
    }
    Ok(())
}

fn validate_objective_verification_state(state: &str) -> Result<()> {
    if !matches!(state, "passed" | "failed" | "inconclusive" | "blocked") {
        return Err(SystemServiceError::Invariant(format!(
            "invalid objective verification state: {state}"
        )));
    }
    Ok(())
}

fn validate_existing_objective_run(
    record: &ObjectiveRunRecord,
    request: &PutObjectiveRun,
) -> Result<()> {
    let constraints = request.constraints.clone().unwrap_or_default();
    let success_criteria = request.success_criteria.clone().unwrap_or_default();
    let references = request.references.clone().unwrap_or_default();
    if record.principal_id != request.principal_id
        || record.objective != request.objective
        || record.scope != request.scope
        || record.constraints != constraints
        || record.success_criteria != success_criteria
        || record.stop_policy != request.stop_policy
        || record.references != references
        || record.metadata != request.metadata
    {
        return Err(SystemServiceError::Invariant(format!(
            "objective run id already exists with different content: {}",
            record.id
        )));
    }
    Ok(())
}

fn validate_existing_objective_attempt(
    record: &ObjectiveAttemptRecord,
    request: &PutObjectiveAttempt,
) -> Result<()> {
    let state = request
        .state
        .clone()
        .unwrap_or_else(|| "planned".to_string());
    let attempt_number_matches = request
        .attempt_number
        .map(|attempt_number| attempt_number == record.attempt_number)
        .unwrap_or(true);
    if record.objective_id != request.objective_id
        || !attempt_number_matches
        || record.state != state
        || record.session_id != request.session_id
        || record.session_input_id != request.session_input_id
        || record.session_turn_id != request.session_turn_id
        || record.scheduler_job_id != request.scheduler_job_id
        || record.delegation_graph_id != request.delegation_graph_id
        || record.plan_proposal_id != request.plan_proposal_id
        || record.workspace_change_proposal_id != request.workspace_change_proposal_id
        || record.summary != request.summary
        || record.result != request.result
        || record.error != request.error
        || record.metadata != request.metadata
        || record.started_at != request.started_at
        || record.finished_at != request.finished_at
    {
        return Err(SystemServiceError::Invariant(format!(
            "objective attempt id already exists with different content: {}",
            record.id
        )));
    }
    Ok(())
}

fn validate_existing_objective_verification(
    record: &ObjectiveVerificationRecord,
    request: &PutObjectiveVerification,
) -> Result<()> {
    if record.objective_id != request.objective_id
        || record.attempt_id != request.attempt_id
        || record.kind != request.kind
        || record.state != request.state
        || record.reason != request.reason
        || record.evidence != request.evidence
        || record.verifier_ref != request.verifier_ref
        || record.metadata != request.metadata
    {
        return Err(SystemServiceError::Invariant(format!(
            "objective verification id already exists with different content: {}",
            record.id
        )));
    }
    Ok(())
}

fn objective_next_state(from_state: &str, operation: &str) -> Result<&'static str> {
    match (from_state, operation) {
        ("open", "start") => Ok("running"),
        ("open", "cancel") => Ok("cancelled"),
        ("running", "record_blocked") => Ok("blocked"),
        ("running", "mark_succeeded") => Ok("succeeded"),
        ("running", "mark_failed") => Ok("failed"),
        ("running", "cancel") => Ok("cancelled"),
        ("blocked", "start") => Ok("running"),
        ("blocked", "mark_failed") => Ok("failed"),
        ("blocked", "cancel") => Ok("cancelled"),
        _ => Err(SystemServiceError::Invariant(format!(
            "invalid objective run transition: {from_state}/{operation}"
        ))),
    }
}

fn objective_state_is_known(state: &str) -> bool {
    matches!(
        state,
        "open" | "running" | "blocked" | "succeeded" | "failed" | "cancelled"
    )
}

fn objective_state_is_terminal(state: &str) -> bool {
    matches!(state, "succeeded" | "failed" | "cancelled")
}

fn get_objective_run_tx(
    tx: &rusqlite::Transaction<'_>,
    objective_id: &str,
) -> Result<Option<ObjectiveRunRecord>> {
    tx.query_row(
        &format!("{OBJECTIVE_RUN_SELECT} WHERE id = ?"),
        params![objective_id],
        row_to_objective_run,
    )
    .optional()
    .map_err(Into::into)
}

fn get_objective_run_operation_tx(
    tx: &rusqlite::Transaction<'_>,
    operation_id: &str,
) -> Result<ObjectiveRunOperationRecord> {
    tx.query_row(
        &format!("{OBJECTIVE_RUN_OPERATION_SELECT} WHERE id = ?"),
        params![operation_id],
        row_to_objective_run_operation,
    )
    .map_err(Into::into)
}

fn get_objective_attempt_tx(
    tx: &rusqlite::Transaction<'_>,
    attempt_id: &str,
) -> Result<Option<ObjectiveAttemptRecord>> {
    tx.query_row(
        &format!("{OBJECTIVE_ATTEMPT_SELECT} WHERE id = ?"),
        params![attempt_id],
        row_to_objective_attempt,
    )
    .optional()
    .map_err(Into::into)
}

fn get_objective_verification_tx(
    tx: &rusqlite::Transaction<'_>,
    verification_id: &str,
) -> Result<Option<ObjectiveVerificationRecord>> {
    tx.query_row(
        &format!("{OBJECTIVE_VERIFICATION_SELECT} WHERE id = ?"),
        params![verification_id],
        row_to_objective_verification,
    )
    .optional()
    .map_err(Into::into)
}

fn next_attempt_number_tx(tx: &rusqlite::Transaction<'_>, objective_id: &str) -> Result<i64> {
    let max_attempt: Option<i64> = tx.query_row(
        "SELECT MAX(attempt_number) FROM objective_attempt WHERE objective_id = ?",
        params![objective_id],
        |row| row.get(0),
    )?;
    Ok(max_attempt.unwrap_or(0) + 1)
}

fn collect_objective_runs(
    rows: impl Iterator<Item = rusqlite::Result<ObjectiveRunRecord>>,
) -> Result<Vec<ObjectiveRunRecord>> {
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}

fn collect_objective_run_operations(
    rows: impl Iterator<Item = rusqlite::Result<ObjectiveRunOperationRecord>>,
) -> Result<Vec<ObjectiveRunOperationRecord>> {
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}

fn collect_objective_attempts(
    rows: impl Iterator<Item = rusqlite::Result<ObjectiveAttemptRecord>>,
) -> Result<Vec<ObjectiveAttemptRecord>> {
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}

fn collect_objective_verifications(
    rows: impl Iterator<Item = rusqlite::Result<ObjectiveVerificationRecord>>,
) -> Result<Vec<ObjectiveVerificationRecord>> {
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}
