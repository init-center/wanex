use crate::event_store::append_event_tx;
use crate::messages::{
    find_message_by_idempotency_tx, insert_session_message_tx, NewSessionMessage,
};
use crate::rows::{row_to_session_attempt, row_to_session_turn};
use crate::sessions::{get_input_tx, get_optional_turn_tx, get_turn_tx, SESSION_TURN_SELECT};
use crate::{
    EventScope, FailJob, ListSessionAttempts, ListSessionTurns, RequestSessionTurnCancel,
    RequestSessionTurnCancelReceipt, Result, SchedulerJobRecord, SessionAttemptRecord,
    SessionTurnRecord, SettleSessionTurn, SettleSessionTurnReceipt, StartSessionTurnAttempt,
    StartSessionTurnAttemptReceipt, SystemService, SystemServiceError,
};
use rusqlite::{params, params_from_iter, OptionalExtension};
use uuid::Uuid;

const SESSION_ATTEMPT_SELECT: &str = "SELECT id, session_id, turn_id, input_id,
    job_id, attempt_number, worker_id, lease_token, state, error_json,
    started_at, updated_at, finished_at FROM session_attempt";

pub(crate) struct TurnAttemptLeaseIdentity<'a> {
    pub session_id: &'a str,
    pub turn_id: &'a str,
    pub attempt_id: &'a str,
    pub input_id: &'a str,
    pub job_id: &'a str,
    pub worker_id: &'a str,
    pub lease_token: &'a str,
}

impl SystemService {
    pub fn start_session_turn_attempt(
        &self,
        request: &StartSessionTurnAttempt,
    ) -> Result<StartSessionTurnAttemptReceipt> {
        validate_start_request(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let receipt = start_session_turn_attempt_tx(&tx, request, now)?;
        tx.commit()?;
        Ok(receipt)
    }

    pub fn settle_session_turn(
        &self,
        request: &SettleSessionTurn,
    ) -> Result<SettleSessionTurnReceipt> {
        validate_settlement_request(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let receipt = settle_session_turn_tx(&tx, request, now)?;
        tx.commit()?;
        Ok(receipt)
    }

    pub fn request_session_turn_cancel(
        &self,
        request: &RequestSessionTurnCancel,
    ) -> Result<RequestSessionTurnCancelReceipt> {
        validate_cancel_request(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let receipt = request_session_turn_cancel_tx(&tx, request, now)?;
        tx.commit()?;
        Ok(receipt)
    }

    pub fn list_session_turns(&self, request: &ListSessionTurns) -> Result<Vec<SessionTurnRecord>> {
        let conn = self.connect()?;
        let rows = if let Some(state) = &request.state {
            let mut stmt = conn.prepare(&format!(
                "{SESSION_TURN_SELECT} WHERE session_id = ? AND state = ?
                 ORDER BY created_at ASC, id ASC"
            ))?;
            let rows = stmt.query_map(params![request.session_id, state], row_to_session_turn)?;
            collect_rows(rows)?
        } else {
            let mut stmt = conn.prepare(&format!(
                "{SESSION_TURN_SELECT} WHERE session_id = ?
                 ORDER BY created_at ASC, id ASC"
            ))?;
            let rows = stmt.query_map(params![request.session_id], row_to_session_turn)?;
            collect_rows(rows)?
        };
        Ok(rows)
    }

    pub fn list_session_turns_by_ids(
        &self,
        session_id: &str,
        turn_ids: &[String],
    ) -> Result<Vec<SessionTurnRecord>> {
        if turn_ids.is_empty() {
            return Ok(Vec::new());
        }
        if turn_ids.len() > 1000 || turn_ids.iter().any(|id| id.is_empty()) {
            return Err(SystemServiceError::InvalidInput(
                "session turn id window must contain 1 to 1000 non-empty ids".to_string(),
            ));
        }
        let placeholders = std::iter::repeat_n("?", turn_ids.len())
            .collect::<Vec<_>>()
            .join(", ");
        let query = format!(
            "{SESSION_TURN_SELECT} WHERE session_id = ? AND id IN ({placeholders})
             ORDER BY created_at ASC, id ASC"
        );
        let conn = self.connect()?;
        let mut stmt = conn.prepare(&query)?;
        let values = std::iter::once(session_id).chain(turn_ids.iter().map(String::as_str));
        let rows = stmt.query_map(params_from_iter(values), row_to_session_turn)?;
        collect_rows(rows)
    }

    pub fn list_session_attempts(
        &self,
        request: &ListSessionAttempts,
    ) -> Result<Vec<SessionAttemptRecord>> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare(&format!(
            "{SESSION_ATTEMPT_SELECT} WHERE turn_id = ? ORDER BY attempt_number ASC, id ASC"
        ))?;
        let rows = stmt.query_map(params![request.turn_id], row_to_session_attempt)?;
        collect_rows(rows)
    }
}

pub(crate) fn start_session_turn_attempt_tx(
    tx: &rusqlite::Transaction<'_>,
    request: &StartSessionTurnAttempt,
    now: i64,
) -> Result<StartSessionTurnAttemptReceipt> {
    validate_start_request(request)?;
    let turn = get_turn_tx(tx, &request.turn_id)?;
    ensure_exact_turn_identity(
        &turn,
        &request.session_id,
        &request.input_id,
        &request.job_id,
    )?;

    if let Some(existing) = find_attempt_by_lease_tx(
        tx,
        &request.turn_id,
        &request.job_id,
        &request.worker_id,
        &request.lease_token,
    )? {
        let message = promoted_input_message_tx(tx, &request.session_id, &request.input_id)?;
        return Ok(StartSessionTurnAttemptReceipt {
            turn,
            attempt: existing,
            input_message: message,
        });
    }

    let resuming_cancel = turn.state == "cancel_requested" && turn.current_attempt_id.is_none();
    if turn.state != "queued" && !resuming_cancel {
        return Err(SystemServiceError::Invariant(format!(
            "session turn cannot start a physical attempt: {}",
            turn.state
        )));
    }
    let job = crate::scheduler::get_job_tx(tx, &request.job_id)?;
    validate_session_turn_job_lease(&job, request, now)?;
    validate_job_payload(&job.payload, request)?;

    let input = get_input_tx(tx, &request.input_id)?;
    if input.session_id != request.session_id
        || !matches!(input.status.as_str(), "admitted" | "promoted")
    {
        return Err(SystemServiceError::Invariant(
            "session turn input is not available for attempt start".to_string(),
        ));
    }
    let is_recovery = input.status == "promoted";
    let another_active: bool = tx.query_row(
        "SELECT EXISTS(
           SELECT 1 FROM session_turn
           WHERE session_id = ? AND id != ?
             AND state IN ('running', 'cancel_requested')
         )",
        params![request.session_id, request.turn_id],
        |row| row.get(0),
    )?;
    if another_active {
        return Err(SystemServiceError::Invariant(
            "another turn is active in the session".to_string(),
        ));
    }

    let attempt_number: i64 = tx.query_row(
        "SELECT COALESCE(MAX(attempt_number), 0) + 1
         FROM session_attempt WHERE turn_id = ?",
        params![request.turn_id],
        |row| row.get(0),
    )?;
    let attempt_id = format!("attempt_{}", Uuid::now_v7());
    tx.execute(
        "INSERT INTO session_attempt (
            id, session_id, turn_id, input_id, job_id, attempt_number,
            worker_id, lease_token, state, error_json, started_at, updated_at,
            finished_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'running', NULL, ?, ?, NULL)",
        params![
            attempt_id,
            request.session_id,
            request.turn_id,
            request.input_id,
            request.job_id,
            attempt_number,
            request.worker_id,
            request.lease_token,
            now,
            now
        ],
    )?;
    let updated_turn = if resuming_cancel {
        tx.execute(
            "UPDATE session_turn
             SET current_attempt_id = ?, updated_at = ?
             WHERE id = ? AND state = 'cancel_requested' AND current_attempt_id IS NULL",
            params![attempt_id, now, request.turn_id],
        )?
    } else {
        tx.execute(
            "UPDATE session_turn
             SET state = 'running', current_attempt_id = ?, updated_at = ?
             WHERE id = ? AND state = 'queued' AND current_attempt_id IS NULL",
            params![attempt_id, now, request.turn_id],
        )?
    };
    let updated_input = if is_recovery {
        1
    } else {
        tx.execute(
            "UPDATE session_input SET status = 'promoted', updated_at = ?
             WHERE id = ? AND status = 'admitted'",
            params![now, request.input_id],
        )?
    };
    if updated_turn != 1 || updated_input != 1 {
        return Err(SystemServiceError::Invariant(
            "session turn promotion lost its queued input".to_string(),
        ));
    }
    if is_recovery {
        tx.execute(
            "UPDATE session_turn_control
             SET attempt_id = ?, updated_at = ?
             WHERE turn_id = ? AND kind = 'steer' AND status = 'pending'",
            params![attempt_id, now, request.turn_id],
        )?;
    }
    let input_message = if is_recovery {
        promoted_input_message_tx(tx, &request.session_id, &request.input_id)?
    } else {
        insert_session_message_tx(
            tx,
            NewSessionMessage {
                session_id: &request.session_id,
                turn_id: &request.turn_id,
                attempt_id: Some(&attempt_id),
                input_id: Some(&request.input_id),
                role: &input.input_type,
                status: "completed",
                content: &input.content,
                provider_state: None,
                execution_binding_digest: &turn.execution_binding_digest,
                idempotency_key: Some(&format!("session.input.promoted:{}", request.input_id)),
            },
            now,
        )?
    };
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        "session.turn.attempt_started",
        &EventScope {
            session_id: Some(request.session_id.clone()),
            turn_id: Some(request.turn_id.clone()),
            attempt_id: Some(attempt_id.clone()),
            input_id: Some(request.input_id.clone()),
            message_id: Some(input_message.id.clone()),
            ..EventScope::default()
        },
        &serde_json::json!({
            "turnId": request.turn_id,
            "attemptId": attempt_id,
            "attemptNumber": attempt_number,
            "jobId": request.job_id,
            "workerId": request.worker_id,
            "recovered": is_recovery,
            "state": if resuming_cancel { "cancel_requested" } else { "running" }
        }),
        now,
    )?;
    Ok(StartSessionTurnAttemptReceipt {
        turn: get_turn_tx(tx, &request.turn_id)?,
        attempt: get_attempt_tx(tx, &attempt_id)?,
        input_message,
    })
}

