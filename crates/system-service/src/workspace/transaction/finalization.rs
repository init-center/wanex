use super::repository::{get_attempt_tx, snapshot_tx};
use super::validation::validate_finalize;
use super::{
    append_transaction_event, require_live_attempt_tx, require_transaction_tx,
    transaction_is_terminal,
};
use crate::event_store::append_event_tx;
use crate::{
    EventScope, FinalizeWorkspaceChangeTransaction, Result, SystemService, SystemServiceError,
    WorkspaceChangeProposalApplyAttemptRecord, WorkspaceChangeProposalRecord,
    WorkspaceChangeTransactionFinalization, WorkspaceChangeTransactionRecord,
};
use rusqlite::params;
use uuid::Uuid;

impl SystemService {
    pub fn finalize_workspace_change_transaction(
        &self,
        request: &FinalizeWorkspaceChangeTransaction,
    ) -> Result<WorkspaceChangeTransactionFinalization> {
        validate_finalize(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;
        let transaction = require_transaction_tx(&tx, &request.transaction_id)?;

        if transaction_is_terminal(&transaction.state)
            || transaction.state == "recovery_required"
                && request.outcome == "recovery_required"
                && transaction.failure == request.failure
        {
            assert_replay_token(&tx, &transaction, request)?;
            let finalization = read_finalization_tx(&tx, transaction)?;
            tx.commit()?;
            return Ok(finalization);
        }

        let attempt = require_live_attempt_tx(
            &tx,
            &request.transaction_id,
            &request.attempt_id,
            &request.claim_token,
            now,
        )?;
        let files = super::repository::list_files_tx(&tx, &request.transaction_id)?;
        validate_outcome_evidence(&transaction, &files, &attempt.kind, request)?;

        let mut operation = None;
        if let (Some(operation_id), Some(receipt)) =
            (request.operation_id.as_deref(), request.receipt.as_ref())
        {
            let receipt_changeset_id = receipt
                .get("changeSetId")
                .and_then(serde_json::Value::as_str)
                .ok_or_else(|| {
                    SystemServiceError::InvalidInput(
                        "workspace transaction receipt requires changeSetId".to_string(),
                    )
                })?;
            let status = receipt
                .get("status")
                .and_then(serde_json::Value::as_str)
                .ok_or_else(|| {
                    SystemServiceError::InvalidInput(
                        "workspace transaction receipt requires status".to_string(),
                    )
                })?;
            if receipt_changeset_id != transaction.changeset_id {
                return Err(SystemServiceError::Conflict(
                    "workspace transaction receipt belongs to another changeset".to_string(),
                ));
            }
            let expected_status = if request.outcome == "conflicted" {
                "conflicted"
            } else if transaction.operation == "undo" {
                "applied"
            } else {
                status
            };
            let status_valid = if request.outcome == "conflicted" {
                status == expected_status
            } else if transaction.operation == "apply" {
                matches!(status, "applied" | "already_applied")
            } else {
                status == expected_status
            };
            if !status_valid {
                return Err(SystemServiceError::Conflict(format!(
                    "workspace transaction receipt status does not match outcome: {status}/{}",
                    request.outcome
                )));
            }
            tx.execute(
                "INSERT INTO workspace_change_operation (
                    id, changeset_id, operation, status, receipt_json, created_at
                 ) VALUES (?, ?, ?, ?, ?, ?)",
                params![
                    operation_id,
                    transaction.changeset_id,
                    transaction.operation,
                    status,
                    serde_json::to_string(receipt)?,
                    now,
                ],
            )?;
            let changeset_state = match (transaction.operation.as_str(), status) {
                ("apply", "applied") => "applied",
                ("apply", "already_applied") => "already_applied",
                ("apply", "conflicted") => "conflicted",
                ("undo", "applied") => "undone",
                ("undo", "conflicted") => "undo_conflicted",
                _ => unreachable!("transaction receipt status was validated"),
            };
            tx.execute(
                "UPDATE workspace_changeset SET current_state = ?, updated_at = ? WHERE id = ?",
                params![changeset_state, now, transaction.changeset_id],
            )?;
            append_event_tx(
                &tx,
                &format!("evt_{}", Uuid::now_v7()),
                "workspace.changeset.operation_recorded",
                &EventScope::default(),
                &serde_json::json!({
                    "changeSetId": transaction.changeset_id,
                    "operationId": operation_id,
                    "operation": transaction.operation,
                    "status": status,
                    "state": changeset_state,
                    "updatedAt": now
                }),
                now,
            )?;
            operation = Some(super::super::get_workspace_change_operation_tx(
                &tx,
                operation_id,
            )?);
        }

        let (transaction_state, attempt_state, finished_at) = match request.outcome.as_str() {
            "applied" => ("applied", "completed", Some(now)),
            "conflicted" | "rolled_back" => ("rolled_back", "completed", Some(now)),
            "recovery_required" => ("recovery_required", "failed", None),
            _ => unreachable!("transaction outcome was validated"),
        };
        let failure_json = request
            .failure
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        tx.execute(
            "UPDATE workspace_change_transaction
             SET state = ?, workspace_operation_id = ?, failure_json = ?,
                 updated_at = ?, finished_at = ?
             WHERE id = ?",
            params![
                transaction_state,
                request.operation_id,
                failure_json,
                now,
                finished_at,
                request.transaction_id,
            ],
        )?;
        let attempt_failure = if request.outcome == "recovery_required" {
            failure_json.clone()
        } else if request.outcome == "rolled_back" {
            Some(serde_json::to_string(&serde_json::json!({
                "type": "workspace_transaction.rolled_back"
            }))?)
        } else {
            None
        };
        tx.execute(
            "UPDATE workspace_change_transaction_attempt
             SET state = ?, failure_json = ?, updated_at = ?, finished_at = ?
             WHERE id = ? AND state = 'active'",
            params![attempt_state, attempt_failure, now, now, attempt.id],
        )?;

        settle_bound_proposal_tx(
            &tx,
            &transaction,
            request.outcome.as_str(),
            request.operation_id.as_deref(),
            failure_json.as_deref(),
            now,
        )?;
        append_transaction_event(
            &tx,
            "workspace.change_transaction.finalized",
            &request.transaction_id,
            now,
        )?;
        let transaction = require_transaction_tx(&tx, &request.transaction_id)?;
        let mut finalization = read_finalization_tx(&tx, transaction)?;
        finalization.operation = operation;
        tx.commit()?;
        Ok(finalization)
    }
}

