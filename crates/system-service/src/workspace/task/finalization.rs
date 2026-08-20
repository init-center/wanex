use super::super::{
    get_workspace_change_proposal_tx, get_workspace_changeset_tx, optional_string_field,
    string_field, validate_put_workspace_changeset,
};
use super::repository::{append_task_event, require_live_attempt_tx, require_run_tx, snapshot_tx};
use super::validation::{optional_json, validate_finalization, validate_identity};
use crate::event_store::append_event_tx;
use crate::{
    EventScope, FinalizeWorkspaceTaskCollection, PutWorkspaceChangeSet, Result, SystemService,
    SystemServiceError, WorkspaceTaskRunRecord, WorkspaceTaskRunSnapshot,
};
use rusqlite::{params, Transaction};
use serde_json::Value;
use uuid::Uuid;

impl SystemService {
    pub fn finalize_workspace_task_collection(
        &self,
        request: &FinalizeWorkspaceTaskCollection,
    ) -> Result<WorkspaceTaskRunSnapshot> {
        validate_identity(&request.run_id, &request.attempt_id, &request.claim_token)?;
        validate_finalization(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;
        let run = require_run_tx(&tx, &request.run_id)?;
        require_live_attempt_tx(
            &tx,
            &request.run_id,
            &request.attempt_id,
            &request.claim_token,
            now,
        )?;

        if run.state != "collecting" {
            let expected_state = if request.outcome == "proposed" {
                "proposed"
            } else {
                "releasing"
            };
            if run.state == expected_state && run.outcome.as_deref() == Some(&request.outcome) {
                assert_finalization_replay(&tx, &run, request)?;
                let snapshot = snapshot_tx(&tx, run)?;
                tx.commit()?;
                return Ok(snapshot);
            }
            return Err(SystemServiceError::Conflict(format!(
                "workspace task cannot finalize collection from state {}",
                run.state
            )));
        }

        validate_outcome_for_run(&run, request)?;
        if request.outcome == "proposed" {
            finalize_proposed_tx(&tx, &run, request, now)?;
        } else {
            tx.execute(
                "UPDATE workspace_task_run
                 SET state = 'releasing', outcome = ?, updated_at = ?
                 WHERE id = ? AND state = 'collecting'",
                params![request.outcome, now, request.run_id],
            )?;
        }
        let state = if request.outcome == "proposed" {
            "proposed"
        } else {
            "releasing"
        };
        append_task_event(
            &tx,
            "workspace.task_run.collection_finalized",
            &request.run_id,
            state,
            now,
        )?;
        let snapshot = snapshot_tx(&tx, require_run_tx(&tx, &request.run_id)?)?;
        tx.commit()?;
        Ok(snapshot)
    }
}

fn finalize_proposed_tx(
    tx: &Transaction<'_>,
    run: &WorkspaceTaskRunRecord,
    request: &FinalizeWorkspaceTaskCollection,
    now: i64,
) -> Result<()> {
    let changeset = request.changeset.as_ref().ok_or_else(|| {
        SystemServiceError::InvalidInput("proposed task requires a changeset".to_string())
    })?;
    let proposal_id = request.proposal_id.as_deref().ok_or_else(|| {
        SystemServiceError::InvalidInput("proposed task requires a proposal id".to_string())
    })?;
    let changeset_request = PutWorkspaceChangeSet {
        workspace_id: run.workspace_id.clone(),
        principal_id: run.principal_id.clone(),
        changeset: changeset.clone(),
    };
    validate_put_workspace_changeset(&changeset_request)?;
    let changeset_id = string_field(changeset, "id", "workspace changeset id")?;
    let title = optional_string_field(changeset, "title", "workspace changeset title")?;
    let base_revision = optional_string_field(
        changeset,
        "baseRevision",
        "workspace changeset baseRevision",
    )?;
    if base_revision != run.base_revision {
        return Err(SystemServiceError::Conflict(
            "workspace task changeset base revision differs from prepared run".to_string(),
        ));
    }
    if get_workspace_changeset_tx(tx, changeset_id)?.is_some() {
        return Err(SystemServiceError::Conflict(format!(
            "workspace task changeset id is already used: {changeset_id}"
        )));
    }
    if get_workspace_change_proposal_tx(tx, proposal_id)?.is_some() {
        return Err(SystemServiceError::Conflict(format!(
            "workspace task proposal id is already used: {proposal_id}"
        )));
    }
    let changeset_json = serde_json::to_string(changeset)?;
    tx.execute(
        "INSERT INTO workspace_changeset (
            id, workspace_id, principal_id, title, base_revision,
            changeset_json, current_state, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, 'submitted', ?, ?)",
        params![
            changeset_id,
            run.workspace_id,
            run.principal_id,
            title,
            base_revision,
            changeset_json,
            now,
            now
        ],
    )?;
    let proposal_title = request.title.as_ref().or(title.as_ref());
    let metadata_json = optional_json(&request.proposal_metadata)?;
    tx.execute(
        "INSERT INTO workspace_change_proposal (
            id, workspace_id, changeset_id, principal_id, title, summary,
            state, metadata_json, idempotency_key, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)",
        params![
            proposal_id,
            run.workspace_id,
            changeset_id,
            run.principal_id,
            proposal_title,
            run.summary,
            metadata_json,
            format!("workspace.task.proposal:{}", run.id),
            now,
            now
        ],
    )?;
    tx.execute(
        "UPDATE workspace_task_run
         SET state = 'proposed', outcome = 'proposed', changeset_id = ?,
             proposal_id = ?, updated_at = ?
         WHERE id = ? AND state = 'collecting'",
        params![changeset_id, proposal_id, now, run.id],
    )?;
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        "workspace.changeset.submitted",
        &EventScope::default(),
        &serde_json::json!({
            "changeSetId": changeset_id,
            "workspaceId": run.workspace_id,
            "principalId": run.principal_id,
            "changeCount": changeset
                .get("changes")
                .and_then(Value::as_array)
                .map_or(0, Vec::len),
            "updatedAt": now
        }),
        now,
    )?;
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        "workspace.change_proposal.created",
        &EventScope::default(),
        &serde_json::json!({
            "proposalId": proposal_id,
            "workspaceId": run.workspace_id,
            "changeSetId": changeset_id,
            "principalId": run.principal_id,
            "state": "open",
            "updatedAt": now
        }),
        now,
    )?;
    Ok(())
}

