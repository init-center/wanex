use crate::rows::row_to_context_epoch;
use crate::{
    ActivateContextEpoch, BeginContextEpoch, ContextEpochMutationIdentity,
    ContextEpochPruneReceipt, ContextEpochRecord, FinishContextEpochGeneration,
    GetActiveContextEpoch, ListContextEpochs, MarkContextEpochOutputObserved, PruneContextEpochs,
    Result, SystemService, SystemServiceError,
};
use rusqlite::{params, OptionalExtension};

const CONTEXT_EPOCH_SELECT: &str = "SELECT
    id, session_id, job_id, state, generation_state, generation_attempt,
    max_provider_attempts, previous_epoch_id, previous_summary_digest,
    source_head_sequence, source_head_message_id, cut_sequence, cut_message_id,
    retained_from_sequence, retained_from_message_id, source_digest,
    policy_json, policy_digest, model_endpoint_json, request_digest,
    summary, summary_digest, usage_json, error_json,
    token_estimate_before, token_estimate_after, token_savings,
    created_at, activated_at, finished_at, updated_at
 FROM context_epoch";

impl SystemService {
    pub fn begin_context_epoch(&self, request: &BeginContextEpoch) -> Result<ContextEpochRecord> {
        validate_begin_context_epoch(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        assert_job_lease_tx(
            &tx,
            &request.job_id,
            &request.worker_id,
            &request.lease_token,
            &request.session_id,
            now,
        )?;
        if let Some(existing) = get_context_epoch_optional_tx(&tx, &request.id)? {
            assert_existing_epoch_matches(&existing, request)?;
            tx.commit()?;
            return Ok(existing);
        }
        assert_expected_active_epoch_tx(
            &tx,
            &request.session_id,
            request.previous_epoch_id.as_deref(),
        )?;
        validate_source_boundaries_tx(&tx, request)?;
        tx.execute(
            "INSERT INTO context_epoch (
                id, session_id, job_id, state, generation_state, generation_attempt,
                max_provider_attempts, previous_epoch_id, previous_summary_digest,
                source_head_sequence, source_head_message_id, cut_sequence, cut_message_id,
                retained_from_sequence, retained_from_message_id, source_digest,
                policy_json, policy_digest, model_endpoint_json, request_digest,
                summary, summary_digest, usage_json, error_json,
                token_estimate_before, token_estimate_after, token_savings,
                created_at, activated_at, finished_at, updated_at
             ) VALUES (
                ?, ?, ?, 'building', 'prepared', 0,
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                NULL, NULL, NULL, NULL, ?, 0, 0, ?, NULL, NULL, ?
             )",
            params![
                request.id,
                request.session_id,
                request.job_id,
                request.max_provider_attempts,
                request.previous_epoch_id,
                request.previous_summary_digest,
                request.source_head_sequence,
                request.source_head_message_id,
                request.cut_sequence,
                request.cut_message_id,
                request.retained_from_sequence,
                request.retained_from_message_id,
                request.source_digest,
                serde_json::to_string(&request.policy)?,
                request.policy_digest,
                serde_json::to_string(&request.model_endpoint)?,
                request.request_digest,
                request.token_estimate_before,
                now,
                now,
            ],
        )?;
        let record = get_context_epoch_tx(&tx, &request.id)?;
        tx.commit()?;
        Ok(record)
    }

