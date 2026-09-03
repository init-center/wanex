use crate::event_store::append_event_tx;
use crate::rows::{row_to_session, row_to_session_input, row_to_session_turn};
use crate::{
    AdmissionReceipt, AdmitSessionInput, EnqueueJob, EventScope, ListSessions, RenameSession,
    Result, RetryPolicy, SchedulerJobKind, SchedulerJobRecord, SessionInputRecord, SessionRecord,
    SessionScope, SessionStateTransition, SessionTurnRecord, SubmitSessionTurn,
    SubmitSessionTurnReceipt, SystemService, SystemServiceError,
};
use rusqlite::{params, params_from_iter, types::Value as SqlValue, OptionalExtension};
use uuid::Uuid;

const SESSION_SELECT: &str = "SELECT id, title, kind, scope_kind, scope_id, status, revision,
    created_at, updated_at, archived_at FROM session";

pub(crate) const SESSION_TURN_SELECT: &str = "SELECT id, session_id, primary_input_id,
    job_id, state, execution_binding_json, execution_binding_digest, max_steps,
    current_attempt_id, regenerates_turn_id, cancel_requested_at,
    cancel_reason, result_json, error_json, created_at, updated_at, finished_at
    FROM session_turn";

impl SystemService {
    pub fn create_session(
        &self,
        id: Option<&str>,
        title: Option<&str>,
        kind: Option<&str>,
        scope: Option<&SessionScope>,
    ) -> Result<SessionRecord> {
        let now = crate::util::now_ms();
        let id = id
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| format!("ses_{}", Uuid::now_v7()));
        let title = title.map(normalize_session_title).transpose()?;
        let kind = kind.unwrap_or("chat");
        validate_session_scope(scope)?;
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        tx.execute(
            "INSERT INTO session (
                id, title, kind, scope_kind, scope_id, status, revision,
                created_at, updated_at, archived_at
             ) VALUES (?, ?, ?, ?, ?, 'active', 1, ?, ?, NULL)",
            params![
                id,
                title,
                kind,
                scope.map(|value| value.kind.as_str()),
                scope.map(|value| value.id.as_str()),
                now,
                now
            ],
        )?;
        append_event_tx(
            &tx,
            &format!("evt_{}", Uuid::now_v7()),
            "session.created",
            &EventScope {
                session_id: Some(id.clone()),
                ..EventScope::default()
            },
            &serde_json::json!({
                "sessionId": id,
                "kind": kind,
                "scope": scope,
                "status": "active",
                "revision": 1
            }),
            now,
        )?;
        tx.commit()?;
        self.get_session(&id)?
            .ok_or_else(|| SystemServiceError::Invariant("created session not found".to_string()))
    }

    pub fn get_session(&self, id: &str) -> Result<Option<SessionRecord>> {
        let conn = self.connect()?;
        conn.query_row(
            &format!("{SESSION_SELECT} WHERE id = ?"),
            params![id],
            row_to_session,
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn list_sessions(&self, request: &ListSessions) -> Result<Vec<SessionRecord>> {
        validate_list_sessions(request)?;
        let conn = self.connect()?;
        let limit = i64::from(request.limit.unwrap_or(100).min(1000));
        let mut clauses: Vec<&str> = Vec::new();
        let mut values: Vec<SqlValue> = Vec::new();
        if let Some(kind) = &request.kind {
            clauses.push("kind = ?");
            values.push(SqlValue::Text(kind.clone()));
        }
        if let Some(status) = &request.status {
            clauses.push("status = ?");
            values.push(SqlValue::Text(status.clone()));
        }
        if let Some(updated_before) = request.updated_before {
            clauses.push("updated_at < ?");
            values.push(SqlValue::Integer(updated_before));
        }
        if let Some(updated_after) = request.updated_after {
            clauses.push("updated_at > ?");
            values.push(SqlValue::Integer(updated_after));
        }
        if let Some(scope) = &request.scope {
            clauses.push("scope_kind = ? AND scope_id = ?");
            values.push(SqlValue::Text(scope.kind.clone()));
            values.push(SqlValue::Text(scope.id.clone()));
        }
        if let Some(before) = &request.before {
            clauses.push("(updated_at < ? OR (updated_at = ? AND id > ?))");
            values.push(SqlValue::Integer(before.updated_at));
            values.push(SqlValue::Integer(before.updated_at));
            values.push(SqlValue::Text(before.session_id.clone()));
        }
        values.push(SqlValue::Integer(limit));

        let where_clause = if clauses.is_empty() {
            String::new()
        } else {
            format!(" WHERE {}", clauses.join(" AND "))
        };
        let sql = format!(
            "{SESSION_SELECT}{where_clause}
             ORDER BY updated_at DESC, id ASC LIMIT ?"
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(params_from_iter(values), row_to_session)?;
        collect_rows(rows)
    }

    pub fn rename_session(&self, request: &RenameSession) -> Result<SessionRecord> {
        validate_session_revision(&request.session_id, request.expected_revision)?;
        let title = normalize_session_title(&request.title)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;
        let current = require_session_tx(&tx, &request.session_id)?;
        require_session_revision(&current, request.expected_revision)?;
        let updated = tx.execute(
            "UPDATE session
             SET title = ?, revision = revision + 1, updated_at = ?
             WHERE id = ? AND revision = ?",
            params![title, now, request.session_id, request.expected_revision],
        )?;
        if updated != 1 {
            return Err(session_revision_conflict(
                &request.session_id,
                request.expected_revision,
            ));
        }
        append_event_tx(
            &tx,
            &format!("evt_{}", Uuid::now_v7()),
            "session.renamed",
            &EventScope {
                session_id: Some(request.session_id.clone()),
                ..EventScope::default()
            },
            &serde_json::json!({
                "sessionId": request.session_id,
                "title": title,
                "revision": request.expected_revision + 1
            }),
            now,
        )?;
        let session = require_session_tx(&tx, &request.session_id)?;
        tx.commit()?;
        Ok(session)
    }

    pub fn archive_session(&self, request: &SessionStateTransition) -> Result<SessionRecord> {
        validate_session_revision(&request.session_id, request.expected_revision)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;
        let current = require_session_tx(&tx, &request.session_id)?;
        require_session_revision(&current, request.expected_revision)?;
        if current.status != "active" {
            return Err(SystemServiceError::Conflict(format!(
                "session is not active: {}",
                request.session_id
            )));
        }
        if session_has_unfinished_work_tx(&tx, &request.session_id)? {
            return Err(SystemServiceError::Conflict(format!(
                "session has unfinished work: {}",
                request.session_id
            )));
        }
        let updated = tx.execute(
            "UPDATE session
             SET status = 'archived', revision = revision + 1,
                 updated_at = ?, archived_at = ?
             WHERE id = ? AND status = 'active' AND revision = ?",
            params![now, now, request.session_id, request.expected_revision],
        )?;
        if updated != 1 {
            return Err(session_revision_conflict(
                &request.session_id,
                request.expected_revision,
            ));
        }
        append_session_state_event_tx(&tx, request, "session.archived", "archived", now)?;
        let session = require_session_tx(&tx, &request.session_id)?;
        tx.commit()?;
        Ok(session)
    }

    pub fn restore_session(&self, request: &SessionStateTransition) -> Result<SessionRecord> {
        validate_session_revision(&request.session_id, request.expected_revision)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;
        let current = require_session_tx(&tx, &request.session_id)?;
        require_session_revision(&current, request.expected_revision)?;
        if current.status != "archived" {
            return Err(SystemServiceError::Conflict(format!(
                "session is not archived: {}",
                request.session_id
            )));
        }
        let updated = tx.execute(
            "UPDATE session
             SET status = 'active', revision = revision + 1,
                 updated_at = ?, archived_at = NULL
             WHERE id = ? AND status = 'archived' AND revision = ?",
            params![now, request.session_id, request.expected_revision],
        )?;
        if updated != 1 {
            return Err(session_revision_conflict(
                &request.session_id,
                request.expected_revision,
            ));
        }
        append_session_state_event_tx(&tx, request, "session.restored", "active", now)?;
        let session = require_session_tx(&tx, &request.session_id)?;
        tx.commit()?;
        Ok(session)
    }

    pub fn admit_session_input(&self, request: &AdmitSessionInput) -> Result<AdmissionReceipt> {
        validate_admit_session_input(request)?;
        let now = crate::util::now_ms();
        let input_id = request
            .id
            .clone()
            .unwrap_or_else(|| format!("inp_{}", Uuid::now_v7()));
        let input_type = request.input_type.as_deref().unwrap_or("user");
        let intent = request.intent.as_deref().unwrap_or("normal");
        let origin_json = request
            .origin
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        if let Some(existing) =
            find_input_by_idempotency_tx(&tx, &request.session_id, &request.idempotency_key)?
        {
            ensure_matching_input(&existing, request, input_type, intent)?;
            tx.commit()?;
            return Ok(admission_receipt(&existing));
        }
        require_active_session_tx(&tx, &request.session_id)?;
        tx.execute(
            "INSERT INTO session_input (
                id, session_id, principal_id, idempotency_key, input_type,
                content_json, origin_json, intent, run_control_policy,
                expected_turn_id, status, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'admitted', ?, ?)",
            params![
                input_id,
                request.session_id,
                request.principal_id,
                request.idempotency_key,
                input_type,
                serde_json::to_string(&request.content)?,
                origin_json,
                intent,
                now,
                now
            ],
        )?;
        let existing =
            get_input_by_idempotency_tx(&tx, &request.session_id, &request.idempotency_key)?;
        ensure_matching_input(&existing, request, input_type, intent)?;
        append_input_admitted_event_tx(&tx, &existing, now)?;
        touch_session_activity_tx(&tx, &request.session_id, now)?;
        tx.commit()?;
        Ok(admission_receipt(&existing))
    }

    pub fn submit_session_turn(
        &self,
        request: &SubmitSessionTurn,
    ) -> Result<SubmitSessionTurnReceipt> {
        validate_submit_session_turn(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let receipt = submit_session_turn_tx(&tx, request, now)?;
        tx.commit()?;
        Ok(receipt)
    }

    pub fn list_session_inputs(&self, session_id: &str) -> Result<Vec<SessionInputRecord>> {
        self.list_session_input_window(session_id, None, None)
    }

    pub fn list_session_input_window(
        &self,
        session_id: &str,
        status: Option<&str>,
        limit: Option<i64>,
    ) -> Result<Vec<SessionInputRecord>> {
        if status.is_some_and(|value| {
            !matches!(
                value,
                "admitted"
                    | "control_pending"
                    | "promoted"
                    | "completed"
                    | "failed"
                    | "cancelled"
                    | "rejected"
            )
        }) {
            return Err(SystemServiceError::InvalidInput(
                "invalid session input status".to_string(),
            ));
        }
        if limit.is_some_and(|value| !(1..=1000).contains(&value)) {
            return Err(SystemServiceError::InvalidInput(
                "session input limit must be between 1 and 1000".to_string(),
            ));
        }
        let conn = self.connect()?;
        let select = "SELECT id, session_id, principal_id, idempotency_key, input_type,
                             content_json, origin_json, intent, run_control_policy,
                             expected_turn_id, status, created_at, updated_at
                      FROM session_input";
        let mut inputs = match (status, limit) {
            (None, None) => {
                let mut stmt = conn.prepare(&format!(
                    "{select} WHERE session_id = ? ORDER BY created_at ASC, id ASC"
                ))?;
                let rows = stmt.query_map(params![session_id], row_to_session_input)?;
                collect_rows(rows)?
            }
            (Some(input_status), None) => {
                let mut stmt = conn.prepare(&format!(
                    "{select} WHERE session_id = ? AND status = ?
                     ORDER BY created_at ASC, id ASC"
                ))?;
                let rows =
                    stmt.query_map(params![session_id, input_status], row_to_session_input)?;
                collect_rows(rows)?
            }
            (None, Some(window_limit)) => {
                let mut stmt = conn.prepare(&format!(
                    "{select} WHERE session_id = ?
                     ORDER BY created_at DESC, id DESC LIMIT ?"
                ))?;
                let rows =
                    stmt.query_map(params![session_id, window_limit], row_to_session_input)?;
                collect_rows(rows)?
            }
            (Some(input_status), Some(window_limit)) => {
                let mut stmt = conn.prepare(&format!(
                    "{select} WHERE session_id = ? AND status = ?
                     ORDER BY created_at DESC, id DESC LIMIT ?"
                ))?;
                let rows = stmt.query_map(
                    params![session_id, input_status, window_limit],
                    row_to_session_input,
                )?;
                collect_rows(rows)?
            }
        };
        if limit.is_some() {
            inputs.reverse();
        }
        Ok(inputs)
    }
}

pub(crate) fn submit_session_turn_tx(
    tx: &rusqlite::Transaction<'_>,
    request: &SubmitSessionTurn,
    now: i64,
) -> Result<SubmitSessionTurnReceipt> {
    validate_submit_session_turn(request)?;
    let input_id = request
        .id
        .clone()
        .unwrap_or_else(|| format!("inp_{}", Uuid::now_v7()));
    let turn_id = request
        .turn_id
        .clone()
        .unwrap_or_else(|| format!("turn_{}", Uuid::now_v7()));
    let job_id = request
        .job_id
        .clone()
        .unwrap_or_else(|| format!("job_{}", Uuid::now_v7()));
    let input_type = request.input_type.as_deref().unwrap_or("user");
    let intent = request.intent.as_deref().unwrap_or("normal");
    let origin_json = request
        .origin
        .as_ref()
        .map(serde_json::to_string)
        .transpose()?;

    let existing_input =
        find_input_by_idempotency_tx(tx, &request.session_id, &request.idempotency_key)?;
    if let Some(existing) = existing_input.as_ref() {
        ensure_matching_submit_input(existing, request, input_type, intent)?;
        if request.id.as_deref().is_some_and(|id| id != existing.id) {
            return Err(SystemServiceError::Invariant(
                "conflicting repeated session turn submission".to_string(),
            ));
        }
        if let Some(turn) = get_turn_by_input_tx(tx, &existing.id)? {
            let job = crate::scheduler::get_job_tx(tx, &turn.job_id)?;
            ensure_matching_submit_turn(existing, &turn, &job, request)?;
            return Ok(SubmitSessionTurnReceipt {
                admission: admission_receipt(existing),
                turn,
                job,
            });
        }
        if existing.status != "admitted" {
            return Err(SystemServiceError::Invariant(
                "session input without a turn must remain admitted".to_string(),
            ));
        }
    }

    require_active_session_tx(tx, &request.session_id)?;
    require_follow_up_head_tx(tx, request, intent)?;

    let input = if let Some(existing) = existing_input {
        existing
    } else {
        tx.execute(
            "INSERT INTO session_input (
                id, session_id, principal_id, idempotency_key, input_type,
                content_json, origin_json, intent, run_control_policy,
                expected_turn_id, status, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'admitted', ?, ?)",
            params![
                input_id,
                request.session_id,
                request.principal_id,
                request.idempotency_key,
                input_type,
                serde_json::to_string(&request.content)?,
                origin_json,
                intent,
                request.run_control_policy.as_deref(),
                request.expected_turn_id.as_deref(),
                now,
                now
            ],
        )?;
        let input = get_input_tx(tx, &input_id)?;
        append_input_admitted_event_tx(tx, &input, now)?;
        input
    };

    let input_id = input.id.clone();

    let job_idempotency_key = request
        .job_idempotency_key
        .clone()
        .unwrap_or_else(|| format!("session.turn:{}:{}", request.session_id, input_id));
    let queue = request
        .queue
        .as_deref()
        .unwrap_or(crate::scheduler::DEFAULT_SCHEDULER_QUEUE);
    let payload = serde_json::json!({
        "sessionId": request.session_id,
        "turnId": turn_id,
        "inputId": input_id
    });
    let job = crate::scheduler::enqueue_job_tx(
        tx,
        &EnqueueJob {
            id: Some(job_id.clone()),
            kind: SchedulerJobKind::SessionTurn,
            queue: Some(queue.to_string()),
            principal_id: request.principal_id.clone(),
            payload,
            scheduled_at: request.scheduled_at,
            not_before: request.not_before,
            priority: request.priority,
            concurrency_key: Some(format!("session:{}", request.session_id)),
            max_attempts: Some(1),
            retry_policy: Some(RetryPolicy::default()),
            idempotency_key: Some(job_idempotency_key),
            budget_grant_id: request.budget_grant_id.clone(),
        },
        now,
    )?;
    if job.id != job_id || job.kind != "session.turn" {
        return Err(SystemServiceError::Invariant(
            "session turn job idempotency key resolved to a different job".to_string(),
        ));
    }

    let binding_digest = execution_binding_digest(&request.execution_binding)?;
    tx.execute(
        "INSERT INTO session_turn (
            id, session_id, primary_input_id, job_id, state,
            execution_binding_json, execution_binding_digest, max_steps,
            current_attempt_id, regenerates_turn_id,
            cancel_requested_at, cancel_reason, result_json, error_json,
            created_at, updated_at, finished_at
         ) VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, NULL, ?, NULL, NULL,
                   NULL, NULL, ?, ?, NULL)",
        params![
            turn_id,
            request.session_id,
            input_id,
            job.id,
            serde_json::to_string(&request.execution_binding)?,
            binding_digest,
            request.max_steps.unwrap_or(32),
            request.regenerates_turn_id,
            now,
            now
        ],
    )?;
    touch_session_activity_tx(tx, &request.session_id, now)?;
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        "session.turn.submitted",
        &EventScope {
            session_id: Some(request.session_id.clone()),
            turn_id: Some(turn_id.clone()),
            input_id: Some(input_id.clone()),
            ..EventScope::default()
        },
        &serde_json::json!({
            "turnId": turn_id,
            "inputId": input_id,
            "jobId": job.id,
            "executionBindingDigest": binding_digest,
            "state": "queued"
        }),
        now,
    )?;
    let turn = get_turn_tx(tx, &turn_id)?;
    Ok(SubmitSessionTurnReceipt {
        admission: admission_receipt(&input),
        turn,
        job,
    })
}

