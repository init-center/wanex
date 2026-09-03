use super::outcome_projection::{
    child_terminal_evidence, find_team_pass_execution_tx, insert_reply_message_tx,
    replay_projection_tx, require_completed_assistant_message_tx,
};
use super::*;

pub(super) struct TeamDeliveryOutcomeContext {
    pub(super) delivery: TeamDeliveryRecord,
    pub(super) participant: TeamParticipantRecord,
    pub(super) source_message: TeamMessageRecord,
    pub(super) child_turn: SessionTurnRecord,
    pub(super) child_job: SchedulerJobRecord,
    pub(super) outcome_job: SchedulerJobRecord,
}

impl SystemService {
    pub fn project_team_delivery_outcome(
        &self,
        request: &ProjectTeamDeliveryOutcome,
    ) -> Result<ProjectTeamDeliveryOutcomeReceipt> {
        validate_projection_request(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let context = load_outcome_context_tx(&tx, &request.delivery_id)?;
        validate_outcome_identity(&context, &request.outcome_job_id)?;

        if context.outcome_job.state == "succeeded" {
            let receipt = replay_projection_tx(&tx, context)?;
            tx.commit()?;
            return Ok(receipt);
        }
        if context.delivery.state != "dispatched" {
            return Err(SystemServiceError::Invariant(format!(
                "team delivery outcome cannot be projected from state: {}",
                context.delivery.state
            )));
        }
        validate_outcome_lease(&context, &request.worker_id, &request.lease_token)?;
        validate_child_terminal_state(&context.child_turn, &context.child_job)?;

        let child_assistant_message = if context.child_turn.state == "succeeded" {
            Some(require_completed_assistant_message_tx(
                &tx,
                &context.child_turn,
            )?)
        } else {
            None
        };
        let participation_tool_execution = if context.child_turn.state == "succeeded" {
            find_team_pass_execution_tx(&tx, &context)?
        } else {
            None
        };
        let reply_message = match (
            child_assistant_message.as_ref(),
            participation_tool_execution.as_ref(),
        ) {
            (Some(assistant), None) => {
                Some(insert_reply_message_tx(&tx, &context, assistant, now)?)
            }
            _ => None,
        };
        let delivery_state = match context.child_turn.state.as_str() {
            "succeeded" if participation_tool_execution.is_some() => "passed",
            "succeeded" => "responded",
            "failed" => "failed",
            "cancelled" | "interrupted" => "cancelled",
            state => {
                return Err(SystemServiceError::Invariant(format!(
                    "invalid terminal child turn state for Team projection: {state}"
                )));
            }
        };
        let terminal_error = if matches!(delivery_state, "responded" | "passed") {
            None
        } else {
            Some(child_terminal_evidence(&context.child_turn))
        };
        let updated = tx.execute(
            "UPDATE team_delivery
             SET state = ?, reply_message_id = ?, participation_tool_execution_id = ?,
                 last_error_json = ?,
                 updated_at = ?, finished_at = ?
             WHERE id = ? AND outcome_job_id = ? AND state = 'dispatched'",
            params![
                delivery_state,
                reply_message.as_ref().map(|message| message.id.as_str()),
                participation_tool_execution
                    .as_ref()
                    .map(|execution| execution.id.as_str()),
                terminal_error
                    .as_ref()
                    .map(serde_json::to_string)
                    .transpose()?,
                now,
                now,
                context.delivery.id,
                context.outcome_job.id
            ],
        )?;
        if updated != 1 {
            return Err(SystemServiceError::Invariant(
                "team delivery lost its outcome projection claim".to_string(),
            ));
        }

        let outcome_job = crate::scheduler::complete_team_delivery_outcome_job_tx(
            &tx,
            &CompleteJob {
                job_id: context.outcome_job.id.clone(),
                worker_id: request.worker_id.clone(),
                lease_token: request.lease_token.clone(),
                result: Some(serde_json::json!({
                    "teamDeliveryId": context.delivery.id,
                    "childTurnId": context.child_turn.id,
                    "childTurnJobId": context.child_job.id,
                    "outcome": delivery_state,
                    "replyMessageId": reply_message.as_ref().map(|message| message.id.as_str()),
                    "participationToolExecutionId": participation_tool_execution
                        .as_ref()
                        .map(|execution| execution.id.as_str())
                })),
            },
            now,
        )?
        .ok_or_else(|| {
            SystemServiceError::Invariant(
                "team delivery outcome job lost its completion lease".to_string(),
            )
        })?;
        append_team_event_tx(
            &tx,
            "team.delivery.outcome_projected",
            &serde_json::json!({
                "conversationId": context.delivery.conversation_id,
                "sourceMessageId": context.delivery.message_id,
                "deliveryId": context.delivery.id,
                "outcomeJobId": outcome_job.id,
                "childTurnId": context.child_turn.id,
                "childTurnJobId": context.child_job.id,
                "outcome": delivery_state,
                "replyMessageId": reply_message.as_ref().map(|message| message.id.as_str()),
                "participationToolExecutionId": participation_tool_execution
                    .as_ref()
                    .map(|execution| execution.id.as_str())
            }),
            now,
        )?;
        reconcile_team_discussion_round_tx(&tx, &context.delivery.discussion_round_id, now)?;
        let delivery = get_delivery_tx(&tx, &context.delivery.id)?.ok_or_else(|| {
            SystemServiceError::Invariant(
                "projected team delivery could not be reloaded".to_string(),
            )
        })?;
        tx.commit()?;
        Ok(ProjectTeamDeliveryOutcomeReceipt {
            delivery,
            outcome_job,
            child_turn: context.child_turn,
            child_assistant_message,
            reply_message,
            created: true,
        })
    }
}

pub(crate) fn enqueue_team_delivery_outcome_tx(
    tx: &rusqlite::Transaction<'_>,
    child_job: &SchedulerJobRecord,
    now: i64,
) -> Result<()> {
    let Some(delivery) = get_delivery_by_child_turn_job_tx(tx, &child_job.id)? else {
        return Ok(());
    };
    let child_turn_id = delivery.child_turn_id.as_deref().ok_or_else(|| {
        SystemServiceError::Invariant(
            "dispatched team delivery has no child turn for outcome".to_string(),
        )
    })?;
    let child_turn = crate::sessions::get_turn_tx(tx, child_turn_id)?;
    validate_child_terminal_state(&child_turn, child_job)?;

    if let Some(outcome_job_id) = &delivery.outcome_job_id {
        let outcome_job = crate::scheduler::get_job_tx(tx, outcome_job_id)?;
        validate_outcome_job_binding(&delivery, &child_turn, child_job, &outcome_job)?;
        return Ok(());
    }
    if delivery.state != "dispatched" {
        return Err(SystemServiceError::Invariant(format!(
            "team delivery cannot enqueue outcome from state: {}",
            delivery.state
        )));
    }
    let participant =
        get_participant_tx(tx, &delivery.target_participant_id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!(
                "team delivery outcome participant is missing: {}",
                delivery.target_participant_id
            ))
        })?;
    let outcome_job = crate::scheduler::enqueue_job_tx(
        tx,
        &EnqueueJob {
            id: Some(format!("job_team_outcome_{}", delivery.id)),
            kind: SchedulerJobKind::TeamDeliveryOutcome,
            queue: None,
            principal_id: participant.principal_id,
            payload: serde_json::json!({
                "teamDeliveryId": delivery.id,
                "teamConversationId": delivery.conversation_id,
                "sourceTeamMessageId": delivery.message_id,
                "targetParticipantId": delivery.target_participant_id,
                "childSessionId": delivery.target_session_id,
                "childTurnId": child_turn.id,
                "childTurnJobId": child_job.id
            }),
            scheduled_at: None,
            not_before: None,
            priority: Some(child_job.priority),
            concurrency_key: Some(format!(
                "team-conversation:{}:outcome",
                delivery.conversation_id
            )),
            max_attempts: Some(3),
            retry_policy: Some(RetryPolicy {
                strategy: RetryStrategy::Exponential,
                initial_delay_ms: Some(1_000),
                max_delay_ms: Some(30_000),
            }),
            idempotency_key: Some(format!("team-delivery:{}:outcome", delivery.id)),
            budget_grant_id: None,
        },
        now,
    )?;
    let updated = tx.execute(
        "UPDATE team_delivery SET outcome_job_id = ?, updated_at = ?
         WHERE id = ? AND child_turn_job_id = ? AND state = 'dispatched'
           AND outcome_job_id IS NULL",
        params![outcome_job.id, now, delivery.id, child_job.id],
    )?;
    if updated != 1 {
        return Err(SystemServiceError::Invariant(
            "team delivery lost its outcome outbox claim".to_string(),
        ));
    }
    append_team_event_tx(
        tx,
        "team.delivery.outcome_queued",
        &serde_json::json!({
            "conversationId": delivery.conversation_id,
            "sourceMessageId": delivery.message_id,
            "deliveryId": delivery.id,
            "outcomeJobId": outcome_job.id,
            "childTurnId": child_turn.id,
            "childTurnJobId": child_job.id,
            "childTurnState": child_turn.state
        }),
        now,
    )
}

