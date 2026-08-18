use crate::event_store::append_event_tx;
use crate::rows::row_to_session_message;
use crate::{
    AppendSessionMessage, EventScope, Result, SessionMessageRecord, SystemService,
    SystemServiceError,
};
use rusqlite::{params, params_from_iter, OptionalExtension};
use uuid::Uuid;

pub(crate) const SESSION_MESSAGE_SELECT: &str = "SELECT id, session_id, sequence,
    turn_id, attempt_id, input_id, role, status, content_json,
    provider_state_json, execution_binding_digest, created_at, updated_at
    FROM session_message";

impl SystemService {
    pub fn list_session_messages(&self, session_id: &str) -> Result<Vec<SessionMessageRecord>> {
        self.list_session_message_window(session_id, None, None)
    }

    pub fn list_session_message_window(
        &self,
        session_id: &str,
        before_sequence: Option<i64>,
        limit: Option<i64>,
    ) -> Result<Vec<SessionMessageRecord>> {
        validate_message_window(before_sequence, limit)?;
        let conn = self.connect()?;
        let mut messages = match (before_sequence, limit) {
            (None, None) => {
                let mut stmt = conn.prepare(&format!(
                    "{SESSION_MESSAGE_SELECT} WHERE session_id = ? ORDER BY sequence ASC"
                ))?;
                let rows = stmt.query_map(params![session_id], row_to_session_message)?;
                collect_rows(rows)?
            }
            (Some(before), None) => {
                let mut stmt = conn.prepare(&format!(
                    "{SESSION_MESSAGE_SELECT} WHERE session_id = ? AND sequence < ?
                     ORDER BY sequence ASC"
                ))?;
                let rows = stmt.query_map(params![session_id, before], row_to_session_message)?;
                collect_rows(rows)?
            }
            (None, Some(window_limit)) => {
                let mut stmt = conn.prepare(&format!(
                    "{SESSION_MESSAGE_SELECT} WHERE session_id = ?
                     ORDER BY sequence DESC LIMIT ?"
                ))?;
                let rows =
                    stmt.query_map(params![session_id, window_limit], row_to_session_message)?;
                collect_rows(rows)?
            }
            (Some(before), Some(window_limit)) => {
                let mut stmt = conn.prepare(&format!(
                    "{SESSION_MESSAGE_SELECT} WHERE session_id = ? AND sequence < ?
                     ORDER BY sequence DESC LIMIT ?"
                ))?;
                let rows = stmt.query_map(
                    params![session_id, before, window_limit],
                    row_to_session_message,
                )?;
                collect_rows(rows)?
            }
        };
        if limit.is_some() {
            messages.reverse();
        }
        Ok(messages)
    }

    pub fn list_session_messages_by_turn_ids(
        &self,
        session_id: &str,
        turn_ids: &[String],
    ) -> Result<Vec<SessionMessageRecord>> {
        if turn_ids.is_empty() {
            return Ok(Vec::new());
        }
        if turn_ids.len() > 1000 || turn_ids.iter().any(|id| id.is_empty()) {
            return Err(SystemServiceError::InvalidInput(
                "session message turn id filter must contain 1 to 1000 non-empty ids".to_string(),
            ));
        }
        let placeholders = std::iter::repeat_n("?", turn_ids.len())
            .collect::<Vec<_>>()
            .join(", ");
        let query = format!(
            "{SESSION_MESSAGE_SELECT} WHERE session_id = ? AND turn_id IN ({placeholders})
             ORDER BY sequence ASC"
        );
        let conn = self.connect()?;
        let mut stmt = conn.prepare(&query)?;
        let values = std::iter::once(session_id).chain(turn_ids.iter().map(String::as_str));
        let rows = stmt.query_map(params_from_iter(values), row_to_session_message)?;
        collect_rows(rows).map_err(Into::into)
    }