fn validate_outcome_evidence(
    transaction: &WorkspaceChangeTransactionRecord,
    files: &[crate::WorkspaceChangeTransactionFileRecord],
    attempt_kind: &str,
    request: &FinalizeWorkspaceChangeTransaction,
) -> Result<()> {
    match request.outcome.as_str() {
        "applied" => {
            let no_op = files.is_empty()
                && transaction.state == "planning"
                && receipt_proves_noop(request.receipt.as_ref());
            let committed = !files.is_empty()
                && files.iter().all(|file| file.state == "committed")
                && matches!(
                    transaction.state.as_str(),
                    "committing" | "recovery_required"
                )
                && (transaction.state != "recovery_required"
                    || transaction.recovery_decision.as_deref() == Some("finalize"));
            if !no_op && !committed {
                return Err(SystemServiceError::Conflict(
                    "workspace transaction cannot finalize applied without committed file evidence"
                        .to_string(),
                ));
            }
        }
        "conflicted" => {
            if transaction.state != "planning" || files.iter().any(|file| file.state == "committed")
            {
                return Err(SystemServiceError::Conflict(
                    "workspace transaction conflict is not a proven pre-commit outcome".to_string(),
                ));
            }
        }
        "rolled_back" => {
            let execution_can_cancel = attempt_kind == "execution"
                && matches!(transaction.state.as_str(), "planning" | "prepared")
                && files.iter().all(|file| file.state != "committed");
            let recovery_proved_noop = attempt_kind == "recovery"
                && (transaction.recovery_decision.as_deref() == Some("rollback_noop")
                    || files.is_empty()
                        && transaction.plan_digest.is_none()
                        && matches!(transaction.state.as_str(), "planning" | "recovery_required"));
            if !execution_can_cancel && !recovery_proved_noop {
                return Err(SystemServiceError::Conflict(
                    "workspace transaction rollback lacks no-op evidence".to_string(),
                ));
            }
        }
        "recovery_required" => {}
        _ => unreachable!("transaction outcome was validated"),
    }
    Ok(())
}

fn receipt_proves_noop(receipt: Option<&serde_json::Value>) -> bool {
    let Some(receipt) = receipt.and_then(serde_json::Value::as_object) else {
        return false;
    };
    let status = receipt.get("status").and_then(serde_json::Value::as_str);
    let Some(files) = receipt.get("files").and_then(serde_json::Value::as_array) else {
        return false;
    };
    !files.is_empty()
        && matches!(status, Some("already_applied" | "applied"))
        && files.iter().all(|file| {
            let Some(file) = file.as_object() else {
                return false;
            };
            file.get("beforeText") == file.get("afterText")
                && file.get("beforeSha256") == file.get("afterSha256")
        })
}

