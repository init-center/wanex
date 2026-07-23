use crate::event_store::append_event_tx;
use crate::messages::{insert_session_message_tx, NewSessionMessage};
use crate::rows::row_to_session_turn_control;
use crate::{
    ApplySessionTurnControl, ApplySessionTurnControlReceipt, EventScope, InterruptSessionTurn,
    InterruptSessionTurnReceipt, ListSessionTurnControls, Result, SessionTurnControlRecord,
    SteerSessionTurn, SteerSessionTurnReceipt, SystemService, SystemServiceError,
};
use rusqlite::{params, params_from_iter, types::Value as SqlValue, OptionalExtension};
use uuid::Uuid;

const CONTROL_SELECT: &str = "SELECT id, session_id, turn_id, attempt_id, input_id,
    principal_id, idempotency_key, kind, status, content_json, reason, origin_json,
    metadata_json, created_at, updated_at, applied_at FROM session_turn_control";

impl SystemService {
    pub fn interrupt_session_turn(
        &self,
        request: &InterruptSessionTurn,
    ) -> Result<InterruptSessionTurnReceipt> {
        validate_interrupt(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        if !is_active_attempt_tx(
            &tx,
            &request.session_id,
            &request.turn_id,
            &request.attempt_id,
        )? {
            tx.commit()?;
            return Ok(InterruptSessionTurnReceipt {
                session_id: request.session_id.clone(),
                turn_id: request.turn_id.clone(),
                attempt_id: request.attempt_id.clone(),
                durability: "local-durable".to_string(),
                status: "not_running".to_string(),
                accepted_at: None,
            });
        }
        let idempotency_key = request.idempotency_key.clone().unwrap_or_else(|| {
            format!(
                "session.turn.interrupt:{}:{}",
                request.turn_id, request.attempt_id
            )
        });
        if let Some(existing) =
            find_control_by_idempotency_tx(&tx, &request.session_id, &idempotency_key)?
        {
            ensure_control_match(
                &existing,
                "interrupt",
                &request.turn_id,
                &request.attempt_id,
            )?;
            tx.commit()?;
            return Ok(InterruptSessionTurnReceipt {
                session_id: existing.session_id,
                turn_id: existing.turn_id,
                attempt_id: existing.attempt_id,
                durability: "local-durable".to_string(),
                status: "interrupt_requested".to_string(),
                accepted_at: Some(existing.created_at),
            });
        }
        let control_id = format!("ctl_{}", Uuid::now_v7());
        tx.execute(
            "INSERT INTO session_turn_control (
                id, session_id, turn_id, attempt_id, input_id, principal_id,
                idempotency_key, kind, status, content_json, reason, origin_json,
                metadata_json, created_at, updated_at, applied_at
             ) VALUES (?, ?, ?, ?, NULL, ?, ?, 'interrupt', 'pending', NULL, ?, ?, ?, ?, ?, NULL)",
            params![
                control_id,
                request.session_id,
                request.turn_id,
                request.attempt_id,
                request.principal_id,
                idempotency_key,
                request.reason,
                request
                    .origin
                    .as_ref()
                    .map(serde_json::to_string)
                    .transpose()?,
                request
                    .metadata
                    .as_ref()
                    .map(serde_json::to_string)
                    .transpose()?,
                now,
                now
            ],
        )?;
        append_control_event_tx(
            &tx,
            ControlEvent {
                event_type: "session.turn.interrupt_requested",
                session_id: &request.session_id,
                turn_id: &request.turn_id,
                attempt_id: &request.attempt_id,
                control_id: &control_id,
                input_id: None,
            },
            now,
        )?;
        tx.commit()?;
        Ok(InterruptSessionTurnReceipt {
            session_id: request.session_id.clone(),
            turn_id: request.turn_id.clone(),
            attempt_id: request.attempt_id.clone(),
            durability: "local-durable".to_string(),
            status: "interrupt_requested".to_string(),
            accepted_at: Some(now),
        })
    }