pub(crate) fn settle_session_turn_tx(
    tx: &rusqlite::Transaction<'_>,
    request: &SettleSessionTurn,
    now: i64,
) -> Result<SettleSessionTurnReceipt> {
    validate_settlement_request(request)?;
    let turn = get_turn_tx(tx, &request.turn_id)?;
    ensure_exact_turn_identity(
        &turn,
        &request.session_id,
        &request.input_id,
        &request.job_id,
    )?;

    if is_terminal_turn_state(&turn.state) {
        if turn.state != request.outcome {
            return Err(SystemServiceError::Invariant(
                "conflicting repeated session turn settlement".to_string(),
            ));
        }
        let attempt = get_attempt_tx(tx, &request.attempt_id)?;
        let job = crate::scheduler::get_job_tx(tx, &request.job_id)?;
        let assistant_message =
            get_terminal_assistant_message_tx(tx, &request.session_id, &request.turn_id)?;
        return Ok(SettleSessionTurnReceipt {
            turn,
            attempt,
            job,
            assistant_message,
        });
    }

    if request.outcome == "succeeded" {
        if turn.state != "running" {
            return Err(SystemServiceError::Invariant(
                "successful turn settlement cannot override a pending cancellation".to_string(),
            ));
        }
        let pending_control: bool = tx.query_row(
            "SELECT EXISTS(
               SELECT 1 FROM session_turn_control
               WHERE turn_id = ? AND attempt_id = ? AND status = 'pending'
             )",
            params![request.turn_id, request.attempt_id],
            |row| row.get(0),
        )?;
        if pending_control {
            return Err(SystemServiceError::Invariant(
                "successful turn settlement cannot skip a pending turn control".to_string(),
            ));
        }
    }

    let binding_digest = validate_turn_attempt_lease_tx(
        tx,
        &TurnAttemptLeaseIdentity {
            session_id: &request.session_id,
            turn_id: &request.turn_id,
            attempt_id: &request.attempt_id,
            input_id: &request.input_id,
            job_id: &request.job_id,
            worker_id: &request.worker_id,
            lease_token: &request.lease_token,
        },
        now,
    )?
    .ok_or_else(|| {
        SystemServiceError::Invariant(
            "session turn settlement does not own the active scheduler lease".to_string(),
        )
    })?;

    let error = settlement_error(request);
    if request.outcome != "succeeded" {
        let error = error.as_ref().ok_or_else(|| {
            SystemServiceError::Invariant(
                "non-successful settlement has no error evidence".to_string(),
            )
        })?;
        crate::provider_invocations::prepare_non_successful_turn_settlement_tx(
            tx, request, error, now,
        )?;
    }

    let assistant_message = request
        .assistant_message
        .as_ref()
        .map(|content| {
            insert_session_message_tx(
                tx,
                NewSessionMessage {
                    session_id: &request.session_id,
                    turn_id: &request.turn_id,
                    attempt_id: Some(&request.attempt_id),
                    input_id: Some(&request.input_id),
                    role: "assistant",
                    status: if request.outcome == "succeeded" {
                        "completed"
                    } else {
                        "partial"
                    },
                    content,
                    provider_state: request.provider_state.as_ref(),
                    execution_binding_digest: &binding_digest,
                    idempotency_key: Some(&terminal_message_key(&request.turn_id)),
                },
                now,
            )
        })
        .transpose()?;

    if request.outcome == "succeeded" {
        let assistant_message_id = assistant_message
            .as_ref()
            .map(|message| message.id.as_str())
            .ok_or_else(|| {
                SystemServiceError::InvalidInput(
                    "successful turn settlement requires assistant_message".to_string(),
                )
            })?;
        crate::provider_invocations::finish_final_provider_invocation_tx(
            tx,
            request,
            assistant_message_id,
            &binding_digest,
            now,
        )?;
    } else if request.provider_invocation_id.is_some() {
        return Err(SystemServiceError::InvalidInput(
            "non-successful turn settlement cannot finish a provider invocation".to_string(),
        ));
    }

    let updated_attempt = tx.execute(
        "UPDATE session_attempt
         SET state = ?, error_json = ?, updated_at = ?, finished_at = ?
         WHERE id = ? AND session_id = ? AND turn_id = ? AND input_id = ?
           AND job_id = ? AND worker_id = ? AND lease_token = ? AND state = 'running'",
        params![
            request.outcome,
            error.as_ref().map(serde_json::to_string).transpose()?,
            now,
            now,
            request.attempt_id,
            request.session_id,
            request.turn_id,
            request.input_id,
            request.job_id,
            request.worker_id,
            request.lease_token
        ],
    )?;
    let updated_turn = tx.execute(
        "UPDATE session_turn
         SET state = ?, result_json = ?, error_json = ?, updated_at = ?, finished_at = ?
         WHERE id = ? AND state IN ('running', 'cancel_requested')",
        params![
            request.outcome,
            request
                .result
                .as_ref()
                .map(serde_json::to_string)
                .transpose()?,
            error.as_ref().map(serde_json::to_string).transpose()?,
            now,
            now,
            request.turn_id
        ],
    )?;
    if updated_attempt != 1 || updated_turn != 1 {
        return Err(SystemServiceError::Invariant(
            "session turn terminal state update lost its active attempt".to_string(),
        ));
    }
    tx.execute(
        "UPDATE session_input SET status = ?, updated_at = ? WHERE id = ?",
        params![
            input_state_for_outcome(&request.outcome),
            now,
            request.input_id
        ],
    )?;
    tx.execute(
        "UPDATE session_turn_control SET status = 'cancelled', updated_at = ?
         WHERE turn_id = ? AND attempt_id = ? AND status = 'pending'",
        params![now, request.turn_id, request.attempt_id],
    )?;
    tx.execute(
        "UPDATE session SET updated_at = ? WHERE id = ?",
        params![now, request.session_id],
    )?;

    let scheduler_state = match request.outcome.as_str() {
        "succeeded" => "succeeded",
        "cancelled" | "interrupted" => "cancelled",
        _ => "failed",
    };
    let job = crate::scheduler::settle_job_without_retry_tx(
        tx,
        crate::scheduler::SessionTurnJobSettlement {
            job_id: &request.job_id,
            worker_id: &request.worker_id,
            lease_token: &request.lease_token,
            state: scheduler_state,
            result: request.result.as_ref(),
            error: error.as_ref(),
        },
        now,
    )?;
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        &format!("session.turn.{}", request.outcome),
        &EventScope {
            session_id: Some(request.session_id.clone()),
            turn_id: Some(request.turn_id.clone()),
            attempt_id: Some(request.attempt_id.clone()),
            input_id: Some(request.input_id.clone()),
            message_id: assistant_message.as_ref().map(|message| message.id.clone()),
            ..EventScope::default()
        },
        &serde_json::json!({
            "turnId": request.turn_id,
            "attemptId": request.attempt_id,
            "jobId": request.job_id,
            "outcome": request.outcome,
            "reason": request.reason
        }),
        now,
    )?;
    Ok(SettleSessionTurnReceipt {
        turn: get_turn_tx(tx, &request.turn_id)?,
        attempt: get_attempt_tx(tx, &request.attempt_id)?,
        job,
        assistant_message,
    })
}

