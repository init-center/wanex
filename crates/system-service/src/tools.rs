use crate::event_store::append_event_tx;
use crate::rows::row_to_tool_execution;
use crate::{
    BeginToolExecution, BeginToolExecutionReceipt, EventScope, FinishToolExecution,
    ListToolExecutions, RecoverToolExecution, Result, SystemService, SystemServiceError,
    ToolExecutionRecord,
};
use rusqlite::{params, OptionalExtension, Transaction};
use uuid::Uuid;

const SELECT: &str = "SELECT id, session_id, run_id, input_id, principal_id,
 tool_call_id, tool_name, input_json, descriptor_json, permission_json, state,
 attempt, idempotency_key, result_json, is_error, error_json, created_at,
 started_at, finished_at, updated_at FROM tool_execution";

impl SystemService {
    pub fn begin_tool_execution(
        &self,
        request: &BeginToolExecution,
    ) -> Result<BeginToolExecutionReceipt> {
        validate_begin(request)?;
        let now = crate::util::now_ms();
        let state = permission_state(&request.permission)?;
        let mut conn = self.connect()?;
        let tx = conn.transaction()?;
        if let Some(existing) = find_by_run_call(&tx, &request.run_id, &request.tool_call_id)? {
            if existing.tool_name != request.tool_name
                || existing.input != request.input
                || existing.idempotency_key != request.idempotency_key
            {
                return Err(SystemServiceError::Invariant(
                    "conflicting repeated tool execution begin".into(),
                ));
            }
            tx.commit()?;
            return Ok(BeginToolExecutionReceipt {
                execution: existing,
                created: false,
            });
        }
        let id = format!("toolx_{}", Uuid::now_v7());
        let started_at = (state == "running").then_some(now);
        let finished_at = (state != "running").then_some(now);
        tx.execute(
            "INSERT INTO tool_execution (id, session_id, run_id, input_id, principal_id,
             tool_call_id, tool_name, input_json, descriptor_json, permission_json,
             state, attempt, idempotency_key, created_at, started_at, finished_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)",
            params![
                id,
                request.session_id,
                request.run_id,
                request.input_id,
                request.principal_id,
                request.tool_call_id,
                request.tool_name,
                serde_json::to_string(&request.input)?,
                serde_json::to_string(&request.descriptor)?,
                serde_json::to_string(&request.permission)?,
                state,
                request.idempotency_key,
                now,
                started_at,
                finished_at,
                now
            ],
        )?;
        append_tool_event(&tx, "tool.execution.begun", &id, request, state, now)?;
        let record = find_by_id(&tx, &id)?.expect("inserted tool execution");
        tx.commit()?;
        Ok(BeginToolExecutionReceipt {
            execution: record,
            created: true,
        })
    }

    pub fn finish_tool_execution(
        &self,
        request: &FinishToolExecution,
    ) -> Result<Option<ToolExecutionRecord>> {
        if !matches!(request.state.as_str(), "succeeded" | "failed" | "cancelled") {
            return Err(SystemServiceError::InvalidInput(
                "invalid terminal tool state".into(),
            ));
        }
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = conn.transaction()?;
        let Some(existing) = find_by_id(&tx, &request.execution_id)? else {
            tx.commit()?;
            return Ok(None);
        };
        if existing.state != "running" {
            if existing.state == request.state
                && existing.result == request.result
                && existing.error == request.error
            {
                tx.commit()?;
                return Ok(Some(existing));
            }
            return Err(SystemServiceError::Invariant(
                "tool execution is not running".into(),
            ));
        }
        tx.execute(
            "UPDATE tool_execution SET state = ?, result_json = ?, is_error = ?, error_json = ?, finished_at = ?, updated_at = ? WHERE id = ?",
            params![request.state, request.result.as_ref().map(serde_json::to_string).transpose()?,
                request.is_error, request.error.as_ref().map(serde_json::to_string).transpose()?, now, now, request.execution_id],
        )?;
        append_existing_event(
            &tx,
            "tool.execution.finished",
            &existing,
            &request.state,
            now,
        )?;
        let record = find_by_id(&tx, &request.execution_id)?;
        tx.commit()?;
        Ok(record)
    }

    pub fn recover_tool_execution(
        &self,
        request: &RecoverToolExecution,
    ) -> Result<Option<ToolExecutionRecord>> {
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = conn.transaction()?;
        let Some(existing) = find_by_id(&tx, &request.execution_id)? else {
            tx.commit()?;
            return Ok(None);
        };
        if existing.state != "running" {
            return Err(SystemServiceError::Invariant(
                "only running tool execution can recover".into(),
            ));
        }
        match request.action.as_str() {
            "retry" => tx.execute("UPDATE tool_execution SET attempt = attempt + 1, started_at = ?, updated_at = ? WHERE id = ?", params![now, now, request.execution_id])?,
            "require_recovery" => tx.execute("UPDATE tool_execution SET state = 'recovery_required', finished_at = ?, updated_at = ? WHERE id = ?", params![now, now, request.execution_id])?,
            _ => return Err(SystemServiceError::InvalidInput("invalid tool recovery action".into())),
        };
        append_existing_event(
            &tx,
            "tool.execution.recovered",
            &existing,
            &request.action,
            now,
        )?;
        let record = find_by_id(&tx, &request.execution_id)?;
        tx.commit()?;
        Ok(record)
    }

    pub fn get_tool_execution(&self, id: &str) -> Result<Option<ToolExecutionRecord>> {
        find_by_id(&self.connect()?, id)
    }

    pub fn list_tool_executions(
        &self,
        request: &ListToolExecutions,
    ) -> Result<Vec<ToolExecutionRecord>> {
        let conn = self.connect()?;
        let limit = request.limit.unwrap_or(100).clamp(1, 1000);
        let mut stmt = conn.prepare(&format!("{SELECT} WHERE (?1 IS NULL OR session_id = ?1) AND (?2 IS NULL OR run_id = ?2) AND (?3 IS NULL OR state = ?3) ORDER BY updated_at, id LIMIT ?4"))?;
        let rows = stmt.query_map(
            params![request.session_id, request.run_id, request.state, limit],
            row_to_tool_execution,
        )?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }
}

