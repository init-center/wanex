use super::*;

const MAX_TEAM_DELIVERY_ERROR_BYTES: usize = 16 * 1024;

impl SystemService {
    pub fn get_team_delivery_materialization_context(
        &self,
        delivery_id: &str,
    ) -> Result<Option<TeamDeliveryMaterializationContext>> {
        if delivery_id.is_empty() {
            return Err(SystemServiceError::Invariant(
                "team delivery id must not be empty".to_string(),
            ));
        }
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let context = load_materialization_context_tx(&tx, delivery_id)?;
        tx.commit()?;
        Ok(context)
    }

    pub fn materialize_team_delivery(
        &self,
        request: &MaterializeTeamDelivery,
    ) -> Result<MaterializeTeamDeliveryReceipt> {
        validate_materialize_request(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let context =
            load_materialization_context_tx(&tx, &request.delivery_id)?.ok_or_else(|| {
                SystemServiceError::Invariant(format!(
                    "team delivery does not exist: {}",
                    request.delivery_id
                ))
            })?;
        validate_dispatch_identity(&context, &request.dispatch_job_id)?;

        if context.delivery.state == "dispatched" {
            let submission = replay_submission_tx(&tx, &context, request)?;
            tx.commit()?;
            return Ok(MaterializeTeamDeliveryReceipt {
                delivery: context.delivery,
                dispatch_job: context.dispatch_job,
                submission,
                created: false,
            });
        }
        if context.delivery.state != "queued" {
            return Err(SystemServiceError::Invariant(format!(
                "team delivery cannot be materialized from state: {}",
                context.delivery.state
            )));
        }
        validate_claimed_dispatch_job(&context, &request.worker_id, &request.lease_token)?;
        if context.participant.state != "active"
            || context.participant.kind != "agent"
            || context.participant.agent_session_id.as_deref()
                != Some(&context.delivery.target_session_id)
        {
            return Err(SystemServiceError::Invariant(
                "team delivery participant/session binding is no longer active".to_string(),
            ));
        }

        let plan = &context.child_plan;
        let submission = crate::sessions::submit_session_turn_tx(
            &tx,
            &SubmitSessionTurn {
                id: Some(plan.input_id.clone()),
                turn_id: Some(plan.turn_id.clone()),
                session_id: plan.session_id.clone(),
                principal_id: plan.principal_id.clone(),
                idempotency_key: plan.input_idempotency_key.clone(),
                input_type: Some(plan.input_type.clone()),
                content: plan.content.clone(),
                origin: Some(plan.origin.clone()),
                intent: Some(plan.intent.clone()),
                run_control_policy: None,
                expected_turn_id: None,
                job_id: Some(plan.job_id.clone()),
                job_idempotency_key: Some(plan.job_idempotency_key.clone()),
                execution_binding: request.execution_binding.clone(),
                max_steps: request.max_steps,
                regenerates_turn_id: None,
                scheduled_at: None,
                not_before: None,
                priority: request.child_priority,
                budget_grant_id: context.delivery.budget_grant_id.clone(),
            },
            now,
        )?;
        if submission.admission.input_id != plan.input_id
            || submission.turn.id != plan.turn_id
            || submission.job.id != plan.job_id
        {
            return Err(SystemServiceError::Invariant(
                "team delivery child turn idempotency resolved to different identities".to_string(),
            ));
        }

        let updated = tx.execute(
            "UPDATE team_delivery
             SET state = 'dispatched', child_input_id = ?, child_turn_id = ?,
                 child_turn_job_id = ?, last_error_json = NULL,
                 updated_at = ?, materialized_at = ?, finished_at = NULL
             WHERE id = ? AND dispatch_job_id = ? AND state = 'queued'",
            params![
                plan.input_id,
                plan.turn_id,
                plan.job_id,
                now,
                now,
                context.delivery.id,
                context.dispatch_job.id
            ],
        )?;
        if updated != 1 {
            return Err(SystemServiceError::Invariant(
                "team delivery lost its materialization claim".to_string(),
            ));
        }

        let dispatch_job = crate::scheduler::complete_team_delivery_job_tx(
            &tx,
            &CompleteJob {
                job_id: context.dispatch_job.id.clone(),
                worker_id: request.worker_id.clone(),
                lease_token: request.lease_token.clone(),
                result: Some(serde_json::json!({
                    "teamDeliveryId": context.delivery.id,
                    "childSessionId": context.delivery.target_session_id,
                    "childInputId": submission.admission.input_id,
                    "childTurnId": submission.turn.id,
                    "childTurnJobId": submission.job.id
                })),
            },
            now,
        )?
        .ok_or_else(|| {
            SystemServiceError::Invariant(
                "team delivery dispatch job lost its completion lease".to_string(),
            )
        })?;
        append_team_event_tx(
            &tx,
            "team.delivery.materialized",
            &serde_json::json!({
                "conversationId": context.delivery.conversation_id,
                "messageId": context.delivery.message_id,
                "deliveryId": context.delivery.id,
                "dispatchJobId": dispatch_job.id,
                "childSessionId": context.delivery.target_session_id,
                "childInputId": submission.admission.input_id,
                "childTurnId": submission.turn.id,
                "childTurnJobId": submission.job.id
            }),
            now,
        )?;
        let delivery = get_delivery_tx(&tx, &context.delivery.id)?.ok_or_else(|| {
            SystemServiceError::Invariant(
                "materialized team delivery could not be reloaded".to_string(),
            )
        })?;
        tx.commit()?;
        Ok(MaterializeTeamDeliveryReceipt {
            delivery,
            dispatch_job,
            submission,
            created: true,
        })
    }

    pub fn fail_team_delivery_materialization(
        &self,
        request: &FailTeamDeliveryMaterialization,
    ) -> Result<FailTeamDeliveryMaterializationReceipt> {
        validate_fail_request(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let context =
            load_materialization_context_tx(&tx, &request.delivery_id)?.ok_or_else(|| {
                SystemServiceError::Invariant(format!(
                    "team delivery does not exist: {}",
                    request.delivery_id
                ))
            })?;
        validate_dispatch_identity(&context, &request.dispatch_job_id)?;
        if context.delivery.state == "failed" && context.dispatch_job.state == "failed" {
            if context.delivery.last_error.as_ref() != Some(&request.error) {
                return Err(SystemServiceError::Invariant(
                    "team delivery failure replay changed its error".to_string(),
                ));
            }
            tx.commit()?;
            return Ok(FailTeamDeliveryMaterializationReceipt {
                delivery: context.delivery,
                dispatch_job: context.dispatch_job,
            });
        }
        if context.delivery.state != "queued" {
            return Err(SystemServiceError::Invariant(format!(
                "team delivery cannot fail materialization from state: {}",
                context.delivery.state
            )));
        }
        let dispatch_job = crate::scheduler::fail_job_tx(
            &tx,
            &FailJob {
                job_id: context.dispatch_job.id,
                worker_id: request.worker_id.clone(),
                lease_token: request.lease_token.clone(),
                error: request.error.clone(),
            },
            now,
        )?
        .ok_or_else(|| {
            SystemServiceError::Invariant(
                "team delivery dispatch job lost its failure lease".to_string(),
            )
        })?;
        let delivery = get_delivery_tx(&tx, &request.delivery_id)?.ok_or_else(|| {
            SystemServiceError::Invariant("failed team delivery could not be reloaded".to_string())
        })?;
        tx.commit()?;
        Ok(FailTeamDeliveryMaterializationReceipt {
            delivery,
            dispatch_job,
        })
    }
}

pub(crate) fn sync_team_delivery_failure_tx(
    tx: &rusqlite::Transaction<'_>,
    dispatch_job: &SchedulerJobRecord,
    error: &serde_json::Value,
    now: i64,
) -> Result<()> {
    let delivery = get_delivery_by_dispatch_job_tx(tx, &dispatch_job.id)?.ok_or_else(|| {
        SystemServiceError::Invariant(format!(
            "team delivery dispatch job has no delivery: {}",
            dispatch_job.id
        ))
    })?;
    if delivery.state != "queued" {
        return Err(SystemServiceError::Invariant(format!(
            "team delivery failure cannot settle state: {}",
            delivery.state
        )));
    }
    let stored_error = bounded_delivery_error(error);
    let (state, finished_at) = match dispatch_job.state.as_str() {
        "retry_scheduled" => ("queued", None),
        "failed" => ("failed", Some(now)),
        state => {
            return Err(SystemServiceError::Invariant(format!(
                "invalid team delivery failure job state: {state}"
            )));
        }
    };
    let updated = tx.execute(
        "UPDATE team_delivery
         SET state = ?, last_error_json = ?, updated_at = ?, finished_at = ?
         WHERE id = ? AND state = 'queued'",
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
            "team delivery lost its failure settlement claim".to_string(),
        ));
    }
    append_team_event_tx(
        tx,
        if state == "failed" {
            "team.delivery.materialization_failed"
        } else {
            "team.delivery.materialization_retry_scheduled"
        },
        &serde_json::json!({
            "conversationId": delivery.conversation_id,
            "messageId": delivery.message_id,
            "deliveryId": delivery.id,
            "dispatchJobId": dispatch_job.id,
            "dispatchJobState": dispatch_job.state,
            "error": stored_error
        }),
        now,
    )?;
    if state == "failed" {
        reconcile_team_discussion_round_tx(tx, &delivery.discussion_round_id, now)?;
    }
    Ok(())
}

