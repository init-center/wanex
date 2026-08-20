use super::{
    get_workspace_change_operation_tx, get_workspace_change_proposal_tx, proposal_is_closed,
    WORKSPACE_CHANGE_PROPOSAL_SELECT,
};
use crate::event_store::append_event_tx;
use crate::rows::{
    row_to_workspace_change_proposal, row_to_workspace_change_proposal_apply_attempt,
};
use crate::{
    ClaimWorkspaceChangeProposalApply, EventScope, ListWorkspaceChangeProposalApplyAttempts,
    MarkWorkspaceChangeProposalRecoveryRequired, RenewWorkspaceChangeProposalApply, Result,
    SettleWorkspaceChangeProposalApply, SystemService, SystemServiceError,
    WorkspaceChangeOperationRecord, WorkspaceChangeProposalApplyAttemptRecord,
    WorkspaceChangeProposalApplyClaimResult, WorkspaceChangeProposalApplySettlement,
    WorkspaceChangeProposalRecord, WorkspaceChangeProposalRecoveryResult,
};
use rusqlite::{params, OptionalExtension};
use sha2::{Digest, Sha256};
use std::time::{Duration, Instant};
use uuid::Uuid;

const APPLY_CLAIM_BUSY_TIMEOUT: Duration = Duration::from_millis(25);
const APPLY_CLAIM_FINAL_BUSY_TIMEOUT: Duration = Duration::from_secs(5);
const APPLY_CLAIM_RETRY_BUDGET: Duration = Duration::from_secs(5);

const WORKSPACE_CHANGE_PROPOSAL_APPLY_ATTEMPT_SELECT: &str = "SELECT
    id, proposal_id, owner_id, claim_token_sha256, state, lease_expires_at,
    workspace_operation_id, metadata_json, failure_json,
    claimed_at, updated_at, finished_at
 FROM workspace_change_proposal_apply_attempt";

impl SystemService {
    pub fn claim_workspace_change_proposal_apply(
        &self,
        request: &ClaimWorkspaceChangeProposalApply,
    ) -> Result<WorkspaceChangeProposalApplyClaimResult> {
        validate_claim_workspace_change_proposal_apply(request)?;
        let _claim_guard = self
            .workspace_apply_claim_gate
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let deadline = Instant::now() + APPLY_CLAIM_RETRY_BUDGET;
        let mut retry = 0_u64;
        loop {
            match self.observe_workspace_change_proposal_apply_claim(request) {
                Ok(Some(observed)) => return Ok(observed),
                Ok(None) => {}
                Err(error) if crate::db::is_sqlite_busy(&error) => {
                    if Instant::now() >= deadline {
                        return self.claim_workspace_change_proposal_apply_once(
                            request,
                            APPLY_CLAIM_FINAL_BUSY_TIMEOUT,
                        );
                    }
                    retry += 1;
                    std::thread::sleep(Duration::from_millis(retry.min(8)));
                    continue;
                }
                Err(error) => return Err(error),
            }
            match self.claim_workspace_change_proposal_apply_once(request, APPLY_CLAIM_BUSY_TIMEOUT)
            {
                Err(error) if crate::db::is_sqlite_busy(&error) => {
                    if Instant::now() >= deadline {
                        return self.claim_workspace_change_proposal_apply_once(
                            request,
                            APPLY_CLAIM_FINAL_BUSY_TIMEOUT,
                        );
                    }
                    retry += 1;
                    std::thread::sleep(Duration::from_millis(retry.min(8)));
                }
                result => return result,
            }
        }
    }

