use crate::event_store::append_event_tx;
use crate::rows::row_to_session_run_control;
use crate::{
    ApplySessionRunControl, ApplySessionRunControlReceipt, EventScope, InterruptSessionRun,
    InterruptSessionRunReceipt, ListSessionRunControls, Result, SessionRunControlRecord,
    SteerSessionRun, SteerSessionRunReceipt, SystemService, SystemServiceError,
};
use rusqlite::{params, OptionalExtension};
use serde_json::Value;
use uuid::Uuid;

impl SystemService {
    pub fn interrupt_session_run(
        &self,
        request: &InterruptSessionRun,
    ) -> Result<InterruptSessionRunReceipt> {
        validate_interrupt_session_run(request)?;
        let now = crate::util::now_ms();
        let idempotency_key = request
            .idempotency_key
            .clone()
            .unwrap_or_else(|| format!("interrupt:{}:{}", request.session_id, request.run_id));
        let mut conn = self.connect()?;
        let tx = conn.transaction()?;

        if let Some(existing) =
            get_run_control_by_idempotency_key(&tx, &request.session_id, &idempotency_key)?
        {
            ensure_existing_run_control_matches(&existing, "interrupt", &request.run_id)?;
            tx.commit()?;
            return Ok(InterruptSessionRunReceipt {
                session_id: existing.session_id,
                run_id: existing.run_id,
                durability: "local-durable".to_string(),
                status: "interrupt_requested".to_string(),
                accepted_at: Some(existing.created_at),
            });
        }

        let Some(active_run) = get_active_run_tx(&tx, &request.session_id, &request.run_id, now)?
        else {
            tx.commit()?;
            return Ok(InterruptSessionRunReceipt {
                session_id: request.session_id.clone(),
                run_id: request.run_id.clone(),
                durability: "local-durable".to_string(),
                status: "not_running".to_string(),
                accepted_at: None,
            });
        };

        let control_id = format!("rctl_{}", Uuid::now_v7());
        let origin_json = optional_json_string(&request.origin)?;
        let metadata_json = optional_json_string(&request.metadata)?;
        tx.execute(
            "INSERT INTO session_run_control (
                id, session_id, run_id, input_id, principal_id, idempotency_key,
                kind, status, content_json, reason, origin_json, provider_profile_id,
                metadata_json, created_at, updated_at, applied_at
             ) VALUES (?, ?, ?, NULL, ?, ?, 'interrupt', 'pending', NULL, ?, ?, NULL, ?, ?, ?, NULL)",
            params![
                control_id,
                request.session_id,
                active_run.run_id,
                request.principal_id,
                idempotency_key,
                request.reason,
                origin_json,
                metadata_json,
                now,
                now
            ],
        )?;
        append_event_tx(
            &tx,
            &format!("evt_{}", Uuid::now_v7()),
            "session.run.interrupt_requested",
            &EventScope {
                session_id: Some(request.session_id.clone()),
                run_id: Some(active_run.run_id.clone()),
                input_id: Some(active_run.input_id),
                message_id: None,
                resource_id: None,
                ..EventScope::default()
            },
            &serde_json::json!({
                "runId": active_run.run_id,
                "principalId": request.principal_id,
                "reason": request.reason,
                "status": "pending"
            }),
            now,
        )?;
        tx.commit()?;