pub(crate) fn sync_team_delivery_cancelled_tx(
    tx: &rusqlite::Transaction<'_>,
    dispatch_job_id: &str,
    reason: &str,
    now: i64,
) -> Result<()> {
    let Some(delivery) = get_delivery_by_dispatch_job_tx(tx, dispatch_job_id)? else {
        return Err(SystemServiceError::Invariant(format!(
            "team delivery dispatch job has no delivery: {dispatch_job_id}"
        )));
    };
    if delivery.state != "queued" {
        return Ok(());
    }
    let error = serde_json::json!({ "type": "cancelled", "reason": reason });
    let updated = tx.execute(
        "UPDATE team_delivery
         SET state = 'cancelled', last_error_json = ?, updated_at = ?, finished_at = ?
         WHERE id = ? AND state = 'queued'",
        params![serde_json::to_string(&error)?, now, now, delivery.id],
    )?;
    if updated != 1 {
        return Err(SystemServiceError::Invariant(
            "team delivery lost its cancellation settlement claim".to_string(),
        ));
    }
    append_team_event_tx(
        tx,
        "team.delivery.cancelled",
        &serde_json::json!({
            "conversationId": delivery.conversation_id,
            "messageId": delivery.message_id,
            "deliveryId": delivery.id,
            "dispatchJobId": dispatch_job_id,
            "reason": reason
        }),
        now,
    )?;
    reconcile_team_discussion_round_tx(tx, &delivery.discussion_round_id, now)?;
    Ok(())
}