    fn claim_workspace_change_proposal_apply_once(
        &self,
        request: &ClaimWorkspaceChangeProposalApply,
        busy_timeout: Duration,
    ) -> Result<WorkspaceChangeProposalApplyClaimResult> {
        let token_hash = claim_token_hash(&request.claim_token);
        let now = crate::util::now_ms();
        let lease_expires_at = now.checked_add(request.lease_ms).ok_or_else(|| {
            SystemServiceError::InvalidInput("workspace apply lease overflow".to_string())
        })?;
        let metadata_json = request
            .metadata
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let mut conn = self.connect_with_busy_timeout(busy_timeout)?;
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;
        let proposal =
            get_workspace_change_proposal_tx(&tx, &request.proposal_id)?.ok_or_else(|| {
                SystemServiceError::Invariant(format!(
                    "workspace proposal does not exist: {}",
                    request.proposal_id
                ))
            })?;

        if proposal.state == "recovery_required" {
            tx.commit()?;
            return Ok(WorkspaceChangeProposalApplyClaimResult {
                status: "recovery_required".to_string(),
                proposal,
                attempt: None,
            });
        }

        if proposal.state == "applying" {
            let active =
                get_active_workspace_change_proposal_apply_attempt_tx(&tx, &request.proposal_id)?;
            let Some(active) = active else {
                return Err(SystemServiceError::Invariant(format!(
                    "workspace proposal is applying without an active attempt: {}",
                    request.proposal_id
                )));
            };
            if active.lease_expires_at <= now {
                let recovery = mark_workspace_change_proposal_recovery_required_tx(
                    &tx, &proposal, &active, now,
                )?;
                tx.commit()?;
                return Ok(WorkspaceChangeProposalApplyClaimResult {
                    status: "recovery_required".to_string(),
                    proposal: recovery.0,
                    attempt: Some(recovery.1),
                });
            }
            tx.commit()?;
            return Ok(WorkspaceChangeProposalApplyClaimResult {
                status: "busy".to_string(),
                proposal,
                attempt: None,
            });
        }

        if proposal.state != "apply_requested" {
            let status = if proposal_is_closed(&proposal.state) {
                "already_terminal"
            } else {
                "not_ready"
            };
            tx.commit()?;
            return Ok(WorkspaceChangeProposalApplyClaimResult {
                status: status.to_string(),
                proposal,
                attempt: None,
            });
        }

        tx.execute(
            "INSERT INTO workspace_change_proposal_apply_attempt (
                id, proposal_id, owner_id, claim_token_sha256, state,
                lease_expires_at, workspace_operation_id, metadata_json,
                failure_json, claimed_at, updated_at, finished_at
             ) VALUES (?, ?, ?, ?, 'active', ?, NULL, ?, NULL, ?, ?, NULL)",
            params![
                request.attempt_id,
                request.proposal_id,
                request.owner_id,
                token_hash,
                lease_expires_at,
                metadata_json,
                now,
                now,
            ],
        )?;
        tx.execute(
            "UPDATE workspace_change_proposal
             SET state = 'applying', updated_at = ?
             WHERE id = ? AND state = 'apply_requested'",
            params![now, request.proposal_id],
        )?;
        append_event_tx(
            &tx,
            &format!("evt_{}", Uuid::now_v7()),
            "workspace.change_proposal.apply_claimed",
            &EventScope::default(),
            &serde_json::json!({
                "proposalId": request.proposal_id,
                "attemptId": request.attempt_id,
                "state": "applying",
                "updatedAt": now
            }),
            now,
        )?;
        let proposal =
            get_workspace_change_proposal_tx(&tx, &request.proposal_id)?.ok_or_else(|| {
                SystemServiceError::Invariant("workspace apply claim lost proposal".to_string())
            })?;
        let attempt = get_workspace_change_proposal_apply_attempt_tx(&tx, &request.attempt_id)?
            .ok_or_else(|| {
                SystemServiceError::Invariant("workspace apply claim lost attempt".to_string())
            })?;
        tx.commit()?;
        Ok(WorkspaceChangeProposalApplyClaimResult {
            status: "claimed".to_string(),
            proposal,
            attempt: Some(attempt),
        })
    }

    fn observe_workspace_change_proposal_apply_claim(
        &self,
        request: &ClaimWorkspaceChangeProposalApply,
    ) -> Result<Option<WorkspaceChangeProposalApplyClaimResult>> {
        let conn = self.connect_with_busy_timeout(APPLY_CLAIM_BUSY_TIMEOUT)?;
        let proposal = conn
            .query_row(
                &format!("{WORKSPACE_CHANGE_PROPOSAL_SELECT} WHERE id = ?"),
                params![request.proposal_id],
                row_to_workspace_change_proposal,
            )
            .optional()?
            .ok_or_else(|| {
                SystemServiceError::Invariant(format!(
                    "workspace proposal does not exist: {}",
                    request.proposal_id
                ))
            })?;
        if proposal.state == "apply_requested" {
            return Ok(None);
        }
        if proposal.state == "applying" {
            let attempt = conn
                .query_row(
                    &format!(
                        "{WORKSPACE_CHANGE_PROPOSAL_APPLY_ATTEMPT_SELECT}
                         WHERE proposal_id = ? AND state = 'active'"
                    ),
                    params![request.proposal_id],
                    row_to_workspace_change_proposal_apply_attempt,
                )
                .optional()?;
            let Some(attempt) = attempt else {
                return Ok(None);
            };
            if attempt.lease_expires_at <= crate::util::now_ms() {
                return Ok(None);
            }
            return Ok(Some(WorkspaceChangeProposalApplyClaimResult {
                status: "busy".to_string(),
                proposal,
                attempt: None,
            }));
        }
        let status = if proposal.state == "recovery_required" {
            "recovery_required"
        } else if proposal_is_closed(&proposal.state) {
            "already_terminal"
        } else {
            "not_ready"
        };
        Ok(Some(WorkspaceChangeProposalApplyClaimResult {
            status: status.to_string(),
            proposal,
            attempt: None,
        }))
    }

    pub fn renew_workspace_change_proposal_apply(
        &self,
        request: &RenewWorkspaceChangeProposalApply,
    ) -> Result<WorkspaceChangeProposalApplyAttemptRecord> {
        validate_renew_workspace_change_proposal_apply(request)?;
        let token_hash = claim_token_hash(&request.claim_token);
        let now = crate::util::now_ms();
        let lease_expires_at = now.checked_add(request.lease_ms).ok_or_else(|| {
            SystemServiceError::InvalidInput("workspace apply lease overflow".to_string())
        })?;
        let mut conn = self.connect()?;
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;
        let proposal =
            get_workspace_change_proposal_tx(&tx, &request.proposal_id)?.ok_or_else(|| {
                SystemServiceError::NotFound(format!(
                    "workspace proposal does not exist: {}",
                    request.proposal_id
                ))
            })?;
        if proposal.state != "applying" {
            return Err(SystemServiceError::Conflict(format!(
                "workspace proposal is not applying: {} ({})",
                request.proposal_id, proposal.state
            )));
        }
        let attempt = get_workspace_change_proposal_apply_attempt_tx(&tx, &request.attempt_id)?
            .ok_or_else(|| {
                SystemServiceError::NotFound(format!(
                    "workspace apply attempt does not exist: {}",
                    request.attempt_id
                ))
            })?;
        assert_live_apply_attempt(
            &attempt,
            &request.proposal_id,
            &request.attempt_id,
            &token_hash,
            now,
        )?;
        tx.execute(
            "UPDATE workspace_change_proposal_apply_attempt
             SET lease_expires_at = ?, updated_at = ?
             WHERE id = ? AND proposal_id = ? AND state = 'active' AND claim_token_sha256 = ?",
            params![
                lease_expires_at,
                now,
                request.attempt_id,
                request.proposal_id,
                token_hash
            ],
        )?;
        let renewed = get_workspace_change_proposal_apply_attempt_tx(&tx, &request.attempt_id)?
            .ok_or_else(|| {
                SystemServiceError::Invariant("workspace apply renewal lost attempt".to_string())
            })?;
        tx.commit()?;
        Ok(renewed)
    }

    pub fn settle_workspace_change_proposal_apply(
        &self,
        request: &SettleWorkspaceChangeProposalApply,
    ) -> Result<WorkspaceChangeProposalApplySettlement> {
        validate_settle_workspace_change_proposal_apply(request)?;
        let token_hash = claim_token_hash(&request.claim_token);
        let now = crate::util::now_ms();
        let failure_json = request
            .failure
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let next_proposal_state = match request.outcome.as_str() {
            "applied" => "applied",
            "apply_failed" => "apply_failed",
            "recovery_required" => "recovery_required",
            _ => unreachable!("settlement outcome is validated before use"),
        };
        let attempt_state = match request.outcome.as_str() {
            "applied" => "applied",
            "apply_failed" => "failed",
            "recovery_required" => "recovery_required",
            _ => unreachable!("settlement outcome is validated before use"),
        };
        let closed_at = if request.outcome == "recovery_required" {
            None
        } else {
            Some(now)
        };
        let mut conn = self.connect()?;
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;
        let proposal =
            get_workspace_change_proposal_tx(&tx, &request.proposal_id)?.ok_or_else(|| {
                SystemServiceError::NotFound(format!(
                    "workspace proposal does not exist: {}",
                    request.proposal_id
                ))
            })?;
        if proposal.state != "applying" {
            return Err(SystemServiceError::Conflict(format!(
                "workspace proposal is not applying: {} ({})",
                request.proposal_id, proposal.state
            )));
        }
        let attempt = get_workspace_change_proposal_apply_attempt_tx(&tx, &request.attempt_id)?
            .ok_or_else(|| {
                SystemServiceError::NotFound(format!(
                    "workspace apply attempt does not exist: {}",
                    request.attempt_id
                ))
            })?;
        assert_live_apply_attempt(
            &attempt,
            &request.proposal_id,
            &request.attempt_id,
            &token_hash,
            now,
        )?;
        let workspace_operation = request
            .workspace_operation_id
            .as_deref()
            .map(|operation_id| get_workspace_change_operation_tx(&tx, operation_id))
            .transpose()?;
        validate_apply_settlement_operation(&proposal, request, workspace_operation.as_ref())?;
        tx.execute(
            "UPDATE workspace_change_proposal_apply_attempt
             SET state = ?, workspace_operation_id = ?, failure_json = ?,
                 updated_at = ?, finished_at = ?
             WHERE id = ? AND proposal_id = ? AND state = 'active' AND claim_token_sha256 = ?",
            params![
                attempt_state,
                request.workspace_operation_id,
                failure_json,
                now,
                now,
                request.attempt_id,
                request.proposal_id,
                token_hash,
            ],
        )?;
        tx.execute(
            "UPDATE workspace_change_proposal
             SET state = ?, updated_at = ?, closed_at = ?
             WHERE id = ? AND state = 'applying'",
            params![next_proposal_state, now, closed_at, request.proposal_id],
        )?;
        append_event_tx(
            &tx,
            &format!("evt_{}", Uuid::now_v7()),
            "workspace.change_proposal.apply_settled",
            &EventScope::default(),
            &serde_json::json!({
                "proposalId": request.proposal_id,
                "attemptId": request.attempt_id,
                "outcome": request.outcome,
                "state": next_proposal_state,
                "updatedAt": now
            }),
            now,
        )?;
        let proposal =
            get_workspace_change_proposal_tx(&tx, &request.proposal_id)?.ok_or_else(|| {
                SystemServiceError::Invariant(
                    "workspace apply settlement lost proposal".to_string(),
                )
            })?;
        let attempt = get_workspace_change_proposal_apply_attempt_tx(&tx, &request.attempt_id)?
            .ok_or_else(|| {
                SystemServiceError::Invariant("workspace apply settlement lost attempt".to_string())
            })?;
        tx.commit()?;
        Ok(WorkspaceChangeProposalApplySettlement { proposal, attempt })
    }

    pub fn mark_workspace_change_proposal_recovery_required(
        &self,
        request: &MarkWorkspaceChangeProposalRecoveryRequired,
    ) -> Result<WorkspaceChangeProposalRecoveryResult> {
        if request.proposal_id.is_empty() {
            return Err(SystemServiceError::Invariant(
                "workspace recovery proposal_id must not be empty".to_string(),
            ));
        }
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;
        let proposal =
            get_workspace_change_proposal_tx(&tx, &request.proposal_id)?.ok_or_else(|| {
                SystemServiceError::NotFound(format!(
                    "workspace proposal does not exist: {}",
                    request.proposal_id
                ))
            })?;
        let Some(attempt) =
            get_active_workspace_change_proposal_apply_attempt_tx(&tx, &request.proposal_id)?
        else {
            if proposal.state == "applying" {
                return Err(SystemServiceError::Invariant(format!(
                    "workspace proposal is applying without an active attempt: {}",
                    request.proposal_id
                )));
            }
            tx.commit()?;
            return Ok(WorkspaceChangeProposalRecoveryResult {
                status: "unchanged".to_string(),
                proposal,
                attempt: None,
            });
        };
        if attempt.lease_expires_at > now {
            tx.commit()?;
            return Ok(WorkspaceChangeProposalRecoveryResult {
                status: "not_due".to_string(),
                proposal,
                attempt: Some(attempt),
            });
        }
        let recovery =
            mark_workspace_change_proposal_recovery_required_tx(&tx, &proposal, &attempt, now)?;
        tx.commit()?;
        Ok(WorkspaceChangeProposalRecoveryResult {
            status: "marked".to_string(),
            proposal: recovery.0,
            attempt: Some(recovery.1),
        })
    }

    pub fn list_workspace_change_proposal_apply_attempts(
        &self,
        request: &ListWorkspaceChangeProposalApplyAttempts,
    ) -> Result<Vec<WorkspaceChangeProposalApplyAttemptRecord>> {
        if request.proposal_id.is_empty() {
            return Err(SystemServiceError::Invariant(
                "workspace apply attempts proposal_id must not be empty".to_string(),
            ));
        }
        let limit = request.limit.unwrap_or(100).clamp(1, 1000);
        let conn = self.connect()?;
        let mut stmt = conn.prepare(&format!(
            "{WORKSPACE_CHANGE_PROPOSAL_APPLY_ATTEMPT_SELECT}
             WHERE proposal_id = ? ORDER BY claimed_at ASC, id ASC LIMIT ?"
        ))?;
        let records = collect_apply_attempts(stmt.query_map(
            params![request.proposal_id, limit],
            row_to_workspace_change_proposal_apply_attempt,
        )?)?;
        Ok(records)
    }
}

