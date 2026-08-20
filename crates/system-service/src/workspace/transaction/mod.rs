mod finalization;
mod repository;
mod validation;

use super::apply_claim::{
    assert_live_apply_attempt, claim_token_hash, get_workspace_change_proposal_apply_attempt_tx,
};
use super::{
    get_workspace_change_operation_tx, get_workspace_change_proposal_tx, get_workspace_changeset_tx,
};
use crate::event_store::append_event_tx;
use crate::rows::{
    row_to_workspace_change_transaction, row_to_workspace_change_transaction_attempt,
};
use crate::{
    BeginWorkspaceChangeTransaction, BeginWorkspaceChangeTransactionCommit,
    ClaimWorkspaceChangeTransactionRecovery, EventScope, ListWorkspaceChangeTransactionAttempts,
    ListWorkspaceChangeTransactions, MarkWorkspaceChangeTransactionPrepared,
    ReconcileWorkspaceChangeTransactionFiles, RecordWorkspaceChangeTransactionFileCommitted,
    RecordWorkspaceChangeTransactionPlan, RenewWorkspaceChangeTransaction, Result, SystemService,
    SystemServiceError, WorkspaceChangeTransactionAttemptRecord,
    WorkspaceChangeTransactionClaimResult, WorkspaceChangeTransactionReconciliation,
    WorkspaceChangeTransactionRecord, WorkspaceChangeTransactionSnapshot,
};
use repository::{
    collect, get_active_attempt_tx, get_attempt_tx, get_file_tx,
    get_transaction_by_idempotency_key_tx, get_transaction_tx, snapshot_tx, ATTEMPT_SELECT,
    TRANSACTION_SELECT,
};
use rusqlite::params;
use std::collections::{HashMap, HashSet};
use uuid::Uuid;
use validation::{validate_begin, validate_claim, validate_plan};

