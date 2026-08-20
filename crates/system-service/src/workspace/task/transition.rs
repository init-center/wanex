use super::repository::append_task_event;
use super::repository::{
    finish_attempt_tx, require_exact_attempt_tx, require_live_attempt_tx, require_run_tx,
    snapshot_tx,
};
use super::validation::{require_state, validate_identity};
use crate::{Result, SystemService, WorkspaceTaskRunIdentity, WorkspaceTaskRunSnapshot};
use rusqlite::params;

impl SystemService {
    pub fn begin_workspace_task_release(
        &self,
        request: &WorkspaceTaskRunIdentity,
    ) -> Result<WorkspaceTaskRunSnapshot> {
        transition_release(self, request, false)
    }

    pub fn finalize_workspace_task_release(
        &self,
        request: &WorkspaceTaskRunIdentity,
    ) -> Result<WorkspaceTaskRunSnapshot> {
        transition_release(self, request, true)
    }
}

fn transition_release(
    service: &SystemService,
    request: &WorkspaceTaskRunIdentity,
    finalize: bool,
) -> Result<WorkspaceTaskRunSnapshot> {
    validate_identity(&request.run_id, &request.attempt_id, &request.claim_token)?;
    let now = crate::util::now_ms();
    let mut conn = service.connect()?;
    let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;
    let run = require_run_tx(&tx, &request.run_id)?;
    if finalize && run.state == "released" {
        require_exact_attempt_tx(
            &tx,
            &request.run_id,
            &request.attempt_id,
            &request.claim_token,
        )?;
        let snapshot = snapshot_tx(&tx, run)?;
        tx.commit()?;
        return Ok(snapshot);
    }
    require_live_attempt_tx(
        &tx,
        &request.run_id,
        &request.attempt_id,
        &request.claim_token,
        now,
    )?;
    if finalize {
        require_state(&run, "releasing", "released")?;
        tx.execute(
            "UPDATE workspace_task_run
             SET state = 'released', updated_at = ?, finished_at = ?
             WHERE id = ? AND state = 'releasing'",
            params![now, now, request.run_id],
        )?;
        finish_attempt_tx(&tx, &request.attempt_id, "completed", None, now)?;
        append_task_event(
            &tx,
            "workspace.task_run.released",
            &request.run_id,
            "released",
            now,
        )?;
    } else if run.state != "releasing" {
        require_state(&run, "proposed", "releasing")?;
        tx.execute(
            "UPDATE workspace_task_run SET state = 'releasing', updated_at = ?
             WHERE id = ? AND state = 'proposed'",
            params![now, request.run_id],
        )?;
        append_task_event(
            &tx,
            "workspace.task_run.releasing",
            &request.run_id,
            "releasing",
            now,
        )?;
    }
    let snapshot = snapshot_tx(&tx, require_run_tx(&tx, &request.run_id)?)?;
    tx.commit()?;
    Ok(snapshot)
}
