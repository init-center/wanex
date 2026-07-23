use crate::event_store::append_event_tx;
use crate::rows::{row_to_tool_execution, row_to_tool_execution_attempt};
use crate::{
    BeginToolExecution, BeginToolExecutionReceipt, EventScope, FinishToolExecution,
    ListToolExecutionAttempts, ListToolExecutions, Result, SystemService, SystemServiceError,
    ToolExecutionAttemptRecord, ToolExecutionRecord,
};
use rusqlite::{params, OptionalExtension};
use uuid::Uuid;

const TOOL_EXECUTION_SELECT: &str = "SELECT id, session_id, turn_id, input_id,
    source_message_id, principal_id, tool_call_id, tool_name, input_json,
    descriptor_json, permission_json, state, current_invocation_attempt_id,
    attempt_count, idempotency_key, result_json, is_error, error_json,
    created_at, finished_at, updated_at FROM tool_execution";

const TOOL_ATTEMPT_SELECT: &str = "SELECT id, execution_id,
    session_attempt_id, job_id, worker_id, attempt_number, state, error_json,
    started_at, updated_at, finished_at FROM tool_execution_attempt";

impl SystemService {
    pub fn begin_tool_execution(
        &self,
        request: &BeginToolExecution,
    ) -> Result<BeginToolExecutionReceipt> {
        validate_begin(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        if validate_turn_lease(&tx, begin_identity(request), now)?.is_none() {
            return Err(SystemServiceError::Invariant(
                "tool execution does not own the active turn lease".to_string(),
            ));
        }
        validate_source_message_tx(&tx, request)?;

        if let Some(existing) =
            find_by_source_call_tx(&tx, &request.source_message_id, &request.tool_call_id)?
        {
            ensure_same_begin(&existing, request)?;
            let receipt = begin_existing_execution_tx(&tx, existing, request, now)?;
            tx.commit()?;
            return Ok(receipt);
        }
        if let Some(existing) = find_by_idempotency_tx(&tx, &request.idempotency_key)? {
            ensure_same_begin(&existing, request)?;
            let receipt = begin_existing_execution_tx(&tx, existing, request, now)?;
            tx.commit()?;
            return Ok(receipt);
        }

        let execution_id = format!("toolx_{}", Uuid::now_v7());
        let running = request.state == "running";
        let finished_at = (request.state == "denied").then_some(now);
        tx.execute(
            "INSERT INTO tool_execution (
                id, session_id, turn_id, input_id, source_message_id,
                principal_id, tool_call_id, tool_name, input_json,
                descriptor_json, permission_json, state,
                current_invocation_attempt_id, attempt_count, idempotency_key,
                result_json, is_error, error_json, created_at, finished_at,
                updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?,
                       NULL, NULL, NULL, ?, ?, ?)",
            params![
                execution_id,
                request.session_id,
                request.turn_id,
                request.input_id,
                request.source_message_id,
                request.principal_id,
                request.tool_call_id,
                request.tool_name,
                serde_json::to_string(&request.input)?,
                serde_json::to_string(&request.descriptor)?,
                serde_json::to_string(&request.permission)?,
                request.state,
                request.idempotency_key,
                now,
                finished_at,
                now
            ],
        )?;
        let invocation_attempt = if running {
            Some(create_tool_attempt_tx(&tx, &execution_id, request, 1, now)?)
        } else {
            None
        };
        append_tool_event_tx(
            &tx,
            match request.state.as_str() {
                "running" => "tool.execution.started",
                "denied" => "tool.execution.denied",
                _ => "tool.execution.approval_required",
            },
            ToolEventIdentity {
                execution_id: &execution_id,
                session_id: &request.session_id,
                turn_id: &request.turn_id,
                session_attempt_id: &request.attempt_id,
                input_id: &request.input_id,
                source_message_id: &request.source_message_id,
            },
            &serde_json::json!({
                "toolCallId": request.tool_call_id,
                "toolName": request.tool_name,
                "state": request.state,
                "invocationAttemptId": invocation_attempt.as_ref().map(|attempt| &attempt.id)
            }),
            now,
        )?;
        let execution = get_tool_execution_tx(&tx, &execution_id)?;
        tx.commit()?;
        Ok(BeginToolExecutionReceipt {
            execution,
            invocation_attempt,
            created: true,
        })
    }