impl SystemService {
    pub fn begin_workspace_change_transaction(
        &self,
        request: &BeginWorkspaceChangeTransaction,
    ) -> Result<WorkspaceChangeTransactionClaimResult> {
        validate_begin(request)?;
        let token_hash = claim_token_hash(&request.claim_token);
        let now = crate::util::now_ms();
        let lease_expires_at = now.checked_add(request.lease_ms).ok_or_else(|| {
            SystemServiceError::InvalidInput("workspace transaction lease overflow".to_string())
        })?;
        let mut conn = self.connect()?;
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;

        if let Some(existing) =
            get_transaction_by_idempotency_key_tx(&tx, &request.idempotency_key)?
        {
            assert_existing_transaction(&existing, request)?;
            let result = existing_transaction_claim_result(
                &tx,
                existing,
                &request.attempt_id,
                &token_hash,
                now,
            )?;
            tx.commit()?;
            return Ok(result);
        }
        if let Some(existing) = get_transaction_tx(&tx, &request.id)? {
            assert_existing_transaction(&existing, request)?;
            let result = existing_transaction_claim_result(
                &tx,
                existing,
                &request.attempt_id,
                &token_hash,
                now,
            )?;
            tx.commit()?;
            return Ok(result);
        }

        let changeset =
            get_workspace_changeset_tx(&tx, &request.changeset_id)?.ok_or_else(|| {
                SystemServiceError::NotFound(format!(
                    "workspace changeset does not exist: {}",
                    request.changeset_id
                ))
            })?;
        if changeset.workspace_id != request.workspace_id {
            return Err(SystemServiceError::Conflict(
                "workspace transaction changeset belongs to another workspace".to_string(),
            ));
        }
        if let Some(operation_id) = request.undo_source_operation_id.as_deref() {
            let operation = get_workspace_change_operation_tx(&tx, operation_id)?;
            if operation.changeset_id != request.changeset_id
                || operation.operation != "apply"
                || !matches!(operation.status.as_str(), "applied" | "already_applied")
            {
                return Err(SystemServiceError::Conflict(
                    "workspace undo source is not an applied operation for this changeset"
                        .to_string(),
                ));
            }
        }

        let proposal_apply_attempt_id = if let Some(binding) = request.proposal.as_ref() {
            let proposal = get_workspace_change_proposal_tx(&tx, &binding.proposal_id)?
                .ok_or_else(|| {
                    SystemServiceError::NotFound(format!(
                        "workspace proposal does not exist: {}",
                        binding.proposal_id
                    ))
                })?;
            if proposal.state != "applying"
                || proposal.workspace_id != request.workspace_id
                || proposal.changeset_id != request.changeset_id
            {
                return Err(SystemServiceError::Conflict(
                    "workspace transaction proposal binding is not applying this changeset"
                        .to_string(),
                ));
            }
            let attempt =
                get_workspace_change_proposal_apply_attempt_tx(&tx, &binding.proposal_attempt_id)?
                    .ok_or_else(|| {
                        SystemServiceError::NotFound(format!(
                            "workspace proposal apply attempt does not exist: {}",
                            binding.proposal_attempt_id
                        ))
                    })?;
            assert_live_apply_attempt(
                &attempt,
                &binding.proposal_id,
                &binding.proposal_attempt_id,
                &claim_token_hash(&binding.proposal_claim_token),
                now,
            )?;
            Some(binding.proposal_attempt_id.as_str())
        } else {
            None
        };

        tx.execute(
            "INSERT INTO workspace_change_transaction (
                id, workspace_id, changeset_id, operation, undo_source_operation_id,
                source_kind, source_id, idempotency_key, root_identity_sha256,
                proposal_apply_attempt_id, state, plan_digest, workspace_operation_id,
                failure_json, created_at, updated_at, finished_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'planning', NULL, NULL, NULL, ?, ?, NULL)",
            params![
                request.id,
                request.workspace_id,
                request.changeset_id,
                request.operation,
                request.undo_source_operation_id,
                request.source_kind,
                request.source_id,
                request.idempotency_key,
                request.root_identity_sha256,
                proposal_apply_attempt_id,
                now,
                now,
            ],
        )?;
        tx.execute(
            "INSERT INTO workspace_change_transaction_attempt (
                id, transaction_id, owner_id, claim_token_sha256, kind, state,
                lease_expires_at, failure_json, started_at, updated_at, finished_at
             ) VALUES (?, ?, ?, ?, 'execution', 'active', ?, NULL, ?, ?, NULL)",
            params![
                request.attempt_id,
                request.id,
                request.owner_id,
                token_hash,
                lease_expires_at,
                now,
                now,
            ],
        )?;
        append_transaction_event(&tx, "workspace.change_transaction.begun", &request.id, now)?;
        let transaction = get_transaction_tx(&tx, &request.id)?.ok_or_else(|| {
            SystemServiceError::Invariant("workspace transaction insert was lost".to_string())
        })?;
        let snapshot = snapshot_tx(&tx, transaction)?;
        tx.commit()?;
        Ok(WorkspaceChangeTransactionClaimResult {
            status: "claimed".to_string(),
            snapshot,
        })
    }

    pub fn claim_workspace_change_transaction_recovery(
        &self,
        request: &ClaimWorkspaceChangeTransactionRecovery,
    ) -> Result<WorkspaceChangeTransactionClaimResult> {
        validate_claim(
            &request.transaction_id,
            &request.attempt_id,
            Some(&request.owner_id),
            &request.claim_token,
            Some(request.lease_ms),
        )?;
        let token_hash = claim_token_hash(&request.claim_token);
        let now = crate::util::now_ms();
        let lease_expires_at = now.checked_add(request.lease_ms).ok_or_else(|| {
            SystemServiceError::InvalidInput("workspace transaction lease overflow".to_string())
        })?;
        let mut conn = self.connect()?;
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;
        let transaction = require_transaction_tx(&tx, &request.transaction_id)?;
        if transaction_is_terminal(&transaction.state) {
            let snapshot = snapshot_tx(&tx, transaction)?;
            tx.commit()?;
            return Ok(WorkspaceChangeTransactionClaimResult {
                status: "already_terminal".to_string(),
                snapshot,
            });
        }
        if let Some(active) = get_active_attempt_tx(&tx, &request.transaction_id)? {
            if active.id == request.attempt_id
                && active.claim_token_sha256 == token_hash
                && active.lease_expires_at > now
            {
                let snapshot = snapshot_tx(&tx, transaction)?;
                tx.commit()?;
                return Ok(WorkspaceChangeTransactionClaimResult {
                    status: "claimed".to_string(),
                    snapshot,
                });
            }
            if active.lease_expires_at > now {
                let snapshot = snapshot_tx(&tx, transaction)?;
                tx.commit()?;
                return Ok(WorkspaceChangeTransactionClaimResult {
                    status: "busy".to_string(),
                    snapshot,
                });
            }
            let failure = serde_json::json!({ "type": "workspace_transaction.lease_expired" });
            tx.execute(
                "UPDATE workspace_change_transaction_attempt
                 SET state = 'failed', failure_json = ?, updated_at = ?, finished_at = ?
                 WHERE id = ? AND state = 'active'",
                params![serde_json::to_string(&failure)?, now, now, active.id],
            )?;
        }
        if get_attempt_tx(&tx, &request.attempt_id)?.is_some() {
            return Err(SystemServiceError::Conflict(format!(
                "workspace transaction attempt id was already used: {}",
                request.attempt_id
            )));
        }
        tx.execute(
            "INSERT INTO workspace_change_transaction_attempt (
                id, transaction_id, owner_id, claim_token_sha256, kind, state,
                lease_expires_at, failure_json, started_at, updated_at, finished_at
             ) VALUES (?, ?, ?, ?, 'recovery', 'active', ?, NULL, ?, ?, NULL)",
            params![
                request.attempt_id,
                request.transaction_id,
                request.owner_id,
                token_hash,
                lease_expires_at,
                now,
                now,
            ],
        )?;
        append_transaction_event(
            &tx,
            "workspace.change_transaction.recovery_claimed",
            &request.transaction_id,
            now,
        )?;
        let transaction = require_transaction_tx(&tx, &request.transaction_id)?;
        let snapshot = snapshot_tx(&tx, transaction)?;
        tx.commit()?;
        Ok(WorkspaceChangeTransactionClaimResult {
            status: "claimed".to_string(),
            snapshot,
        })
    }

    pub fn renew_workspace_change_transaction(
        &self,
        request: &RenewWorkspaceChangeTransaction,
    ) -> Result<WorkspaceChangeTransactionAttemptRecord> {
        validate_claim(
            &request.transaction_id,
            &request.attempt_id,
            None,
            &request.claim_token,
            Some(request.lease_ms),
        )?;
        let now = crate::util::now_ms();
        let lease_expires_at = now.checked_add(request.lease_ms).ok_or_else(|| {
            SystemServiceError::InvalidInput("workspace transaction lease overflow".to_string())
        })?;
        let mut conn = self.connect()?;
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;
        require_transaction_tx(&tx, &request.transaction_id)?;
        let attempt = require_live_attempt_tx(
            &tx,
            &request.transaction_id,
            &request.attempt_id,
            &request.claim_token,
            now,
        )?;
        tx.execute(
            "UPDATE workspace_change_transaction_attempt
             SET lease_expires_at = ?, updated_at = ? WHERE id = ? AND state = 'active'",
            params![lease_expires_at, now, attempt.id],
        )?;
        let renewed = get_attempt_tx(&tx, &attempt.id)?.ok_or_else(|| {
            SystemServiceError::Invariant("workspace transaction renewal lost attempt".to_string())
        })?;
        tx.commit()?;
        Ok(renewed)
    }

    pub fn record_workspace_change_transaction_plan(
        &self,
        request: &RecordWorkspaceChangeTransactionPlan,
    ) -> Result<WorkspaceChangeTransactionSnapshot> {
        validate_claim(
            &request.transaction_id,
            &request.attempt_id,
            None,
            &request.claim_token,
            None,
        )?;
        let plan_digest = validate_plan(&request.files)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;
        let transaction = require_transaction_tx(&tx, &request.transaction_id)?;
        require_live_attempt_tx(
            &tx,
            &request.transaction_id,
            &request.attempt_id,
            &request.claim_token,
            now,
        )?;
        if let Some(existing_digest) = transaction.plan_digest.as_deref() {
            if existing_digest != plan_digest {
                return Err(SystemServiceError::Conflict(
                    "workspace transaction already has a different durable plan".to_string(),
                ));
            }
            let snapshot = snapshot_tx(&tx, transaction)?;
            tx.commit()?;
            return Ok(snapshot);
        }
        if transaction.state != "planning" {
            return Err(SystemServiceError::Conflict(format!(
                "workspace transaction cannot record plan from state {}",
                transaction.state
            )));
        }
        for file in &request.files {
            tx.execute(
                "INSERT INTO workspace_change_transaction_file (
                    transaction_id, ordinal, path, before_text, before_sha256,
                    after_text, after_sha256, state, updated_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
                params![
                    request.transaction_id,
                    file.ordinal,
                    file.path,
                    file.before_text,
                    file.before_sha256,
                    file.after_text,
                    file.after_sha256,
                    now,
                ],
            )?;
        }
        tx.execute(
            "UPDATE workspace_change_transaction SET plan_digest = ?, updated_at = ?
             WHERE id = ? AND state = 'planning' AND plan_digest IS NULL",
            params![plan_digest, now, request.transaction_id],
        )?;
        append_transaction_event(
            &tx,
            "workspace.change_transaction.plan_recorded",
            &request.transaction_id,
            now,
        )?;
        let transaction = require_transaction_tx(&tx, &request.transaction_id)?;
        let snapshot = snapshot_tx(&tx, transaction)?;
        tx.commit()?;
        Ok(snapshot)
    }

    pub fn mark_workspace_change_transaction_prepared(
        &self,
        request: &MarkWorkspaceChangeTransactionPrepared,
    ) -> Result<WorkspaceChangeTransactionSnapshot> {
        transition_transaction(
            self,
            &request.transaction_id,
            &request.attempt_id,
            &request.claim_token,
            TransactionTransition {
                from_state: "planning",
                to_state: "prepared",
                mark_files_prepared: true,
                event_type: "workspace.change_transaction.prepared",
                require_plan: true,
            },
        )
    }

    pub fn begin_workspace_change_transaction_commit(
        &self,
        request: &BeginWorkspaceChangeTransactionCommit,
    ) -> Result<WorkspaceChangeTransactionSnapshot> {
        transition_transaction(
            self,
            &request.transaction_id,
            &request.attempt_id,
            &request.claim_token,
            TransactionTransition {
                from_state: "prepared",
                to_state: "committing",
                mark_files_prepared: false,
                event_type: "workspace.change_transaction.committing",
                require_plan: false,
            },
        )
    }

    pub fn record_workspace_change_transaction_file_committed(
        &self,
        request: &RecordWorkspaceChangeTransactionFileCommitted,
    ) -> Result<WorkspaceChangeTransactionSnapshot> {
        validate_claim(
            &request.transaction_id,
            &request.attempt_id,
            None,
            &request.claim_token,
            None,
        )?;
        if request.ordinal < 0 {
            return Err(SystemServiceError::InvalidInput(
                "workspace transaction file ordinal cannot be negative".to_string(),
            ));
        }
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;
        let transaction = require_transaction_tx(&tx, &request.transaction_id)?;
        if transaction.state != "committing" {
            return Err(SystemServiceError::Conflict(format!(
                "workspace transaction is not committing: {}",
                transaction.state
            )));
        }
        require_live_attempt_tx(
            &tx,
            &request.transaction_id,
            &request.attempt_id,
            &request.claim_token,
            now,
        )?;
        let file =
            get_file_tx(&tx, &request.transaction_id, request.ordinal)?.ok_or_else(|| {
                SystemServiceError::NotFound(format!(
                    "workspace transaction file does not exist: {}/{}",
                    request.transaction_id, request.ordinal
                ))
            })?;
        if !matches!(file.state.as_str(), "prepared" | "committed") {
            return Err(SystemServiceError::Conflict(format!(
                "workspace transaction file is not prepared: {}",
                file.state
            )));
        }
        if file.state != "committed" {
            tx.execute(
                "UPDATE workspace_change_transaction_file
                 SET state = 'committed', updated_at = ?
                 WHERE transaction_id = ? AND ordinal = ? AND state = 'prepared'",
                params![now, request.transaction_id, request.ordinal],
            )?;
        }
        let transaction = require_transaction_tx(&tx, &request.transaction_id)?;
        let snapshot = snapshot_tx(&tx, transaction)?;
        tx.commit()?;
        Ok(snapshot)
    }

    pub fn reconcile_workspace_change_transaction_files(
        &self,
        request: &ReconcileWorkspaceChangeTransactionFiles,
    ) -> Result<WorkspaceChangeTransactionReconciliation> {
        validate_claim(
            &request.transaction_id,
            &request.attempt_id,
            None,
            &request.claim_token,
            None,
        )?;
        let mut observation_by_ordinal = HashMap::with_capacity(request.observations.len());
        for observation in &request.observations {
            if observation.ordinal < 0
                || !matches!(observation.current.as_str(), "before" | "after" | "other")
                || observation_by_ordinal
                    .insert(observation.ordinal, observation.current.as_str())
                    .is_some()
            {
                return Err(SystemServiceError::InvalidInput(
                    "workspace transaction observations must be unique and classified".to_string(),
                ));
            }
        }
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;
        let transaction = require_transaction_tx(&tx, &request.transaction_id)?;
        if transaction_is_terminal(&transaction.state) {
            return Err(SystemServiceError::Conflict(
                "terminal workspace transaction cannot be reconciled".to_string(),
            ));
        }
        let attempt = require_live_attempt_tx(
            &tx,
            &request.transaction_id,
            &request.attempt_id,
            &request.claim_token,
            now,
        )?;
        if attempt.kind != "recovery" {
            return Err(SystemServiceError::Conflict(
                "workspace transaction reconciliation requires recovery ownership".to_string(),
            ));
        }
        let files = repository::list_files_tx(&tx, &request.transaction_id)?;
        if files.is_empty() || files.len() != observation_by_ordinal.len() {
            return Err(SystemServiceError::InvalidInput(
                "workspace transaction reconciliation must observe every durable file".to_string(),
            ));
        }
        let expected_ordinals = files
            .iter()
            .map(|file| file.ordinal)
            .collect::<HashSet<_>>();
        if observation_by_ordinal
            .keys()
            .any(|ordinal| !expected_ordinals.contains(ordinal))
        {
            return Err(SystemServiceError::InvalidInput(
                "workspace transaction reconciliation contains an unknown ordinal".to_string(),
            ));
        }
        let mut any_after = false;
        let mut any_other = false;
        let mut all_after = true;
        for file in &files {
            let current = observation_by_ordinal[&file.ordinal];
            any_after |= current == "after";
            any_other |= current == "other";
            all_after &= current == "after";
            let file_state = if current == "after" {
                "committed"
            } else {
                "prepared"
            };
            tx.execute(
                "UPDATE workspace_change_transaction_file SET state = ?, updated_at = ?
                 WHERE transaction_id = ? AND ordinal = ?",
                params![file_state, now, request.transaction_id, file.ordinal],
            )?;
        }
        let decision = if any_other {
            tx.execute(
                "UPDATE workspace_change_transaction
                 SET state = 'recovery_required', recovery_decision = 'attention', updated_at = ?
                 WHERE id = ?",
                params![now, request.transaction_id],
            )?;
            "attention"
        } else if all_after {
            "finalize"
        } else if transaction.state == "committing" || any_after {
            "finish_forward"
        } else {
            "rollback_noop"
        };
        if !any_other {
            tx.execute(
                "UPDATE workspace_change_transaction SET recovery_decision = ?, updated_at = ?
                 WHERE id = ?",
                params![decision, now, request.transaction_id],
            )?;
        }
        append_transaction_event(
            &tx,
            "workspace.change_transaction.reconciled",
            &request.transaction_id,
            now,
        )?;
        let transaction = require_transaction_tx(&tx, &request.transaction_id)?;
        let snapshot = snapshot_tx(&tx, transaction)?;
        tx.commit()?;
        Ok(WorkspaceChangeTransactionReconciliation {
            decision: decision.to_string(),
            snapshot,
        })
    }

    pub fn get_workspace_change_transaction(
        &self,
        transaction_id: &str,
    ) -> Result<Option<WorkspaceChangeTransactionSnapshot>> {
        if transaction_id.is_empty() {
            return Err(SystemServiceError::InvalidInput(
                "workspace transaction id must not be empty".to_string(),
            ));
        }
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let snapshot = get_transaction_tx(&tx, transaction_id)?
            .map(|transaction| snapshot_tx(&tx, transaction))
            .transpose()?;
        tx.commit()?;
        Ok(snapshot)
    }

    pub fn list_workspace_change_transactions(
        &self,
        request: &ListWorkspaceChangeTransactions,
    ) -> Result<Vec<WorkspaceChangeTransactionSnapshot>> {
        if let Some(state) = request.state.as_deref() {
            if !transaction_state_is_known(state) {
                return Err(SystemServiceError::InvalidInput(format!(
                    "invalid workspace transaction state: {state}"
                )));
            }
        }
        let limit = request.limit.unwrap_or(100).clamp(1, 1000);
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let transactions = match (&request.workspace_id, &request.state) {
            (Some(workspace_id), Some(state)) => {
                let mut stmt = tx.prepare(&format!(
                    "{TRANSACTION_SELECT} WHERE workspace_id = ? AND state = ?
                     ORDER BY updated_at DESC, id ASC LIMIT ?"
                ))?;
                let rows = stmt.query_map(
                    params![workspace_id, state, limit],
                    row_to_workspace_change_transaction,
                )?;
                collect(rows)?
            }
            (Some(workspace_id), None) => {
                let mut stmt = tx.prepare(&format!(
                    "{TRANSACTION_SELECT} WHERE workspace_id = ?
                     ORDER BY updated_at DESC, id ASC LIMIT ?"
                ))?;
                let rows = stmt.query_map(
                    params![workspace_id, limit],
                    row_to_workspace_change_transaction,
                )?;
                collect(rows)?
            }
            (None, Some(state)) => {
                let mut stmt = tx.prepare(&format!(
                    "{TRANSACTION_SELECT} WHERE state = ?
                     ORDER BY updated_at DESC, id ASC LIMIT ?"
                ))?;
                let rows =
                    stmt.query_map(params![state, limit], row_to_workspace_change_transaction)?;
                collect(rows)?
            }
            (None, None) => {
                let mut stmt = tx.prepare(&format!(
                    "{TRANSACTION_SELECT} ORDER BY updated_at DESC, id ASC LIMIT ?"
                ))?;
                let rows = stmt.query_map(params![limit], row_to_workspace_change_transaction)?;
                collect(rows)?
            }
        };
        let mut snapshots = Vec::with_capacity(transactions.len());
        for transaction in transactions {
            snapshots.push(snapshot_tx(&tx, transaction)?);
        }
        tx.commit()?;
        Ok(snapshots)
    }

    pub fn list_workspace_change_transaction_attempts(
        &self,
        request: &ListWorkspaceChangeTransactionAttempts,
    ) -> Result<Vec<WorkspaceChangeTransactionAttemptRecord>> {
        if request.transaction_id.is_empty() {
            return Err(SystemServiceError::InvalidInput(
                "workspace transaction id must not be empty".to_string(),
            ));
        }
        let limit = request.limit.unwrap_or(100).clamp(1, 1000);
        let conn = self.connect()?;
        let mut stmt = conn.prepare(&format!(
            "{ATTEMPT_SELECT} WHERE transaction_id = ?
             ORDER BY started_at ASC, id ASC LIMIT ?"
        ))?;
        let rows = stmt.query_map(
            params![request.transaction_id, limit],
            row_to_workspace_change_transaction_attempt,
        )?;
        let records = collect(rows)?;
        Ok(records)
    }
}