pub(crate) fn get_turn_tx(
    tx: &rusqlite::Transaction<'_>,
    turn_id: &str,
) -> Result<SessionTurnRecord> {
    tx.query_row(
        &format!("{SESSION_TURN_SELECT} WHERE id = ?"),
        params![turn_id],
        row_to_session_turn,
    )
    .map_err(Into::into)
}

pub(crate) fn get_optional_turn_tx(
    tx: &rusqlite::Transaction<'_>,
    turn_id: &str,
) -> Result<Option<SessionTurnRecord>> {
    tx.query_row(
        &format!("{SESSION_TURN_SELECT} WHERE id = ?"),
        params![turn_id],
        row_to_session_turn,
    )
    .optional()
    .map_err(Into::into)
}

fn get_turn_by_input_tx(
    tx: &rusqlite::Transaction<'_>,
    input_id: &str,
) -> Result<Option<SessionTurnRecord>> {
    tx.query_row(
        &format!("{SESSION_TURN_SELECT} WHERE primary_input_id = ?"),
        params![input_id],
        row_to_session_turn,
    )
    .optional()
    .map_err(Into::into)
}

pub(crate) fn get_input_tx(
    tx: &rusqlite::Transaction<'_>,
    input_id: &str,
) -> Result<SessionInputRecord> {
    tx.query_row(
        "SELECT id, session_id, principal_id, idempotency_key, input_type,
                content_json, origin_json, intent, run_control_policy,
                expected_turn_id, status, created_at, updated_at
         FROM session_input WHERE id = ?",
        params![input_id],
        row_to_session_input,
    )
    .map_err(Into::into)
}