pub(crate) fn request_session_turn_cancel_tx(
    tx: &rusqlite::Transaction<'_>,
    request: &RequestSessionTurnCancel,
    now: i64,
) -> Result<RequestSessionTurnCancelReceipt> {
    let Some(turn) = get_optional_turn_tx(tx, &request.turn_id)? else {
        return Ok(RequestSessionTurnCancelReceipt {
            status: "missing".to_string(),
            turn: None,
            job: None,
            cascade_job_ids: Vec::new(),
        });
    };
    ensure_exact_turn_identity(
        &turn,
        &request.session_id,
        &request.input_id,
        &request.job_id,
    )?;
    if is_terminal_turn_state(&turn.state) {
        return Ok(RequestSessionTurnCancelReceipt {
            status: "already_terminal".to_string(),
            job: Some(crate::scheduler::get_job_tx(tx, &request.job_id)?),
            turn: Some(turn),
            cascade_job_ids: Vec::new(),
        });
    }

    if turn.state == "waiting" {
        let approval_execution_id = pending_tool_approval_identity_tx(tx, &turn.id)?;
        let linked_media = linked_media_identity_tx(tx, &turn.id)?;
        let linked_team = crate::team::find_waiting_team_delegation_operation_tx(tx, &turn.id)?;
        let owner_count = usize::from(approval_execution_id.is_some())
            + usize::from(linked_media.is_some())
            + usize::from(linked_team.is_some());
        if owner_count != 1 {
            return Err(SystemServiceError::Invariant(format!(
                "waiting session turn must have exactly one durable suspension owner, found {owner_count}"
            )));
        }
        let updated_turn = tx.execute(
            "UPDATE session_turn
             SET state = 'cancel_requested', cancel_requested_at = COALESCE(cancel_requested_at, ?),
                 cancel_reason = COALESCE(cancel_reason, ?), updated_at = ?
             WHERE id = ? AND state = 'waiting' AND current_attempt_id IS NULL",
            params![now, request.reason, now, request.turn_id],
        )?;
        if updated_turn != 1 {
            return Err(SystemServiceError::Invariant(
                "waiting session turn lost its cancellation claim".to_string(),
            ));
        }
        let cancel_requested_turn = get_turn_tx(tx, &request.turn_id)?;
        let cascade_job_ids = if let Some(execution_id) = approval_execution_id {
            request_pending_tool_approval_cancel_tx(
                tx,
                &turn,
                &execution_id,
                &request.reason,
                now,
            )?;
            Vec::new()
        } else if linked_media.is_some() {
            let (_operation_id, job_id) =
                request_linked_media_cancel_tx(tx, &turn, &request.reason, now)?;
            vec![job_id]
        } else {
            crate::team::request_team_delegation_cancel_tx(
                tx,
                &cancel_requested_turn,
                &request.reason,
                now,
            )?
            .ok_or_else(|| {
                SystemServiceError::Invariant(
                    "waiting session turn lost its Team delegation owner".to_string(),
                )
            })?
        };
        append_cancel_event_tx(tx, request, "cancel_requested", now)?;
        return Ok(RequestSessionTurnCancelReceipt {
            status: "cancel_requested".to_string(),
            turn: Some(get_turn_tx(tx, &request.turn_id)?),
            job: Some(crate::scheduler::get_job_tx(tx, &request.job_id)?),
            cascade_job_ids,
        });
    }

    if turn.state == "queued" {
        let active_attempt_exists: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM session_attempt WHERE turn_id = ? AND state = 'running')",
            params![request.turn_id],
            |row| row.get(0),
        )?;
        if turn.current_attempt_id.is_some() || active_attempt_exists {
            return Err(SystemServiceError::Invariant(
                "queued turn unexpectedly has an active physical attempt".to_string(),
            ));
        }
        tx.execute(
            "UPDATE session_turn
             SET state = 'cancelled', cancel_requested_at = ?, cancel_reason = ?,
                 updated_at = ?, finished_at = ?
             WHERE id = ? AND state = 'queued'",
            params![now, request.reason, now, now, request.turn_id],
        )?;
        tx.execute(
            "UPDATE session_input SET status = 'cancelled', updated_at = ?
             WHERE id = ? AND status = 'admitted'",
            params![now, request.input_id],
        )?;
        let job =
            crate::scheduler::cancel_unstarted_job_tx(tx, &request.job_id, &request.reason, now)?;
        append_cancel_event_tx(tx, request, "cancelled", now)?;
        return Ok(RequestSessionTurnCancelReceipt {
            status: "cancelled".to_string(),
            turn: Some(get_turn_tx(tx, &request.turn_id)?),
            job: Some(job),
            cascade_job_ids: Vec::new(),
        });
    }
    if turn.state == "cancel_requested" {
        let linked = linked_media_identity_tx(tx, &turn.id)?;
        let linked_team = crate::team::find_waiting_team_delegation_operation_tx(tx, &turn.id)?;
        if linked.is_some() && linked_team.is_some() {
            return Err(SystemServiceError::Invariant(
                "cancel-requested Turn has multiple deferred owners".to_string(),
            ));
        }
        let cascade_job_ids = if linked.is_some() {
            let (_operation_id, job_id) =
                request_linked_media_cancel_tx(tx, &turn, &request.reason, now)?;
            vec![job_id]
        } else if linked_team.is_some() {
            crate::team::request_team_delegation_cancel_tx(tx, &turn, &request.reason, now)?
                .unwrap_or_default()
        } else {
            Vec::new()
        };
        return Ok(RequestSessionTurnCancelReceipt {
            status: "cancel_requested".to_string(),
            job: Some(crate::scheduler::get_job_tx(tx, &request.job_id)?),
            turn: Some(turn),
            cascade_job_ids,
        });
    }

    if turn.state != "running" {
        return Err(SystemServiceError::Invariant(format!(
            "turn cannot accept cancellation in state {}",
            turn.state
        )));
    }
    tx.execute(
        "UPDATE session_turn
         SET state = 'cancel_requested', cancel_requested_at = COALESCE(cancel_requested_at, ?),
             cancel_reason = COALESCE(cancel_reason, ?), updated_at = ?
         WHERE id = ? AND state = 'running'",
        params![now, request.reason, now, request.turn_id],
    )?;
    append_cancel_event_tx(tx, request, "cancel_requested", now)?;
    Ok(RequestSessionTurnCancelReceipt {
        status: "cancel_requested".to_string(),
        turn: Some(get_turn_tx(tx, &request.turn_id)?),
        job: Some(crate::scheduler::get_job_tx(tx, &request.job_id)?),
        cascade_job_ids: Vec::new(),
    })
}