        Ok(InterruptSessionRunReceipt {
            session_id: request.session_id.clone(),
            run_id: request.run_id.clone(),
            durability: "local-durable".to_string(),
            status: "interrupt_requested".to_string(),
            accepted_at: Some(now),
        })
    }

    pub fn steer_session_run(&self, request: &SteerSessionRun) -> Result<SteerSessionRunReceipt> {
        validate_steer_session_run(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = conn.transaction()?;

        if let Some(existing) =
            get_run_control_by_idempotency_key(&tx, &request.session_id, &request.idempotency_key)?
        {
            ensure_existing_run_control_matches(&existing, "steer", &request.expected_run_id)?;
            tx.commit()?;
            return Ok(SteerSessionRunReceipt {
                session_id: existing.session_id,
                run_id: existing.run_id,
                durability: "local-durable".to_string(),
                status: "accepted".to_string(),
                accepted_at: Some(existing.created_at),
            });
        }

        let Some(active_run) =
            get_active_run_tx(&tx, &request.session_id, &request.expected_run_id, now)?
        else {
            append_steer_rejected_tx(
                &tx,
                request,
                "expected_run_not_active",
                "expected_run_id is not the active steerable run",
                now,
            )?;
            tx.commit()?;
            return Err(SystemServiceError::InvalidJobRequest(
                "expected_run_id is not the active steerable run".to_string(),
            ));
        };

        let input_id = format!("inp_{}", Uuid::now_v7());
        let input_idempotency_key = format!("run_control:steer:{}", request.idempotency_key);
        let origin_json = optional_json_string(&request.origin)?;
        let metadata_json = optional_json_string(&request.metadata)?;
        let content_json = serde_json::to_string(&request.content)?;
        tx.execute(
            "INSERT INTO session_input (
                id, session_id, principal_id, idempotency_key, input_type,
                content_json, origin_json, intent, run_control_policy,
                expected_run_id, status, created_at, updated_at
             ) VALUES (?, ?, ?, ?, 'user', ?, ?, 'steer', 'steer_at_safe_point', ?, 'control_pending', ?, ?)",
            params![
                input_id,
                request.session_id,
                request.principal_id,
                input_idempotency_key,
                content_json,
                origin_json,
                active_run.run_id,
                now,
                now
            ],
        )?;

        let control_id = format!("rctl_{}", Uuid::now_v7());
        tx.execute(
            "INSERT INTO session_run_control (
                id, session_id, run_id, input_id, principal_id, idempotency_key,
                kind, status, content_json, reason, origin_json, provider_profile_id,
                metadata_json, created_at, updated_at, applied_at
             ) VALUES (?, ?, ?, ?, ?, ?, 'steer', 'pending', ?, NULL, ?, ?, ?, ?, ?, NULL)",
            params![
                control_id,
                request.session_id,
                active_run.run_id,
                input_id,
                request.principal_id,
                request.idempotency_key,
                serde_json::to_string(&request.content)?,
                optional_json_string(&request.origin)?,
                request.provider_profile_id,
                metadata_json,
                now,
                now
            ],
        )?;
        append_event_tx(
            &tx,
            &format!("evt_{}", Uuid::now_v7()),
            "session.run.steer_admitted",
            &EventScope {
                session_id: Some(request.session_id.clone()),
                run_id: Some(active_run.run_id.clone()),
                input_id: Some(input_id),
                message_id: None,
                resource_id: None,
                ..EventScope::default()
            },
            &serde_json::json!({
                "runId": active_run.run_id,
                "principalId": request.principal_id,
                "status": "pending"
            }),
            now,
        )?;
        tx.commit()?;

        Ok(SteerSessionRunReceipt {
            session_id: request.session_id.clone(),
            run_id: request.expected_run_id.clone(),
            durability: "local-durable".to_string(),
            status: "accepted".to_string(),
            accepted_at: Some(now),
        })
    }

    pub fn list_session_run_controls(
        &self,
        request: &ListSessionRunControls,
    ) -> Result<Vec<SessionRunControlRecord>> {
        validate_list_session_run_controls(request)?;
        let conn = self.connect()?;
        let limit = request.limit.unwrap_or(100).min(1000);
        let mut stmt = conn.prepare(
            "SELECT id, session_id, run_id, input_id, principal_id, idempotency_key,
                    kind, status, content_json, reason, origin_json, provider_profile_id,
                    metadata_json, created_at, updated_at, applied_at
             FROM session_run_control
             WHERE session_id = ?
               AND (? IS NULL OR run_id = ?)
               AND (? IS NULL OR kind = ?)
               AND (? IS NULL OR status = ?)
             ORDER BY created_at ASC, id ASC
             LIMIT ?",
        )?;
        let rows = stmt.query_map(
            params![
                request.session_id,
                request.run_id,
                request.run_id,
                request.kind,
                request.kind,
                request.status,
                request.status,
                limit
            ],
            row_to_session_run_control,
        )?;
        let mut controls = Vec::new();
        for row in rows {
            controls.push(row?);
        }
        Ok(controls)
    }

    pub fn apply_session_run_control(
        &self,
        request: &ApplySessionRunControl,
    ) -> Result<Option<ApplySessionRunControlReceipt>> {
        validate_apply_session_run_control(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = conn.transaction()?;

        let Some(existing) = get_run_control_by_id(&tx, &request.session_id, &request.control_id)?
        else {
            tx.commit()?;
            return Ok(None);
        };
        if existing.run_id != request.run_id {
            return Err(SystemServiceError::InvalidJobRequest(
                "run-control run_id does not match request".to_string(),
            ));
        }
        if existing.status != "pending" {
            tx.commit()?;
            return Ok(Some(ApplySessionRunControlReceipt {
                control: existing,
                effect: "already_resolved".to_string(),
            }));
        }

        let Some(lease) = get_active_lease_tx(
            &tx,
            &request.session_id,
            &request.run_id,
            &request.runner_id,
            &request.lease_token,
            now,
        )?
        else {
            tx.commit()?;
            return Ok(None);
        };

        let effect = match existing.kind.as_str() {
            "interrupt" => {
                apply_interrupt_run_control_tx(&tx, &existing, &lease, now)?;
                "interrupt_cancelled_run"
            }
            "steer" => {
                apply_steer_run_control_tx(&tx, &existing, &lease, now)?;
                "steer_completed_input"
            }
            _ => {
                return Err(SystemServiceError::Invariant(format!(
                    "unknown run-control kind: {}",
                    existing.kind
                )))
            }
        };
        let Some(control) = get_run_control_by_id(&tx, &request.session_id, &request.control_id)?
        else {
            return Err(SystemServiceError::Invariant(
                "applied run-control record disappeared".to_string(),
            ));
        };
        tx.commit()?;
        Ok(Some(ApplySessionRunControlReceipt {
            control,
            effect: effect.to_string(),
        }))
    }
}

