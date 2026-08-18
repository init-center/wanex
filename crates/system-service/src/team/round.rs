use super::*;

impl SystemService {
    pub fn get_team_discussion_round(
        &self,
        round_id: &str,
    ) -> Result<Option<TeamDiscussionRoundRecord>> {
        if round_id.is_empty() {
            return Err(SystemServiceError::Invariant(
                "team discussion round id must not be empty".to_string(),
            ));
        }
        let conn = self.connect()?;
        let record = conn
            .query_row(
                &format!("{DISCUSSION_ROUND_SELECT} WHERE id = ?"),
                params![round_id],
                row_to_team_discussion_round,
            )
            .optional()
            .map_err(SystemServiceError::from)?;
        if let Some(record) = &record {
            validate_discussion_round_record(record)?;
        }
        Ok(record)
    }

    pub fn list_team_discussion_rounds(
        &self,
        request: &ListTeamDiscussionRounds,
    ) -> Result<Vec<TeamDiscussionRoundRecord>> {
        validate_list_discussion_rounds(request)?;
        let state = request.state.clone().unwrap_or_default();
        let after = request.after_created_at.unwrap_or(i64::MIN);
        let after_round_id = request.after_round_id.clone().unwrap_or_default();
        let limit = request.limit.unwrap_or(100).clamp(1, 200);
        let conn = self.connect()?;
        let mut stmt = conn.prepare(&format!(
            "{DISCUSSION_ROUND_SELECT}
             WHERE conversation_id = ?
               AND (? = '' OR state = ?)
               AND (
                 created_at > ?
                 OR (? != '' AND created_at = ? AND id > ?)
               )
             ORDER BY created_at ASC, id ASC
             LIMIT ?"
        ))?;
        let records = collect_discussion_rounds(stmt.query_map(
            params![
                request.conversation_id,
                state,
                state,
                after,
                after_round_id,
                after,
                after_round_id,
                limit
            ],
            row_to_team_discussion_round,
        )?)?;
        for record in &records {
            validate_discussion_round_record(record)?;
        }
        Ok(records)
    }
}

pub(super) fn reconcile_team_discussion_round_tx(
    tx: &rusqlite::Transaction<'_>,
    round_id: &str,
    now: i64,
) -> Result<TeamDiscussionRoundRecord> {
    let round = get_discussion_round_tx(tx, round_id)?.ok_or_else(|| {
        SystemServiceError::Invariant(format!(
            "team delivery discussion round does not exist: {round_id}"
        ))
    })?;
    if round.state == "closed" {
        validate_discussion_round_record(&round)?;
        return Ok(round);
    }
    if round.state != "open" {
        return Err(SystemServiceError::Invariant(format!(
            "invalid team discussion round state: {}",
            round.state
        )));
    }

    let deliveries = list_deliveries_by_round_tx(tx, round_id)?;
    if deliveries.len() as i64 != round.expected_delivery_count {
        return Err(SystemServiceError::Invariant(format!(
            "team discussion round delivery snapshot mismatch: expected={}, actual={}",
            round.expected_delivery_count,
            deliveries.len()
        )));
    }
    if deliveries
        .iter()
        .any(|delivery| matches!(delivery.state.as_str(), "queued" | "dispatched"))
    {
        return Ok(round);
    }

    let result = summarize_deliveries(&deliveries)?;
    let outcome = discussion_round_outcome(&result)?;
    let result_json = serde_json::to_string(&result)?;
    let updated = tx.execute(
        "UPDATE team_discussion_round
         SET state = 'closed', outcome = ?, result_json = ?, updated_at = ?, closed_at = ?
         WHERE id = ? AND state = 'open'",
        params![outcome, result_json, now, now, round_id],
    )?;
    if updated != 1 {
        return Err(SystemServiceError::Invariant(
            "team discussion round lost its closure claim".to_string(),
        ));
    }
    append_team_event_tx(
        tx,
        "team.discussion_round.closed",
        &serde_json::json!({
            "conversationId": round.conversation_id,
            "sourceMessageId": round.source_message_id,
            "routingDecisionId": round.routing_decision_id,
            "discussionRoundId": round.id,
            "outcome": outcome,
            "result": result
        }),
        now,
    )?;
    get_discussion_round_tx(tx, round_id)?.ok_or_else(|| {
        SystemServiceError::Invariant(format!(
            "closed team discussion round could not be reloaded: {round_id}"
        ))
    })
}