fn find_by_id(conn: &rusqlite::Connection, id: &str) -> Result<Option<ToolExecutionRecord>> {
    conn.query_row(
        &format!("{SELECT} WHERE id = ?"),
        [id],
        row_to_tool_execution,
    )
    .optional()
    .map_err(Into::into)
}

fn find_by_run_call(
    tx: &Transaction<'_>,
    run_id: &str,
    call_id: &str,
) -> Result<Option<ToolExecutionRecord>> {
    tx.query_row(
        &format!("{SELECT} WHERE run_id = ? AND tool_call_id = ?"),
        params![run_id, call_id],
        row_to_tool_execution,
    )
    .optional()
    .map_err(Into::into)
}

fn permission_state(value: &serde_json::Value) -> Result<&'static str> {
    match value.get("status").and_then(|item| item.as_str()) {
        Some("allow") => Ok("running"),
        Some("deny") => Ok("denied"),
        Some("approval_required") => Ok("approval_required"),
        _ => Err(SystemServiceError::InvalidInput(
            "invalid tool permission decision".into(),
        )),
    }
}

fn validate_begin(request: &BeginToolExecution) -> Result<()> {
    if [
        &request.session_id,
        &request.run_id,
        &request.input_id,
        &request.principal_id,
        &request.tool_call_id,
        &request.tool_name,
        &request.idempotency_key,
    ]
    .iter()
    .any(|v| v.is_empty())
    {
        return Err(SystemServiceError::InvalidInput(
            "tool execution identity must not be empty".into(),
        ));
    }
    Ok(())
}

fn append_tool_event(
    tx: &Transaction<'_>,
    kind: &str,
    id: &str,
    request: &BeginToolExecution,
    state: &str,
    now: i64,
) -> Result<()> {
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        kind,
        &EventScope {
            session_id: Some(request.session_id.clone()),
            run_id: Some(request.run_id.clone()),
            input_id: Some(request.input_id.clone()),
            ..EventScope::default()
        },
        &serde_json::json!({"executionId": id, "toolCallId": request.tool_call_id, "toolName": request.tool_name, "state": state}),
        now,
    )
}

fn append_existing_event(
    tx: &Transaction<'_>,
    kind: &str,
    record: &ToolExecutionRecord,
    state: &str,
    now: i64,
) -> Result<()> {
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        kind,
        &EventScope {
            session_id: Some(record.session_id.clone()),
            run_id: Some(record.run_id.clone()),
            input_id: Some(record.input_id.clone()),
            ..EventScope::default()
        },
        &serde_json::json!({"executionId": record.id, "toolCallId": record.tool_call_id, "toolName": record.tool_name, "state": state}),
        now,
    )
}