#[derive(Debug, Clone)]
struct ActiveRun {
    run_id: String,
    input_id: String,
}

#[derive(Debug, Clone)]
struct ActiveLease {
    session_id: String,
    run_id: String,
    input_id: String,
    runner_id: String,
    lease_token: String,
}

fn get_active_run_tx(
    tx: &rusqlite::Transaction<'_>,
    session_id: &str,
    run_id: &str,
    now: i64,
) -> Result<Option<ActiveRun>> {
    tx.query_row(
        "SELECT r.id, r.input_id
         FROM session_run r
         INNER JOIN session_runner_lease l
           ON l.session_id = r.session_id
          AND l.run_id = r.id
          AND l.input_id = r.input_id
         WHERE r.session_id = ?
           AND r.id = ?
           AND r.status = 'running'
           AND l.expires_at > ?",
        params![session_id, run_id, now],
        |row| {
            Ok(ActiveRun {
                run_id: row.get(0)?,
                input_id: row.get(1)?,
            })
        },
    )
    .optional()
    .map_err(Into::into)
}

fn get_active_lease_tx(
    tx: &rusqlite::Transaction<'_>,
    session_id: &str,
    run_id: &str,
    runner_id: &str,
    lease_token: &str,
    now: i64,
) -> Result<Option<ActiveLease>> {
    tx.query_row(
        "SELECT session_id, run_id, input_id, runner_id, lease_token
         FROM session_runner_lease
         WHERE session_id = ?
           AND run_id = ?
           AND runner_id = ?
           AND lease_token = ?
           AND expires_at > ?",
        params![session_id, run_id, runner_id, lease_token, now],
        |row| {
            Ok(ActiveLease {
                session_id: row.get(0)?,
                run_id: row.get(1)?,
                input_id: row.get(2)?,
                runner_id: row.get(3)?,
                lease_token: row.get(4)?,
            })
        },
    )
    .optional()
    .map_err(Into::into)
}

