use super::super::apply_claim::claim_token_hash;
use crate::event_store::append_event_tx;
use crate::{
    BeginWorkspaceTaskRun, EventScope, Result, SystemServiceError, WorkspaceTaskAttemptRecord,
    WorkspaceTaskClaimResult, WorkspaceTaskRunRecord, WorkspaceTaskRunSnapshot,
};
use rusqlite::{params, OptionalExtension, Transaction};
use serde_json::Value;
use uuid::Uuid;

pub(super) const RUN_SELECT: &str = "SELECT
    id, workspace_id, principal_id, access, repository_id, isolation_id,
    state, base_revision, runtime_ref, execution_outcome, outcome, summary,
    resource_ids_json, changeset_id, proposal_id, failure_json,
    created_at, updated_at, finished_at
 FROM workspace_task_run";

pub(super) const ATTEMPT_SELECT: &str = "SELECT
    id, run_id, owner_id, claim_token_sha256, kind, state,
    lease_expires_at, failure_json, started_at, updated_at, finished_at
 FROM workspace_task_attempt";

pub(super) fn existing_claim_result(
    tx: &Transaction<'_>,
    run: WorkspaceTaskRunRecord,
    request: &BeginWorkspaceTaskRun,
    token_hash: &str,
    now: i64,
) -> Result<WorkspaceTaskClaimResult> {
    let attempt = get_attempt_tx(tx, &request.attempt_id)?.ok_or_else(|| {
        SystemServiceError::Conflict(
            "workspace task begin replay does not match the original attempt".to_string(),
        )
    })?;
    if attempt.run_id != run.id
        || attempt.owner_id != request.owner_id
        || attempt.claim_token_sha256 != token_hash
        || attempt.kind != "execution"
    {
        return Err(SystemServiceError::Conflict(
            "workspace task begin replay changed attempt identity".to_string(),
        ));
    }
    if run.state == "released" {
        return Ok(WorkspaceTaskClaimResult {
            status: "already_terminal".to_string(),
            snapshot: snapshot_tx(tx, run)?,
        });
    }
    let active = get_active_attempt_tx(tx, &run.id)?;
    let status = match active.as_ref() {
        Some(active) if active.id == attempt.id && active.lease_expires_at > now => "claimed",
        _ => "busy",
    };
    Ok(WorkspaceTaskClaimResult {
        status: status.to_string(),
        snapshot: WorkspaceTaskRunSnapshot {
            run,
            active_attempt: active,
        },
    })
}

pub(super) fn assert_same_run(
    run: &WorkspaceTaskRunRecord,
    request: &BeginWorkspaceTaskRun,
) -> Result<()> {
    if run.workspace_id != request.workspace_id
        || run.principal_id != request.principal_id
        || run.access != request.access
        || run.repository_id != request.repository_id
        || run.isolation_id != request.isolation_id
    {
        return Err(SystemServiceError::Conflict(format!(
            "workspace task run id already exists with different identity: {}",
            request.id
        )));
    }
    Ok(())
}

pub(super) fn snapshot_tx(
    tx: &Transaction<'_>,
    run: WorkspaceTaskRunRecord,
) -> Result<WorkspaceTaskRunSnapshot> {
    let active_attempt = get_active_attempt_tx(tx, &run.id)?;
    Ok(WorkspaceTaskRunSnapshot {
        run,
        active_attempt,
    })
}

pub(super) fn require_run_tx(tx: &Transaction<'_>, run_id: &str) -> Result<WorkspaceTaskRunRecord> {
    get_run_tx(tx, run_id)?.ok_or_else(|| {
        SystemServiceError::NotFound(format!("workspace task run does not exist: {run_id}"))
    })
}

pub(super) fn get_run_tx(
    tx: &Transaction<'_>,
    run_id: &str,
) -> Result<Option<WorkspaceTaskRunRecord>> {
    tx.query_row(
        &format!("{RUN_SELECT} WHERE id = ?"),
        params![run_id],
        row_to_run,
    )
    .optional()
    .map_err(Into::into)
}

pub(super) fn get_attempt_tx(
    tx: &Transaction<'_>,
    attempt_id: &str,
) -> Result<Option<WorkspaceTaskAttemptRecord>> {
    tx.query_row(
        &format!("{ATTEMPT_SELECT} WHERE id = ?"),
        params![attempt_id],
        row_to_attempt,
    )
    .optional()
    .map_err(Into::into)
}