fn validate_apply_lease(lease_ms: i64) -> Result<()> {
    if !(10..=300_000).contains(&lease_ms) {
        return Err(SystemServiceError::InvalidInput(
            "workspace apply lease_ms must be between 10 and 300000".to_string(),
        ));
    }
    Ok(())
}

fn validate_claim_workspace_change_proposal_apply(
    request: &ClaimWorkspaceChangeProposalApply,
) -> Result<()> {
    if request.proposal_id.is_empty()
        || request.attempt_id.is_empty()
        || request.owner_id.is_empty()
        || request.claim_token.len() < 32
        || request.claim_token.len() > 512
    {
        return Err(SystemServiceError::Invariant(
            "workspace apply claim identifiers must not be empty".to_string(),
        ));
    }
    validate_apply_lease(request.lease_ms)
}

fn validate_renew_workspace_change_proposal_apply(
    request: &RenewWorkspaceChangeProposalApply,
) -> Result<()> {
    if request.proposal_id.is_empty()
        || request.attempt_id.is_empty()
        || request.claim_token.len() < 32
        || request.claim_token.len() > 512
    {
        return Err(SystemServiceError::Invariant(
            "workspace apply renewal identifiers must not be empty".to_string(),
        ));
    }
    validate_apply_lease(request.lease_ms)
}