pub(crate) fn sync_team_delivery_outcome_failure_tx(
    tx: &rusqlite::Transaction<'_>,
    outcome_job: &SchedulerJobRecord,
    error: &serde_json::Value,
    now: i64,
) -> Result<()> {
    let delivery = get_delivery_by_outcome_job_tx(tx, &outcome_job.id)?.ok_or_else(|| {
        SystemServiceError::Invariant(format!(
            "team outcome job has no delivery: {}",
            outcome_job.id
        ))
    })?;
    if delivery.state != "dispatched" {
        return Err(SystemServiceError::Invariant(format!(
            "team outcome failure cannot settle delivery state: {}",
            delivery.state
        )));
    }
    let stored_error = super::materialization::bounded_delivery_error(error);
    let (state, finished_at) = match outcome_job.state.as_str() {
        "retry_scheduled" => ("dispatched", None),
        "failed" => ("failed", Some(now)),
        state => {
            return Err(SystemServiceError::Invariant(format!(
                "invalid team outcome failure job state: {state}"
            )));
        }
    };
    let updated = tx.execute(
        "UPDATE team_delivery
         SET state = ?, last_error_json = ?, updated_at = ?, finished_at = ?
         WHERE id = ? AND state = 'dispatched'",
        params![
            state,
            serde_json::to_string(&stored_error)?,
            now,
            finished_at,
            delivery.id
        ],
    )?;
    if updated != 1 {
        return Err(SystemServiceError::Invariant(
            "team delivery lost its outcome failure claim".to_string(),
        ));
    }
    append_team_event_tx(
        tx,
        if state == "failed" {
            "team.delivery.outcome_projection_failed"
        } else {
            "team.delivery.outcome_projection_retry_scheduled"
        },
        &serde_json::json!({
            "conversationId": delivery.conversation_id,
            "deliveryId": delivery.id,
            "outcomeJobId": outcome_job.id,
            "outcomeJobState": outcome_job.state,
            "error": stored_error
        }),
        now,
    )?;
    if state == "failed" {
        reconcile_team_discussion_round_tx(tx, &delivery.discussion_round_id, now)?;
    }
    Ok(())
}