fn pending_tool_approval_identity_tx(
    tx: &rusqlite::Transaction<'_>,
    turn_id: &str,
) -> Result<Option<String>> {
    let mut stmt = tx.prepare(
        "SELECT id FROM tool_execution
         WHERE turn_id = ? AND state = 'approval_required'
         ORDER BY created_at ASC, id ASC LIMIT 2",
    )?;
    let rows = stmt.query_map(params![turn_id], |row| row.get::<_, String>(0))?;
    let executions = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    if executions.len() > 1 {
        return Err(SystemServiceError::Invariant(
            "waiting session turn has multiple pending Tool approvals".to_string(),
        ));
    }
    Ok(executions.into_iter().next())
}

fn request_pending_tool_approval_cancel_tx(
    tx: &rusqlite::Transaction<'_>,
    turn: &SessionTurnRecord,
    execution_id: &str,
    reason: &str,
    now: i64,
) -> Result<()> {
    let error = serde_json::json!({
        "reason": "turn_cancelled_while_awaiting_approval",
        "message": reason
    });
    let updated_tool = tx.execute(
        "UPDATE tool_execution
         SET state = 'cancelled', approval_revision = approval_revision + 1,
             error_json = ?, updated_at = ?, finished_at = ?
         WHERE id = ? AND turn_id = ? AND state = 'approval_required'
           AND current_invocation_attempt_id IS NULL",
        params![
            serde_json::to_string(&error)?,
            now,
            now,
            execution_id,
            turn.id
        ],
    )?;
    let updated_job = tx.execute(
        "UPDATE scheduler_job
         SET state = 'ready', not_before = NULL, lease_owner = NULL,
             lease_token = NULL, lease_expires_at = NULL, updated_at = ?,
             finished_at = NULL
         WHERE id = ? AND kind = 'session.turn' AND state = 'waiting'
           AND lease_owner IS NULL AND lease_token IS NULL",
        params![now, turn.job_id],
    )?;
    if updated_tool != 1 || updated_job != 1 {
        return Err(SystemServiceError::Invariant(
            "Tool approval cancellation lost its waiting execution or Job".to_string(),
        ));
    }
    let scope = EventScope {
        session_id: Some(turn.session_id.clone()),
        turn_id: Some(turn.id.clone()),
        input_id: Some(turn.primary_input_id.clone()),
        ..EventScope::default()
    };
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        "tool.execution.cancelled",
        &scope,
        &serde_json::json!({
            "executionId": execution_id,
            "jobId": turn.job_id,
            "reason": "turn_cancelled_while_awaiting_approval"
        }),
        now,
    )?;
    crate::scheduler::append_scheduler_event_tx(
        tx,
        "scheduler.job.woken",
        &turn.job_id,
        &serde_json::json!({
            "turnId": turn.id,
            "executionId": execution_id,
            "reason": "tool_approval_cancelled"
        }),
        now,
    )
}

