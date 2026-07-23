use crate::event_store::append_event_tx;
use crate::rows::{
    row_to_workspace_change_operation, row_to_workspace_change_proposal,
    row_to_workspace_change_proposal_operation, row_to_workspace_changeset,
};
use crate::{
    EventScope, ListWorkspaceChangeOperations, ListWorkspaceChangeProposalOperations,
    ListWorkspaceChangeProposals, ListWorkspaceChangeSets, PutWorkspaceChangeProposal,
    PutWorkspaceChangeSet, RecordWorkspaceChangeOperation, RecordWorkspaceChangeProposalOperation,
    Result, SystemService, SystemServiceError, WorkspaceChangeOperationRecord,
    WorkspaceChangeProposalOperationRecord, WorkspaceChangeProposalRecord,
    WorkspaceChangeSetRecord,
};
use rusqlite::{params, params_from_iter, OptionalExtension, ToSql};
use serde_json::Value;
use uuid::Uuid;

const WORKSPACE_CHANGESET_SELECT: &str = "SELECT
    id, workspace_id, principal_id, title, base_revision,
    changeset_json, current_state, created_at, updated_at
 FROM workspace_changeset";

const WORKSPACE_CHANGE_OPERATION_SELECT: &str = "SELECT
    id, changeset_id, operation, status, receipt_json, created_at
 FROM workspace_change_operation";

const WORKSPACE_CHANGE_PROPOSAL_SELECT: &str = "SELECT
    id, workspace_id, changeset_id, principal_id, title, summary, state,
    metadata_json, created_at, updated_at, closed_at
 FROM workspace_change_proposal";

const WORKSPACE_CHANGE_PROPOSAL_OPERATION_SELECT: &str = "SELECT
    id, proposal_id, operation, actor_id, from_state, to_state,
    reason, metadata_json, created_at
 FROM workspace_change_proposal_operation";

