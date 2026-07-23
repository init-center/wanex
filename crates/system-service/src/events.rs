use crate::rows::{collect_events, row_to_event};
use crate::{QueryEvents, Result, RuntimeEvent, SystemService};
use rusqlite::params;

impl SystemService {
    pub fn append_event(&self, event: &RuntimeEvent) -> Result<()> {
        let conn = self.connect()?;
        conn.execute(
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
                event.id,
                event.event_type,
                event.scope.session_id,
                event.scope.turn_id,
                event.scope.attempt_id,
                event.scope.input_id,
                event.scope.message_id,
                event.scope.resource_id,
                event.scope.plan_proposal_id,
                event.scope.objective_id,
                serde_json::to_string(&event.payload)?,
                event.occurred_at,
                crate::util::now_ms(),
            ],
        )?;
        Ok(())
    }

    pub fn query_events(&self, query: QueryEvents) -> Result<Vec<RuntimeEvent>> {
        let conn = self.connect()?;
        let limit = i64::from(query.limit.unwrap_or(100).min(1000));
        let after = query.after_occurred_at.unwrap_or(i64::MIN);
        let after_event_id = query.after_event_id.unwrap_or_default();

        if let Some(session_id) = query.session_id {
            let mut stmt = conn.prepare(
                "SELECT id, event_type, scope_session_id, scope_turn_id,
                        scope_attempt_id, scope_input_id, scope_message_id, scope_resource_id,
                        scope_plan_proposal_id, scope_objective_id, payload_json, occurred_at
                 FROM event_log
                 WHERE scope_session_id = ?
                   AND (
                     occurred_at > ?
                     OR (? != '' AND occurred_at = ? AND id > ?)
                   )
                 ORDER BY occurred_at ASC, id ASC
                 LIMIT ?",
            )?;
            let rows = stmt.query_map(
                params![
                    session_id,
                    after,
                    after_event_id,
                    after,
                    after_event_id,
                    limit
                ],
                row_to_event,
            )?;
            collect_events(rows)
        } else if let Some(plan_proposal_id) = query.plan_proposal_id {
            let mut stmt = conn.prepare(
                "SELECT id, event_type, scope_session_id, scope_turn_id,
                        scope_attempt_id, scope_input_id, scope_message_id, scope_resource_id,
                        scope_plan_proposal_id, scope_objective_id, payload_json, occurred_at
                 FROM event_log
                 WHERE scope_plan_proposal_id = ?
                   AND (
                     occurred_at > ?
                     OR (? != '' AND occurred_at = ? AND id > ?)
                   )
                 ORDER BY occurred_at ASC, id ASC
                 LIMIT ?",
            )?;
            let rows = stmt.query_map(
                params![
                    plan_proposal_id,
                    after,
                    after_event_id,
                    after,
                    after_event_id,
                    limit
                ],
                row_to_event,
            )?;
            collect_events(rows)
        } else if let Some(objective_id) = query.objective_id {
            let mut stmt = conn.prepare(
                "SELECT id, event_type, scope_session_id, scope_turn_id,
                        scope_attempt_id, scope_input_id, scope_message_id, scope_resource_id,
                        scope_plan_proposal_id, scope_objective_id, payload_json, occurred_at
                 FROM event_log
                 WHERE scope_objective_id = ?
                   AND (
                     occurred_at > ?
                     OR (? != '' AND occurred_at = ? AND id > ?)
                   )
                 ORDER BY occurred_at ASC, id ASC
                 LIMIT ?",
            )?;
            let rows = stmt.query_map(
                params![
                    objective_id,
                    after,
                    after_event_id,
                    after,
                    after_event_id,
                    limit
                ],
                row_to_event,
            )?;
            collect_events(rows)
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, event_type, scope_session_id, scope_turn_id,
                        scope_attempt_id, scope_input_id, scope_message_id, scope_resource_id,
                        scope_plan_proposal_id, scope_objective_id, payload_json, occurred_at
                 FROM event_log
                 WHERE occurred_at > ?
                    OR (? != '' AND occurred_at = ? AND id > ?)
                 ORDER BY occurred_at ASC, id ASC
                 LIMIT ?",
            )?;
            let rows = stmt.query_map(
                params![after, after_event_id, after, after_event_id, limit],
                row_to_event,
            )?;
            collect_events(rows)
        }
    }
}