    pub fn mark_context_epoch_dispatched(
        &self,
        request: &ContextEpochMutationIdentity,
    ) -> Result<ContextEpochRecord> {
        validate_mutation_identity(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let epoch = get_context_epoch_tx(&tx, &request.epoch_id)?;
        assert_job_lease_tx(
            &tx,
            &request.job_id,
            &request.worker_id,
            &request.lease_token,
            &epoch.session_id,
            now,
        )?;
        assert_epoch_job(&epoch, &request.job_id)?;
        if epoch.state != "building"
            || !matches!(
                epoch.generation_state.as_str(),
                "prepared" | "failed_before_output"
            )
            || epoch.generation_attempt >= epoch.max_provider_attempts
        {
            return Err(SystemServiceError::Invariant(format!(
                "context epoch cannot dispatch from {}/{} at attempt {} of {}",
                epoch.state,
                epoch.generation_state,
                epoch.generation_attempt,
                epoch.max_provider_attempts
            )));
        }
        tx.execute(
            "UPDATE context_epoch
             SET generation_state = 'dispatched', generation_attempt = generation_attempt + 1,
                 error_json = NULL, updated_at = ?
             WHERE id = ?",
            params![now, request.epoch_id],
        )?;
        let record = get_context_epoch_tx(&tx, &request.epoch_id)?;
        tx.commit()?;
        Ok(record)
    }

    pub fn mark_context_epoch_output_observed(
        &self,
        request: &MarkContextEpochOutputObserved,
    ) -> Result<ContextEpochRecord> {
        validate_output_observed(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let epoch = get_context_epoch_tx(&tx, &request.epoch_id)?;
        assert_job_lease_tx(
            &tx,
            &request.job_id,
            &request.worker_id,
            &request.lease_token,
            &epoch.session_id,
            now,
        )?;
        assert_epoch_job(&epoch, &request.job_id)?;
        assert_generation_attempt(&epoch, request.generation_attempt)?;
        match epoch.generation_state.as_str() {
            "output_observed" => {}
            "dispatched" => {
                tx.execute(
                    "UPDATE context_epoch
                     SET generation_state = 'output_observed', updated_at = ?
                     WHERE id = ?",
                    params![now, request.epoch_id],
                )?;
            }
            state => {
                return Err(SystemServiceError::Invariant(format!(
                    "context epoch cannot observe output from generation state: {state}"
                )));
            }
        }
        let record = get_context_epoch_tx(&tx, &request.epoch_id)?;
        tx.commit()?;
        Ok(record)
    }

    pub fn finish_context_epoch_generation(
        &self,
        request: &FinishContextEpochGeneration,
    ) -> Result<ContextEpochRecord> {
        validate_finish_generation(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let epoch = get_context_epoch_tx(&tx, &request.epoch_id)?;
        assert_job_lease_tx(
            &tx,
            &request.job_id,
            &request.worker_id,
            &request.lease_token,
            &epoch.session_id,
            now,
        )?;
        assert_epoch_job(&epoch, &request.job_id)?;
        assert_generation_attempt(&epoch, request.generation_attempt)?;
        if epoch.state != "building" {
            return Err(SystemServiceError::Invariant(
                "only a building context epoch can finish generation".to_string(),
            ));
        }
        match request.outcome.as_str() {
            "succeeded" => {
                if epoch.generation_state != "output_observed" {
                    return Err(SystemServiceError::Invariant(
                        "successful context summary requires observed output".to_string(),
                    ));
                }
                let summary = request.summary.as_deref().unwrap_or_default();
                let digest = request.summary_digest.as_deref().unwrap_or_default();
                if crate::util::hex_sha256(summary.as_bytes()) != digest {
                    return Err(SystemServiceError::Invariant(
                        "context summary digest does not match summary".to_string(),
                    ));
                }
                tx.execute(
                    "UPDATE context_epoch
                     SET generation_state = 'succeeded', summary = ?, summary_digest = ?,
                         usage_json = ?, error_json = NULL,
                         token_estimate_after = ?, token_savings = ?,
                         finished_at = ?, updated_at = ?
                     WHERE id = ?",
                    params![
                        summary,
                        digest,
                        request
                            .usage
                            .as_ref()
                            .map(serde_json::to_string)
                            .transpose()?,
                        request.token_estimate_after,
                        request.token_savings,
                        now,
                        now,
                        request.epoch_id,
                    ],
                )?;
            }
            "failed_before_output" => {
                if epoch.generation_state != "dispatched" {
                    return Err(SystemServiceError::Invariant(
                        "failed-before-output requires a dispatched context summary".to_string(),
                    ));
                }
                let terminal = !request.retryable.unwrap_or(false)
                    || epoch.generation_attempt >= epoch.max_provider_attempts;
                tx.execute(
                    "UPDATE context_epoch
                     SET state = ?, generation_state = 'failed_before_output',
                         error_json = ?, finished_at = ?, updated_at = ?
                     WHERE id = ?",
                    params![
                        if terminal { "failed" } else { "building" },
                        request
                            .error
                            .as_ref()
                            .map(serde_json::to_string)
                            .transpose()?,
                        if terminal { Some(now) } else { None },
                        now,
                        request.epoch_id,
                    ],
                )?;
            }
            "ambiguous" => {
                if !matches!(
                    epoch.generation_state.as_str(),
                    "dispatched" | "output_observed"
                ) {
                    return Err(SystemServiceError::Invariant(
                        "ambiguous context summary requires a dispatched attempt".to_string(),
                    ));
                }
                tx.execute(
                    "UPDATE context_epoch
                     SET state = 'failed', generation_state = 'ambiguous',
                         error_json = ?, finished_at = ?, updated_at = ?
                     WHERE id = ?",
                    params![
                        request
                            .error
                            .as_ref()
                            .map(serde_json::to_string)
                            .transpose()?,
                        now,
                        now,
                        request.epoch_id,
                    ],
                )?;
            }
            _ => unreachable!(),
        }
        let record = get_context_epoch_tx(&tx, &request.epoch_id)?;
        tx.commit()?;
        Ok(record)
    }

    pub fn activate_context_epoch(
        &self,
        request: &ActivateContextEpoch,
    ) -> Result<ContextEpochRecord> {
        validate_activate_context_epoch(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let epoch = get_context_epoch_tx(&tx, &request.epoch_id)?;
        assert_job_lease_tx(
            &tx,
            &request.job_id,
            &request.worker_id,
            &request.lease_token,
            &epoch.session_id,
            now,
        )?;
        assert_epoch_job(&epoch, &request.job_id)?;
        if epoch.state == "active" {
            tx.commit()?;
            return Ok(epoch);
        }
        if epoch.state != "building" || epoch.generation_state != "succeeded" {
            return Err(SystemServiceError::Invariant(
                "context epoch must have a succeeded summary before activation".to_string(),
            ));
        }
        if epoch.previous_epoch_id != request.expected_previous_epoch_id {
            return Err(SystemServiceError::Invariant(
                "context epoch expected previous identity does not match its source".to_string(),
            ));
        }
        assert_expected_active_epoch_tx(
            &tx,
            &epoch.session_id,
            request.expected_previous_epoch_id.as_deref(),
        )?;
        tx.execute(
            "UPDATE context_epoch
             SET state = 'superseded', updated_at = ?
             WHERE session_id = ? AND state = 'active' AND id <> ?",
            params![now, epoch.session_id, epoch.id],
        )?;
        tx.execute(
            "UPDATE context_epoch
             SET state = 'active', activated_at = COALESCE(activated_at, ?), updated_at = ?
             WHERE id = ?",
            params![now, now, epoch.id],
        )?;
        let record = get_context_epoch_tx(&tx, &epoch.id)?;
        tx.commit()?;
        Ok(record)
    }

    pub fn prune_context_epochs(
        &self,
        request: &PruneContextEpochs,
    ) -> Result<ContextEpochPruneReceipt> {
        validate_prune_context_epochs(request)?;
        let dry_run = request.dry_run.unwrap_or(false);
        let keep = request.keep_last_superseded.unwrap_or(0) as usize;
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let mut superseded = list_context_epochs_tx(&tx, &request.session_id, Some("superseded"))?;
        let scanned_count = superseded.len() as i64;
        superseded.sort_by(|left, right| {
            right
                .updated_at
                .cmp(&left.updated_at)
                .then_with(|| right.id.cmp(&left.id))
        });
        let deleted_epoch_ids: Vec<String> = superseded
            .into_iter()
            .enumerate()
            .filter_map(|(index, epoch)| {
                if index < keep {
                    return None;
                }
                if request
                    .older_than_updated_at
                    .is_some_and(|cutoff| epoch.updated_at >= cutoff)
                {
                    return None;
                }
                Some(epoch.id)
            })
            .collect();
        if !dry_run {
            for epoch_id in &deleted_epoch_ids {
                tx.execute(
                    "DELETE FROM context_epoch WHERE id = ? AND state = 'superseded'",
                    params![epoch_id],
                )?;
            }
        }
        tx.commit()?;
        Ok(ContextEpochPruneReceipt {
            session_id: request.session_id.clone(),
            scanned_count,
            deleted_epoch_ids,
            dry_run,
        })
    }

    pub fn list_context_epochs(
        &self,
        request: &ListContextEpochs,
    ) -> Result<Vec<ContextEpochRecord>> {
        if request.session_id.is_empty() {
            return Err(SystemServiceError::Invariant(
                "context epoch session_id must not be empty".to_string(),
            ));
        }
        if let Some(state) = request.state.as_deref() {
            validate_epoch_state(state)?;
        }
        let conn = self.connect()?;
        list_context_epochs_conn(&conn, &request.session_id, request.state.as_deref())
    }

    pub fn get_active_context_epoch(
        &self,
        request: &GetActiveContextEpoch,
    ) -> Result<Option<ContextEpochRecord>> {
        if request.session_id.is_empty() {
            return Err(SystemServiceError::Invariant(
                "active context epoch session_id must not be empty".to_string(),
            ));
        }
        let conn = self.connect()?;
        get_active_context_epoch_conn(&conn, &request.session_id)
    }
}

fn list_context_epochs_conn(
    conn: &rusqlite::Connection,
    session_id: &str,
    state: Option<&str>,
) -> Result<Vec<ContextEpochRecord>> {
    let (sql, state_value) = if let Some(state) = state {
        (
            format!(
                "{CONTEXT_EPOCH_SELECT} WHERE session_id = ? AND state = ?
                 ORDER BY created_at ASC, id ASC"
            ),
            Some(state),
        )
    } else {
        (
            format!(
                "{CONTEXT_EPOCH_SELECT} WHERE session_id = ?
                 ORDER BY created_at ASC, id ASC"
            ),
            None,
        )
    };
    let mut stmt = conn.prepare(&sql)?;
    let rows = if let Some(state) = state_value {
        stmt.query_map(params![session_id, state], row_to_context_epoch)?
    } else {
        stmt.query_map(params![session_id], row_to_context_epoch)?
    };
    collect_context_epochs(rows)
}

fn get_active_context_epoch_conn(
    conn: &rusqlite::Connection,
    session_id: &str,
) -> Result<Option<ContextEpochRecord>> {
    conn.query_row(
        &format!("{CONTEXT_EPOCH_SELECT} WHERE session_id = ? AND state = 'active'"),
        params![session_id],
        row_to_context_epoch,
    )
    .optional()
    .map_err(Into::into)
}

fn validate_begin_context_epoch(request: &BeginContextEpoch) -> Result<()> {
    for (name, value) in [
        ("id", request.id.as_str()),
        ("session_id", request.session_id.as_str()),
        ("job_id", request.job_id.as_str()),
        ("worker_id", request.worker_id.as_str()),
        ("lease_token", request.lease_token.as_str()),
        (
            "source_head_message_id",
            request.source_head_message_id.as_str(),
        ),
        ("cut_message_id", request.cut_message_id.as_str()),
        (
            "retained_from_message_id",
            request.retained_from_message_id.as_str(),
        ),
        ("source_digest", request.source_digest.as_str()),
        ("policy_digest", request.policy_digest.as_str()),
        ("request_digest", request.request_digest.as_str()),
    ] {
        if value.is_empty() {
            return Err(SystemServiceError::Invariant(format!(
                "context epoch {name} must not be empty"
            )));
        }
    }
    for (name, value) in [
        ("source_digest", &request.source_digest),
        ("policy_digest", &request.policy_digest),
        ("request_digest", &request.request_digest),
    ] {
        validate_sha256(value, name)?;
    }
    if request.max_provider_attempts <= 0
        || request.source_head_sequence <= 0
        || request.cut_sequence <= 0
        || request.retained_from_sequence <= request.cut_sequence
        || request.source_head_sequence < request.retained_from_sequence
        || request.token_estimate_before < 0
    {
        return Err(SystemServiceError::Invariant(
            "context epoch numeric source and attempt evidence is invalid".to_string(),
        ));
    }
    match (
        request.previous_epoch_id.as_deref(),
        request.previous_summary_digest.as_deref(),
    ) {
        (None, None) => {}
        (Some(id), Some(digest)) if !id.is_empty() => {
            validate_sha256(digest, "previous_summary_digest")?
        }
        _ => {
            return Err(SystemServiceError::Invariant(
                "previous context epoch id and summary digest must appear together".to_string(),
            ));
        }
    }
    Ok(())
}

fn validate_mutation_identity(request: &ContextEpochMutationIdentity) -> Result<()> {
    if request.epoch_id.is_empty()
        || request.job_id.is_empty()
        || request.worker_id.is_empty()
        || request.lease_token.is_empty()
    {
        return Err(SystemServiceError::Invariant(
            "context epoch mutation identity must not be empty".to_string(),
        ));
    }
    Ok(())
}

fn validate_output_observed(request: &MarkContextEpochOutputObserved) -> Result<()> {
    validate_mutation_identity(&ContextEpochMutationIdentity {
        epoch_id: request.epoch_id.clone(),
        job_id: request.job_id.clone(),
        worker_id: request.worker_id.clone(),
        lease_token: request.lease_token.clone(),
    })?;
    if request.generation_attempt <= 0 {
        return Err(SystemServiceError::Invariant(
            "context epoch generation attempt must be positive".to_string(),
        ));
    }
    Ok(())
}

fn validate_finish_generation(request: &FinishContextEpochGeneration) -> Result<()> {
    validate_output_observed(&MarkContextEpochOutputObserved {
        epoch_id: request.epoch_id.clone(),
        job_id: request.job_id.clone(),
        worker_id: request.worker_id.clone(),
        lease_token: request.lease_token.clone(),
        generation_attempt: request.generation_attempt,
    })?;
    if !matches!(
        request.outcome.as_str(),
        "succeeded" | "failed_before_output" | "ambiguous"
    ) {
        return Err(SystemServiceError::Invariant(
            "invalid context epoch generation outcome".to_string(),
        ));
    }
    if request.outcome == "succeeded" {
        if request.retryable.is_some() {
            return Err(SystemServiceError::Invariant(
                "successful context summary must not carry retryability".to_string(),
            ));
        }
        if request
            .summary
            .as_deref()
            .unwrap_or_default()
            .trim()
            .is_empty()
            || request
                .summary_digest
                .as_deref()
                .unwrap_or_default()
                .is_empty()
            || request.token_estimate_after.is_none()
            || request.token_savings.is_none()
            || request.token_estimate_after.is_some_and(|value| value < 0)
            || request.token_savings.is_some_and(|value| value < 0)
        {
            return Err(SystemServiceError::Invariant(
                "successful context summary evidence is incomplete".to_string(),
            ));
        }
    } else if request.summary.is_some()
        || request.summary_digest.is_some()
        || request.token_estimate_after.is_some()
        || request.token_savings.is_some()
    {
        return Err(SystemServiceError::Invariant(
            "failed context summary must not carry successful output evidence".to_string(),
        ));
    }
    if request.outcome == "failed_before_output" && request.retryable.is_none() {
        return Err(SystemServiceError::Invariant(
            "failed-before-output context summary requires retryability".to_string(),
        ));
    }
    if request.outcome == "ambiguous" && request.retryable.is_some() {
        return Err(SystemServiceError::Invariant(
            "ambiguous context summary must not carry retryability".to_string(),
        ));
    }
    Ok(())
}

fn validate_activate_context_epoch(request: &ActivateContextEpoch) -> Result<()> {
    validate_mutation_identity(&ContextEpochMutationIdentity {
        epoch_id: request.epoch_id.clone(),
        job_id: request.job_id.clone(),
        worker_id: request.worker_id.clone(),
        lease_token: request.lease_token.clone(),
    })
}

fn validate_prune_context_epochs(request: &PruneContextEpochs) -> Result<()> {
    if request.session_id.is_empty() || request.keep_last_superseded.unwrap_or(0) < 0 {
        return Err(SystemServiceError::Invariant(
            "context epoch prune request is invalid".to_string(),
        ));
    }
    Ok(())
}

fn validate_epoch_state(state: &str) -> Result<()> {
    if matches!(state, "building" | "active" | "superseded" | "failed") {
        Ok(())
    } else {
        Err(SystemServiceError::Invariant(format!(
            "invalid context epoch state: {state}"
        )))
    }
}

fn validate_sha256(value: &str, name: &str) -> Result<()> {
    if value.len() != 64 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(SystemServiceError::Invariant(format!(
            "context epoch {name} must be a sha256 digest"
        )));
    }
    Ok(())
}

fn assert_job_lease_tx(
    tx: &rusqlite::Transaction<'_>,
    job_id: &str,
    worker_id: &str,
    lease_token: &str,
    session_id: &str,
    now: i64,
) -> Result<()> {
    let job = tx
        .query_row(
            "SELECT kind, payload_json FROM scheduler_job
         WHERE id = ? AND state = 'running' AND lease_owner = ?
           AND lease_token = ? AND lease_expires_at > ?",
            params![job_id, worker_id, lease_token, now],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()?;
    let Some((kind, payload_json)) = job else {
        return Err(SystemServiceError::Invariant(
            "context epoch mutation lost its scheduler job lease".to_string(),
        ));
    };
    let payload: serde_json::Value = serde_json::from_str(&payload_json)?;
    let bound_session_id = match kind.as_str() {
        "session.turn" => payload.get("sessionId").and_then(serde_json::Value::as_str),
        "memory.compaction" => payload
            .get("evidence")
            .and_then(|evidence| evidence.get("sessionId"))
            .and_then(serde_json::Value::as_str),
        _ => None,
    };
    if bound_session_id != Some(session_id) {
        return Err(SystemServiceError::Invariant(
            "context epoch mutation job is not authorized for its session".to_string(),
        ));
    }
    Ok(())
}

fn validate_source_boundaries_tx(
    tx: &rusqlite::Transaction<'_>,
    request: &BeginContextEpoch,
) -> Result<()> {
    for (message_id, sequence, label) in [
        (
            request.source_head_message_id.as_str(),
            request.source_head_sequence,
            "source head",
        ),
        (request.cut_message_id.as_str(), request.cut_sequence, "cut"),
        (
            request.retained_from_message_id.as_str(),
            request.retained_from_sequence,
            "retained head",
        ),
    ] {
        let found = tx
            .query_row(
                "SELECT sequence FROM session_message WHERE id = ? AND session_id = ?",
                params![message_id, request.session_id],
                |row| row.get::<_, i64>(0),
            )
            .optional()?;
        if found != Some(sequence) {
            return Err(SystemServiceError::Invariant(format!(
                "context epoch {label} message evidence does not match canonical history"
            )));
        }
    }
    let next = tx
        .query_row(
            "SELECT sequence, id FROM session_message
             WHERE session_id = ? AND sequence > ? ORDER BY sequence ASC LIMIT 1",
            params![request.session_id, request.cut_sequence],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()?;
    if next
        != Some((
            request.retained_from_sequence,
            request.retained_from_message_id.clone(),
        ))
    {
        return Err(SystemServiceError::Invariant(
            "context epoch retained head is not the first message after its cut".to_string(),
        ));
    }
    let cut_turn_state: String = tx.query_row(
        "SELECT turn.state FROM session_turn turn
         JOIN session_message message ON message.turn_id = turn.id
         WHERE message.id = ? AND turn.session_id = ?",
        params![request.cut_message_id, request.session_id],
        |row| row.get(0),
    )?;
    if !matches!(
        cut_turn_state.as_str(),
        "succeeded" | "failed" | "cancelled" | "interrupted"
    ) {
        return Err(SystemServiceError::Invariant(
            "context epoch cut must end a terminal turn".to_string(),
        ));
    }
    let later_same_turn: i64 = tx.query_row(
        "SELECT COUNT(*) FROM session_message later
         WHERE later.turn_id = (SELECT turn_id FROM session_message WHERE id = ?)
           AND later.sequence > ?",
        params![request.cut_message_id, request.cut_sequence],
        |row| row.get(0),
    )?;
    if later_same_turn != 0 {
        return Err(SystemServiceError::Invariant(
            "context epoch cut splits a canonical turn".to_string(),
        ));
    }
    Ok(())
}

fn assert_expected_active_epoch_tx(
    tx: &rusqlite::Transaction<'_>,
    session_id: &str,
    expected: Option<&str>,
) -> Result<()> {
    if let Some(epoch_id) = expected {
        let previous = get_context_epoch_tx(tx, epoch_id)?;
        if previous.session_id != session_id {
            return Err(SystemServiceError::Invariant(
                "previous context epoch belongs to another session".to_string(),
            ));
        }
    }
    let active = get_active_context_epoch_conn(tx, session_id)?;
    if active.as_ref().map(|epoch| epoch.id.as_str()) != expected {
        return Err(SystemServiceError::Invariant(
            "active context epoch changed before mutation".to_string(),
        ));
    }
    Ok(())
}

fn assert_existing_epoch_matches(
    existing: &ContextEpochRecord,
    request: &BeginContextEpoch,
) -> Result<()> {
    let matches = existing.session_id == request.session_id
        && existing.job_id == request.job_id
        && existing.max_provider_attempts == request.max_provider_attempts
        && existing.previous_epoch_id == request.previous_epoch_id
        && existing.previous_summary_digest == request.previous_summary_digest
        && existing.source_head_sequence == request.source_head_sequence
        && existing.source_head_message_id == request.source_head_message_id
        && existing.cut_sequence == request.cut_sequence
        && existing.cut_message_id == request.cut_message_id
        && existing.retained_from_sequence == request.retained_from_sequence
        && existing.retained_from_message_id == request.retained_from_message_id
        && existing.source_digest == request.source_digest
        && existing.policy == request.policy
        && existing.policy_digest == request.policy_digest
        && existing.model_endpoint == request.model_endpoint
        && existing.request_digest == request.request_digest
        && existing.token_estimate_before == request.token_estimate_before;
    if !matches {
        return Err(SystemServiceError::Invariant(
            "context epoch id already has different immutable evidence".to_string(),
        ));
    }
    Ok(())
}

fn assert_epoch_job(epoch: &ContextEpochRecord, job_id: &str) -> Result<()> {
    if epoch.job_id != job_id {
        return Err(SystemServiceError::Invariant(
            "context epoch belongs to another scheduler job".to_string(),
        ));
    }
    Ok(())
}

fn assert_generation_attempt(epoch: &ContextEpochRecord, attempt: i64) -> Result<()> {
    if epoch.generation_attempt != attempt {
        return Err(SystemServiceError::Invariant(
            "context epoch generation attempt is stale".to_string(),
        ));
    }
    Ok(())
}

fn get_context_epoch_tx(
    tx: &rusqlite::Transaction<'_>,
    epoch_id: &str,
) -> Result<ContextEpochRecord> {
    tx.query_row(
        &format!("{CONTEXT_EPOCH_SELECT} WHERE id = ?"),
        params![epoch_id],
        row_to_context_epoch,
    )
    .map_err(Into::into)
}

fn get_context_epoch_optional_tx(
    tx: &rusqlite::Transaction<'_>,
    epoch_id: &str,
) -> Result<Option<ContextEpochRecord>> {
    tx.query_row(
        &format!("{CONTEXT_EPOCH_SELECT} WHERE id = ?"),
        params![epoch_id],
        row_to_context_epoch,
    )
    .optional()
    .map_err(Into::into)
}

fn list_context_epochs_tx(
    tx: &rusqlite::Transaction<'_>,
    session_id: &str,
    state: Option<&str>,
) -> Result<Vec<ContextEpochRecord>> {
    list_context_epochs_conn(tx, session_id, state)
}

fn collect_context_epochs(
    rows: impl Iterator<Item = rusqlite::Result<ContextEpochRecord>>,
) -> Result<Vec<ContextEpochRecord>> {
    let mut epochs = Vec::new();
    for row in rows {
        epochs.push(row?);
    }
    Ok(epochs)
}
