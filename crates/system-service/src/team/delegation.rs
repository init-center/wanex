use super::*;
use crate::rows::{
    row_to_delegation_graph_dependency, row_to_delegation_graph_node,
    row_to_team_delegation_operation, row_to_team_delegation_task,
};
use crate::{
    DeferToolExecution, DeferToolExecutionReceipt, DeferredTeamDelegationTask,
    DeferredToolOperation, DeferredToolOperationReceipt, DelegationGraphDependencyRecord,
    DelegationGraphNodeRecord, SubmitSessionTurn, SystemService, SystemServiceError,
    TeamDelegationOperationRecord, TeamDelegationTaskRecord,
};
use rusqlite::{params, OptionalExtension};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet, VecDeque};
use uuid::Uuid;

mod cancellation;
mod collection;
mod settlement;

pub(crate) use cancellation::{
    find_waiting_team_delegation_operation_tx, request_team_delegation_cancel_tx,
};
pub(crate) use settlement::settle_team_delegation_child_tx;

const MAX_TASKS: usize = 8;
const MAX_PROMPT_BYTES: usize = 32 * 1024;
const MAX_ID_BYTES: usize = 512;
const MAX_IDEMPOTENCY_BYTES: usize = 1024;

const OPERATION_SELECT: &str = "SELECT
    id, conversation_id, source_delivery_id, source_routing_decision_id,
    source_discussion_round_id, lead_participant_id, parent_session_id,
    parent_input_id, parent_turn_id, parent_session_attempt_id,
    parent_session_job_id, parent_tool_execution_id,
    parent_tool_invocation_attempt_id, parent_tool_call_id, delegation_graph_id,
    state, idempotency_key, created_at, updated_at, finished_at
 FROM team_delegation_operation";

const TASK_SELECT: &str = "SELECT
    id, operation_id, graph_node_id, target_participant_id, target_session_id,
    prompt, child_input_id, child_turn_id, child_job_id,
    input_idempotency_key, job_idempotency_key, execution_binding_json,
    execution_binding_digest, max_steps, priority, materialized_at,
    created_at, updated_at
 FROM team_delegation_task";

impl SystemService {
    pub(crate) fn defer_tool_execution_to_team_delegation(
        &self,
        request: &DeferToolExecution,
    ) -> Result<DeferToolExecutionReceipt> {
        let operation = match &request.operation {
            DeferredToolOperation::TeamDelegation {
                operation_id,
                conversation_id,
                source_delivery_id,
                lead_participant_id,
                graph_id,
                tasks,
            } => TeamDelegationRequestRef {
                operation_id,
                conversation_id,
                source_delivery_id,
                lead_participant_id,
                graph_id,
                tasks,
            },
            DeferredToolOperation::MediaGeneration { .. } => {
                return Err(SystemServiceError::Invariant(
                    "team delegation handler received a non-Team operation".to_string(),
                ));
            }
        };
        validate_request_shape(request, &operation)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;

        if let Some(existing) = find_operation_by_tool_tx(&tx, request.tool_execution_id.as_str())?
        {
            ensure_replayed_operation_tx(&tx, request, &existing, &operation)?;
            let receipt = deferred_team_receipt_tx(&tx, request, existing)?;
            tx.commit()?;
            return Ok(receipt);
        }
        if let Some(existing) = get_operation_tx(&tx, operation.operation_id)? {
            return Err(SystemServiceError::Invariant(format!(
                "team delegation operation id already belongs to another Tool execution: {}",
                existing.id
            )));
        }

        let owner = crate::tools::validate_deferred_tool_owner_tx(&tx, request, now)?;
        validate_team_delegate_tool(&owner.tool_execution)?;
        let source = validate_source_authority_tx(&tx, &owner, &operation)?;
        let validated_tasks = validate_tasks_tx(&tx, &source, &operation)?;

        let graph_id = operation.graph_id.to_string();
        tx.execute(
            "INSERT INTO delegation_graph (
                id, principal_id, title, state, metadata_json,
                idempotency_key, created_at, updated_at, closed_at
             ) VALUES (?, ?, ?, 'running', ?, ?, ?, ?, NULL)",
            params![
                graph_id,
                owner.tool_execution.principal_id,
                "Team delegated work",
                Option::<String>::None,
                format!("team-delegation-graph:{}", operation.operation_id),
                now,
                now
            ],
        )?;
        crate::delegation::append_delegation_event_tx(
            &tx,
            "delegation.graph.created",
            &json!({
                "graphId": graph_id,
                "principalId": owner.tool_execution.principal_id,
                "kind": "team_delegation"
            }),
            now,
        )?;