fn linked_media_identity_tx(
    tx: &rusqlite::Transaction<'_>,
    turn_id: &str,
) -> Result<Option<(String, String)>> {
    tx.query_row(
        "SELECT id, job_id FROM media_generation_operation
         WHERE turn_id = ?
           AND state NOT IN ('succeeded', 'failed', 'cancelled', 'recovery_required')",
        params![turn_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .optional()
    .map_err(Into::into)
}

fn request_linked_media_cancel_tx(
    tx: &rusqlite::Transaction<'_>,
    turn: &SessionTurnRecord,
    reason: &str,
    now: i64,
) -> Result<(String, String)> {
    let (operation_id, job_id, operation_state): (String, String, String) = tx
        .query_row(
            "SELECT id, job_id, state FROM media_generation_operation WHERE turn_id = ?",
            params![turn.id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?
        .ok_or_else(|| {
            SystemServiceError::Invariant(
                "waiting session turn has no linked media operation".to_string(),
            )
        })?;
    if matches!(
        operation_state.as_str(),
        "succeeded" | "failed" | "cancelled" | "recovery_required"
    ) {
        return Err(SystemServiceError::Invariant(
            "waiting session turn points to terminal media generation".to_string(),
        ));
    }
    let updated = tx.execute(
        "UPDATE media_generation_operation
         SET state = 'cancel_requested', cancel_requested_at = COALESCE(cancel_requested_at, ?),
             cancel_reason = COALESCE(cancel_reason, ?), next_poll_at = NULL, updated_at = ?
         WHERE id = ? AND state NOT IN ('succeeded', 'failed', 'cancelled', 'recovery_required')",
        params![now, reason, now, operation_id],
    )?;
    if updated != 1 {
        return Err(SystemServiceError::Invariant(
            "waiting session cancellation lost its media operation".to_string(),
        ));
    }
    tx.execute(
        "UPDATE scheduler_job SET state = 'ready', not_before = NULL, updated_at = ?
         WHERE id = ? AND kind = 'media.generate'
           AND state IN ('pending', 'ready', 'retry_scheduled')",
        params![now, job_id],
    )?;
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        "media_generation.cancel_requested",
        &EventScope {
            session_id: Some(turn.session_id.clone()),
            turn_id: Some(turn.id.clone()),
            input_id: Some(turn.primary_input_id.clone()),
            ..EventScope::default()
        },
        &serde_json::json!({
            "operationId": operation_id,
            "jobId": job_id,
            "reason": reason,
            "source": "session_turn_cancel"
        }),
        now,
    )?;
    Ok((operation_id, job_id))
}

pub(crate) fn fail_session_turn_job_tx(
    tx: &rusqlite::Transaction<'_>,
    request: &FailJob,
    now: i64,
) -> Result<Option<SchedulerJobRecord>> {
    let turn = tx
        .query_row(
            &format!("{SESSION_TURN_SELECT} WHERE job_id = ?"),
            params![request.job_id],
            row_to_session_turn,
        )
        .optional()?
        .ok_or_else(|| {
            SystemServiceError::Invariant("session turn job has no durable turn".to_string())
        })?;

    if matches!(turn.state.as_str(), "running" | "cancel_requested") {
        let attempt_id = turn.current_attempt_id.as_deref().ok_or_else(|| {
            SystemServiceError::Invariant(
                "promoted session turn has no current attempt".to_string(),
            )
        })?;
        let attempt = get_attempt_tx(tx, attempt_id)?;
        if attempt.worker_id != request.worker_id || attempt.lease_token != request.lease_token {
            return Err(SystemServiceError::Invariant(
                "session turn worker failure does not own its active attempt".to_string(),
            ));
        }
        let job = crate::scheduler::get_job_tx(tx, &request.job_id)?;
        require_session_turn_recovery_tx(
            tx,
            &job,
            &turn,
            &attempt,
            SessionTurnRecoveryRequirement {
                reason: "worker_reported_failure_after_promotion",
                cause: Some(&request.error),
                retain_budget: false,
            },
            now,
        )?;
        return Ok(Some(crate::scheduler::get_job_tx(tx, &request.job_id)?));
    }

    let (turn_state, event_type, error) = match turn.state.as_str() {
        "queued" => {
            let attempt_exists: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM session_attempt WHERE turn_id = ?)",
                params![turn.id],
                |row| row.get(0),
            )?;
            if attempt_exists || turn.current_attempt_id.is_some() {
                return Err(SystemServiceError::Invariant(
                    "queued session turn unexpectedly has an attempt".to_string(),
                ));
            }
            (
                "failed",
                "session.turn.failed",
                serde_json::json!({
                    "type": "worker_failure_before_attempt",
                    "error": request.error
                }),
            )
        }
        state if is_terminal_turn_state(state) => {
            return Err(SystemServiceError::Invariant(
                "terminal session turn still owns a running scheduler job".to_string(),
            ));
        }
        state => {
            return Err(SystemServiceError::Invariant(format!(
                "session turn job cannot fail from state {state}"
            )));
        }
    };
    let error_json = serde_json::to_string(&error)?;

    let updated_turn = tx.execute(
        "UPDATE session_turn
         SET state = ?, error_json = ?, updated_at = ?, finished_at = ?
         WHERE id = ? AND state = ?",
        params![turn_state, error_json, now, now, turn.id, turn.state],
    )?;
    let updated_input = tx.execute(
        "UPDATE session_input SET status = 'failed', updated_at = ?
         WHERE id = ? AND status = ?",
        params![now, turn.primary_input_id, "admitted"],
    )?;
    if updated_turn != 1 || updated_input != 1 {
        return Err(SystemServiceError::Invariant(
            "session turn worker failure lost its durable state".to_string(),
        ));
    }
    tx.execute(
        "UPDATE session SET updated_at = ? WHERE id = ?",
        params![now, turn.session_id],
    )?;
    let job = crate::scheduler::settle_job_without_retry_tx(
        tx,
        crate::scheduler::SessionTurnJobSettlement {
            job_id: &request.job_id,
            worker_id: &request.worker_id,
            lease_token: &request.lease_token,
            state: "failed",
            result: None,
            error: Some(&error),
        },
        now,
    )?;
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        event_type,
        &EventScope {
            session_id: Some(turn.session_id.clone()),
            turn_id: Some(turn.id.clone()),
            attempt_id: turn.current_attempt_id.clone(),
            input_id: Some(turn.primary_input_id.clone()),
            ..EventScope::default()
        },
        &serde_json::json!({
            "turnId": turn.id,
            "jobId": request.job_id,
            "state": turn_state,
            "error": error
        }),
        now,
    )?;
    Ok(Some(job))
}

pub(crate) fn reconcile_expired_session_turn_job_tx(
    tx: &rusqlite::Transaction<'_>,
    job: &SchedulerJobRecord,
    now: i64,
) -> Result<()> {
    let turn = tx
        .query_row(
            &format!("{SESSION_TURN_SELECT} WHERE job_id = ?"),
            params![job.id],
            row_to_session_turn,
        )
        .optional()?
        .ok_or_else(|| {
            SystemServiceError::Invariant("session turn job has no durable turn".to_string())
        })?;
    let attempt_id = turn.current_attempt_id.as_deref().ok_or_else(|| {
        SystemServiceError::Invariant("promoted session turn has no current attempt".to_string())
    })?;
    let attempt = get_attempt_tx(tx, attempt_id)?;
    if attempt.state != "running"
        || attempt.job_id != job.id
        || job.lease_owner.as_deref() != Some(attempt.worker_id.as_str())
        || job.lease_token.as_deref() != Some(attempt.lease_token.as_str())
    {
        return Err(SystemServiceError::Invariant(
            "expired session turn lease does not match its active attempt".to_string(),
        ));
    }

    let classification = classify_recovery_tx(tx, &turn)?;
    match classification {
        RecoveryClassification::Safe { retry_tool_ids } => {
            requeue_session_turn_tx(tx, job, &turn, &attempt, &retry_tool_ids, now)
        }
        RecoveryClassification::Required { reason } => require_session_turn_recovery_tx(
            tx,
            job,
            &turn,
            &attempt,
            SessionTurnRecoveryRequirement {
                reason: &reason,
                cause: None,
                retain_budget: false,
            },
            now,
        ),
    }
}

enum RecoveryClassification {
    Safe { retry_tool_ids: Vec<String> },
    Required { reason: String },
}