pub(crate) fn sync_team_delivery_outcome_cancelled_tx(
    tx: &rusqlite::Transaction<'_>,
    outcome_job_id: &str,
    reason: &str,
    now: i64,
) -> Result<()> {
    let delivery = get_delivery_by_outcome_job_tx(tx, outcome_job_id)?.ok_or_else(|| {
        SystemServiceError::Invariant(format!(
            "team outcome job has no delivery: {outcome_job_id}"
        ))
    })?;
    if delivery.state != "dispatched" {
        return Ok(());
    }
    let error = serde_json::json!({
        "type": "outcome_projection_cancelled",
        "reason": reason
    });
    let updated = tx.execute(
        "UPDATE team_delivery
         SET state = 'cancelled', last_error_json = ?, updated_at = ?, finished_at = ?
         WHERE id = ? AND state = 'dispatched'",
        params![serde_json::to_string(&error)?, now, now, delivery.id],
    )?;
    if updated != 1 {
        return Err(SystemServiceError::Invariant(
            "team delivery lost its outcome cancellation claim".to_string(),
        ));
    }
    append_team_event_tx(
        tx,
        "team.delivery.outcome_projection_cancelled",
        &serde_json::json!({
            "conversationId": delivery.conversation_id,
            "deliveryId": delivery.id,
            "outcomeJobId": outcome_job_id,
            "reason": reason
        }),
        now,
    )?;
    reconcile_team_discussion_round_tx(tx, &delivery.discussion_round_id, now)?;
    Ok(())
}