struct TransactionTransition<'a> {
    from_state: &'a str,
    to_state: &'a str,
    mark_files_prepared: bool,
    event_type: &'a str,
    require_plan: bool,
}

fn transition_transaction(
    service: &SystemService,
    transaction_id: &str,
    attempt_id: &str,
    claim_token: &str,
    transition: TransactionTransition<'_>,
) -> Result<WorkspaceChangeTransactionSnapshot> {
    validate_claim(transaction_id, attempt_id, None, claim_token, None)?;
    let now = crate::util::now_ms();
    let mut conn = service.connect()?;
    let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;
    let transaction = require_transaction_tx(&tx, transaction_id)?;
    require_live_attempt_tx(&tx, transaction_id, attempt_id, claim_token, now)?;
    if transaction.state == transition.to_state {
        let snapshot = snapshot_tx(&tx, transaction)?;
        tx.commit()?;
        return Ok(snapshot);
    }
    if transaction.state != transition.from_state {
        return Err(SystemServiceError::Conflict(format!(
            "workspace transaction cannot transition from {} to {}",
            transaction.state, transition.to_state
        )));
    }
    if transition.require_plan && transaction.plan_digest.is_none() {
        return Err(SystemServiceError::Conflict(
            "workspace transaction cannot prepare before recording a durable plan".to_string(),
        ));
    }
    if transition.mark_files_prepared {
        tx.execute(
            "UPDATE workspace_change_transaction_file SET state = 'prepared', updated_at = ?
             WHERE transaction_id = ? AND state = 'pending'",
            params![now, transaction_id],
        )?;
    }
    tx.execute(
        "UPDATE workspace_change_transaction SET state = ?, updated_at = ?
         WHERE id = ? AND state = ?",
        params![
            transition.to_state,
            now,
            transaction_id,
            transition.from_state
        ],
    )?;
    append_transaction_event(&tx, transition.event_type, transaction_id, now)?;
    let transaction = require_transaction_tx(&tx, transaction_id)?;
    let snapshot = snapshot_tx(&tx, transaction)?;
    tx.commit()?;
    Ok(snapshot)
}