fn find_input_by_idempotency_tx(
    tx: &rusqlite::Transaction<'_>,
    session_id: &str,
    idempotency_key: &str,
) -> Result<Option<SessionInputRecord>> {
    tx.query_row(
        "SELECT id, session_id, principal_id, idempotency_key, input_type,
                content_json, origin_json, intent, run_control_policy,
                expected_turn_id, status, created_at, updated_at
         FROM session_input WHERE session_id = ? AND idempotency_key = ?",
        params![session_id, idempotency_key],
        row_to_session_input,
    )
    .optional()
    .map_err(Into::into)
}

fn get_input_by_idempotency_tx(
    tx: &rusqlite::Transaction<'_>,
    session_id: &str,
    idempotency_key: &str,
) -> Result<SessionInputRecord> {
    find_input_by_idempotency_tx(tx, session_id, idempotency_key)?.ok_or_else(|| {
        SystemServiceError::Invariant("admitted session input not found".to_string())
    })
}

fn append_input_admitted_event_tx(
    tx: &rusqlite::Transaction<'_>,
    input: &SessionInputRecord,
    now: i64,
) -> Result<()> {
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        "session.input.admitted",
        &EventScope {
            session_id: Some(input.session_id.clone()),
            input_id: Some(input.id.clone()),
            ..EventScope::default()
        },
        &serde_json::json!({
            "inputId": input.id,
            "principalId": input.principal_id,
            "inputType": input.input_type,
            "intent": input.intent,
            "status": input.status
        }),
        now,
    )
}

fn admission_receipt(input: &SessionInputRecord) -> AdmissionReceipt {
    AdmissionReceipt {
        input_id: input.id.clone(),
        session_id: input.session_id.clone(),
        durability: "local-durable".to_string(),
        status: "admitted".to_string(),
    }
}

fn ensure_matching_input(
    existing: &SessionInputRecord,
    request: &AdmitSessionInput,
    input_type: &str,
    intent: &str,
) -> Result<()> {
    if existing.principal_id != request.principal_id
        || existing.input_type != input_type
        || existing.content != request.content
        || existing.origin != request.origin
        || existing.intent != intent
    {
        return Err(SystemServiceError::Invariant(
            "conflicting repeated session input admission".to_string(),
        ));
    }
    Ok(())
}

