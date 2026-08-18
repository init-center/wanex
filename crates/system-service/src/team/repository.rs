use super::*;

pub(super) fn get_conversation_tx(
    tx: &rusqlite::Transaction<'_>,
    conversation_id: &str,
) -> Result<Option<TeamConversationRecord>> {
    tx.query_row(
        &format!("{CONVERSATION_SELECT} WHERE id = ?"),
        params![conversation_id],
        row_to_team_conversation,
    )
    .optional()
    .map_err(Into::into)
}

pub(super) fn get_participant_tx(
    tx: &rusqlite::Transaction<'_>,
    participant_id: &str,
) -> Result<Option<TeamParticipantRecord>> {
    tx.query_row(
        &format!("{PARTICIPANT_SELECT} WHERE id = ?"),
        params![participant_id],
        row_to_team_participant,
    )
    .optional()
    .map_err(Into::into)
}

pub(super) fn get_message_tx(
    tx: &rusqlite::Transaction<'_>,
    message_id: &str,
) -> Result<Option<TeamMessageRecord>> {
    tx.query_row(
        &format!("{MESSAGE_SELECT} WHERE id = ?"),
        params![message_id],
        row_to_team_message,
    )
    .optional()
    .map_err(Into::into)
}

pub(super) fn get_message_by_idempotency_key_tx(
    tx: &rusqlite::Transaction<'_>,
    idempotency_key: &str,
) -> Result<Option<TeamMessageRecord>> {
    tx.query_row(
        &format!("{MESSAGE_SELECT} WHERE idempotency_key = ?"),
        params![idempotency_key],
        row_to_team_message,
    )
    .optional()
    .map_err(Into::into)
}

pub(super) fn get_routing_decision_tx(
    tx: &rusqlite::Transaction<'_>,
    decision_id: &str,
) -> Result<Option<TeamRoutingDecisionRecord>> {
    tx.query_row(
        &format!("{ROUTING_DECISION_SELECT} WHERE id = ?"),
        params![decision_id],
        row_to_team_routing_decision,
    )
    .optional()
    .map_err(Into::into)
}

pub(super) fn get_routing_decision_by_idempotency_key_tx(
    tx: &rusqlite::Transaction<'_>,
    idempotency_key: &str,
) -> Result<Option<TeamRoutingDecisionRecord>> {
    tx.query_row(
        &format!("{ROUTING_DECISION_SELECT} WHERE idempotency_key = ?"),
        params![idempotency_key],
        row_to_team_routing_decision,
    )
    .optional()
    .map_err(Into::into)
}

pub(super) fn get_discussion_round_tx(
    tx: &rusqlite::Transaction<'_>,
    round_id: &str,
) -> Result<Option<TeamDiscussionRoundRecord>> {
    tx.query_row(
        &format!("{DISCUSSION_ROUND_SELECT} WHERE id = ?"),
        params![round_id],
        row_to_team_discussion_round,
    )
    .optional()
    .map_err(Into::into)
}

pub(super) fn get_discussion_round_by_decision_tx(
    tx: &rusqlite::Transaction<'_>,
    decision_id: &str,
) -> Result<Option<TeamDiscussionRoundRecord>> {
    tx.query_row(
        &format!("{DISCUSSION_ROUND_SELECT} WHERE routing_decision_id = ?"),
        params![decision_id],
        row_to_team_discussion_round,
    )
    .optional()
    .map_err(Into::into)
}

pub(super) fn list_deliveries_by_decision_tx(
    tx: &rusqlite::Transaction<'_>,
    decision_id: &str,
) -> Result<Vec<TeamDeliveryRecord>> {
    let mut stmt = tx.prepare(&format!(
        "{DELIVERY_SELECT}
         WHERE routing_decision_id = ?
         ORDER BY created_at ASC, id ASC"
    ))?;
    let records = collect_deliveries(stmt.query_map(params![decision_id], row_to_team_delivery)?)?;
    Ok(records)
}

pub(super) fn list_deliveries_by_round_tx(
    tx: &rusqlite::Transaction<'_>,
    round_id: &str,
) -> Result<Vec<TeamDeliveryRecord>> {
    let mut stmt = tx.prepare(&format!(
        "{DELIVERY_SELECT}
         WHERE discussion_round_id = ?
         ORDER BY created_at ASC, id ASC"
    ))?;
    let records = collect_deliveries(stmt.query_map(params![round_id], row_to_team_delivery)?)?;
    Ok(records)
}

pub(super) fn get_delivery_tx(
    tx: &rusqlite::Transaction<'_>,
    delivery_id: &str,
) -> Result<Option<TeamDeliveryRecord>> {
    tx.query_row(
        &format!("{DELIVERY_SELECT} WHERE id = ?"),
        params![delivery_id],
        row_to_team_delivery,
    )
    .optional()
    .map_err(Into::into)
}