pub(super) fn require_transaction_tx(
    tx: &rusqlite::Transaction<'_>,
    transaction_id: &str,
) -> Result<WorkspaceChangeTransactionRecord> {
    get_transaction_tx(tx, transaction_id)?.ok_or_else(|| {
        SystemServiceError::NotFound(format!(
            "workspace transaction does not exist: {transaction_id}"
        ))
    })
}

pub(super) fn require_live_attempt_tx(
    tx: &rusqlite::Transaction<'_>,
    transaction_id: &str,
    attempt_id: &str,
    claim_token: &str,
    now: i64,
) -> Result<WorkspaceChangeTransactionAttemptRecord> {
    let attempt = get_attempt_tx(tx, attempt_id)?.ok_or_else(|| {
        SystemServiceError::NotFound(format!(
            "workspace transaction attempt does not exist: {attempt_id}"
        ))
    })?;
    if attempt.transaction_id != transaction_id
        || attempt.claim_token_sha256 != claim_token_hash(claim_token)
        || attempt.state != "active"
        || attempt.lease_expires_at <= now
    {
        return Err(SystemServiceError::Conflict(
            "workspace transaction attempt is not live or token is invalid".to_string(),
        ));
    }
    Ok(attempt)
}

pub(super) fn append_transaction_event(
    tx: &rusqlite::Transaction<'_>,
    event_type: &str,
    transaction_id: &str,
    now: i64,
) -> Result<()> {
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        event_type,
        &EventScope::default(),
        &serde_json::json!({
            "transactionId": transaction_id,
            "updatedAt": now
        }),
        now,
    )
}

