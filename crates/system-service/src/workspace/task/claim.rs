use super::super::apply_claim::claim_token_hash;
use super::repository::{
    append_task_event, assert_same_run, existing_claim_result, get_active_attempt_tx,
    get_attempt_tx, get_run_tx, require_live_attempt_tx, require_run_tx, snapshot_tx,
};
use super::validation::{
    checked_lease, validate_begin, validate_claim, validate_identity, validate_lease,
};
use crate::{
    BeginWorkspaceTaskRun, ClaimWorkspaceTaskRecovery, RenewWorkspaceTaskRun, Result,
    SystemService, SystemServiceError, WorkspaceTaskAttemptRecord, WorkspaceTaskClaimResult,
};
use rusqlite::params;

impl SystemService {
    pub fn begin_workspace_task_run(
        &self,
        request: &BeginWorkspaceTaskRun,
    ) -> Result<WorkspaceTaskClaimResult> {
        validate_begin(request)?;
        let token_hash = claim_token_hash(&request.claim_token);
        let now = crate::util::now_ms();
        let lease_expires_at = checked_lease(now, request.lease_ms)?;
        let mut conn = self.connect()?;
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;

        if let Some(existing) = get_run_tx(&tx, &request.id)? {
            assert_same_run(&existing, request)?;
            let result = existing_claim_result(&tx, existing, request, &token_hash, now)?;
            tx.commit()?;
            return Ok(result);
        }
        if get_attempt_tx(&tx, &request.attempt_id)?.is_some() {
            return Err(SystemServiceError::Conflict(format!(
                "workspace task attempt id is already used: {}",
                request.attempt_id
            )));
        }
        tx.execute(
            "INSERT INTO workspace_task_run (
                id, workspace_id, principal_id, access, repository_id, isolation_id,
                state, resource_ids_json, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, 'preparing', '[]', ?, ?)",
            params![
                request.id,
                request.workspace_id,
                request.principal_id,
                request.access,
                request.repository_id,
                request.isolation_id,
                now,
                now
            ],
        )?;
        tx.execute(
            "INSERT INTO workspace_task_attempt (
                id, run_id, owner_id, claim_token_sha256, kind, state,
                lease_expires_at, started_at, updated_at
             ) VALUES (?, ?, ?, ?, 'execution', 'active', ?, ?, ?)",
            params![
                request.attempt_id,
                request.id,
                request.owner_id,
                token_hash,
                lease_expires_at,
                now,
                now
            ],
        )?;
        append_task_event(
            &tx,
            "workspace.task_run.begun",
            &request.id,
            "preparing",
            now,
        )?;
        let snapshot = snapshot_tx(&tx, require_run_tx(&tx, &request.id)?)?;
        tx.commit()?;
        Ok(WorkspaceTaskClaimResult {
            status: "claimed".to_string(),
            snapshot,
        })
    }

    pub fn claim_workspace_task_recovery(
        &self,
        request: &ClaimWorkspaceTaskRecovery,
    ) -> Result<WorkspaceTaskClaimResult> {
        validate_claim(
            &request.run_id,
            &request.attempt_id,
            &request.owner_id,
            &request.claim_token,
            request.lease_ms,
        )?;
        let now = crate::util::now_ms();
        let lease_expires_at = checked_lease(now, request.lease_ms)?;
        let token_hash = claim_token_hash(&request.claim_token);
        let mut conn = self.connect()?;
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;
        let run = require_run_tx(&tx, &request.run_id)?;
        if run.state == "released" {
            let snapshot = snapshot_tx(&tx, run)?;
            tx.commit()?;
            return Ok(WorkspaceTaskClaimResult {
                status: "already_terminal".to_string(),
                snapshot,
            });
        }
        if run.state == "attention" {
            return Err(SystemServiceError::Conflict(
                "workspace task attention requires an explicit resolution policy".to_string(),
            ));
        }
        if let Some(active) = get_active_attempt_tx(&tx, &request.run_id)? {
            if active.lease_expires_at > now {
                let snapshot = snapshot_tx(&tx, run)?;
                tx.commit()?;
                return Ok(WorkspaceTaskClaimResult {
                    status: "busy".to_string(),
                    snapshot,
                });
            }
            tx.execute(
                "UPDATE workspace_task_attempt
                 SET state = 'expired', failure_json = ?, updated_at = ?, finished_at = ?
                 WHERE id = ? AND state = 'active'",
                params![
                    serde_json::to_string(&serde_json::json!({
                        "type": "workspace_task.lease_expired"
                    }))?,
                    now,
                    now,
                    active.id
                ],
            )?;
        }
        if get_attempt_tx(&tx, &request.attempt_id)?.is_some() {
            return Err(SystemServiceError::Conflict(format!(
                "workspace task attempt id is already used: {}",
                request.attempt_id
            )));
        }
        tx.execute(
            "INSERT INTO workspace_task_attempt (
                id, run_id, owner_id, claim_token_sha256, kind, state,
                lease_expires_at, started_at, updated_at
             ) VALUES (?, ?, ?, ?, 'recovery', 'active', ?, ?, ?)",
            params![
                request.attempt_id,
                request.run_id,
                request.owner_id,
                token_hash,
                lease_expires_at,
                now,
                now
            ],
        )?;
        append_task_event(
            &tx,
            "workspace.task_run.recovery_claimed",
            &request.run_id,
            &run.state,
            now,
        )?;
        let snapshot = snapshot_tx(&tx, require_run_tx(&tx, &request.run_id)?)?;
        tx.commit()?;
        Ok(WorkspaceTaskClaimResult {
            status: "claimed".to_string(),
            snapshot,
        })
    }

    pub fn renew_workspace_task_run(
        &self,
        request: &RenewWorkspaceTaskRun,
    ) -> Result<WorkspaceTaskAttemptRecord> {
        validate_identity(&request.run_id, &request.attempt_id, &request.claim_token)?;
        validate_lease(request.lease_ms)?;
        let now = crate::util::now_ms();
        let lease_expires_at = checked_lease(now, request.lease_ms)?;
        let mut conn = self.connect()?;
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;
        require_run_tx(&tx, &request.run_id)?;
        require_live_attempt_tx(
            &tx,
            &request.run_id,
            &request.attempt_id,
            &request.claim_token,
            now,
        )?;
        tx.execute(
            "UPDATE workspace_task_attempt SET lease_expires_at = ?, updated_at = ?
             WHERE id = ? AND run_id = ? AND state = 'active'",
            params![lease_expires_at, now, request.attempt_id, request.run_id],
        )?;
        let attempt = get_attempt_tx(&tx, &request.attempt_id)?.ok_or_else(|| {
            SystemServiceError::Invariant("workspace task renewal lost attempt".to_string())
        })?;
        tx.commit()?;
        Ok(attempt)
    }
}