fn classify_recovery_tx(
    tx: &rusqlite::Transaction<'_>,
    turn: &SessionTurnRecord,
) -> Result<RecoveryClassification> {
    if turn.state == "cancel_requested" {
        return Ok(recovery_required("cancel_requested_owner_lost"));
    }
    if turn.state != "running" {
        return Err(SystemServiceError::Invariant(format!(
            "cannot classify recovery for turn state {}",
            turn.state
        )));
    }
    let (provider_max_attempts, idempotent_tool_max_attempts) =
        recovery_bounds(&turn.execution_binding)?;

    let provider_problem: Option<String> = {
        let mut stmt = tx.prepare(
            "SELECT state, output_observed, invocation_number, assistant_message_id,
                    error_json
             FROM provider_invocation WHERE turn_id = ?
             ORDER BY step ASC, invocation_number ASC, id ASC",
        )?;
        let rows = stmt.query_map(params![turn.id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, bool>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
            ))
        })?;
        let mut problem = None;
        for row in rows {
            let (state, output_observed, invocation_number, assistant_message_id, error_json) =
                row?;
            let retryable = error_json
                .as_deref()
                .map(serde_json::from_str::<serde_json::Value>)
                .transpose()?
                .as_ref()
                .and_then(|error| error.get("retryable"))
                .and_then(serde_json::Value::as_bool)
                == Some(true);
            let reason = match state.as_str() {
                "dispatched" | "output_observed" | "ambiguous" => {
                    Some("provider_invocation_ambiguous")
                }
                "failed_before_output" if output_observed => {
                    Some("provider_failure_has_output_evidence")
                }
                "failed_before_output" if !retryable => Some("provider_failure_is_not_retryable"),
                "failed_before_output" if invocation_number >= provider_max_attempts => {
                    Some("provider_attempt_bound_exhausted")
                }
                "failed_before_output" => None,
                "succeeded" if !output_observed || assistant_message_id.is_none() => {
                    Some("provider_success_evidence_incomplete")
                }
                "succeeded" => None,
                _ => Some("provider_invocation_state_unknown"),
            };
            if let Some(reason) = reason {
                problem = Some(reason.to_string());
                break;
            }
        }
        problem
    };
    if let Some(reason) = provider_problem {
        return Ok(recovery_required(&reason));
    }

    let mut retry_tool_ids = Vec::new();
    let mut stmt = tx.prepare(
        "SELECT id, state, attempt_count, descriptor_json,
                current_invocation_attempt_id
         FROM tool_execution WHERE turn_id = ? ORDER BY created_at ASC, id ASC",
    )?;
    let rows = stmt.query_map(params![turn.id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, i64>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, Option<String>>(4)?,
        ))
    })?;
    for row in rows {
        let (execution_id, state, attempt_count, descriptor_json, attempt_id) = row?;
        match state.as_str() {
            "running" => {
                let descriptor: serde_json::Value = serde_json::from_str(&descriptor_json)?;
                let idempotent = descriptor
                    .get("idempotent")
                    .and_then(serde_json::Value::as_bool)
                    .unwrap_or(false);
                if !idempotent {
                    return Ok(recovery_required("non_idempotent_tool_owner_lost"));
                }
                if attempt_count >= idempotent_tool_max_attempts {
                    return Ok(recovery_required("idempotent_tool_attempt_bound_exhausted"));
                }
                if attempt_id.is_none() {
                    return Ok(recovery_required("running_tool_attempt_missing"));
                }
                retry_tool_ids.push(execution_id);
            }
            "recovery_required" => {
                return Ok(recovery_required("tool_recovery_already_required"));
            }
            "retry_ready" | "denied" | "approval_required" | "succeeded" | "failed"
            | "cancelled" => {}
            _ => return Ok(recovery_required("tool_execution_state_unknown")),
        }
    }
    Ok(RecoveryClassification::Safe { retry_tool_ids })
}

fn recovery_required(reason: &str) -> RecoveryClassification {
    RecoveryClassification::Required {
        reason: reason.to_string(),
    }
}

pub(crate) fn recovery_bounds(binding: &serde_json::Value) -> Result<(i64, i64)> {
    let recovery = binding
        .get("recovery")
        .and_then(serde_json::Value::as_object);
    let value = |key: &str| {
        recovery
            .and_then(|object| object.get(key))
            .and_then(serde_json::Value::as_i64)
            .filter(|value| *value > 0)
            .ok_or_else(|| {
                SystemServiceError::Invariant(format!(
                    "turn recovery binding is missing positive {key}"
                ))
            })
    };
    Ok((
        value("providerMaxAttempts")?,
        value("idempotentToolMaxAttempts")?,
    ))
}

fn requeue_session_turn_tx(
    tx: &rusqlite::Transaction<'_>,
    job: &SchedulerJobRecord,
    turn: &SessionTurnRecord,
    attempt: &SessionAttemptRecord,
    retry_tool_ids: &[String],
    now: i64,
) -> Result<()> {
    let evidence = serde_json::json!({
        "type": "safe_recovery_requeue",
        "jobId": job.id,
        "attemptId": attempt.id,
        "retryToolExecutionIds": retry_tool_ids
    });
    let evidence_json = serde_json::to_string(&evidence)?;
    for execution_id in retry_tool_ids {
        let invocation_attempt_id: String = tx.query_row(
            "SELECT current_invocation_attempt_id FROM tool_execution
             WHERE id = ? AND state = 'running'",
            params![execution_id],
            |row| row.get(0),
        )?;
        let updated_attempt = tx.execute(
            "UPDATE tool_execution_attempt
             SET state = 'interrupted', error_json = ?, updated_at = ?, finished_at = ?
             WHERE id = ? AND execution_id = ? AND state = 'running'",
            params![evidence_json, now, now, invocation_attempt_id, execution_id],
        )?;
        let updated_execution = tx.execute(
            "UPDATE tool_execution
             SET state = 'retry_ready', error_json = ?, updated_at = ?
             WHERE id = ? AND state = 'running'
               AND current_invocation_attempt_id = ?",
            params![evidence_json, now, execution_id, invocation_attempt_id],
        )?;
        if updated_attempt != 1 || updated_execution != 1 {
            return Err(SystemServiceError::Invariant(
                "safe tool recovery lost its running physical attempt".to_string(),
            ));
        }
    }
    let updated_attempt = tx.execute(
        "UPDATE session_attempt
         SET state = 'interrupted', error_json = ?, updated_at = ?, finished_at = ?
         WHERE id = ? AND state = 'running'",
        params![evidence_json, now, now, attempt.id],
    )?;
    let updated_turn = tx.execute(
        "UPDATE session_turn
         SET state = 'queued', current_attempt_id = NULL, error_json = NULL,
             updated_at = ?, finished_at = NULL
         WHERE id = ? AND current_attempt_id = ?
           AND state IN ('running', 'cancel_requested')",
        params![now, turn.id, attempt.id],
    )?;
    let updated_job = tx.execute(
        "UPDATE scheduler_job
         SET state = 'ready', lease_owner = NULL, lease_token = NULL,
             lease_expires_at = NULL, last_error_json = ?, updated_at = ?,
             finished_at = NULL
         WHERE id = ? AND state = 'running' AND lease_owner = ? AND lease_token = ?",
        params![
            evidence_json,
            now,
            job.id,
            attempt.worker_id,
            attempt.lease_token
        ],
    )?;
    if updated_attempt != 1 || updated_turn != 1 || updated_job != 1 {
        return Err(SystemServiceError::Invariant(
            "safe session turn recovery lost its active owner".to_string(),
        ));
    }
    tx.execute(
        "UPDATE session_turn_control SET status = 'cancelled', updated_at = ?
         WHERE turn_id = ? AND attempt_id = ? AND kind = 'interrupt'
           AND status = 'pending'",
        params![now, turn.id, attempt.id],
    )?;
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        "session.turn.requeued_after_recovery",
        &EventScope {
            session_id: Some(turn.session_id.clone()),
            turn_id: Some(turn.id.clone()),
            attempt_id: Some(attempt.id.clone()),
            input_id: Some(turn.primary_input_id.clone()),
            ..EventScope::default()
        },
        &evidence,
        now,
    )?;
    crate::scheduler::append_scheduler_event_tx(
        tx,
        "scheduler.job.requeued_after_recovery",
        &job.id,
        &evidence,
        now,
    )
}

