use crate::event_store::append_event_tx;
use crate::rows::{row_to_team_conversation, row_to_team_participant, row_to_team_turn};
use crate::{
    AppendTeamTurn, EventScope, ListTeamConversations, ListTeamParticipants, ListTeamTurns,
    PutTeamConversation, PutTeamParticipant, Result, SystemService, SystemServiceError,
    TeamConversationRecord, TeamParticipantRecord, TeamTurnRecord, UpdateTeamConversationState,
    UpdateTeamParticipantState,
};
use rusqlite::{params, params_from_iter, OptionalExtension, ToSql};
use uuid::Uuid;

const CONVERSATION_SELECT: &str = "SELECT
    id, principal_id, title, mode, state, metadata_json,
    created_at, updated_at, closed_at
 FROM team_conversation";

const PARTICIPANT_SELECT: &str = "SELECT
    id, conversation_id, principal_id, kind, display_name, role,
    state, metadata_json, created_at, updated_at
 FROM team_participant";

const TURN_SELECT: &str = "SELECT
    id, conversation_id, speaker_participant_id, audience_participant_ids_json,
    kind, content_json, metadata_json, created_at
 FROM team_turn";

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
        let tx = conn.transaction()?;

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
                id, principal_id, title, mode, state, metadata_json,
                idempotency_key, created_at, updated_at, closed_at
             ) VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, NULL)",
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
        let tx = conn.transaction()?;
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
        let tx = conn.transaction()?;

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

        tx.execute(
            "INSERT INTO team_participant (
                id, conversation_id, principal_id, kind, display_name, role,
                state, metadata_json, idempotency_key, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)",
            params![
                id,
                request.conversation_id,
                request.principal_id,
                request.kind,
                request.display_name,
                request.role,
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
                "kind": request.kind
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
        let tx = conn.transaction()?;
        let existing = get_participant_tx(&tx, &request.participant_id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!(
                "team participant does not exist: {}",
                request.participant_id
            ))
        })?;
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

    pub fn append_team_turn(&self, request: &AppendTeamTurn) -> Result<TeamTurnRecord> {
        validate_append_turn(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = conn.transaction()?;
        let record = append_team_turn_tx(&tx, request, now)?;
        tx.commit()?;
        Ok(record)
    }

    pub fn list_team_turns(&self, request: &ListTeamTurns) -> Result<Vec<TeamTurnRecord>> {
        if request.conversation_id.is_empty() {
            return Err(SystemServiceError::Invariant(
                "team turn conversation_id must not be empty".to_string(),
            ));
        }
        let after = request.after_created_at.unwrap_or(i64::MIN);
        let after_turn_id = request.after_turn_id.clone().unwrap_or_default();
        let limit = request.limit.unwrap_or(100).clamp(1, 1000);
        let conn = self.connect()?;
        let mut stmt = conn.prepare(&format!(
            "{TURN_SELECT}
             WHERE conversation_id = ?
               AND (
                 created_at > ?
                 OR (? != '' AND created_at = ? AND id > ?)
               )
             ORDER BY created_at ASC, id ASC
             LIMIT ?"
        ))?;
        let records = collect_turns(stmt.query_map(
            params![
                request.conversation_id,
                after,
                after_turn_id,
                after,
                after_turn_id,
                limit
            ],
            row_to_team_turn,
        )?)?;
        Ok(records)
    }
}