impl SystemService {
    pub fn put_workspace_changeset(
        &self,
        request: &PutWorkspaceChangeSet,
    ) -> Result<WorkspaceChangeSetRecord> {
        validate_put_workspace_changeset(request)?;
        let id = string_field(&request.changeset, "id", "workspace changeset id")?;
        let title =
            optional_string_field(&request.changeset, "title", "workspace changeset title")?;
        let base_revision = optional_string_field(
            &request.changeset,
            "baseRevision",
            "workspace changeset baseRevision",
        )?;
        let changeset_json = serde_json::to_string(&request.changeset)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;

        let existing = get_workspace_changeset_tx(&tx, id)?
            .map(|record| {
                let existing_json = serde_json::to_string(&record.changeset)?;
                if existing_json != changeset_json
                    || record.workspace_id != request.workspace_id
                    || record.principal_id != request.principal_id
                {
                    return Err(SystemServiceError::Invariant(format!(
                        "workspace changeset id already exists with different content: {id}"
                    )));
                }
                Ok(record)
            })
            .transpose()?;

        if let Some(record) = existing {
            tx.commit()?;
            return Ok(record);
        }

        tx.execute(
            "INSERT INTO workspace_changeset (
                id, workspace_id, principal_id, title, base_revision,
                changeset_json, current_state, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, 'submitted', ?, ?)",
            params![
                id,
                request.workspace_id,
                request.principal_id,
                title,
                base_revision,
                changeset_json,
                now,
                now,
            ],
        )?;
        append_event_tx(
            &tx,
            &format!("evt_{}", Uuid::now_v7()),
            "workspace.changeset.submitted",
            &EventScope::default(),
            &serde_json::json!({
                "changeSetId": id,
                "workspaceId": request.workspace_id,
                "principalId": request.principal_id,
                "changeCount": request
                    .changeset
                    .get("changes")
                    .and_then(Value::as_array)
                    .map_or(0, Vec::len),
                "updatedAt": now
            }),
            now,
        )?;
        let record = get_workspace_changeset_tx(&tx, id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!("workspace changeset insert missing: {id}"))
        })?;
        tx.commit()?;
        Ok(record)
    }

    pub fn get_workspace_changeset(
        &self,
        changeset_id: &str,
    ) -> Result<Option<WorkspaceChangeSetRecord>> {
        if changeset_id.is_empty() {
            return Err(SystemServiceError::Invariant(
                "workspace changeset id must not be empty".to_string(),
            ));
        }
        let conn = self.connect()?;
        conn.query_row(
            &format!("{WORKSPACE_CHANGESET_SELECT} WHERE id = ?"),
            params![changeset_id],
            row_to_workspace_changeset,
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn list_workspace_changesets(
        &self,
        request: &ListWorkspaceChangeSets,
    ) -> Result<Vec<WorkspaceChangeSetRecord>> {
        let limit = request.limit.unwrap_or(100).clamp(1, 1000);
        let conn = self.connect()?;
        match (&request.workspace_id, &request.state) {
            (Some(workspace_id), Some(state)) => {
                let mut stmt = conn.prepare(&format!(
                    "{WORKSPACE_CHANGESET_SELECT}
                     WHERE workspace_id = ? AND current_state = ?
                     ORDER BY updated_at DESC, id ASC
                     LIMIT ?"
                ))?;
                let records = collect_changesets(stmt.query_map(
                    params![workspace_id, state, limit],
                    row_to_workspace_changeset,
                )?)?;
                Ok(records)
            }
            (Some(workspace_id), None) => {
                let mut stmt = conn.prepare(&format!(
                    "{WORKSPACE_CHANGESET_SELECT}
                     WHERE workspace_id = ?
                     ORDER BY updated_at DESC, id ASC
                     LIMIT ?"
                ))?;
                let records = collect_changesets(
                    stmt.query_map(params![workspace_id, limit], row_to_workspace_changeset)?,
                )?;
                Ok(records)
            }
            (None, Some(state)) => {
                let mut stmt = conn.prepare(&format!(
                    "{WORKSPACE_CHANGESET_SELECT}
                     WHERE current_state = ?
                     ORDER BY updated_at DESC, id ASC
                     LIMIT ?"
                ))?;
                let records = collect_changesets(
                    stmt.query_map(params![state, limit], row_to_workspace_changeset)?,
                )?;
                Ok(records)
            }
            (None, None) => {
                let mut stmt = conn.prepare(&format!(
                    "{WORKSPACE_CHANGESET_SELECT}
                     ORDER BY updated_at DESC, id ASC
                     LIMIT ?"
                ))?;
                let records = collect_changesets(
                    stmt.query_map(params![limit], row_to_workspace_changeset)?,
                )?;
                Ok(records)
            }
        }
    }

    pub fn record_workspace_change_operation(
        &self,
        request: &RecordWorkspaceChangeOperation,
    ) -> Result<WorkspaceChangeOperationRecord> {
        validate_record_workspace_change_operation(request)?;
        let receipt_changeset_id = string_field(
            &request.receipt,
            "changeSetId",
            "workspace operation receipt changeSetId",
        )?;
        if receipt_changeset_id != request.changeset_id {
            return Err(SystemServiceError::Invariant(
                "workspace operation receipt changeSetId mismatch".to_string(),
            ));
        }
        let status = string_field(
            &request.receipt,
            "status",
            "workspace operation receipt status",
        )?;
        validate_operation_status(&request.operation, status)?;
        let receipt_json = serde_json::to_string(&request.receipt)?;
        let id = request
            .id
            .clone()
            .unwrap_or_else(|| format!("wop_{}", Uuid::now_v7()));
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let existing_changeset = get_workspace_changeset_tx(&tx, &request.changeset_id)?;
        if existing_changeset.is_none() {
            return Err(SystemServiceError::Invariant(format!(
                "workspace changeset does not exist: {}",
                request.changeset_id
            )));
        }
        tx.execute(
            "INSERT INTO workspace_change_operation (
                id, changeset_id, operation, status, receipt_json, created_at
             ) VALUES (?, ?, ?, ?, ?, ?)",
            params![
                id,
                request.changeset_id,
                request.operation,
                status,
                receipt_json,
                now,
            ],
        )?;
        let next_state = next_state_for_operation(&request.operation, status);
        tx.execute(
            "UPDATE workspace_changeset
             SET current_state = ?, updated_at = ?
             WHERE id = ?",
            params![next_state, now, request.changeset_id],
        )?;
        append_event_tx(
            &tx,
            &format!("evt_{}", Uuid::now_v7()),
            "workspace.changeset.operation_recorded",
            &EventScope::default(),
            &serde_json::json!({
                "changeSetId": request.changeset_id,
                "operationId": id,
                "operation": request.operation,
                "status": status,
                "state": next_state,
                "updatedAt": now
            }),
            now,
        )?;
        let record = get_workspace_change_operation_tx(&tx, &id)?;
        tx.commit()?;
        Ok(record)
    }

    pub fn list_workspace_change_operations(
        &self,
        request: &ListWorkspaceChangeOperations,
    ) -> Result<Vec<WorkspaceChangeOperationRecord>> {
        if request.changeset_id.is_empty() {
            return Err(SystemServiceError::Invariant(
                "workspace operation changeset_id must not be empty".to_string(),
            ));
        }
        let conn = self.connect()?;
        let mut stmt = conn.prepare(&format!(
            "{WORKSPACE_CHANGE_OPERATION_SELECT}
             WHERE changeset_id = ?
             ORDER BY created_at ASC, id ASC"
        ))?;
        let records = collect_operations(stmt.query_map(
            params![request.changeset_id],
            row_to_workspace_change_operation,
        )?)?;
        Ok(records)
    }

    pub fn put_workspace_change_proposal(
        &self,
        request: &PutWorkspaceChangeProposal,
    ) -> Result<WorkspaceChangeProposalRecord> {
        validate_put_workspace_change_proposal(request)?;
        let id = request
            .id
            .clone()
            .unwrap_or_else(|| format!("wcp_{}", Uuid::now_v7()));
        let metadata_json = request
            .metadata
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;

        let changeset =
            get_workspace_changeset_tx(&tx, &request.changeset_id)?.ok_or_else(|| {
                SystemServiceError::Invariant(format!(
                    "workspace changeset does not exist: {}",
                    request.changeset_id
                ))
            })?;
        if changeset.workspace_id != request.workspace_id {
            return Err(SystemServiceError::Invariant(
                "workspace proposal workspace_id does not match changeset".to_string(),
            ));
        }

        if let Some(idempotency_key) = &request.idempotency_key {
            let existing = tx
                .query_row(
                    &format!("{WORKSPACE_CHANGE_PROPOSAL_SELECT} WHERE idempotency_key = ?"),
                    params![idempotency_key],
                    row_to_workspace_change_proposal,
                )
                .optional()?;
            if let Some(record) = existing {
                validate_existing_proposal(&record, request)?;
                tx.commit()?;
                return Ok(record);
            }
        }

        let existing = get_workspace_change_proposal_tx(&tx, &id)?;
        if let Some(record) = existing {
            validate_existing_proposal(&record, request)?;
            tx.commit()?;
            return Ok(record);
        }

        tx.execute(
            "INSERT INTO workspace_change_proposal (
                id, workspace_id, changeset_id, principal_id, title, summary,
                state, metadata_json, idempotency_key, created_at, updated_at, closed_at
             ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, NULL)",
            params![
                id,
                request.workspace_id,
                request.changeset_id,
                request.principal_id,
                request.title,
                request.summary,
                metadata_json,
                request.idempotency_key,
                now,
                now,
            ],
        )?;
        append_event_tx(
            &tx,
            &format!("evt_{}", Uuid::now_v7()),
            "workspace.change_proposal.created",
            &EventScope::default(),
            &serde_json::json!({
                "proposalId": id,
                "workspaceId": request.workspace_id,
                "changeSetId": request.changeset_id,
                "principalId": request.principal_id,
                "state": "open",
                "updatedAt": now
            }),
            now,
        )?;
        let record = get_workspace_change_proposal_tx(&tx, &id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!("workspace proposal insert missing: {id}"))
        })?;
        tx.commit()?;
        Ok(record)
    }

    pub fn get_workspace_change_proposal(
        &self,
        proposal_id: &str,
    ) -> Result<Option<WorkspaceChangeProposalRecord>> {
        if proposal_id.is_empty() {
            return Err(SystemServiceError::Invariant(
                "workspace proposal id must not be empty".to_string(),
            ));
        }
        let conn = self.connect()?;
        conn.query_row(
            &format!("{WORKSPACE_CHANGE_PROPOSAL_SELECT} WHERE id = ?"),
            params![proposal_id],
            row_to_workspace_change_proposal,
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn list_workspace_change_proposals(
        &self,
        request: &ListWorkspaceChangeProposals,
    ) -> Result<Vec<WorkspaceChangeProposalRecord>> {
        validate_optional_proposal_state(request.state.as_deref())?;
        let mut sql = format!("{WORKSPACE_CHANGE_PROPOSAL_SELECT} WHERE 1 = 1");
        let mut values: Vec<Box<dyn ToSql>> = Vec::new();
        if let Some(workspace_id) = &request.workspace_id {
            sql.push_str(" AND workspace_id = ?");
            values.push(Box::new(workspace_id.clone()));
        }
        if let Some(state) = &request.state {
            sql.push_str(" AND state = ?");
            values.push(Box::new(state.clone()));
        }
        if let Some(changeset_id) = &request.changeset_id {
            sql.push_str(" AND changeset_id = ?");
            values.push(Box::new(changeset_id.clone()));
        }
        sql.push_str(" ORDER BY updated_at DESC, id ASC LIMIT ?");
        values.push(Box::new(request.limit.unwrap_or(100).clamp(1, 1000)));

        let conn = self.connect()?;
        let mut stmt = conn.prepare(&sql)?;
        let records = collect_proposals(stmt.query_map(
            params_from_iter(values.iter().map(|value| value.as_ref())),
            row_to_workspace_change_proposal,
        )?)?;
        Ok(records)
    }

    pub fn record_workspace_change_proposal_operation(
        &self,
        request: &RecordWorkspaceChangeProposalOperation,
    ) -> Result<WorkspaceChangeProposalOperationRecord> {
        validate_record_workspace_change_proposal_operation(request)?;
        let id = request
            .id
            .clone()
            .unwrap_or_else(|| format!("wcpo_{}", Uuid::now_v7()));
        let metadata_json = request
            .metadata
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let proposal =
            get_workspace_change_proposal_tx(&tx, &request.proposal_id)?.ok_or_else(|| {
                SystemServiceError::Invariant(format!(
                    "workspace proposal does not exist: {}",
                    request.proposal_id
                ))
            })?;
        let to_state = proposal_next_state(&proposal.state, &request.operation)?;
        let closed_at = if proposal_is_closed(to_state) {
            Some(now)
        } else {
            proposal.closed_at
        };

        tx.execute(
            "INSERT INTO workspace_change_proposal_operation (
                id, proposal_id, operation, actor_id, from_state, to_state,
                reason, metadata_json, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                id,
                request.proposal_id,
                request.operation,
                request.actor_id,
                proposal.state,
                to_state,
                request.reason,
                metadata_json,
                now,
            ],
        )?;
        tx.execute(
            "UPDATE workspace_change_proposal
             SET state = ?, updated_at = ?, closed_at = ?
             WHERE id = ?",
            params![to_state, now, closed_at, request.proposal_id],
        )?;
        append_event_tx(
            &tx,
            &format!("evt_{}", Uuid::now_v7()),
            "workspace.change_proposal.operation_recorded",
            &EventScope::default(),
            &serde_json::json!({
                "proposalId": request.proposal_id,
                "operationId": id,
                "operation": request.operation,
                "actorId": request.actor_id,
                "fromState": proposal.state,
                "toState": to_state,
                "updatedAt": now
            }),
            now,
        )?;
        let record = get_workspace_change_proposal_operation_tx(&tx, &id)?;
        tx.commit()?;
        Ok(record)
    }

    pub fn list_workspace_change_proposal_operations(
        &self,
        request: &ListWorkspaceChangeProposalOperations,
    ) -> Result<Vec<WorkspaceChangeProposalOperationRecord>> {
        if request.proposal_id.is_empty() {
            return Err(SystemServiceError::Invariant(
                "workspace proposal operation proposal_id must not be empty".to_string(),
            ));
        }
        let conn = self.connect()?;
        let mut stmt = conn.prepare(&format!(
            "{WORKSPACE_CHANGE_PROPOSAL_OPERATION_SELECT}
             WHERE proposal_id = ?
             ORDER BY created_at ASC, id ASC"
        ))?;
        let records = collect_proposal_operations(stmt.query_map(
            params![request.proposal_id],
            row_to_workspace_change_proposal_operation,
        )?)?;
        Ok(records)
    }
}