    pub fn steer_session_turn(
        &self,
        request: &SteerSessionTurn,
    ) -> Result<SteerSessionTurnReceipt> {
        validate_steer(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        if !is_active_attempt_tx(
            &tx,
            &request.session_id,
            &request.expected_turn_id,
            &request.expected_attempt_id,
        )? {
            return Err(SystemServiceError::Invariant(
                "expected turn attempt is not active for steering".to_string(),
            ));
        }
        if let Some(existing) =
            find_control_by_idempotency_tx(&tx, &request.session_id, &request.idempotency_key)?
        {
            ensure_control_match(
                &existing,
                "steer",
                &request.expected_turn_id,
                &request.expected_attempt_id,
            )?;
            tx.commit()?;
            return Ok(SteerSessionTurnReceipt {
                session_id: existing.session_id,
                turn_id: existing.turn_id,
                attempt_id: existing.attempt_id,
                durability: "local-durable".to_string(),
                status: "accepted".to_string(),
                accepted_at: Some(existing.created_at),
            });
        }
        let input_id = format!("inp_{}", Uuid::now_v7());
        let control_id = format!("ctl_{}", Uuid::now_v7());
        tx.execute(
            "INSERT INTO session_input (
                id, session_id, principal_id, idempotency_key, input_type,
                content_json, origin_json, intent, run_control_policy,
                expected_turn_id, status, created_at, updated_at
             ) VALUES (?, ?, ?, ?, 'user', ?, ?, 'steer', 'steer_at_safe_point', ?,
                       'control_pending', ?, ?)",
            params![
                input_id,
                request.session_id,
                request.principal_id,
                request.idempotency_key,
                serde_json::to_string(&request.content)?,
                request
                    .origin
                    .as_ref()
                    .map(serde_json::to_string)
                    .transpose()?,
                request.expected_turn_id,
                now,
                now
            ],
        )?;
        tx.execute(
            "INSERT INTO session_turn_control (
                id, session_id, turn_id, attempt_id, input_id, principal_id,
                idempotency_key, kind, status, content_json, reason, origin_json,
                metadata_json, created_at, updated_at, applied_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, 'steer', 'pending', ?, NULL, ?, ?, ?, ?, NULL)",
            params![
                control_id,
                request.session_id,
                request.expected_turn_id,
                request.expected_attempt_id,
                input_id,
                request.principal_id,
                request.idempotency_key,
                serde_json::to_string(&request.content)?,
                request
                    .origin
                    .as_ref()
                    .map(serde_json::to_string)
                    .transpose()?,
                request
                    .metadata
                    .as_ref()
                    .map(serde_json::to_string)
                    .transpose()?,
                now,
                now
            ],
        )?;
        append_control_event_tx(
            &tx,
            ControlEvent {
                event_type: "session.turn.steer_accepted",
                session_id: &request.session_id,
                turn_id: &request.expected_turn_id,
                attempt_id: &request.expected_attempt_id,
                control_id: &control_id,
                input_id: Some(&input_id),
            },
            now,
        )?;
        tx.commit()?;
        Ok(SteerSessionTurnReceipt {
            session_id: request.session_id.clone(),
            turn_id: request.expected_turn_id.clone(),
            attempt_id: request.expected_attempt_id.clone(),
            durability: "local-durable".to_string(),
            status: "accepted".to_string(),
            accepted_at: Some(now),
        })
    }

    pub fn list_session_turn_controls(
        &self,
        request: &ListSessionTurnControls,
    ) -> Result<Vec<SessionTurnControlRecord>> {
        if request.session_id.is_empty() {
            return Err(SystemServiceError::InvalidInput(
                "session_id must not be empty".to_string(),
            ));
        }
        let conn = self.connect()?;
        let mut clauses = vec!["session_id = ?"];
        let mut values = vec![SqlValue::Text(request.session_id.clone())];
        if let Some(turn_id) = &request.turn_id {
            clauses.push("turn_id = ?");
            values.push(SqlValue::Text(turn_id.clone()));
        }
        if let Some(attempt_id) = &request.attempt_id {
            clauses.push("attempt_id = ?");
            values.push(SqlValue::Text(attempt_id.clone()));
        }
        if let Some(kind) = &request.kind {
            clauses.push("kind = ?");
            values.push(SqlValue::Text(kind.clone()));
        }
        if let Some(status) = &request.status {
            clauses.push("status = ?");
            values.push(SqlValue::Text(status.clone()));
        }
        values.push(SqlValue::Integer(
            request.limit.unwrap_or(100).clamp(1, 1000),
        ));
        let sql = format!(
            "{CONTROL_SELECT} WHERE {} ORDER BY created_at ASC, id ASC LIMIT ?",
            clauses.join(" AND ")
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(params_from_iter(values), row_to_session_turn_control)?;
        let mut controls = Vec::new();
        for row in rows {
            controls.push(row?);
        }
        Ok(controls)
    }

    pub fn apply_session_turn_control(
        &self,
        request: &ApplySessionTurnControl,
    ) -> Result<Option<ApplySessionTurnControlReceipt>> {
        validate_apply(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let input_id = active_input_id_tx(&tx, &request.turn_id)?;
        let Some(binding_digest) = crate::turns::validate_turn_attempt_lease_tx(
            &tx,
            &crate::turns::TurnAttemptLeaseIdentity {
                session_id: &request.session_id,
                turn_id: &request.turn_id,
                attempt_id: &request.attempt_id,
                input_id: &input_id,
                job_id: &request.job_id,
                worker_id: &request.worker_id,
                lease_token: &request.lease_token,
            },
            now,
        )?
        else {
            tx.commit()?;
            return Ok(None);
        };
        let control = get_control_tx(&tx, &request.control_id)?;
        if control.session_id != request.session_id
            || control.turn_id != request.turn_id
            || control.attempt_id != request.attempt_id
        {
            return Err(SystemServiceError::Invariant(
                "session turn control target does not match".to_string(),
            ));
        }
        if control.status != "pending" {
            tx.commit()?;
            return Ok(Some(ApplySessionTurnControlReceipt {
                control,
                effect: "already_resolved".to_string(),
            }));
        }

        let effect = if control.kind == "interrupt" {
            tx.execute(
                "UPDATE session_turn
                 SET state = 'cancel_requested', cancel_requested_at = COALESCE(cancel_requested_at, ?),
                     cancel_reason = COALESCE(cancel_reason, ?), updated_at = ?
                 WHERE id = ? AND state IN ('running', 'cancel_requested')",
                params![now, control.reason, now, request.turn_id],
            )?;
            "interrupt_requested_cancel"
        } else {
            let input_id = control.input_id.as_deref().ok_or_else(|| {
                SystemServiceError::Invariant("steer control is missing its input".to_string())
            })?;
            let content = control.content.as_ref().ok_or_else(|| {
                SystemServiceError::Invariant("steer control is missing content".to_string())
            })?;
            insert_session_message_tx(
                &tx,
                NewSessionMessage {
                    session_id: &request.session_id,
                    turn_id: &request.turn_id,
                    attempt_id: Some(&request.attempt_id),
                    input_id: Some(input_id),
                    role: "user",
                    status: "completed",
                    content,
                    provider_state: None,
                    execution_binding_digest: &binding_digest,
                    idempotency_key: Some(&format!("session.steer.promoted:{input_id}")),
                },
                now,
            )?;
            tx.execute(
                "UPDATE session_input SET status = 'completed', updated_at = ?
                 WHERE id = ? AND status = 'control_pending'",
                params![now, input_id],
            )?;
            "steer_promoted_input"
        };
        tx.execute(
            "UPDATE session_turn_control
             SET status = 'applied', updated_at = ?, applied_at = ?
             WHERE id = ? AND status = 'pending'",
            params![now, now, request.control_id],
        )?;
        append_control_event_tx(
            &tx,
            ControlEvent {
                event_type: "session.turn.control_applied",
                session_id: &request.session_id,
                turn_id: &request.turn_id,
                attempt_id: &request.attempt_id,
                control_id: &request.control_id,
                input_id: control.input_id.as_deref(),
            },
            now,
        )?;
        let control = get_control_tx(&tx, &request.control_id)?;
        tx.commit()?;
        Ok(Some(ApplySessionTurnControlReceipt {
            control,
            effect: effect.to_string(),
        }))
    }
}

fn is_active_attempt_tx(
    tx: &rusqlite::Transaction<'_>,
    session_id: &str,
    turn_id: &str,
    attempt_id: &str,
) -> Result<bool> {
    tx.query_row(
        "SELECT EXISTS(
           SELECT 1 FROM session_turn turn
           INNER JOIN session_attempt attempt ON attempt.id = turn.current_attempt_id
           WHERE turn.session_id = ? AND turn.id = ? AND attempt.id = ?
             AND turn.state IN ('running', 'cancel_requested') AND attempt.state = 'running'
         )",
        params![session_id, turn_id, attempt_id],
        |row| row.get(0),
    )
    .map_err(Into::into)
}

