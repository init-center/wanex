use super::*;
use crate::{SchedulerJobRecord, SessionTurnRecord};
use std::collections::HashMap;

pub(crate) fn settle_team_delegation_child_tx(
    tx: &rusqlite::Transaction<'_>,
    child_job: &SchedulerJobRecord,
    now: i64,
) -> Result<()> {
    let Some(task) = find_task_by_child_job_tx(tx, &child_job.id)? else {
        return Ok(());
    };
    let operation = get_operation_tx(tx, &task.operation_id)?.ok_or_else(|| {
        SystemServiceError::Invariant("Team delegation child task lost its operation".to_string())
    })?;
    let child_turn = crate::sessions::get_turn_tx(tx, &task.child_turn_id)?;
    validate_terminal_child(&task, &child_turn, child_job)?;
    let node = crate::delegation::get_node_tx(tx, &task.graph_node_id)?.ok_or_else(|| {
        SystemServiceError::Invariant("Team delegation child task lost its graph node".to_string())
    })?;
    let expected_node_state = node_state_for_turn(&child_turn.state)?;

    if is_terminal_node_state(&node.state) {
        if node.state != expected_node_state || is_terminal_operation_state(&operation.state) {
            return if node.state == expected_node_state {
                Ok(())
            } else {
                Err(SystemServiceError::Invariant(
                    "Team delegation child replay disagrees with its graph node".to_string(),
                ))
            };
        }
    }
    if !matches!(operation.state.as_str(), "running" | "cancel_requested")
        || node.graph_id != operation.delegation_graph_id
        || node.state != "running"
        || node.scheduler_job_id.as_deref() != Some(child_job.id.as_str())
    {
        return Err(SystemServiceError::Invariant(
            "Team delegation child terminal transition lost its active relation".to_string(),
        ));
    }
    let updated = tx.execute(
        "UPDATE delegation_graph_node
         SET state = ?, updated_at = ?, finished_at = ?
         WHERE id = ? AND graph_id = ? AND state = 'running'
           AND scheduler_job_id = ?",
        params![
            expected_node_state,
            now,
            now,
            node.id,
            operation.delegation_graph_id,
            child_job.id
        ],
    )?;
    if updated != 1 {
        return Err(SystemServiceError::Invariant(
            "Team delegation child lost its graph settlement claim".to_string(),
        ));
    }
    crate::delegation::append_delegation_event_tx(
        tx,
        "delegation.node.settled",
        &json!({
            "graphId": operation.delegation_graph_id,
            "nodeId": node.id,
            "taskId": task.id,
            "childTurnId": child_turn.id,
            "childJobId": child_job.id,
            "state": expected_node_state,
            "kind": "team_delegation"
        }),
        now,
    )?;
    append_team_event_tx(
        tx,
        "team.delegation.task_settled",
        &json!({
            "conversationId": operation.conversation_id,
            "operationId": operation.id,
            "taskId": task.id,
            "targetParticipantId": task.target_participant_id,
            "childTurnId": child_turn.id,
            "state": expected_node_state
        }),
        now,
    )?;

    advance_pending_tasks_tx(tx, &operation, now)?;
    finish_collection_if_complete_tx(tx, &operation.id, now)
}