fn ensure_matching_submit_input(
    existing: &SessionInputRecord,
    request: &SubmitSessionTurn,
    input_type: &str,
    intent: &str,
) -> Result<()> {
    if existing.principal_id != request.principal_id
        || existing.input_type != input_type
        || existing.content != request.content
        || existing.origin != request.origin
        || existing.intent != intent
        || existing.run_control_policy != request.run_control_policy
        || existing.expected_turn_id != request.expected_turn_id
    {
        return Err(SystemServiceError::Invariant(
            "conflicting repeated session turn submission".to_string(),
        ));
    }
    Ok(())
}

fn ensure_matching_submit_turn(
    existing: &SessionInputRecord,
    turn: &SessionTurnRecord,
    job: &SchedulerJobRecord,
    request: &SubmitSessionTurn,
) -> Result<()> {
    if request.id.as_deref().is_some_and(|id| id != existing.id)
        || request.turn_id.as_deref().is_some_and(|id| id != turn.id)
        || request
            .job_id
            .as_deref()
            .is_some_and(|id| id != turn.job_id)
        || turn.session_id != request.session_id
        || turn.primary_input_id != existing.id
        || turn.max_steps != request.max_steps.unwrap_or(32)
        || turn.regenerates_turn_id != request.regenerates_turn_id
        || !execution_binding_semantically_equal(
            &turn.execution_binding,
            &request.execution_binding,
        )
    {
        return Err(SystemServiceError::Invariant(
            "conflicting repeated session turn submission".to_string(),
        ));
    }

    let expected_job_idempotency_key = request
        .job_idempotency_key
        .clone()
        .unwrap_or_else(|| format!("session.turn:{}:{}", request.session_id, existing.id));
    let expected_payload = serde_json::json!({
        "sessionId": request.session_id,
        "turnId": turn.id,
        "inputId": existing.id
    });
    let expected_concurrency_key = format!("session:{}", request.session_id);
    if job.kind != "session.turn"
        || job.id != turn.job_id
        || job.principal_id != request.principal_id
        || job.queue
            != request
                .queue
                .as_deref()
                .unwrap_or(crate::scheduler::DEFAULT_SCHEDULER_QUEUE)
        || job.payload != expected_payload
        || job.idempotency_key.as_deref() != Some(expected_job_idempotency_key.as_str())
        || job.not_before != request.not_before
        || job.priority != request.priority.unwrap_or(0)
        || job.concurrency_key.as_deref() != Some(expected_concurrency_key.as_str())
        || job.max_attempts != 1
        || job.retry_policy != RetryPolicy::default()
        || job.budget_grant_id != request.budget_grant_id
        || request
            .scheduled_at
            .is_some_and(|scheduled_at| job.scheduled_at != scheduled_at)
    {
        return Err(SystemServiceError::Invariant(
            "conflicting repeated session turn scheduler job".to_string(),
        ));
    }
    Ok(())
}

fn execution_binding_semantically_equal(
    existing: &serde_json::Value,
    requested: &serde_json::Value,
) -> bool {
    let (Some(existing), Some(requested)) = (existing.as_object(), requested.as_object()) else {
        return false;
    };
    let mut existing = existing.clone();
    let mut requested = requested.clone();
    existing.remove("digest");
    existing.remove("createdAt");
    requested.remove("digest");
    requested.remove("createdAt");
    existing == requested
}

pub(crate) fn execution_binding_digest(binding: &serde_json::Value) -> Result<String> {
    let object = binding.as_object().ok_or_else(|| {
        SystemServiceError::InvalidJobRequest("execution_binding must be an object".to_string())
    })?;
    let allowed_binding_keys = [
        "digest",
        "createdAt",
        "modelEndpoint",
        "completion",
        "capabilityRoutes",
        "resources",
        "recovery",
        "contextEvidence",
        "toolSnapshot",
        "permissionSnapshot",
        "executionEnvironment",
        "applicationScope",
    ];
    if object
        .keys()
        .any(|key| !allowed_binding_keys.contains(&key.as_str()))
    {
        return Err(SystemServiceError::InvalidJobRequest(
            "execution_binding contains an unknown field".to_string(),
        ));
    }
    if object
        .get("createdAt")
        .and_then(serde_json::Value::as_i64)
        .is_none()
    {
        return Err(SystemServiceError::InvalidJobRequest(
            "execution_binding.createdAt must be an integer".to_string(),
        ));
    }
    let digest = binding_string(object, "digest")?;
    validate_sha256(digest, "execution_binding.digest")?;
    let model_endpoint = object
        .get("modelEndpoint")
        .and_then(serde_json::Value::as_object)
        .ok_or_else(|| {
            SystemServiceError::InvalidJobRequest(
                "execution_binding.modelEndpoint must be an object".to_string(),
            )
        })?;
    validate_model_endpoint_binding(model_endpoint)?;
    let completion = object
        .get("completion")
        .and_then(serde_json::Value::as_object)
        .ok_or_else(|| {
            SystemServiceError::InvalidJobRequest(
                "execution_binding.completion must be an object".to_string(),
            )
        })?;
    validate_completion_binding(completion)?;
    let capability_routes = object
        .get("capabilityRoutes")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| {
            SystemServiceError::InvalidJobRequest(
                "execution_binding.capabilityRoutes must be an array".to_string(),
            )
        })?;
    validate_capability_route_bindings(capability_routes)?;
    let resources = object
        .get("resources")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| {
            SystemServiceError::InvalidJobRequest(
                "execution_binding.resources must be an array".to_string(),
            )
        })?;
    validate_resource_bindings(resources)?;
    let recovery = object
        .get("recovery")
        .and_then(serde_json::Value::as_object)
        .ok_or_else(|| {
            SystemServiceError::InvalidJobRequest(
                "execution_binding.recovery must be an object".to_string(),
            )
        })?;
    validate_recovery_binding(recovery)?;
    if let Some(context_evidence) = object.get("contextEvidence") {
        validate_context_evidence(context_evidence)?;
    }
    if let Some(execution_environment) = object.get("executionEnvironment") {
        crate::execution_environment::validate_binding(
            execution_environment,
            "execution_binding.executionEnvironment",
        )
        .map_err(SystemServiceError::InvalidJobRequest)?;
    }
    if let Some(application_scope) = object.get("applicationScope") {
        crate::execution_environment::validate_application_scope(
            application_scope,
            "execution_binding.applicationScope",
        )
        .map_err(SystemServiceError::InvalidJobRequest)?;
    }

    let mut unsigned = object.clone();
    unsigned.remove("digest");
    let actual = crate::util::hex_sha256(
        serde_json::to_string(&serde_json::Value::Object(unsigned))?.as_bytes(),
    );
    if actual != digest {
        return Err(SystemServiceError::InvalidJobRequest(
            "execution_binding.digest does not match its content".to_string(),
        ));
    }
    Ok(digest.to_string())
}

fn validate_completion_binding(
    completion: &serde_json::Map<String, serde_json::Value>,
) -> Result<()> {
    require_exact_keys(
        completion,
        &["maxOutputTokens"],
        "execution_binding.completion",
    )?;
    if completion
        .get("maxOutputTokens")
        .and_then(serde_json::Value::as_i64)
        .is_none_or(|value| value <= 0)
    {
        return Err(SystemServiceError::InvalidJobRequest(
            "execution_binding.completion.maxOutputTokens must be a positive integer".to_string(),
        ));
    }
    Ok(())
}

