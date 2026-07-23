use crate::rows::{row_to_context_epoch, row_to_context_replacement};
use crate::{
    ActivateContextEpoch, CloneContextEpoch, ContextEpochPruneReceipt, ContextEpochRecord,
    ContextReplacementRecord, GetActiveContextEpoch, ListContextEpochs, ListContextReplacements,
    PruneContextEpochs, PutContextEpoch, PutContextReplacement, Result, SystemService,
    SystemServiceError,
};
use rusqlite::{params, OptionalExtension};
use serde_json::json;
use uuid::Uuid;

const CONTEXT_EPOCH_SELECT: &str = "SELECT
    id, session_id, policy_version, state,
    token_estimate_before, token_estimate_after, token_savings, replacement_count,
    metadata_json, created_at, activated_at, updated_at
 FROM context_epoch";

const CONTEXT_REPLACEMENT_SELECT: &str = "SELECT
    id, epoch_id, session_id, policy_version, message_id, part_id, tier,
    original_token_estimate, replacement_token_estimate,
    replacement_json, metadata_json, created_at, updated_at
 FROM context_replacement";

impl SystemService {
    pub fn put_context_epoch(&self, request: &PutContextEpoch) -> Result<ContextEpochRecord> {
        validate_put_context_epoch(request)?;
        let now = crate::util::now_ms();
        let id = request
            .id
            .clone()
            .unwrap_or_else(|| format!("ctxepoch_{}", Uuid::now_v7()));
        let metadata_json = request
            .metadata
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        if let Some(existing) = get_context_epoch_optional_tx(&tx, &id)? {
            if existing.session_id != request.session_id
                || existing.policy_version != request.policy_version
            {
                return Err(SystemServiceError::Invariant(
                    "context epoch id already belongs to a different session or policy".to_string(),
                ));
            }
            if existing.state != "building" {
                return Err(SystemServiceError::Invariant(format!(
                    "context epoch cannot be updated after leaving building state: {}",
                    existing.state
                )));
            }
        }
        tx.execute(
            "INSERT INTO context_epoch (
                id, session_id, policy_version, state,
                token_estimate_before, token_estimate_after, token_savings, replacement_count,
                metadata_json, created_at, activated_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
                token_estimate_before = excluded.token_estimate_before,
                token_estimate_after = excluded.token_estimate_after,
                token_savings = excluded.token_savings,
                replacement_count = excluded.replacement_count,
                metadata_json = excluded.metadata_json,
                updated_at = excluded.updated_at",
            params![
                id,
                request.session_id,
                request.policy_version,
                "building",
                request.token_estimate_before.unwrap_or(0),
                request.token_estimate_after.unwrap_or(0),
                request.token_savings.unwrap_or(0),
                request.replacement_count.unwrap_or(0),
                metadata_json,
                now,
                None::<i64>,
                now,
            ],
        )?;
        let record = get_context_epoch_tx(&tx, &id)?;
        tx.commit()?;
        Ok(record)
    }

