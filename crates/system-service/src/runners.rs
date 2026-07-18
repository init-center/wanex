use crate::event_store::append_event_tx;
use crate::run_control::cancel_pending_run_controls_for_terminal_run_tx;
use crate::{CancelRun, EventScope, FailRun, Result, RunnerClaim, SystemService};
use rusqlite::{params, OptionalExtension};
use serde_json::Value;
use uuid::Uuid;

impl SystemService {
    pub fn claim_runner(
        &self,
        session_id: &str,
        runner_id: &str,
        lease_ms: i64,
    ) -> Result<Option<RunnerClaim>> {
        let now = crate::util::now_ms();
        let expires_at = now + lease_ms;
        let lease_token = format!("lease_{}", Uuid::now_v7());
        let run_id = format!("run_{}", Uuid::now_v7());
        let mut conn = self.connect()?;
        let tx = conn.transaction()?;

        let active_lease: Option<i64> = tx
            .query_row(
                "SELECT expires_at FROM session_runner_lease WHERE session_id = ?",
                params![session_id],
                |row| row.get(0),
            )
            .optional()?;
        if active_lease.is_some_and(|expires| expires > now) {
            return Ok(None);
        }
        let expired_leases = {
            let mut stmt = tx.prepare(
                "SELECT run_id, input_id FROM session_runner_lease
                 WHERE session_id = ? AND expires_at <= ?",
            )?;
            let rows = stmt.query_map(params![session_id, now], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?;
            let mut leases = Vec::new();
            for row in rows {
                leases.push(row?);
            }
            leases
        };
        for (expired_run_id, expired_input_id) in expired_leases {
            tx.execute(
                "UPDATE session_run
                 SET status = 'expired', updated_at = ?, finished_at = ?
                 WHERE id = ? AND status = 'running'",
                params![now, now, expired_run_id],
            )?;
            tx.execute(
                "UPDATE session_input
                 SET status = 'retry_pending', updated_at = ?
                 WHERE id = ? AND status = 'claimed'",
                params![now, expired_input_id],
            )?;
        }
        tx.execute(
            "DELETE FROM session_runner_lease WHERE session_id = ? AND expires_at <= ?",
            params![session_id, now],
        )?;

        let input_id: Option<String> = tx
            .query_row(
                "SELECT id FROM session_input
                 WHERE session_id = ? AND status IN ('admitted', 'retry_pending')
                 ORDER BY created_at ASC, id ASC
                 LIMIT 1",
                params![session_id],
                |row| row.get(0),
            )
            .optional()?;
        let Some(input_id) = input_id else {
            tx.commit()?;
            return Ok(None);
        };

        tx.execute(
            "UPDATE session_input SET status = 'claimed', updated_at = ? WHERE id = ?",
            params![now, input_id],
        )?;
        tx.execute(
            "INSERT INTO session_run (
                id, session_id, input_id, runner_id, status, lease_token,
                lease_expires_at, started_at, updated_at, finished_at, error_json
             ) VALUES (?, ?, ?, ?, 'running', ?, ?, ?, ?, NULL, NULL)",
            params![
                run_id,
                session_id,
                input_id,
                runner_id,
                lease_token,
                expires_at,
                now,
                now
            ],
        )?;
        append_event_tx(
            &tx,
            &format!("evt_{}", Uuid::now_v7()),
            "session.run.claimed",
            &EventScope {
                session_id: Some(session_id.to_string()),
                run_id: Some(run_id.clone()),
                input_id: Some(input_id.clone()),
                message_id: None,
                resource_id: None,
                ..EventScope::default()
            },
            &serde_json::json!({
                "runId": run_id,
                "inputId": input_id,
                "runnerId": runner_id,
                "status": "running"
            }),
            now,
        )?;
        tx.execute(
            "INSERT INTO session_runner_lease (
                session_id, runner_id, run_id, input_id, lease_token,
                claimed_at, heartbeat_at, expires_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                session_id,
                runner_id,
                run_id,
                input_id,
                lease_token,
                now,
                now,
                expires_at
            ],
        )?;
        tx.commit()?;

