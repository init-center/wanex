use super::outcome::{validate_child_terminal_state, TeamDeliveryOutcomeContext};
use super::*;

const TEAM_PASS_TOOL_NAME: &str = "team_pass";
const TEAM_PASS_TOOL_IMPLEMENTATION_ID: &str = "wanex.team.tool.pass";
const TEAM_PASS_TOOL_IMPLEMENTATION_REVISION: &str = "1";
const TEAM_PASS_REASON_MAX_LENGTH: usize = 1_024;

pub(super) fn find_team_pass_execution_tx(
    tx: &rusqlite::Transaction<'_>,
    context: &TeamDeliveryOutcomeContext,
) -> Result<Option<ToolExecutionRecord>> {
    let executions = crate::tools::list_succeeded_tool_executions_by_name_tx(
        tx,
        &context.child_turn.id,
        TEAM_PASS_TOOL_NAME,
    )?;
    if executions.len() > 1 {
        return Err(SystemServiceError::Invariant(
            "Team child turn has multiple successful pass decisions".to_string(),
        ));
    }
    let Some(execution) = executions.into_iter().next() else {
        return Ok(None);
    };
    validate_team_pass_execution_tx(tx, context, &execution)?;
    Ok(Some(execution))
}

fn validate_team_pass_execution_tx(
    tx: &rusqlite::Transaction<'_>,
    context: &TeamDeliveryOutcomeContext,
    execution: &ToolExecutionRecord,
) -> Result<()> {
    let child_input_id = context.delivery.child_input_id.as_deref().ok_or_else(|| {
        SystemServiceError::Invariant(
            "Team delivery pass validation is missing child input".to_string(),
        )
    })?;
    let input = execution.input.as_object().ok_or_else(|| {
        SystemServiceError::Invariant("Team pass Tool input must be an object".to_string())
    })?;
    if input
        .keys()
        .any(|key| key != "deliveryId" && key != "reason")
        || input.get("deliveryId").and_then(serde_json::Value::as_str)
            != Some(context.delivery.id.as_str())
    {
        return Err(SystemServiceError::Invariant(
            "Team pass Tool input does not match its delivery".to_string(),
        ));
    }
    let reason = input.get("reason").map(|value| {
        value
            .as_str()
            .filter(|reason| {
                !reason.is_empty() && reason.chars().count() <= TEAM_PASS_REASON_MAX_LENGTH
            })
            .ok_or_else(|| {
                SystemServiceError::Invariant(
                    "Team pass reason must be a bounded non-empty string".to_string(),
                )
            })
    });
    let reason = reason.transpose()?;
    let expected_configuration_digest =
        crate::util::digest_json(&serde_json::json!({ "deliveryId": context.delivery.id }));
    let descriptor = &execution.descriptor;
    if execution.session_id != context.delivery.target_session_id
        || execution.turn_id != context.child_turn.id
        || execution.input_id != child_input_id
        || execution.principal_id != context.participant.principal_id
        || execution.tool_name != TEAM_PASS_TOOL_NAME
        || execution.state != "succeeded"
        || execution.is_error != Some(false)
        || execution.permission["status"] != "allow"
        || descriptor["name"] != TEAM_PASS_TOOL_NAME
        || descriptor["risk"] != "read_only"
        || descriptor["idempotent"] != true
        || descriptor["concurrency"] != "parallel_safe"
        || descriptor["resultMode"] != "immediate"
        || descriptor["inputSchema"]["type"] != "object"
        || descriptor["inputSchema"]["additionalProperties"] != false
        || descriptor["inputSchema"]["properties"]["deliveryId"]["const"] != context.delivery.id
        || descriptor["runtimeBinding"]["implementationId"] != TEAM_PASS_TOOL_IMPLEMENTATION_ID
        || descriptor["runtimeBinding"]["implementationRevision"]
            != TEAM_PASS_TOOL_IMPLEMENTATION_REVISION
        || descriptor["runtimeBinding"]["configurationDigest"] != expected_configuration_digest
    {
        return Err(SystemServiceError::Invariant(
            "Team pass Tool execution evidence does not match its exact binding".to_string(),
        ));
    }
    let snapshot_tools = context.child_turn.execution_binding["toolSnapshot"]["tools"]
        .as_array()
        .ok_or_else(|| {
            SystemServiceError::Invariant(
                "Team pass Tool is missing from the child turn binding".to_string(),
            )
        })?;
    let snapshot_matches = snapshot_tools
        .iter()
        .filter(|tool| tool["descriptor"]["name"] == TEAM_PASS_TOOL_NAME)
        .collect::<Vec<_>>();
    let mut execution_descriptor = descriptor.as_object().cloned().ok_or_else(|| {
        SystemServiceError::Invariant("Team pass Tool descriptor must be an object".to_string())
    })?;
    let execution_runtime_binding =
        execution_descriptor
            .remove("runtimeBinding")
            .ok_or_else(|| {
                SystemServiceError::Invariant(
                    "Team pass Tool descriptor is missing runtime binding".to_string(),
                )
            })?;
    if snapshot_matches.len() != 1
        || snapshot_matches[0]["descriptor"] != serde_json::Value::Object(execution_descriptor)
        || snapshot_matches[0]["runtimeBinding"] != execution_runtime_binding
    {
        return Err(SystemServiceError::Invariant(
            "Team pass Tool execution is outside the immutable child turn binding".to_string(),
        ));
    }
    let expected_result = match reason {
        Some(reason) => serde_json::json!({
            "kind": "team.pass",
            "deliveryId": context.delivery.id,
            "reason": reason
        }),
        None => serde_json::json!({
            "kind": "team.pass",
            "deliveryId": context.delivery.id
        }),
    };
    let result_matches = matches!(
        execution.content.as_deref(),
        Some([ToolResultContentPart::Json { value }]) if *value == expected_result
    );
    if !result_matches || execution.content_digest.is_none() {
        return Err(SystemServiceError::Invariant(
            "Team pass Tool result does not match its exact input".to_string(),
        ));
    }
    let source = crate::messages::get_message_tx(tx, &execution.source_message_id)?;
    let source_matches = source.session_id == context.delivery.target_session_id
        && source.turn_id == context.child_turn.id
        && source.role == "assistant"
        && source.content.as_array().is_some_and(|parts| {
            parts.iter().any(|part| {
                part["type"] == "tool_call"
                    && part["toolCallId"] == execution.tool_call_id
                    && part["toolName"] == TEAM_PASS_TOOL_NAME
                    && part["input"] == execution.input
            })
        });
    if !source_matches {
        return Err(SystemServiceError::Invariant(
            "Team pass Tool execution is not backed by its canonical assistant call".to_string(),
        ));
    }
    Ok(())
}

