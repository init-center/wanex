use crate::event_store::append_event_tx;
use crate::messages::{insert_session_message_tx, NewSessionMessage};
use crate::rows::{row_to_tool_activity, row_to_tool_execution, row_to_tool_execution_attempt};
use crate::{
    BeginToolExecution, BeginToolExecutionReceipt, DeferToolExecution, DeferToolExecutionReceipt,
    DeferredToolOperation, EventScope, FinishToolExecution, GetToolExecutionByCall,
    ListToolActivities, ListToolExecutionAttempts, ListToolExecutions,
    RequireToolExecutionRecovery, RequireToolExecutionRecoveryReceipt,
    ResolveToolExecutionApproval, ResolveToolExecutionApprovalReceipt,
    ResolveToolExecutionRecovery, ResolveToolExecutionRecoveryReceipt, Result, SystemService,
    SystemServiceError, ToolExecutionApprovalDecisionRecord,
    ToolExecutionApprovalSuspensionReceipt, ToolExecutionAttemptRecord, ToolExecutionRecord,
    ToolExecutionRecoveryDecisionRecord, ToolResultContentPart,
};
use rusqlite::{params, params_from_iter, OptionalExtension};
use std::collections::HashSet;
use uuid::Uuid;

pub(crate) struct DeferredToolOwner {
    pub(crate) turn: crate::SessionTurnRecord,
    pub(crate) session_attempt: crate::SessionAttemptRecord,
    pub(crate) session_job: crate::SchedulerJobRecord,
    pub(crate) tool_execution: ToolExecutionRecord,
    pub(crate) tool_attempt: ToolExecutionAttemptRecord,
}

const TOOL_EXECUTION_SELECT: &str = "SELECT id, session_id, turn_id, input_id,
    source_message_id, principal_id, tool_call_id, tool_name, input_json,
    descriptor_json, permission_json, state, current_invocation_attempt_id,
    attempt_count, idempotency_key, approval_revision, recovery_revision, recovery_json,
    content_json, content_digest, is_error, error_json,
    created_at, finished_at, updated_at, activity_json FROM tool_execution";

const TOOL_ATTEMPT_SELECT: &str = "SELECT id, execution_id,
    session_attempt_id, job_id, worker_id, attempt_number, state, error_json,
    started_at, updated_at, finished_at FROM tool_execution_attempt";

impl SystemService {
    pub fn defer_tool_execution(
        &self,
        request: &DeferToolExecution,
    ) -> Result<DeferToolExecutionReceipt> {
        match &request.operation {
            DeferredToolOperation::MediaGeneration { binding, priority } => {
                self.defer_tool_execution_to_media_generation(request, binding, *priority)
            }
            DeferredToolOperation::TeamDelegation { .. } => {
                self.defer_tool_execution_to_team_delegation(request)
            }
        }
    }

    pub fn begin_tool_execution(
        &self,
        request: &BeginToolExecution,
    ) -> Result<BeginToolExecutionReceipt> {
        validate_begin(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        if validate_turn_lease(&tx, begin_identity(request), now)?.is_none() {
            return Err(SystemServiceError::Invariant(
                "tool execution does not own the active turn lease".to_string(),
            ));
        }
        validate_source_message_tx(&tx, request)?;

        if let Some(existing) =
            find_by_source_call_tx(&tx, &request.source_message_id, &request.tool_call_id)?
        {
            ensure_same_begin(&existing, request)?;
            let receipt = begin_existing_execution_tx(&tx, existing, request, now)?;
            tx.commit()?;
            return Ok(receipt);
        }
        if let Some(existing) = find_by_idempotency_tx(&tx, &request.idempotency_key)? {
            ensure_same_begin(&existing, request)?;
            let receipt = begin_existing_execution_tx(&tx, existing, request, now)?;
            tx.commit()?;
            return Ok(receipt);
        }

        let execution_id = format!("toolx_{}", Uuid::now_v7());
        let running = request.state == "running";
        let finished_at = (request.state == "denied").then_some(now);
        tx.execute(
            "INSERT INTO tool_execution (
                id, session_id, turn_id, input_id, source_message_id,
                principal_id, tool_call_id, tool_name, input_json,
                descriptor_json, permission_json, state,
                current_invocation_attempt_id, attempt_count, idempotency_key,
                approval_revision, recovery_revision, recovery_json, content_json, content_digest,
                is_error, error_json, created_at, finished_at,
                updated_at, activity_json
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?,
                       0, 0, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?)",
            params![
                execution_id,
                request.session_id,
                request.turn_id,
                request.input_id,
                request.source_message_id,
                request.principal_id,
                request.tool_call_id,
                request.tool_name,
                serde_json::to_string(&request.input)?,
                serde_json::to_string(&request.descriptor)?,
                serde_json::to_string(&request.permission)?,
                request.state,
                request.idempotency_key,
                now,
                finished_at,
                now,
                request
                    .activity
                    .as_ref()
                    .map(serde_json::to_string)
                    .transpose()?
            ],
        )?;
        if request.state == "denied" {
            persist_denied_tool_result_tx(
                &tx,
                &execution_id,
                &request.tool_name,
                permission_reason(&request.permission),
                "permission_denied",
                now,
            )?;
        }
        let invocation_attempt = if running {
            Some(create_tool_attempt_tx(&tx, &execution_id, request, 1, now)?)
        } else {
            None
        };
        append_tool_event_tx(
            &tx,
            match request.state.as_str() {
                "running" => "tool.execution.started",
                "denied" => "tool.execution.denied",
                _ => "tool.execution.approval_required",
            },
            ToolEventIdentity {
                execution_id: &execution_id,
                session_id: &request.session_id,
                turn_id: &request.turn_id,
                session_attempt_id: &request.attempt_id,
                input_id: &request.input_id,
                source_message_id: &request.source_message_id,
            },
            &serde_json::json!({
                "toolCallId": request.tool_call_id,
                "toolName": request.tool_name,
                "state": request.state,
                "invocationAttemptId": invocation_attempt.as_ref().map(|attempt| &attempt.id)
            }),
            now,
        )?;
        let execution = get_tool_execution_tx(&tx, &execution_id)?;
        let approval_suspension = if request.state == "approval_required" {
            Some(suspend_for_tool_approval_tx(&tx, &execution, request, now)?)
        } else {
            None
        };
        let execution = get_tool_execution_tx(&tx, &execution_id)?;
        tx.commit()?;
        Ok(BeginToolExecutionReceipt {
            execution,
            invocation_attempt,
            approval_suspension,
            created: true,
        })
    }