pub(super) fn transaction_is_terminal(state: &str) -> bool {
    matches!(state, "applied" | "rolled_back")
}

pub(super) fn transaction_state_is_known(state: &str) -> bool {
    matches!(
        state,
        "planning" | "prepared" | "committing" | "applied" | "rolled_back" | "recovery_required"
    )
}

fn assert_existing_transaction(
    existing: &WorkspaceChangeTransactionRecord,
    request: &BeginWorkspaceChangeTransaction,
) -> Result<()> {
    let proposal_attempt_id = request
        .proposal
        .as_ref()
        .map(|proposal| proposal.proposal_attempt_id.as_str());
    if existing.id != request.id
        || existing.workspace_id != request.workspace_id
        || existing.changeset_id != request.changeset_id
        || existing.operation != request.operation
        || existing.undo_source_operation_id.as_deref()
            != request.undo_source_operation_id.as_deref()
        || existing.source_kind != request.source_kind
        || existing.source_id != request.source_id
        || existing.idempotency_key != request.idempotency_key
        || existing.root_identity_sha256 != request.root_identity_sha256
        || existing.proposal_apply_attempt_id.as_deref() != proposal_attempt_id
    {
        return Err(SystemServiceError::Conflict(
            "workspace transaction identity already exists with different immutable facts"
                .to_string(),
        ));
    }
    Ok(())
}

fn existing_transaction_claim_result(
    tx: &rusqlite::Transaction<'_>,
    transaction: WorkspaceChangeTransactionRecord,
    attempt_id: &str,
    token_hash: &str,
    now: i64,
) -> Result<WorkspaceChangeTransactionClaimResult> {
    let active = get_active_attempt_tx(tx, &transaction.id)?;
    let status = if transaction_is_terminal(&transaction.state) {
        "already_terminal"
    } else if active.as_ref().is_some_and(|attempt| {
        attempt.id == attempt_id
            && attempt.claim_token_sha256 == token_hash
            && attempt.lease_expires_at > now
    }) {
        "claimed"
    } else if active
        .as_ref()
        .is_some_and(|attempt| attempt.lease_expires_at > now)
    {
        "busy"
    } else {
        "recovery_required"
    };
    let transaction_id = transaction.id.clone();
    let files = repository::list_files_tx(tx, &transaction_id)?;
    Ok(WorkspaceChangeTransactionClaimResult {
        status: status.to_string(),
        snapshot: WorkspaceChangeTransactionSnapshot {
            transaction,
            files,
            active_attempt: active,
        },
    })
}