fn validate_recovery_binding(recovery: &serde_json::Map<String, serde_json::Value>) -> Result<()> {
    let allowed_keys = ["providerMaxAttempts", "idempotentToolMaxAttempts"];
    if recovery
        .keys()
        .any(|key| !allowed_keys.contains(&key.as_str()))
        || recovery.len() != allowed_keys.len()
    {
        return Err(SystemServiceError::InvalidJobRequest(
            "execution_binding.recovery contains missing or unknown fields".to_string(),
        ));
    }
    for key in allowed_keys {
        if recovery
            .get(key)
            .and_then(serde_json::Value::as_i64)
            .is_none_or(|value| value <= 0)
        {
            return Err(SystemServiceError::InvalidJobRequest(format!(
                "execution_binding.recovery.{key} must be a positive integer"
            )));
        }
    }
    Ok(())
}

fn validate_context_evidence(value: &serde_json::Value) -> Result<()> {
    let evidence = value.as_object().ok_or_else(|| {
        SystemServiceError::InvalidJobRequest(
            "execution_binding.contextEvidence must be an object".to_string(),
        )
    })?;
    let allowed_keys = ["revision", "instructions", "skills"];
    if evidence
        .keys()
        .any(|key| !allowed_keys.contains(&key.as_str()))
        || evidence.get("revision").is_none()
    {
        return Err(SystemServiceError::InvalidJobRequest(
            "execution_binding.contextEvidence contains missing or unknown fields".to_string(),
        ));
    }
    if evidence.get("revision").and_then(serde_json::Value::as_i64) != Some(1) {
        return Err(SystemServiceError::InvalidJobRequest(
            "execution_binding.contextEvidence.revision must be 1".to_string(),
        ));
    }
    for (name, source) in [
        ("instructions", evidence.get("instructions")),
        ("skills", evidence.get("skills")),
    ] {
        let Some(source) = source else { continue };
        let source = source.as_object().ok_or_else(|| {
            SystemServiceError::InvalidJobRequest(format!(
                "execution_binding.contextEvidence.{name} must be an object"
            ))
        })?;
        require_exact_keys(
            source,
            &["state", "sourceCount", "digest"],
            &format!("execution_binding.contextEvidence.{name}"),
        )?;
        let state = source
            .get("state")
            .and_then(serde_json::Value::as_str)
            .filter(|value| matches!(*value, "available" | "unavailable"));
        if state.is_none() {
            return Err(SystemServiceError::InvalidJobRequest(format!(
                "execution_binding.contextEvidence.{name}.state is invalid"
            )));
        }
        let source_count = source
            .get("sourceCount")
            .and_then(serde_json::Value::as_i64)
            .filter(|value| (0..=4096).contains(value));
        if source_count.is_none() {
            return Err(SystemServiceError::InvalidJobRequest(format!(
                "execution_binding.contextEvidence.{name}.sourceCount is invalid"
            )));
        }
        let digest = source
            .get("digest")
            .and_then(serde_json::Value::as_str)
            .filter(|value| {
                value.len() == 64
                    && value
                        .bytes()
                        .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
            });
        if digest.is_none() {
            return Err(SystemServiceError::InvalidJobRequest(format!(
                "execution_binding.contextEvidence.{name}.digest is invalid"
            )));
        }
    }
    Ok(())
}

fn validate_model_endpoint_binding(
    endpoint: &serde_json::Map<String, serde_json::Value>,
) -> Result<()> {
    validate_model_endpoint_binding_for_usage(endpoint, true)
}

pub(crate) fn validate_capability_model_endpoint_binding(
    endpoint: &serde_json::Map<String, serde_json::Value>,
) -> Result<()> {
    validate_model_endpoint_binding_for_usage(endpoint, false)
}

fn validate_model_endpoint_binding_for_usage(
    endpoint: &serde_json::Map<String, serde_json::Value>,
    require_conversation: bool,
) -> Result<()> {
    require_exact_keys(
        endpoint,
        &[
            "endpointId",
            "endpointDigest",
            "connection",
            "protocol",
            "model",
        ],
        "execution_binding.modelEndpoint",
    )?;
    let endpoint_id = binding_string(endpoint, "endpointId")?;
    let endpoint_digest = binding_string(endpoint, "endpointDigest")?;
    validate_sha256(
        endpoint_digest,
        "execution_binding.modelEndpoint.endpointDigest",
    )?;
    let connection = binding_object(endpoint, "connection", "modelEndpoint")?;
    require_allowed_keys(
        connection,
        &["id", "providerId", "baseUrl", "secretRef"],
        2,
        "execution_binding.modelEndpoint.connection",
    )?;
    for key in ["id", "providerId"] {
        binding_string(connection, key)?;
    }
    for key in ["baseUrl", "secretRef"] {
        validate_optional_binding_string(connection, key, "modelEndpoint.connection")?;
    }
    let protocol = binding_object(endpoint, "protocol", "modelEndpoint")?;
    require_allowed_keys(
        protocol,
        &["id", "version"],
        1,
        "execution_binding.modelEndpoint.protocol",
    )?;
    binding_string(protocol, "id")?;
    validate_optional_binding_string(protocol, "version", "modelEndpoint.protocol")?;
    let model = binding_object(endpoint, "model", "modelEndpoint")?;
    validate_model_descriptor(model, require_conversation)?;

    let mut normalized_endpoint = serde_json::Map::new();
    normalized_endpoint.insert(
        "id".to_string(),
        serde_json::Value::String(endpoint_id.to_string()),
    );
    for key in ["connection", "protocol", "model"] {
        normalized_endpoint.insert(
            key.to_string(),
            endpoint
                .get(key)
                .expect("required endpoint field was validated")
                .clone(),
        );
    }
    let actual = crate::util::hex_sha256(
        serde_json::to_string(&serde_json::Value::Object(normalized_endpoint))?.as_bytes(),
    );
    if actual != endpoint_digest {
        return Err(SystemServiceError::InvalidJobRequest(
            "execution_binding.modelEndpoint.endpointDigest does not match its content".to_string(),
        ));
    }
    Ok(())
}

fn validate_model_descriptor(
    model: &serde_json::Map<String, serde_json::Value>,
    require_conversation: bool,
) -> Result<()> {
    require_allowed_keys(
        model,
        &[
            "id",
            "operations",
            "inputModalities",
            "outputModalities",
            "features",
            "limits",
            "behavior",
            "catalog",
        ],
        6,
        "execution_binding.modelEndpoint.model",
    )?;
    binding_string(model, "id")?;
    let operations = descriptor_strings(
        model,
        "operations",
        &[
            "conversation",
            "image.generate",
            "image.edit",
            "video.generate",
            "audio.transcribe",
            "audio.synthesize",
        ],
        false,
    )?;
    let inputs = descriptor_strings(
        model,
        "inputModalities",
        &["text", "image", "audio", "video", "document"],
        false,
    )?;
    let outputs = descriptor_strings(
        model,
        "outputModalities",
        &["text", "image", "audio", "video"],
        false,
    )?;
    let features = descriptor_strings(
        model,
        "features",
        &["tool_calling", "parallel_tool_calls", "reasoning"],
        true,
    )?;
    if require_conversation
        && (!operations.iter().any(|value| value == "conversation")
            || !inputs.iter().any(|value| value == "text")
            || !outputs.iter().any(|value| value == "text"))
    {
        return Err(SystemServiceError::InvalidJobRequest(
            "turn model descriptor requires conversation with text input and output".to_string(),
        ));
    }
    if features.iter().any(|value| value == "parallel_tool_calls")
        && !features.iter().any(|value| value == "tool_calling")
    {
        return Err(SystemServiceError::InvalidJobRequest(
            "parallel_tool_calls requires tool_calling".to_string(),
        ));
    }
    validate_model_limits(model.get("limits"))?;
    validate_model_behavior(model.get("behavior"), &features)?;
    let catalog = model
        .get("catalog")
        .and_then(serde_json::Value::as_object)
        .ok_or_else(|| {
            SystemServiceError::InvalidJobRequest(
                "execution_binding.modelEndpoint.model.catalog must be an object".to_string(),
            )
        })?;
    require_exact_keys(
        catalog,
        &["source", "catalogId", "revision"],
        "execution_binding.modelEndpoint.model.catalog",
    )?;
    let source = binding_string(catalog, "source")?;
    if !matches!(source, "builtin" | "provider" | "custom") {
        return Err(SystemServiceError::InvalidJobRequest(
            "model catalog source is invalid".to_string(),
        ));
    }
    binding_string(catalog, "catalogId")?;
    binding_string(catalog, "revision")?;
    Ok(())
}