fn active_input_id_tx(tx: &rusqlite::Transaction<'_>, turn_id: &str) -> Result<String> {
    tx.query_row(
        "SELECT primary_input_id FROM session_turn WHERE id = ?",
        params![turn_id],
        |row| row.get(0),
    )
    .map_err(Into::into)
}

fn get_control_tx(
    tx: &rusqlite::Transaction<'_>,
    control_id: &str,
) -> Result<SessionTurnControlRecord> {
    tx.query_row(
        &format!("{CONTROL_SELECT} WHERE id = ?"),
        params![control_id],
        row_to_session_turn_control,
    )
    .map_err(Into::into)
}

fn find_control_by_idempotency_tx(
    tx: &rusqlite::Transaction<'_>,
    session_id: &str,
    idempotency_key: &str,
) -> Result<Option<SessionTurnControlRecord>> {
    tx.query_row(
        &format!("{CONTROL_SELECT} WHERE session_id = ? AND idempotency_key = ?"),
        params![session_id, idempotency_key],
        row_to_session_turn_control,
    )
    .optional()
    .map_err(Into::into)
}

fn ensure_control_match(
    control: &SessionTurnControlRecord,
    kind: &str,
    turn_id: &str,
    attempt_id: &str,
) -> Result<()> {
    if control.kind != kind || control.turn_id != turn_id || control.attempt_id != attempt_id {
        return Err(SystemServiceError::Invariant(
            "conflicting repeated session turn control".to_string(),
        ));
    }
    Ok(())
}