    pub fn finish_tool_execution(
        &self,
        request: &FinishToolExecution,
    ) -> Result<Option<ToolExecutionRecord>> {
        validate_finish(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        if validate_turn_lease(&tx, finish_identity(request), now)?.is_none() {
            tx.commit()?;
            return Ok(None);
        }
        let Some(existing) = get_optional_tool_execution_tx(&tx, &request.execution_id)? else {
            tx.commit()?;
            return Ok(None);
        };
        ensure_finish_identity(&existing, request)?;
        if request.result_presentation.is_some() && existing.activity.is_none() {
            return Err(SystemServiceError::Invariant(
                "tool result presentation requires a persisted call presentation".to_string(),
            ));
        }
        let next_activity = existing.activity.clone().map(|mut activity| {
            activity.result = request.result_presentation.clone();
            activity
        });
        let attempt = get_tool_attempt_tx(&tx, &request.invocation_attempt_id)?;
        ensure_attempt_owner(&attempt, request)?;
        validate_tool_settlement_tx(
            &tx,
            &request.state,
            request.content.as_deref(),
            request.content_digest.as_deref(),
            request.is_error,
            request.error.as_ref(),
        )?;

        if attempt.state != "running" || existing.state != "running" {
            if attempt.state != request.state
                || existing.state != request.state
                || existing.content != request.content
                || existing.content_digest != request.content_digest
                || existing.is_error != request.is_error
                || existing
                    .activity
                    .as_ref()
                    .and_then(|activity| activity.result.as_ref())
                    != request.result_presentation.as_ref()
                || existing.error != request.error
            {
                return Err(SystemServiceError::Invariant(
                    "conflicting repeated tool execution settlement".to_string(),
                ));
            }
            tx.commit()?;
            return Ok(Some(existing));
        }
        if existing.current_invocation_attempt_id.as_deref()
            != Some(request.invocation_attempt_id.as_str())
        {
            tx.commit()?;
            return Ok(None);
        }

        tx.execute(
            "UPDATE tool_execution_attempt
             SET state = ?, error_json = ?, finished_at = ?, updated_at = ?
             WHERE id = ? AND state = 'running'",
            params![
                request.state,
                request
                    .error
                    .as_ref()
                    .map(serde_json::to_string)
                    .transpose()?,
                now,
                now,
                request.invocation_attempt_id
            ],
        )?;
        tx.execute(
            "UPDATE tool_execution
             SET state = ?, content_json = ?, content_digest = ?,
                 is_error = ?, error_json = ?,
                 finished_at = ?, updated_at = ?, activity_json = ?
             WHERE id = ? AND state = 'running'
               AND current_invocation_attempt_id = ?",
            params![
                request.state,
                request
                    .content
                    .as_ref()
                    .map(serde_json::to_string)
                    .transpose()?,
                request.content_digest,
                request.is_error,
                request
                    .error
                    .as_ref()
                    .map(serde_json::to_string)
                    .transpose()?,
                now,
                now,
                next_activity
                    .as_ref()
                    .map(serde_json::to_string)
                    .transpose()?,
                request.execution_id,
                request.invocation_attempt_id
            ],
        )?;
        append_tool_event_tx(
            &tx,
            &format!("tool.execution.{}", request.state),
            ToolEventIdentity {
                execution_id: &existing.id,
                session_id: &existing.session_id,
                turn_id: &existing.turn_id,
                session_attempt_id: &request.session_attempt_id,
                input_id: &existing.input_id,
                source_message_id: &existing.source_message_id,
            },
            &serde_json::json!({
                "toolCallId": existing.tool_call_id,
                "toolName": existing.tool_name,
                "state": request.state,
                "invocationAttemptId": request.invocation_attempt_id
            }),
            now,
        )?;
        let execution = get_tool_execution_tx(&tx, &request.execution_id)?;
        tx.commit()?;
        Ok(Some(execution))
    }

    pub fn require_tool_execution_recovery(
        &self,
        request: &RequireToolExecutionRecovery,
    ) -> Result<Option<RequireToolExecutionRecoveryReceipt>> {
        validate_require_recovery(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        if validate_turn_lease(&tx, recovery_identity(request), now)?.is_none() {
            tx.commit()?;
            return Ok(None);
        }
        let Some(execution) = get_optional_tool_execution_tx(&tx, &request.execution_id)? else {
            tx.commit()?;
            return Ok(None);
        };
        ensure_recovery_identity(&execution, request)?;
        let tool_attempt = get_tool_attempt_tx(&tx, &request.invocation_attempt_id)?;
        ensure_recovery_attempt_owner(&tool_attempt, request)?;
        if execution.state != "running"
            || tool_attempt.state != "running"
            || execution.current_invocation_attempt_id.as_deref()
                != Some(request.invocation_attempt_id.as_str())
        {
            return Err(SystemServiceError::Invariant(
                "ambiguous tool outcome does not own the running physical attempt".to_string(),
            ));
        }

        let recovery_json = serde_json::to_string(&request.evidence)?;
        let peer_evidence = serde_json::json!({
            "type": "ambiguous_tool_outcome",
            "message": "parallel tool outcome became uncertain when its turn owner was fenced",
            "metadata": { "causeExecutionId": request.execution_id }
        });
        let peer_json = serde_json::to_string(&peer_evidence)?;
        tx.execute(
            "UPDATE tool_execution
             SET state = 'recovery_required',
                 recovery_revision = recovery_revision + 1,
                 recovery_json = CASE WHEN id = ? THEN ? ELSE ? END,
                 error_json = CASE WHEN id = ? THEN ? ELSE ? END,
                 updated_at = ?, finished_at = ?
             WHERE turn_id = ? AND state = 'running'",
            params![
                request.execution_id,
                recovery_json,
                peer_json,
                request.execution_id,
                recovery_json,
                peer_json,
                now,
                now,
                request.turn_id
            ],
        )?;

        let turn = crate::sessions::get_turn_tx(&tx, &request.turn_id)?;
        let attempt = crate::turns::get_attempt_tx(&tx, &request.session_attempt_id)?;
        let job = crate::scheduler::get_job_tx(&tx, &request.job_id)?;
        crate::turns::require_session_turn_recovery_tx(
            &tx,
            &job,
            &turn,
            &attempt,
            crate::turns::SessionTurnRecoveryRequirement {
                reason: "ambiguous_tool_outcome",
                cause: Some(&request.evidence),
                retain_budget: true,
            },
            now,
        )?;
        append_tool_event_tx(
            &tx,
            "tool.execution.recovery_required",
            ToolEventIdentity {
                execution_id: &execution.id,
                session_id: &execution.session_id,
                turn_id: &execution.turn_id,
                session_attempt_id: &request.session_attempt_id,
                input_id: &execution.input_id,
                source_message_id: &execution.source_message_id,
            },
            &serde_json::json!({
                "toolCallId": execution.tool_call_id,
                "toolName": execution.tool_name,
                "state": "recovery_required"
            }),
            now,
        )?;
        let receipt = RequireToolExecutionRecoveryReceipt {
            execution: get_tool_execution_tx(&tx, &request.execution_id)?,
            turn: crate::sessions::get_turn_tx(&tx, &request.turn_id)?,
            attempt: crate::turns::get_attempt_tx(&tx, &request.session_attempt_id)?,
            job: crate::scheduler::get_job_tx(&tx, &request.job_id)?,
        };
        tx.commit()?;
        Ok(Some(receipt))
    }

    pub fn resolve_tool_execution_recovery(
        &self,
        request: &ResolveToolExecutionRecovery,
    ) -> Result<ResolveToolExecutionRecoveryReceipt> {
        validate_resolve_recovery(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;
        if let Some(existing) =
            find_recovery_decision_by_idempotency_tx(&tx, &request.idempotency_key)?
        {
            ensure_same_recovery_decision(&existing, request)?;
            let execution = get_tool_execution_tx(&tx, &existing.execution_id)?;
            tx.commit()?;
            return Ok(ResolveToolExecutionRecoveryReceipt {
                execution,
                recovery_decision: existing,
            });
        }

        let execution = get_tool_execution_tx(&tx, &request.execution_id)?;
        if execution.state != "recovery_required"
            || execution.recovery_revision != request.expected_recovery_revision
        {
            return Err(SystemServiceError::Conflict(
                "tool recovery decision is stale or the execution is not recoverable".to_string(),
            ));
        }
        let turn = crate::sessions::get_turn_tx(&tx, &execution.turn_id)?;
        if turn.state != "recovery_required" {
            return Err(SystemServiceError::Invariant(
                "tool recovery requires a recovery-required logical turn".to_string(),
            ));
        }

        if matches!(
            request.decision.as_str(),
            "confirm_succeeded" | "confirm_failed"
        ) {
            validate_tool_settlement_tx(
                &tx,
                if request.decision == "confirm_succeeded" {
                    "succeeded"
                } else {
                    "failed"
                },
                request.content.as_deref(),
                request.content_digest.as_deref(),
                Some(request.decision == "confirm_failed"),
                request.error.as_ref(),
            )?;
        }
        let action = match request.decision.as_str() {
            "confirm_succeeded" => {
                settle_recovered_tool_tx(&tx, &execution, request, false, now)?;
                requeue_if_tool_recovery_complete_tx(&tx, &turn, now)?
            }
            "confirm_failed" => {
                settle_recovered_tool_tx(&tx, &execution, request, true, now)?;
                requeue_if_tool_recovery_complete_tx(&tx, &turn, now)?
            }
            "retry" => {
                prepare_recovered_tool_retry_tx(&tx, &execution, &turn, now)?;
                requeue_if_tool_recovery_complete_tx(&tx, &turn, now)?
            }
            "abandon_turn" => {
                abandon_recovered_turn_tx(&tx, &execution, &turn, request, now)?;
                "turn_abandoned"
            }
            _ => unreachable!("validated tool recovery decision"),
        };
        let decision = insert_recovery_decision_tx(&tx, request, action, now)?;
        append_tool_event_tx(
            &tx,
            "tool.execution.recovery_resolved",
            ToolEventIdentity {
                execution_id: &execution.id,
                session_id: &execution.session_id,
                turn_id: &execution.turn_id,
                session_attempt_id: turn.current_attempt_id.as_deref().ok_or_else(|| {
                    SystemServiceError::Invariant(
                        "recovery-required turn has no physical attempt".to_string(),
                    )
                })?,
                input_id: &execution.input_id,
                source_message_id: &execution.source_message_id,
            },
            &serde_json::json!({
                "decision": request.decision,
                "action": action,
                "recoveryRevision": request.expected_recovery_revision,
                "principalId": request.principal_id
            }),
            now,
        )?;
        let receipt = ResolveToolExecutionRecoveryReceipt {
            execution: get_tool_execution_tx(&tx, &request.execution_id)?,
            recovery_decision: decision,
        };
        tx.commit()?;
        Ok(receipt)
    }

    pub fn resolve_tool_execution_approval(
        &self,
        request: &ResolveToolExecutionApproval,
    ) -> Result<ResolveToolExecutionApprovalReceipt> {
        validate_resolve_approval(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;
        if let Some(existing) =
            find_approval_decision_by_idempotency_tx(&tx, &request.idempotency_key)?
        {
            ensure_same_approval_decision(&existing, request)?;
            let execution = get_tool_execution_tx(&tx, &existing.execution_id)?;
            let turn = crate::sessions::get_turn_tx(&tx, &execution.turn_id)?;
            let job = crate::scheduler::get_job_tx(&tx, &turn.job_id)?;
            tx.commit()?;
            return Ok(ResolveToolExecutionApprovalReceipt {
                execution,
                approval_decision: existing,
                turn,
                job,
            });
        }

        let execution = get_tool_execution_tx(&tx, &request.execution_id)?;
        if execution.state != "approval_required"
            || execution.approval_revision != request.expected_approval_revision
        {
            return Err(SystemServiceError::Conflict(
                "tool approval decision is stale or the execution is not awaiting approval"
                    .to_string(),
            ));
        }
        if execution.principal_id != request.principal_id {
            return Err(SystemServiceError::Conflict(
                "tool approval reviewer does not match the execution principal".to_string(),
            ));
        }
        let turn = crate::sessions::get_turn_tx(&tx, &execution.turn_id)?;
        let job = crate::scheduler::get_job_tx(&tx, &turn.job_id)?;
        if turn.state != "waiting"
            || turn.current_attempt_id.is_some()
            || job.kind != "session.turn"
            || job.state != "waiting"
            || job.lease_owner.is_some()
            || job.lease_token.is_some()
        {
            return Err(SystemServiceError::Invariant(
                "tool approval requires a lease-free waiting Turn and Session Job".to_string(),
            ));
        }

        let next_revision = execution.approval_revision + 1;
        match request.decision.as_str() {
            "approve_once" => {
                let updated = tx.execute(
                    "UPDATE tool_execution
                     SET state = 'approved', approval_revision = ?, updated_at = ?,
                         finished_at = NULL
                     WHERE id = ? AND state = 'approval_required'
                       AND approval_revision = ?",
                    params![
                        next_revision,
                        now,
                        execution.id,
                        request.expected_approval_revision
                    ],
                )?;
                if updated != 1 {
                    return Err(SystemServiceError::Conflict(
                        "tool approval lost its pending execution".to_string(),
                    ));
                }
            }
            "deny" => {
                persist_denied_tool_result_tx(
                    &tx,
                    &execution.id,
                    &execution.tool_name,
                    &request.reason,
                    "approval_denied",
                    now,
                )?;
                let updated = tx.execute(
                    "UPDATE tool_execution
                     SET approval_revision = ?, updated_at = ?
                     WHERE id = ? AND state = 'denied' AND approval_revision = ?",
                    params![
                        next_revision,
                        now,
                        execution.id,
                        request.expected_approval_revision
                    ],
                )?;
                if updated != 1 {
                    return Err(SystemServiceError::Conflict(
                        "tool denial lost its pending execution".to_string(),
                    ));
                }
            }
            _ => unreachable!("validated tool approval decision"),
        }

        wake_approval_turn_tx(&tx, &turn, now)?;
        let decision = insert_approval_decision_tx(&tx, request, next_revision, now)?;
        let suspended_attempt_id = latest_suspended_attempt_id_tx(&tx, &turn.id)?;
        append_tool_event_tx(
            &tx,
            "tool.execution.approval_resolved",
            ToolEventIdentity {
                execution_id: &execution.id,
                session_id: &execution.session_id,
                turn_id: &execution.turn_id,
                session_attempt_id: &suspended_attempt_id,
                input_id: &execution.input_id,
                source_message_id: &execution.source_message_id,
            },
            &serde_json::json!({
                "decision": request.decision,
                "approvalRevision": next_revision,
                "principalId": request.principal_id
            }),
            now,
        )?;
        let receipt = ResolveToolExecutionApprovalReceipt {
            execution: get_tool_execution_tx(&tx, &execution.id)?,
            approval_decision: decision,
            turn: crate::sessions::get_turn_tx(&tx, &turn.id)?,
            job: crate::scheduler::get_job_tx(&tx, &turn.job_id)?,
        };
        tx.commit()?;
        Ok(receipt)
    }

    pub fn get_tool_execution(&self, execution_id: &str) -> Result<Option<ToolExecutionRecord>> {
        let conn = self.connect()?;
        conn.query_row(
            &format!("{TOOL_EXECUTION_SELECT} WHERE id = ?"),
            params![execution_id],
            row_to_tool_execution,
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn get_tool_execution_by_call(
        &self,
        request: &GetToolExecutionByCall,
    ) -> Result<Option<ToolExecutionRecord>> {
        if request.turn_id.is_empty()
            || request.source_message_id.is_empty()
            || request.tool_call_id.is_empty()
        {
            return Err(SystemServiceError::InvalidInput(
                "tool execution call identity fields must not be empty".to_string(),
            ));
        }
        let conn = self.connect()?;
        conn.query_row(
            &format!(
                "{TOOL_EXECUTION_SELECT}
                 WHERE turn_id = ? AND source_message_id = ? AND tool_call_id = ?"
            ),
            params![
                request.turn_id,
                request.source_message_id,
                request.tool_call_id
            ],
            row_to_tool_execution,
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn list_tool_executions(
        &self,
        request: &ListToolExecutions,
    ) -> Result<Vec<ToolExecutionRecord>> {
        let conn = self.connect()?;
        let limit = request.limit.unwrap_or(100).clamp(1, 1000);
        let mut stmt = conn.prepare(&format!(
            "{TOOL_EXECUTION_SELECT}
             WHERE (?1 IS NULL OR session_id = ?1)
               AND (?2 IS NULL OR turn_id = ?2)
               AND (?3 IS NULL OR state = ?3)
             ORDER BY updated_at ASC, id ASC LIMIT ?4"
        ))?;
        let rows = stmt.query_map(
            params![request.session_id, request.turn_id, request.state, limit],
            row_to_tool_execution,
        )?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    pub fn list_tool_activities(
        &self,
        request: &ListToolActivities,
    ) -> Result<Vec<crate::ToolActivityRecord>> {
        let unique_ids = request.source_message_ids.iter().collect::<HashSet<_>>();
        if request.session_id.is_empty()
            || request.source_message_ids.is_empty()
            || request.source_message_ids.len() > 200
            || request.source_message_ids.iter().any(|id| id.is_empty())
            || unique_ids.len() != request.source_message_ids.len()
        {
            return Err(SystemServiceError::InvalidInput(
                "tool activity filter requires one session and 1 to 200 unique source message ids"
                    .to_string(),
            ));
        }
        let placeholders = std::iter::repeat_n("?", request.source_message_ids.len())
            .collect::<Vec<_>>()
            .join(", ");
        let query = format!(
            "SELECT session_id, turn_id, source_message_id, tool_call_id,
                    tool_name, state, activity_json, updated_at
             FROM tool_execution
             WHERE session_id = ? AND source_message_id IN ({placeholders})
             ORDER BY updated_at ASC, id ASC"
        );
        let conn = self.connect()?;
        let mut statement = conn.prepare(&query)?;
        let values = std::iter::once(request.session_id.as_str())
            .chain(request.source_message_ids.iter().map(String::as_str));
        let rows = statement.query_map(params_from_iter(values), row_to_tool_activity)?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    pub fn list_tool_execution_attempts(
        &self,
        request: &ListToolExecutionAttempts,
    ) -> Result<Vec<ToolExecutionAttemptRecord>> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare(&format!(
            "{TOOL_ATTEMPT_SELECT} WHERE execution_id = ?
             ORDER BY attempt_number ASC, id ASC"
        ))?;
        let rows = stmt.query_map(params![request.execution_id], row_to_tool_execution_attempt)?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }
}

pub(crate) fn validate_deferred_tool_owner_tx(
    tx: &rusqlite::Transaction<'_>,
    request: &DeferToolExecution,
    now: i64,
) -> Result<DeferredToolOwner> {
    let lease = crate::turns::TurnAttemptLeaseIdentity {
        session_id: &request.session_id,
        turn_id: &request.turn_id,
        attempt_id: &request.session_attempt_id,
        input_id: &request.input_id,
        job_id: &request.session_job_id,
        worker_id: &request.worker_id,
        lease_token: &request.lease_token,
    };
    if crate::turns::validate_turn_attempt_lease_tx(tx, &lease, now)?.is_none() {
        return Err(SystemServiceError::Invariant(
            "deferred tool handoff does not own the active turn lease".to_string(),
        ));
    }

    let owner = DeferredToolOwner {
        turn: crate::sessions::get_turn_tx(tx, &request.turn_id)?,
        session_attempt: crate::turns::get_attempt_tx(tx, &request.session_attempt_id)?,
        session_job: crate::scheduler::get_job_tx(tx, &request.session_job_id)?,
        tool_execution: get_tool_execution_tx(tx, &request.tool_execution_id)?,
        tool_attempt: get_tool_attempt_tx(tx, &request.tool_invocation_attempt_id)?,
    };
    if owner.turn.session_id != request.session_id
        || owner.turn.primary_input_id != request.input_id
        || owner.turn.job_id != request.session_job_id
        || owner.turn.state != "running"
        || owner.turn.current_attempt_id.as_deref() != Some(request.session_attempt_id.as_str())
    {
        return Err(SystemServiceError::Invariant(
            "deferred tool handoff turn identity is not active".to_string(),
        ));
    }
    if owner.session_attempt.session_id != request.session_id
        || owner.session_attempt.turn_id != request.turn_id
        || owner.session_attempt.input_id != request.input_id
        || owner.session_attempt.job_id != request.session_job_id
        || owner.session_attempt.worker_id != request.worker_id
        || owner.session_attempt.lease_token != request.lease_token
        || owner.session_attempt.state != "running"
    {
        return Err(SystemServiceError::Invariant(
            "deferred tool handoff session attempt does not match".to_string(),
        ));
    }
    if owner.session_job.id != request.session_job_id
        || owner.session_job.kind != "session.turn"
        || owner.session_job.state != "running"
        || owner.session_job.principal_id != owner.tool_execution.principal_id
        || owner.session_job.lease_owner.as_deref() != Some(request.worker_id.as_str())
        || owner.session_job.lease_token.as_deref() != Some(request.lease_token.as_str())
    {
        return Err(SystemServiceError::Invariant(
            "deferred tool handoff session job does not match".to_string(),
        ));
    }
    if owner.tool_execution.id != request.tool_execution_id
        || owner.tool_execution.session_id != request.session_id
        || owner.tool_execution.turn_id != request.turn_id
        || owner.tool_execution.input_id != request.input_id
        || owner.tool_execution.source_message_id != request.source_message_id
        || owner.tool_execution.tool_call_id != request.tool_call_id
        || owner.tool_execution.state != "running"
        || owner
            .tool_execution
            .current_invocation_attempt_id
            .as_deref()
            != Some(request.tool_invocation_attempt_id.as_str())
    {
        return Err(SystemServiceError::Invariant(
            "deferred tool handoff execution does not match".to_string(),
        ));
    }
    if owner.tool_attempt.id != request.tool_invocation_attempt_id
        || owner.tool_attempt.execution_id != request.tool_execution_id
        || owner.tool_attempt.session_attempt_id != request.session_attempt_id
        || owner.tool_attempt.job_id != request.session_job_id
        || owner.tool_attempt.worker_id != request.worker_id
        || owner.tool_attempt.state != "running"
    {
        return Err(SystemServiceError::Invariant(
            "deferred tool handoff invocation attempt does not match".to_string(),
        ));
    }
    if owner
        .tool_execution
        .permission
        .get("status")
        .and_then(serde_json::Value::as_str)
        != Some("allow")
    {
        return Err(SystemServiceError::Invariant(
            "deferred tool handoff requires an allowed execution".to_string(),
        ));
    }
    if owner
        .tool_execution
        .descriptor
        .get("resultMode")
        .and_then(serde_json::Value::as_str)
        != Some("deferred")
        || owner
            .tool_execution
            .descriptor
            .get("concurrency")
            .and_then(serde_json::Value::as_str)
            != Some("exclusive")
        || owner
            .tool_execution
            .descriptor
            .get("idempotent")
            .and_then(serde_json::Value::as_bool)
            != Some(true)
    {
        return Err(SystemServiceError::Invariant(
            "deferred tool handoff requires a deferred, exclusive, idempotent descriptor"
                .to_string(),
        ));
    }
    Ok(owner)
}

pub(crate) fn suspend_deferred_tool_owner_tx(
    tx: &rusqlite::Transaction<'_>,
    request: &DeferToolExecution,
    operation: &serde_json::Value,
    scheduler_reason: &str,
    now: i64,
) -> Result<()> {
    let suspended_tool_attempt = tx.execute(
        "UPDATE tool_execution_attempt
         SET state = 'suspended', updated_at = ?, finished_at = ?
         WHERE id = ? AND execution_id = ? AND session_attempt_id = ?
           AND job_id = ? AND worker_id = ? AND lease_token = ? AND state = 'running'",
        params![
            now,
            now,
            request.tool_invocation_attempt_id,
            request.tool_execution_id,
            request.session_attempt_id,
            request.session_job_id,
            request.worker_id,
            request.lease_token
        ],
    )?;
    let waiting_tool = tx.execute(
        "UPDATE tool_execution SET state = 'waiting', updated_at = ?
         WHERE id = ? AND state = 'running' AND current_invocation_attempt_id = ?",
        params![
            now,
            request.tool_execution_id,
            request.tool_invocation_attempt_id
        ],
    )?;
    let suspended_attempt = tx.execute(
        "UPDATE session_attempt
         SET state = 'suspended', updated_at = ?, finished_at = ?
         WHERE id = ? AND turn_id = ? AND state = 'running'",
        params![now, now, request.session_attempt_id, request.turn_id],
    )?;
    let waiting_turn = tx.execute(
        "UPDATE session_turn
         SET state = 'waiting', current_attempt_id = NULL, updated_at = ?
         WHERE id = ? AND state = 'running' AND current_attempt_id = ?",
        params![now, request.turn_id, request.session_attempt_id],
    )?;
    let waiting_job = tx.execute(
        "UPDATE scheduler_job
         SET state = 'waiting', not_before = NULL, lease_owner = NULL,
             lease_token = NULL, lease_expires_at = NULL, updated_at = ?
         WHERE id = ? AND kind = 'session.turn' AND state = 'running'
           AND lease_owner = ? AND lease_token = ?",
        params![
            now,
            request.session_job_id,
            request.worker_id,
            request.lease_token
        ],
    )?;
    if suspended_tool_attempt != 1
        || waiting_tool != 1
        || suspended_attempt != 1
        || waiting_turn != 1
        || waiting_job != 1
    {
        return Err(SystemServiceError::Invariant(
            "deferred tool handoff lost an active owner".to_string(),
        ));
    }
    tx.execute(
        "UPDATE session_turn_control SET status = 'cancelled', updated_at = ?
         WHERE turn_id = ? AND attempt_id = ? AND kind = 'interrupt' AND status = 'pending'",
        params![now, request.turn_id, request.session_attempt_id],
    )?;
    let evidence = serde_json::json!({
        "toolExecutionId": request.tool_execution_id,
        "toolCallId": request.tool_call_id,
        "operation": operation
    });
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        "tool.execution.deferred",
        &EventScope {
            session_id: Some(request.session_id.clone()),
            turn_id: Some(request.turn_id.clone()),
            attempt_id: Some(request.session_attempt_id.clone()),
            input_id: Some(request.input_id.clone()),
            message_id: Some(request.source_message_id.clone()),
            ..EventScope::default()
        },
        &evidence,
        now,
    )?;
    crate::scheduler::append_scheduler_event_tx(
        tx,
        "scheduler.job.waiting",
        &request.session_job_id,
        &serde_json::json!({
            "turnId": request.turn_id,
            "reason": scheduler_reason,
            "operation": operation
        }),
        now,
    )
}

fn begin_existing_execution_tx(
    tx: &rusqlite::Transaction<'_>,
    existing: ToolExecutionRecord,
    request: &BeginToolExecution,
    now: i64,
) -> Result<BeginToolExecutionReceipt> {
    if matches!(existing.state.as_str(), "retry_ready" | "approved") {
        if (existing.state == "retry_ready" && request.state != "running")
            || (existing.state == "approved" && request.state != "approval_required")
        {
            return Err(SystemServiceError::Invariant(
                "ready tool execution has a conflicting resumed admission".to_string(),
            ));
        }
        let attempt_number = existing.attempt_count + 1;
        let invocation_attempt =
            create_tool_attempt_tx(tx, &existing.id, request, attempt_number, now)?;
        let execution = get_tool_execution_tx(tx, &existing.id)?;
        return Ok(BeginToolExecutionReceipt {
            execution,
            invocation_attempt: Some(invocation_attempt),
            approval_suspension: None,
            created: false,
        });
    }

    let invocation_attempt = if existing.state == "running" {
        existing
            .current_invocation_attempt_id
            .as_deref()
            .map(|attempt_id| get_tool_attempt_tx(tx, attempt_id))
            .transpose()?
    } else {
        None
    };
    Ok(BeginToolExecutionReceipt {
        execution: existing,
        invocation_attempt,
        approval_suspension: None,
        created: false,
    })
}

fn suspend_for_tool_approval_tx(
    tx: &rusqlite::Transaction<'_>,
    execution: &ToolExecutionRecord,
    request: &BeginToolExecution,
    now: i64,
) -> Result<ToolExecutionApprovalSuspensionReceipt> {
    if execution.state != "approval_required" || execution.current_invocation_attempt_id.is_some() {
        return Err(SystemServiceError::Invariant(
            "tool approval suspension requires an uninvoked pending execution".to_string(),
        ));
    }
    let suspended_attempt = tx.execute(
        "UPDATE session_attempt
         SET state = 'suspended', updated_at = ?, finished_at = ?
         WHERE id = ? AND turn_id = ? AND state = 'running'",
        params![now, now, request.attempt_id, request.turn_id],
    )?;
    let waiting_turn = tx.execute(
        "UPDATE session_turn
         SET state = 'waiting', current_attempt_id = NULL, updated_at = ?
         WHERE id = ? AND state = 'running' AND current_attempt_id = ?",
        params![now, request.turn_id, request.attempt_id],
    )?;
    let waiting_job = tx.execute(
        "UPDATE scheduler_job
         SET state = 'waiting', not_before = NULL, lease_owner = NULL,
             lease_token = NULL, lease_expires_at = NULL, updated_at = ?
         WHERE id = ? AND kind = 'session.turn' AND state = 'running'
           AND lease_owner = ? AND lease_token = ?",
        params![now, request.job_id, request.worker_id, request.lease_token],
    )?;
    if suspended_attempt != 1 || waiting_turn != 1 || waiting_job != 1 {
        return Err(SystemServiceError::Invariant(
            "tool approval suspension lost the active Turn owner".to_string(),
        ));
    }
    tx.execute(
        "UPDATE session_turn_control SET status = 'cancelled', updated_at = ?
         WHERE turn_id = ? AND attempt_id = ? AND kind = 'interrupt' AND status = 'pending'",
        params![now, request.turn_id, request.attempt_id],
    )?;
    let evidence = serde_json::json!({
        "turnId": request.turn_id,
        "jobId": request.job_id,
        "toolExecutionId": execution.id,
        "toolCallId": execution.tool_call_id
    });
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        "session.turn.suspended_for_tool_approval",
        &EventScope {
            session_id: Some(request.session_id.clone()),
            turn_id: Some(request.turn_id.clone()),
            attempt_id: Some(request.attempt_id.clone()),
            input_id: Some(request.input_id.clone()),
            message_id: Some(request.source_message_id.clone()),
            ..EventScope::default()
        },
        &evidence,
        now,
    )?;
    crate::scheduler::append_scheduler_event_tx(
        tx,
        "scheduler.job.waiting_for_tool_approval",
        &request.job_id,
        &evidence,
        now,
    )?;
    Ok(ToolExecutionApprovalSuspensionReceipt {
        execution: get_tool_execution_tx(tx, &execution.id)?,
        turn: crate::sessions::get_turn_tx(tx, &request.turn_id)?,
        attempt: crate::turns::get_attempt_tx(tx, &request.attempt_id)?,
        job: crate::scheduler::get_job_tx(tx, &request.job_id)?,
    })
}

fn create_tool_attempt_tx(
    tx: &rusqlite::Transaction<'_>,
    execution_id: &str,
    request: &BeginToolExecution,
    attempt_number: i64,
    now: i64,
) -> Result<ToolExecutionAttemptRecord> {
    let attempt_id = format!("toolattempt_{}", Uuid::now_v7());
    tx.execute(
        "INSERT INTO tool_execution_attempt (
            id, execution_id, session_attempt_id, job_id, worker_id,
            lease_token, attempt_number, state, error_json, started_at,
            updated_at, finished_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 'running', NULL, ?, ?, NULL)",
        params![
            attempt_id,
            execution_id,
            request.attempt_id,
            request.job_id,
            request.worker_id,
            request.lease_token,
            attempt_number,
            now,
            now
        ],
    )?;
    tx.execute(
        "UPDATE tool_execution
         SET state = 'running', current_invocation_attempt_id = ?,
             attempt_count = ?, content_json = NULL, content_digest = NULL,
             is_error = NULL,
             error_json = NULL, finished_at = NULL, updated_at = ?
         WHERE id = ? AND state IN ('running', 'retry_ready', 'approved')",
        params![attempt_id, attempt_number, now, execution_id],
    )?;
    get_tool_attempt_tx(tx, &attempt_id)
}

fn settle_recovered_tool_tx(
    tx: &rusqlite::Transaction<'_>,
    execution: &ToolExecutionRecord,
    request: &ResolveToolExecutionRecovery,
    is_error: bool,
    now: i64,
) -> Result<()> {
    let content = request.content.as_ref().ok_or_else(|| {
        SystemServiceError::InvalidInput(
            "confirmed tool recovery requires canonical content".to_string(),
        )
    })?;
    let content_digest = request.content_digest.as_ref().ok_or_else(|| {
        SystemServiceError::InvalidInput(
            "confirmed tool recovery requires a content digest".to_string(),
        )
    })?;
    if !is_error && request.error.is_some() {
        return Err(SystemServiceError::InvalidInput(
            "confirmed successful tool recovery cannot include an error".to_string(),
        ));
    }
    let state = if is_error { "failed" } else { "succeeded" };
    let updated = tx.execute(
        "UPDATE tool_execution
         SET state = ?, recovery_revision = recovery_revision + 1,
             content_json = ?, content_digest = ?, is_error = ?, error_json = ?,
             updated_at = ?, finished_at = ?
         WHERE id = ? AND state = 'recovery_required' AND recovery_revision = ?",
        params![
            state,
            serde_json::to_string(content)?,
            content_digest,
            is_error,
            request
                .error
                .as_ref()
                .map(serde_json::to_string)
                .transpose()?,
            now,
            now,
            execution.id,
            request.expected_recovery_revision
        ],
    )?;
    if updated != 1 {
        return Err(SystemServiceError::Conflict(
            "tool recovery result lost its expected revision".to_string(),
        ));
    }
    Ok(())
}

fn prepare_recovered_tool_retry_tx(
    tx: &rusqlite::Transaction<'_>,
    execution: &ToolExecutionRecord,
    turn: &crate::SessionTurnRecord,
    now: i64,
) -> Result<()> {
    if execution
        .descriptor
        .get("resultMode")
        .and_then(serde_json::Value::as_str)
        == Some("deferred")
    {
        return Err(SystemServiceError::Conflict(
            "deferred tool recovery cannot be retried".to_string(),
        ));
    }
    let idempotent = execution
        .descriptor
        .get("idempotent")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false);
    if !idempotent {
        return Err(SystemServiceError::Conflict(
            "non-idempotent tool recovery cannot be retried".to_string(),
        ));
    }
    let (_, max_attempts) = crate::turns::recovery_bounds(&turn.execution_binding)?;
    if execution.attempt_count >= max_attempts {
        return Err(SystemServiceError::Conflict(
            "idempotent tool recovery attempt bound is exhausted".to_string(),
        ));
    }
    let updated = tx.execute(
        "UPDATE tool_execution
         SET state = 'retry_ready', recovery_revision = recovery_revision + 1,
             content_json = NULL, content_digest = NULL, is_error = NULL,
             error_json = NULL,
             updated_at = ?, finished_at = NULL
         WHERE id = ? AND state = 'recovery_required' AND recovery_revision = ?",
        params![now, execution.id, execution.recovery_revision],
    )?;
    if updated != 1 {
        return Err(SystemServiceError::Conflict(
            "tool recovery retry lost its expected revision".to_string(),
        ));
    }
    Ok(())
}

fn requeue_if_tool_recovery_complete_tx(
    tx: &rusqlite::Transaction<'_>,
    turn: &crate::SessionTurnRecord,
    now: i64,
) -> Result<&'static str> {
    let remaining: bool = tx.query_row(
        "SELECT EXISTS(
           SELECT 1 FROM tool_execution
           WHERE turn_id = ? AND state = 'recovery_required'
         )",
        params![turn.id],
        |row| row.get(0),
    )?;
    if remaining {
        return Ok("waiting_for_other_recovery");
    }
    let attempt_id = turn.current_attempt_id.as_deref().ok_or_else(|| {
        SystemServiceError::Invariant("recovery-required turn has no physical attempt".to_string())
    })?;
    let updated_turn = tx.execute(
        "UPDATE session_turn
         SET state = 'queued', current_attempt_id = NULL, error_json = NULL,
             updated_at = ?, finished_at = NULL
         WHERE id = ? AND state = 'recovery_required' AND current_attempt_id = ?",
        params![now, turn.id, attempt_id],
    )?;
    let updated_input = tx.execute(
        "UPDATE session_input SET status = 'promoted', updated_at = ?
         WHERE id = ? AND status = 'failed'",
        params![now, turn.primary_input_id],
    )?;
    let updated_job = tx.execute(
        "UPDATE scheduler_job
         SET state = 'ready', result_json = NULL, last_error_json = NULL,
             lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL,
             updated_at = ?, finished_at = NULL
         WHERE id = ? AND kind = 'session.turn' AND state = 'failed'",
        params![now, turn.job_id],
    )?;
    if updated_turn != 1 || updated_input != 1 || updated_job != 1 {
        return Err(SystemServiceError::Invariant(
            "resolved tool recovery could not requeue its logical turn".to_string(),
        ));
    }
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        "session.turn.requeued_after_reconciliation",
        &EventScope {
            session_id: Some(turn.session_id.clone()),
            turn_id: Some(turn.id.clone()),
            attempt_id: Some(attempt_id.to_string()),
            input_id: Some(turn.primary_input_id.clone()),
            ..EventScope::default()
        },
        &serde_json::json!({
            "turnId": turn.id,
            "attemptId": attempt_id,
            "jobId": turn.job_id
        }),
        now,
    )?;
    crate::scheduler::append_scheduler_event_tx(
        tx,
        "scheduler.job.requeued_after_reconciliation",
        &turn.job_id,
        &serde_json::json!({ "turnId": turn.id }),
        now,
    )?;
    Ok("turn_requeued")
}

fn abandon_recovered_turn_tx(
    tx: &rusqlite::Transaction<'_>,
    execution: &ToolExecutionRecord,
    turn: &crate::SessionTurnRecord,
    request: &ResolveToolExecutionRecovery,
    now: i64,
) -> Result<()> {
    let attempt_id = turn.current_attempt_id.as_deref().ok_or_else(|| {
        SystemServiceError::Invariant("recovery-required turn has no physical attempt".to_string())
    })?;
    let unknown = serde_json::json!({
        "error": "tool_outcome_unknown",
        "message": request.reason
    });
    let unknown_json = serde_json::to_string(&unknown)?;
    let unknown_content = vec![ToolResultContentPart::Json {
        value: unknown.clone(),
    }];
    let unknown_content_json = serde_json::to_string(&unknown_content)?;
    let unknown_content_digest = tool_result_content_digest(&unknown_content);
    tx.execute(
        "UPDATE tool_execution
         SET state = 'failed', recovery_revision = recovery_revision + 1,
             content_json = ?, content_digest = ?, is_error = 1, error_json = ?,
             updated_at = ?, finished_at = ?
         WHERE turn_id = ? AND state IN ('recovery_required', 'retry_ready')",
        params![
            unknown_content_json,
            unknown_content_digest,
            unknown_json,
            now,
            now,
            turn.id
        ],
    )?;

    let content = exact_abandoned_tool_batch_tx(tx, turn, execution, &unknown)?;
    insert_session_message_tx(
        tx,
        NewSessionMessage {
            session_id: &turn.session_id,
            turn_id: &turn.id,
            attempt_id: Some(attempt_id),
            input_id: Some(&turn.primary_input_id),
            role: "tool",
            status: "completed",
            content: &content,
            provider_state: None,
            execution_binding_digest: &turn.execution_binding_digest,
            idempotency_key: Some(&format!("turn:{}:recovery-abandoned-tools", turn.id)),
        },
        now,
    )?;
    let resolution_error = serde_json::json!({
        "type": "tool_recovery_abandoned",
        "executionId": request.execution_id,
        "principalId": request.principal_id,
        "reason": request.reason
    });
    let resolution_json = serde_json::to_string(&resolution_error)?;
    let updated_attempt = tx.execute(
        "UPDATE session_attempt
         SET state = 'failed', error_json = ?, updated_at = ?, finished_at = ?
         WHERE id = ? AND state = 'recovery_required'",
        params![resolution_json, now, now, attempt_id],
    )?;
    let updated_turn = tx.execute(
        "UPDATE session_turn
         SET state = 'failed', error_json = ?, updated_at = ?, finished_at = ?
         WHERE id = ? AND state = 'recovery_required'",
        params![resolution_json, now, now, turn.id],
    )?;
    if updated_attempt != 1 || updated_turn != 1 {
        return Err(SystemServiceError::Invariant(
            "abandoned tool recovery lost its terminal turn".to_string(),
        ));
    }
    let job = crate::scheduler::get_job_tx(tx, &turn.job_id)?;
    if let Some(grant_id) = &job.budget_grant_id {
        crate::budget::commit_budget_grant_tx(tx, grant_id, now)?;
    }
    Ok(())
}

fn exact_abandoned_tool_batch_tx(
    tx: &rusqlite::Transaction<'_>,
    turn: &crate::SessionTurnRecord,
    execution: &ToolExecutionRecord,
    unknown: &serde_json::Value,
) -> Result<serde_json::Value> {
    let source_json: String = tx.query_row(
        "SELECT content_json FROM session_message
         WHERE id = ? AND session_id = ? AND turn_id = ? AND role = 'assistant'",
        params![execution.source_message_id, turn.session_id, turn.id],
        |row| row.get(0),
    )?;
    let source: serde_json::Value = serde_json::from_str(&source_json)?;
    let calls = source.as_array().ok_or_else(|| {
        SystemServiceError::Invariant(
            "tool recovery source message content is not an array".to_string(),
        )
    })?;
    let mut results = Vec::new();
    for call in calls {
        if call.get("type").and_then(serde_json::Value::as_str) != Some("tool_call") {
            continue;
        }
        let tool_call_id = call
            .get("toolCallId")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| {
                SystemServiceError::Invariant(
                    "tool recovery source call has no toolCallId".to_string(),
                )
            })?;
        let execution = tx
            .query_row(
                &format!("{TOOL_EXECUTION_SELECT} WHERE turn_id = ? AND tool_call_id = ?"),
                params![turn.id, tool_call_id],
                row_to_tool_execution,
            )
            .optional()?;
        let content = execution
            .as_ref()
            .and_then(|item| item.content.as_deref())
            .map(tool_result_content_json)
            .unwrap_or_else(|| {
                tool_result_content_json(&[ToolResultContentPart::Json {
                    value: unknown.clone(),
                }])
            });
        let content_digest = execution
            .as_ref()
            .and_then(|item| item.content_digest.clone())
            .unwrap_or_else(|| {
                tool_result_content_digest(&[ToolResultContentPart::Json {
                    value: unknown.clone(),
                }])
            });
        results.push(serde_json::json!({
            "type": "tool_result",
            "id": format!("tool_result_{}", tool_call_id),
            "toolCallId": tool_call_id,
            "content": content,
            "contentDigest": content_digest,
            "isError": execution.as_ref().and_then(|item| item.is_error).unwrap_or(true)
        }));
    }
    Ok(serde_json::Value::Array(results))
}

fn insert_recovery_decision_tx(
    tx: &rusqlite::Transaction<'_>,
    request: &ResolveToolExecutionRecovery,
    action: &str,
    now: i64,
) -> Result<ToolExecutionRecoveryDecisionRecord> {
    let id = format!("toolrecovery_{}", Uuid::now_v7());
    tx.execute(
        "INSERT INTO tool_execution_recovery_decision (
           id, execution_id, recovery_revision, decision, principal_id,
           reason, idempotency_key, content_json, content_digest, error_json,
           action, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params![
            id,
            request.execution_id,
            request.expected_recovery_revision,
            request.decision,
            request.principal_id,
            request.reason,
            request.idempotency_key,
            request
                .content
                .as_ref()
                .map(serde_json::to_string)
                .transpose()?,
            request.content_digest,
            request
                .error
                .as_ref()
                .map(serde_json::to_string)
                .transpose()?,
            action,
            now
        ],
    )?;
    get_recovery_decision_tx(tx, &id)
}

fn find_recovery_decision_by_idempotency_tx(
    tx: &rusqlite::Transaction<'_>,
    idempotency_key: &str,
) -> Result<Option<ToolExecutionRecoveryDecisionRecord>> {
    tx.query_row(
        "SELECT id, execution_id, recovery_revision, decision, principal_id,
                reason, idempotency_key, content_json, content_digest,
                error_json, action, created_at
         FROM tool_execution_recovery_decision WHERE idempotency_key = ?",
        params![idempotency_key],
        row_to_recovery_decision,
    )
    .optional()
    .map_err(Into::into)
}

fn get_recovery_decision_tx(
    tx: &rusqlite::Transaction<'_>,
    id: &str,
) -> Result<ToolExecutionRecoveryDecisionRecord> {
    tx.query_row(
        "SELECT id, execution_id, recovery_revision, decision, principal_id,
                reason, idempotency_key, content_json, content_digest,
                error_json, action, created_at
         FROM tool_execution_recovery_decision WHERE id = ?",
        params![id],
        row_to_recovery_decision,
    )
    .map_err(Into::into)
}

fn row_to_recovery_decision(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<ToolExecutionRecoveryDecisionRecord> {
    let content_json: Option<String> = row.get(7)?;
    let error_json: Option<String> = row.get(9)?;
    Ok(ToolExecutionRecoveryDecisionRecord {
        id: row.get(0)?,
        execution_id: row.get(1)?,
        recovery_revision: row.get(2)?,
        decision: row.get(3)?,
        principal_id: row.get(4)?,
        reason: row.get(5)?,
        idempotency_key: row.get(6)?,
        content: content_json
            .map(|raw| serde_json::from_str(&raw).map_err(json_sql_error))
            .transpose()?,
        content_digest: row.get(8)?,
        error: error_json
            .map(|raw| serde_json::from_str(&raw).map_err(json_sql_error))
            .transpose()?,
        action: row.get(10)?,
        created_at: row.get(11)?,
    })
}

fn insert_approval_decision_tx(
    tx: &rusqlite::Transaction<'_>,
    request: &ResolveToolExecutionApproval,
    approval_revision: i64,
    now: i64,
) -> Result<ToolExecutionApprovalDecisionRecord> {
    let id = format!("toolapproval_{}", Uuid::now_v7());
    tx.execute(
        "INSERT INTO tool_execution_approval_decision (
           id, execution_id, approval_revision, decision, principal_id,
           reason, idempotency_key, action, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 'turn_requeued', ?)",
        params![
            id,
            request.execution_id,
            approval_revision,
            request.decision,
            request.principal_id,
            request.reason,
            request.idempotency_key,
            now
        ],
    )?;
    get_approval_decision_tx(tx, &id)
}

fn find_approval_decision_by_idempotency_tx(
    tx: &rusqlite::Transaction<'_>,
    idempotency_key: &str,
) -> Result<Option<ToolExecutionApprovalDecisionRecord>> {
    tx.query_row(
        "SELECT id, execution_id, approval_revision, decision, principal_id,
                reason, idempotency_key, action, created_at
         FROM tool_execution_approval_decision WHERE idempotency_key = ?",
        params![idempotency_key],
        row_to_approval_decision,
    )
    .optional()
    .map_err(Into::into)
}

fn get_approval_decision_tx(
    tx: &rusqlite::Transaction<'_>,
    id: &str,
) -> Result<ToolExecutionApprovalDecisionRecord> {
    tx.query_row(
        "SELECT id, execution_id, approval_revision, decision, principal_id,
                reason, idempotency_key, action, created_at
         FROM tool_execution_approval_decision WHERE id = ?",
        params![id],
        row_to_approval_decision,
    )
    .map_err(Into::into)
}

fn row_to_approval_decision(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<ToolExecutionApprovalDecisionRecord> {
    Ok(ToolExecutionApprovalDecisionRecord {
        id: row.get(0)?,
        execution_id: row.get(1)?,
        approval_revision: row.get(2)?,
        decision: row.get(3)?,
        principal_id: row.get(4)?,
        reason: row.get(5)?,
        idempotency_key: row.get(6)?,
        action: row.get(7)?,
        created_at: row.get(8)?,
    })
}

fn ensure_same_approval_decision(
    existing: &ToolExecutionApprovalDecisionRecord,
    request: &ResolveToolExecutionApproval,
) -> Result<()> {
    if existing.execution_id != request.execution_id
        || existing.decision != request.decision
        || existing.principal_id != request.principal_id
        || existing.reason != request.reason
        || existing.approval_revision != request.expected_approval_revision + 1
    {
        return Err(SystemServiceError::Conflict(
            "conflicting repeated tool approval decision".to_string(),
        ));
    }
    Ok(())
}

fn wake_approval_turn_tx(
    tx: &rusqlite::Transaction<'_>,
    turn: &crate::SessionTurnRecord,
    now: i64,
) -> Result<()> {
    let updated_turn = tx.execute(
        "UPDATE session_turn
         SET state = 'queued', updated_at = ?, finished_at = NULL
         WHERE id = ? AND state = 'waiting' AND current_attempt_id IS NULL",
        params![now, turn.id],
    )?;
    let updated_job = tx.execute(
        "UPDATE scheduler_job
         SET state = 'ready', not_before = NULL, lease_owner = NULL,
             lease_token = NULL, lease_expires_at = NULL, result_json = NULL,
             last_error_json = NULL, updated_at = ?, finished_at = NULL
         WHERE id = ? AND kind = 'session.turn' AND state = 'waiting'",
        params![now, turn.job_id],
    )?;
    if updated_turn != 1 || updated_job != 1 {
        return Err(SystemServiceError::Invariant(
            "tool approval decision could not wake its waiting Turn".to_string(),
        ));
    }
    let evidence = serde_json::json!({
        "turnId": turn.id,
        "jobId": turn.job_id,
        "reason": "tool_approval_resolved"
    });
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        "session.turn.woken",
        &EventScope {
            session_id: Some(turn.session_id.clone()),
            turn_id: Some(turn.id.clone()),
            input_id: Some(turn.primary_input_id.clone()),
            ..EventScope::default()
        },
        &evidence,
        now,
    )?;
    crate::scheduler::append_scheduler_event_tx(
        tx,
        "scheduler.job.woken",
        &turn.job_id,
        &evidence,
        now,
    )
}

fn latest_suspended_attempt_id_tx(tx: &rusqlite::Transaction<'_>, turn_id: &str) -> Result<String> {
    tx.query_row(
        "SELECT id FROM session_attempt
         WHERE turn_id = ? AND state = 'suspended'
         ORDER BY attempt_number DESC, id DESC LIMIT 1",
        params![turn_id],
        |row| row.get(0),
    )
    .map_err(Into::into)
}

fn persist_denied_tool_result_tx(
    tx: &rusqlite::Transaction<'_>,
    execution_id: &str,
    tool_name: &str,
    reason: &str,
    code: &str,
    now: i64,
) -> Result<()> {
    let public_error = serde_json::json!({
        "error": code,
        "toolName": tool_name,
        "reason": reason
    });
    let content = [ToolResultContentPart::Json {
        value: public_error.clone(),
    }];
    validate_tool_result_content_tx(tx, &content)?;
    let content_digest = tool_result_content_digest(&content);
    let updated = tx.execute(
        "UPDATE tool_execution
         SET state = 'denied', content_json = ?, content_digest = ?,
             is_error = 1, error_json = ?, updated_at = ?, finished_at = ?
         WHERE id = ? AND state IN ('denied', 'approval_required')",
        params![
            serde_json::to_string(&content)?,
            content_digest,
            serde_json::to_string(&public_error)?,
            now,
            now,
            execution_id
        ],
    )?;
    if updated != 1 {
        return Err(SystemServiceError::Conflict(
            "tool denial lost its pending execution".to_string(),
        ));
    }
    Ok(())
}

fn permission_reason(permission: &serde_json::Value) -> &str {
    permission
        .get("reason")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("permission_denied")
}

fn json_sql_error(error: serde_json::Error) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(error))
}