fn validate_capability_route_bindings(routes: &[serde_json::Value]) -> Result<()> {
    if routes.len() > 64 {
        return Err(SystemServiceError::InvalidJobRequest(
            "execution_binding.capabilityRoutes exceeds 64 entries".to_string(),
        ));
    }
    let mut keys = std::collections::HashSet::new();
    let mut previous_key: Option<String> = None;
    for route in routes {
        let route = route.as_object().ok_or_else(|| {
            SystemServiceError::InvalidJobRequest(
                "execution_binding.capabilityRoutes must contain objects".to_string(),
            )
        })?;
        require_exact_keys(
            route,
            &["requirement", "source", "modelEndpoint"],
            "execution_binding.capabilityRoutes[]",
        )?;
        let source = binding_string(route, "source")?;
        if !matches!(source, "configured" | "single_candidate") {
            return Err(SystemServiceError::InvalidJobRequest(
                "capability route source is invalid".to_string(),
            ));
        }
        let requirement = binding_object(route, "requirement", "capabilityRoutes[]")?;
        require_exact_keys(
            requirement,
            &[
                "operation",
                "inputModalities",
                "outputModalities",
                "features",
            ],
            "execution_binding.capabilityRoutes[].requirement",
        )?;
        let operation = binding_string(requirement, "operation")?;
        if operation == "conversation"
            || ![
                "image.generate",
                "image.edit",
                "video.generate",
                "audio.transcribe",
                "audio.synthesize",
            ]
            .contains(&operation)
        {
            return Err(SystemServiceError::InvalidJobRequest(
                "capability route operation is invalid".to_string(),
            ));
        }
        let inputs = capability_requirement_values(
            requirement,
            "inputModalities",
            &["text", "image", "audio", "video", "document"],
        )?;
        let outputs = capability_requirement_values(
            requirement,
            "outputModalities",
            &["text", "image", "audio", "video"],
        )?;
        let features = capability_requirement_values(
            requirement,
            "features",
            &["tool_calling", "parallel_tool_calls", "reasoning"],
        )?;
        let endpoint = binding_object(route, "modelEndpoint", "capabilityRoutes[]")?;
        validate_capability_model_endpoint_binding(endpoint)?;
        validate_endpoint_supports_requirement(endpoint, operation, &inputs, &outputs, &features)?;

        let key = serde_json::to_string(&serde_json::Value::Object(requirement.clone()))?;
        if !keys.insert(key.clone()) {
            return Err(SystemServiceError::InvalidJobRequest(
                "execution_binding.capabilityRoutes contains a duplicate requirement".to_string(),
            ));
        }
        if previous_key
            .as_ref()
            .is_some_and(|previous| previous >= &key)
        {
            return Err(SystemServiceError::InvalidJobRequest(
                "execution_binding.capabilityRoutes must use canonical order".to_string(),
            ));
        }
        previous_key = Some(key);
    }
    Ok(())
}

fn capability_requirement_values(
    requirement: &serde_json::Map<String, serde_json::Value>,
    key: &str,
    allowed: &[&str],
) -> Result<Vec<String>> {
    let values = requirement
        .get(key)
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| {
            SystemServiceError::InvalidJobRequest(format!(
                "execution_binding capability requirement {key} must be an array"
            ))
        })?;
    let mut result = Vec::with_capacity(values.len());
    let mut previous_index: Option<usize> = None;
    for value in values {
        let value = value.as_str().ok_or_else(|| {
            SystemServiceError::InvalidJobRequest(format!(
                "execution_binding capability requirement {key} must contain strings"
            ))
        })?;
        let index = allowed
            .iter()
            .position(|candidate| candidate == &value)
            .ok_or_else(|| {
                SystemServiceError::InvalidJobRequest(format!(
                    "execution_binding capability requirement {key} contains an invalid value"
                ))
            })?;
        if previous_index.is_some_and(|previous| previous >= index) {
            return Err(SystemServiceError::InvalidJobRequest(format!(
                "execution_binding capability requirement {key} must use canonical order"
            )));
        }
        previous_index = Some(index);
        result.push(value.to_string());
    }
    Ok(result)
}

pub(crate) fn validate_endpoint_supports_requirement(
    endpoint: &serde_json::Map<String, serde_json::Value>,
    operation: &str,
    inputs: &[String],
    outputs: &[String],
    features: &[String],
) -> Result<()> {
    let model = binding_object(endpoint, "model", "capabilityRoutes[].modelEndpoint")?;
    if !model_values_contain(model, "operations", operation) {
        return Err(SystemServiceError::InvalidJobRequest(
            "capability route endpoint does not satisfy its requirement".to_string(),
        ));
    }
    for (key, required) in [
        ("inputModalities", inputs),
        ("outputModalities", outputs),
        ("features", features),
    ] {
        let supported = model
            .get(key)
            .and_then(serde_json::Value::as_array)
            .expect("validated model descriptor field");
        if required.iter().any(|required| {
            !supported
                .iter()
                .any(|value| value.as_str() == Some(required.as_str()))
        }) {
            return Err(SystemServiceError::InvalidJobRequest(
                "capability route endpoint does not satisfy its requirement".to_string(),
            ));
        }
    }
    Ok(())
}

fn model_values_contain(
    model: &serde_json::Map<String, serde_json::Value>,
    key: &str,
    required: &str,
) -> bool {
    model
        .get(key)
        .and_then(serde_json::Value::as_array)
        .is_some_and(|supported| {
            supported
                .iter()
                .any(|value| value.as_str() == Some(required))
        })
}