pub(crate) struct SessionTurnRecoveryRequirement<'a> {
    pub(crate) reason: &'a str,
    pub(crate) cause: Option<&'a serde_json::Value>,
    pub(crate) retain_budget: bool,
}

pub(crate) fn require_session_turn_recovery_tx(
    tx: &rusqlite::Transaction<'_>,
    job: &SchedulerJobRecord,
    turn: &SessionTurnRecord,
    attempt: &SessionAttemptRecord,
    requirement: SessionTurnRecoveryRequirement<'_>,
    now: i64,
) -> Result<()> {
    let mut error = serde_json::json!({
        "type": "session_turn_recovery_required",
        "reason": requirement.reason,
        "jobId": job.id,
        "attemptId": attempt.id
    });
    if let Some(cause) = requirement.cause {
        error["cause"] = cause.clone();
    }
    let error_json = serde_json::to_string(&error)?;
    crate::provider_invocations::ambiguate_open_provider_invocations_tx(
        tx,
        &attempt.id,
        &error,
        now,
    )?;
    tx.execute(
        "UPDATE tool_execution_attempt
         SET state = 'recovery_required', error_json = ?, updated_at = ?, finished_at = ?
         WHERE session_attempt_id = ? AND state = 'running'",
        params![error_json, now, now, attempt.id],
    )?;
    tx.execute(
        "UPDATE tool_execution
         SET state = 'recovery_required', error_json = ?, updated_at = ?, finished_at = ?
         WHERE turn_id = ? AND state = 'running'",
        params![error_json, now, now, turn.id],
    )?;
    let updated_attempt = tx.execute(
        "UPDATE session_attempt
         SET state = 'recovery_required', error_json = ?, updated_at = ?, finished_at = ?
         WHERE id = ? AND state = 'running'",
        params![error_json, now, now, attempt.id],
    )?;
    let updated_turn = tx.execute(
        "UPDATE session_turn
         SET state = 'recovery_required', error_json = ?, updated_at = ?, finished_at = ?
         WHERE id = ? AND current_attempt_id = ?
           AND state IN ('running', 'cancel_requested')",
        params![error_json, now, now, turn.id, attempt.id],
    )?;
    let updated_input = tx.execute(
        "UPDATE session_input SET status = 'failed', updated_at = ?
         WHERE id = ? AND status = 'promoted'",
        params![now, turn.primary_input_id],
    )?;
    let updated_job = tx.execute(
        "UPDATE scheduler_job
         SET state = 'failed', lease_owner = NULL, lease_token = NULL,
             lease_expires_at = NULL, last_error_json = ?, updated_at = ?, finished_at = ?
         WHERE id = ? AND state = 'running' AND lease_owner = ? AND lease_token = ?",
        params![
            error_json,
            now,
            now,
            job.id,
            attempt.worker_id,
            attempt.lease_token
        ],
    )?;
    if updated_attempt != 1 || updated_turn != 1 || updated_input != 1 || updated_job != 1 {
        return Err(SystemServiceError::Invariant(
            "session turn recovery-required transition lost its active owner".to_string(),
        ));
    }
    tx.execute(
        "UPDATE session_turn_control SET status = 'cancelled', updated_at = ?
         WHERE turn_id = ? AND status = 'pending'",
        params![now, turn.id],
    )?;
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        "session.turn.recovery_required",
        &EventScope {
            session_id: Some(turn.session_id.clone()),
            turn_id: Some(turn.id.clone()),
            attempt_id: Some(attempt.id.clone()),
            input_id: Some(turn.primary_input_id.clone()),
            ..EventScope::default()
        },
        &error,
        now,
    )?;
    crate::scheduler::append_scheduler_event_tx(tx, "scheduler.job.failed", &job.id, &error, now)?;
    if !requirement.retain_budget {
        if let Some(grant_id) = &job.budget_grant_id {
            crate::budget::commit_budget_grant_tx(tx, grant_id, now)?;
        }
    }
    let terminal_job = crate::scheduler::get_job_tx(tx, &job.id)?;
    crate::team::settle_team_delegation_child_tx(tx, &terminal_job, now)?;
    Ok(())
}

pub(crate) fn validate_turn_attempt_lease_tx(
    tx: &rusqlite::Transaction<'_>,
    identity: &TurnAttemptLeaseIdentity<'_>,
    now: i64,
) -> Result<Option<String>> {
    tx.query_row(
        "SELECT turn.execution_binding_digest
         FROM session_turn turn
         INNER JOIN session_attempt attempt
           ON attempt.id = turn.current_attempt_id AND attempt.turn_id = turn.id
         INNER JOIN scheduler_job job ON job.id = turn.job_id
         WHERE turn.id = ? AND turn.session_id = ? AND turn.primary_input_id = ?
           AND turn.job_id = ? AND turn.state IN ('running', 'cancel_requested')
           AND attempt.id = ? AND attempt.input_id = ? AND attempt.job_id = ?
           AND attempt.worker_id = ? AND attempt.lease_token = ? AND attempt.state = 'running'
           AND job.kind = 'session.turn' AND job.state = 'running'
           AND job.lease_owner = ? AND job.lease_token = ? AND job.lease_expires_at > ?",
        params![
            identity.turn_id,
            identity.session_id,
            identity.input_id,
            identity.job_id,
            identity.attempt_id,
            identity.input_id,
            identity.job_id,
            identity.worker_id,
            identity.lease_token,
            identity.worker_id,
            identity.lease_token,
            now
        ],
        |row| row.get(0),
    )
    .optional()
    .map_err(Into::into)
}

fn validate_session_turn_job_lease(
    job: &crate::SchedulerJobRecord,
    request: &StartSessionTurnAttempt,
    now: i64,
) -> Result<()> {
    if job.kind != "session.turn"
        || job.state != "running"
        || job.lease_owner.as_deref() != Some(request.worker_id.as_str())
        || job.lease_token.as_deref() != Some(request.lease_token.as_str())
        || job
            .lease_expires_at
            .is_none_or(|expires_at| expires_at <= now)
        || job.max_attempts != 1
        || job.retry_policy.strategy != crate::RetryStrategy::None
        || job.concurrency_key.as_deref()
            != Some(format!("session:{}", request.session_id).as_str())
    {
        return Err(SystemServiceError::Invariant(
            "session turn job does not own the expected scheduler lease".to_string(),
        ));
    }
    Ok(())
}

