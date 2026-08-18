use super::*;
use crate::{RequestSessionTurnCancel, SessionTurnRecord};
use std::collections::BTreeSet;

pub(crate) fn find_waiting_team_delegation_operation_tx(
    tx: &rusqlite::Transaction<'_>,
    parent_turn_id: &str,
) -> Result<Option<String>> {
    let mut statement = tx.prepare(&format!(
        "{OPERATION_SELECT} WHERE parent_turn_id = ?
         AND state IN ('running', 'cancel_requested')
         ORDER BY created_at DESC, id DESC LIMIT 2"
    ))?;
    let operations = statement
        .query_map(params![parent_turn_id], row_to_team_delegation_operation)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    if operations.len() > 1 {
        return Err(SystemServiceError::Invariant(
            "waiting Turn has multiple active Team delegation operations".to_string(),
        ));
    }
    Ok(operations.into_iter().next().map(|operation| operation.id))
}

pub(crate) fn request_team_delegation_cancel_tx(
    tx: &rusqlite::Transaction<'_>,
    parent_turn: &SessionTurnRecord,
    reason: &str,
    now: i64,
) -> Result<Option<Vec<String>>> {
    let Some(operation_id) = find_waiting_team_delegation_operation_tx(tx, &parent_turn.id)? else {
        return Ok(None);
    };
    if parent_turn.state != "cancel_requested" || parent_turn.current_attempt_id.is_some() {
        return Err(SystemServiceError::Invariant(
            "Team delegation cancellation requires its lease-free cancel-requested parent Turn"
                .to_string(),
        ));
    }
    let operation = get_operation_tx(tx, &operation_id)?.ok_or_else(|| {
        SystemServiceError::Invariant("Team delegation cancellation lost its operation".to_string())
    })?;
    if operation.parent_session_id != parent_turn.session_id
        || operation.parent_input_id != parent_turn.primary_input_id
        || operation.parent_session_job_id != parent_turn.job_id
    {
        return Err(SystemServiceError::Invariant(
            "Team delegation cancellation parent relation has drifted".to_string(),
        ));
    }
    if operation.state == "running" {
        let updated = tx.execute(
            "UPDATE team_delegation_operation
             SET state = 'cancel_requested', updated_at = ?
             WHERE id = ? AND state = 'running'",
            params![now, operation.id],
        )?;
        if updated != 1 {
            return Err(SystemServiceError::Invariant(
                "Team delegation operation lost its cancellation claim".to_string(),
            ));
        }
        append_team_event_tx(
            tx,
            "team.delegation.cancel_requested",
            &json!({
                "conversationId": operation.conversation_id,
                "operationId": operation.id,
                "parentTurnId": parent_turn.id,
                "reason": bounded_cancel_reason(reason)
            }),
            now,
        )?;
    }

    cancel_unmaterialized_tasks_tx(tx, &operation, now)?;
    let tasks = list_tasks_tx(tx, &operation.id)?;
    let mut cascade_jobs = BTreeSet::new();
    for task in tasks.iter().filter(|task| task.materialized_at.is_some()) {
        let child_turn = crate::sessions::get_turn_tx(tx, &task.child_turn_id)?;
        if crate::turns::is_terminal_turn_state(&child_turn.state) {
            continue;
        }
        let receipt = crate::turns::request_session_turn_cancel_tx(
            tx,
            &RequestSessionTurnCancel {
                session_id: task.target_session_id.clone(),
                turn_id: task.child_turn_id.clone(),
                input_id: task.child_input_id.clone(),
                job_id: task.child_job_id.clone(),
                reason: "parent Team delegation was cancelled".to_string(),
            },
            now,
        )?;
        if receipt.status == "cancel_requested" {
            cascade_jobs.insert(task.child_job_id.clone());
        }
        cascade_jobs.extend(receipt.cascade_job_ids);
    }
    super::settlement::finish_collection_if_complete_tx(tx, &operation.id, now)?;
    Ok(Some(cascade_jobs.into_iter().collect()))
}

fn cancel_unmaterialized_tasks_tx(
    tx: &rusqlite::Transaction<'_>,
    operation: &TeamDelegationOperationRecord,
    now: i64,
) -> Result<()> {
    let tasks = list_tasks_tx(tx, &operation.id)?;
    let nodes = list_nodes_tx(tx, &operation.delegation_graph_id)?;
    for task in &tasks {
        let node = nodes
            .iter()
            .find(|node| node.id == task.graph_node_id)
            .ok_or_else(|| {
                SystemServiceError::Invariant(
                    "Team delegation cancellation task lost its graph node".to_string(),
                )
            })?;
        if node.state == "pending" {
            super::settlement::settle_unmaterialized_node_tx(
                tx,
                operation,
                task,
                "cancelled",
                now,
            )?;
        }
    }
    Ok(())
}

fn bounded_cancel_reason(reason: &str) -> String {
    const MAX_BYTES: usize = 2 * 1024;
    if reason.len() <= MAX_BYTES {
        return reason.to_string();
    }
    let mut end = MAX_BYTES;
    while end > 0 && !reason.is_char_boundary(end) {
        end -= 1;
    }
    reason[..end].to_string()
}