fn get_run_control_by_id(
    tx: &rusqlite::Transaction<'_>,
    session_id: &str,
    control_id: &str,
) -> Result<Option<SessionRunControlRecord>> {
    tx.query_row(
        "SELECT id, session_id, run_id, input_id, principal_id, idempotency_key,
                kind, status, content_json, reason, origin_json, provider_profile_id,
                metadata_json, created_at, updated_at, applied_at
         FROM session_run_control
         WHERE session_id = ? AND id = ?",
        params![session_id, control_id],
        row_to_session_run_control,
    )
    .optional()
    .map_err(Into::into)
}

fn get_run_control_by_idempotency_key(
    tx: &rusqlite::Transaction<'_>,
    session_id: &str,
    idempotency_key: &str,
) -> Result<Option<SessionRunControlRecord>> {
    tx.query_row(
        "SELECT id, session_id, run_id, input_id, principal_id, idempotency_key,
                kind, status, content_json, reason, origin_json, provider_profile_id,
                metadata_json, created_at, updated_at, applied_at
         FROM session_run_control
         WHERE session_id = ? AND idempotency_key = ?",
        params![session_id, idempotency_key],
        row_to_session_run_control,
    )
    .optional()
    .map_err(Into::into)
}

fn apply_interrupt_run_control_tx(
    tx: &rusqlite::Transaction<'_>,
    control: &SessionRunControlRecord,
    lease: &ActiveLease,
    now: i64,
) -> Result<()> {
    let reason = control
        .reason
        .clone()
        .unwrap_or_else(|| "interrupt requested".to_string());
    let updated_control = tx.execute(
        "UPDATE session_run_control
         SET status = 'applied', updated_at = ?, applied_at = ?
         WHERE id = ? AND session_id = ? AND status = 'pending'",
        params![now, now, control.id, control.session_id],
    )?;
    if updated_control == 0 {
        return Err(SystemServiceError::Invariant(
            "interrupt apply could not mark control applied".to_string(),
        ));
    }
    cancel_pending_run_controls_for_terminal_run_tx(
        tx,
        &control.session_id,
        &control.run_id,
        now,
        Some(&control.id),
    )?;
    let updated_run = tx.execute(
        "UPDATE session_run
         SET status = 'cancelled', updated_at = ?, finished_at = ?, error_json = ?
         WHERE id = ? AND session_id = ? AND status = 'running'",
        params![
            now,
            now,
            serde_json::to_string(&serde_json::json!({
                "type": "interrupt",
                "reason": reason,
                "controlId": control.id
            }))?,
            control.run_id,
            control.session_id
        ],
    )?;
    if updated_run == 0 {
        return Err(SystemServiceError::Invariant(
            "interrupt apply could not cancel active run".to_string(),
        ));
    }
    let updated_input = tx.execute(
        "UPDATE session_input
         SET status = 'cancelled', updated_at = ?
         WHERE id = ? AND session_id = ? AND status = 'claimed'",
        params![now, lease.input_id, lease.session_id],
    )?;
    if updated_input == 0 {
        return Err(SystemServiceError::Invariant(
            "interrupt apply could not cancel claimed input".to_string(),
        ));
    }
    tx.execute(
        "DELETE FROM session_runner_lease
         WHERE session_id = ? AND run_id = ? AND runner_id = ? AND lease_token = ?",
        params![
            lease.session_id,
            lease.run_id,
            lease.runner_id,
            lease.lease_token
        ],
    )?;
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        "session.run.cancelled",
        &EventScope {
            session_id: Some(control.session_id.clone()),
            run_id: Some(control.run_id.clone()),
            input_id: Some(lease.input_id.clone()),
            message_id: None,
            resource_id: None,
            ..EventScope::default()
        },
        &serde_json::json!({
            "runId": control.run_id,
            "inputId": lease.input_id,
            "status": "cancelled",
            "reason": reason,
            "controlId": control.id
        }),
        now,
    )?;
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        "session.run.interrupt_applied",
        &EventScope {
            session_id: Some(control.session_id.clone()),
            run_id: Some(control.run_id.clone()),
            input_id: Some(lease.input_id.clone()),
            message_id: None,
            resource_id: None,
            ..EventScope::default()
        },
        &serde_json::json!({
            "runId": control.run_id,
            "controlId": control.id,
            "status": "applied"
        }),
        now,
    )?;
    Ok(())
}