    pub fn finish_tool_execution(
        &self,
        request: &FinishToolExecution,
    ) -> Result<Option<ToolExecutionRecord>> {
        validate_finish(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        if validate_turn_lease(&tx, finish_identity(request), now)?.is_none() {
            tx.commit()?;
            return Ok(None);
        }
        let Some(existing) = get_optional_tool_execution_tx(&tx, &request.execution_id)? else {
            tx.commit()?;
            return Ok(None);
        };
        ensure_finish_identity(&existing, request)?;
        let attempt = get_tool_attempt_tx(&tx, &request.invocation_attempt_id)?;
        ensure_attempt_owner(&attempt, request)?;

        if attempt.state != "running" || existing.state != "running" {
            if attempt.state != request.state
                || existing.state != request.state
                || existing.result != request.result
                || existing.is_error != request.is_error
                || existing.error != request.error
            {
                return Err(SystemServiceError::Invariant(
                    "conflicting repeated tool execution settlement".to_string(),
                ));
            }
            tx.commit()?;
            return Ok(Some(existing));
        }
        if existing.current_invocation_attempt_id.as_deref()
            != Some(request.invocation_attempt_id.as_str())
        {
            tx.commit()?;
            return Ok(None);
        }

        tx.execute(
            "UPDATE tool_execution_attempt
             SET state = ?, error_json = ?, finished_at = ?, updated_at = ?
             WHERE id = ? AND state = 'running'",
            params![
                request.state,
                request
                    .error
                    .as_ref()
                    .map(serde_json::to_string)
                    .transpose()?,
                now,
                now,
                request.invocation_attempt_id
            ],
        )?;
        tx.execute(
            "UPDATE tool_execution
             SET state = ?, result_json = ?, is_error = ?, error_json = ?,
                 finished_at = ?, updated_at = ?
             WHERE id = ? AND state = 'running'
               AND current_invocation_attempt_id = ?",
            params![
                request.state,
                request
                    .result
                    .as_ref()
                    .map(serde_json::to_string)
                    .transpose()?,
                request.is_error,
                request
                    .error
                    .as_ref()
                    .map(serde_json::to_string)
                    .transpose()?,
                now,
                now,
                request.execution_id,
                request.invocation_attempt_id
            ],
        )?;
        append_tool_event_tx(
            &tx,
            &format!("tool.execution.{}", request.state),
            ToolEventIdentity {
                execution_id: &existing.id,
                session_id: &existing.session_id,
                turn_id: &existing.turn_id,
                session_attempt_id: &request.session_attempt_id,
                input_id: &existing.input_id,
                source_message_id: &existing.source_message_id,
            },
            &serde_json::json!({
                "toolCallId": existing.tool_call_id,
                "toolName": existing.tool_name,
                "state": request.state,
                "invocationAttemptId": request.invocation_attempt_id
            }),
            now,
        )?;
        let execution = get_tool_execution_tx(&tx, &request.execution_id)?;
        tx.commit()?;
        Ok(Some(execution))
    }

    pub fn get_tool_execution(&self, execution_id: &str) -> Result<Option<ToolExecutionRecord>> {
        let conn = self.connect()?;
        conn.query_row(
            &format!("{TOOL_EXECUTION_SELECT} WHERE id = ?"),
            params![execution_id],
            row_to_tool_execution,
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn list_tool_executions(
        &self,
        request: &ListToolExecutions,
    ) -> Result<Vec<ToolExecutionRecord>> {
        let conn = self.connect()?;
        let limit = request.limit.unwrap_or(100).clamp(1, 1000);
        let mut stmt = conn.prepare(&format!(
            "{TOOL_EXECUTION_SELECT}
             WHERE (?1 IS NULL OR session_id = ?1)
               AND (?2 IS NULL OR turn_id = ?2)
               AND (?3 IS NULL OR state = ?3)
             ORDER BY updated_at ASC, id ASC LIMIT ?4"
        ))?;
        let rows = stmt.query_map(
            params![request.session_id, request.turn_id, request.state, limit],
            row_to_tool_execution,
        )?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    pub fn list_tool_execution_attempts(
        &self,
        request: &ListToolExecutionAttempts,
    ) -> Result<Vec<ToolExecutionAttemptRecord>> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare(&format!(
            "{TOOL_ATTEMPT_SELECT} WHERE execution_id = ?
             ORDER BY attempt_number ASC, id ASC"
        ))?;
        let rows = stmt.query_map(params![request.execution_id], row_to_tool_execution_attempt)?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }
}

fn begin_existing_execution_tx(
    tx: &rusqlite::Transaction<'_>,
    existing: ToolExecutionRecord,
    request: &BeginToolExecution,
    now: i64,
) -> Result<BeginToolExecutionReceipt> {
    if existing.state == "retry_ready" {
        if request.state != "running" {
            return Err(SystemServiceError::Invariant(
                "retry-ready tool execution requires running admission".to_string(),
            ));
        }
        let attempt_number = existing.attempt_count + 1;
        let invocation_attempt =
            create_tool_attempt_tx(tx, &existing.id, request, attempt_number, now)?;
        let execution = get_tool_execution_tx(tx, &existing.id)?;
        return Ok(BeginToolExecutionReceipt {
            execution,
            invocation_attempt: Some(invocation_attempt),
            created: false,
        });
    }

    let invocation_attempt = existing
        .current_invocation_attempt_id
        .as_deref()
        .map(|attempt_id| get_tool_attempt_tx(tx, attempt_id))
        .transpose()?;
    Ok(BeginToolExecutionReceipt {
        execution: existing,
        invocation_attempt,
        created: false,
    })
}

fn create_tool_attempt_tx(
    tx: &rusqlite::Transaction<'_>,
    execution_id: &str,
    request: &BeginToolExecution,
    attempt_number: i64,
    now: i64,
) -> Result<ToolExecutionAttemptRecord> {
    let attempt_id = format!("toolattempt_{}", Uuid::now_v7());
    tx.execute(
        "INSERT INTO tool_execution_attempt (
            id, execution_id, session_attempt_id, job_id, worker_id,
            lease_token, attempt_number, state, error_json, started_at,
            updated_at, finished_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 'running', NULL, ?, ?, NULL)",
        params![
            attempt_id,
            execution_id,
            request.attempt_id,
            request.job_id,
            request.worker_id,
            request.lease_token,
            attempt_number,
            now,
            now
        ],
    )?;
    tx.execute(
        "UPDATE tool_execution
         SET state = 'running', current_invocation_attempt_id = ?,
             attempt_count = ?, result_json = NULL, is_error = NULL,
             error_json = NULL, finished_at = NULL, updated_at = ?
         WHERE id = ? AND state IN ('running', 'retry_ready')",
        params![attempt_id, attempt_number, now, execution_id],
    )?;
    get_tool_attempt_tx(tx, &attempt_id)
}

fn validate_source_message_tx(
    tx: &rusqlite::Transaction<'_>,
    request: &BeginToolExecution,
) -> Result<()> {
    let content_json: Option<String> = tx
        .query_row(
            "SELECT content_json FROM session_message
             WHERE id = ? AND session_id = ? AND turn_id = ? AND role = 'assistant'",
            params![
                request.source_message_id,
                request.session_id,
                request.turn_id
            ],
            |row| row.get(0),
        )
        .optional()?;
    let Some(content_json) = content_json else {
        return Err(SystemServiceError::Invariant(
            "tool execution source message is not part of the logical turn".to_string(),
        ));
    };
    let content: serde_json::Value = serde_json::from_str(&content_json)?;
    let call_matches = content.as_array().is_some_and(|parts| {
        parts.iter().any(|part| {
            part.get("type").and_then(serde_json::Value::as_str) == Some("tool_call")
                && part.get("toolCallId").and_then(serde_json::Value::as_str)
                    == Some(request.tool_call_id.as_str())
                && part.get("toolName").and_then(serde_json::Value::as_str)
                    == Some(request.tool_name.as_str())
                && part.get("input") == Some(&request.input)
        })
    });
    if !call_matches {
        return Err(SystemServiceError::Invariant(
            "tool execution call is not present in its source assistant message".to_string(),
        ));
    }
    Ok(())
}

fn ensure_same_begin(existing: &ToolExecutionRecord, request: &BeginToolExecution) -> Result<()> {
    if existing.session_id != request.session_id
        || existing.turn_id != request.turn_id
        || existing.input_id != request.input_id
        || existing.source_message_id != request.source_message_id
        || existing.principal_id != request.principal_id
        || existing.tool_call_id != request.tool_call_id
        || existing.tool_name != request.tool_name
        || existing.input != request.input
        || existing.descriptor != request.descriptor
        || existing.permission != request.permission
    {
        return Err(SystemServiceError::Invariant(
            "conflicting repeated tool execution begin".to_string(),
        ));
    }
    Ok(())
}

fn ensure_finish_identity(
    existing: &ToolExecutionRecord,
    request: &FinishToolExecution,
) -> Result<()> {
    if existing.session_id != request.session_id
        || existing.turn_id != request.turn_id
        || existing.input_id != request.input_id
    {
        return Err(SystemServiceError::Invariant(
            "tool execution finish identity does not match logical execution".to_string(),
        ));
    }
    Ok(())
}

fn ensure_attempt_owner(
    attempt: &ToolExecutionAttemptRecord,
    request: &FinishToolExecution,
) -> Result<()> {
    if attempt.execution_id != request.execution_id
        || attempt.session_attempt_id != request.session_attempt_id
        || attempt.job_id != request.job_id
        || attempt.worker_id != request.worker_id
    {
        return Err(SystemServiceError::Invariant(
            "tool invocation attempt does not match active owner".to_string(),
        ));
    }
    Ok(())
}

fn find_by_source_call_tx(
    tx: &rusqlite::Transaction<'_>,
    source_message_id: &str,
    tool_call_id: &str,
) -> Result<Option<ToolExecutionRecord>> {
    tx.query_row(
        &format!("{TOOL_EXECUTION_SELECT} WHERE source_message_id = ? AND tool_call_id = ?"),
        params![source_message_id, tool_call_id],
        row_to_tool_execution,
    )
    .optional()
    .map_err(Into::into)
}

fn find_by_idempotency_tx(
    tx: &rusqlite::Transaction<'_>,
    idempotency_key: &str,
) -> Result<Option<ToolExecutionRecord>> {
    tx.query_row(
        &format!("{TOOL_EXECUTION_SELECT} WHERE idempotency_key = ?"),
        params![idempotency_key],
        row_to_tool_execution,
    )
    .optional()
    .map_err(Into::into)
}

pub(crate) fn get_optional_tool_execution_tx(
    tx: &rusqlite::Transaction<'_>,
    execution_id: &str,
) -> Result<Option<ToolExecutionRecord>> {
    tx.query_row(
        &format!("{TOOL_EXECUTION_SELECT} WHERE id = ?"),
        params![execution_id],
        row_to_tool_execution,
    )
    .optional()
    .map_err(Into::into)
}

pub(crate) fn get_tool_execution_tx(
    tx: &rusqlite::Transaction<'_>,
    execution_id: &str,
) -> Result<ToolExecutionRecord> {
    get_optional_tool_execution_tx(tx, execution_id)?.ok_or_else(|| {
        SystemServiceError::Invariant(format!(
            "tool execution not found after write: {execution_id}"
        ))
    })
}

pub(crate) fn get_tool_attempt_tx(
    tx: &rusqlite::Transaction<'_>,
    attempt_id: &str,
) -> Result<ToolExecutionAttemptRecord> {
    tx.query_row(
        &format!("{TOOL_ATTEMPT_SELECT} WHERE id = ?"),
        params![attempt_id],
        row_to_tool_execution_attempt,
    )
    .map_err(Into::into)
}

struct TurnLeaseIdentity<'a> {
    session_id: &'a str,
    turn_id: &'a str,
    session_attempt_id: &'a str,
    input_id: &'a str,
    job_id: &'a str,
    worker_id: &'a str,
    lease_token: &'a str,
}

fn begin_identity(request: &BeginToolExecution) -> TurnLeaseIdentity<'_> {
    TurnLeaseIdentity {
        session_id: &request.session_id,
        turn_id: &request.turn_id,
        session_attempt_id: &request.attempt_id,
        input_id: &request.input_id,
        job_id: &request.job_id,
        worker_id: &request.worker_id,
        lease_token: &request.lease_token,
    }
}

