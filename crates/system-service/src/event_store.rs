use crate::{EventScope, Result};
use rusqlite::params;
use serde_json::Value;

pub(crate) fn append_event_tx(
    tx: &rusqlite::Transaction<'_>,
    id: &str,
    event_type: &str,
    scope: &EventScope,
    payload: &Value,
    occurred_at: i64,
) -> Result<()> {
    tx.execute(
        "INSERT INTO event_log (
            id,
            event_type,
            scope_session_id,
            scope_turn_id,
            scope_attempt_id,
            scope_input_id,
            scope_message_id,
            scope_resource_id,
            scope_plan_proposal_id,
            scope_objective_id,
            payload_json,
            occurred_at,
            created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params![
            id,
            event_type,
            scope.session_id,
            scope.turn_id,
            scope.attempt_id,
            scope.input_id,
            scope.message_id,
            scope.resource_id,
            scope.plan_proposal_id,
            scope.objective_id,
            serde_json::to_string(payload)?,
            occurred_at,
            crate::util::now_ms(),
        ],
    )?;
    Ok(())
}