fn validate_source_message_tx(
    tx: &rusqlite::Transaction<'_>,
    request: &BeginToolExecution,
) -> Result<()> {
    let content_json: Option<String> = tx
        .query_row(
            "SELECT content_json FROM session_message
             WHERE id = ? AND session_id = ? AND turn_id = ? AND role = 'assistant'",
            params![
                request.source_message_id,
                request.session_id,
                request.turn_id
            ],
            |row| row.get(0),
        )
        .optional()?;
    let Some(content_json) = content_json else {
        return Err(SystemServiceError::Invariant(
            "tool execution source message is not part of the logical turn".to_string(),
        ));
    };
    let content: serde_json::Value = serde_json::from_str(&content_json)?;
    let call_matches = content.as_array().is_some_and(|parts| {
        parts.iter().any(|part| {
            part.get("type").and_then(serde_json::Value::as_str) == Some("tool_call")
                && part.get("toolCallId").and_then(serde_json::Value::as_str)
                    == Some(request.tool_call_id.as_str())
                && part.get("toolName").and_then(serde_json::Value::as_str)
                    == Some(request.tool_name.as_str())
                && part.get("input") == Some(&request.input)
        })
    });
    if !call_matches {
        return Err(SystemServiceError::Invariant(
            "tool execution call is not present in its source assistant message".to_string(),
        ));
    }
    Ok(())
}