fn validate_put_workspace_changeset(request: &PutWorkspaceChangeSet) -> Result<()> {
    if request.workspace_id.is_empty() {
        return Err(SystemServiceError::Invariant(
            "workspace changeset workspace_id must not be empty".to_string(),
        ));
    }
    if request.principal_id.is_empty() {
        return Err(SystemServiceError::Invariant(
            "workspace changeset principal_id must not be empty".to_string(),
        ));
    }
    let id = string_field(&request.changeset, "id", "workspace changeset id")?;
    if id.is_empty() {
        return Err(SystemServiceError::Invariant(
            "workspace changeset id must not be empty".to_string(),
        ));
    }
    let changes = request
        .changeset
        .get("changes")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            SystemServiceError::Invariant(
                "workspace changeset changes must be an array".to_string(),
            )
        })?;
    if changes.is_empty() {
        return Err(SystemServiceError::Invariant(
            "workspace changeset must include at least one file change".to_string(),
        ));
    }
    Ok(())
}

fn validate_record_workspace_change_operation(
    request: &RecordWorkspaceChangeOperation,
) -> Result<()> {
    if request.changeset_id.is_empty() {
        return Err(SystemServiceError::Invariant(
            "workspace operation changeset_id must not be empty".to_string(),
        ));
    }
    if request.operation != "apply" && request.operation != "undo" {
        return Err(SystemServiceError::Invariant(format!(
            "invalid workspace operation: {}",
            request.operation
        )));
    }
    Ok(())
}