pub(super) fn require_completed_assistant_message_tx(
    tx: &rusqlite::Transaction<'_>,
    child_turn: &SessionTurnRecord,
) -> Result<SessionMessageRecord> {
    let message = crate::turns::get_terminal_assistant_message_tx(
        tx,
        &child_turn.session_id,
        &child_turn.id,
    )?
    .ok_or_else(|| {
        SystemServiceError::Invariant(
            "successful Team child turn is missing its terminal assistant message".to_string(),
        )
    })?;
    if message.turn_id != child_turn.id
        || message.role != "assistant"
        || message.status != "completed"
    {
        return Err(SystemServiceError::Invariant(
            "Team child terminal message does not match successful settlement".to_string(),
        ));
    }
    Ok(message)
}

pub(super) fn insert_reply_message_tx(
    tx: &rusqlite::Transaction<'_>,
    context: &TeamDeliveryOutcomeContext,
    assistant: &SessionMessageRecord,
    now: i64,
) -> Result<TeamMessageRecord> {
    if assistant.turn_id != context.child_turn.id
        || assistant.session_id != context.delivery.target_session_id
        || context.source_message.conversation_id != context.delivery.conversation_id
        || context.participant.id != context.delivery.target_participant_id
        || context.participant.conversation_id != context.delivery.conversation_id
    {
        return Err(SystemServiceError::Invariant(
            "team reply projection does not match durable delivery records".to_string(),
        ));
    }
    let content = project_public_reply_content(&assistant.content)?;
    let id = format!("tmsg_team_reply_{}", context.delivery.id);
    let idempotency_key = format!("team-delivery:{}:reply", context.delivery.id);
    if let Some(existing) = get_message_by_idempotency_key_tx(tx, &idempotency_key)? {
        if existing.id != id
            || existing.conversation_id != context.delivery.conversation_id
            || existing.author_participant_id != context.delivery.target_participant_id
            || existing.parent_message_id.as_deref() != Some(context.delivery.message_id.as_str())
            || existing.discussion_round_id != context.source_message.discussion_round_id
            || existing.kind != "message"
            || existing.state != "visible"
            || !existing.targets.is_empty()
            || existing.content != content
            || existing.idempotency_key != idempotency_key
        {
            return Err(SystemServiceError::Invariant(
                "team delivery reply identity exists with different content".to_string(),
            ));
        }
        return Ok(existing);
    }
    tx.execute(
        "INSERT INTO team_message (
            id, conversation_id, author_participant_id, parent_message_id,
            discussion_round_id, kind, state, targets_json, content_json,
            metadata_json, idempotency_key, revision,
            created_at, updated_at, visible_at
         ) VALUES (?, ?, ?, ?, ?, 'message', 'visible', '[]', ?, NULL, ?, 1, ?, ?, ?)",
        params![
            id,
            context.delivery.conversation_id,
            context.delivery.target_participant_id,
            context.delivery.message_id,
            context.source_message.discussion_round_id,
            serde_json::to_string(&content)?,
            idempotency_key,
            now,
            now,
            now
        ],
    )?;
    append_team_event_tx(
        tx,
        "team.message.admitted",
        &serde_json::json!({
            "conversationId": context.delivery.conversation_id,
            "messageId": id,
            "authorParticipantId": context.delivery.target_participant_id,
            "kind": "message",
            "source": "team_delivery_outcome",
            "sourceDeliveryId": context.delivery.id,
            "sourceChildMessageId": assistant.id
        }),
        now,
    )?;
    get_message_tx(tx, &id)?.ok_or_else(|| {
        SystemServiceError::Invariant("projected Team reply insert is missing".to_string())
    })
}