fn validate_settle_workspace_change_proposal_apply(
    request: &SettleWorkspaceChangeProposalApply,
) -> Result<()> {
    if request.proposal_id.is_empty()
        || request.attempt_id.is_empty()
        || request.claim_token.len() < 32
        || request.claim_token.len() > 512
    {
        return Err(SystemServiceError::Invariant(
            "workspace apply settlement identifiers must not be empty".to_string(),
        ));
    }
    if !matches!(
        request.outcome.as_str(),
        "applied" | "apply_failed" | "recovery_required"
    ) {
        return Err(SystemServiceError::Invariant(format!(
            "invalid workspace apply settlement outcome: {}",
            request.outcome
        )));
    }
    if request.outcome == "applied" && request.failure.is_some() {
        return Err(SystemServiceError::Invariant(
            "successful workspace apply settlement cannot contain failure".to_string(),
        ));
    }
    if request.outcome != "applied" && request.failure.is_none() {
        return Err(SystemServiceError::Invariant(
            "non-successful workspace apply settlement requires failure".to_string(),
        ));
    }
    if request.outcome == "applied" && request.workspace_operation_id.is_none() {
        return Err(SystemServiceError::InvalidInput(
            "successful workspace apply settlement requires workspace operation evidence"
                .to_string(),
        ));
    }
    Ok(())
}