fn validate_put_workspace_change_proposal(request: &PutWorkspaceChangeProposal) -> Result<()> {
    if request.workspace_id.is_empty() {
        return Err(SystemServiceError::Invariant(
            "workspace proposal workspace_id must not be empty".to_string(),
        ));
    }
    if request.changeset_id.is_empty() {
        return Err(SystemServiceError::Invariant(
            "workspace proposal changeset_id must not be empty".to_string(),
        ));
    }
    if request.principal_id.is_empty() {
        return Err(SystemServiceError::Invariant(
            "workspace proposal principal_id must not be empty".to_string(),
        ));
    }
    if request.id.as_deref() == Some("") {
        return Err(SystemServiceError::Invariant(
            "workspace proposal id must not be empty".to_string(),
        ));
    }
    if request.idempotency_key.as_deref() == Some("") {
        return Err(SystemServiceError::Invariant(
            "workspace proposal idempotency_key must not be empty".to_string(),
        ));
    }
    Ok(())
}

fn validate_record_workspace_change_proposal_operation(
    request: &RecordWorkspaceChangeProposalOperation,
) -> Result<()> {
    if request.proposal_id.is_empty() {
        return Err(SystemServiceError::Invariant(
            "workspace proposal operation proposal_id must not be empty".to_string(),
        ));
    }
    if request.actor_id.is_empty() {
        return Err(SystemServiceError::Invariant(
            "workspace proposal operation actor_id must not be empty".to_string(),
        ));
    }
    if request.id.as_deref() == Some("") {
        return Err(SystemServiceError::Invariant(
            "workspace proposal operation id must not be empty".to_string(),
        ));
    }
    if !matches!(
        request.operation.as_str(),
        "approve" | "reject" | "withdraw" | "request_apply" | "mark_applied" | "mark_apply_failed"
    ) {
        return Err(SystemServiceError::Invariant(format!(
            "invalid workspace proposal operation: {}",
            request.operation
        )));
    }
    Ok(())
}

