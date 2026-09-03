use super::*;

impl SystemService {
    pub fn route_team_message(
        &self,
        request: &RouteTeamMessage,
    ) -> Result<RouteTeamMessageReceipt> {
        validate_route_message(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;

        if let Some(decision) =
            get_routing_decision_by_idempotency_key_tx(&tx, &request.idempotency_key)?
        {
            let deliveries = list_deliveries_by_decision_tx(&tx, &decision.id)?;
            let dispatch_jobs = dispatch_jobs_for_deliveries_tx(&tx, &deliveries)?;
            let message = get_message_tx(&tx, &decision.message_id)?.ok_or_else(|| {
                SystemServiceError::Invariant(format!(
                    "team routed message missing: {}",
                    decision.message_id
                ))
            })?;
            let round = get_discussion_round_by_decision_tx(&tx, &decision.id)?;
            validate_existing_route(
                &message,
                &decision,
                round.as_ref(),
                &deliveries,
                &dispatch_jobs,
                request,
            )?;
            tx.commit()?;
            return Ok(RouteTeamMessageReceipt {
                message,
                decision,
                round,
                deliveries,
                dispatch_jobs,
                created: false,
            });
        }

        let message = get_message_tx(&tx, &request.message_id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!(
                "team message does not exist: {}",
                request.message_id
            ))
        })?;
        if message.state != "admitted" || message.revision != request.expected_revision {
            return Err(SystemServiceError::Invariant(format!(
                "team message routing conflict: state={}, revision={}, expected_revision={}",
                message.state, message.revision, request.expected_revision
            )));
        }
        let conversation =
            get_conversation_tx(&tx, &message.conversation_id)?.ok_or_else(|| {
                SystemServiceError::Invariant(format!(
                    "team conversation does not exist: {}",
                    message.conversation_id
                ))
            })?;
        if conversation.state != "open" {
            return Err(SystemServiceError::Invariant(
                "team conversation is not open".to_string(),
            ));
        }
        if request.mode != conversation.mode {
            return Err(SystemServiceError::Invariant(format!(
                "team route mode does not match conversation: {}/{}",
                request.mode, conversation.mode
            )));
        }
        if request.mode == "orchestrated" {
            validate_orchestrated_route_tx(&tx, &conversation, &message, request)?;
        } else if request.expected_lead_participant_id.is_some() {
            return Err(SystemServiceError::Invariant(
                "non-orchestrated team route must not carry a lead fence".to_string(),
            ));
        }
        if request.mode == "peer" && request.outcome == "deliver" {
            let open_round_id = tx
                .query_row(
                    "SELECT id FROM team_discussion_round
                     WHERE conversation_id = ? AND state = 'open'
                     ORDER BY created_at ASC, id ASC
                     LIMIT 1",
                    params![message.conversation_id],
                    |row| row.get::<_, String>(0),
                )
                .optional()?;
            if let Some(open_round_id) = open_round_id {
                return Err(SystemServiceError::Invariant(format!(
                    "peer team conversation already has an open round: {open_round_id}"
                )));
            }
        }

        let decision_id = request
            .id
            .clone()
            .unwrap_or_else(|| format!("troute_{}", Uuid::now_v7()));
        if let Some(existing) = get_routing_decision_tx(&tx, &decision_id)? {
            let deliveries = list_deliveries_by_decision_tx(&tx, &existing.id)?;
            let dispatch_jobs = dispatch_jobs_for_deliveries_tx(&tx, &deliveries)?;
            let round = get_discussion_round_by_decision_tx(&tx, &existing.id)?;
            validate_existing_route(
                &message,
                &existing,
                round.as_ref(),
                &deliveries,
                &dispatch_jobs,
                request,
            )?;
            tx.commit()?;
            return Ok(RouteTeamMessageReceipt {
                message,
                decision: existing,
                round,
                deliveries,
                dispatch_jobs,
                created: false,
            });
        }

