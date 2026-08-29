use super::repository::{
    collect, get_run_tx, row_to_attempt, row_to_run, snapshot_tx, ATTEMPT_SELECT, RUN_SELECT,
};
use super::validation::{require_non_empty, validate_list_runs};
use crate::{
    ListWorkspaceTaskAttempts, ListWorkspaceTaskRuns, Result, SystemService,
    WorkspaceTaskAttemptRecord, WorkspaceTaskRunSnapshot,
};
use rusqlite::{params, params_from_iter, types::Value as SqlValue};

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
        validate_list_runs(request)?;
        let limit = request.limit.unwrap_or_else(|| {
            request
                .run_ids
                .as_ref()
                .map_or(100, |run_ids| run_ids.len() as i64)
        });
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let runs = {
            let mut clauses = Vec::new();
            let mut values = Vec::new();
            if let Some(run_ids) = request.run_ids.as_ref() {
                clauses.push(format!("r.id IN ({})", vec!["?"; run_ids.len()].join(", ")));
                values.extend(run_ids.iter().cloned().map(SqlValue::Text));
            }
            if let Some(workspace_id) = request.workspace_id.as_ref() {
                clauses.push("r.workspace_id = ?".to_string());
                values.push(SqlValue::Text(workspace_id.clone()));
            }
            if let Some(repository_id) = request.repository_id.as_ref() {
                clauses.push("r.repository_id = ?".to_string());
                values.push(SqlValue::Text(repository_id.clone()));
            }
            if let Some(state) = request.state.as_ref() {
                clauses.push("r.state = ?".to_string());
                values.push(SqlValue::Text(state.clone()));
            }
            if let Some(lease_expires_before) = request.lease_expires_before {
                clauses.push(
                    "EXISTS (
                       SELECT 1 FROM workspace_task_attempt a
                       WHERE a.run_id = r.id AND a.state = 'active'
                         AND a.lease_expires_at <= ?
                     )"
                    .to_string(),
                );
                values.push(SqlValue::Integer(lease_expires_before));
            }
            values.push(SqlValue::Integer(limit));
            let where_clause = if clauses.is_empty() {
                String::new()
            } else {
                format!(" WHERE {}", clauses.join(" AND "))
            };
            let mut stmt = tx.prepare(&format!(
                "{RUN_SELECT} r{where_clause}
                 ORDER BY r.updated_at ASC, r.id ASC LIMIT ?"
            ))?;
            let rows = stmt.query_map(params_from_iter(values), row_to_run)?;
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