        let mut node_ids = HashMap::new();
        for task in &validated_tasks {
            let node_id = task.request.graph_node_id.clone();
            node_ids.insert(task.request.id.clone(), node_id.clone());
            let state = "pending";
            tx.execute(
                "INSERT INTO delegation_graph_node (
                    id, graph_id, kind, principal_id, state, payload_json,
                    scheduler_job_id, metadata_json, idempotency_key,
                    created_at, updated_at, started_at, finished_at
                 ) VALUES (?, ?, 'agent_task', ?, ?, ?, NULL, ?, ?, ?, ?, NULL, NULL)",
                params![
                    node_id,
                    graph_id,
                    task.participant.principal_id,
                    state,
                    "{}",
                    Option::<String>::None,
                    format!("team-delegation-node:{}", task.request.id),
                    now,
                    now
                ],
            )?;
            crate::delegation::append_delegation_event_tx(
                &tx,
                "delegation.node.created",
                &json!({
                    "graphId": graph_id,
                    "nodeId": node_id,
                    "taskId": task.request.id,
                    "state": state
                }),
                now,
            )?;
        }

        let operation_id = operation.operation_id.to_string();
        tx.execute(
            "INSERT INTO team_delegation_operation (
                id, conversation_id, source_delivery_id, source_routing_decision_id,
                source_discussion_round_id, lead_participant_id, parent_session_id,
                parent_input_id, parent_turn_id, parent_session_attempt_id,
                parent_session_job_id, parent_tool_execution_id,
                parent_tool_invocation_attempt_id, parent_tool_call_id,
                delegation_graph_id, state, idempotency_key, created_at,
                updated_at, finished_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, ?, ?, NULL)",
            params![
                operation_id,
                source.conversation.id,
                source.delivery.id,
                source.routing.id,
                source.round.id,
                operation.lead_participant_id,
                owner.turn.session_id,
                owner.turn.primary_input_id,
                owner.turn.id,
                owner.session_attempt.id,
                owner.session_job.id,
                owner.tool_execution.id,
                owner.tool_attempt.id,
                owner.tool_execution.tool_call_id,
                graph_id,
                format!("team-delegation-tool:{}", owner.tool_execution.id),
                now,
                now
            ],
        )?;

        let mut dependencies = Vec::new();
        for task in &validated_tasks {
            for dependency_id in &task.request.depends_on_task_ids {
                let dependency = format!("ddep_{}", Uuid::now_v7());
                let source_node_id = node_ids.get(dependency_id).ok_or_else(|| {
                    SystemServiceError::Invariant(
                        "team delegation dependency source disappeared".to_string(),
                    )
                })?;
                tx.execute(
                    "INSERT INTO delegation_graph_dependency (
                        id, graph_id, from_node_id, to_node_id, kind, created_at
                     ) VALUES (?, ?, ?, ?, 'after_success', ?)",
                    params![
                        dependency,
                        graph_id,
                        source_node_id,
                        task.request.graph_node_id,
                        now
                    ],
                )?;
                crate::delegation::append_delegation_event_tx(
                    &tx,
                    "delegation.dependency.created",
                    &json!({
                        "graphId": graph_id,
                        "dependencyId": dependency,
                        "fromNodeId": source_node_id,
                        "toNodeId": task.request.graph_node_id,
                        "kind": "after_success"
                    }),
                    now,
                )?;
                dependencies.push(dependency);
            }
        }

        let operation_record = get_operation_tx(&tx, &operation_id)?.ok_or_else(|| {
            SystemServiceError::Invariant("delegated operation insert missing".to_string())
        })?;
        for task in &validated_tasks {
            tx.execute(
                "INSERT INTO team_delegation_task (
                    id, operation_id, graph_node_id, target_participant_id,
                    target_session_id, prompt, child_input_id, child_turn_id,
                    child_job_id, input_idempotency_key, job_idempotency_key,
                    execution_binding_json, execution_binding_digest, max_steps,
                    priority, materialized_at, created_at, updated_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                params![
                    task.request.id,
                    operation_id,
                    task.request.graph_node_id,
                    task.request.target_participant_id,
                    task.participant
                        .agent_session_id
                        .as_deref()
                        .ok_or_else(|| {
                            SystemServiceError::Invariant(
                                "delegated target lost its agent session binding".to_string(),
                            )
                        })?,
                    task.request.prompt,
                    task.request.child_input_id,
                    task.request.child_turn_id,
                    task.request.child_job_id,
                    task.request.input_idempotency_key,
                    task.request.job_idempotency_key,
                    serde_json::to_string(&task.request.execution_binding)?,
                    task.execution_binding_digest,
                    task.request.max_steps,
                    task.request.priority,
                    Option::<i64>::None,
                    now,
                    now
                ],
            )?;
        }
        for task in validated_tasks
            .iter()
            .filter(|task| task.request.depends_on_task_ids.is_empty())
        {
            let stored = load_task_tx(&tx, &task.request.id)?.ok_or_else(|| {
                SystemServiceError::Invariant("delegated task insert missing".to_string())
            })?;
            settlement::materialize_stored_task_tx(&tx, &operation_record, &stored, now)?;
        }
        let tasks = list_tasks_tx(&tx, &operation_id)?;
        let jobs = tasks
            .iter()
            .filter(|task| task.materialized_at.is_some())
            .map(|task| crate::scheduler::get_job_tx(&tx, &task.child_job_id))
            .collect::<Result<Vec<_>>>()?;
        let mut nodes = Vec::new();

        crate::tools::suspend_deferred_tool_owner_tx(
            &tx,
            request,
            &json!({
                "teamDelegationOperationId": operation_id,
                "delegationGraphId": graph_id,
                "rootTaskCount": jobs.len(),
                "taskCount": tasks.len()
            }),
            "deferred_tool_team_delegation",
            now,
        )?;
        append_team_event_tx(
            &tx,
            "team.delegation.admitted",
            &json!({
                "conversationId": source.conversation.id,
                "sourceDeliveryId": source.delivery.id,
                "operationId": operation_id,
                "delegationGraphId": graph_id,
                "taskCount": tasks.len(),
                "rootTaskCount": jobs.len()
            }),
            now,
        )?;

        let record = get_operation_tx(&tx, &operation_id)?.ok_or_else(|| {
            SystemServiceError::Invariant("team delegation operation insert missing".to_string())
        })?;
        let graph = crate::delegation::get_graph_tx(&tx, &graph_id)?.ok_or_else(|| {
            SystemServiceError::Invariant("team delegation graph insert missing".to_string())
        })?;
        for task in &tasks {
            nodes.push(
                crate::delegation::get_node_tx(&tx, &task.graph_node_id)?.ok_or_else(|| {
                    SystemServiceError::Invariant("team delegation node insert missing".to_string())
                })?,
            );
        }
        let dependency_records = dependencies
            .iter()
            .map(|id| crate::delegation::get_dependency_tx(&tx, id))
            .collect::<Result<Vec<_>>>()?;
        let receipt = DeferToolExecutionReceipt {
            turn: crate::sessions::get_turn_tx(&tx, &request.turn_id)?,
            session_attempt: crate::turns::get_attempt_tx(&tx, &request.session_attempt_id)?,
            session_job: crate::scheduler::get_job_tx(&tx, &request.session_job_id)?,
            tool_execution: crate::tools::get_tool_execution_tx(&tx, &request.tool_execution_id)?,
            tool_invocation_attempt: crate::tools::get_tool_attempt_tx(
                &tx,
                &request.tool_invocation_attempt_id,
            )?,
            operation: DeferredToolOperationReceipt::TeamDelegation {
                record,
                tasks,
                graph,
                nodes,
                dependencies: dependency_records,
                jobs,
            },
        };
        tx.commit()?;
        Ok(receipt)
    }

    pub fn get_team_delegation_operation(
        &self,
        operation_id: &str,
    ) -> Result<Option<TeamDelegationOperationRecord>> {
        require_read_identity(operation_id, "team delegation operation id")?;
        let conn = self.connect()?;
        conn.query_row(
            &format!("{OPERATION_SELECT} WHERE id = ?"),
            params![operation_id],
            row_to_team_delegation_operation,
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn get_team_delegation_operation_by_tool_execution(
        &self,
        tool_execution_id: &str,
    ) -> Result<Option<TeamDelegationOperationRecord>> {
        require_read_identity(tool_execution_id, "Team delegation Tool execution id")?;
        let conn = self.connect()?;
        conn.query_row(
            &format!("{OPERATION_SELECT} WHERE parent_tool_execution_id = ?"),
            params![tool_execution_id],
            row_to_team_delegation_operation,
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn list_team_delegation_tasks(
        &self,
        operation_id: &str,
    ) -> Result<Vec<TeamDelegationTaskRecord>> {
        require_read_identity(operation_id, "team delegation operation id")?;
        let conn = self.connect()?;
        let mut statement = conn.prepare(&format!(
            "{TASK_SELECT} WHERE operation_id = ? ORDER BY created_at ASC, id ASC"
        ))?;
        let records = statement
            .query_map(params![operation_id], row_to_team_delegation_task)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(records)
    }
}

struct TeamDelegationRequestRef<'a> {
    operation_id: &'a str,
    conversation_id: &'a str,
    source_delivery_id: &'a str,
    lead_participant_id: &'a str,
    graph_id: &'a str,
    tasks: &'a [DeferredTeamDelegationTask],
}

struct TeamSourceAuthority {
    conversation: TeamConversationRecord,
    delivery: TeamDeliveryRecord,
    routing: TeamRoutingDecisionRecord,
    round: TeamDiscussionRoundRecord,
}

struct ValidatedTask {
    request: DeferredTeamDelegationTask,
    participant: TeamParticipantRecord,
    execution_binding_digest: String,
}

fn require_read_identity(value: &str, label: &str) -> Result<()> {
    if value.trim().is_empty() || value.len() > MAX_ID_BYTES {
        return Err(SystemServiceError::InvalidInput(format!(
            "{label} must contain 1 to {MAX_ID_BYTES} bytes"
        )));
    }
    Ok(())
}

fn validate_request_shape(
    request: &DeferToolExecution,
    operation: &TeamDelegationRequestRef<'_>,
) -> Result<()> {
    for value in [
        request.session_id.as_str(),
        request.turn_id.as_str(),
        request.session_attempt_id.as_str(),
        request.input_id.as_str(),
        request.source_message_id.as_str(),
        request.session_job_id.as_str(),
        request.worker_id.as_str(),
        request.lease_token.as_str(),
        request.tool_execution_id.as_str(),
        request.tool_invocation_attempt_id.as_str(),
        request.tool_call_id.as_str(),
        operation.operation_id,
        operation.conversation_id,
        operation.source_delivery_id,
        operation.lead_participant_id,
        operation.graph_id,
    ] {
        if value.trim().is_empty() || value.len() > MAX_IDEMPOTENCY_BYTES {
            return Err(SystemServiceError::InvalidInput(
                "team delegation identity fields are empty or too large".to_string(),
            ));
        }
    }
    if operation.tasks.is_empty() || operation.tasks.len() > MAX_TASKS {
        return Err(SystemServiceError::InvalidInput(format!(
            "team delegation task count must be between 1 and {MAX_TASKS}"
        )));
    }
    Ok(())
}

fn validate_team_delegate_tool(execution: &crate::ToolExecutionRecord) -> Result<()> {
    if execution.tool_name != "team_delegate"
        || execution.descriptor.get("risk").and_then(Value::as_str) != Some("external")
    {
        return Err(SystemServiceError::Invariant(
            "Team delegation requires the exact external team_delegate Tool".to_string(),
        ));
    }
    Ok(())
}

fn validate_source_authority_tx(
    tx: &rusqlite::Transaction<'_>,
    owner: &crate::tools::DeferredToolOwner,
    operation: &TeamDelegationRequestRef<'_>,
) -> Result<TeamSourceAuthority> {
    let delivery = super::repository::get_delivery_by_child_turn_job_tx(tx, &owner.session_job.id)?
        .ok_or_else(|| {
            SystemServiceError::Invariant(
                "Team delegation parent Turn is not a materialized Team delivery".to_string(),
            )
        })?;
    if delivery.id != operation.source_delivery_id
        || delivery.state != "dispatched"
        || delivery.role != "speaker"
        || delivery.target_session_id != owner.turn.session_id
        || delivery.child_turn_id.as_deref() != Some(owner.turn.id.as_str())
        || delivery.child_input_id.as_deref() != Some(owner.turn.primary_input_id.as_str())
        || delivery.child_turn_job_id.as_deref() != Some(owner.session_job.id.as_str())
    {
        return Err(SystemServiceError::Invariant(
            "Team delegation source delivery does not own the parent Turn".to_string(),
        ));
    }
    let conversation = super::repository::get_conversation_tx(tx, &delivery.conversation_id)?
        .ok_or_else(|| SystemServiceError::Invariant("Team conversation is missing".to_string()))?;
    if operation.conversation_id != conversation.id
        || conversation.mode != "orchestrated"
        || conversation.state != "open"
        || conversation.lead_participant_id.as_deref() != Some(operation.lead_participant_id)
        || delivery.target_participant_id != operation.lead_participant_id
    {
        return Err(SystemServiceError::Invariant(
            "Team delegation requires the current lead of an open orchestrated conversation"
                .to_string(),
        ));
    }
    let routing = super::repository::get_routing_decision_tx(tx, &delivery.routing_decision_id)?
        .ok_or_else(|| {
            SystemServiceError::Invariant("Team routing decision is missing".to_string())
        })?;
    let round = super::repository::get_discussion_round_tx(tx, &delivery.discussion_round_id)?
        .ok_or_else(|| {
            SystemServiceError::Invariant("Team discussion round is missing".to_string())
        })?;
    if routing.conversation_id != conversation.id
        || routing.message_id != delivery.message_id
        || routing.mode != "orchestrated"
        || routing.outcome != "deliver"
        || routing.lead_participant_id.as_deref() != Some(operation.lead_participant_id)
        || round.conversation_id != conversation.id
        || round.routing_decision_id != routing.id
        || round.state != "open"
    {
        return Err(SystemServiceError::Invariant(
            "Team delegation source delivery has stale routing authority".to_string(),
        ));
    }
    let lead = super::repository::get_participant_tx(tx, operation.lead_participant_id)?
        .ok_or_else(|| {
            SystemServiceError::Invariant("Team lead participant is missing".to_string())
        })?;
    if lead.state != "active"
        || lead.kind != "agent"
        || lead.agent_session_id.as_deref() != Some(owner.turn.session_id.as_str())
    {
        return Err(SystemServiceError::Invariant(
            "Team lead participant/session binding is not active".to_string(),
        ));
    }
    Ok(TeamSourceAuthority {
        conversation,
        delivery,
        routing,
        round,
    })
}

fn validate_tasks_tx(
    tx: &rusqlite::Transaction<'_>,
    source: &TeamSourceAuthority,
    operation: &TeamDelegationRequestRef<'_>,
) -> Result<Vec<ValidatedTask>> {
    let mut task_ids = HashSet::new();
    let mut node_ids = HashSet::new();
    let mut targets = HashSet::new();
    let mut target_sessions = HashSet::new();
    let mut child_inputs = HashSet::new();
    let mut child_turns = HashSet::new();
    let mut child_jobs = HashSet::new();
    let mut input_keys = HashSet::new();
    let mut job_keys = HashSet::new();
    let mut validated = Vec::with_capacity(operation.tasks.len());

    for task in operation.tasks {
        for (value, label, max) in [
            (task.id.as_str(), "task id", MAX_ID_BYTES),
            (task.graph_node_id.as_str(), "graph node id", MAX_ID_BYTES),
            (
                task.target_participant_id.as_str(),
                "target participant id",
                MAX_ID_BYTES,
            ),
            (
                task.target_session_id.as_str(),
                "target session id",
                MAX_ID_BYTES,
            ),
            (task.child_input_id.as_str(), "child input id", MAX_ID_BYTES),
            (task.child_turn_id.as_str(), "child turn id", MAX_ID_BYTES),
            (task.child_job_id.as_str(), "child job id", MAX_ID_BYTES),
            (
                task.input_idempotency_key.as_str(),
                "input idempotency key",
                MAX_IDEMPOTENCY_BYTES,
            ),
            (
                task.job_idempotency_key.as_str(),
                "job idempotency key",
                MAX_IDEMPOTENCY_BYTES,
            ),
        ] {
            if value.trim().is_empty() || value.len() > max {
                return Err(SystemServiceError::InvalidInput(format!(
                    "team delegation {label} is empty or too large"
                )));
            }
        }
        if task.prompt.trim().is_empty() || task.prompt.as_bytes().len() > MAX_PROMPT_BYTES {
            return Err(SystemServiceError::InvalidInput(format!(
                "team delegation prompt must be non-empty and at most {MAX_PROMPT_BYTES} bytes"
            )));
        }
        if !task_ids.insert(task.id.clone())
            || !node_ids.insert(task.graph_node_id.clone())
            || !child_inputs.insert(task.child_input_id.clone())
            || !child_turns.insert(task.child_turn_id.clone())
            || !child_jobs.insert(task.child_job_id.clone())
            || !input_keys.insert(task.input_idempotency_key.clone())
            || !job_keys.insert(task.job_idempotency_key.clone())
        {
            return Err(SystemServiceError::InvalidInput(
                "team delegation task identities must be unique".to_string(),
            ));
        }
        if task.target_participant_id == source.delivery.target_participant_id
            || !targets.insert(task.target_participant_id.clone())
        {
            return Err(SystemServiceError::InvalidInput(
                "Team delegation cannot target the lead or duplicate a participant".to_string(),
            ));
        }
        if task
            .max_steps
            .is_some_and(|value| !(1..=10_000).contains(&value))
        {
            return Err(SystemServiceError::InvalidInput(
                "team delegation max_steps must be between 1 and 10000".to_string(),
            ));
        }
        for dependency in &task.depends_on_task_ids {
            if dependency == &task.id || dependency.len() > MAX_ID_BYTES {
                return Err(SystemServiceError::InvalidInput(
                    "team delegation dependency is invalid".to_string(),
                ));
            }
        }
        let participant = super::repository::require_routable_agent_participant_tx(
            tx,
            &source.conversation.id,
            &task.target_participant_id,
        )?;
        if participant.agent_session_id.as_deref() != Some(task.target_session_id.as_str()) {
            return Err(SystemServiceError::Invariant(
                "Team delegation target session is not the participant binding".to_string(),
            ));
        }
        if task.target_session_id == source.delivery.target_session_id
            || !target_sessions.insert(task.target_session_id.clone())
        {
            return Err(SystemServiceError::Invariant(
                "Team delegation targets must have unique non-parent Sessions".to_string(),
            ));
        }
        let digest = crate::sessions::execution_binding_digest(&task.execution_binding)?;
        validated.push(ValidatedTask {
            request: task.clone(),
            participant,
            execution_binding_digest: digest,
        });
    }

    let task_set = validated
        .iter()
        .map(|task| task.request.id.as_str())
        .collect::<HashSet<_>>();
    let mut indegree = validated
        .iter()
        .map(|task| (task.request.id.clone(), 0usize))
        .collect::<HashMap<_, _>>();
    let mut adjacency = HashMap::<String, Vec<String>>::new();
    for task in &validated {
        let mut dependencies = HashSet::new();
        for dependency in &task.request.depends_on_task_ids {
            if !task_set.contains(dependency.as_str()) || !dependencies.insert(dependency.clone()) {
                return Err(SystemServiceError::InvalidInput(
                    "team delegation dependency must reference one task exactly once".to_string(),
                ));
            }
            *indegree
                .get_mut(&task.request.id)
                .expect("validated task id") += 1;
            adjacency
                .entry(dependency.clone())
                .or_default()
                .push(task.request.id.clone());
        }
    }
    let mut queue = indegree
        .iter()
        .filter_map(|(id, degree)| (*degree == 0).then_some(id.clone()))
        .collect::<VecDeque<_>>();
    let mut visited = 0usize;
    while let Some(id) = queue.pop_front() {
        visited += 1;
        for next in adjacency.get(&id).into_iter().flatten() {
            let degree = indegree.get_mut(next).expect("validated dependency target");
            *degree -= 1;
            if *degree == 0 {
                queue.push_back(next.clone());
            }
        }
    }
    if visited != validated.len() {
        return Err(SystemServiceError::InvalidInput(
            "team delegation dependencies must form a DAG".to_string(),
        ));
    }
    Ok(validated)
}

fn find_operation_by_tool_tx(
    tx: &rusqlite::Transaction<'_>,
    tool_execution_id: &str,
) -> Result<Option<TeamDelegationOperationRecord>> {
    tx.query_row(
        &format!("{OPERATION_SELECT} WHERE parent_tool_execution_id = ?"),
        params![tool_execution_id],
        row_to_team_delegation_operation,
    )
    .optional()
    .map_err(Into::into)
}

fn get_operation_tx(
    tx: &rusqlite::Transaction<'_>,
    operation_id: &str,
) -> Result<Option<TeamDelegationOperationRecord>> {
    tx.query_row(
        &format!("{OPERATION_SELECT} WHERE id = ?"),
        params![operation_id],
        row_to_team_delegation_operation,
    )
    .optional()
    .map_err(Into::into)
}

fn load_task_tx(
    tx: &rusqlite::Transaction<'_>,
    task_id: &str,
) -> Result<Option<TeamDelegationTaskRecord>> {
    tx.query_row(
        &format!("{TASK_SELECT} WHERE id = ?"),
        params![task_id],
        row_to_team_delegation_task,
    )
    .optional()
    .map_err(Into::into)
}

fn list_tasks_tx(
    tx: &rusqlite::Transaction<'_>,
    operation_id: &str,
) -> Result<Vec<TeamDelegationTaskRecord>> {
    let mut statement = tx.prepare(&format!(
        "{TASK_SELECT} WHERE operation_id = ? ORDER BY created_at ASC, id ASC"
    ))?;
    let records = statement
        .query_map(params![operation_id], row_to_team_delegation_task)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(SystemServiceError::from)?;
    Ok(records)
}

fn list_nodes_tx(
    tx: &rusqlite::Transaction<'_>,
    graph_id: &str,
) -> Result<Vec<DelegationGraphNodeRecord>> {
    let mut statement = tx.prepare(
        "SELECT id, graph_id, kind, principal_id, state, payload_json,
                scheduler_job_id, metadata_json, created_at, updated_at,
                started_at, finished_at
         FROM delegation_graph_node WHERE graph_id = ? ORDER BY created_at ASC, id ASC",
    )?;
    let records = statement
        .query_map(params![graph_id], row_to_delegation_graph_node)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(SystemServiceError::from)?;
    Ok(records)
}

fn list_dependencies_tx(
    tx: &rusqlite::Transaction<'_>,
    graph_id: &str,
) -> Result<Vec<DelegationGraphDependencyRecord>> {
    let mut statement = tx.prepare(
        "SELECT id, graph_id, from_node_id, to_node_id, kind, created_at
         FROM delegation_graph_dependency WHERE graph_id = ? ORDER BY created_at ASC, id ASC",
    )?;
    let records = statement
        .query_map(params![graph_id], row_to_delegation_graph_dependency)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(SystemServiceError::from)?;
    Ok(records)
}

fn deferred_team_receipt_tx(
    tx: &rusqlite::Transaction<'_>,
    request: &DeferToolExecution,
    operation: TeamDelegationOperationRecord,
) -> Result<DeferToolExecutionReceipt> {
    let tasks = list_tasks_tx(tx, &operation.id)?;
    let graph =
        crate::delegation::get_graph_tx(tx, &operation.delegation_graph_id)?.ok_or_else(|| {
            SystemServiceError::Invariant("replayed Team delegation graph is missing".to_string())
        })?;
    let nodes = list_nodes_tx(tx, &operation.delegation_graph_id)?;
    let dependencies = list_dependencies_tx(tx, &operation.delegation_graph_id)?;
    let jobs = tasks
        .iter()
        .filter(|task| task.materialized_at.is_some())
        .map(|task| crate::scheduler::get_job_tx(tx, &task.child_job_id))
        .collect::<Result<Vec<_>>>()?;
    Ok(DeferToolExecutionReceipt {
        turn: crate::sessions::get_turn_tx(tx, &request.turn_id)?,
        session_attempt: crate::turns::get_attempt_tx(tx, &request.session_attempt_id)?,
        session_job: crate::scheduler::get_job_tx(tx, &request.session_job_id)?,
        tool_execution: crate::tools::get_tool_execution_tx(tx, &request.tool_execution_id)?,
        tool_invocation_attempt: crate::tools::get_tool_attempt_tx(
            tx,
            &request.tool_invocation_attempt_id,
        )?,
        operation: DeferredToolOperationReceipt::TeamDelegation {
            record: operation,
            tasks,
            graph,
            nodes,
            dependencies,
            jobs,
        },
    })
}

fn ensure_replayed_operation_tx(
    tx: &rusqlite::Transaction<'_>,
    request: &DeferToolExecution,
    existing: &TeamDelegationOperationRecord,
    operation: &TeamDelegationRequestRef<'_>,
) -> Result<()> {
    if existing.id != operation.operation_id
        || existing.conversation_id != operation.conversation_id
        || existing.source_delivery_id != operation.source_delivery_id
        || existing.lead_participant_id != operation.lead_participant_id
        || existing.delegation_graph_id != operation.graph_id
        || existing.parent_session_id != request.session_id
        || existing.parent_input_id != request.input_id
        || existing.parent_turn_id != request.turn_id
        || existing.parent_session_attempt_id != request.session_attempt_id
        || existing.parent_session_job_id != request.session_job_id
        || existing.parent_tool_execution_id != request.tool_execution_id
        || existing.parent_tool_invocation_attempt_id != request.tool_invocation_attempt_id
        || existing.parent_tool_call_id != request.tool_call_id
    {
        return Err(SystemServiceError::Invariant(
            "conflicting repeated Team delegation operation".to_string(),
        ));
    }
    let stored = list_tasks_tx(tx, &existing.id)?;
    if stored.len() != operation.tasks.len() {
        return Err(SystemServiceError::Invariant(
            "conflicting repeated Team delegation task count".to_string(),
        ));
    }
    for request in operation.tasks {
        let task = stored
            .iter()
            .find(|task| task.id == request.id)
            .ok_or_else(|| {
                SystemServiceError::Invariant(
                    "conflicting repeated Team delegation task".to_string(),
                )
            })?;
        if task.graph_node_id != request.graph_node_id
            || task.target_participant_id != request.target_participant_id
            || task.target_session_id != request.target_session_id
            || task.prompt != request.prompt
            || task.child_input_id != request.child_input_id
            || task.child_turn_id != request.child_turn_id
            || task.child_job_id != request.child_job_id
            || task.input_idempotency_key != request.input_idempotency_key
            || task.job_idempotency_key != request.job_idempotency_key
            || task.execution_binding != request.execution_binding
            || task.max_steps != request.max_steps
            || task.priority != request.priority
        {
            return Err(SystemServiceError::Invariant(
                "conflicting repeated Team delegation task content".to_string(),
            ));
        }
    }
    let tool = crate::tools::get_tool_execution_tx(tx, &request.tool_execution_id)?;
    let attempt = crate::tools::get_tool_attempt_tx(tx, &request.tool_invocation_attempt_id)?;
    let stored_lease_token: String = tx.query_row(
        "SELECT lease_token FROM tool_execution_attempt WHERE id = ?",
        params![request.tool_invocation_attempt_id],
        |row| row.get(0),
    )?;
    if tool.source_message_id != request.source_message_id
        || tool.tool_call_id != request.tool_call_id
        || tool.current_invocation_attempt_id.as_deref()
            != Some(request.tool_invocation_attempt_id.as_str())
        || attempt.execution_id != request.tool_execution_id
        || attempt.session_attempt_id != request.session_attempt_id
        || attempt.job_id != request.session_job_id
        || attempt.worker_id != request.worker_id
        || stored_lease_token != request.lease_token
    {
        return Err(SystemServiceError::Invariant(
            "conflicting repeated Team delegation parent owner".to_string(),
        ));
    }
    let node_to_task = stored
        .iter()
        .map(|task| (task.graph_node_id.as_str(), task.id.as_str()))
        .collect::<HashMap<_, _>>();
    let actual_dependencies = list_dependencies_tx(tx, &existing.delegation_graph_id)?
        .into_iter()
        .map(|dependency| {
            let from = node_to_task
                .get(dependency.from_node_id.as_str())
                .ok_or_else(|| {
                    SystemServiceError::Invariant(
                        "Team delegation dependency source is not a typed task".to_string(),
                    )
                })?;
            let to = node_to_task
                .get(dependency.to_node_id.as_str())
                .ok_or_else(|| {
                    SystemServiceError::Invariant(
                        "Team delegation dependency target is not a typed task".to_string(),
                    )
                })?;
            Ok(((*from).to_string(), (*to).to_string(), dependency.kind))
        })
        .collect::<Result<HashSet<_>>>()?;
    let expected_dependencies = operation
        .tasks
        .iter()
        .flat_map(|task| {
            task.depends_on_task_ids.iter().map(move |dependency| {
                (
                    dependency.clone(),
                    task.id.clone(),
                    "after_success".to_string(),
                )
            })
        })
        .collect::<HashSet<_>>();
    if actual_dependencies != expected_dependencies {
        return Err(SystemServiceError::Invariant(
            "conflicting repeated Team delegation dependency graph".to_string(),
        ));
    }
    Ok(())
}