fn validate_job_payload(
    payload: &serde_json::Value,
    request: &StartSessionTurnAttempt,
) -> Result<()> {
    let matches = payload.get("sessionId").and_then(serde_json::Value::as_str)
        == Some(request.session_id.as_str())
        && payload.get("turnId").and_then(serde_json::Value::as_str)
            == Some(request.turn_id.as_str())
        && payload.get("inputId").and_then(serde_json::Value::as_str)
            == Some(request.input_id.as_str());
    if !matches {
        return Err(SystemServiceError::Invariant(
            "session turn job payload does not match the admitted turn".to_string(),
        ));
    }
    Ok(())
}

fn ensure_exact_turn_identity(
    turn: &SessionTurnRecord,
    session_id: &str,
    input_id: &str,
    job_id: &str,
) -> Result<()> {
    if turn.session_id != session_id || turn.primary_input_id != input_id || turn.job_id != job_id {
        return Err(SystemServiceError::Invariant(
            "session turn identity tuple does not match".to_string(),
        ));
    }
    Ok(())
}

pub(crate) fn get_attempt_tx(
    tx: &rusqlite::Transaction<'_>,
    attempt_id: &str,
) -> Result<SessionAttemptRecord> {
    tx.query_row(
        &format!("{SESSION_ATTEMPT_SELECT} WHERE id = ?"),
        params![attempt_id],
        row_to_session_attempt,
    )
    .map_err(Into::into)
}

fn find_attempt_by_lease_tx(
    tx: &rusqlite::Transaction<'_>,
    turn_id: &str,
    job_id: &str,
    worker_id: &str,
    lease_token: &str,
) -> Result<Option<SessionAttemptRecord>> {
    tx.query_row(
        &format!(
            "{SESSION_ATTEMPT_SELECT} WHERE turn_id = ? AND job_id = ?
             AND worker_id = ? AND lease_token = ?"
        ),
        params![turn_id, job_id, worker_id, lease_token],
        row_to_session_attempt,
    )
    .optional()
    .map_err(Into::into)
}

fn promoted_input_message_tx(
    tx: &rusqlite::Transaction<'_>,
    session_id: &str,
    input_id: &str,
) -> Result<crate::SessionMessageRecord> {
    find_message_by_idempotency_tx(
        tx,
        session_id,
        &format!("session.input.promoted:{input_id}"),
    )?
    .ok_or_else(|| {
        SystemServiceError::Invariant(
            "started session attempt is missing its promoted input message".to_string(),
        )
    })
}

fn append_cancel_event_tx(
    tx: &rusqlite::Transaction<'_>,
    request: &RequestSessionTurnCancel,
    status: &str,
    now: i64,
) -> Result<()> {
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        if status == "cancelled" {
            "session.turn.cancelled"
        } else {
            "session.turn.cancel_requested"
        },
        &EventScope {
            session_id: Some(request.session_id.clone()),
            turn_id: Some(request.turn_id.clone()),
            input_id: Some(request.input_id.clone()),
            ..EventScope::default()
        },
        &serde_json::json!({
            "turnId": request.turn_id,
            "jobId": request.job_id,
            "status": status,
            "reason": request.reason
        }),
        now,
    )
}

fn settlement_error(request: &SettleSessionTurn) -> Option<serde_json::Value> {
    if request.outcome == "succeeded" {
        return None;
    }
    request.error.clone().or_else(|| {
        Some(serde_json::json!({
            "type": request.outcome,
            "reason": request.reason
        }))
    })
}

fn input_state_for_outcome(outcome: &str) -> &'static str {
    match outcome {
        "succeeded" => "completed",
        "cancelled" | "interrupted" => "cancelled",
        _ => "failed",
    }
}

fn terminal_message_key(turn_id: &str) -> String {
    format!("session.turn.terminal:{turn_id}")
}

pub(crate) fn get_terminal_assistant_message_tx(
    tx: &rusqlite::Transaction<'_>,
    session_id: &str,
    turn_id: &str,
) -> Result<Option<crate::SessionMessageRecord>> {
    find_message_by_idempotency_tx(tx, session_id, &terminal_message_key(turn_id))
}

pub(crate) fn is_terminal_turn_state(state: &str) -> bool {
    matches!(
        state,
        "succeeded" | "failed" | "cancelled" | "interrupted" | "recovery_required"
    )
}

fn validate_start_request(request: &StartSessionTurnAttempt) -> Result<()> {
    validate_execution_identity(
        &request.session_id,
        &request.turn_id,
        &request.input_id,
        &request.job_id,
        &request.worker_id,
        &request.lease_token,
    )
}

fn validate_settlement_request(request: &SettleSessionTurn) -> Result<()> {
    validate_execution_identity(
        &request.session_id,
        &request.turn_id,
        &request.input_id,
        &request.job_id,
        &request.worker_id,
        &request.lease_token,
    )?;
    if request.attempt_id.is_empty()
        || !matches!(
            request.outcome.as_str(),
            "succeeded" | "failed" | "cancelled" | "interrupted" | "recovery_required"
        )
    {
        return Err(SystemServiceError::InvalidInput(
            "invalid session turn settlement".to_string(),
        ));
    }
    if request.outcome == "succeeded" {
        if request
            .provider_invocation_id
            .as_deref()
            .is_none_or(str::is_empty)
            || request.assistant_message.is_none()
        {
            return Err(SystemServiceError::InvalidInput(
                "successful session turn settlement requires provider invocation and assistant output"
                    .to_string(),
            ));
        }
        if request.assistant_message.as_ref().is_some_and(|content| {
            content.as_array().is_some_and(|parts| {
                parts.iter().any(|part| {
                    part.get("type").and_then(serde_json::Value::as_str) == Some("tool_call")
                })
            })
        }) {
            return Err(SystemServiceError::InvalidInput(
                "successful terminal assistant output cannot contain unresolved tool calls"
                    .to_string(),
            ));
        }
    }
    Ok(())
}

fn validate_cancel_request(request: &RequestSessionTurnCancel) -> Result<()> {
    if request.session_id.is_empty()
        || request.turn_id.is_empty()
        || request.input_id.is_empty()
        || request.job_id.is_empty()
        || request.reason.is_empty()
    {
        return Err(SystemServiceError::InvalidInput(
            "session turn cancel identity and reason must not be empty".to_string(),
        ));
    }
    Ok(())
}

fn validate_execution_identity(
    session_id: &str,
    turn_id: &str,
    input_id: &str,
    job_id: &str,
    worker_id: &str,
    lease_token: &str,
) -> Result<()> {
    if [
        session_id,
        turn_id,
        input_id,
        job_id,
        worker_id,
        lease_token,
    ]
    .iter()
    .any(|value| value.is_empty())
    {
        return Err(SystemServiceError::InvalidInput(
            "session turn execution identity must not be empty".to_string(),
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
