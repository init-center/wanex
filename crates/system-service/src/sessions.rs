use crate::event_store::append_event_tx;
use crate::rows::{row_to_session, row_to_session_input};
use crate::{
    AdmissionReceipt, AdmitSessionInput, EnqueueJob, EventScope, ListSessions, Result,
    SchedulerJobKind, SessionInputRecord, SessionRecord, SubmitSessionRun, SubmitSessionRunReceipt,
    SystemService, SystemServiceError,
};
use rusqlite::{params, params_from_iter, types::Value as SqlValue, OptionalExtension};
use uuid::Uuid;

impl SystemService {
    pub fn create_session(
        &self,
        id: Option<&str>,
        title: Option<&str>,
        kind: Option<&str>,
    ) -> Result<SessionRecord> {
        let now = crate::util::now_ms();
        let id = id
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| format!("ses_{}", Uuid::now_v7()));
        let kind = kind.unwrap_or("chat");
        let mut conn = self.connect()?;
        let tx = conn.transaction()?;
        tx.execute(
            "INSERT INTO session (id, title, kind, status, created_at, updated_at, archived_at)
             VALUES (?, ?, ?, 'active', ?, ?, NULL)",
            params![id, title, kind, now, now],
        )?;
        append_event_tx(
            &tx,
            &format!("evt_{}", Uuid::now_v7()),
            "session.created",
            &EventScope {
                session_id: Some(id.clone()),
                run_id: None,
                input_id: None,
                message_id: None,
                resource_id: None,
                ..EventScope::default()
            },
            &serde_json::json!({
                "sessionId": id,
                "kind": kind,
                "status": "active"
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
            "SELECT id, title, kind, status, created_at, updated_at, archived_at
             FROM session WHERE id = ?",
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
        values.push(SqlValue::Integer(limit));

        let where_clause = if clauses.is_empty() {
            String::new()
        } else {
            format!(" WHERE {}", clauses.join(" AND "))
        };
        let sql = format!(
            "SELECT id, title, kind, status, created_at, updated_at, archived_at
             FROM session{where_clause}
             ORDER BY updated_at DESC, id ASC LIMIT ?"
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(params_from_iter(values), row_to_session)?;
        collect_sessions(rows)
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
        let tx = conn.transaction()?;
        tx.execute(
            "INSERT OR IGNORE INTO session_input (
                id, session_id, principal_id, idempotency_key, input_type,
                content_json, origin_json, intent, run_control_policy,
                expected_run_id, status, created_at, updated_at
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
        let existing_id: String = tx.query_row(
            "SELECT id FROM session_input WHERE session_id = ? AND idempotency_key = ?",
            params![request.session_id, request.idempotency_key],
            |row| row.get(0),
        )?;
        if existing_id == input_id {
            append_event_tx(
                &tx,
                &format!("evt_{}", Uuid::now_v7()),
                "session.input.admitted",
                &EventScope {
                    session_id: Some(request.session_id.clone()),
                    run_id: None,
                    input_id: Some(existing_id.clone()),
                    message_id: None,
                    resource_id: None,
                    ..EventScope::default()
                },
                &serde_json::json!({
                    "inputId": existing_id,
                    "principalId": request.principal_id,
                    "inputType": input_type,
                    "intent": intent,
                    "status": "admitted"
                }),
                now,
            )?;
        }
        tx.commit()?;
        Ok(AdmissionReceipt {
            input_id: existing_id,
            session_id: request.session_id.clone(),
            durability: "local-durable".to_string(),
            status: "admitted".to_string(),
        })
    }

    pub fn submit_session_run(
        &self,
        request: &SubmitSessionRun,
    ) -> Result<SubmitSessionRunReceipt> {
        validate_submit_session_run(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = conn.transaction()?;
        let receipt = submit_session_run_tx(&tx, request, now)?;
        tx.commit()?;
        Ok(receipt)
    }

    pub fn list_session_inputs(&self, session_id: &str) -> Result<Vec<SessionInputRecord>> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare(
            "SELECT id, session_id, principal_id, idempotency_key, input_type,
                    content_json, origin_json, intent, run_control_policy,
                    expected_run_id, status, created_at, updated_at
             FROM session_input
             WHERE session_id = ?
             ORDER BY created_at ASC, id ASC",
        )?;
        let rows = stmt.query_map(params![session_id], row_to_session_input)?;
        let mut inputs = Vec::new();
        for row in rows {
            inputs.push(row?);
        }
        Ok(inputs)
    }
}

pub(crate) fn submit_session_run_tx(
    tx: &rusqlite::Transaction<'_>,
    request: &SubmitSessionRun,
    now: i64,
) -> Result<SubmitSessionRunReceipt> {
    validate_submit_session_run(request)?;
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

    tx.execute(
        "INSERT OR IGNORE INTO session_input (
            id, session_id, principal_id, idempotency_key, input_type,
            content_json, origin_json, intent, run_control_policy,
            expected_run_id, status, created_at, updated_at
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
            request.expected_run_id.as_deref(),
            now,
            now
        ],
    )?;
    let existing_input_id: String = tx.query_row(
        "SELECT id FROM session_input WHERE session_id = ? AND idempotency_key = ?",
        params![request.session_id, request.idempotency_key],
        |row| row.get(0),
    )?;

    if existing_input_id == input_id {
        append_event_tx(
            tx,
            &format!("evt_{}", Uuid::now_v7()),
            "session.input.admitted",
            &EventScope {
                session_id: Some(request.session_id.clone()),
                run_id: None,
                input_id: Some(existing_input_id.clone()),
                message_id: None,
                resource_id: None,
                ..EventScope::default()
            },
            &serde_json::json!({
                "inputId": existing_input_id,
                "principalId": request.principal_id,
                "inputType": input_type,
                "intent": intent,
                "runControlPolicy": request.run_control_policy,
                "expectedRunId": request.expected_run_id,
                "status": "admitted"
            }),
            now,
        )?;
    }

    let mode = request.mode.as_deref().unwrap_or("once");
    let job_idempotency_key = request
        .job_idempotency_key
        .clone()
        .unwrap_or_else(|| format!("session.run:{}:{}", request.session_id, existing_input_id));
    let mut payload = serde_json::json!({
        "sessionId": request.session_id,
        "mode": mode
    });
    if let Some(max_steps) = request.max_steps {
        payload["maxSteps"] = serde_json::json!(max_steps);
    }
    if let Some(provider_profile_id) = &request.provider_profile_id {
        payload["providerProfileId"] = serde_json::json!(provider_profile_id);
    }

    let job = crate::scheduler::enqueue_job_tx(
        tx,
        &EnqueueJob {
            id: request.job_id.clone(),
            kind: SchedulerJobKind::SessionRun,
            principal_id: request.principal_id.clone(),
            payload,
            scheduled_at: request.scheduled_at,
            not_before: request.not_before,
            priority: request.priority,
            max_attempts: request.max_attempts,
            retry_policy: request.retry_policy.clone(),
            idempotency_key: Some(job_idempotency_key),
            budget_grant_id: request.budget_grant_id.clone(),
        },
        now,
    )?;

    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        "session.run.submitted",
        &EventScope {
            session_id: Some(request.session_id.clone()),
            run_id: None,
            input_id: Some(existing_input_id.clone()),
            message_id: None,
            resource_id: None,
            ..EventScope::default()
        },
        &serde_json::json!({
            "inputId": existing_input_id,
            "jobId": job.id,
            "mode": mode
        }),
        now,
    )?;

    Ok(SubmitSessionRunReceipt {
        admission: AdmissionReceipt {
            input_id: existing_input_id,
            session_id: request.session_id.clone(),
            durability: "local-durable".to_string(),
            status: "admitted".to_string(),
        },
        job,
    })
}

fn validate_submit_session_run(request: &SubmitSessionRun) -> Result<()> {
    if request.session_id.is_empty() {
        return Err(SystemServiceError::InvalidJobRequest(
            "session_id must not be empty".to_string(),
        ));
    }
    if request.principal_id.is_empty() {
        return Err(SystemServiceError::InvalidJobRequest(
            "principal_id must not be empty".to_string(),
        ));
    }
    if request.idempotency_key.is_empty() {
        return Err(SystemServiceError::InvalidJobRequest(
            "idempotency_key must not be empty".to_string(),
        ));
    }
    if request
        .mode
        .as_deref()
        .is_some_and(|mode| mode != "once" && mode != "to_completion")
    {
        return Err(SystemServiceError::InvalidJobRequest(
            "mode must be once or to_completion".to_string(),
        ));
    }
    if request.max_steps.is_some_and(|max_steps| max_steps <= 0) {
        return Err(SystemServiceError::InvalidJobRequest(
            "max_steps must be positive".to_string(),
        ));
    }
    if request
        .provider_profile_id
        .as_deref()
        .is_some_and(str::is_empty)
    {
        return Err(SystemServiceError::InvalidJobRequest(
            "provider_profile_id must not be empty".to_string(),
        ));
    }
    validate_input_type(request.input_type.as_deref().unwrap_or("user"))?;
    validate_queue_input_intent(request.intent.as_deref().unwrap_or("normal"))?;
    if let Some(policy) = request.run_control_policy.as_deref() {
        validate_run_control_policy(policy)?;
        if policy != "queue_after_current" {
            return Err(SystemServiceError::InvalidJobRequest(
                "submit_session_run only supports queue_after_current policy".to_string(),
            ));
        }
    }
    Ok(())
}

fn validate_admit_session_input(request: &AdmitSessionInput) -> Result<()> {
    if request.session_id.is_empty() {
        return Err(SystemServiceError::InvalidJobRequest(
            "session_id must not be empty".to_string(),
        ));
    }
    if request.principal_id.is_empty() {
        return Err(SystemServiceError::InvalidJobRequest(
            "principal_id must not be empty".to_string(),
        ));
    }
    if request.idempotency_key.is_empty() {
        return Err(SystemServiceError::InvalidJobRequest(
            "idempotency_key must not be empty".to_string(),
        ));
    }
    validate_input_type(request.input_type.as_deref().unwrap_or("user"))?;
    validate_queue_input_intent(request.intent.as_deref().unwrap_or("normal"))?;
    Ok(())
}

pub(crate) fn validate_input_type(input_type: &str) -> Result<()> {
    if input_type != "user" && input_type != "system" {
        return Err(SystemServiceError::InvalidJobRequest(
            "input_type must be user or system".to_string(),
        ));
    }
    Ok(())
}

pub(crate) fn validate_queue_input_intent(intent: &str) -> Result<()> {
    validate_session_input_intent(intent)?;
    if intent == "steer" || intent == "interrupt" {
        return Err(SystemServiceError::InvalidJobRequest(
            "steer and interrupt must use dedicated run-control APIs".to_string(),
        ));
    }
    Ok(())
}

pub(crate) fn validate_session_input_intent(intent: &str) -> Result<()> {
    if !matches!(intent, "normal" | "follow_up" | "steer" | "interrupt") {
        return Err(SystemServiceError::InvalidJobRequest(
            "intent must be normal, follow_up, steer, or interrupt".to_string(),
        ));
    }
    Ok(())
}

pub(crate) fn validate_run_control_policy(policy: &str) -> Result<()> {
    if !matches!(
        policy,
        "queue_after_current" | "abort_current_then_run" | "steer_at_safe_point"
    ) {
        return Err(SystemServiceError::InvalidJobRequest(
            "run_control_policy must be queue_after_current, abort_current_then_run, or steer_at_safe_point"
                .to_string(),
        ));
    }
    Ok(())
}

fn collect_sessions<I>(rows: I) -> Result<Vec<SessionRecord>>
where
    I: IntoIterator<Item = rusqlite::Result<SessionRecord>>,
{
    let mut sessions = Vec::new();
    for row in rows {
        sessions.push(row?);
    }
    Ok(sessions)
}

fn validate_list_sessions(request: &ListSessions) -> Result<()> {
    if request
        .kind
        .as_deref()
        .is_some_and(|kind| kind != "chat" && kind != "agent")
    {
        return Err(SystemServiceError::InvalidJobRequest(
            "session kind must be chat or agent".to_string(),
        ));
    }
    if request
        .status
        .as_deref()
        .is_some_and(|status| status != "active" && status != "archived")
    {
        return Err(SystemServiceError::InvalidJobRequest(
            "session status must be active or archived".to_string(),
        ));
    }
    if request.limit == Some(0) {
        return Err(SystemServiceError::InvalidJobRequest(
            "session list limit must be positive".to_string(),
        ));
    }
    Ok(())
}