struct ControlEvent<'a> {
    event_type: &'a str,
    session_id: &'a str,
    turn_id: &'a str,
    attempt_id: &'a str,
    control_id: &'a str,
    input_id: Option<&'a str>,
}

fn append_control_event_tx(
    tx: &rusqlite::Transaction<'_>,
    event: ControlEvent<'_>,
    now: i64,
) -> Result<()> {
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        event.event_type,
        &EventScope {
            session_id: Some(event.session_id.to_string()),
            turn_id: Some(event.turn_id.to_string()),
            attempt_id: Some(event.attempt_id.to_string()),
            input_id: event.input_id.map(ToOwned::to_owned),
            ..EventScope::default()
        },
        &serde_json::json!({
            "controlId": event.control_id,
            "turnId": event.turn_id,
            "attemptId": event.attempt_id
        }),
        now,
    )
}

fn validate_interrupt(request: &InterruptSessionTurn) -> Result<()> {
    if request.session_id.is_empty()
        || request.turn_id.is_empty()
        || request.attempt_id.is_empty()
        || request.reason.is_empty()
    {
        return Err(SystemServiceError::InvalidInput(
            "interrupt target and reason must not be empty".to_string(),
        ));
    }
    Ok(())
}

fn validate_steer(request: &SteerSessionTurn) -> Result<()> {
    if request.session_id.is_empty()
        || request.principal_id.is_empty()
        || request.expected_turn_id.is_empty()
        || request.expected_attempt_id.is_empty()
        || request.idempotency_key.is_empty()
    {
        return Err(SystemServiceError::InvalidInput(
            "steer execution identity must not be empty".to_string(),
        ));
    }
    Ok(())
}

fn validate_apply(request: &ApplySessionTurnControl) -> Result<()> {
    if [
        request.session_id.as_str(),
        request.turn_id.as_str(),
        request.attempt_id.as_str(),
        request.control_id.as_str(),
        request.job_id.as_str(),
        request.worker_id.as_str(),
        request.lease_token.as_str(),
    ]
    .iter()
    .any(|value| value.is_empty())
    {
        return Err(SystemServiceError::InvalidInput(
            "session turn control execution identity must not be empty".to_string(),
        ));
    }
    Ok(())
}