fn validate_apply_settlement_operation(
    proposal: &WorkspaceChangeProposalRecord,
    request: &SettleWorkspaceChangeProposalApply,
    operation: Option<&WorkspaceChangeOperationRecord>,
) -> Result<()> {
    let Some(operation) = operation else {
        return Ok(());
    };
    if operation.changeset_id != proposal.changeset_id || operation.operation != "apply" {
        return Err(SystemServiceError::Conflict(
            "workspace apply settlement operation does not belong to proposal changeset"
                .to_string(),
        ));
    }
    let status_matches = match request.outcome.as_str() {
        "applied" => matches!(operation.status.as_str(), "applied" | "already_applied"),
        "apply_failed" => operation.status == "conflicted",
        "recovery_required" => true,
        _ => false,
    };
    if !status_matches {
        return Err(SystemServiceError::Conflict(format!(
            "workspace apply settlement outcome does not match operation status: {}/{}",
            request.outcome, operation.status
        )));
    }
    Ok(())
}

pub(super) fn claim_token_hash(token: &str) -> String {
    let mut digest = Sha256::new();
    digest.update(token.as_bytes());
    format!("{:x}", digest.finalize())
}

pub(super) fn assert_live_apply_attempt(
    attempt: &WorkspaceChangeProposalApplyAttemptRecord,
    proposal_id: &str,
    attempt_id: &str,
    token_hash: &str,
    now: i64,
) -> Result<()> {
    if attempt.proposal_id != proposal_id || attempt.id != attempt_id {
        return Err(SystemServiceError::Conflict(
            "workspace apply attempt does not belong to proposal".to_string(),
        ));
    }
    if attempt.state != "active" || attempt.lease_expires_at <= now {
        return Err(SystemServiceError::Conflict(
            "workspace apply attempt is no longer live".to_string(),
        ));
    }
    if attempt.claim_token_sha256 != token_hash {
        return Err(SystemServiceError::Conflict(
            "workspace apply claim token is invalid".to_string(),
        ));
    }
    Ok(())
}