        Ok(Some(RunnerClaim {
            session_id: session_id.to_string(),
            input_id,
            run_id,
            runner_id: runner_id.to_string(),
            lease_token,
            lease_expires_at: expires_at,
        }))
    }

    pub fn heartbeat_runner(
        &self,
        session_id: &str,
        runner_id: &str,
        lease_token: &str,
        lease_ms: i64,
    ) -> Result<Option<RunnerClaim>> {
        let now = crate::util::now_ms();
        let expires_at = now + lease_ms;
        let conn = self.connect()?;
        let updated = conn.execute(
            "UPDATE session_runner_lease
             SET heartbeat_at = ?, expires_at = ?
             WHERE session_id = ? AND runner_id = ? AND lease_token = ?",
            params![now, expires_at, session_id, runner_id, lease_token],
        )?;
        if updated == 0 {
            return Ok(None);
        }
        conn.execute(
            "UPDATE session_run SET lease_expires_at = ?, updated_at = ?
             WHERE session_id = ? AND runner_id = ? AND lease_token = ? AND status = 'running'",
            params![expires_at, now, session_id, runner_id, lease_token],
        )?;
        self.get_runner_claim(session_id)
    }

    pub fn complete_run(
        &self,
        session_id: &str,
        run_id: &str,
        input_id: &str,
        runner_id: &str,
        lease_token: &str,
        assistant_message: Option<&Value>,
    ) -> Result<bool> {
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = conn.transaction()?;
        let lease_exists: bool = tx.query_row(
            "SELECT EXISTS(
               SELECT 1 FROM session_runner_lease
               WHERE session_id = ? AND run_id = ? AND input_id = ?
                 AND runner_id = ? AND lease_token = ?
             )",
            params![session_id, run_id, input_id, runner_id, lease_token],
            |row| row.get(0),
        )?;
        if !lease_exists {
            tx.commit()?;
            return Ok(false);
        }

        if let Some(content) = assistant_message {
            let message_id = format!("msg_{}", Uuid::now_v7());
            tx.execute(
                "INSERT INTO session_message (
                    id, session_id, run_id, input_id, role, status,
                    content_json, provider_state_json, created_at, updated_at
                 ) VALUES (?, ?, ?, ?, 'assistant', 'completed', ?, NULL, ?, ?)",
                params![
                    message_id,
                    session_id,
                    run_id,
                    input_id,
                    serde_json::to_string(content)?,
                    now,
                    now
                ],
            )?;
            append_event_tx(
                &tx,
                &format!("evt_{}", Uuid::now_v7()),
                "session.message.appended",
                &EventScope {
                    session_id: Some(session_id.to_string()),
                    run_id: Some(run_id.to_string()),
                    input_id: Some(input_id.to_string()),
                    message_id: Some(message_id),
                    resource_id: None,
                    ..EventScope::default()
                },
                &serde_json::json!({
                    "role": "assistant",
                    "status": "completed"
                }),
                now,
            )?;
        }

        tx.execute(
            "UPDATE session_input SET status = 'completed', updated_at = ? WHERE id = ?",
            params![now, input_id],
        )?;
        tx.execute(
            "UPDATE session_run SET status = 'completed', updated_at = ?, finished_at = ?
             WHERE id = ?",
            params![now, now, run_id],
        )?;
        tx.execute(
            "DELETE FROM session_runner_lease
             WHERE session_id = ? AND runner_id = ? AND lease_token = ?",
            params![session_id, runner_id, lease_token],
        )?;
        cancel_pending_run_controls_for_terminal_run_tx(&tx, session_id, run_id, now, None)?;
        append_event_tx(
            &tx,
            &format!("evt_{}", Uuid::now_v7()),
            "session.run.completed",
            &EventScope {
                session_id: Some(session_id.to_string()),
                run_id: Some(run_id.to_string()),
                input_id: Some(input_id.to_string()),
                message_id: None,
                resource_id: None,
                ..EventScope::default()
            },
            &serde_json::json!({
                "runId": run_id,
                "inputId": input_id,
                "status": "completed"
            }),
            now,
        )?;
        tx.commit()?;
        Ok(true)
    }

    pub fn fail_run(&self, request: &FailRun) -> Result<bool> {
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = conn.transaction()?;
        let lease_exists: bool = tx.query_row(
            "SELECT EXISTS(
               SELECT 1 FROM session_runner_lease
               WHERE session_id = ? AND run_id = ? AND input_id = ?
                 AND runner_id = ? AND lease_token = ?
             )",
            params![
                request.session_id,
                request.run_id,
                request.input_id,
                request.runner_id,
                request.lease_token
            ],
            |row| row.get(0),
        )?;
        if !lease_exists {
            tx.commit()?;
            return Ok(false);
        }

        tx.execute(
            "UPDATE session_input SET status = 'failed', updated_at = ? WHERE id = ?",
            params![now, request.input_id],
        )?;
        tx.execute(
            "UPDATE session_run
             SET status = 'failed', updated_at = ?, finished_at = ?, error_json = ?
             WHERE id = ?",
            params![
                now,
                now,
                serde_json::to_string(&request.error)?,
                request.run_id
            ],
        )?;
        tx.execute(
            "DELETE FROM session_runner_lease
             WHERE session_id = ? AND runner_id = ? AND lease_token = ?",
            params![request.session_id, request.runner_id, request.lease_token],
        )?;
        cancel_pending_run_controls_for_terminal_run_tx(
            &tx,
            &request.session_id,
            &request.run_id,
            now,
            None,
        )?;
        append_event_tx(
            &tx,
            &format!("evt_{}", Uuid::now_v7()),
            "session.run.failed",
            &EventScope {
                session_id: Some(request.session_id.clone()),
                run_id: Some(request.run_id.clone()),
                input_id: Some(request.input_id.clone()),
                message_id: None,
                resource_id: None,
                ..EventScope::default()
            },
            &serde_json::json!({
                "runId": request.run_id,
                "inputId": request.input_id,
                "status": "failed",
                "error": request.error
            }),
            now,
        )?;
        tx.commit()?;
        Ok(true)
    }

    pub fn release_runner(
        &self,
        session_id: &str,
        runner_id: &str,
        lease_token: &str,
    ) -> Result<bool> {
        let conn = self.connect()?;
        let updated = conn.execute(
            "DELETE FROM session_runner_lease
             WHERE session_id = ? AND runner_id = ? AND lease_token = ?",
            params![session_id, runner_id, lease_token],
        )?;
        Ok(updated > 0)
    }

    pub fn cancel_run(&self, request: &CancelRun) -> Result<bool> {
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = conn.transaction()?;
        let updated_run = tx.execute(
            "UPDATE session_run
             SET status = 'cancelled', updated_at = ?, finished_at = ?,
                 error_json = ?
             WHERE id = ? AND session_id = ? AND input_id = ?
               AND status = 'running'",
            params![
                now,
                now,
                serde_json::to_string(&serde_json::json!({
                    "type": "cancelled",
                    "reason": request.reason
                }))?,
                request.run_id,
                request.session_id,
                request.input_id
            ],
        )?;
        if updated_run == 0 {
            tx.commit()?;
            return Ok(false);
        }
        tx.execute(
            "UPDATE session_input
             SET status = 'cancelled', updated_at = ?
             WHERE id = ? AND session_id = ? AND status = 'claimed'",
            params![now, request.input_id, request.session_id],
        )?;
        tx.execute(
            "DELETE FROM session_runner_lease
             WHERE session_id = ? AND run_id = ? AND input_id = ?",
            params![request.session_id, request.run_id, request.input_id],
        )?;
        cancel_pending_run_controls_for_terminal_run_tx(
            &tx,
            &request.session_id,
            &request.run_id,
            now,
            None,
        )?;
        append_event_tx(
            &tx,
            &format!("evt_{}", Uuid::now_v7()),
            "session.run.cancelled",
            &EventScope {
                session_id: Some(request.session_id.clone()),
                run_id: Some(request.run_id.clone()),
                input_id: Some(request.input_id.clone()),
                message_id: None,
                resource_id: None,
                ..EventScope::default()
            },
            &serde_json::json!({
                "runId": request.run_id,
                "inputId": request.input_id,
                "status": "cancelled",
                "reason": request.reason
            }),
            now,
        )?;
        tx.commit()?;
        Ok(true)
    }

    fn get_runner_claim(&self, session_id: &str) -> Result<Option<RunnerClaim>> {
        let conn = self.connect()?;
        conn.query_row(
            "SELECT session_id, input_id, run_id, runner_id, lease_token, expires_at
             FROM session_runner_lease WHERE session_id = ?",
            params![session_id],
            |row| {
                Ok(RunnerClaim {
                    session_id: row.get(0)?,
                    input_id: row.get(1)?,
                    run_id: row.get(2)?,
                    runner_id: row.get(3)?,
                    lease_token: row.get(4)?,
                    lease_expires_at: row.get(5)?,
                })
            },
        )
        .optional()
        .map_err(Into::into)
    }
}