fn settle_bound_proposal_tx(
    tx: &rusqlite::Transaction<'_>,
    transaction: &WorkspaceChangeTransactionRecord,
    outcome: &str,
    operation_id: Option<&str>,
    failure_json: Option<&str>,
    now: i64,
) -> Result<()> {
    let Some(proposal_attempt_id) = transaction.proposal_apply_attempt_id.as_deref() else {
        return Ok(());
    };
    let attempt = super::super::apply_claim::get_workspace_change_proposal_apply_attempt_tx(
        tx,
        proposal_attempt_id,
    )?
    .ok_or_else(|| {
        SystemServiceError::Invariant(
            "workspace transaction lost its proposal apply binding".to_string(),
        )
    })?;
    let proposal = super::super::get_workspace_change_proposal_tx(tx, &attempt.proposal_id)?
        .ok_or_else(|| {
            SystemServiceError::Invariant(
                "workspace transaction lost its proposal binding".to_string(),
            )
        })?;
    if proposal.changeset_id != transaction.changeset_id
        || !matches!(attempt.state.as_str(), "active" | "recovery_required")
        || !matches!(proposal.state.as_str(), "applying" | "recovery_required")
    {
        return Err(SystemServiceError::Conflict(
            "workspace transaction proposal binding is no longer settleable".to_string(),
        ));
    }
    let (attempt_state, proposal_state, closed_at) = match outcome {
        "applied" => ("applied", "applied", Some(now)),
        "conflicted" => ("failed", "apply_failed", Some(now)),
        "rolled_back" => ("failed", "apply_requested", None),
        "recovery_required" => ("recovery_required", "recovery_required", None),
        _ => unreachable!("transaction outcome was validated"),
    };
    let conflict_failure;
    let proposal_failure_json = if outcome == "conflicted" && failure_json.is_none() {
        conflict_failure = serde_json::to_string(&serde_json::json!({
            "type": "workspace.apply_conflicted"
        }))?;
        Some(conflict_failure.as_str())
    } else {
        failure_json
    };
    tx.execute(
        "UPDATE workspace_change_proposal_apply_attempt
         SET state = ?, workspace_operation_id = ?, failure_json = ?,
             updated_at = ?, finished_at = ? WHERE id = ?",
        params![
            attempt_state,
            operation_id,
            proposal_failure_json,
            now,
            if outcome == "recovery_required" {
                None
            } else {
                Some(now)
            },
            proposal_attempt_id,
        ],
    )?;
    tx.execute(
        "UPDATE workspace_change_proposal SET state = ?, updated_at = ?, closed_at = ?
         WHERE id = ?",
        params![proposal_state, now, closed_at, proposal.id],
    )?;
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        "workspace.change_proposal.apply_settled",
        &EventScope::default(),
        &serde_json::json!({
            "proposalId": proposal.id,
            "attemptId": proposal_attempt_id,
            "outcome": outcome,
            "state": proposal_state,
            "updatedAt": now
        }),
        now,
    )
}

fn assert_replay_token(
    tx: &rusqlite::Transaction<'_>,
    transaction: &WorkspaceChangeTransactionRecord,
    request: &FinalizeWorkspaceChangeTransaction,
) -> Result<()> {
    let attempt = get_attempt_tx(tx, &request.attempt_id)?.ok_or_else(|| {
        SystemServiceError::NotFound(format!(
            "workspace transaction attempt does not exist: {}",
            request.attempt_id
        ))
    })?;
    if attempt.transaction_id != transaction.id
        || attempt.claim_token_sha256
            != super::super::apply_claim::claim_token_hash(&request.claim_token)
    {
        return Err(SystemServiceError::Conflict(
            "workspace transaction finalization replay token is invalid".to_string(),
        ));
    }
    let outcome_matches = match request.outcome.as_str() {
        "applied" => transaction.state == "applied",
        "conflicted" | "rolled_back" => transaction.state == "rolled_back",
        "recovery_required" => transaction.state == "recovery_required",
        _ => false,
    };
    if !outcome_matches
        || transaction.workspace_operation_id.as_deref() != request.operation_id.as_deref()
    {
        return Err(SystemServiceError::Conflict(
            "workspace transaction was finalized with a different outcome".to_string(),
        ));
    }
    Ok(())
}

fn read_finalization_tx(
    tx: &rusqlite::Transaction<'_>,
    transaction: WorkspaceChangeTransactionRecord,
) -> Result<WorkspaceChangeTransactionFinalization> {
    let operation = transaction
        .workspace_operation_id
        .as_deref()
        .map(|operation_id| super::super::get_workspace_change_operation_tx(tx, operation_id))
        .transpose()?;
    let (proposal, proposal_attempt) = read_bound_proposal_tx(tx, &transaction)?;
    let snapshot = snapshot_tx(tx, transaction)?;
    Ok(WorkspaceChangeTransactionFinalization {
        snapshot,
        operation,
        proposal,
        proposal_attempt,
    })
}

fn read_bound_proposal_tx(
    tx: &rusqlite::Transaction<'_>,
    transaction: &WorkspaceChangeTransactionRecord,
) -> Result<(
    Option<WorkspaceChangeProposalRecord>,
    Option<WorkspaceChangeProposalApplyAttemptRecord>,
)> {
    let Some(attempt_id) = transaction.proposal_apply_attempt_id.as_deref() else {
        return Ok((None, None));
    };
    let attempt =
        super::super::apply_claim::get_workspace_change_proposal_apply_attempt_tx(tx, attempt_id)?;
    let proposal = attempt
        .as_ref()
        .map(|attempt| super::super::get_workspace_change_proposal_tx(tx, &attempt.proposal_id))
        .transpose()?
        .flatten();
    Ok((proposal, attempt))
}