fn project_public_reply_content(content: &serde_json::Value) -> Result<serde_json::Value> {
    let parts = content.as_array().ok_or_else(|| {
        SystemServiceError::Invariant("Team child assistant content must be an array".to_string())
    })?;
    let projected = parts.iter().filter_map(project_public_reply_part).collect();
    let projected = serde_json::Value::Array(projected);
    super::validation::validate_team_public_content(&projected).map_err(|_| {
        SystemServiceError::Invariant(
            "successful Team child turn has no valid public reply; use team_pass explicitly"
                .to_string(),
        )
    })?;
    Ok(projected)
}

fn project_public_reply_part(part: &serde_json::Value) -> Option<serde_json::Value> {
    let object = part.as_object()?;
    let visibility = object.get("visibility").and_then(serde_json::Value::as_str);
    if matches!(visibility, Some("internal" | "provider_replay_only")) {
        return None;
    }
    let mut projected = serde_json::Map::new();
    match object.get("type").and_then(serde_json::Value::as_str) {
        Some("text") => {
            copy_team_reply_field(object, &mut projected, "type");
            copy_team_reply_field(object, &mut projected, "id");
            copy_team_reply_field(object, &mut projected, "text");
        }
        Some("resource") => {
            for key in [
                "type",
                "id",
                "resourceId",
                "sha256",
                "sizeBytes",
                "kind",
                "mediaType",
            ] {
                copy_team_reply_field(object, &mut projected, key);
            }
        }
        _ => return None,
    }
    if matches!(visibility, Some("user" | "assistant")) {
        copy_team_reply_field(object, &mut projected, "visibility");
    }
    Some(serde_json::Value::Object(projected))
}

fn copy_team_reply_field(
    source: &serde_json::Map<String, serde_json::Value>,
    target: &mut serde_json::Map<String, serde_json::Value>,
    key: &str,
) {
    if let Some(value) = source.get(key) {
        target.insert(key.to_string(), value.clone());
    }
}

pub(super) fn child_terminal_evidence(child_turn: &SessionTurnRecord) -> serde_json::Value {
    let evidence = child_turn.error.clone().unwrap_or_else(|| {
        serde_json::json!({
            "type": format!("child_turn_{}", child_turn.state),
            "reason": child_turn.cancel_reason
        })
    });
    super::materialization::bounded_delivery_error(&evidence)
}