fn advance_pending_tasks_tx(
    tx: &rusqlite::Transaction<'_>,
    operation: &TeamDelegationOperationRecord,
    now: i64,
) -> Result<()> {
    loop {
        let tasks = list_tasks_tx(tx, &operation.id)?;
        let nodes = list_nodes_tx(tx, &operation.delegation_graph_id)?;
        let dependencies = list_dependencies_tx(tx, &operation.delegation_graph_id)?;
        let states = nodes
            .iter()
            .map(|node| (node.id.as_str(), node.state.as_str()))
            .collect::<HashMap<_, _>>();
        let mut changed = false;
        for task in &tasks {
            let node = nodes
                .iter()
                .find(|node| node.id == task.graph_node_id)
                .ok_or_else(|| {
                    SystemServiceError::Invariant(
                        "Team delegation task lost its graph node".to_string(),
                    )
                })?;
            if node.state != "pending" {
                continue;
            }
            if operation.state == "cancel_requested" {
                settle_unmaterialized_node_tx(tx, operation, task, "cancelled", now)?;
                changed = true;
                continue;
            }
            let incoming = dependencies
                .iter()
                .filter(|dependency| dependency.to_node_id == node.id)
                .collect::<Vec<_>>();
            if incoming.is_empty() {
                return Err(SystemServiceError::Invariant(
                    "unmaterialized Team delegation root has no dependency".to_string(),
                ));
            }
            let mut all_succeeded = true;
            let mut blocked = false;
            for dependency in incoming {
                if dependency.kind != "after_success" {
                    return Err(SystemServiceError::Invariant(
                        "Team delegation graph contains an unsupported dependency kind".to_string(),
                    ));
                }
                let state = states
                    .get(dependency.from_node_id.as_str())
                    .ok_or_else(|| {
                        SystemServiceError::Invariant(
                            "Team delegation dependency source node is missing".to_string(),
                        )
                    })?;
                if matches!(*state, "failed" | "cancelled" | "skipped") {
                    blocked = true;
                    all_succeeded = false;
                } else if *state != "succeeded" {
                    all_succeeded = false;
                }
            }
            if blocked {
                settle_unmaterialized_node_tx(tx, operation, task, "skipped", now)?;
                changed = true;
            } else if all_succeeded {
                materialize_stored_task_tx(tx, operation, task, now)?;
                changed = true;
            }
        }
        if !changed {
            return Ok(());
        }
    }
}

pub(super) fn settle_unmaterialized_node_tx(
    tx: &rusqlite::Transaction<'_>,
    operation: &TeamDelegationOperationRecord,
    task: &TeamDelegationTaskRecord,
    state: &str,
    now: i64,
) -> Result<()> {
    if task.materialized_at.is_some() || !matches!(state, "cancelled" | "skipped") {
        return Err(SystemServiceError::Invariant(
            "Team delegation attempted an invalid unmaterialized settlement".to_string(),
        ));
    }
    let updated = tx.execute(
        "UPDATE delegation_graph_node
         SET state = ?, updated_at = ?, finished_at = ?
         WHERE id = ? AND graph_id = ? AND state = 'pending'
           AND scheduler_job_id IS NULL",
        params![
            state,
            now,
            now,
            task.graph_node_id,
            operation.delegation_graph_id
        ],
    )?;
    if updated != 1 {
        return Err(SystemServiceError::Invariant(
            "Team delegation pending node lost its settlement claim".to_string(),
        ));
    }
    crate::delegation::append_delegation_event_tx(
        tx,
        "delegation.node.settled",
        &json!({
            "graphId": operation.delegation_graph_id,
            "nodeId": task.graph_node_id,
            "taskId": task.id,
            "state": state,
            "kind": "team_delegation"
        }),
        now,
    )?;
    append_team_event_tx(
        tx,
        "team.delegation.task_settled",
        &json!({
            "conversationId": operation.conversation_id,
            "operationId": operation.id,
            "taskId": task.id,
            "targetParticipantId": task.target_participant_id,
            "state": state,
            "materialized": false
        }),
        now,
    )
}