        validate_route_delivery_targets(&tx, &message.conversation_id, &request.deliveries)?;
        let metadata_json = request
            .metadata
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        tx.execute(
            "INSERT INTO team_routing_decision (
                id, conversation_id, message_id, mode, outcome, lead_participant_id,
                actor_principal_id, reason, metadata_json,
                idempotency_key, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                decision_id,
                message.conversation_id,
                message.id,
                request.mode,
                request.outcome,
                request.expected_lead_participant_id,
                request.actor_principal_id,
                request.reason,
                metadata_json,
                request.idempotency_key,
                now
            ],
        )?;

        let round_id = (request.outcome == "deliver").then(|| format!("tround_{decision_id}"));
        if let Some(round_id) = &round_id {
            tx.execute(
                "INSERT INTO team_discussion_round (
                    id, conversation_id, source_message_id, routing_decision_id,
                    mode, state, expected_delivery_count, outcome, result_json,
                    idempotency_key, created_at, updated_at, closed_at
                 ) VALUES (?, ?, ?, ?, ?, 'open', ?, NULL, NULL, ?, ?, ?, NULL)",
                params![
                    round_id,
                    message.conversation_id,
                    message.id,
                    decision_id,
                    request.mode,
                    request.deliveries.len() as i64,
                    format!("team-round:{decision_id}"),
                    now,
                    now
                ],
            )?;
        }

        for delivery in &request.deliveries {
            let delivery_id = delivery
                .id
                .clone()
                .unwrap_or_else(|| format!("tdel_{}", Uuid::now_v7()));
            let delivery_idempotency_key = format!(
                "team-delivery:{decision_id}:{}",
                delivery.target_participant_id
            );
            let discussion_round_id = round_id.as_deref().ok_or_else(|| {
                SystemServiceError::Invariant(
                    "team deliver route is missing its discussion round".to_string(),
                )
            })?;
            let participant = get_participant_tx(&tx, &delivery.target_participant_id)?
                .ok_or_else(|| {
                    SystemServiceError::Invariant(format!(
                        "team delivery target participant does not exist: {}",
                        delivery.target_participant_id
                    ))
                })?;
            let target_session_id = participant.agent_session_id.ok_or_else(|| {
                SystemServiceError::Invariant(
                    "team delivery target is missing its agent session binding".to_string(),
                )
            })?;
            let dispatch_job = crate::scheduler::enqueue_job_tx(
                &tx,
                &EnqueueJob {
                    id: None,
                    kind: SchedulerJobKind::TeamDelivery,
                    queue: None,
                    principal_id: participant.principal_id,
                    payload: serde_json::json!({
                        "teamDeliveryId": delivery_id,
                        "teamConversationId": message.conversation_id,
                        "teamMessageId": message.id,
                        "teamDiscussionRoundId": discussion_round_id,
                        "targetParticipantId": delivery.target_participant_id,
                        "targetSessionId": target_session_id
                    }),
                    scheduled_at: None,
                    not_before: None,
                    priority: None,
                    concurrency_key: Some(format!(
                        "team-participant:{}",
                        delivery.target_participant_id
                    )),
                    max_attempts: Some(3),
                    retry_policy: Some(RetryPolicy {
                        strategy: RetryStrategy::Exponential,
                        initial_delay_ms: Some(1_000),
                        max_delay_ms: Some(30_000),
                    }),
                    idempotency_key: Some(format!("{delivery_idempotency_key}:dispatch")),
                    budget_grant_id: None,
                },
                now,
            )?;
            tx.execute(
                "INSERT INTO team_delivery (
                    id, conversation_id, message_id, routing_decision_id,
                    discussion_round_id,
                    target_participant_id, role, trigger, state,
                    target_session_id, dispatch_job_id,
                    child_input_id, child_turn_id, child_turn_job_id,
                    outcome_job_id, reply_message_id,
                    participation_tool_execution_id,
                    budget_grant_id, last_error_json, idempotency_key,
                    created_at, updated_at, materialized_at, finished_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?,
                           NULL, NULL, NULL, NULL, NULL, NULL,
                           ?, NULL, ?, ?, ?, NULL, NULL)",
                params![
                    delivery_id,
                    message.conversation_id,
                    message.id,
                    decision_id,
                    discussion_round_id,
                    delivery.target_participant_id,
                    delivery.role,
                    delivery.trigger,
                    target_session_id,
                    dispatch_job.id,
                    delivery.budget_grant_id,
                    delivery_idempotency_key,
                    now,
                    now
                ],
            )?;
        }

        let message_state = if request.outcome == "deliver" {
            "routed"
        } else {
            "blocked"
        };
        let updated = tx.execute(
            "UPDATE team_message
             SET state = ?, discussion_round_id = ?, revision = revision + 1, updated_at = ?
             WHERE id = ? AND state = 'admitted' AND revision = ?",
            params![
                message_state,
                round_id,
                now,
                request.message_id,
                request.expected_revision
            ],
        )?;
        if updated != 1 {
            return Err(SystemServiceError::Invariant(format!(
                "team message routing lost its revision claim: {}",
                request.message_id
            )));
        }
        append_team_event_tx(
            &tx,
            "team.message.routed",
            &serde_json::json!({
                "conversationId": message.conversation_id,
                "messageId": message.id,
                "routingDecisionId": decision_id,
                "discussionRoundId": round_id,
                "mode": request.mode,
                "outcome": request.outcome,
                "leadParticipantId": request.expected_lead_participant_id,
                "deliveryCount": request.deliveries.len(),
                "actorPrincipalId": request.actor_principal_id
            }),
            now,
        )?;

        let routed_message = get_message_tx(&tx, &request.message_id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!(
                "team routed message missing: {}",
                request.message_id
            ))
        })?;
        let decision = get_routing_decision_tx(&tx, &decision_id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!(
                "team routing decision insert missing: {decision_id}"
            ))
        })?;
        let round = get_discussion_round_by_decision_tx(&tx, &decision_id)?;
        let deliveries = list_deliveries_by_decision_tx(&tx, &decision_id)?;
        let dispatch_jobs = dispatch_jobs_for_deliveries_tx(&tx, &deliveries)?;
        tx.commit()?;
        Ok(RouteTeamMessageReceipt {
            message: routed_message,
            decision,
            round,
            deliveries,
            dispatch_jobs,
            created: true,
        })
    }

    pub fn get_team_routing_decision_by_message(
        &self,
        message_id: &str,
    ) -> Result<Option<TeamRoutingDecisionRecord>> {
        if message_id.is_empty() {
            return Err(SystemServiceError::Invariant(
                "team routing decision message_id must not be empty".to_string(),
            ));
        }
        let conn = self.connect()?;
        conn.query_row(
            &format!("{ROUTING_DECISION_SELECT} WHERE message_id = ?"),
            params![message_id],
            row_to_team_routing_decision,
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn list_team_routing_decisions(
        &self,
        request: &ListTeamRoutingDecisions,
    ) -> Result<Vec<TeamRoutingDecisionRecord>> {
        if request.conversation_id.is_none() && request.message_id.is_none() {
            return Err(SystemServiceError::Invariant(
                "team routing decision query requires conversation_id or message_id".to_string(),
            ));
        }
        let mut sql = format!("{ROUTING_DECISION_SELECT} WHERE 1 = 1");
        let mut values: Vec<Box<dyn ToSql>> = Vec::new();
        if let Some(conversation_id) = &request.conversation_id {
            sql.push_str(" AND conversation_id = ?");
            values.push(Box::new(conversation_id.clone()));
        }
        if let Some(message_id) = &request.message_id {
            sql.push_str(" AND message_id = ?");
            values.push(Box::new(message_id.clone()));
        }
        sql.push_str(" ORDER BY created_at ASC, id ASC LIMIT ?");
        values.push(Box::new(request.limit.unwrap_or(100).clamp(1, 200)));
        let conn = self.connect()?;
        let mut stmt = conn.prepare(&sql)?;
        let records = collect_routing_decisions(stmt.query_map(
            params_from_iter(values.iter().map(|value| value.as_ref())),
            row_to_team_routing_decision,
        )?)?;
        Ok(records)
    }

    pub fn list_team_deliveries(
        &self,
        request: &ListTeamDeliveries,
    ) -> Result<Vec<TeamDeliveryRecord>> {
        validate_optional_delivery_state(request.state.as_deref())?;
        if request.conversation_id.is_none()
            && request.message_id.is_none()
            && request.routing_decision_id.is_none()
        {
            return Err(SystemServiceError::Invariant(
                "team delivery query requires a durable owner filter".to_string(),
            ));
        }
        let mut sql = format!("{DELIVERY_SELECT} WHERE 1 = 1");
        let mut values: Vec<Box<dyn ToSql>> = Vec::new();
        if let Some(conversation_id) = &request.conversation_id {
            sql.push_str(" AND conversation_id = ?");
            values.push(Box::new(conversation_id.clone()));
        }
        if let Some(message_id) = &request.message_id {
            sql.push_str(" AND message_id = ?");
            values.push(Box::new(message_id.clone()));
        }
        if let Some(decision_id) = &request.routing_decision_id {
            sql.push_str(" AND routing_decision_id = ?");
            values.push(Box::new(decision_id.clone()));
        }
        if let Some(state) = &request.state {
            sql.push_str(" AND state = ?");
            values.push(Box::new(state.clone()));
        }
        sql.push_str(" ORDER BY created_at ASC, id ASC LIMIT ?");
        values.push(Box::new(request.limit.unwrap_or(100).clamp(1, 200)));
        let conn = self.connect()?;
        let mut stmt = conn.prepare(&sql)?;
        let records = collect_deliveries(stmt.query_map(
            params_from_iter(values.iter().map(|value| value.as_ref())),
            row_to_team_delivery,
        )?)?;
        Ok(records)
    }
}

fn validate_orchestrated_route_tx(
    tx: &rusqlite::Transaction<'_>,
    conversation: &TeamConversationRecord,
    message: &TeamMessageRecord,
    request: &RouteTeamMessage,
) -> Result<()> {
    if request.outcome != "deliver" {
        return Err(SystemServiceError::Invariant(
            "orchestrated team routing must create one delivery".to_string(),
        ));
    }
    let expected_lead = request
        .expected_lead_participant_id
        .as_deref()
        .ok_or_else(|| {
            SystemServiceError::Invariant(
                "orchestrated team route requires an expected lead".to_string(),
            )
        })?;
    let current_lead = conversation.lead_participant_id.as_deref().ok_or_else(|| {
        SystemServiceError::Invariant(
            "orchestrated team conversation requires an active lead".to_string(),
        )
    })?;
    if current_lead != expected_lead {
        return Err(SystemServiceError::Conflict(format!(
            "team conversation lead changed before routing: {}",
            conversation.id
        )));
    }
    require_routable_agent_participant_tx(tx, &conversation.id, current_lead)?;

    let author = get_participant_tx(tx, &message.author_participant_id)?.ok_or_else(|| {
        SystemServiceError::Invariant(format!(
            "team message author participant does not exist: {}",
            message.author_participant_id
        ))
    })?;
    if author.conversation_id != conversation.id
        || author.principal_id != request.actor_principal_id
    {
        return Err(SystemServiceError::Invariant(
            "orchestrated team route actor must match the message author".to_string(),
        ));
    }

    let (target_participant_id, trigger) = match message.targets.as_slice() {
        [] => (current_lead, "lead"),
        [target] if target.kind == "lead" && target.participant_id.is_none() => {
            (current_lead, "lead")
        }
        [target] if target.kind == "participant" => (
            target.participant_id.as_deref().ok_or_else(|| {
                SystemServiceError::Invariant(
                    "orchestrated participant target is missing its identity".to_string(),
                )
            })?,
            "direct",
        ),
        _ => {
            return Err(SystemServiceError::Invariant(
                "orchestrated team route accepts one lead or participant target".to_string(),
            ));
        }
    };
    require_routable_agent_participant_tx(tx, &conversation.id, target_participant_id)?;
    let [delivery] = request.deliveries.as_slice() else {
        return Err(SystemServiceError::Invariant(
            "orchestrated team route requires exactly one delivery".to_string(),
        ));
    };
    if delivery.target_participant_id != target_participant_id
        || delivery.role != "speaker"
        || delivery.trigger != trigger
    {
        return Err(SystemServiceError::Invariant(
            "orchestrated team delivery does not match its typed target".to_string(),
        ));
    }
    Ok(())
}