fn ensure_same_begin(existing: &ToolExecutionRecord, request: &BeginToolExecution) -> Result<()> {
    if existing.session_id != request.session_id
        || existing.turn_id != request.turn_id
        || existing.input_id != request.input_id
        || existing.source_message_id != request.source_message_id
        || existing.principal_id != request.principal_id
        || existing.tool_call_id != request.tool_call_id
        || existing.tool_name != request.tool_name
        || existing.input != request.input
        || existing.descriptor != request.descriptor
        || existing.permission != request.permission
        || existing.activity != request.activity
    {
        return Err(SystemServiceError::Invariant(
            "conflicting repeated tool execution begin".to_string(),
        ));
    }
    Ok(())
}

fn ensure_finish_identity(
    existing: &ToolExecutionRecord,
    request: &FinishToolExecution,
) -> Result<()> {
    if existing.session_id != request.session_id
        || existing.turn_id != request.turn_id
        || existing.input_id != request.input_id
    {
        return Err(SystemServiceError::Invariant(
            "tool execution finish identity does not match logical execution".to_string(),
        ));
    }
    Ok(())
}

fn ensure_attempt_owner(
    attempt: &ToolExecutionAttemptRecord,
    request: &FinishToolExecution,
) -> Result<()> {
    if attempt.execution_id != request.execution_id
        || attempt.session_attempt_id != request.session_attempt_id
        || attempt.job_id != request.job_id
        || attempt.worker_id != request.worker_id
    {
        return Err(SystemServiceError::Invariant(
            "tool invocation attempt does not match active owner".to_string(),
        ));
    }
    Ok(())
}