fn assert_finalization_replay(
    tx: &Transaction<'_>,
    run: &WorkspaceTaskRunRecord,
    request: &FinalizeWorkspaceTaskCollection,
) -> Result<()> {
    if request.outcome != "proposed" {
        if request.changeset.is_some() || request.proposal_id.is_some() {
            return Err(SystemServiceError::Conflict(
                "non-proposed task replay contains proposal content".to_string(),
            ));
        }
        return Ok(());
    }
    let changeset_id = run.changeset_id.as_deref().ok_or_else(|| {
        SystemServiceError::Invariant("proposed task is missing changeset linkage".to_string())
    })?;
    if run.proposal_id.as_deref() != request.proposal_id.as_deref() {
        return Err(SystemServiceError::Conflict(
            "workspace task proposal replay changed proposal id".to_string(),
        ));
    }
    let existing = get_workspace_changeset_tx(tx, changeset_id)?.ok_or_else(|| {
        SystemServiceError::Invariant("proposed task changeset linkage is missing".to_string())
    })?;
    if request.changeset.as_ref() != Some(&existing.changeset) {
        return Err(SystemServiceError::Conflict(
            "workspace task proposal replay changed changeset content".to_string(),
        ));
    }
    let proposal = get_workspace_change_proposal_tx(tx, request.proposal_id.as_deref().unwrap())?
        .ok_or_else(|| {
        SystemServiceError::Invariant("proposed task proposal linkage is missing".to_string())
    })?;
    let expected_title = request.title.as_ref().or(existing.title.as_ref());
    if proposal.workspace_id != run.workspace_id
        || proposal.changeset_id != changeset_id
        || proposal.principal_id != run.principal_id
        || proposal.title.as_ref() != expected_title
        || proposal.summary != run.summary
        || proposal.metadata != request.proposal_metadata
    {
        return Err(SystemServiceError::Conflict(
            "workspace task proposal replay changed proposal content".to_string(),
        ));
    }
    Ok(())
}

fn validate_outcome_for_run(
    run: &WorkspaceTaskRunRecord,
    request: &FinalizeWorkspaceTaskCollection,
) -> Result<()> {
    let execution = run.execution_outcome.as_deref().ok_or_else(|| {
        SystemServiceError::Invariant("collecting task is missing execution outcome".to_string())
    })?;
    let valid = match request.outcome.as_str() {
        "proposed" => run.access == "writable" && request.changeset.is_some(),
        "no_changes" => run.access == "writable" && request.changeset.is_none(),
        "read_only_completed" => {
            run.access == "read_only" && execution == "completed" && request.changeset.is_none()
        }
        "execution_failed" => execution == "failed" && request.changeset.is_none(),
        "cancelled" => execution == "cancelled" && request.changeset.is_none(),
        _ => false,
    };
    if !valid {
        return Err(SystemServiceError::InvalidInput(format!(
            "invalid workspace task collection outcome for {}/{}: {}",
            run.access, execution, request.outcome
        )));
    }
    Ok(())
}
