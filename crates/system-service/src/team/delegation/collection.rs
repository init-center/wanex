use super::*;
use serde_json::{json, Map, Value};
use std::collections::HashMap;

const MAX_PUBLIC_PARTS_PER_TASK: usize = 8;
const MAX_TEXT_BYTES_PER_TASK: usize = 8 * 1024;
const MAX_TASK_RESULT_BYTES: usize = 12 * 1024;
const MAX_COLLECTION_BYTES: usize = 128 * 1024;
const MAX_DEPENDENCY_INPUT_PARTS: usize = 32;
const MAX_DEPENDENCY_TEXT_BYTES: usize = 32 * 1024;
const DEPENDENCY_TRUNCATION_NOTICE: &str = "[Additional dependency output was truncated.]";

pub(super) fn build_dependency_input_parts_tx(
    tx: &rusqlite::Transaction<'_>,
    operation: &TeamDelegationOperationRecord,
    target: &TeamDelegationTaskRecord,
) -> Result<Vec<Value>> {
    let dependencies = list_dependencies_tx(tx, &operation.delegation_graph_id)?;
    let tasks = list_tasks_tx(tx, &operation.id)?;
    let tasks_by_node = tasks
        .iter()
        .map(|task| (task.graph_node_id.as_str(), task))
        .collect::<HashMap<_, _>>();
    let mut sources = dependencies
        .iter()
        .filter(|dependency| dependency.to_node_id == target.graph_node_id)
        .map(|dependency| {
            tasks_by_node
                .get(dependency.from_node_id.as_str())
                .copied()
                .ok_or_else(|| {
                    SystemServiceError::Invariant(
                        "Team delegation dependency task is missing".to_string(),
                    )
                })
        })
        .collect::<Result<Vec<_>>>()?;
    sources.sort_by(|left, right| left.id.cmp(&right.id));

    let text_limit = MAX_DEPENDENCY_TEXT_BYTES - DEPENDENCY_TRUNCATION_NOTICE.len();
    let mut output = Vec::new();
    let mut text_bytes = 0usize;
    let mut truncated = false;
    for source in sources {
        let turn = crate::sessions::get_turn_tx(tx, &source.child_turn_id)?;
        if turn.state != "succeeded" || source.materialized_at.is_none() {
            return Err(SystemServiceError::Invariant(
                "Team delegation downstream dependency is not successful".to_string(),
            ));
        }
        let assistant = crate::turns::get_terminal_assistant_message_tx(
            tx,
            &source.target_session_id,
            &source.child_turn_id,
        )?
        .ok_or_else(|| {
            SystemServiceError::Invariant(
                "Team delegation dependency is missing its assistant output".to_string(),
            )
        })?;
        let (parts, source_truncation) = project_public_parts(&assistant.content)?;
        truncated |= source_truncation.truncated;
        let mut source_text = format!("Dependency {} result:", source.id);
        for part in &parts {
            if let Some(text) = part.get("text").and_then(Value::as_str) {
                source_text.push('\n');
                source_text.push_str(text);
            }
        }
        if text_bytes < text_limit && output.len() < MAX_DEPENDENCY_INPUT_PARTS {
            let remaining = text_limit - text_bytes;
            let (source_text, omitted) = truncate_utf8(&source_text, remaining);
            truncated |= omitted > 0;
            text_bytes += source_text.len();
            if !source_text.is_empty() {
                output.push(json!({
                    "type": "text",
                    "id": dependency_part_id(target, source, output.len()),
                    "text": source_text
                }));
            }
        } else {
            truncated = true;
        }
        for part in parts.iter().filter(|part| part["type"] == "resource") {
            if output.len() >= MAX_DEPENDENCY_INPUT_PARTS {
                truncated = true;
                break;
            }
            let mut resource = part.clone();
            resource["id"] = Value::String(dependency_part_id(target, source, output.len()));
            output.push(resource);
        }
    }
    if truncated && output.len() < MAX_DEPENDENCY_INPUT_PARTS {
        output.push(json!({
            "type": "text",
            "id": dependency_notice_part_id(target),
            "text": DEPENDENCY_TRUNCATION_NOTICE
        }));
    }
    Ok(output)
}

pub(super) fn build_collection_result_tx(
    tx: &rusqlite::Transaction<'_>,
    operation: &TeamDelegationOperationRecord,
    tasks: &[TeamDelegationTaskRecord],
    nodes: &[DelegationGraphNodeRecord],
    graph_state: &str,
) -> Result<Value> {
    let nodes_by_id = nodes
        .iter()
        .map(|node| (node.id.as_str(), node))
        .collect::<HashMap<_, _>>();
    let mut results = Vec::with_capacity(tasks.len());
    for task in tasks {
        let node = nodes_by_id
            .get(task.graph_node_id.as_str())
            .ok_or_else(|| {
                SystemServiceError::Invariant(
                    "Team delegation collection task is missing its graph node".to_string(),
                )
            })?;
        results.push(build_task_result_tx(tx, task, node)?);
    }
    let result = json!({
        "kind": "team.delegation_result",
        "operationId": operation.id,
        "graphState": graph_state,
        "tasks": results
    });
    if serde_json::to_vec(&result)?.len() > MAX_COLLECTION_BYTES {
        return Err(SystemServiceError::Invariant(format!(
            "Team delegation collection exceeds {MAX_COLLECTION_BYTES} bytes"
        )));
    }
    Ok(result)
}

