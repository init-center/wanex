use super::*;

const MAX_TEAM_PAGE_MESSAGES: i64 = 50;
const PARTICIPANT_ID_BATCH_SIZE: usize = 500;

impl SystemService {
    pub fn read_team_conversation_page(
        &self,
        request: &ReadTeamConversationPage,
    ) -> Result<Option<TeamConversationPage>> {
        validate_page_request(request)?;
        let observed_at = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = conn.transaction()?;
        let Some(conversation) = get_conversation_tx(&tx, &request.conversation_id)? else {
            tx.commit()?;
            return Ok(None);
        };
        let limit = request.limit.unwrap_or(20).clamp(1, MAX_TEAM_PAGE_MESSAGES);
        let mut messages = read_message_page_tx(&tx, request, limit + 1)?;
        let has_more = messages.len() as i64 > limit;
        if has_more {
            messages.pop();
        }
        messages.reverse();
        let next_cursor = has_more.then(|| {
            let first = messages
                .first()
                .expect("a page with more rows must retain one message");
            TeamConversationPageCursor {
                created_at: first.created_at,
                message_id: first.id.clone(),
            }
        });
        let routing_decisions = read_page_routing_decisions_tx(&tx, &messages)?;
        let rounds = read_page_rounds_tx(&tx, &messages)?;
        let deliveries = read_page_deliveries_tx(&tx, &messages, &rounds)?;
        let participants =
            read_page_participants_tx(&tx, &conversation.id, &messages, &deliveries)?;
        tx.commit()?;
        Ok(Some(TeamConversationPage {
            conversation,
            participants,
            messages,
            routing_decisions,
            rounds,
            deliveries,
            observed_at,
            next_cursor,
        }))
    }
}

fn validate_page_request(request: &ReadTeamConversationPage) -> Result<()> {
    if request.conversation_id.is_empty() {
        return Err(SystemServiceError::Invariant(
            "team conversation page conversation_id must not be empty".to_string(),
        ));
    }
    if request.before_created_at.is_some() != request.before_message_id.is_some() {
        return Err(SystemServiceError::Invariant(
            "team conversation page cursor requires both before_created_at and before_message_id"
                .to_string(),
        ));
    }
    if request.before_message_id.as_deref() == Some("") {
        return Err(SystemServiceError::Invariant(
            "team conversation page cursor message id must not be empty".to_string(),
        ));
    }
    if request
        .limit
        .is_some_and(|limit| !(1..=MAX_TEAM_PAGE_MESSAGES).contains(&limit))
    {
        return Err(SystemServiceError::Invariant(format!(
            "team conversation page limit must be between 1 and {MAX_TEAM_PAGE_MESSAGES}"
        )));
    }
    Ok(())
}

fn read_message_page_tx(
    tx: &rusqlite::Transaction<'_>,
    request: &ReadTeamConversationPage,
    limit: i64,
) -> Result<Vec<TeamMessageRecord>> {
    let before = request.before_created_at.unwrap_or(i64::MAX);
    let before_message_id = request.before_message_id.clone().unwrap_or_default();
    let mut stmt = tx.prepare(&format!(
        "{MESSAGE_SELECT}
         WHERE conversation_id = ?
           AND (
             created_at < ?
             OR (? != '' AND created_at = ? AND id < ?)
           )
         ORDER BY created_at DESC, id DESC
         LIMIT ?"
    ))?;
    let records = collect_messages(stmt.query_map(
        params![
            request.conversation_id,
            before,
            before_message_id,
            before,
            before_message_id,
            limit
        ],
        row_to_team_message,
    )?)?;
    Ok(records)
}

fn read_page_routing_decisions_tx(
    tx: &rusqlite::Transaction<'_>,
    messages: &[TeamMessageRecord],
) -> Result<Vec<TeamRoutingDecisionRecord>> {
    let ids = messages
        .iter()
        .map(|message| message.id.clone())
        .collect::<Vec<_>>();
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let mut stmt = tx.prepare(&format!(
        "{ROUTING_DECISION_SELECT}
         WHERE message_id IN ({})
         ORDER BY created_at ASC, id ASC",
        placeholders(ids.len())
    ))?;
    let records = collect_routing_decisions(
        stmt.query_map(params_from_iter(ids.iter()), row_to_team_routing_decision)?,
    )?;
    Ok(records)
}