fn validate_optional_proposal_state(state: Option<&str>) -> Result<()> {
    if let Some(state) = state {
        if !proposal_state_is_known(state) {
            return Err(SystemServiceError::Invariant(format!(
                "invalid workspace proposal state: {state}"
            )));
        }
    }
    Ok(())
}

fn validate_existing_proposal(
    record: &WorkspaceChangeProposalRecord,
    request: &PutWorkspaceChangeProposal,
) -> Result<()> {
    let metadata_matches = match (&record.metadata, &request.metadata) {
        (None, None) => true,
        (Some(left), Some(right)) => left == right,
        _ => false,
    };
    if record.workspace_id != request.workspace_id
        || record.changeset_id != request.changeset_id
        || record.principal_id != request.principal_id
        || record.title != request.title
        || record.summary != request.summary
        || !metadata_matches
    {
        return Err(SystemServiceError::Invariant(format!(
            "workspace proposal id already exists with different content: {}",
            record.id
        )));
    }
    Ok(())
}

fn proposal_next_state(from_state: &str, operation: &str) -> Result<&'static str> {
    match (from_state, operation) {
        ("open", "approve") => Ok("approved"),
        ("open", "reject") => Ok("rejected"),
        ("open", "withdraw") => Ok("withdrawn"),
        ("approved", "request_apply") => Ok("apply_requested"),
        ("apply_requested", "mark_applied") => Ok("applied"),
        ("apply_requested", "mark_apply_failed") => Ok("apply_failed"),
        _ => Err(SystemServiceError::Invariant(format!(
            "invalid workspace proposal transition: {from_state}/{operation}"
        ))),
    }
}