fn descriptor_strings(
    model: &serde_json::Map<String, serde_json::Value>,
    key: &str,
    allowed: &[&str],
    allow_empty: bool,
) -> Result<Vec<String>> {
    let values = model
        .get(key)
        .and_then(serde_json::Value::as_array)
        .filter(|values| allow_empty || !values.is_empty())
        .ok_or_else(|| {
            SystemServiceError::InvalidJobRequest(format!(
                "execution_binding.modelEndpoint.model.{key} must be an array"
            ))
        })?;
    let mut result = Vec::with_capacity(values.len());
    let mut previous_index: Option<usize> = None;
    for value in values {
        let value = value.as_str().ok_or_else(|| {
            SystemServiceError::InvalidJobRequest(format!(
                "execution_binding.modelEndpoint.model.{key} must contain strings"
            ))
        })?;
        let index = allowed
            .iter()
            .position(|candidate| candidate == &value)
            .ok_or_else(|| {
                SystemServiceError::InvalidJobRequest(format!(
                    "execution_binding.modelEndpoint.model.{key} contains an invalid value"
                ))
            })?;
        if previous_index.is_some_and(|previous| previous >= index) {
            return Err(SystemServiceError::InvalidJobRequest(format!(
                "execution_binding.modelEndpoint.model.{key} must use canonical order"
            )));
        }
        previous_index = Some(index);
        result.push(value.to_string());
    }
    Ok(result)
}

fn validate_model_limits(value: Option<&serde_json::Value>) -> Result<()> {
    let Some(value) = value else {
        return Ok(());
    };
    let limits = value.as_object().ok_or_else(|| {
        SystemServiceError::InvalidJobRequest("model limits must be an object".to_string())
    })?;
    require_allowed_keys(
        limits,
        &[
            "contextWindowTokens",
            "maxInputTokens",
            "maxOutputTokens",
            "maxInputResources",
        ],
        0,
        "execution_binding.modelEndpoint.model.limits",
    )?;
    for (key, value) in limits {
        if value.as_i64().is_none_or(|value| value <= 0) {
            return Err(SystemServiceError::InvalidJobRequest(format!(
                "model limit {key} must be a positive integer"
            )));
        }
    }
    Ok(())
}

fn validate_model_behavior(value: Option<&serde_json::Value>, features: &[String]) -> Result<()> {
    let Some(value) = value else {
        return Ok(());
    };
    let behavior = value.as_object().ok_or_else(|| {
        SystemServiceError::InvalidJobRequest("model behavior must be an object".to_string())
    })?;
    require_allowed_keys(
        behavior,
        &["reasoningReplay"],
        0,
        "execution_binding.modelEndpoint.model.behavior",
    )?;
    if let Some(replay) = behavior.get("reasoningReplay") {
        let replay = replay.as_str().ok_or_else(|| {
            SystemServiceError::InvalidJobRequest(
                "model reasoningReplay must be a string".to_string(),
            )
        })?;
        if !matches!(replay, "optional" | "required" | "forbidden") {
            return Err(SystemServiceError::InvalidJobRequest(
                "model reasoningReplay is invalid".to_string(),
            ));
        }
        if !features.iter().any(|value| value == "reasoning") {
            return Err(SystemServiceError::InvalidJobRequest(
                "model reasoningReplay requires reasoning".to_string(),
            ));
        }
    }
    Ok(())
}

fn binding_object<'a>(
    object: &'a serde_json::Map<String, serde_json::Value>,
    key: &str,
    owner: &str,
) -> Result<&'a serde_json::Map<String, serde_json::Value>> {
    object
        .get(key)
        .and_then(serde_json::Value::as_object)
        .ok_or_else(|| {
            SystemServiceError::InvalidJobRequest(format!(
                "execution_binding.{owner}.{key} must be an object"
            ))
        })
}

fn validate_optional_binding_string(
    object: &serde_json::Map<String, serde_json::Value>,
    key: &str,
    owner: &str,
) -> Result<()> {
    if object.contains_key(key) {
        object
            .get(key)
            .and_then(serde_json::Value::as_str)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| {
                SystemServiceError::InvalidJobRequest(format!(
                    "execution_binding.{owner}.{key} must be a non-empty string"
                ))
            })?;
    }
    Ok(())
}

fn require_exact_keys(
    object: &serde_json::Map<String, serde_json::Value>,
    allowed: &[&str],
    owner: &str,
) -> Result<()> {
    if object.len() != allowed.len() || object.keys().any(|key| !allowed.contains(&key.as_str())) {
        return Err(SystemServiceError::InvalidJobRequest(format!(
            "{owner} contains missing or unknown fields"
        )));
    }
    Ok(())
}

fn require_allowed_keys(
    object: &serde_json::Map<String, serde_json::Value>,
    allowed: &[&str],
    minimum: usize,
    owner: &str,
) -> Result<()> {
    if object.len() < minimum || object.keys().any(|key| !allowed.contains(&key.as_str())) {
        return Err(SystemServiceError::InvalidJobRequest(format!(
            "{owner} contains missing or unknown fields"
        )));
    }
    Ok(())
}

pub(crate) fn validate_resource_bindings(resources: &[serde_json::Value]) -> Result<()> {
    let mut resource_ids = std::collections::HashSet::new();
    for resource in resources {
        let object = resource.as_object().ok_or_else(|| {
            SystemServiceError::InvalidJobRequest(
                "execution_binding.resources must contain objects".to_string(),
            )
        })?;
        let allowed_keys = ["resourceId", "sha256", "sizeBytes", "kind", "mediaType"];
        if object
            .keys()
            .any(|key| !allowed_keys.contains(&key.as_str()))
            || !(4..=5).contains(&object.len())
        {
            return Err(SystemServiceError::InvalidJobRequest(
                "execution_binding resource contains missing or unknown fields".to_string(),
            ));
        }
        let resource_id = binding_string(object, "resourceId")?;
        if !resource_ids.insert(resource_id.to_string()) {
            return Err(SystemServiceError::InvalidJobRequest(
                "execution_binding resources contain a duplicate resourceId".to_string(),
            ));
        }
        validate_sha256(
            binding_string(object, "sha256")?,
            "execution_binding.resources.sha256",
        )?;
        if object
            .get("sizeBytes")
            .and_then(serde_json::Value::as_i64)
            .is_none_or(|value| value <= 0)
        {
            return Err(SystemServiceError::InvalidJobRequest(
                "execution_binding.resources.sizeBytes must be a positive integer".to_string(),
            ));
        }
        if !matches!(
            binding_string(object, "kind")?,
            "file"
                | "image"
                | "video"
                | "audio"
                | "document"
                | "artifact"
                | "log"
                | "patch"
                | "url"
        ) {
            return Err(SystemServiceError::InvalidJobRequest(
                "execution_binding.resources.kind is invalid".to_string(),
            ));
        }
        if let Some(media_type) = object.get("mediaType") {
            if media_type.as_str().is_none_or(str::is_empty) {
                return Err(SystemServiceError::InvalidJobRequest(
                    "execution_binding.resources.mediaType must be a non-empty string".to_string(),
                ));
            }
        }
    }
    Ok(())
}

fn binding_string<'a>(
    object: &'a serde_json::Map<String, serde_json::Value>,
    key: &str,
) -> Result<&'a str> {
    object
        .get(key)
        .and_then(serde_json::Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            SystemServiceError::InvalidJobRequest(format!(
                "execution_binding.{key} must be a non-empty string"
            ))
        })
}

pub(crate) fn validate_sha256(value: &str, label: &str) -> Result<()> {
    if value.len() != 64
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(SystemServiceError::InvalidJobRequest(format!(
            "{label} must be a lowercase sha256 digest"
        )));
    }
    Ok(())
}

fn normalize_session_title(title: &str) -> Result<String> {
    let normalized = title.trim();
    if normalized.is_empty() {
        return Err(SystemServiceError::InvalidInput(
            "session title must not be empty".to_string(),
        ));
    }
    if normalized.chars().count() > 200 {
        return Err(SystemServiceError::InvalidInput(
            "session title must not exceed 200 characters".to_string(),
        ));
    }
    Ok(normalized.to_string())
}