fn build_task_result_tx(
    tx: &rusqlite::Transaction<'_>,
    task: &TeamDelegationTaskRecord,
    node: &DelegationGraphNodeRecord,
) -> Result<Value> {
    match node.state.as_str() {
        "succeeded" => build_succeeded_task_result_tx(tx, task),
        "failed" | "cancelled" => {
            let child_turn = if task.materialized_at.is_some() {
                Some(crate::sessions::get_turn_tx(tx, &task.child_turn_id)?)
            } else {
                None
            };
            if let Some(turn) = &child_turn {
                let expected = match node.state.as_str() {
                    "failed" => matches!(turn.state.as_str(), "failed" | "recovery_required"),
                    "cancelled" => {
                        matches!(turn.state.as_str(), "cancelled" | "interrupted")
                    }
                    _ => false,
                };
                if !expected {
                    return Err(SystemServiceError::Invariant(
                        "Team delegation node terminal state disagrees with its child Turn"
                            .to_string(),
                    ));
                }
            }
            Ok(terminal_task_result(
                task,
                &node.state,
                terminal_error(&node.state, child_turn.as_ref()),
            ))
        }
        "skipped" => Ok(terminal_task_result(
            task,
            "skipped",
            json!({
                "code": "dependency_not_satisfied",
                "message": "A required delegated task did not succeed."
            }),
        )),
        state => Err(SystemServiceError::Invariant(format!(
            "Team delegation collection found nonterminal node: {state}"
        ))),
    }
}

fn build_succeeded_task_result_tx(
    tx: &rusqlite::Transaction<'_>,
    task: &TeamDelegationTaskRecord,
) -> Result<Value> {
    if task.materialized_at.is_none() {
        return Err(SystemServiceError::Invariant(
            "successful Team delegation task was never materialized".to_string(),
        ));
    }
    let turn = crate::sessions::get_turn_tx(tx, &task.child_turn_id)?;
    if turn.session_id != task.target_session_id
        || turn.primary_input_id != task.child_input_id
        || turn.job_id != task.child_job_id
        || turn.state != "succeeded"
    {
        return Err(SystemServiceError::Invariant(
            "successful Team delegation task does not match its child Turn".to_string(),
        ));
    }
    let assistant = crate::turns::get_terminal_assistant_message_tx(
        tx,
        &task.target_session_id,
        &task.child_turn_id,
    )?
    .ok_or_else(|| {
        SystemServiceError::Invariant(
            "successful Team delegation child is missing its assistant message".to_string(),
        )
    })?;
    if assistant.role != "assistant" || assistant.status != "completed" {
        return Err(SystemServiceError::Invariant(
            "Team delegation child assistant message is not completed".to_string(),
        ));
    }

    let (mut parts, mut truncation) = project_public_parts(&assistant.content)?;
    loop {
        let result = succeeded_task_result(task, &parts, &truncation);
        if serde_json::to_vec(&result)?.len() <= MAX_TASK_RESULT_BYTES {
            return Ok(result);
        }
        let Some(removed) = parts.pop() else {
            return Err(SystemServiceError::Invariant(format!(
                "Team delegation task result metadata exceeds {MAX_TASK_RESULT_BYTES} bytes"
            )));
        };
        truncation.truncated = true;
        truncation.omitted_parts += 1;
        truncation.omitted_text_bytes += text_bytes(&removed);
    }
}

fn project_public_parts(content: &Value) -> Result<(Vec<Value>, Truncation)> {
    let source = content.as_array().ok_or_else(|| {
        SystemServiceError::Invariant(
            "Team delegation child assistant content must be an array".to_string(),
        )
    })?;
    let mut parts = Vec::new();
    let mut text_bytes = 0usize;
    let mut truncation = Truncation::default();
    for part in source {
        let Some(object) = part.as_object() else {
            return Err(SystemServiceError::Invariant(
                "Team delegation child assistant part must be an object".to_string(),
            ));
        };
        if matches!(
            object.get("visibility").and_then(Value::as_str),
            Some("internal" | "provider_replay_only")
        ) {
            continue;
        }
        let projected = match object.get("type").and_then(Value::as_str) {
            Some("text") => {
                let text = object.get("text").and_then(Value::as_str).ok_or_else(|| {
                    SystemServiceError::Invariant(
                        "Team delegation public text part is malformed".to_string(),
                    )
                })?;
                if parts.len() >= MAX_PUBLIC_PARTS_PER_TASK || text_bytes >= MAX_TEXT_BYTES_PER_TASK
                {
                    truncation.omit_part(Some(text));
                    continue;
                }
                let remaining = MAX_TEXT_BYTES_PER_TASK - text_bytes;
                let (text, omitted) = truncate_utf8(text, remaining);
                text_bytes += text.len();
                if omitted > 0 {
                    truncation.truncated = true;
                    truncation.omitted_text_bytes += omitted;
                }
                json!({ "type": "text", "text": text })
            }
            Some("resource") => {
                if parts.len() >= MAX_PUBLIC_PARTS_PER_TASK {
                    truncation.omit_part(None);
                    continue;
                }
                project_resource_part(object)?
            }
            _ => continue,
        };
        parts.push(projected);
    }
    Ok((parts, truncation))
}