fn finish_identity(request: &FinishToolExecution) -> TurnLeaseIdentity<'_> {
    TurnLeaseIdentity {
        session_id: &request.session_id,
        turn_id: &request.turn_id,
        session_attempt_id: &request.session_attempt_id,
        input_id: &request.input_id,
        job_id: &request.job_id,
        worker_id: &request.worker_id,
        lease_token: &request.lease_token,
    }
}

fn validate_turn_lease(
    tx: &rusqlite::Transaction<'_>,
    identity: TurnLeaseIdentity<'_>,
    now: i64,
) -> Result<Option<String>> {
    crate::turns::validate_turn_attempt_lease_tx(
        tx,
        &crate::turns::TurnAttemptLeaseIdentity {
            session_id: identity.session_id,
            turn_id: identity.turn_id,
            attempt_id: identity.session_attempt_id,
            input_id: identity.input_id,
            job_id: identity.job_id,
            worker_id: identity.worker_id,
            lease_token: identity.lease_token,
        },
        now,
    )
}

struct ToolEventIdentity<'a> {
    execution_id: &'a str,
    session_id: &'a str,
    turn_id: &'a str,
    session_attempt_id: &'a str,
    input_id: &'a str,
    source_message_id: &'a str,
}

fn append_tool_event_tx(
    tx: &rusqlite::Transaction<'_>,
    event_type: &str,
    identity: ToolEventIdentity<'_>,
    payload: &serde_json::Value,
    now: i64,
) -> Result<()> {
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        event_type,
        &EventScope {
            session_id: Some(identity.session_id.to_string()),
            turn_id: Some(identity.turn_id.to_string()),
            attempt_id: Some(identity.session_attempt_id.to_string()),
            input_id: Some(identity.input_id.to_string()),
            message_id: Some(identity.source_message_id.to_string()),
            ..EventScope::default()
        },
        &serde_json::json!({
            "executionId": identity.execution_id,
            "tool": payload
        }),
        now,
    )
}