pub(super) fn get_workspace_change_proposal_apply_attempt_tx(
    tx: &rusqlite::Transaction<'_>,
    attempt_id: &str,
) -> Result<Option<WorkspaceChangeProposalApplyAttemptRecord>> {
    tx.query_row(
        &format!("{WORKSPACE_CHANGE_PROPOSAL_APPLY_ATTEMPT_SELECT} WHERE id = ?"),
        params![attempt_id],
        row_to_workspace_change_proposal_apply_attempt,
    )
    .optional()
    .map_err(Into::into)
}

fn get_active_workspace_change_proposal_apply_attempt_tx(
    tx: &rusqlite::Transaction<'_>,
    proposal_id: &str,
) -> Result<Option<WorkspaceChangeProposalApplyAttemptRecord>> {
    tx.query_row(
        &format!(
            "{WORKSPACE_CHANGE_PROPOSAL_APPLY_ATTEMPT_SELECT}
             WHERE proposal_id = ? AND state = 'active'"
        ),
        params![proposal_id],
        row_to_workspace_change_proposal_apply_attempt,
    )
    .optional()
    .map_err(Into::into)
}

fn mark_workspace_change_proposal_recovery_required_tx(
    tx: &rusqlite::Transaction<'_>,
    proposal: &WorkspaceChangeProposalRecord,
    attempt: &WorkspaceChangeProposalApplyAttemptRecord,
    now: i64,
) -> Result<(
    WorkspaceChangeProposalRecord,
    WorkspaceChangeProposalApplyAttemptRecord,
)> {
    tx.execute(
        "UPDATE workspace_change_proposal_apply_attempt
         SET state = 'recovery_required', updated_at = ?, finished_at = ?
         WHERE id = ? AND proposal_id = ? AND state = 'active'",
        params![now, now, attempt.id, proposal.id],
    )?;
    tx.execute(
        "UPDATE workspace_change_proposal
         SET state = 'recovery_required', updated_at = ?
         WHERE id = ? AND state = 'applying'",
        params![now, proposal.id],
    )?;
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        "workspace.change_proposal.recovery_required",
        &EventScope::default(),
        &serde_json::json!({
            "proposalId": proposal.id,
            "attemptId": attempt.id,
            "state": "recovery_required",
            "updatedAt": now
        }),
        now,
    )?;
    let proposal = get_workspace_change_proposal_tx(tx, &proposal.id)?.ok_or_else(|| {
        SystemServiceError::Invariant("workspace recovery lost proposal".to_string())
    })?;
    let attempt =
        get_workspace_change_proposal_apply_attempt_tx(tx, &attempt.id)?.ok_or_else(|| {
            SystemServiceError::Invariant("workspace recovery lost attempt".to_string())
        })?;
    Ok((proposal, attempt))
}

fn collect_apply_attempts(
    rows: impl Iterator<Item = rusqlite::Result<WorkspaceChangeProposalApplyAttemptRecord>>,
) -> Result<Vec<WorkspaceChangeProposalApplyAttemptRecord>> {
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}