fn project_resource_part(object: &Map<String, Value>) -> Result<Value> {
    let resource_id = required_string(object, "resourceId")?;
    let sha256 = required_string(object, "sha256")?;
    let size_bytes = object
        .get("sizeBytes")
        .and_then(Value::as_i64)
        .ok_or_else(|| {
            SystemServiceError::Invariant(
                "Team delegation public resource size is malformed".to_string(),
            )
        })?;
    let kind = required_string(object, "kind")?;
    let media_type = object.get("mediaType").and_then(Value::as_str);
    let mut projected = json!({
        "type": "resource",
        "resourceId": resource_id,
        "sha256": sha256,
        "sizeBytes": size_bytes,
        "kind": kind
    });
    if let Some(media_type) = media_type {
        projected["mediaType"] = Value::String(media_type.to_string());
    }
    Ok(projected)
}

fn required_string<'a>(object: &'a Map<String, Value>, key: &str) -> Result<&'a str> {
    object.get(key).and_then(Value::as_str).ok_or_else(|| {
        SystemServiceError::Invariant(format!(
            "Team delegation public resource {key} is malformed"
        ))
    })
}

fn succeeded_task_result(
    task: &TeamDelegationTaskRecord,
    parts: &[Value],
    truncation: &Truncation,
) -> Value {
    json!({
        "taskId": task.id,
        "targetParticipantId": task.target_participant_id,
        "state": "succeeded",
        "output": { "parts": parts },
        "truncation": truncation.to_json()
    })
}

fn terminal_task_result(task: &TeamDelegationTaskRecord, state: &str, error: Value) -> Value {
    json!({
        "taskId": task.id,
        "targetParticipantId": task.target_participant_id,
        "state": state,
        "error": error,
        "truncation": Truncation::default().to_json()
    })
}

fn terminal_error(state: &str, turn: Option<&crate::SessionTurnRecord>) -> Value {
    match state {
        "failed" if turn.is_some_and(|turn| turn.state == "recovery_required") => json!({
            "code": "child_recovery_required",
            "message": "The delegated task could not be recovered safely."
        }),
        "failed" => json!({
            "code": "child_turn_failed",
            "message": "The delegated task failed."
        }),
        "cancelled" if turn.is_none() => json!({
            "code": "team_delegation_cancelled",
            "message": "The delegated task was cancelled before it started."
        }),
        "cancelled" => json!({
            "code": "child_turn_cancelled",
            "message": "The delegated task was cancelled."
        }),
        _ => json!({
            "code": "child_turn_terminal",
            "message": "The delegated task ended without a result."
        }),
    }
}

fn truncate_utf8(value: &str, max_bytes: usize) -> (String, usize) {
    if value.len() <= max_bytes {
        return (value.to_string(), 0);
    }
    let mut end = max_bytes;
    while end > 0 && !value.is_char_boundary(end) {
        end -= 1;
    }
    (value[..end].to_string(), value.len() - end)
}

fn text_bytes(part: &Value) -> usize {
    part.get("text").and_then(Value::as_str).map_or(0, str::len)
}

fn dependency_part_id(
    target: &TeamDelegationTaskRecord,
    source: &TeamDelegationTaskRecord,
    index: usize,
) -> String {
    let digest = crate::util::digest_json(&json!({
        "targetTaskId": target.id,
        "sourceTaskId": source.id,
        "index": index
    }));
    format!("part_team_dependency_{}", &digest[..24])
}

fn dependency_notice_part_id(target: &TeamDelegationTaskRecord) -> String {
    let digest = crate::util::digest_json(&json!({
        "targetTaskId": target.id,
        "kind": "dependency_truncation"
    }));
    format!("part_team_dependency_{}", &digest[..24])
}

#[derive(Default)]
struct Truncation {
    truncated: bool,
    omitted_parts: usize,
    omitted_text_bytes: usize,
}

impl Truncation {
    fn omit_part(&mut self, text: Option<&str>) {
        self.truncated = true;
        self.omitted_parts += 1;
        self.omitted_text_bytes += text.map_or(0, str::len);
    }

    fn to_json(&self) -> Value {
        json!({
            "truncated": self.truncated,
            "omittedParts": self.omitted_parts,
            "omittedTextBytes": self.omitted_text_bytes
        })
    }
}