fn validate_materialize_request(request: &MaterializeTeamDelivery) -> Result<()> {
    if request.delivery_id.is_empty()
        || request.dispatch_job_id.is_empty()
        || request.worker_id.is_empty()
        || request.lease_token.is_empty()
    {
        return Err(SystemServiceError::Invariant(
            "team materialization identity fields must not be empty".to_string(),
        ));
    }
    if request
        .max_steps
        .is_some_and(|value| !(1..=10_000).contains(&value))
    {
        return Err(SystemServiceError::Invariant(
            "team materialization max_steps must be between 1 and 10000".to_string(),
        ));
    }
    Ok(())
}

fn validate_fail_request(request: &FailTeamDeliveryMaterialization) -> Result<()> {
    if request.delivery_id.is_empty()
        || request.dispatch_job_id.is_empty()
        || request.worker_id.is_empty()
        || request.lease_token.is_empty()
    {
        return Err(SystemServiceError::Invariant(
            "team materialization failure identity fields must not be empty".to_string(),
        ));
    }
    if serde_json::to_vec(&request.error)?.len() > MAX_TEAM_DELIVERY_ERROR_BYTES {
        return Err(SystemServiceError::Invariant(format!(
            "team materialization error exceeds {MAX_TEAM_DELIVERY_ERROR_BYTES} bytes"
        )));
    }
    Ok(())
}

fn load_materialization_context_tx(
    tx: &rusqlite::Transaction<'_>,
    delivery_id: &str,
) -> Result<Option<TeamDeliveryMaterializationContext>> {
    let Some(delivery) = get_delivery_tx(tx, delivery_id)? else {
        return Ok(None);
    };
    let conversation = get_conversation_tx(tx, &delivery.conversation_id)?.ok_or_else(|| {
        SystemServiceError::Invariant(format!(
            "team delivery conversation is missing: {}",
            delivery.conversation_id
        ))
    })?;
    let participant =
        get_participant_tx(tx, &delivery.target_participant_id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!(
                "team delivery participant is missing: {}",
                delivery.target_participant_id
            ))
        })?;
    let message = get_message_tx(tx, &delivery.message_id)?.ok_or_else(|| {
        SystemServiceError::Invariant(format!(
            "team delivery message is missing: {}",
            delivery.message_id
        ))
    })?;
    let dispatch_job = crate::scheduler::get_job_tx(tx, &delivery.dispatch_job_id)?;
    let child_plan = build_child_plan(&participant, &message, &delivery);
    Ok(Some(TeamDeliveryMaterializationContext {
        conversation,
        participant,
        message,
        delivery,
        dispatch_job,
        child_plan,
    }))
}