    pub fn append_session_message(
        &self,
        request: &AppendSessionMessage,
    ) -> Result<Option<SessionMessageRecord>> {
        validate_append_request(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let Some(binding_digest) = crate::turns::validate_turn_attempt_lease_tx(
            &tx,
            &crate::turns::TurnAttemptLeaseIdentity {
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
        else {
            tx.commit()?;
            return Ok(None);
        };
        let message = insert_session_message_tx(
            &tx,
            NewSessionMessage {
                session_id: &request.session_id,
                turn_id: &request.turn_id,
                attempt_id: Some(&request.attempt_id),
                input_id: Some(&request.input_id),
                role: &request.role,
                status: "completed",
                content: &request.content,
                provider_state: request.provider_state.as_ref(),
                execution_binding_digest: &binding_digest,
                idempotency_key: Some(&request.idempotency_key),
            },
            now,
        )?;
        tx.commit()?;
        Ok(Some(message))
    }
}

fn validate_message_window(before_sequence: Option<i64>, limit: Option<i64>) -> Result<()> {
    if before_sequence.is_some_and(|value| value < 1) {
        return Err(SystemServiceError::InvalidInput(
            "session message before_sequence must be positive".to_string(),
        ));
    }
    if limit.is_some_and(|value| !(1..=1000).contains(&value)) {
        return Err(SystemServiceError::InvalidInput(
            "session message limit must be between 1 and 1000".to_string(),
        ));
    }
    Ok(())
}

fn collect_rows<T>(
    rows: rusqlite::MappedRows<'_, impl FnMut(&rusqlite::Row<'_>) -> rusqlite::Result<T>>,
) -> rusqlite::Result<Vec<T>> {
    rows.collect()
}

pub(crate) struct NewSessionMessage<'a> {
    pub session_id: &'a str,
    pub turn_id: &'a str,
    pub attempt_id: Option<&'a str>,
    pub input_id: Option<&'a str>,
    pub role: &'a str,
    pub status: &'a str,
    pub content: &'a serde_json::Value,
    pub provider_state: Option<&'a serde_json::Value>,
    pub execution_binding_digest: &'a str,
    pub idempotency_key: Option<&'a str>,
}

pub(crate) fn insert_session_message_tx(
    tx: &rusqlite::Transaction<'_>,
    message: NewSessionMessage<'_>,
    now: i64,
) -> Result<SessionMessageRecord> {
    if let Some(idempotency_key) = message.idempotency_key {
        if let Some(existing) =
            find_message_by_idempotency_tx(tx, message.session_id, idempotency_key)?
        {
            if existing.turn_id != message.turn_id
                || existing.attempt_id.as_deref() != message.attempt_id
                || existing.input_id.as_deref() != message.input_id
                || existing.role != message.role
                || existing.status != message.status
                || existing.content != *message.content
                || existing.provider_state.as_ref() != message.provider_state
                || existing.execution_binding_digest != message.execution_binding_digest
            {
                return Err(SystemServiceError::Invariant(
                    "conflicting repeated session message append".to_string(),
                ));
            }
            return Ok(existing);
        }
    }

    let sequence: i64 = tx.query_row(
        "SELECT COALESCE(MAX(sequence), 0) + 1 FROM session_message WHERE session_id = ?",
        params![message.session_id],
        |row| row.get(0),
    )?;
    let message_id = format!("msg_{}", Uuid::now_v7());
    tx.execute(
        "INSERT INTO session_message (
            id, session_id, sequence, turn_id, attempt_id, input_id, role,
            status, content_json, provider_state_json, execution_binding_digest,
            idempotency_key, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params![
            message_id,
            message.session_id,
            sequence,
            message.turn_id,
            message.attempt_id,
            message.input_id,
            message.role,
            message.status,
            serde_json::to_string(message.content)?,
            message
                .provider_state
                .map(serde_json::to_string)
                .transpose()?,
            message.execution_binding_digest,
            message.idempotency_key,
            now,
            now
        ],
    )?;
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        "session.message.appended",
        &EventScope {
            session_id: Some(message.session_id.to_string()),
            turn_id: Some(message.turn_id.to_string()),
            attempt_id: message.attempt_id.map(ToOwned::to_owned),
            input_id: message.input_id.map(ToOwned::to_owned),
            message_id: Some(message_id.clone()),
            ..EventScope::default()
        },
        &serde_json::json!({
            "messageId": message_id,
            "sequence": sequence,
            "role": message.role,
            "status": message.status
        }),
        now,
    )?;
    get_message_tx(tx, &message_id)
}

pub(crate) fn get_message_tx(
    tx: &rusqlite::Transaction<'_>,
    message_id: &str,
) -> Result<SessionMessageRecord> {
    tx.query_row(
        &format!("{SESSION_MESSAGE_SELECT} WHERE id = ?"),
        params![message_id],
        row_to_session_message,
    )
    .map_err(Into::into)
}

pub(crate) fn find_message_by_idempotency_tx(
    tx: &rusqlite::Transaction<'_>,
    session_id: &str,
    idempotency_key: &str,
) -> Result<Option<SessionMessageRecord>> {
    tx.query_row(
        &format!("{SESSION_MESSAGE_SELECT} WHERE session_id = ? AND idempotency_key = ?"),
        params![session_id, idempotency_key],
        row_to_session_message,
    )
    .optional()
    .map_err(Into::into)
}

fn validate_append_request(request: &AppendSessionMessage) -> Result<()> {
    if request.session_id.is_empty()
        || request.turn_id.is_empty()
        || request.attempt_id.is_empty()
        || request.input_id.is_empty()
        || request.job_id.is_empty()
        || request.worker_id.is_empty()
        || request.lease_token.is_empty()
        || request.idempotency_key.is_empty()
    {
        return Err(SystemServiceError::InvalidInput(
            "session message execution identity must not be empty".to_string(),
        ));
    }
    if !matches!(request.role.as_str(), "assistant" | "tool" | "system") {
        return Err(SystemServiceError::InvalidInput(
            "runtime may append only assistant, tool, or system messages".to_string(),
        ));
    }
    Ok(())
}
