use super::repository::{
    append_task_event, finish_attempt_tx, require_exact_attempt_tx, require_live_attempt_tx,
    require_run_tx, snapshot_tx,
};
use super::validation::{
    optional_json, require_state, validate_collection, validate_identity, validate_json_size,
    validate_revision, validate_runtime_ref,
};
use crate::{
    BeginWorkspaceTaskCollection, MarkWorkspaceTaskActive, MarkWorkspaceTaskAttention, Result,
    SystemService, SystemServiceError, WorkspaceTaskRunSnapshot,
};
use rusqlite::params;

impl SystemService {
    pub fn mark_workspace_task_active(
        &self,
        request: &MarkWorkspaceTaskActive,
    ) -> Result<WorkspaceTaskRunSnapshot> {
        validate_identity(&request.run_id, &request.attempt_id, &request.claim_token)?;
        validate_revision(request.base_revision.as_deref())?;
        validate_runtime_ref(request.runtime_ref.as_deref())?;
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
        if run.state == "active" {
            if run.base_revision != request.base_revision || run.runtime_ref != request.runtime_ref
            {
                return Err(SystemServiceError::Conflict(
                    "workspace task active replay changed prepared identity".to_string(),
                ));
            }
            let snapshot = snapshot_tx(&tx, run)?;
            tx.commit()?;
            return Ok(snapshot);
        }
        require_state(&run, "preparing", "active")?;
        if run.access == "writable"
            && (request.base_revision.is_none() || request.runtime_ref.is_none())
        {
            return Err(SystemServiceError::InvalidInput(
                "writable workspace task requires base revision and runtime ref".to_string(),
            ));
        }
        tx.execute(
            "UPDATE workspace_task_run
             SET state = 'active', base_revision = ?, runtime_ref = ?, updated_at = ?
             WHERE id = ? AND state = 'preparing'",
            params![
                request.base_revision,
                request.runtime_ref,
                now,
                request.run_id
            ],
        )?;
        append_task_event(
            &tx,
            "workspace.task_run.active",
            &request.run_id,
            "active",
            now,
        )?;
        let snapshot = snapshot_tx(&tx, require_run_tx(&tx, &request.run_id)?)?;
        tx.commit()?;
        Ok(snapshot)
    }

    pub fn begin_workspace_task_collection(
        &self,
        request: &BeginWorkspaceTaskCollection,
    ) -> Result<WorkspaceTaskRunSnapshot> {
        validate_identity(&request.run_id, &request.attempt_id, &request.claim_token)?;
        validate_collection(request)?;
        let now = crate::util::now_ms();
        let resources_json = serde_json::to_string(&request.resource_ids)?;
        let failure_json = optional_json(&request.failure)?;
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
        if run.state == "collecting" {
            if run.execution_outcome.as_deref() != Some(request.execution_outcome.as_str())
                || run.summary != request.summary
                || run.resource_ids != request.resource_ids
                || run.failure != request.failure
            {
                return Err(SystemServiceError::Conflict(
                    "workspace task collection replay changed execution evidence".to_string(),
                ));
            }
            let snapshot = snapshot_tx(&tx, run)?;
            tx.commit()?;
            return Ok(snapshot);
        }
        require_state(&run, "active", "collecting")?;
        tx.execute(
            "UPDATE workspace_task_run
             SET state = 'collecting', execution_outcome = ?, summary = ?,
                 resource_ids_json = ?, failure_json = ?, updated_at = ?
             WHERE id = ? AND state = 'active'",
            params![
                request.execution_outcome,
                request.summary,
                resources_json,
                failure_json,
                now,
                request.run_id
            ],
        )?;
        append_task_event(
            &tx,
            "workspace.task_run.collecting",
            &request.run_id,
            "collecting",
            now,
        )?;
        let snapshot = snapshot_tx(&tx, require_run_tx(&tx, &request.run_id)?)?;
        tx.commit()?;
        Ok(snapshot)
    }

    pub fn mark_workspace_task_attention(
        &self,
        request: &MarkWorkspaceTaskAttention,
    ) -> Result<WorkspaceTaskRunSnapshot> {
        validate_identity(&request.run_id, &request.attempt_id, &request.claim_token)?;
        validate_json_size(&request.failure, "workspace task failure")?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;
        let run = require_run_tx(&tx, &request.run_id)?;
        if run.state == "released" {
            return Err(SystemServiceError::Conflict(
                "released workspace task cannot require attention".to_string(),
            ));
        }
        if run.state == "attention" {
            require_exact_attempt_tx(
                &tx,
                &request.run_id,
                &request.attempt_id,
                &request.claim_token,
            )?;
            if run.failure.as_ref() != Some(&request.failure) {
                return Err(SystemServiceError::Conflict(
                    "workspace task attention replay changed failure".to_string(),
                ));
            }
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
        tx.execute(
            "UPDATE workspace_task_run
             SET state = 'attention', failure_json = ?, updated_at = ?, finished_at = ?
             WHERE id = ?",
            params![
                serde_json::to_string(&request.failure)?,
                now,
                now,
                request.run_id
            ],
        )?;
        finish_attempt_tx(
            &tx,
            &request.attempt_id,
            "failed",
            Some(&request.failure),
            now,
        )?;
        append_task_event(
            &tx,
            "workspace.task_run.attention",
            &request.run_id,
            "attention",
            now,
        )?;
        let snapshot = snapshot_tx(&tx, require_run_tx(&tx, &request.run_id)?)?;
        tx.commit()?;
        Ok(snapshot)
    }
}