fn validate_session_revision(session_id: &str, expected_revision: i64) -> Result<()> {
    if session_id.is_empty() {
        return Err(SystemServiceError::InvalidInput(
            "session_id must not be empty".to_string(),
        ));
    }
    if expected_revision <= 0 {
        return Err(SystemServiceError::InvalidInput(
            "expected_revision must be positive".to_string(),
        ));
    }
    Ok(())
}

fn require_session_tx(tx: &rusqlite::Transaction<'_>, session_id: &str) -> Result<SessionRecord> {
    tx.query_row(
        &format!("{SESSION_SELECT} WHERE id = ?"),
        params![session_id],
        row_to_session,
    )
    .optional()?
    .ok_or_else(|| SystemServiceError::NotFound(format!("session does not exist: {session_id}")))
}

fn require_active_session_tx(
    tx: &rusqlite::Transaction<'_>,
    session_id: &str,
) -> Result<SessionRecord> {
    let session = require_session_tx(tx, session_id)?;
    if session.status != "active" {
        return Err(SystemServiceError::Conflict(format!(
            "session is archived: {session_id}"
        )));
    }
    Ok(session)
}

fn require_session_revision(session: &SessionRecord, expected_revision: i64) -> Result<()> {
    if session.revision != expected_revision {
        return Err(session_revision_conflict(&session.id, expected_revision));
    }
    Ok(())
}

fn session_revision_conflict(session_id: &str, expected_revision: i64) -> SystemServiceError {
    SystemServiceError::Conflict(format!(
        "session revision changed: {session_id} expected {expected_revision}"
    ))
}

pub(crate) fn session_has_unfinished_work_tx(
    tx: &rusqlite::Transaction<'_>,
    session_id: &str,
) -> Result<bool> {
    let unfinished: i64 = tx.query_row(
        "SELECT
           EXISTS(
             SELECT 1 FROM session_input
             WHERE session_id = ?
               AND status IN ('admitted', 'control_pending', 'promoted')
           )
           OR EXISTS(
             SELECT 1 FROM session_turn
             WHERE session_id = ?
               AND state IN ('queued', 'running', 'cancel_requested')
           )",
        params![session_id, session_id],
        |row| row.get(0),
    )?;
    Ok(unfinished != 0)
}

fn touch_session_activity_tx(
    tx: &rusqlite::Transaction<'_>,
    session_id: &str,
    now: i64,
) -> Result<()> {
    let updated = tx.execute(
        "UPDATE session SET updated_at = ? WHERE id = ? AND status = 'active'",
        params![now, session_id],
    )?;
    if updated != 1 {
        return Err(SystemServiceError::Conflict(format!(
            "session is not active: {session_id}"
        )));
    }
    Ok(())
}

fn append_session_state_event_tx(
    tx: &rusqlite::Transaction<'_>,
    request: &SessionStateTransition,
    event_type: &str,
    status: &str,
    now: i64,
) -> Result<()> {
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        event_type,
        &EventScope {
            session_id: Some(request.session_id.clone()),
            ..EventScope::default()
        },
        &serde_json::json!({
            "sessionId": request.session_id,
            "status": status,
            "revision": request.expected_revision + 1
        }),
        now,
    )
}

fn validate_submit_session_turn(request: &SubmitSessionTurn) -> Result<()> {
    validate_session_identity(
        &request.session_id,
        &request.principal_id,
        &request.idempotency_key,
    )?;
    if request.max_steps.unwrap_or(32) <= 0 {
        return Err(SystemServiceError::InvalidJobRequest(
            "max_steps must be positive".to_string(),
        ));
    }
    validate_turn_admission_policy(request)?;
    execution_binding_digest(&request.execution_binding)?;
    Ok(())
}

fn validate_turn_admission_policy(request: &SubmitSessionTurn) -> Result<()> {
    let intent = request.intent.as_deref().unwrap_or("normal");
    match (
        intent,
        request.run_control_policy.as_deref(),
        request.expected_turn_id.as_deref(),
    ) {
        ("normal", None, None) => Ok(()),
        ("follow_up", Some("queue_after_current"), Some(expected_turn_id))
            if !expected_turn_id.is_empty() =>
        {
            Ok(())
        }
        ("follow_up", _, _) => Err(SystemServiceError::InvalidJobRequest(
            "follow_up requires queue_after_current and a non-empty expected_turn_id".to_string(),
        )),
        _ => Err(SystemServiceError::InvalidJobRequest(
            "session turn admission supports only normal or follow_up intent with matching policy"
                .to_string(),
        )),
    }
}

fn require_follow_up_head_tx(
    tx: &rusqlite::Transaction<'_>,
    request: &SubmitSessionTurn,
    intent: &str,
) -> Result<()> {
    if intent != "follow_up" {
        return Ok(());
    }
    let expected_turn_id = request.expected_turn_id.as_deref().ok_or_else(|| {
        SystemServiceError::Invariant("validated follow_up is missing expected_turn_id".to_string())
    })?;
    let head: Option<String> = tx
        .query_row(
            "SELECT id
             FROM session_turn
             WHERE session_id = ?
               AND state IN ('queued', 'running', 'cancel_requested')
             ORDER BY CASE
                        WHEN state IN ('running', 'cancel_requested') THEN 0
                        ELSE 1
                      END,
                      created_at ASC,
                      id ASC
             LIMIT 1",
            params![request.session_id],
            |row| row.get(0),
        )
        .optional()?;
    if head.as_deref() != Some(expected_turn_id) {
        return Err(SystemServiceError::Conflict(format!(
            "follow_up expected turn is not the current session head: {} expected {}",
            request.session_id, expected_turn_id
        )));
    }
    Ok(())
}

fn validate_admit_session_input(request: &AdmitSessionInput) -> Result<()> {
    validate_session_identity(
        &request.session_id,
        &request.principal_id,
        &request.idempotency_key,
    )
}

fn validate_session_identity(
    session_id: &str,
    principal_id: &str,
    idempotency_key: &str,
) -> Result<()> {
    if session_id.is_empty() || principal_id.is_empty() || idempotency_key.is_empty() {
        return Err(SystemServiceError::InvalidJobRequest(
            "session_id, principal_id, and idempotency_key must not be empty".to_string(),
        ));
    }
    Ok(())
}

fn validate_list_sessions(request: &ListSessions) -> Result<()> {
    if request.limit == Some(0) {
        return Err(SystemServiceError::InvalidInput(
            "session list limit must be positive".to_string(),
        ));
    }
    validate_session_scope(request.scope.as_ref())?;
    if let Some(before) = &request.before {
        if before.updated_at < 0 || before.session_id.is_empty() {
            return Err(SystemServiceError::InvalidInput(
                "session page cursor is invalid".to_string(),
            ));
        }
    }
    Ok(())
}

fn validate_session_scope(scope: Option<&SessionScope>) -> Result<()> {
    let Some(scope) = scope else {
        return Ok(());
    };
    if scope.kind.is_empty()
        || scope.kind.chars().count() > 128
        || scope.id.is_empty()
        || scope.id.chars().count() > 512
    {
        return Err(SystemServiceError::InvalidInput(
            "session scope kind/id must contain 1 to 128/512 characters".to_string(),
        ));
    }
    Ok(())
}

fn collect_rows<T>(rows: impl Iterator<Item = rusqlite::Result<T>>) -> Result<Vec<T>> {
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}
