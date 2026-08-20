use super::repository::{
    collect, get_run_tx, row_to_attempt, row_to_run, snapshot_tx, ATTEMPT_SELECT, RUN_SELECT,
};
use super::validation::{require_non_empty, validate_run_state};
use crate::{
    ListWorkspaceTaskAttempts, ListWorkspaceTaskRuns, Result, SystemService,
    WorkspaceTaskAttemptRecord, WorkspaceTaskRunSnapshot,
};
use rusqlite::params;

impl SystemService {
    pub fn get_workspace_task_run(&self, run_id: &str) -> Result<Option<WorkspaceTaskRunSnapshot>> {
        require_non_empty(run_id, "workspace task run id")?;
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let snapshot = get_run_tx(&tx, run_id)?
            .map(|run| snapshot_tx(&tx, run))
            .transpose()?;
        tx.commit()?;
        Ok(snapshot)
    }

    pub fn list_workspace_task_runs(
        &self,
        request: &ListWorkspaceTaskRuns,
    ) -> Result<Vec<WorkspaceTaskRunSnapshot>> {
        if let Some(state) = request.state.as_deref() {
            validate_run_state(state)?;
        }
        let limit = request.limit.unwrap_or(100).clamp(1, 1_000);
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let runs = {
            let mut stmt = tx.prepare(&format!(
                "{RUN_SELECT} r
                 WHERE (?1 IS NULL OR r.workspace_id = ?1)
                   AND (?2 IS NULL OR r.state = ?2)
                   AND (?3 IS NULL OR EXISTS (
                     SELECT 1 FROM workspace_task_attempt a
                     WHERE a.run_id = r.id AND a.state = 'active'
                       AND a.lease_expires_at <= ?3
                   ))
                 ORDER BY r.updated_at ASC, r.id ASC LIMIT ?4"
            ))?;
            let rows = stmt.query_map(
                params![
                    request.workspace_id,
                    request.state,
                    request.lease_expires_before,
                    limit
                ],
                row_to_run,
            )?;
            collect(rows)?
        };
        let mut snapshots = Vec::with_capacity(runs.len());
        for run in runs {
            snapshots.push(snapshot_tx(&tx, run)?);
        }
        tx.commit()?;
        Ok(snapshots)
    }

    pub fn list_workspace_task_attempts(
        &self,
        request: &ListWorkspaceTaskAttempts,
    ) -> Result<Vec<WorkspaceTaskAttemptRecord>> {
        require_non_empty(&request.run_id, "workspace task run id")?;
        let limit = request.limit.unwrap_or(100).clamp(1, 1_000);
        let conn = self.connect()?;
        let mut stmt = conn.prepare(&format!(
            "{ATTEMPT_SELECT} WHERE run_id = ? ORDER BY started_at ASC, id ASC LIMIT ?"
        ))?;
        let rows = stmt.query_map(params![request.run_id, limit], row_to_attempt)?;
        let attempts = collect(rows)?;
        Ok(attempts)
    }
}