fn proposal_state_is_known(state: &str) -> bool {
    matches!(
        state,
        "open"
            | "approved"
            | "rejected"
            | "withdrawn"
            | "apply_requested"
            | "applied"
            | "apply_failed"
    )
}

fn proposal_is_closed(state: &str) -> bool {
    matches!(state, "rejected" | "withdrawn" | "applied" | "apply_failed")
}

fn validate_operation_status(operation: &str, status: &str) -> Result<()> {
    match (operation, status) {
        ("apply", "applied" | "already_applied" | "conflicted") => Ok(()),
        ("undo", "applied" | "conflicted") => Ok(()),
        _ => Err(SystemServiceError::Invariant(format!(
            "invalid workspace operation status: {operation}/{status}"
        ))),
    }
}

fn next_state_for_operation(operation: &str, status: &str) -> &'static str {
    match (operation, status) {
        ("apply", "applied") => "applied",
        ("apply", "already_applied") => "already_applied",
        ("apply", "conflicted") => "conflicted",
        ("undo", "applied") => "undone",
        ("undo", "conflicted") => "undo_conflicted",
        _ => "conflicted",
    }
}

fn get_workspace_changeset_tx(
    tx: &rusqlite::Transaction<'_>,
    changeset_id: &str,
) -> Result<Option<WorkspaceChangeSetRecord>> {
    tx.query_row(
        &format!("{WORKSPACE_CHANGESET_SELECT} WHERE id = ?"),
        params![changeset_id],
        row_to_workspace_changeset,
    )
    .optional()
    .map_err(Into::into)
}

fn get_workspace_change_operation_tx(
    tx: &rusqlite::Transaction<'_>,
    operation_id: &str,
) -> Result<WorkspaceChangeOperationRecord> {
    tx.query_row(
        &format!("{WORKSPACE_CHANGE_OPERATION_SELECT} WHERE id = ?"),
        params![operation_id],
        row_to_workspace_change_operation,
    )
    .map_err(Into::into)
}

fn get_workspace_change_proposal_tx(
    tx: &rusqlite::Transaction<'_>,
    proposal_id: &str,
) -> Result<Option<WorkspaceChangeProposalRecord>> {
    tx.query_row(
        &format!("{WORKSPACE_CHANGE_PROPOSAL_SELECT} WHERE id = ?"),
        params![proposal_id],
        row_to_workspace_change_proposal,
    )
    .optional()
    .map_err(Into::into)
}

fn get_workspace_change_proposal_operation_tx(
    tx: &rusqlite::Transaction<'_>,
    operation_id: &str,
) -> Result<WorkspaceChangeProposalOperationRecord> {
    tx.query_row(
        &format!("{WORKSPACE_CHANGE_PROPOSAL_OPERATION_SELECT} WHERE id = ?"),
        params![operation_id],
        row_to_workspace_change_proposal_operation,
    )
    .map_err(Into::into)
}

fn collect_changesets(
    rows: impl Iterator<Item = rusqlite::Result<WorkspaceChangeSetRecord>>,
) -> Result<Vec<WorkspaceChangeSetRecord>> {
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}

fn collect_operations(
    rows: impl Iterator<Item = rusqlite::Result<WorkspaceChangeOperationRecord>>,
) -> Result<Vec<WorkspaceChangeOperationRecord>> {
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}

fn collect_proposals(
    rows: impl Iterator<Item = rusqlite::Result<WorkspaceChangeProposalRecord>>,
) -> Result<Vec<WorkspaceChangeProposalRecord>> {
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}

fn collect_proposal_operations(
    rows: impl Iterator<Item = rusqlite::Result<WorkspaceChangeProposalOperationRecord>>,
) -> Result<Vec<WorkspaceChangeProposalOperationRecord>> {
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}

fn string_field<'a>(value: &'a Value, field: &str, label: &str) -> Result<&'a str> {
    value
        .get(field)
        .and_then(Value::as_str)
        .ok_or_else(|| SystemServiceError::Invariant(format!("{label} must be a string")))
}

fn optional_string_field(value: &Value, field: &str, label: &str) -> Result<Option<String>> {
    match value.get(field) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(text)) => Ok(Some(text.clone())),
        _ => Err(SystemServiceError::Invariant(format!(
            "{label} must be a string when present"
        ))),
    }
}