fn load_outcome_context_tx(
    tx: &rusqlite::Transaction<'_>,
    delivery_id: &str,
) -> Result<TeamDeliveryOutcomeContext> {
    let delivery = get_delivery_tx(tx, delivery_id)?.ok_or_else(|| {
        SystemServiceError::Invariant(format!("team delivery does not exist: {delivery_id}"))
    })?;
    let participant =
        get_participant_tx(tx, &delivery.target_participant_id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!(
                "team delivery participant is missing: {}",
                delivery.target_participant_id
            ))
        })?;
    let source_message = get_message_tx(tx, &delivery.message_id)?.ok_or_else(|| {
        SystemServiceError::Invariant(format!(
            "team delivery source message is missing: {}",
            delivery.message_id
        ))
    })?;
    let child_turn_id = delivery.child_turn_id.as_deref().ok_or_else(|| {
        SystemServiceError::Invariant(
            "team delivery has no child turn for outcome projection".to_string(),
        )
    })?;
    let child_job_id = delivery.child_turn_job_id.as_deref().ok_or_else(|| {
        SystemServiceError::Invariant(
            "team delivery has no child turn job for outcome projection".to_string(),
        )
    })?;
    let outcome_job_id = delivery.outcome_job_id.as_deref().ok_or_else(|| {
        SystemServiceError::Invariant("team delivery has no outcome job for projection".to_string())
    })?;
    Ok(TeamDeliveryOutcomeContext {
        participant,
        source_message,
        child_turn: crate::sessions::get_turn_tx(tx, child_turn_id)?,
        child_job: crate::scheduler::get_job_tx(tx, child_job_id)?,
        outcome_job: crate::scheduler::get_job_tx(tx, outcome_job_id)?,
        delivery,
    })
}

fn validate_projection_request(request: &ProjectTeamDeliveryOutcome) -> Result<()> {
    if request.delivery_id.is_empty()
        || request.outcome_job_id.is_empty()
        || request.worker_id.is_empty()
        || request.lease_token.is_empty()
    {
        return Err(SystemServiceError::Invariant(
            "team outcome projection identity fields must not be empty".to_string(),
        ));
    }
    Ok(())
}

fn validate_outcome_identity(
    context: &TeamDeliveryOutcomeContext,
    outcome_job_id: &str,
) -> Result<()> {
    if context.delivery.outcome_job_id.as_deref() != Some(outcome_job_id)
        || context.outcome_job.id != outcome_job_id
    {
        return Err(SystemServiceError::Invariant(
            "team delivery outcome job identity does not match delivery".to_string(),
        ));
    }
    validate_outcome_job_binding(
        &context.delivery,
        &context.child_turn,
        &context.child_job,
        &context.outcome_job,
    )
}

fn validate_outcome_job_binding(
    delivery: &TeamDeliveryRecord,
    child_turn: &SessionTurnRecord,
    child_job: &SchedulerJobRecord,
    outcome_job: &SchedulerJobRecord,
) -> Result<()> {
    let expected_idempotency_key = format!("team-delivery:{}:outcome", delivery.id);
    if outcome_job.kind != "team.delivery.outcome"
        || outcome_job.idempotency_key.as_deref() != Some(expected_idempotency_key.as_str())
        || outcome_job.payload["teamDeliveryId"] != delivery.id
        || outcome_job.payload["teamConversationId"] != delivery.conversation_id
        || outcome_job.payload["sourceTeamMessageId"] != delivery.message_id
        || outcome_job.payload["targetParticipantId"] != delivery.target_participant_id
        || outcome_job.payload["childSessionId"] != delivery.target_session_id
        || outcome_job.payload["childTurnId"] != child_turn.id
        || outcome_job.payload["childTurnJobId"] != child_job.id
        || delivery.child_turn_id.as_deref() != Some(child_turn.id.as_str())
        || delivery.child_turn_job_id.as_deref() != Some(child_job.id.as_str())
        || child_turn.job_id != child_job.id
        || child_turn.session_id != delivery.target_session_id
    {
        return Err(SystemServiceError::Invariant(
            "team delivery outcome job does not match durable child records".to_string(),
        ));
    }
    Ok(())
}

fn validate_outcome_lease(
    context: &TeamDeliveryOutcomeContext,
    worker_id: &str,
    lease_token: &str,
) -> Result<()> {
    if context.outcome_job.state != "running"
        || context.outcome_job.lease_owner.as_deref() != Some(worker_id)
        || context.outcome_job.lease_token.as_deref() != Some(lease_token)
    {
        return Err(SystemServiceError::Invariant(
            "team delivery outcome job is not owned by the requested lease".to_string(),
        ));
    }
    Ok(())
}

pub(super) fn validate_child_terminal_state(
    child_turn: &SessionTurnRecord,
    child_job: &SchedulerJobRecord,
) -> Result<()> {
    let matches = match child_turn.state.as_str() {
        "succeeded" => child_job.state == "succeeded",
        "failed" => child_job.state == "failed",
        "cancelled" | "interrupted" => child_job.state == "cancelled",
        _ => false,
    };
    if !matches || child_turn.finished_at.is_none() || child_job.finished_at.is_none() {
        return Err(SystemServiceError::Invariant(
            "team delivery child turn and job are not in matching terminal states".to_string(),
        ));
    }
    Ok(())
}