fn read_page_rounds_tx(
    tx: &rusqlite::Transaction<'_>,
    messages: &[TeamMessageRecord],
) -> Result<Vec<TeamDiscussionRoundRecord>> {
    if messages.is_empty() {
        return Ok(Vec::new());
    }
    let message_ids = messages
        .iter()
        .map(|message| message.id.clone())
        .collect::<Vec<_>>();
    let round_ids = messages
        .iter()
        .filter_map(|message| message.discussion_round_id.clone())
        .collect::<Vec<_>>();
    let message_placeholders = placeholders(message_ids.len());
    let mut sql =
        format!("{DISCUSSION_ROUND_SELECT} WHERE source_message_id IN ({message_placeholders})");
    let mut values = message_ids;
    if !round_ids.is_empty() {
        sql.push_str(&format!(" OR id IN ({})", placeholders(round_ids.len())));
        values.extend(round_ids);
    }
    sql.push_str(" ORDER BY created_at ASC, id ASC");
    let mut stmt = tx.prepare(&sql)?;
    let records = collect_discussion_rounds(
        stmt.query_map(params_from_iter(values), row_to_team_discussion_round)?,
    )?;
    for record in &records {
        super::round::validate_discussion_round_record(record)?;
    }
    Ok(records)
}

fn read_page_deliveries_tx(
    tx: &rusqlite::Transaction<'_>,
    messages: &[TeamMessageRecord],
    rounds: &[TeamDiscussionRoundRecord],
) -> Result<Vec<TeamDeliveryRecord>> {
    if messages.is_empty() {
        return Ok(Vec::new());
    }
    let message_ids = messages
        .iter()
        .map(|message| message.id.clone())
        .collect::<Vec<_>>();
    let round_ids = rounds
        .iter()
        .map(|round| round.id.clone())
        .collect::<Vec<_>>();
    let mut sql = format!(
        "{DELIVERY_SELECT} WHERE message_id IN ({})",
        placeholders(message_ids.len())
    );
    let mut values = message_ids;
    if !round_ids.is_empty() {
        sql.push_str(&format!(
            " OR discussion_round_id IN ({})",
            placeholders(round_ids.len())
        ));
        values.extend(round_ids);
    }
    sql.push_str(" ORDER BY created_at ASC, id ASC");
    let mut stmt = tx.prepare(&sql)?;
    let records =
        collect_deliveries(stmt.query_map(params_from_iter(values), row_to_team_delivery)?)?;
    Ok(records)
}

fn read_page_participants_tx(
    tx: &rusqlite::Transaction<'_>,
    conversation_id: &str,
    messages: &[TeamMessageRecord],
    deliveries: &[TeamDeliveryRecord],
) -> Result<Vec<TeamParticipantRecord>> {
    let mut ids = HashSet::new();
    for message in messages {
        ids.insert(message.author_participant_id.clone());
        for target in &message.targets {
            if let Some(participant_id) = &target.participant_id {
                ids.insert(participant_id.clone());
            }
        }
    }
    for delivery in deliveries {
        ids.insert(delivery.target_participant_id.clone());
    }
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let mut ids = ids.into_iter().collect::<Vec<_>>();
    ids.sort();
    let mut records = Vec::new();
    for batch in ids.chunks(PARTICIPANT_ID_BATCH_SIZE) {
        let mut values = Vec::with_capacity(batch.len() + 1);
        values.push(conversation_id.to_string());
        values.extend(batch.iter().cloned());
        let mut stmt = tx.prepare(&format!(
            "{PARTICIPANT_SELECT}
             WHERE conversation_id = ? AND id IN ({})",
            placeholders(batch.len())
        ))?;
        records.extend(collect_participants(
            stmt.query_map(params_from_iter(values), row_to_team_participant)?,
        )?);
    }
    records.sort_by(|left, right| {
        left.created_at
            .cmp(&right.created_at)
            .then_with(|| left.id.cmp(&right.id))
    });
    Ok(records)
}

fn placeholders(count: usize) -> String {
    vec!["?"; count].join(", ")
}