fn build_child_plan(
    participant: &TeamParticipantRecord,
    message: &TeamMessageRecord,
    delivery: &TeamDeliveryRecord,
) -> TeamDeliveryChildTurnPlan {
    TeamDeliveryChildTurnPlan {
        session_id: delivery.target_session_id.clone(),
        input_id: format!("inp_team_{}", delivery.id),
        turn_id: format!("turn_team_{}", delivery.id),
        job_id: format!("job_team_turn_{}", delivery.id),
        principal_id: participant.principal_id.clone(),
        input_type: if message.kind == "system" {
            "system".to_string()
        } else {
            "user".to_string()
        },
        content: message.content.clone(),
        origin: serde_json::json!({
            "kind": "agent",
            "sourceRef": message.id,
            "parentRef": delivery.id,
            "metadata": {
                "teamConversationId": delivery.conversation_id,
                "teamMessageId": delivery.message_id,
                "teamRoutingDecisionId": delivery.routing_decision_id,
                "teamDiscussionRoundId": delivery.discussion_round_id,
                "teamDeliveryId": delivery.id,
                "targetParticipantId": delivery.target_participant_id
            }
        }),
        intent: "normal".to_string(),
        input_idempotency_key: format!("team-delivery:{}:child-input", delivery.id),
        job_idempotency_key: format!("team-delivery:{}:child-turn-job", delivery.id),
    }
}

fn validate_dispatch_identity(
    context: &TeamDeliveryMaterializationContext,
    dispatch_job_id: &str,
) -> Result<()> {
    if context.delivery.dispatch_job_id != dispatch_job_id
        || context.dispatch_job.id != dispatch_job_id
        || context.dispatch_job.kind != "team.delivery"
        || context.dispatch_job.payload["teamDeliveryId"] != context.delivery.id
        || context.dispatch_job.payload["teamConversationId"] != context.delivery.conversation_id
        || context.dispatch_job.payload["teamMessageId"] != context.delivery.message_id
        || context.dispatch_job.payload["targetParticipantId"]
            != context.delivery.target_participant_id
        || context.dispatch_job.payload["targetSessionId"] != context.delivery.target_session_id
    {
        return Err(SystemServiceError::Invariant(
            "team delivery dispatch identity does not match durable records".to_string(),
        ));
    }
    Ok(())
}

fn validate_claimed_dispatch_job(
    context: &TeamDeliveryMaterializationContext,
    worker_id: &str,
    lease_token: &str,
) -> Result<()> {
    if context.dispatch_job.state != "running"
        || context.dispatch_job.lease_owner.as_deref() != Some(worker_id)
        || context.dispatch_job.lease_token.as_deref() != Some(lease_token)
    {
        return Err(SystemServiceError::Invariant(
            "team delivery dispatch job is not owned by the requested lease".to_string(),
        ));
    }
    Ok(())
}

fn replay_submission_tx(
    tx: &rusqlite::Transaction<'_>,
    context: &TeamDeliveryMaterializationContext,
    request: &MaterializeTeamDelivery,
) -> Result<crate::SubmitSessionTurnReceipt> {
    let delivery = &context.delivery;
    let plan = &context.child_plan;
    let input_id = delivery.child_input_id.as_ref().ok_or_else(|| {
        SystemServiceError::Invariant("dispatched team delivery is missing child input".to_string())
    })?;
    let turn_id = delivery.child_turn_id.as_ref().ok_or_else(|| {
        SystemServiceError::Invariant("dispatched team delivery is missing child turn".to_string())
    })?;
    let child_job_id = delivery.child_turn_job_id.as_ref().ok_or_else(|| {
        SystemServiceError::Invariant(
            "dispatched team delivery is missing child turn job".to_string(),
        )
    })?;
    let turn = crate::sessions::get_turn_tx(tx, turn_id)?;
    let input = crate::sessions::get_input_tx(tx, input_id)?;
    let job = crate::scheduler::get_job_tx(tx, child_job_id)?;
    if input.id != plan.input_id
        || input.session_id != plan.session_id
        || input.principal_id != plan.principal_id
        || input.idempotency_key != plan.input_idempotency_key
        || input.input_type != plan.input_type
        || input.content != plan.content
        || input.origin.as_ref() != Some(&plan.origin)
        || input.intent != plan.intent
        || turn.session_id != delivery.target_session_id
        || turn.primary_input_id != *input_id
        || turn.job_id != *child_job_id
        || turn.execution_binding != request.execution_binding
        || turn.max_steps != request.max_steps.unwrap_or(32)
        || job.priority != request.child_priority.unwrap_or(0)
    {
        return Err(SystemServiceError::Invariant(
            "team delivery materialization replay changed its child plan".to_string(),
        ));
    }
    Ok(crate::SubmitSessionTurnReceipt {
        admission: AdmissionReceipt {
            input_id: input_id.clone(),
            session_id: delivery.target_session_id.clone(),
            durability: "local-durable".to_string(),
            status: "admitted".to_string(),
        },
        turn,
        job,
    })
}

pub(super) fn bounded_delivery_error(error: &serde_json::Value) -> serde_json::Value {
    if serde_json::to_vec(error).is_ok_and(|encoded| encoded.len() <= MAX_TEAM_DELIVERY_ERROR_BYTES)
    {
        return error.clone();
    }
    serde_json::json!({
        "type": "oversized_error",
        "message": "team delivery materialization error exceeded the durable limit"
    })
}
