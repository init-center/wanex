use super::*;

impl SystemService {
    pub fn put_team_participant(
        &self,
        request: &PutTeamParticipant,
    ) -> Result<TeamParticipantRecord> {
        validate_put_participant(request)?;
        let id = request
            .id
            .clone()
            .unwrap_or_else(|| format!("tpart_{}", Uuid::now_v7()));
        let metadata_json = request
            .metadata
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;

        let conversation =
            get_conversation_tx(&tx, &request.conversation_id)?.ok_or_else(|| {
                SystemServiceError::Invariant(format!(
                    "team conversation does not exist: {}",
                    request.conversation_id
                ))
            })?;
        if conversation_state_is_terminal(&conversation.state) {
            return Err(SystemServiceError::Invariant(
                "team conversation is closed".to_string(),
            ));
        }

        if let Some(idempotency_key) = &request.idempotency_key {
            let existing = tx
                .query_row(
                    &format!("{PARTICIPANT_SELECT} WHERE idempotency_key = ?"),
                    params![idempotency_key],
                    row_to_team_participant,
                )
                .optional()?;
            if let Some(record) = existing {
                validate_existing_participant(&record, request)?;
                tx.commit()?;
                return Ok(record);
            }
        }

        if let Some(record) = get_participant_tx(&tx, &id)? {
            validate_existing_participant(&record, request)?;
            tx.commit()?;
            return Ok(record);
        }

        if let Some(session_id) = &request.agent_session_id {
            let binding = tx
                .query_row(
                    "SELECT kind, status FROM session WHERE id = ?",
                    params![session_id],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
                )
                .optional()?
                .ok_or_else(|| {
                    SystemServiceError::Invariant(format!(
                        "team agent session does not exist: {session_id}"
                    ))
                })?;
            if binding != ("agent".to_string(), "active".to_string()) {
                return Err(SystemServiceError::Invariant(
                    "team agent session must be active with kind agent".to_string(),
                ));
            }
        }

        tx.execute(
            "INSERT INTO team_participant (
                id, conversation_id, principal_id, kind, display_name, role,
                agent_session_id, state, metadata_json, idempotency_key,
                created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)",
            params![
                id,
                request.conversation_id,
                request.principal_id,
                request.kind,
                request.display_name,
                request.role,
                request.agent_session_id,
                metadata_json,
                request.idempotency_key,
                now,
                now
            ],
        )?;
        append_team_event_tx(
            &tx,
            "team.participant.joined",
            &serde_json::json!({
                "conversationId": request.conversation_id,
                "participantId": id,
                "principalId": request.principal_id,
                "kind": request.kind,
                "agentSessionId": request.agent_session_id
            }),
            now,
        )?;
        let record = get_participant_tx(&tx, &id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!("team participant insert missing: {id}"))
        })?;
        tx.commit()?;
        Ok(record)
    }

    pub fn list_team_participants(
        &self,
        request: &ListTeamParticipants,
    ) -> Result<Vec<TeamParticipantRecord>> {
        if request.conversation_id.is_empty() {
            return Err(SystemServiceError::Invariant(
                "team participant conversation_id must not be empty".to_string(),
            ));
        }
        validate_optional_participant_state(request.state.as_deref())?;
        let conn = self.connect()?;
        if let Some(state) = &request.state {
            let mut stmt = conn.prepare(&format!(
                "{PARTICIPANT_SELECT}
                 WHERE conversation_id = ? AND state = ?
                 ORDER BY created_at ASC, id ASC"
            ))?;
            return collect_participants(stmt.query_map(
                params![request.conversation_id, state],
                row_to_team_participant,
            )?);
        }
        let mut stmt = conn.prepare(&format!(
            "{PARTICIPANT_SELECT}
             WHERE conversation_id = ?
             ORDER BY created_at ASC, id ASC"
        ))?;
        let records = collect_participants(
            stmt.query_map(params![request.conversation_id], row_to_team_participant)?,
        )?;
        Ok(records)
    }

    pub fn update_team_participant_state(
        &self,
        request: &UpdateTeamParticipantState,
    ) -> Result<TeamParticipantRecord> {
        validate_participant_state(&request.state)?;
        if request.participant_id.is_empty() {
            return Err(SystemServiceError::Invariant(
                "team participant id must not be empty".to_string(),
            ));
        }
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let existing = get_participant_tx(&tx, &request.participant_id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!(
                "team participant does not exist: {}",
                request.participant_id
            ))
        })?;
        if request.state != "active" {
            let conversation =
                get_conversation_tx(&tx, &existing.conversation_id)?.ok_or_else(|| {
                    SystemServiceError::Invariant(format!(
                        "team conversation does not exist: {}",
                        existing.conversation_id
                    ))
                })?;
            if conversation.lead_participant_id.as_deref() == Some(&existing.id) {
                return Err(SystemServiceError::Conflict(
                    "team lead must be reassigned or cleared before leaving active state"
                        .to_string(),
                ));
            }
        }
        tx.execute(
            "UPDATE team_participant
             SET state = ?, updated_at = ?
             WHERE id = ?",
            params![request.state, now, request.participant_id],
        )?;
        append_team_event_tx(
            &tx,
            "team.participant.state_updated",
            &serde_json::json!({
                "conversationId": existing.conversation_id,
                "participantId": request.participant_id,
                "fromState": existing.state,
                "toState": request.state
            }),
            now,
        )?;
        let record = get_participant_tx(&tx, &request.participant_id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!(
                "team participant update missing: {}",
                request.participant_id
            ))
        })?;
        tx.commit()?;
        Ok(record)
    }
}