pub(crate) fn append_team_turn_tx(
    tx: &rusqlite::Transaction<'_>,
    request: &AppendTeamTurn,
    now: i64,
) -> Result<TeamTurnRecord> {
    validate_append_turn(request)?;
    let id = request
        .id
        .clone()
        .unwrap_or_else(|| format!("tturn_{}", Uuid::now_v7()));
    let kind = request
        .kind
        .clone()
        .unwrap_or_else(|| "message".to_string());
    let audience_json = request
        .audience_participant_ids
        .as_ref()
        .map(serde_json::to_string)
        .transpose()?;
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
    let speaker = get_participant_tx(tx, &request.speaker_participant_id)?.ok_or_else(|| {
        SystemServiceError::Invariant(format!(
            "team speaker participant does not exist: {}",
            request.speaker_participant_id
        ))
    })?;
    if speaker.conversation_id != request.conversation_id || speaker.state != "active" {
        return Err(SystemServiceError::Invariant(
            "team speaker must be active in conversation".to_string(),
        ));
    }
    if let Some(audience) = &request.audience_participant_ids {
        for participant_id in audience {
            let participant = get_participant_tx(tx, participant_id)?.ok_or_else(|| {
                SystemServiceError::Invariant(format!(
                    "team audience participant does not exist: {participant_id}"
                ))
            })?;
            if participant.conversation_id != request.conversation_id {
                return Err(SystemServiceError::Invariant(
                    "team audience must belong to conversation".to_string(),
                ));
            }
        }
    }

    tx.execute(
        "INSERT INTO team_turn (
            id, conversation_id, speaker_participant_id,
            audience_participant_ids_json, kind, content_json,
            metadata_json, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        params![
            id,
            request.conversation_id,
            request.speaker_participant_id,
            audience_json,
            kind,
            content_json,
            metadata_json,
            now
        ],
    )?;
    append_team_event_tx(
        tx,
        "team.turn.appended",
        &serde_json::json!({
            "conversationId": request.conversation_id,
            "turnId": id,
            "speakerParticipantId": request.speaker_participant_id,
            "kind": kind
        }),
        now,
    )?;
    get_turn_tx(tx, &id)?
        .ok_or_else(|| SystemServiceError::Invariant(format!("team turn insert missing: {id}")))
}

fn validate_put_conversation(request: &PutTeamConversation) -> Result<()> {
    if request.principal_id.is_empty() {
        return Err(SystemServiceError::Invariant(
            "team conversation principal_id must not be empty".to_string(),
        ));
    }
    validate_optional_conversation_mode(request.mode.as_deref())?;
    if request.id.as_deref() == Some("") || request.idempotency_key.as_deref() == Some("") {
        return Err(SystemServiceError::Invariant(
            "team conversation id/idempotency_key must not be empty".to_string(),
        ));
    }
    Ok(())
}

fn validate_put_participant(request: &PutTeamParticipant) -> Result<()> {
    if request.conversation_id.is_empty() || request.principal_id.is_empty() {
        return Err(SystemServiceError::Invariant(
            "team participant conversation_id/principal_id must not be empty".to_string(),
        ));
    }
    validate_participant_kind(&request.kind)?;
    if request.id.as_deref() == Some("") || request.idempotency_key.as_deref() == Some("") {
        return Err(SystemServiceError::Invariant(
            "team participant id/idempotency_key must not be empty".to_string(),
        ));
    }
    Ok(())
}

fn validate_append_turn(request: &AppendTeamTurn) -> Result<()> {
    if request.conversation_id.is_empty() || request.speaker_participant_id.is_empty() {
        return Err(SystemServiceError::Invariant(
            "team turn conversation_id/speaker_participant_id must not be empty".to_string(),
        ));
    }
    if request.content == serde_json::json!([]) {
        return Err(SystemServiceError::Invariant(
            "team turn content must not be empty".to_string(),
        ));
    }
    if let Some(kind) = &request.kind {
        validate_turn_kind(kind)?;
    }
    if request.id.as_deref() == Some("") {
        return Err(SystemServiceError::Invariant(
            "team turn id must not be empty".to_string(),
        ));
    }
    Ok(())
}

fn validate_existing_conversation(
    record: &TeamConversationRecord,
    request: &PutTeamConversation,
    mode: &str,
) -> Result<()> {
    let metadata_matches = match (&record.metadata, &request.metadata) {
        (None, None) => true,
        (Some(left), Some(right)) => left == right,
        _ => false,
    };
    if record.principal_id != request.principal_id
        || record.title != request.title
        || record.mode != mode
        || !metadata_matches
    {
        return Err(SystemServiceError::Invariant(format!(
            "team conversation id already exists with different content: {}",
            record.id
        )));
    }
    Ok(())
}