pub(super) fn materialize_stored_task_tx(
    tx: &rusqlite::Transaction<'_>,
    operation: &TeamDelegationOperationRecord,
    task: &TeamDelegationTaskRecord,
    now: i64,
) -> Result<()> {
    if task.materialized_at.is_some() {
        return Err(SystemServiceError::Invariant(
            "Team delegation attempted to rematerialize a task".to_string(),
        ));
    }
    let participant =
        super::super::repository::get_participant_tx(tx, &task.target_participant_id)?.ok_or_else(
            || {
                SystemServiceError::Invariant(
                    "Team delegation downstream target participant is missing".to_string(),
                )
            },
        )?;
    if participant.conversation_id != operation.conversation_id {
        return Err(SystemServiceError::Invariant(
            "Team delegation downstream target left its conversation relation".to_string(),
        ));
    }
    let mut content = vec![json!({
        "type": "text",
        "id": format!("part_team_delegation_{}", task.id),
        "text": task.prompt
    })];
    content.extend(super::collection::build_dependency_input_parts_tx(
        tx, operation, task,
    )?);
    let submission = crate::sessions::submit_session_turn_tx(
        tx,
        &SubmitSessionTurn {
            id: Some(task.child_input_id.clone()),
            turn_id: Some(task.child_turn_id.clone()),
            session_id: task.target_session_id.clone(),
            principal_id: participant.principal_id,
            idempotency_key: task.input_idempotency_key.clone(),
            input_type: Some("user".to_string()),
            content: serde_json::Value::Array(content),
            origin: Some(json!({
                "kind": "agent",
                "sourceRef": operation.source_delivery_id,
                "parentRef": operation.id,
                "metadata": {
                    "teamConversationId": operation.conversation_id,
                    "teamDelegationOperationId": operation.id,
                    "teamDelegationTaskId": task.id,
                    "sourceTeamDeliveryId": operation.source_delivery_id,
                    "targetParticipantId": task.target_participant_id,
                    "leadParticipantId": operation.lead_participant_id
                }
            })),
            intent: Some("normal".to_string()),
            run_control_policy: None,
            expected_turn_id: None,
            job_id: Some(task.child_job_id.clone()),
            job_idempotency_key: Some(task.job_idempotency_key.clone()),
            execution_binding: task.execution_binding.clone(),
            max_steps: task.max_steps,
            regenerates_turn_id: None,
            scheduled_at: None,
            not_before: None,
            priority: task.priority,
            budget_grant_id: None,
        },
        now,
    )?;
    if submission.turn.id != task.child_turn_id || submission.job.id != task.child_job_id {
        return Err(SystemServiceError::Invariant(
            "Team delegation downstream admission resolved to another identity".to_string(),
        ));
    }
    let updated_node = tx.execute(
        "UPDATE delegation_graph_node
         SET state = 'running', scheduler_job_id = ?, started_at = ?, updated_at = ?
         WHERE id = ? AND graph_id = ? AND state = 'pending'
           AND scheduler_job_id IS NULL",
        params![
            task.child_job_id,
            now,
            now,
            task.graph_node_id,
            operation.delegation_graph_id
        ],
    )?;
    let updated_task = tx.execute(
        "UPDATE team_delegation_task SET materialized_at = ?, updated_at = ?
         WHERE id = ? AND operation_id = ? AND materialized_at IS NULL",
        params![now, now, task.id, operation.id],
    )?;
    if updated_node != 1 || updated_task != 1 {
        return Err(SystemServiceError::Invariant(
            "Team delegation downstream materialization lost its claim".to_string(),
        ));
    }
    crate::delegation::append_delegation_event_tx(
        tx,
        "delegation.node.materialized",
        &json!({
            "graphId": operation.delegation_graph_id,
            "nodeId": task.graph_node_id,
            "schedulerJobId": task.child_job_id,
            "schedulerJobKind": "session.turn",
            "kind": "team_delegation"
        }),
        now,
    )?;
    append_team_event_tx(
        tx,
        "team.delegation.task_materialized",
        &json!({
            "conversationId": operation.conversation_id,
            "operationId": operation.id,
            "taskId": task.id,
            "targetParticipantId": task.target_participant_id,
            "childTurnId": task.child_turn_id,
            "childJobId": task.child_job_id
        }),
        now,
    )
}