fn apply_steer_run_control_tx(
    tx: &rusqlite::Transaction<'_>,
    control: &SessionRunControlRecord,
    lease: &ActiveLease,
    now: i64,
) -> Result<()> {
    if control.run_id != lease.run_id {
        return Err(SystemServiceError::Invariant(
            "steer control does not target active lease run".to_string(),
        ));
    }
    let Some(input_id) = control.input_id.as_deref() else {
        return Err(SystemServiceError::Invariant(
            "steer control missing linked input".to_string(),
        ));
    };
    let updated_input = tx.execute(
        "UPDATE session_input
         SET status = 'completed', updated_at = ?
         WHERE id = ? AND session_id = ? AND status = 'control_pending'",
        params![now, input_id, control.session_id],
    )?;
    if updated_input == 0 {
        return Err(SystemServiceError::Invariant(
            "steer apply could not complete control input".to_string(),
        ));
    }
    let updated_control = tx.execute(
        "UPDATE session_run_control
         SET status = 'applied', updated_at = ?, applied_at = ?
         WHERE id = ? AND session_id = ? AND status = 'pending'",
        params![now, now, control.id, control.session_id],
    )?;
    if updated_control == 0 {
        return Err(SystemServiceError::Invariant(
            "steer apply could not mark control applied".to_string(),
        ));
    }
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        "session.run.steer_applied",
        &EventScope {
            session_id: Some(control.session_id.clone()),
            run_id: Some(control.run_id.clone()),
            input_id: Some(input_id.to_string()),
            message_id: None,
            resource_id: None,
            ..EventScope::default()
        },
        &serde_json::json!({
            "runId": control.run_id,
            "controlId": control.id,
            "inputId": input_id,
            "status": "applied"
        }),
        now,
    )?;
    Ok(())
}

pub(crate) fn cancel_pending_run_controls_for_terminal_run_tx(
    tx: &rusqlite::Transaction<'_>,
    session_id: &str,
    run_id: &str,
    now: i64,
    except_control_id: Option<&str>,
) -> Result<()> {
    let except = except_control_id.unwrap_or("");
    let mut stmt = tx.prepare(
        "SELECT input_id
         FROM session_run_control
         WHERE session_id = ?
           AND run_id = ?
           AND status = 'pending'
           AND input_id IS NOT NULL
           AND (? = '' OR id <> ?)",
    )?;
    let rows = stmt.query_map(params![session_id, run_id, except, except], |row| {
        row.get::<_, String>(0)
    })?;
    let mut input_ids = Vec::new();
    for row in rows {
        input_ids.push(row?);
    }
    drop(stmt);

    for input_id in input_ids {
        tx.execute(
            "UPDATE session_input
             SET status = 'cancelled', updated_at = ?
             WHERE id = ? AND session_id = ? AND status = 'control_pending'",
            params![now, input_id, session_id],
        )?;
    }
    tx.execute(
        "UPDATE session_run_control
         SET status = 'cancelled', updated_at = ?
         WHERE session_id = ?
           AND run_id = ?
           AND status = 'pending'
           AND (? = '' OR id <> ?)",
        params![now, session_id, run_id, except, except],
    )?;
    Ok(())
}

fn append_steer_rejected_tx(
    tx: &rusqlite::Transaction<'_>,
    request: &SteerSessionRun,
    reason_code: &str,
    reason: &str,
    now: i64,
) -> Result<()> {
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        "session.run.steer_rejected",
        &EventScope {
            session_id: Some(request.session_id.clone()),
            run_id: Some(request.expected_run_id.clone()),
            input_id: None,
            message_id: None,
            resource_id: None,
            ..EventScope::default()
        },
        &serde_json::json!({
            "runId": request.expected_run_id,
            "principalId": request.principal_id,
            "reasonCode": reason_code,
            "reason": reason,
            "status": "rejected"
        }),
        now,
    )?;
    Ok(())
}