fn validate_existing_participant(
    record: &TeamParticipantRecord,
    request: &PutTeamParticipant,
) -> Result<()> {
    let metadata_matches = match (&record.metadata, &request.metadata) {
        (None, None) => true,
        (Some(left), Some(right)) => left == right,
        _ => false,
    };
    if record.conversation_id != request.conversation_id
        || record.principal_id != request.principal_id
        || record.kind != request.kind
        || record.display_name != request.display_name
        || record.role != request.role
        || !metadata_matches
    {
        return Err(SystemServiceError::Invariant(format!(
            "team participant id already exists with different content: {}",
            record.id
        )));
    }
    Ok(())
}

fn validate_conversation_mode(mode: &str) -> Result<()> {
    if !matches!(mode, "tl" | "free" | "hybrid") {
        return Err(SystemServiceError::Invariant(format!(
            "invalid team conversation mode: {mode}"
        )));
    }
    Ok(())
}

fn validate_optional_conversation_mode(mode: Option<&str>) -> Result<()> {
    if let Some(mode) = mode {
        validate_conversation_mode(mode)?;
    }
    Ok(())
}

fn validate_conversation_state(state: &str) -> Result<()> {
    if !matches!(state, "open" | "paused" | "closed" | "cancelled") {
        return Err(SystemServiceError::Invariant(format!(
            "invalid team conversation state: {state}"
        )));
    }
    Ok(())
}

fn validate_optional_conversation_state(state: Option<&str>) -> Result<()> {
    if let Some(state) = state {
        validate_conversation_state(state)?;
    }
    Ok(())
}

fn validate_participant_kind(kind: &str) -> Result<()> {
    if !matches!(kind, "user" | "agent" | "tool" | "system") {
        return Err(SystemServiceError::Invariant(format!(
            "invalid team participant kind: {kind}"
        )));
    }
    Ok(())
}

fn validate_participant_state(state: &str) -> Result<()> {
    if !matches!(state, "active" | "muted" | "left") {
        return Err(SystemServiceError::Invariant(format!(
            "invalid team participant state: {state}"
        )));
    }
    Ok(())
}

fn validate_optional_participant_state(state: Option<&str>) -> Result<()> {
    if let Some(state) = state {
        validate_participant_state(state)?;
    }
    Ok(())
}

fn validate_turn_kind(kind: &str) -> Result<()> {
    if !matches!(kind, "message" | "decision" | "handoff" | "system") {
        return Err(SystemServiceError::Invariant(format!(
            "invalid team turn kind: {kind}"
        )));
    }
    Ok(())
}

fn conversation_state_is_terminal(state: &str) -> bool {
    matches!(state, "closed" | "cancelled")
}

fn get_conversation_tx(
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

fn get_participant_tx(
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

fn get_turn_tx(tx: &rusqlite::Transaction<'_>, turn_id: &str) -> Result<Option<TeamTurnRecord>> {
    tx.query_row(
        &format!("{TURN_SELECT} WHERE id = ?"),
        params![turn_id],
        row_to_team_turn,
    )
    .optional()
    .map_err(Into::into)
}

fn collect_conversations(
    rows: impl Iterator<Item = rusqlite::Result<TeamConversationRecord>>,
) -> Result<Vec<TeamConversationRecord>> {
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}

fn collect_participants(
    rows: impl Iterator<Item = rusqlite::Result<TeamParticipantRecord>>,
) -> Result<Vec<TeamParticipantRecord>> {
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}

fn collect_turns(
    rows: impl Iterator<Item = rusqlite::Result<TeamTurnRecord>>,
) -> Result<Vec<TeamTurnRecord>> {
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}

fn append_team_event_tx(
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