fn find_by_source_call_tx(
    tx: &rusqlite::Transaction<'_>,
    source_message_id: &str,
    tool_call_id: &str,
) -> Result<Option<ToolExecutionRecord>> {
    tx.query_row(
        &format!("{TOOL_EXECUTION_SELECT} WHERE source_message_id = ? AND tool_call_id = ?"),
        params![source_message_id, tool_call_id],
        row_to_tool_execution,
    )
    .optional()
    .map_err(Into::into)
}

fn find_by_idempotency_tx(
    tx: &rusqlite::Transaction<'_>,
    idempotency_key: &str,
) -> Result<Option<ToolExecutionRecord>> {
    tx.query_row(
        &format!("{TOOL_EXECUTION_SELECT} WHERE idempotency_key = ?"),
        params![idempotency_key],
        row_to_tool_execution,
    )
    .optional()
    .map_err(Into::into)
}

pub(crate) fn get_optional_tool_execution_tx(
    tx: &rusqlite::Transaction<'_>,
    execution_id: &str,
) -> Result<Option<ToolExecutionRecord>> {
    tx.query_row(
        &format!("{TOOL_EXECUTION_SELECT} WHERE id = ?"),
        params![execution_id],
        row_to_tool_execution,
    )
    .optional()
    .map_err(Into::into)
}

