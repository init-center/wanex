use super::*;

impl SystemService {
    pub fn put_team_conversation(
        &self,
        request: &PutTeamConversation,
    ) -> Result<TeamConversationRecord> {
        validate_put_conversation(request)?;
        let id = request
            .id
            .clone()
            .unwrap_or_else(|| format!("team_{}", Uuid::now_v7()));
        let mode = request.mode.clone().unwrap_or_else(|| "hybrid".to_string());
        let metadata_json = request
            .metadata
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;

        if let Some(idempotency_key) = &request.idempotency_key {
            let existing = tx
                .query_row(
                    &format!("{CONVERSATION_SELECT} WHERE idempotency_key = ?"),
                    params![idempotency_key],
                    row_to_team_conversation,
                )
                .optional()?;
            if let Some(record) = existing {
                validate_existing_conversation(&record, request, &mode)?;
                tx.commit()?;
                return Ok(record);
            }
        }

        if let Some(record) = get_conversation_tx(&tx, &id)? {
            validate_existing_conversation(&record, request, &mode)?;
            tx.commit()?;
            return Ok(record);
        }

        tx.execute(
            "INSERT INTO team_conversation (
                id, principal_id, title, mode, state, lead_participant_id, metadata_json,
                idempotency_key, created_at, updated_at, closed_at
             ) VALUES (?, ?, ?, ?, 'open', NULL, ?, ?, ?, ?, NULL)",
            params![
                id,
                request.principal_id,
                request.title,
                mode,
                metadata_json,
                request.idempotency_key,
                now,
                now
            ],
        )?;
        append_team_event_tx(
            &tx,
            "team.conversation.created",
            &serde_json::json!({
                "conversationId": id,
                "principalId": request.principal_id,
                "mode": mode,
                "state": "open"
            }),
            now,
        )?;
        let record = get_conversation_tx(&tx, &id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!("team conversation insert missing: {id}"))
        })?;
        tx.commit()?;
        Ok(record)
    }

    pub fn get_team_conversation(
        &self,
        conversation_id: &str,
    ) -> Result<Option<TeamConversationRecord>> {
        if conversation_id.is_empty() {
            return Err(SystemServiceError::Invariant(
                "team conversation id must not be empty".to_string(),
            ));
        }
        let conn = self.connect()?;
        conn.query_row(
            &format!("{CONVERSATION_SELECT} WHERE id = ?"),
            params![conversation_id],
            row_to_team_conversation,
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn list_team_conversations(
        &self,
        request: &ListTeamConversations,
    ) -> Result<Vec<TeamConversationRecord>> {
        validate_optional_conversation_state(request.state.as_deref())?;
        validate_optional_conversation_mode(request.mode.as_deref())?;
        let mut sql = format!("{CONVERSATION_SELECT} WHERE 1 = 1");
        let mut values: Vec<Box<dyn ToSql>> = Vec::new();
        if let Some(principal_id) = &request.principal_id {
            sql.push_str(" AND principal_id = ?");
            values.push(Box::new(principal_id.clone()));
        }
        if let Some(state) = &request.state {
            sql.push_str(" AND state = ?");
            values.push(Box::new(state.clone()));
        }
        if let Some(mode) = &request.mode {
            sql.push_str(" AND mode = ?");
            values.push(Box::new(mode.clone()));
        }
        sql.push_str(" ORDER BY updated_at DESC, id ASC LIMIT ?");
        values.push(Box::new(request.limit.unwrap_or(100).clamp(1, 1000)));

        let conn = self.connect()?;
        let mut stmt = conn.prepare(&sql)?;
        let records = collect_conversations(stmt.query_map(
            params_from_iter(values.iter().map(|value| value.as_ref())),
            row_to_team_conversation,
        )?)?;
        Ok(records)
    }

    pub fn update_team_conversation_state(
        &self,
        request: &UpdateTeamConversationState,
    ) -> Result<TeamConversationRecord> {
        validate_conversation_state(&request.state)?;
        if request.conversation_id.is_empty() {
            return Err(SystemServiceError::Invariant(
                "team conversation id must not be empty".to_string(),
            ));
        }
        let now = crate::util::now_ms();
        let closed_at = if conversation_state_is_terminal(&request.state) {
            Some(now)
        } else {
            None
        };
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let existing = get_conversation_tx(&tx, &request.conversation_id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!(
                "team conversation does not exist: {}",
                request.conversation_id
            ))
        })?;
        if conversation_state_is_terminal(&existing.state) && existing.state != request.state {
            return Err(SystemServiceError::Invariant(format!(
                "invalid team conversation transition: {}/{}",
                existing.state, request.state
            )));
        }
        tx.execute(
            "UPDATE team_conversation
             SET state = ?, updated_at = ?, closed_at = ?
             WHERE id = ?",
            params![request.state, now, closed_at, request.conversation_id],
        )?;
        append_team_event_tx(
            &tx,
            "team.conversation.state_updated",
            &serde_json::json!({
                "conversationId": request.conversation_id,
                "fromState": existing.state,
                "toState": request.state
            }),
            now,
        )?;
        let record = get_conversation_tx(&tx, &request.conversation_id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!(
                "team conversation update missing: {}",
                request.conversation_id
            ))
        })?;
        tx.commit()?;
        Ok(record)
    }

    pub fn set_team_conversation_lead(
        &self,
        request: &SetTeamConversationLead,
    ) -> Result<TeamConversationRecord> {
        validate_set_conversation_lead(request)?;
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let existing = get_conversation_tx(&tx, &request.conversation_id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!(
                "team conversation does not exist: {}",
                request.conversation_id
            ))
        })?;
        if conversation_state_is_terminal(&existing.state) {
            return Err(SystemServiceError::Invariant(
                "team conversation is closed".to_string(),
            ));
        }
        if existing.mode == "peer" && request.lead_participant_id.is_some() {
            return Err(SystemServiceError::Invariant(
                "peer team conversation cannot have a lead".to_string(),
            ));
        }
        if existing.lead_participant_id == request.lead_participant_id {
            tx.commit()?;
            return Ok(existing);
        }
        if existing.lead_participant_id != request.expected_lead_participant_id {
            return Err(SystemServiceError::Conflict(format!(
                "team conversation lead changed: {}",
                request.conversation_id
            )));
        }
        if let Some(participant_id) = &request.lead_participant_id {
            let participant = get_participant_tx(&tx, participant_id)?.ok_or_else(|| {
                SystemServiceError::Invariant(format!(
                    "team lead participant does not exist: {participant_id}"
                ))
            })?;
            if participant.conversation_id != existing.id {
                return Err(SystemServiceError::Invariant(
                    "team lead participant belongs to another conversation".to_string(),
                ));
            }
            if participant.kind != "agent"
                || participant.state != "active"
                || participant.agent_session_id.is_none()
            {
                return Err(SystemServiceError::Invariant(
                    "team lead participant must be an active agent".to_string(),
                ));
            }
        }
        let now = crate::util::now_ms();
        tx.execute(
            "UPDATE team_conversation
             SET lead_participant_id = ?, updated_at = ?
             WHERE id = ?",
            params![request.lead_participant_id, now, request.conversation_id],
        )?;
        append_team_event_tx(
            &tx,
            "team.conversation.lead_updated",
            &serde_json::json!({
                "conversationId": request.conversation_id,
                "fromLeadParticipantId": existing.lead_participant_id,
                "toLeadParticipantId": request.lead_participant_id
            }),
            now,
        )?;
        let record = get_conversation_tx(&tx, &request.conversation_id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!(
                "team conversation lead update missing: {}",
                request.conversation_id
            ))
        })?;
        tx.commit()?;
        Ok(record)
    }
}