fn validate_begin(request: &BeginToolExecution) -> Result<()> {
    if [
        request.session_id.as_str(),
        request.turn_id.as_str(),
        request.attempt_id.as_str(),
        request.input_id.as_str(),
        request.source_message_id.as_str(),
        request.job_id.as_str(),
        request.worker_id.as_str(),
        request.lease_token.as_str(),
        request.principal_id.as_str(),
        request.tool_call_id.as_str(),
        request.tool_name.as_str(),
        request.idempotency_key.as_str(),
    ]
    .iter()
    .any(|value| value.is_empty())
    {
        return Err(SystemServiceError::InvalidInput(
            "tool execution identity fields must not be empty".to_string(),
        ));
    }
    if !matches!(
        request.state.as_str(),
        "running" | "denied" | "approval_required"
    ) {
        return Err(SystemServiceError::InvalidInput(
            "invalid initial tool execution state".to_string(),
        ));
    }
    Ok(())
}

fn validate_finish(request: &FinishToolExecution) -> Result<()> {
    if [
        request.session_id.as_str(),
        request.turn_id.as_str(),
        request.session_attempt_id.as_str(),
        request.input_id.as_str(),
        request.job_id.as_str(),
        request.worker_id.as_str(),
        request.lease_token.as_str(),
        request.execution_id.as_str(),
        request.invocation_attempt_id.as_str(),
    ]
    .iter()
    .any(|value| value.is_empty())
    {
        return Err(SystemServiceError::InvalidInput(
            "tool execution finish identity fields must not be empty".to_string(),
        ));
    }
    if !matches!(request.state.as_str(), "succeeded" | "failed" | "cancelled") {
        return Err(SystemServiceError::InvalidInput(
            "invalid terminal tool execution state".to_string(),
        ));
    }
    Ok(())
}
