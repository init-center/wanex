use crate::event_store::append_event_tx;
use crate::rows::row_to_session_message;
use crate::{AppendSessionMessage, EventScope, Result, SessionMessageRecord, SystemService};
use rusqlite::{params, OptionalExtension};
use uuid::Uuid;

impl SystemService {
    pub fn list_session_messages(&self, session_id: &str) -> Result<Vec<SessionMessageRecord>> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare(
            "SELECT id, session_id, run_id, input_id, role, status,
                    content_json, provider_state_json, created_at, updated_at
             FROM session_message
             WHERE session_id = ?
             ORDER BY created_at ASC, id ASC",
        )?;
        let rows = stmt.query_map(params![session_id], row_to_session_message)?;
        let mut messages = Vec::new();
        for row in rows {
            messages.push(row?);
        }
        Ok(messages)
    }

    pub fn append_session_message(
        &self,
        request: &AppendSessionMessage,
    ) -> Result<Option<SessionMessageRecord>> {
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
            return Ok(None);
        }

        if request.idempotency_key.is_empty() {
            return Err(crate::SystemServiceError::InvalidInput(
                "session message idempotency key must not be empty".into(),
            ));
        }
        let existing = tx
            .query_row(
                "SELECT id, session_id, run_id, input_id, role, status,
                        content_json, provider_state_json, created_at, updated_at
                 FROM session_message WHERE session_id = ? AND idempotency_key = ?",
                params![request.session_id, request.idempotency_key],
                row_to_session_message,
            )
            .optional()?;
        if let Some(existing) = existing {
            if existing.run_id.as_deref() != Some(request.run_id.as_str())
                || existing.input_id.as_deref() != Some(request.input_id.as_str())
                || existing.role != request.role
                || existing.content != request.content
            {
                return Err(crate::SystemServiceError::Invariant(
                    "conflicting repeated session message append".into(),
                ));
            }
            tx.commit()?;
            return Ok(Some(existing));
        }

        let message_id = format!("msg_{}", Uuid::now_v7());
        tx.execute(
            "INSERT INTO session_message (
                id, session_id, run_id, input_id, role, status,
                content_json, provider_state_json, idempotency_key, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, 'completed', ?, NULL, ?, ?, ?)",
            params![
                message_id,
                request.session_id,
                request.run_id,
                request.input_id,
                request.role,
                serde_json::to_string(&request.content)?,
                request.idempotency_key,
                now,
                now
            ],
        )?;
        append_event_tx(
            &tx,
            &format!("evt_{}", Uuid::now_v7()),
            "session.message.appended",
            &EventScope {
                session_id: Some(request.session_id.clone()),
                run_id: Some(request.run_id.clone()),
                input_id: Some(request.input_id.clone()),
                message_id: Some(message_id.clone()),
                resource_id: None,
                ..EventScope::default()
            },
            &serde_json::json!({
                "messageId": message_id,
                "role": request.role,
                "status": "completed"
            }),
            now,
        )?;
        let message = tx.query_row(
            "SELECT id, session_id, run_id, input_id, role, status,
                    content_json, provider_state_json, created_at, updated_at
             FROM session_message
             WHERE id = ?",
            params![message_id],
            row_to_session_message,
        )?;
        tx.commit()?;
        Ok(Some(message))
    }
}