    pub fn activate_context_epoch(
        &self,
        request: &ActivateContextEpoch,
    ) -> Result<ContextEpochRecord> {
        if request.epoch_id.is_empty() {
            return Err(SystemServiceError::Invariant(
                "context epoch id must not be empty".to_string(),
            ));
        }
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let epoch = get_context_epoch_tx(&tx, &request.epoch_id)?;
        match epoch.state.as_str() {
            "building" | "active" => {}
            "superseded" => {
                return Err(SystemServiceError::Invariant(
                    "superseded context epoch cannot be reactivated".to_string(),
                ));
            }
            state => {
                return Err(SystemServiceError::Invariant(format!(
                    "invalid context epoch state: {state}"
                )));
            }
        }
        tx.execute(
            "UPDATE context_epoch
             SET state = 'superseded', updated_at = ?
             WHERE session_id = ? AND policy_version = ? AND state = 'active' AND id <> ?",
            params![now, epoch.session_id, epoch.policy_version, epoch.id],
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

    pub fn clone_context_epoch(&self, request: &CloneContextEpoch) -> Result<ContextEpochRecord> {
        validate_clone_context_epoch(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let source = get_context_epoch_tx(&tx, &request.source_epoch_id)?;
        if source.state == "building" {
            return Err(SystemServiceError::Invariant(
                "building context epoch cannot be cloned for recovery".to_string(),
            ));
        }
        let id = request
            .id
            .clone()
            .unwrap_or_else(|| format!("ctxepoch_clone_{}", Uuid::now_v7()));
        if get_context_epoch_optional_tx(&tx, &id)?.is_some() {
            return Err(SystemServiceError::Invariant(
                "target context epoch already exists".to_string(),
            ));
        }
        let metadata = request
            .metadata
            .clone()
            .unwrap_or_else(|| json!({ "cloned_from_epoch_id": source.id }));
        let metadata_json = serde_json::to_string(&metadata)?;
        tx.execute(
            "INSERT INTO context_epoch (
                id, session_id, policy_version, state,
                token_estimate_before, token_estimate_after, token_savings, replacement_count,
                metadata_json, created_at, activated_at, updated_at
             ) VALUES (?, ?, ?, 'building', ?, ?, ?, ?, ?, ?, NULL, ?)",
            params![
                id,
                source.session_id,
                source.policy_version,
                source.token_estimate_before,
                source.token_estimate_after,
                source.token_savings,
                source.replacement_count,
                metadata_json,
                now,
                now,
            ],
        )?;

        let source_replacements = list_context_replacements_tx(
            &tx,
            &source.session_id,
            Some(&source.policy_version),
            Some(&source.id),
        )?;
        for replacement in source_replacements {
            let replacement_json = serde_json::to_string(&replacement.replacement)?;
            let metadata_json = replacement
                .metadata
                .as_ref()
                .map(serde_json::to_string)
                .transpose()?;
            tx.execute(
                "INSERT INTO context_replacement (
                    id, epoch_id, session_id, policy_version, message_id, part_id, tier,
                    original_token_estimate, replacement_token_estimate,
                    replacement_json, metadata_json, created_at, updated_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                params![
                    cloned_replacement_id(&id, &replacement.id),
                    id,
                    source.session_id,
                    source.policy_version,
                    replacement.message_id,
                    replacement.part_id,
                    replacement.tier,
                    replacement.original_token_estimate,
                    replacement.replacement_token_estimate,
                    replacement_json,
                    metadata_json,
                    now,
                    now,
                ],
            )?;
        }

        let record = get_context_epoch_tx(&tx, &id)?;
        tx.commit()?;
        Ok(record)
    }

    pub fn prune_context_epochs(
        &self,
        request: &PruneContextEpochs,
    ) -> Result<ContextEpochPruneReceipt> {
        validate_prune_context_epochs(request)?;
        let dry_run = request.dry_run.unwrap_or(false);
        let keep_last_superseded = request.keep_last_superseded.unwrap_or(0) as usize;
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let superseded = list_context_epochs_tx(
            &tx,
            &request.session_id,
            Some(&request.policy_version),
            Some("superseded"),
        )?;
        let scanned_count = superseded.len() as i64;
        let mut ordered = superseded;
        ordered.sort_by(|left, right| {
            right
                .updated_at
                .cmp(&left.updated_at)
                .then_with(|| right.id.cmp(&left.id))
        });
        let deleted_epoch_ids: Vec<String> = ordered
            .into_iter()
            .enumerate()
            .filter_map(|(index, epoch)| {
                if index < keep_last_superseded {
                    return None;
                }
                if let Some(cutoff) = request.older_than_updated_at {
                    if epoch.updated_at >= cutoff {
                        return None;
                    }
                }
                Some(epoch.id)
            })
            .collect();

        let mut deleted_replacement_count = 0;
        for epoch_id in &deleted_epoch_ids {
            let count = if dry_run {
                tx.query_row(
                    "SELECT COUNT(*) FROM context_replacement WHERE epoch_id = ?",
                    params![epoch_id],
                    |row| row.get::<_, i64>(0),
                )? as usize
            } else {
                tx.execute(
                    "DELETE FROM context_replacement WHERE epoch_id = ?",
                    params![epoch_id],
                )?
            };
            deleted_replacement_count += count as i64;
        }
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
            policy_version: request.policy_version.clone(),
            scanned_count,
            deleted_epoch_ids,
            deleted_replacement_count,
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
        let conn = self.connect()?;
        list_context_epochs_conn(
            &conn,
            &request.session_id,
            request.policy_version.as_deref(),
            request.state.as_deref(),
        )
    }

    pub fn get_active_context_epoch(
        &self,
        request: &GetActiveContextEpoch,
    ) -> Result<Option<ContextEpochRecord>> {
        if request.session_id.is_empty() || request.policy_version.is_empty() {
            return Err(SystemServiceError::Invariant(
                "active context epoch session_id and policy_version must not be empty".to_string(),
            ));
        }
        let conn = self.connect()?;
        conn.query_row(
            &format!(
                "{CONTEXT_EPOCH_SELECT}
                 WHERE session_id = ? AND policy_version = ? AND state = 'active'"
            ),
            params![request.session_id, request.policy_version],
            row_to_context_epoch,
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn put_context_replacement(
        &self,
        request: &PutContextReplacement,
    ) -> Result<ContextReplacementRecord> {
        validate_put_context_replacement(request)?;
        let now = crate::util::now_ms();
        let id = request
            .id
            .clone()
            .unwrap_or_else(|| format!("ctxrep_{}", Uuid::now_v7()));
        let replacement_json = serde_json::to_string(&request.replacement)?;
        let metadata_json = request
            .metadata
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let epoch = get_context_epoch_tx(&tx, &request.epoch_id)?;
        if epoch.session_id != request.session_id || epoch.policy_version != request.policy_version
        {
            return Err(SystemServiceError::Invariant(
                "context replacement epoch does not match session or policy".to_string(),
            ));
        }
        if epoch.state != "building" {
            return Err(SystemServiceError::Invariant(format!(
                "context replacement can only be written to a building epoch: {}",
                epoch.state
            )));
        }
        tx.execute(
            "INSERT INTO context_replacement (
                id, epoch_id, session_id, policy_version, message_id, part_id, tier,
                original_token_estimate, replacement_token_estimate,
                replacement_json, metadata_json, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(epoch_id, part_id) DO UPDATE SET
                session_id = excluded.session_id,
                policy_version = excluded.policy_version,
                message_id = excluded.message_id,
                tier = excluded.tier,
                original_token_estimate = excluded.original_token_estimate,
                replacement_token_estimate = excluded.replacement_token_estimate,
                replacement_json = excluded.replacement_json,
                metadata_json = excluded.metadata_json,
                updated_at = excluded.updated_at",
            params![
                id,
                request.epoch_id,
                request.session_id,
                request.policy_version,
                request.message_id,
                request.part_id,
                request.tier,
                request.original_token_estimate,
                request.replacement_token_estimate,
                replacement_json,
                metadata_json,
                now,
                now,
            ],
        )?;
        let record = get_context_replacement_tx(&tx, &request.epoch_id, &request.part_id)?;
        tx.commit()?;
        Ok(record)
    }

    pub fn list_context_replacements(
        &self,
        request: &ListContextReplacements,
    ) -> Result<Vec<ContextReplacementRecord>> {
        if request.session_id.is_empty() {
            return Err(SystemServiceError::Invariant(
                "context replacement session_id must not be empty".to_string(),
            ));
        }
        let conn = self.connect()?;
        list_context_replacements_conn(
            &conn,
            &request.session_id,
            request.policy_version.as_deref(),
            request.epoch_id.as_deref(),
        )
    }
}

fn list_context_epochs_conn(
    conn: &rusqlite::Connection,
    session_id: &str,
    policy_version: Option<&str>,
    state: Option<&str>,
) -> Result<Vec<ContextEpochRecord>> {
    match (policy_version, state) {
        (Some(policy_version), Some(state)) => {
            let mut stmt = conn.prepare(&format!(
                "{CONTEXT_EPOCH_SELECT}
                 WHERE session_id = ? AND policy_version = ? AND state = ?
                 ORDER BY updated_at ASC, id ASC"
            ))?;
            let rows = stmt.query_map(
                params![session_id, policy_version, state],
                row_to_context_epoch,
            )?;
            collect_context_epochs(rows)
        }
        (Some(policy_version), None) => {
            let mut stmt = conn.prepare(&format!(
                "{CONTEXT_EPOCH_SELECT}
                 WHERE session_id = ? AND policy_version = ?
                 ORDER BY updated_at ASC, id ASC"
            ))?;
            let rows = stmt.query_map(params![session_id, policy_version], row_to_context_epoch)?;
            collect_context_epochs(rows)
        }
        (None, Some(state)) => {
            let mut stmt = conn.prepare(&format!(
                "{CONTEXT_EPOCH_SELECT}
                 WHERE session_id = ? AND state = ?
                 ORDER BY updated_at ASC, id ASC"
            ))?;
            let rows = stmt.query_map(params![session_id, state], row_to_context_epoch)?;
            collect_context_epochs(rows)
        }
        (None, None) => {
            let mut stmt = conn.prepare(&format!(
                "{CONTEXT_EPOCH_SELECT}
                 WHERE session_id = ?
                 ORDER BY updated_at ASC, id ASC"
            ))?;
            let rows = stmt.query_map(params![session_id], row_to_context_epoch)?;
            collect_context_epochs(rows)
        }
    }
}

fn list_context_replacements_conn(
    conn: &rusqlite::Connection,
    session_id: &str,
    policy_version: Option<&str>,
    epoch_id: Option<&str>,
) -> Result<Vec<ContextReplacementRecord>> {
    match (policy_version, epoch_id) {
        (Some(policy_version), Some(epoch_id)) => {
            let mut stmt = conn.prepare(&format!(
                "{CONTEXT_REPLACEMENT_SELECT}
                 WHERE session_id = ? AND policy_version = ? AND epoch_id = ?
                 ORDER BY created_at ASC, id ASC"
            ))?;
            let rows = stmt.query_map(
                params![session_id, policy_version, epoch_id],
                row_to_context_replacement,
            )?;
            collect_context_replacements(rows)
        }
        (Some(policy_version), None) => {
            let mut stmt = conn.prepare(&format!(
                "{CONTEXT_REPLACEMENT_SELECT}
                 WHERE session_id = ? AND policy_version = ?
                 ORDER BY created_at ASC, id ASC"
            ))?;
            let rows = stmt.query_map(
                params![session_id, policy_version],
                row_to_context_replacement,
            )?;
            collect_context_replacements(rows)
        }
        (None, Some(epoch_id)) => {
            let mut stmt = conn.prepare(&format!(
                "{CONTEXT_REPLACEMENT_SELECT}
                 WHERE session_id = ? AND epoch_id = ?
                 ORDER BY created_at ASC, id ASC"
            ))?;
            let rows = stmt.query_map(params![session_id, epoch_id], row_to_context_replacement)?;
            collect_context_replacements(rows)
        }
        (None, None) => {
            let mut stmt = conn.prepare(&format!(
                "{CONTEXT_REPLACEMENT_SELECT}
                 WHERE session_id = ?
                 ORDER BY created_at ASC, id ASC"
            ))?;
            let rows = stmt.query_map(params![session_id], row_to_context_replacement)?;
            collect_context_replacements(rows)
        }
    }
}

fn validate_put_context_epoch(request: &PutContextEpoch) -> Result<()> {
    if request.session_id.is_empty() {
        return Err(SystemServiceError::Invariant(
            "context epoch session_id must not be empty".to_string(),
        ));
    }
    if request.policy_version.is_empty() {
        return Err(SystemServiceError::Invariant(
            "context epoch policy_version must not be empty".to_string(),
        ));
    }
    if let Some(state) = &request.state {
        validate_epoch_state(state)?;
        if state != "building" {
            return Err(SystemServiceError::Invariant(
                "put_context_epoch only accepts building state; use activate_context_epoch for activation"
                    .to_string(),
            ));
        }
    }
    if request.id.as_deref() == Some("") {
        return Err(SystemServiceError::Invariant(
            "context epoch id must not be empty".to_string(),
        ));
    }
    for (name, value) in [
        ("token_estimate_before", request.token_estimate_before),
        ("token_estimate_after", request.token_estimate_after),
        ("token_savings", request.token_savings),
        ("replacement_count", request.replacement_count),
    ] {
        if value.unwrap_or(0) < 0 {
            return Err(SystemServiceError::Invariant(format!(
                "context epoch {name} must be non-negative"
            )));
        }
    }
    Ok(())
}

fn validate_clone_context_epoch(request: &CloneContextEpoch) -> Result<()> {
    if request.source_epoch_id.is_empty() {
        return Err(SystemServiceError::Invariant(
            "source context epoch id must not be empty".to_string(),
        ));
    }
    if request.id.as_deref() == Some("") {
        return Err(SystemServiceError::Invariant(
            "target context epoch id must not be empty".to_string(),
        ));
    }
    Ok(())
}

fn validate_prune_context_epochs(request: &PruneContextEpochs) -> Result<()> {
    if request.session_id.is_empty() || request.policy_version.is_empty() {
        return Err(SystemServiceError::Invariant(
            "context epoch prune session_id and policy_version must not be empty".to_string(),
        ));
    }
    if request.keep_last_superseded.unwrap_or(0) < 0 {
        return Err(SystemServiceError::Invariant(
            "context epoch prune keep_last_superseded must be non-negative".to_string(),
        ));
    }
    Ok(())
}

fn validate_epoch_state(state: &str) -> Result<()> {
    match state {
        "building" | "active" | "superseded" => Ok(()),
        _ => Err(SystemServiceError::Invariant(format!(
            "invalid context epoch state: {state}"
        ))),
    }
}

fn validate_put_context_replacement(request: &PutContextReplacement) -> Result<()> {
    if request.epoch_id.is_empty() {
        return Err(SystemServiceError::Invariant(
            "context replacement epoch_id must not be empty".to_string(),
        ));
    }
    if request.session_id.is_empty() {
        return Err(SystemServiceError::Invariant(
            "context replacement session_id must not be empty".to_string(),
        ));
    }
    if request.policy_version.is_empty() {
        return Err(SystemServiceError::Invariant(
            "context replacement policy_version must not be empty".to_string(),
        ));
    }
    if request.part_id.is_empty() {
        return Err(SystemServiceError::Invariant(
            "context replacement part_id must not be empty".to_string(),
        ));
    }
    if request.tier.is_empty() {
        return Err(SystemServiceError::Invariant(
            "context replacement tier must not be empty".to_string(),
        ));
    }
    if request.original_token_estimate < 0 || request.replacement_token_estimate < 0 {
        return Err(SystemServiceError::Invariant(
            "context replacement token estimates must be non-negative".to_string(),
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

fn list_context_epochs_tx(
    tx: &rusqlite::Transaction<'_>,
    session_id: &str,
    policy_version: Option<&str>,
    state: Option<&str>,
) -> Result<Vec<ContextEpochRecord>> {
    list_context_epochs_conn(tx, session_id, policy_version, state)
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

fn list_context_replacements_tx(
    tx: &rusqlite::Transaction<'_>,
    session_id: &str,
    policy_version: Option<&str>,
    epoch_id: Option<&str>,
) -> Result<Vec<ContextReplacementRecord>> {
    list_context_replacements_conn(tx, session_id, policy_version, epoch_id)
}

fn get_context_replacement_tx(
    tx: &rusqlite::Transaction<'_>,
    epoch_id: &str,
    part_id: &str,
) -> Result<ContextReplacementRecord> {
    tx.query_row(
        &format!("{CONTEXT_REPLACEMENT_SELECT} WHERE epoch_id = ? AND part_id = ?"),
        params![epoch_id, part_id],
        row_to_context_replacement,
    )
    .map_err(Into::into)
}

fn cloned_replacement_id(target_epoch_id: &str, source_replacement_id: &str) -> String {
    let hash =
        crate::util::hex_sha256(format!("{target_epoch_id}:{source_replacement_id}").as_bytes());
    format!("ctxrep_clone_{}", &hash[..16])
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

fn collect_context_replacements(
    rows: impl Iterator<Item = rusqlite::Result<ContextReplacementRecord>>,
) -> Result<Vec<ContextReplacementRecord>> {
    let mut replacements = Vec::new();
    for row in rows {
        replacements.push(row?);
    }
    Ok(replacements)
}