fn validate_list_discussion_rounds(request: &ListTeamDiscussionRounds) -> Result<()> {
    if request.conversation_id.is_empty() {
        return Err(SystemServiceError::Invariant(
            "team discussion round conversation_id must not be empty".to_string(),
        ));
    }
    validate_optional_discussion_round_state(request.state.as_deref())?;
    if request.after_created_at.is_some() != request.after_round_id.is_some() {
        return Err(SystemServiceError::Invariant(
            "team discussion round cursor requires both after_created_at and after_round_id"
                .to_string(),
        ));
    }
    if request.after_round_id.as_deref() == Some("") {
        return Err(SystemServiceError::Invariant(
            "team discussion round cursor id must not be empty".to_string(),
        ));
    }
    Ok(())
}

fn summarize_deliveries(deliveries: &[TeamDeliveryRecord]) -> Result<TeamDiscussionRoundResult> {
    let mut result = TeamDiscussionRoundResult {
        expected: deliveries.len() as i64,
        responded: 0,
        passed: 0,
        failed: 0,
        cancelled: 0,
    };
    for delivery in deliveries {
        match delivery.state.as_str() {
            "responded" => result.responded += 1,
            "passed" => result.passed += 1,
            "failed" => result.failed += 1,
            "cancelled" => result.cancelled += 1,
            state => {
                return Err(SystemServiceError::Invariant(format!(
                    "team discussion round cannot close with delivery state: {state}"
                )));
            }
        }
    }
    Ok(result)
}

fn discussion_round_outcome(result: &TeamDiscussionRoundResult) -> Result<&'static str> {
    let counts = [
        result.responded,
        result.passed,
        result.failed,
        result.cancelled,
    ];
    if result.expected <= 0
        || counts.iter().any(|count| *count < 0)
        || counts.iter().sum::<i64>() != result.expected
    {
        return Err(SystemServiceError::Invariant(
            "team discussion round result counts must be non-negative and sum to expected"
                .to_string(),
        ));
    }
    let success = result.responded + result.passed;
    Ok(if success == result.expected {
        "completed"
    } else if success > 0 {
        "partial"
    } else if result.failed > 0 {
        "failed"
    } else {
        "cancelled"
    })
}

pub(super) fn validate_discussion_round_record(round: &TeamDiscussionRoundRecord) -> Result<()> {
    validate_discussion_round_state(&round.state)?;
    if round.expected_delivery_count <= 0
        || round.updated_at < round.created_at
        || (round.state == "open"
            && (round.outcome.is_some() || round.result.is_some() || round.closed_at.is_some()))
    {
        return Err(SystemServiceError::Invariant(
            "team discussion round has inconsistent lifecycle evidence".to_string(),
        ));
    }
    if round.state != "closed" {
        return Ok(());
    }
    let result = round.result.as_ref().ok_or_else(|| {
        SystemServiceError::Invariant("closed team discussion round is missing result".to_string())
    })?;
    let outcome = round.outcome.as_deref().ok_or_else(|| {
        SystemServiceError::Invariant("closed team discussion round is missing outcome".to_string())
    })?;
    if round.closed_at.is_none()
        || result.expected != round.expected_delivery_count
        || discussion_round_outcome(result)? != outcome
    {
        return Err(SystemServiceError::Invariant(
            "closed team discussion round has inconsistent terminal evidence".to_string(),
        ));
    }
    Ok(())
}