pub(super) fn replay_projection_tx(
    tx: &rusqlite::Transaction<'_>,
    context: TeamDeliveryOutcomeContext,
) -> Result<ProjectTeamDeliveryOutcomeReceipt> {
    validate_child_terminal_state(&context.child_turn, &context.child_job)?;
    let (
        expected_delivery_state,
        child_assistant_message,
        reply_message,
        participation_tool_execution_id,
    ) = match context.child_turn.state.as_str() {
        "succeeded" => {
            let assistant = require_completed_assistant_message_tx(tx, &context.child_turn)?;
            if let Some(pass) = find_team_pass_execution_tx(tx, &context)? {
                if context.delivery.reply_message_id.is_some() {
                    return Err(SystemServiceError::Invariant(
                        "passed Team delivery cannot reference a reply message".to_string(),
                    ));
                }
                ("passed", Some(assistant), None, Some(pass.id))
            } else {
                let reply_id = context
                    .delivery
                    .reply_message_id
                    .as_deref()
                    .ok_or_else(|| {
                        SystemServiceError::Invariant(
                            "responded Team delivery is missing reply message".to_string(),
                        )
                    })?;
                let reply = get_message_tx(tx, reply_id)?.ok_or_else(|| {
                    SystemServiceError::Invariant(
                        "responded Team delivery reply message is missing".to_string(),
                    )
                })?;
                let expected_content = project_public_reply_content(&assistant.content)?;
                if reply.id != format!("tmsg_team_reply_{}", context.delivery.id)
                    || reply.conversation_id != context.delivery.conversation_id
                    || reply.parent_message_id.as_deref()
                        != Some(context.delivery.message_id.as_str())
                    || reply.discussion_round_id != context.source_message.discussion_round_id
                    || reply.author_participant_id != context.delivery.target_participant_id
                    || reply.kind != "message"
                    || reply.state != "visible"
                    || !reply.targets.is_empty()
                    || reply.content != expected_content
                    || reply.idempotency_key
                        != format!("team-delivery:{}:reply", context.delivery.id)
                {
                    return Err(SystemServiceError::Invariant(
                        "responded Team delivery reply no longer matches child output".to_string(),
                    ));
                }
                ("responded", Some(assistant), Some(reply), None)
            }
        }
        "failed" => ("failed", None, None, None),
        "cancelled" | "interrupted" => ("cancelled", None, None, None),
        state => {
            return Err(SystemServiceError::Invariant(format!(
                "invalid replayed Team child turn state: {state}"
            )));
        }
    };
    if context.delivery.state != expected_delivery_state
        || context.delivery.finished_at.is_none()
        || (expected_delivery_state != "responded" && context.delivery.reply_message_id.is_some())
        || context.delivery.participation_tool_execution_id.as_deref()
            != participation_tool_execution_id.as_deref()
    {
        return Err(SystemServiceError::Invariant(
            "replayed Team delivery outcome does not match child terminal state".to_string(),
        ));
    }
    let result = context.outcome_job.result.as_ref().ok_or_else(|| {
        SystemServiceError::Invariant(
            "completed Team outcome job is missing its durable result".to_string(),
        )
    })?;
    if result["teamDeliveryId"] != context.delivery.id
        || result["childTurnId"] != context.child_turn.id
        || result["childTurnJobId"] != context.child_job.id
        || result["outcome"] != expected_delivery_state
        || result["replyMessageId"]
            != reply_message
                .as_ref()
                .map(|message| serde_json::Value::String(message.id.clone()))
                .unwrap_or(serde_json::Value::Null)
        || result["participationToolExecutionId"]
            != participation_tool_execution_id
                .as_ref()
                .map(|id| serde_json::Value::String(id.clone()))
                .unwrap_or(serde_json::Value::Null)
    {
        return Err(SystemServiceError::Invariant(
            "completed Team outcome job result does not match durable projection".to_string(),
        ));
    }
    Ok(ProjectTeamDeliveryOutcomeReceipt {
        delivery: context.delivery,
        outcome_job: context.outcome_job,
        child_turn: context.child_turn,
        child_assistant_message,
        reply_message,
        created: false,
    })
}
