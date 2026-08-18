use super::*;

impl SystemService {
    pub fn admit_team_message(&self, request: &AdmitTeamMessage) -> Result<TeamMessageRecord> {
        validate_admit_message(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let record = admit_team_message_tx(&tx, request, now)?;
        tx.commit()?;
        Ok(record)
    }

    pub fn get_team_message(&self, message_id: &str) -> Result<Option<TeamMessageRecord>> {
        if message_id.is_empty() {
            return Err(SystemServiceError::Invariant(
                "team message id must not be empty".to_string(),
            ));
        }
        let conn = self.connect()?;
        conn.query_row(
            &format!("{MESSAGE_SELECT} WHERE id = ?"),
            params![message_id],
            row_to_team_message,
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn list_team_messages(&self, request: &ListTeamMessages) -> Result<Vec<TeamMessageRecord>> {
        if request.conversation_id.is_empty() {
            return Err(SystemServiceError::Invariant(
                "team message conversation_id must not be empty".to_string(),
            ));
        }
        validate_optional_message_state(request.state.as_deref())?;
        let after = request.after_created_at.unwrap_or(i64::MIN);
        let after_message_id = request.after_message_id.clone().unwrap_or_default();
        let limit = request.limit.unwrap_or(100).clamp(1, 200);
        let state = request.state.clone().unwrap_or_default();
        let conn = self.connect()?;
        let mut stmt = conn.prepare(&format!(
            "{MESSAGE_SELECT}
             WHERE conversation_id = ?
               AND (? = '' OR state = ?)
               AND (
                 created_at > ?
                 OR (? != '' AND created_at = ? AND id > ?)
               )
             ORDER BY created_at ASC, id ASC
             LIMIT ?"
        ))?;
        let records = collect_messages(stmt.query_map(
            params![
                request.conversation_id,
                state,
                state,
                after,
                after_message_id,
                after,
                after_message_id,
                limit
            ],
            row_to_team_message,
        )?)?;
        Ok(records)
    }
}

pub(crate) fn admit_team_message_tx(
    tx: &rusqlite::Transaction<'_>,
    request: &AdmitTeamMessage,
    now: i64,
) -> Result<TeamMessageRecord> {
    validate_admit_message(request)?;
    let id = request
        .id
        .clone()
        .unwrap_or_else(|| format!("tmsg_{}", Uuid::now_v7()));
    let kind = request
        .kind
        .clone()
        .unwrap_or_else(|| "message".to_string());
    let targets_json = serde_json::to_string(&request.targets)?;
    let content_json = serde_json::to_string(&request.content)?;
    let metadata_json = request
        .metadata
        .as_ref()
        .map(serde_json::to_string)
        .transpose()?;

    let conversation = get_conversation_tx(tx, &request.conversation_id)?.ok_or_else(|| {
        SystemServiceError::Invariant(format!(
            "team conversation does not exist: {}",
            request.conversation_id
        ))
    })?;
    if conversation.state != "open" {
        return Err(SystemServiceError::Invariant(
            "team conversation is not open".to_string(),
        ));
    }
    let author = get_participant_tx(tx, &request.author_participant_id)?.ok_or_else(|| {
        SystemServiceError::Invariant(format!(
            "team message author participant does not exist: {}",
            request.author_participant_id
        ))
    })?;
    if author.conversation_id != request.conversation_id || author.state != "active" {
        return Err(SystemServiceError::Invariant(
            "team message author must be active in conversation".to_string(),
        ));
    }
    if let Some(parent_message_id) = &request.parent_message_id {
        let parent = get_message_tx(tx, parent_message_id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!(
                "team parent message does not exist: {parent_message_id}"
            ))
        })?;
        if parent.conversation_id != request.conversation_id {
            return Err(SystemServiceError::Invariant(
                "team parent message must belong to conversation".to_string(),
            ));
        }
    }
    for target in &request.targets {
        if let Some(participant_id) = &target.participant_id {
            let participant = get_participant_tx(tx, participant_id)?.ok_or_else(|| {
                SystemServiceError::Invariant(format!(
                    "team target participant does not exist: {participant_id}"
                ))
            })?;
            if participant.conversation_id != request.conversation_id {
                return Err(SystemServiceError::Invariant(
                    "team target participant must belong to conversation".to_string(),
                ));
            }
        }
    }

    if let Some(existing) = get_message_by_idempotency_key_tx(tx, &request.idempotency_key)? {
        validate_existing_message(&existing, request, &kind)?;
        return Ok(existing);
    }
    if let Some(existing) = get_message_tx(tx, &id)? {
        validate_existing_message(&existing, request, &kind)?;
        return Ok(existing);
    }

    tx.execute(
        "INSERT INTO team_message (
            id, conversation_id, author_participant_id, parent_message_id,
            discussion_round_id, kind, state, targets_json, content_json,
            metadata_json, idempotency_key, revision,
            created_at, updated_at, visible_at
         ) VALUES (?, ?, ?, ?, ?, ?, 'admitted', ?, ?, ?, ?, 1, ?, ?, ?)",
        params![
            id,
            request.conversation_id,
            request.author_participant_id,
            request.parent_message_id,
            None::<String>,
            kind,
            targets_json,
            content_json,
            metadata_json,
            request.idempotency_key,
            now,
            now,
            now
        ],
    )?;
    append_team_event_tx(
        tx,
        "team.message.admitted",
        &serde_json::json!({
            "conversationId": request.conversation_id,
            "messageId": id,
            "authorParticipantId": request.author_participant_id,
            "kind": kind
        }),
        now,
    )?;
    get_message_tx(tx, &id)?
        .ok_or_else(|| SystemServiceError::Invariant(format!("team message insert missing: {id}")))
}