pub(super) fn get_active_attempt_tx(
    tx: &Transaction<'_>,
    run_id: &str,
) -> Result<Option<WorkspaceTaskAttemptRecord>> {
    tx.query_row(
        &format!("{ATTEMPT_SELECT} WHERE run_id = ? AND state = 'active'"),
        params![run_id],
        row_to_attempt,
    )
    .optional()
    .map_err(Into::into)
}

pub(super) fn require_live_attempt_tx(
    tx: &Transaction<'_>,
    run_id: &str,
    attempt_id: &str,
    claim_token: &str,
    now: i64,
) -> Result<WorkspaceTaskAttemptRecord> {
    let attempt = get_attempt_tx(tx, attempt_id)?.ok_or_else(|| {
        SystemServiceError::Conflict("workspace task attempt does not exist".to_string())
    })?;
    if attempt.run_id != run_id
        || attempt.state != "active"
        || attempt.claim_token_sha256 != claim_token_hash(claim_token)
        || attempt.lease_expires_at <= now
    {
        return Err(SystemServiceError::Conflict(
            "workspace task attempt is not the live exact owner".to_string(),
        ));
    }
    Ok(attempt)
}

pub(super) fn require_exact_attempt_tx(
    tx: &Transaction<'_>,
    run_id: &str,
    attempt_id: &str,
    claim_token: &str,
) -> Result<WorkspaceTaskAttemptRecord> {
    let attempt = get_attempt_tx(tx, attempt_id)?.ok_or_else(|| {
        SystemServiceError::Conflict("workspace task attempt does not exist".to_string())
    })?;
    if attempt.run_id != run_id || attempt.claim_token_sha256 != claim_token_hash(claim_token) {
        return Err(SystemServiceError::Conflict(
            "workspace task attempt identity does not match".to_string(),
        ));
    }
    Ok(attempt)
}

pub(super) fn finish_attempt_tx(
    tx: &Transaction<'_>,
    attempt_id: &str,
    state: &str,
    failure: Option<&Value>,
    now: i64,
) -> Result<()> {
    tx.execute(
        "UPDATE workspace_task_attempt
         SET state = ?, failure_json = ?, updated_at = ?, finished_at = ?
         WHERE id = ? AND state = 'active'",
        params![
            state,
            failure.map(serde_json::to_string).transpose()?,
            now,
            now,
            attempt_id
        ],
    )?;
    Ok(())
}

pub(super) fn row_to_run(row: &rusqlite::Row<'_>) -> rusqlite::Result<WorkspaceTaskRunRecord> {
    let resources_json: String = row.get(12)?;
    let failure_json: Option<String> = row.get(15)?;
    Ok(WorkspaceTaskRunRecord {
        id: row.get(0)?,
        workspace_id: row.get(1)?,
        principal_id: row.get(2)?,
        access: row.get(3)?,
        repository_id: row.get(4)?,
        isolation_id: row.get(5)?,
        state: row.get(6)?,
        base_revision: row.get(7)?,
        runtime_ref: row.get(8)?,
        execution_outcome: row.get(9)?,
        outcome: row.get(10)?,
        summary: row.get(11)?,
        resource_ids: serde_json::from_str(&resources_json).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                12,
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        })?,
        changeset_id: row.get(13)?,
        proposal_id: row.get(14)?,
        failure: failure_json
            .map(|raw| serde_json::from_str(&raw))
            .transpose()
            .map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    15,
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })?,
        created_at: row.get(16)?,
        updated_at: row.get(17)?,
        finished_at: row.get(18)?,
    })
}

pub(super) fn row_to_attempt(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<WorkspaceTaskAttemptRecord> {
    let failure_json: Option<String> = row.get(7)?;
    Ok(WorkspaceTaskAttemptRecord {
        id: row.get(0)?,
        run_id: row.get(1)?,
        owner_id: row.get(2)?,
        claim_token_sha256: row.get(3)?,
        kind: row.get(4)?,
        state: row.get(5)?,
        lease_expires_at: row.get(6)?,
        failure: failure_json
            .map(|raw| serde_json::from_str(&raw))
            .transpose()
            .map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    7,
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })?,
        started_at: row.get(8)?,
        updated_at: row.get(9)?,
        finished_at: row.get(10)?,
    })
}

pub(super) fn append_task_event(
    tx: &Transaction<'_>,
    event_type: &str,
    run_id: &str,
    state: &str,
    now: i64,
) -> Result<()> {
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        event_type,
        &EventScope::default(),
        &serde_json::json!({ "runId": run_id, "state": state, "updatedAt": now }),
        now,
    )
}

pub(super) fn collect<T>(rows: impl Iterator<Item = rusqlite::Result<T>>) -> Result<Vec<T>> {
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}