pub(crate) fn get_tool_execution_tx(
    tx: &rusqlite::Transaction<'_>,
    execution_id: &str,
) -> Result<ToolExecutionRecord> {
    get_optional_tool_execution_tx(tx, execution_id)?.ok_or_else(|| {
        SystemServiceError::Invariant(format!(
            "tool execution not found after write: {execution_id}"
        ))
    })
}

pub(crate) fn list_succeeded_tool_executions_by_name_tx(
    tx: &rusqlite::Transaction<'_>,
    turn_id: &str,
    tool_name: &str,
) -> Result<Vec<ToolExecutionRecord>> {
    let mut stmt = tx.prepare(&format!(
        "{TOOL_EXECUTION_SELECT}
         WHERE turn_id = ? AND tool_name = ? AND state = 'succeeded'
         ORDER BY finished_at ASC, id ASC LIMIT 2"
    ))?;
    let records = stmt
        .query_map(params![turn_id, tool_name], row_to_tool_execution)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(SystemServiceError::from)?;
    Ok(records)
}

pub(crate) fn get_tool_attempt_tx(
    tx: &rusqlite::Transaction<'_>,
    attempt_id: &str,
) -> Result<ToolExecutionAttemptRecord> {
    tx.query_row(
        &format!("{TOOL_ATTEMPT_SELECT} WHERE id = ?"),
        params![attempt_id],
        row_to_tool_execution_attempt,
    )
    .map_err(Into::into)
}

struct TurnLeaseIdentity<'a> {
    session_id: &'a str,
    turn_id: &'a str,
    session_attempt_id: &'a str,
    input_id: &'a str,
    job_id: &'a str,
    worker_id: &'a str,
    lease_token: &'a str,
}

fn begin_identity(request: &BeginToolExecution) -> TurnLeaseIdentity<'_> {
    TurnLeaseIdentity {
        session_id: &request.session_id,
        turn_id: &request.turn_id,
        session_attempt_id: &request.attempt_id,
        input_id: &request.input_id,
        job_id: &request.job_id,
        worker_id: &request.worker_id,
        lease_token: &request.lease_token,
    }
}

fn finish_identity(request: &FinishToolExecution) -> TurnLeaseIdentity<'_> {
    TurnLeaseIdentity {
        session_id: &request.session_id,
        turn_id: &request.turn_id,
        session_attempt_id: &request.session_attempt_id,
        input_id: &request.input_id,
        job_id: &request.job_id,
        worker_id: &request.worker_id,
        lease_token: &request.lease_token,
    }
}

fn recovery_identity(request: &RequireToolExecutionRecovery) -> TurnLeaseIdentity<'_> {
    TurnLeaseIdentity {
        session_id: &request.session_id,
        turn_id: &request.turn_id,
        session_attempt_id: &request.session_attempt_id,
        input_id: &request.input_id,
        job_id: &request.job_id,
        worker_id: &request.worker_id,
        lease_token: &request.lease_token,
    }
}

fn validate_turn_lease(
    tx: &rusqlite::Transaction<'_>,
    identity: TurnLeaseIdentity<'_>,
    now: i64,
) -> Result<Option<String>> {
    crate::turns::validate_turn_attempt_lease_tx(
        tx,
        &crate::turns::TurnAttemptLeaseIdentity {
            session_id: identity.session_id,
            turn_id: identity.turn_id,
            attempt_id: identity.session_attempt_id,
            input_id: identity.input_id,
            job_id: identity.job_id,
            worker_id: identity.worker_id,
            lease_token: identity.lease_token,
        },
        now,
    )
}

struct ToolEventIdentity<'a> {
    execution_id: &'a str,
    session_id: &'a str,
    turn_id: &'a str,
    session_attempt_id: &'a str,
    input_id: &'a str,
    source_message_id: &'a str,
}

fn append_tool_event_tx(
    tx: &rusqlite::Transaction<'_>,
    event_type: &str,
    identity: ToolEventIdentity<'_>,
    payload: &serde_json::Value,
    now: i64,
) -> Result<()> {
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        event_type,
        &EventScope {
            session_id: Some(identity.session_id.to_string()),
            turn_id: Some(identity.turn_id.to_string()),
            attempt_id: Some(identity.session_attempt_id.to_string()),
            input_id: Some(identity.input_id.to_string()),
            message_id: Some(identity.source_message_id.to_string()),
            ..EventScope::default()
        },
        &serde_json::json!({
            "executionId": identity.execution_id,
            "tool": payload
        }),
        now,
    )
}

