use crate::rows::{
    row_to_workspace_change_transaction, row_to_workspace_change_transaction_attempt,
    row_to_workspace_change_transaction_file,
};
use crate::{
    Result, WorkspaceChangeTransactionAttemptRecord, WorkspaceChangeTransactionFileRecord,
    WorkspaceChangeTransactionRecord, WorkspaceChangeTransactionSnapshot,
};
use rusqlite::{params, OptionalExtension};

pub(super) const TRANSACTION_SELECT: &str = "SELECT
    id, workspace_id, changeset_id, operation, undo_source_operation_id,
    source_kind, source_id, idempotency_key, root_identity_sha256,
    proposal_apply_attempt_id, state, plan_digest, recovery_decision,
    workspace_operation_id, failure_json, created_at, updated_at, finished_at
 FROM workspace_change_transaction";

pub(super) const FILE_SELECT: &str = "SELECT
    transaction_id, ordinal, path, before_text, before_sha256,
    after_text, after_sha256, state, updated_at
 FROM workspace_change_transaction_file";

pub(super) const ATTEMPT_SELECT: &str = "SELECT
    id, transaction_id, owner_id, claim_token_sha256, kind, state,
    lease_expires_at, failure_json, started_at, updated_at, finished_at
 FROM workspace_change_transaction_attempt";

pub(super) fn get_transaction_tx(
    tx: &rusqlite::Transaction<'_>,
    transaction_id: &str,
) -> Result<Option<WorkspaceChangeTransactionRecord>> {
    tx.query_row(
        &format!("{TRANSACTION_SELECT} WHERE id = ?"),
        params![transaction_id],
        row_to_workspace_change_transaction,
    )
    .optional()
    .map_err(Into::into)
}

pub(super) fn get_transaction_by_idempotency_key_tx(
    tx: &rusqlite::Transaction<'_>,
    idempotency_key: &str,
) -> Result<Option<WorkspaceChangeTransactionRecord>> {
    tx.query_row(
        &format!("{TRANSACTION_SELECT} WHERE idempotency_key = ?"),
        params![idempotency_key],
        row_to_workspace_change_transaction,
    )
    .optional()
    .map_err(Into::into)
}

pub(super) fn get_attempt_tx(
    tx: &rusqlite::Transaction<'_>,
    attempt_id: &str,
) -> Result<Option<WorkspaceChangeTransactionAttemptRecord>> {
    tx.query_row(
        &format!("{ATTEMPT_SELECT} WHERE id = ?"),
        params![attempt_id],
        row_to_workspace_change_transaction_attempt,
    )
    .optional()
    .map_err(Into::into)
}

pub(super) fn get_active_attempt_tx(
    tx: &rusqlite::Transaction<'_>,
    transaction_id: &str,
) -> Result<Option<WorkspaceChangeTransactionAttemptRecord>> {
    tx.query_row(
        &format!("{ATTEMPT_SELECT} WHERE transaction_id = ? AND state = 'active'"),
        params![transaction_id],
        row_to_workspace_change_transaction_attempt,
    )
    .optional()
    .map_err(Into::into)
}

pub(super) fn get_file_tx(
    tx: &rusqlite::Transaction<'_>,
    transaction_id: &str,
    ordinal: i64,
) -> Result<Option<WorkspaceChangeTransactionFileRecord>> {
    tx.query_row(
        &format!("{FILE_SELECT} WHERE transaction_id = ? AND ordinal = ?"),
        params![transaction_id, ordinal],
        row_to_workspace_change_transaction_file,
    )
    .optional()
    .map_err(Into::into)
}

pub(super) fn snapshot_tx(
    tx: &rusqlite::Transaction<'_>,
    transaction: WorkspaceChangeTransactionRecord,
) -> Result<WorkspaceChangeTransactionSnapshot> {
    let files = list_files_tx(tx, &transaction.id)?;
    let active_attempt = get_active_attempt_tx(tx, &transaction.id)?;
    Ok(WorkspaceChangeTransactionSnapshot {
        transaction,
        files,
        active_attempt,
    })
}

pub(super) fn list_files_tx(
    tx: &rusqlite::Transaction<'_>,
    transaction_id: &str,
) -> Result<Vec<WorkspaceChangeTransactionFileRecord>> {
    let mut stmt = tx.prepare(&format!(
        "{FILE_SELECT} WHERE transaction_id = ? ORDER BY ordinal ASC"
    ))?;
    let rows = stmt.query_map(
        params![transaction_id],
        row_to_workspace_change_transaction_file,
    )?;
    let records = collect(rows)?;
    Ok(records)
}

pub(super) fn collect<T>(rows: impl Iterator<Item = rusqlite::Result<T>>) -> Result<Vec<T>> {
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}