pub(super) fn get_delivery_by_dispatch_job_tx(
    tx: &rusqlite::Transaction<'_>,
    dispatch_job_id: &str,
) -> Result<Option<TeamDeliveryRecord>> {
    tx.query_row(
        &format!("{DELIVERY_SELECT} WHERE dispatch_job_id = ?"),
        params![dispatch_job_id],
        row_to_team_delivery,
    )
    .optional()
    .map_err(Into::into)
}

pub(super) fn get_delivery_by_child_turn_job_tx(
    tx: &rusqlite::Transaction<'_>,
    child_turn_job_id: &str,
) -> Result<Option<TeamDeliveryRecord>> {
    tx.query_row(
        &format!("{DELIVERY_SELECT} WHERE child_turn_job_id = ?"),
        params![child_turn_job_id],
        row_to_team_delivery,
    )
    .optional()
    .map_err(Into::into)
}

pub(super) fn get_delivery_by_outcome_job_tx(
    tx: &rusqlite::Transaction<'_>,
    outcome_job_id: &str,
) -> Result<Option<TeamDeliveryRecord>> {
    tx.query_row(
        &format!("{DELIVERY_SELECT} WHERE outcome_job_id = ?"),
        params![outcome_job_id],
        row_to_team_delivery,
    )
    .optional()
    .map_err(Into::into)
}

pub(super) fn dispatch_jobs_for_deliveries_tx(
    tx: &rusqlite::Transaction<'_>,
    deliveries: &[TeamDeliveryRecord],
) -> Result<Vec<SchedulerJobRecord>> {
    deliveries
        .iter()
        .map(|delivery| crate::scheduler::get_job_tx(tx, &delivery.dispatch_job_id))
        .collect()
}

pub(super) fn validate_route_delivery_targets(
    tx: &rusqlite::Transaction<'_>,
    conversation_id: &str,
    deliveries: &[RouteTeamDelivery],
) -> Result<()> {
    for delivery in deliveries {
        require_routable_agent_participant_tx(
            tx,
            conversation_id,
            &delivery.target_participant_id,
        )?;
    }
    Ok(())
}

pub(super) fn require_routable_agent_participant_tx(
    tx: &rusqlite::Transaction<'_>,
    conversation_id: &str,
    participant_id: &str,
) -> Result<TeamParticipantRecord> {
    let participant = get_participant_tx(tx, participant_id)?.ok_or_else(|| {
        SystemServiceError::Invariant(format!(
            "team delivery target participant does not exist: {participant_id}"
        ))
    })?;
    if participant.conversation_id != conversation_id || participant.state != "active" {
        return Err(SystemServiceError::Invariant(
            "team delivery target must be active in conversation".to_string(),
        ));
    }
    if participant.kind != "agent" {
        return Err(SystemServiceError::Invariant(
            "team delivery target must be an agent with an exact session binding".to_string(),
        ));
    }
    let session_id = participant.agent_session_id.as_deref().ok_or_else(|| {
        SystemServiceError::Invariant(
            "team delivery target must be an agent with an exact session binding".to_string(),
        )
    })?;
    let session = tx
        .query_row(
            "SELECT kind, status FROM session WHERE id = ?",
            params![session_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()?
        .ok_or_else(|| {
            SystemServiceError::Invariant(format!(
                "team delivery target session does not exist: {session_id}"
            ))
        })?;
    if session != ("agent".to_string(), "active".to_string()) {
        return Err(SystemServiceError::Invariant(
            "team delivery target session must be an active agent session".to_string(),
        ));
    }
    Ok(participant)
}

pub(super) fn collect_conversations(
    rows: impl Iterator<Item = rusqlite::Result<TeamConversationRecord>>,
) -> Result<Vec<TeamConversationRecord>> {
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}

pub(super) fn collect_participants(
    rows: impl Iterator<Item = rusqlite::Result<TeamParticipantRecord>>,
) -> Result<Vec<TeamParticipantRecord>> {
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}

pub(super) fn collect_messages(
    rows: impl Iterator<Item = rusqlite::Result<TeamMessageRecord>>,
) -> Result<Vec<TeamMessageRecord>> {
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}

pub(super) fn collect_routing_decisions(
    rows: impl Iterator<Item = rusqlite::Result<TeamRoutingDecisionRecord>>,
) -> Result<Vec<TeamRoutingDecisionRecord>> {
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}

pub(super) fn collect_discussion_rounds(
    rows: impl Iterator<Item = rusqlite::Result<TeamDiscussionRoundRecord>>,
) -> Result<Vec<TeamDiscussionRoundRecord>> {
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}

pub(super) fn collect_deliveries(
    rows: impl Iterator<Item = rusqlite::Result<TeamDeliveryRecord>>,
) -> Result<Vec<TeamDeliveryRecord>> {
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}

pub(super) fn append_team_event_tx(
    tx: &rusqlite::Transaction<'_>,
    event_type: &str,
    payload: &serde_json::Value,
    occurred_at: i64,
) -> Result<()> {
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        event_type,
        &EventScope::default(),
        payload,
        occurred_at,
    )
}