fn validate_begin(request: &BeginToolExecution) -> Result<()> {
    if [
        request.session_id.as_str(),
        request.turn_id.as_str(),
        request.attempt_id.as_str(),
        request.input_id.as_str(),
        request.source_message_id.as_str(),
        request.job_id.as_str(),
        request.worker_id.as_str(),
        request.lease_token.as_str(),
        request.principal_id.as_str(),
        request.tool_call_id.as_str(),
        request.tool_name.as_str(),
        request.idempotency_key.as_str(),
    ]
    .iter()
    .any(|value| value.is_empty())
    {
        return Err(SystemServiceError::InvalidInput(
            "tool execution identity fields must not be empty".to_string(),
        ));
    }
    if !matches!(
        request.state.as_str(),
        "running" | "denied" | "approval_required"
    ) {
        return Err(SystemServiceError::InvalidInput(
            "invalid initial tool execution state".to_string(),
        ));
    }
    let expected_permission_status = match request.state.as_str() {
        "running" => "allow",
        "denied" => "deny",
        "approval_required" => "approval_required",
        _ => unreachable!("validated initial Tool state"),
    };
    if request
        .permission
        .get("status")
        .and_then(serde_json::Value::as_str)
        != Some(expected_permission_status)
        || permission_reason(&request.permission).is_empty()
        || permission_reason(&request.permission).len() > 1_024
    {
        return Err(SystemServiceError::InvalidInput(
            "tool permission does not match its initial execution state".to_string(),
        ));
    }
    if request.state == "approval_required" {
        if request
            .descriptor
            .get("concurrency")
            .and_then(serde_json::Value::as_str)
            != Some("exclusive")
        {
            return Err(SystemServiceError::InvalidInput(
                "approval-required Tool must be exclusive".to_string(),
            ));
        }
        validate_approval_presentation(&request.permission)?;
    }
    if let Some(activity) = request.activity.as_ref() {
        if activity.result.is_some() {
            return Err(SystemServiceError::InvalidInput(
                "tool begin activity cannot contain a result presentation".to_string(),
            ));
        }
        validate_activity_presentation(&activity.call)?;
    }
    Ok(())
}

fn validate_activity_presentation(presentation: &crate::ToolActivityPresentation) -> Result<()> {
    let summary_bytes = presentation.summary.len();
    if presentation.summary.trim().is_empty()
        || presentation.summary.chars().any(char::is_control)
        || summary_bytes > 512
    {
        return Err(SystemServiceError::InvalidInput(
            "tool activity summary must contain 1 to 512 UTF-8 bytes".to_string(),
        ));
    }
    let details = presentation.details.as_deref().unwrap_or_default();
    if details.len() > 16 {
        return Err(SystemServiceError::InvalidInput(
            "tool activity details exceed 16 rows".to_string(),
        ));
    }
    for detail in details {
        if detail.label.trim().is_empty()
            || detail.label.chars().any(char::is_control)
            || detail.label.len() > 128
            || detail.value.trim().is_empty()
            || detail.value.chars().any(char::is_control)
            || detail.value.len() > 1_024
        {
            return Err(SystemServiceError::InvalidInput(
                "tool activity detail is invalid or exceeds its bound".to_string(),
            ));
        }
    }
    Ok(())
}

fn validate_approval_presentation(permission: &serde_json::Value) -> Result<()> {
    let presentation = permission.get("presentation").ok_or_else(|| {
        SystemServiceError::InvalidInput(
            "approval-required permission needs safe presentation".to_string(),
        )
    })?;
    let summary = presentation
        .get("summary")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default();
    if summary.is_empty() || summary.len() > 512 {
        return Err(SystemServiceError::InvalidInput(
            "tool approval summary must contain 1 to 512 UTF-8 bytes".to_string(),
        ));
    }
    let Some(details) = presentation.get("details") else {
        return Ok(());
    };
    let details = details.as_array().ok_or_else(|| {
        SystemServiceError::InvalidInput("tool approval details must be an array".to_string())
    })?;
    if details.len() > 16 {
        return Err(SystemServiceError::InvalidInput(
            "tool approval details exceed 16 rows".to_string(),
        ));
    }
    for detail in details {
        let label = detail
            .get("label")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default();
        let value = detail
            .get("value")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default();
        if label.is_empty() || label.len() > 128 || value.is_empty() || value.len() > 1_024 {
            return Err(SystemServiceError::InvalidInput(
                "tool approval detail is invalid or exceeds its bound".to_string(),
            ));
        }
    }
    Ok(())
}

fn validate_resolve_approval(request: &ResolveToolExecutionApproval) -> Result<()> {
    if request.execution_id.is_empty()
        || request.principal_id.is_empty()
        || request.idempotency_key.is_empty()
        || request.reason.is_empty()
        || request.reason.len() > 1_024
        || request.expected_approval_revision < 0
    {
        return Err(SystemServiceError::InvalidInput(
            "tool approval decision identity and reason are invalid".to_string(),
        ));
    }
    if !matches!(request.decision.as_str(), "approve_once" | "deny") {
        return Err(SystemServiceError::InvalidInput(
            "invalid tool approval decision".to_string(),
        ));
    }
    Ok(())
}

fn validate_finish(request: &FinishToolExecution) -> Result<()> {
    if [
        request.session_id.as_str(),
        request.turn_id.as_str(),
        request.session_attempt_id.as_str(),
        request.input_id.as_str(),
        request.job_id.as_str(),
        request.worker_id.as_str(),
        request.lease_token.as_str(),
        request.execution_id.as_str(),
        request.invocation_attempt_id.as_str(),
    ]
    .iter()
    .any(|value| value.is_empty())
    {
        return Err(SystemServiceError::InvalidInput(
            "tool execution finish identity fields must not be empty".to_string(),
        ));
    }
    if !matches!(request.state.as_str(), "succeeded" | "failed" | "cancelled") {
        return Err(SystemServiceError::InvalidInput(
            "invalid terminal tool execution state".to_string(),
        ));
    }
    if request.state == "cancelled" && request.result_presentation.is_some() {
        return Err(SystemServiceError::InvalidInput(
            "cancelled tool settlement cannot contain result presentation".to_string(),
        ));
    }
    if let Some(presentation) = request.result_presentation.as_ref() {
        validate_activity_presentation(presentation)?;
    }
    Ok(())
}

const MAX_TOOL_RESULT_PARTS: usize = 64;
const MAX_TOOL_RESULT_PART_BYTES: usize = 262_144;
const MAX_TOOL_RESULT_INLINE_BYTES: usize = 1_048_576;

pub(crate) fn validate_tool_settlement_tx(
    tx: &rusqlite::Transaction<'_>,
    state: &str,
    content: Option<&[ToolResultContentPart]>,
    content_digest: Option<&str>,
    is_error: Option<bool>,
    error: Option<&serde_json::Value>,
) -> Result<()> {
    if state == "cancelled" {
        if content.is_some() || content_digest.is_some() || is_error.is_some() {
            return Err(SystemServiceError::InvalidInput(
                "cancelled tool settlement cannot contain result content".to_string(),
            ));
        }
        return Ok(());
    }
    let content = content.ok_or_else(|| {
        SystemServiceError::InvalidInput(
            "settled tool execution requires structured content".to_string(),
        )
    })?;
    let content_digest = content_digest.ok_or_else(|| {
        SystemServiceError::InvalidInput(
            "settled tool execution requires a content digest".to_string(),
        )
    })?;
    if is_error != Some(state == "failed") {
        return Err(SystemServiceError::InvalidInput(
            "tool is_error must match its terminal state".to_string(),
        ));
    }
    if state == "succeeded" && error.is_some() {
        return Err(SystemServiceError::InvalidInput(
            "successful tool settlement cannot include an error".to_string(),
        ));
    }
    validate_tool_result_content_tx(tx, content)?;
    crate::sessions::validate_sha256(content_digest, "tool content_digest")?;
    let actual = tool_result_content_digest(content);
    if actual != content_digest {
        return Err(SystemServiceError::Invariant(
            "tool content_digest does not match ordered content".to_string(),
        ));
    }
    Ok(())
}

fn validate_tool_result_content_tx(
    tx: &rusqlite::Transaction<'_>,
    content: &[ToolResultContentPart],
) -> Result<()> {
    if content.is_empty() || content.len() > MAX_TOOL_RESULT_PARTS {
        return Err(SystemServiceError::InvalidInput(format!(
            "tool result content must contain 1 to {MAX_TOOL_RESULT_PARTS} parts"
        )));
    }
    let mut inline_bytes = 0usize;
    let mut resources = std::collections::HashSet::new();
    for part in content {
        match part {
            ToolResultContentPart::Text { text } => {
                let bytes = text.len();
                if bytes == 0 || bytes > MAX_TOOL_RESULT_PART_BYTES {
                    return Err(SystemServiceError::InvalidInput(format!(
                        "tool result text must contain 1 to {MAX_TOOL_RESULT_PART_BYTES} UTF-8 bytes"
                    )));
                }
                inline_bytes = inline_bytes.checked_add(bytes).ok_or_else(|| {
                    SystemServiceError::InvalidInput(
                        "tool result inline byte count overflowed".to_string(),
                    )
                })?;
            }
            ToolResultContentPart::Json { value } => {
                let bytes = crate::util::canonical_json(value).len();
                if bytes > MAX_TOOL_RESULT_PART_BYTES {
                    return Err(SystemServiceError::InvalidInput(format!(
                        "tool result JSON exceeds {MAX_TOOL_RESULT_PART_BYTES} UTF-8 bytes"
                    )));
                }
                inline_bytes = inline_bytes.checked_add(bytes).ok_or_else(|| {
                    SystemServiceError::InvalidInput(
                        "tool result inline byte count overflowed".to_string(),
                    )
                })?;
            }
            ToolResultContentPart::Resource {
                resource_id,
                sha256,
                size_bytes,
                kind,
                media_type,
            } => {
                if !resources.insert(resource_id.as_str()) {
                    return Err(SystemServiceError::InvalidInput(format!(
                        "tool result resource is duplicated: {resource_id}"
                    )));
                }
                crate::resources::validate_resource_input_evidence_tx(
                    tx,
                    &crate::ResourceInputEvidence {
                        resource_id: resource_id.clone(),
                        sha256: sha256.clone(),
                        size_bytes: *size_bytes,
                        kind: kind.clone(),
                        media_type: media_type.clone(),
                    },
                )?;
            }
        }
    }
    if inline_bytes > MAX_TOOL_RESULT_INLINE_BYTES {
        return Err(SystemServiceError::InvalidInput(format!(
            "tool result inline content exceeds {MAX_TOOL_RESULT_INLINE_BYTES} UTF-8 bytes"
        )));
    }
    Ok(())
}

pub(crate) fn tool_result_content_digest(content: &[ToolResultContentPart]) -> String {
    crate::util::digest_json(&tool_result_content_json(content))
}