pub(super) fn finish_collection_if_complete_tx(
    tx: &rusqlite::Transaction<'_>,
    operation_id: &str,
    now: i64,
) -> Result<()> {
    let operation = get_operation_tx(tx, operation_id)?.ok_or_else(|| {
        SystemServiceError::Invariant("Team delegation collection lost its operation".to_string())
    })?;
    if is_terminal_operation_state(&operation.state) {
        return Ok(());
    }
    let tasks = list_tasks_tx(tx, &operation.id)?;
    let nodes = list_nodes_tx(tx, &operation.delegation_graph_id)?;
    if tasks.len() != nodes.len() {
        return Err(SystemServiceError::Invariant(
            "Team delegation task and node cardinality has drifted".to_string(),
        ));
    }
    if nodes
        .iter()
        .any(|node| !is_terminal_node_state(&node.state))
    {
        return Ok(());
    }
    let graph_state = if operation.state == "cancel_requested" {
        "cancelled"
    } else if nodes.iter().all(|node| node.state == "succeeded") {
        "succeeded"
    } else {
        "failed"
    };
    let result =
        super::collection::build_collection_result_tx(tx, &operation, &tasks, &nodes, graph_state)?;
    let updated_graph = tx.execute(
        "UPDATE delegation_graph SET state = ?, updated_at = ?, closed_at = ?
         WHERE id = ? AND state = 'running'",
        params![graph_state, now, now, operation.delegation_graph_id],
    )?;
    let updated_operation = tx.execute(
        "UPDATE team_delegation_operation
         SET state = ?, updated_at = ?, finished_at = ?
         WHERE id = ? AND state IN ('running', 'cancel_requested')",
        params![graph_state, now, now, operation.id],
    )?;
    if updated_graph != 1 || updated_operation != 1 {
        return Err(SystemServiceError::Invariant(
            "Team delegation collection lost its terminal claim".to_string(),
        ));
    }
    crate::delegation::append_delegation_event_tx(
        tx,
        "delegation.graph.settled",
        &json!({
            "graphId": operation.delegation_graph_id,
            "state": graph_state,
            "kind": "team_delegation"
        }),
        now,
    )?;
    let content = [ToolResultContentPart::Json {
        value: result.clone(),
    }];
    let (tool_state, error) = if graph_state == "cancelled" {
        (
            "failed",
            Some(json!({
                "error": "team_delegation_cancelled",
                "message": "Team delegation was cancelled.",
                "operationId": operation.id
            })),
        )
    } else {
        ("succeeded", None)
    };
    let execution = crate::tools::settle_waiting_tool_execution_tx(
        tx,
        &operation.parent_tool_execution_id,
        tool_state,
        &content,
        error.as_ref(),
        now,
    )?;
    append_team_event_tx(
        tx,
        "team.delegation.settled",
        &json!({
            "conversationId": operation.conversation_id,
            "operationId": operation.id,
            "delegationGraphId": operation.delegation_graph_id,
            "state": graph_state,
            "taskCount": tasks.len(),
            "parentTurnId": operation.parent_turn_id,
            "parentToolExecutionId": operation.parent_tool_execution_id
        }),
        now,
    )?;
    crate::tools::wake_waiting_tool_parent_tx(
        tx,
        &execution,
        "team_delegation",
        &operation.id,
        graph_state,
        now,
    )
}

fn find_task_by_child_job_tx(
    tx: &rusqlite::Transaction<'_>,
    child_job_id: &str,
) -> Result<Option<TeamDelegationTaskRecord>> {
    tx.query_row(
        &format!("{TASK_SELECT} WHERE child_job_id = ? AND materialized_at IS NOT NULL"),
        params![child_job_id],
        row_to_team_delegation_task,
    )
    .optional()
    .map_err(Into::into)
}

fn validate_terminal_child(
    task: &TeamDelegationTaskRecord,
    turn: &SessionTurnRecord,
    job: &SchedulerJobRecord,
) -> Result<()> {
    if task.materialized_at.is_none()
        || task.target_session_id != turn.session_id
        || task.child_input_id != turn.primary_input_id
        || task.child_turn_id != turn.id
        || task.child_job_id != turn.job_id
        || task.child_job_id != job.id
        || job.kind != "session.turn"
        || !crate::turns::is_terminal_turn_state(&turn.state)
        || !matches!(job.state.as_str(), "succeeded" | "failed" | "cancelled")
    {
        return Err(SystemServiceError::Invariant(
            "Team delegation child terminal evidence is incomplete".to_string(),
        ));
    }
    Ok(())
}

fn node_state_for_turn(turn_state: &str) -> Result<&'static str> {
    match turn_state {
        "succeeded" => Ok("succeeded"),
        "failed" | "recovery_required" => Ok("failed"),
        "cancelled" | "interrupted" => Ok("cancelled"),
        state => Err(SystemServiceError::Invariant(format!(
            "Team delegation child has nonterminal Turn state: {state}"
        ))),
    }
}

fn is_terminal_node_state(state: &str) -> bool {
    matches!(state, "succeeded" | "failed" | "cancelled" | "skipped")
}

fn is_terminal_operation_state(state: &str) -> bool {
    matches!(state, "succeeded" | "failed" | "cancelled")
}