fn ensure_existing_run_control_matches(
    existing: &SessionRunControlRecord,
    kind: &str,
    run_id: &str,
) -> Result<()> {
    if existing.kind != kind || existing.run_id != run_id {
        return Err(SystemServiceError::InvalidJobRequest(
            "idempotency_key is already used for a different run-control request".to_string(),
        ));
    }
    Ok(())
}

fn optional_json_string(value: &Option<Value>) -> Result<Option<String>> {
    value
        .as_ref()
        .map(serde_json::to_string)
        .transpose()
        .map_err(Into::into)
}

fn validate_interrupt_session_run(request: &InterruptSessionRun) -> Result<()> {
    if request.session_id.is_empty() {
        return Err(SystemServiceError::InvalidJobRequest(
            "session_id must not be empty".to_string(),
        ));
    }
    if request.run_id.is_empty() {
        return Err(SystemServiceError::InvalidJobRequest(
            "run_id must not be empty".to_string(),
        ));
    }
    if request.reason.is_empty() {
        return Err(SystemServiceError::InvalidJobRequest(
            "reason must not be empty".to_string(),
        ));
    }
    if request.principal_id.as_deref().is_some_and(str::is_empty) {
        return Err(SystemServiceError::InvalidJobRequest(
            "principal_id must not be empty".to_string(),
        ));
    }
    if request
        .idempotency_key
        .as_deref()
        .is_some_and(str::is_empty)
    {
        return Err(SystemServiceError::InvalidJobRequest(
            "idempotency_key must not be empty".to_string(),
        ));
    }
    Ok(())
}

fn validate_steer_session_run(request: &SteerSessionRun) -> Result<()> {
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
    if request.expected_run_id.is_empty() {
        return Err(SystemServiceError::InvalidJobRequest(
            "expected_run_id must not be empty".to_string(),
        ));
    }
    if request.idempotency_key.is_empty() {
        return Err(SystemServiceError::InvalidJobRequest(
            "idempotency_key must not be empty".to_string(),
        ));
    }
    if request.content.as_array().is_some_and(Vec::is_empty) {
        return Err(SystemServiceError::InvalidJobRequest(
            "steer content must not be empty".to_string(),
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
    Ok(())
}

fn validate_apply_session_run_control(request: &ApplySessionRunControl) -> Result<()> {
    if request.session_id.is_empty() {
        return Err(SystemServiceError::InvalidJobRequest(
            "session_id must not be empty".to_string(),
        ));
    }
    if request.run_id.is_empty() {
        return Err(SystemServiceError::InvalidJobRequest(
            "run_id must not be empty".to_string(),
        ));
    }
    if request.control_id.is_empty() {
        return Err(SystemServiceError::InvalidJobRequest(
            "control_id must not be empty".to_string(),
        ));
    }
    if request.runner_id.is_empty() {
        return Err(SystemServiceError::InvalidJobRequest(
            "runner_id must not be empty".to_string(),
        ));
    }
    if request.lease_token.is_empty() {
        return Err(SystemServiceError::InvalidJobRequest(
            "lease_token must not be empty".to_string(),
        ));
    }
    Ok(())
}

fn validate_list_session_run_controls(request: &ListSessionRunControls) -> Result<()> {
    if request.session_id.is_empty() {
        return Err(SystemServiceError::InvalidJobRequest(
            "session_id must not be empty".to_string(),
        ));
    }
    if request.limit.is_some_and(|limit| limit <= 0) {
        return Err(SystemServiceError::InvalidJobRequest(
            "run-control list limit must be positive".to_string(),
        ));
    }
    if let Some(kind) = request.kind.as_deref() {
        if kind != "interrupt" && kind != "steer" {
            return Err(SystemServiceError::InvalidJobRequest(
                "run-control kind must be interrupt or steer".to_string(),
            ));
        }
    }
    if let Some(status) = request.status.as_deref() {
        if !matches!(status, "pending" | "applied" | "rejected" | "cancelled") {
            return Err(SystemServiceError::InvalidJobRequest(
                "run-control status must be pending, applied, rejected, or cancelled".to_string(),
            ));
        }
    }
    Ok(())
}