pub(crate) fn settle_waiting_tool_execution_tx(
    tx: &rusqlite::Transaction<'_>,
    execution_id: &str,
    state: &str,
    content: &[ToolResultContentPart],
    error: Option<&serde_json::Value>,
    now: i64,
) -> Result<ToolExecutionRecord> {
    if !matches!(state, "succeeded" | "failed") {
        return Err(SystemServiceError::Invariant(
            "deferred tool settlement must succeed or fail".to_string(),
        ));
    }
    let execution = get_tool_execution_tx(tx, execution_id)?;
    let content_digest = tool_result_content_digest(content);
    validate_tool_settlement_tx(
        tx,
        state,
        Some(content),
        Some(&content_digest),
        Some(state == "failed"),
        error,
    )?;
    if matches!(execution.state.as_str(), "succeeded" | "failed") {
        if execution.state != state
            || execution.content.as_deref() != Some(content)
            || execution.content_digest.as_deref() != Some(content_digest.as_str())
            || execution.error.as_ref() != error
        {
            return Err(SystemServiceError::Invariant(
                "conflicting repeated deferred tool settlement".to_string(),
            ));
        }
        return Ok(execution);
    }
    if execution.state != "waiting" {
        return Err(SystemServiceError::Invariant(format!(
            "deferred tool settlement requires waiting state: {}",
            execution.state
        )));
    }
    let invocation_attempt_id = execution
        .current_invocation_attempt_id
        .as_deref()
        .ok_or_else(|| {
            SystemServiceError::Invariant(
                "waiting tool execution has no suspended invocation attempt".to_string(),
            )
        })?;
    let invocation_attempt = get_tool_attempt_tx(tx, invocation_attempt_id)?;
    if invocation_attempt.state != "suspended" {
        return Err(SystemServiceError::Invariant(
            "waiting tool execution attempt is not suspended".to_string(),
        ));
    }
    let updated = tx.execute(
        "UPDATE tool_execution
         SET state = ?, content_json = ?, content_digest = ?, is_error = ?,
             error_json = ?, updated_at = ?, finished_at = ?
         WHERE id = ? AND state = 'waiting'",
        params![
            state,
            serde_json::to_string(content)?,
            content_digest,
            state == "failed",
            error.map(serde_json::to_string).transpose()?,
            now,
            now,
            execution.id
        ],
    )?;
    if updated != 1 {
        return Err(SystemServiceError::Invariant(
            "deferred tool settlement lost waiting execution".to_string(),
        ));
    }
    append_tool_event_tx(
        tx,
        &format!("tool.execution.{state}"),
        ToolEventIdentity {
            execution_id: &execution.id,
            session_id: &execution.session_id,
            turn_id: &execution.turn_id,
            session_attempt_id: &invocation_attempt.session_attempt_id,
            input_id: &execution.input_id,
            source_message_id: &execution.source_message_id,
        },
        &serde_json::json!({
            "toolCallId": execution.tool_call_id,
            "toolName": execution.tool_name,
            "state": state,
            "delivery": "deferred"
        }),
        now,
    )?;
    get_tool_execution_tx(tx, execution_id)
}

pub(crate) fn wake_waiting_tool_parent_tx(
    tx: &rusqlite::Transaction<'_>,
    execution: &ToolExecutionRecord,
    deferred_kind: &str,
    operation_id: &str,
    operation_state: &str,
    now: i64,
) -> Result<()> {
    let execution = get_tool_execution_tx(tx, &execution.id)?;
    if !matches!(execution.state.as_str(), "succeeded" | "failed") {
        return Err(SystemServiceError::Invariant(
            "deferred parent wake requires a terminal Tool execution".to_string(),
        ));
    }
    let turn = crate::sessions::get_turn_tx(tx, &execution.turn_id)?;
    if turn.session_id != execution.session_id
        || turn.primary_input_id != execution.input_id
        || turn.current_attempt_id.is_some()
        || !matches!(turn.state.as_str(), "waiting" | "cancel_requested")
    {
        return Err(SystemServiceError::Invariant(
            "deferred Tool settlement cannot wake its logical turn".to_string(),
        ));
    }
    let updated_turn = tx.execute(
        "UPDATE session_turn
         SET state = CASE WHEN state = 'waiting' THEN 'queued' ELSE 'cancel_requested' END,
             updated_at = ?, finished_at = NULL
         WHERE id = ? AND current_attempt_id IS NULL
           AND state IN ('waiting', 'cancel_requested')",
        params![now, turn.id],
    )?;
    let updated_job = tx.execute(
        "UPDATE scheduler_job
         SET state = 'ready', not_before = NULL, lease_owner = NULL,
             lease_token = NULL, lease_expires_at = NULL, result_json = NULL,
             last_error_json = NULL, updated_at = ?, finished_at = NULL
         WHERE id = ? AND kind = 'session.turn' AND state = 'waiting'",
        params![now, turn.job_id],
    )?;
    if updated_turn != 1 || updated_job != 1 {
        return Err(SystemServiceError::Invariant(
            "deferred Tool settlement lost its waiting session job".to_string(),
        ));
    }
    let evidence = serde_json::json!({
        "turnId": turn.id,
        "jobId": turn.job_id,
        "toolExecutionId": execution.id,
        "deferredKind": deferred_kind,
        "operationId": operation_id,
        "operationState": operation_state
    });
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        "session.turn.woken",
        &EventScope {
            session_id: Some(turn.session_id.clone()),
            turn_id: Some(turn.id.clone()),
            input_id: Some(turn.primary_input_id.clone()),
            message_id: Some(execution.source_message_id.clone()),
            ..EventScope::default()
        },
        &evidence,
        now,
    )?;
    crate::scheduler::append_scheduler_event_tx(
        tx,
        "scheduler.job.woken",
        &turn.job_id,
        &evidence,
        now,
    )
}

pub(crate) fn require_waiting_tool_recovery_tx(
    tx: &rusqlite::Transaction<'_>,
    execution_id: &str,
    error: &serde_json::Value,
    now: i64,
) -> Result<ToolExecutionRecord> {
    let execution = get_tool_execution_tx(tx, execution_id)?;
    if execution.state == "recovery_required" {
        return Ok(execution);
    }
    if execution.state != "waiting" {
        return Err(SystemServiceError::Invariant(
            "deferred tool recovery requires waiting state".to_string(),
        ));
    }
    let updated = tx.execute(
        "UPDATE tool_execution
         SET state = 'recovery_required', recovery_revision = recovery_revision + 1,
             recovery_json = ?, error_json = ?, updated_at = ?, finished_at = ?
         WHERE id = ? AND state = 'waiting'",
        params![
            serde_json::to_string(error)?,
            serde_json::to_string(error)?,
            now,
            now,
            execution.id
        ],
    )?;
    if updated != 1 {
        return Err(SystemServiceError::Invariant(
            "deferred tool recovery lost waiting execution".to_string(),
        ));
    }
    get_tool_execution_tx(tx, execution_id)
}

fn tool_result_content_json(content: &[ToolResultContentPart]) -> serde_json::Value {
    serde_json::Value::Array(
        content
            .iter()
            .map(|part| match part {
                ToolResultContentPart::Text { text } => serde_json::json!({
                    "type": "text",
                    "text": text
                }),
                ToolResultContentPart::Json { value } => serde_json::json!({
                    "type": "json",
                    "value": value
                }),
                ToolResultContentPart::Resource {
                    resource_id,
                    sha256,
                    size_bytes,
                    kind,
                    media_type,
                } => {
                    let evidence = crate::ResourceInputEvidence {
                        resource_id: resource_id.clone(),
                        sha256: sha256.clone(),
                        size_bytes: *size_bytes,
                        kind: kind.clone(),
                        media_type: media_type.clone(),
                    };
                    let mut object = crate::resources::resource_input_evidence_json(&evidence)
                        .as_object()
                        .expect("resource evidence projects to an object")
                        .clone();
                    object.insert(
                        "type".to_string(),
                        serde_json::Value::String("resource".to_string()),
                    );
                    serde_json::Value::Object(object)
                }
            })
            .collect(),
    )
}

fn validate_require_recovery(request: &RequireToolExecutionRecovery) -> Result<()> {
    if [
        request.session_id.as_str(),
        request.turn_id.as_str(),
        request.session_attempt_id.as_str(),
        request.input_id.as_str(),
        request.job_id.as_str(),
        request.worker_id.as_str(),
        request.lease_token.as_str(),
        request.execution_id.as_str(),
        request.invocation_attempt_id.as_str(),
    ]
    .iter()
    .any(|value| value.is_empty())
    {
        return Err(SystemServiceError::InvalidInput(
            "tool recovery identity fields must not be empty".to_string(),
        ));
    }
    let evidence = request.evidence.as_object().ok_or_else(|| {
        SystemServiceError::InvalidInput("tool recovery evidence must be an object".to_string())
    })?;
    if evidence.get("type").and_then(serde_json::Value::as_str) != Some("ambiguous_tool_outcome") {
        return Err(SystemServiceError::InvalidInput(
            "tool recovery evidence type must be ambiguous_tool_outcome".to_string(),
        ));
    }
    let message = evidence
        .get("message")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default();
    if message.is_empty() || message.len() > 4096 {
        return Err(SystemServiceError::InvalidInput(
            "tool recovery evidence message must contain 1 to 4096 bytes".to_string(),
        ));
    }
    if evidence
        .get("reconciliationRef")
        .and_then(serde_json::Value::as_str)
        .is_some_and(|value| value.is_empty() || value.len() > 512)
    {
        return Err(SystemServiceError::InvalidInput(
            "tool recovery reconciliation reference must contain 1 to 512 bytes".to_string(),
        ));
    }
    if serde_json::to_vec(&request.evidence)?.len() > 16_384 {
        return Err(SystemServiceError::InvalidInput(
            "tool recovery evidence exceeds 16384 bytes".to_string(),
        ));
    }
    Ok(())
}

fn ensure_recovery_identity(
    execution: &ToolExecutionRecord,
    request: &RequireToolExecutionRecovery,
) -> Result<()> {
    if execution.session_id != request.session_id
        || execution.turn_id != request.turn_id
        || execution.input_id != request.input_id
    {
        return Err(SystemServiceError::Invariant(
            "tool recovery identity does not match logical execution".to_string(),
        ));
    }
    Ok(())
}

fn ensure_recovery_attempt_owner(
    attempt: &ToolExecutionAttemptRecord,
    request: &RequireToolExecutionRecovery,
) -> Result<()> {
    if attempt.execution_id != request.execution_id
        || attempt.session_attempt_id != request.session_attempt_id
        || attempt.job_id != request.job_id
        || attempt.worker_id != request.worker_id
    {
        return Err(SystemServiceError::Invariant(
            "tool recovery attempt does not match active owner".to_string(),
        ));
    }
    Ok(())
}

fn validate_resolve_recovery(request: &ResolveToolExecutionRecovery) -> Result<()> {
    if request.execution_id.is_empty()
        || request.principal_id.is_empty()
        || request.reason.is_empty()
        || request.idempotency_key.is_empty()
        || request.expected_recovery_revision <= 0
    {
        return Err(SystemServiceError::InvalidInput(
            "tool recovery decision identity and reason must not be empty".to_string(),
        ));
    }
    if request.reason.len() > 4096 {
        return Err(SystemServiceError::InvalidInput(
            "tool recovery decision reason exceeds 4096 bytes".to_string(),
        ));
    }
    if !matches!(
        request.decision.as_str(),
        "confirm_succeeded" | "confirm_failed" | "retry" | "abandon_turn"
    ) {
        return Err(SystemServiceError::InvalidInput(
            "invalid tool recovery decision".to_string(),
        ));
    }
    match request.decision.as_str() {
        "confirm_succeeded" | "confirm_failed"
            if request.content.is_none() || request.content_digest.is_none() =>
        {
            return Err(SystemServiceError::InvalidInput(
                "confirmed tool recovery requires content and digest".to_string(),
            ));
        }
        "retry" | "abandon_turn"
            if request.content.is_some()
                || request.content_digest.is_some()
                || request.error.is_some() =>
        {
            return Err(SystemServiceError::InvalidInput(
                "retry and abandon recovery decisions cannot include result data".to_string(),
            ));
        }
        _ => {}
    }
    Ok(())
}

fn ensure_same_recovery_decision(
    existing: &ToolExecutionRecoveryDecisionRecord,
    request: &ResolveToolExecutionRecovery,
) -> Result<()> {
    if existing.execution_id != request.execution_id
        || existing.recovery_revision != request.expected_recovery_revision
        || existing.decision != request.decision
        || existing.principal_id != request.principal_id
        || existing.reason != request.reason
        || existing.content != request.content
        || existing.content_digest != request.content_digest
        || existing.error != request.error
    {
        return Err(SystemServiceError::Conflict(
            "conflicting repeated tool recovery decision".to_string(),
        ));
    }
    Ok(())
}
