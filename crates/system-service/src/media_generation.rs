use crate::event_store::append_event_tx;
use crate::rows::row_to_media_generation_operation;
use crate::scheduler::enqueue_job_tx;
use crate::{
    AcceptMediaGenerationOperation, BeginMediaGenerationOperation,
    CompleteMediaGenerationOperation, DeferToolExecution, DeferToolExecutionReceipt,
    DeferredToolOperationReceipt, EnqueueJob, EventScope, GetMediaGenerationOperation,
    ListMediaGenerationOperations, MediaGenerationBeginReceipt, MediaGenerationOperationRecord,
    MediaGenerationSuspendReceipt, RecordMediaGenerationOutputs, RequestMediaGenerationCancel,
    Result, RetryPolicy, SchedulerJobKind, SettleMediaGenerationOperation,
    SubmitMediaGenerationOperation, SuspendMediaGenerationOperation, SystemService,
    SystemServiceError, ToolResultContentPart,
};
use rusqlite::{params, OptionalExtension};
use serde_json::{json, Value};
use uuid::Uuid;

const OPERATION_SELECT: &str = "SELECT id, job_id, principal_id, idempotency_key,
    session_id, turn_id, source_message_id, tool_execution_id, tool_call_id,
    state, binding_json, dispatch_attempt, external_operation_id,
    provider_checkpoint_json, poll_count, consecutive_poll_failures, next_poll_at,
    last_poll_error_json, output_references_json, output_resource_ids_json,
    progress_json, error_json, cancel_requested_at, cancel_reason,
    created_at, updated_at, finished_at FROM media_generation_operation";

impl SystemService {
    pub fn submit_media_generation(
        &self,
        request: &SubmitMediaGenerationOperation,
    ) -> Result<crate::MediaGenerationOperationSubmission> {
        validate_submit(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;

        if let Some(existing) = find_by_idempotency_tx(&tx, &request.idempotency_key)? {
            if existing.principal_id != request.principal_id || existing.binding != request.binding
            {
                return Err(SystemServiceError::Invariant(
                    "media generation idempotency key is bound to a different request".to_string(),
                ));
            }
            let job = crate::scheduler::get_job_tx(&tx, &existing.job_id)?;
            tx.commit()?;
            return Ok(crate::MediaGenerationOperationSubmission {
                operation: existing,
                job,
            });
        }

        let operation_id = request
            .id
            .clone()
            .unwrap_or_else(|| format!("mgen_{}", Uuid::now_v7()));
        let job_id = request
            .job_id
            .clone()
            .unwrap_or_else(|| format!("job_{}", Uuid::now_v7()));
        let job = enqueue_job_tx(
            &tx,
            &EnqueueJob {
                id: Some(job_id.clone()),
                kind: SchedulerJobKind::MediaGenerate,
                principal_id: request.principal_id.clone(),
                payload: json!({ "operationId": operation_id }),
                scheduled_at: None,
                not_before: None,
                priority: request.priority,
                concurrency_key: Some(format!("media-generation:{operation_id}")),
                max_attempts: Some(1),
                retry_policy: Some(RetryPolicy::default()),
                idempotency_key: Some(format!("media-generation-job:{}", request.idempotency_key)),
                budget_grant_id: None,
            },
            now,
        )?;
        tx.execute(
            "INSERT INTO media_generation_operation (
                id, job_id, principal_id, idempotency_key,
                session_id, turn_id, source_message_id, tool_execution_id, tool_call_id,
                state, binding_json,
                dispatch_attempt, external_operation_id, provider_checkpoint_json,
                poll_count, consecutive_poll_failures, next_poll_at,
                last_poll_error_json, output_references_json, output_resource_ids_json, progress_json,
                error_json, cancel_requested_at, cancel_reason, created_at,
                updated_at, finished_at
             ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, 'queued', ?, 0, NULL, NULL, 0, 0, NULL, NULL,
                       '[]', '[]', NULL, NULL, NULL, NULL, ?, ?, NULL)",
            params![
                operation_id,
                job_id,
                request.principal_id,
                request.idempotency_key,
                serde_json::to_string(&request.binding)?,
                now,
                now
            ],
        )?;
        let operation = get_operation_tx(&tx, &operation_id)?;
        append_event_tx(
            &tx,
            &format!("evt_{}", Uuid::now_v7()),
            "media_generation.queued",
            &EventScope::default(),
            &json!({ "operationId": operation_id, "jobId": job.id }),
            now,
        )?;
        tx.commit()?;
        Ok(crate::MediaGenerationOperationSubmission { operation, job })
    }

    pub(crate) fn defer_tool_execution_to_media_generation(
        &self,
        request: &DeferToolExecution,
        binding: &Value,
        priority: Option<i64>,
    ) -> Result<DeferToolExecutionReceipt> {
        validate_deferred_request(request, binding)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;

        if let Some(existing) = find_by_tool_execution_tx(&tx, &request.tool_execution_id)? {
            ensure_same_deferred_request_tx(&tx, &existing, request, binding)?;
            let receipt = deferred_receipt_tx(&tx, request, existing)?;
            tx.commit()?;
            return Ok(receipt);
        }

        let owner = crate::tools::validate_deferred_tool_owner_tx(&tx, request, now)?;
        validate_frozen_media_route(
            &owner.turn.execution_binding,
            &owner.tool_execution.descriptor,
            binding,
        )?;

        let operation_id = format!("mgen_{}", Uuid::now_v7());
        let media_job_id = format!("job_{}", Uuid::now_v7());
        let media_job = enqueue_job_tx(
            &tx,
            &EnqueueJob {
                id: Some(media_job_id.clone()),
                kind: SchedulerJobKind::MediaGenerate,
                principal_id: owner.tool_execution.principal_id.clone(),
                payload: json!({ "operationId": operation_id }),
                scheduled_at: None,
                not_before: None,
                priority,
                concurrency_key: Some(format!("media-generation:{operation_id}")),
                max_attempts: Some(1),
                retry_policy: Some(RetryPolicy::default()),
                idempotency_key: Some(format!(
                    "media-generation-tool-job:{}",
                    owner.tool_execution.id
                )),
                budget_grant_id: None,
            },
            now,
        )?;
        tx.execute(
            "INSERT INTO media_generation_operation (
                id, job_id, principal_id, idempotency_key,
                session_id, turn_id, source_message_id, tool_execution_id, tool_call_id,
                state, binding_json, dispatch_attempt, external_operation_id,
                provider_checkpoint_json, poll_count, consecutive_poll_failures,
                next_poll_at, last_poll_error_json, output_references_json,
                output_resource_ids_json, progress_json, error_json,
                cancel_requested_at, cancel_reason, created_at, updated_at, finished_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, 0, NULL, NULL,
                       0, 0, NULL, NULL, '[]', '[]', NULL, NULL, NULL, NULL, ?, ?, NULL)",
            params![
                operation_id,
                media_job_id,
                owner.tool_execution.principal_id,
                format!("media-generation-tool:{}", owner.tool_execution.id),
                request.session_id,
                request.turn_id,
                request.source_message_id,
                request.tool_execution_id,
                request.tool_call_id,
                serde_json::to_string(binding)?,
                now,
                now
            ],
        )?;

        crate::tools::suspend_deferred_tool_owner_tx(
            &tx,
            request,
            &json!({
                "mediaOperationId": operation_id,
                "mediaJobId": media_job.id
            }),
            "deferred_tool_media_generation",
            now,
        )?;
        append_event_tx(
            &tx,
            &format!("evt_{}", Uuid::now_v7()),
            "media_generation.queued",
            &EventScope {
                session_id: Some(request.session_id.clone()),
                turn_id: Some(request.turn_id.clone()),
                attempt_id: Some(request.session_attempt_id.clone()),
                input_id: Some(request.input_id.clone()),
                message_id: Some(request.source_message_id.clone()),
                ..EventScope::default()
            },
            &json!({
                "operationId": operation_id,
                "jobId": media_job.id,
                "toolExecutionId": request.tool_execution_id
            }),
            now,
        )?;

        let operation = get_operation_tx(&tx, &operation_id)?;
        let receipt = deferred_receipt_tx(&tx, request, operation)?;
        tx.commit()?;
        Ok(receipt)
    }

    pub fn begin_media_generation(
        &self,
        request: &BeginMediaGenerationOperation,
    ) -> Result<Option<MediaGenerationBeginReceipt>> {
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let Some(operation) = get_optional_operation_tx(&tx, &request.operation_id)? else {
            tx.commit()?;
            return Ok(None);
        };
        let mut job = crate::scheduler::get_job_tx(&tx, &operation.job_id)?;
        if is_terminal(&operation.state) {
            tx.commit()?;
            return Ok(Some(MediaGenerationBeginReceipt {
                operation,
                job,
                action: "terminal".to_string(),
            }));
        }
        ensure_lease(&job, &request.worker_id, &request.lease_token)?;

        let action = match operation.state.as_str() {
            "queued" => {
                tx.execute(
                    "UPDATE media_generation_operation
                     SET state = 'submitting', dispatch_attempt = ?, updated_at = ?
                     WHERE id = ? AND state = 'queued'",
                    params![job.attempt, now, operation.id],
                )?;
                "started"
            }
            "submitting" if operation.dispatch_attempt == job.attempt => "started",
            "submitting" => {
                mark_recovery_tx(
                    &tx,
                    &operation.id,
                    &job,
                    &request.worker_id,
                    &request.lease_token,
                    json!({
                        "type": "ambiguous_provider_submission",
                        "reason": "provider acceptance was not durably checkpointed"
                    }),
                    now,
                )?;
                job = crate::scheduler::get_job_tx(&tx, &operation.job_id)?;
                "recovery_required"
            }
            "polling" => {
                tx.execute(
                    "UPDATE media_generation_operation SET next_poll_at = NULL, updated_at = ?
                     WHERE id = ? AND state = 'polling'",
                    params![now, operation.id],
                )?;
                "resume_polling"
            }
            "materializing" => "resume_materializing",
            "cancel_requested" => "cancel",
            state => {
                return Err(SystemServiceError::Invariant(format!(
                    "invalid media generation begin state: {state}"
                )))
            }
        };
        let operation = get_operation_tx(&tx, &operation.id)?;
        if action != "recovery_required" {
            append_event_tx(
                &tx,
                &format!("evt_{}", Uuid::now_v7()),
                "media_generation.claimed",
                &EventScope::default(),
                &json!({ "operationId": operation.id, "action": action }),
                now,
            )?;
        }
        tx.commit()?;
        Ok(Some(MediaGenerationBeginReceipt {
            operation,
            job,
            action: action.to_string(),
        }))
    }

    pub fn accept_media_generation(
        &self,
        request: &AcceptMediaGenerationOperation,
    ) -> Result<Option<MediaGenerationOperationRecord>> {
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let Some(operation) = get_optional_operation_tx(&tx, &request.operation_id)? else {
            tx.commit()?;
            return Ok(None);
        };
        let job = crate::scheduler::get_job_tx(&tx, &operation.job_id)?;
        ensure_lease(&job, &request.worker_id, &request.lease_token)?;
        if operation.state == "polling" {
            if operation.external_operation_id.as_deref() != Some(&request.external_operation_id) {
                return Err(SystemServiceError::Invariant(
                    "media generation external operation identity changed".to_string(),
                ));
            }
        } else if matches!(operation.state.as_str(), "submitting" | "cancel_requested") {
            tx.execute(
                "UPDATE media_generation_operation
                 SET state = CASE WHEN state = 'cancel_requested' THEN 'cancel_requested' ELSE 'polling' END,
                     external_operation_id = ?,
                     provider_checkpoint_json = ?, updated_at = ?
                 WHERE id = ? AND state IN ('submitting', 'cancel_requested')",
                params![
                    request.external_operation_id,
                    request
                        .provider_checkpoint
                        .as_ref()
                        .map(serde_json::to_string)
                        .transpose()?,
                    now,
                    operation.id
                ],
            )?;
        } else {
            return Err(SystemServiceError::Invariant(
                "media generation acceptance requires submitting state".to_string(),
            ));
        }
        let updated = get_operation_tx(&tx, &operation.id)?;
        append_event_tx(
            &tx,
            &format!("evt_{}", Uuid::now_v7()),
            "media_generation.accepted",
            &EventScope::default(),
            &json!({ "operationId": operation.id, "externalOperationId": request.external_operation_id }),
            now,
        )?;
        tx.commit()?;
        Ok(Some(updated))
    }

    pub fn suspend_media_generation(
        &self,
        request: &SuspendMediaGenerationOperation,
    ) -> Result<Option<MediaGenerationSuspendReceipt>> {
        if request.next_poll_at <= 0 {
            return Err(SystemServiceError::InvalidInput(
                "media generation next_poll_at must be positive".to_string(),
            ));
        }
        if !matches!(
            request.outcome.as_str(),
            "scheduled" | "pending" | "transient_error"
        ) {
            return Err(SystemServiceError::InvalidInput(format!(
                "invalid media generation poll outcome: {}",
                request.outcome
            )));
        }
        if request.outcome != "transient_error" && request.error.is_some() {
            return Err(SystemServiceError::InvalidInput(
                "non-error media generation suspension cannot carry an error".to_string(),
            ));
        }
        if request.outcome == "transient_error" && request.error.is_none() {
            return Err(SystemServiceError::InvalidInput(
                "transient media generation suspension requires error evidence".to_string(),
            ));
        }
        let now = crate::util::now_ms();
        if request.next_poll_at <= now {
            return Err(SystemServiceError::InvalidInput(
                "media generation next_poll_at must be in the future".to_string(),
            ));
        }
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let Some(operation) = get_optional_operation_tx(&tx, &request.operation_id)? else {
            tx.commit()?;
            return Ok(None);
        };
        let job = crate::scheduler::get_job_tx(&tx, &operation.job_id)?;
        ensure_lease(&job, &request.worker_id, &request.lease_token)?;
        if operation.state == "cancel_requested" {
            tx.commit()?;
            return Ok(Some(MediaGenerationSuspendReceipt {
                operation,
                job,
                action: "cancel".to_string(),
            }));
        }
        if operation.state != "polling" {
            return Err(SystemServiceError::Invariant(
                "media generation suspension requires polling state".to_string(),
            ));
        }
        let checkpoint = request
            .provider_checkpoint
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let progress = request
            .progress
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let error = request
            .error
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let consecutive_poll_failures = if request.outcome == "transient_error" {
            operation.consecutive_poll_failures + 1
        } else {
            0
        };
        tx.execute(
            "UPDATE media_generation_operation
             SET provider_checkpoint_json = COALESCE(?, provider_checkpoint_json),
                 progress_json = COALESCE(?, progress_json),
                 poll_count = poll_count + CASE WHEN ? = 'scheduled' THEN 0 ELSE 1 END,
                 consecutive_poll_failures = ?, next_poll_at = ?,
                 last_poll_error_json = ?, updated_at = ?
             WHERE id = ? AND state = 'polling'",
            params![
                checkpoint,
                progress,
                request.outcome,
                consecutive_poll_failures,
                request.next_poll_at,
                error,
                now,
                operation.id
            ],
        )?;
        let released = tx.execute(
            "UPDATE scheduler_job SET state = 'pending', not_before = ?,
             lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL,
             result_json = NULL, last_error_json = NULL, updated_at = ?
             WHERE id = ? AND state = 'running' AND lease_owner = ? AND lease_token = ?",
            params![
                request.next_poll_at,
                now,
                job.id,
                request.worker_id,
                request.lease_token
            ],
        )?;
        if released != 1 {
            return Err(SystemServiceError::Invariant(
                "media generation suspension lost the active job lease".to_string(),
            ));
        }
        let updated = get_operation_tx(&tx, &operation.id)?;
        let job = crate::scheduler::get_job_tx(&tx, &operation.job_id)?;
        append_event_tx(
            &tx,
            &format!("evt_{}", Uuid::now_v7()),
            "media_generation.suspended",
            &EventScope::default(),
            &json!({
                "operationId": operation.id,
                "outcome": request.outcome,
                "nextPollAt": request.next_poll_at,
                "pollCount": updated.poll_count,
                "consecutivePollFailures": updated.consecutive_poll_failures
            }),
            now,
        )?;
        crate::scheduler::append_scheduler_event_tx(
            &tx,
            "scheduler.job.suspended",
            &job.id,
            &json!({
                "jobId": job.id,
                "notBefore": request.next_poll_at,
                "reason": "media_generation_poll"
            }),
            now,
        )?;
        tx.commit()?;
        Ok(Some(MediaGenerationSuspendReceipt {
            operation: updated,
            job,
            action: "suspended".to_string(),
        }))
    }

    pub fn record_media_generation_outputs(
        &self,
        request: &RecordMediaGenerationOutputs,
    ) -> Result<Option<MediaGenerationOperationRecord>> {
        validate_completed_poll_outcome(&request.poll_outcome)?;
        if request.output_references.is_empty() {
            return Err(SystemServiceError::InvalidInput(
                "media generation output references must not be empty".to_string(),
            ));
        }
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let Some(operation) = get_optional_operation_tx(&tx, &request.operation_id)? else {
            tx.commit()?;
            return Ok(None);
        };
        let job = crate::scheduler::get_job_tx(&tx, &operation.job_id)?;
        ensure_lease(&job, &request.worker_id, &request.lease_token)?;
        if !matches!(operation.state.as_str(), "submitting" | "polling") {
            return Err(SystemServiceError::Invariant(
                "media generation outputs require submitting or polling state".to_string(),
            ));
        }
        ensure_successful_poll_source(&operation.state, &request.poll_outcome)?;
        tx.execute(
            "UPDATE media_generation_operation
             SET state = 'materializing', output_references_json = ?,
                 progress_json = ?,
                 poll_count = poll_count + CASE WHEN ? = 'completed' THEN 1 ELSE 0 END,
                 consecutive_poll_failures = CASE WHEN ? = 'completed' THEN 0 ELSE consecutive_poll_failures END,
                 last_poll_error_json = CASE WHEN ? = 'completed' THEN NULL ELSE last_poll_error_json END,
                 next_poll_at = NULL, updated_at = ?
             WHERE id = ? AND state IN ('submitting', 'polling')",
            params![
                serde_json::to_string(&request.output_references)?,
                request
                    .progress
                    .as_ref()
                    .map(serde_json::to_string)
                    .transpose()?,
                request.poll_outcome,
                request.poll_outcome,
                request.poll_outcome,
                now,
                operation.id
            ],
        )?;
        let updated = get_operation_tx(&tx, &operation.id)?;
        tx.commit()?;
        Ok(Some(updated))
    }

    pub fn complete_media_generation(
        &self,
        request: &CompleteMediaGenerationOperation,
    ) -> Result<Option<MediaGenerationOperationRecord>> {
        validate_completed_poll_outcome(&request.poll_outcome)?;
        if request.output_resource_ids.is_empty() {
            return Err(SystemServiceError::InvalidInput(
                "media generation must publish at least one output resource".to_string(),
            ));
        }
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let Some(operation) = get_optional_operation_tx(&tx, &request.operation_id)? else {
            tx.commit()?;
            return Ok(None);
        };
        if operation.state == "succeeded" {
            tx.commit()?;
            return Ok(Some(operation));
        }
        let job = crate::scheduler::get_job_tx(&tx, &operation.job_id)?;
        ensure_lease(&job, &request.worker_id, &request.lease_token)?;
        if operation.cancel_requested_at.is_some() {
            return Err(SystemServiceError::Invariant(
                "cancelled media generation cannot publish outputs".to_string(),
            ));
        }
        if !matches!(
            operation.state.as_str(),
            "submitting" | "polling" | "materializing"
        ) {
            return Err(SystemServiceError::Invariant(
                "media generation completion requires an active state".to_string(),
            ));
        }
        ensure_successful_poll_source(&operation.state, &request.poll_outcome)?;
        let mut output_ids = std::collections::HashSet::new();
        for resource_id in &request.output_resource_ids {
            if !output_ids.insert(resource_id.as_str()) {
                return Err(SystemServiceError::InvalidInput(format!(
                    "media generation output resource is duplicated: {resource_id}"
                )));
            }
            let state: Option<String> = tx
                .query_row(
                    "SELECT state FROM resource WHERE id = ?",
                    params![resource_id],
                    |row| row.get(0),
                )
                .optional()?;
            if state.as_deref() != Some("available") {
                return Err(SystemServiceError::Invariant(format!(
                    "media generation output resource is not available: {resource_id}"
                )));
            }
            crate::resources::require_media_output_provenance_tx(&tx, resource_id, &operation.id)?;
        }
        tx.execute(
            "UPDATE media_generation_operation
             SET state = 'succeeded', output_resource_ids_json = ?,
                 progress_json = ?, error_json = NULL,
                 poll_count = poll_count + CASE WHEN ? = 'completed' THEN 1 ELSE 0 END,
                 consecutive_poll_failures = CASE WHEN ? = 'completed' THEN 0 ELSE consecutive_poll_failures END,
                 last_poll_error_json = CASE WHEN ? = 'completed' THEN NULL ELSE last_poll_error_json END,
                 next_poll_at = NULL,
                 updated_at = ?, finished_at = ?
             WHERE id = ? AND state NOT IN ('succeeded', 'failed', 'cancelled', 'recovery_required')",
            params![
                serde_json::to_string(&request.output_resource_ids)?,
                request.result.as_ref().map(serde_json::to_string).transpose()?,
                request.poll_outcome,
                request.poll_outcome,
                request.poll_outcome,
                now,
                now,
                operation.id
            ],
        )?;
        complete_job_for_operation_tx(&tx, &job, request.result.as_ref(), now)?;
        let updated = get_operation_tx(&tx, &operation.id)?;
        settle_linked_conversation_tx(&tx, &updated, now)?;
        append_event_tx(
            &tx,
            &format!("evt_{}", Uuid::now_v7()),
            "media_generation.succeeded",
            &EventScope::default(),
            &json!({ "operationId": operation.id, "resourceIds": request.output_resource_ids }),
            now,
        )?;
        tx.commit()?;
        Ok(Some(updated))
    }

    pub fn settle_media_generation(
        &self,
        request: &SettleMediaGenerationOperation,
    ) -> Result<Option<MediaGenerationOperationRecord>> {
        validate_terminal_outcome(&request.outcome)?;
        validate_terminal_poll_outcome(&request.poll_outcome)?;
        if request.poll_outcome != "none" && request.outcome != "failed" {
            return Err(SystemServiceError::InvalidInput(
                "failed provider poll outcome requires failed media settlement".to_string(),
            ));
        }
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let Some(operation) = get_optional_operation_tx(&tx, &request.operation_id)? else {
            tx.commit()?;
            return Ok(None);
        };
        if is_terminal(&operation.state) {
            tx.commit()?;
            return Ok(Some(operation));
        }
        let job = crate::scheduler::get_job_tx(&tx, &operation.job_id)?;
        ensure_lease(&job, &request.worker_id, &request.lease_token)?;
        if request.poll_outcome != "none" && operation.state != "polling" {
            return Err(SystemServiceError::Invariant(
                "media generation poll settlement requires polling state".to_string(),
            ));
        }
        let error = request.error.clone().unwrap_or_else(|| {
            json!({
                "type": request.outcome,
                "reason": request.reason
            })
        });
        tx.execute(
            "UPDATE media_generation_operation
             SET state = ?, error_json = ?, cancel_reason = COALESCE(cancel_reason, ?),
                 poll_count = poll_count + CASE WHEN ? = 'none' THEN 0 ELSE 1 END,
                 consecutive_poll_failures = CASE
                   WHEN ? = 'transient_error' THEN consecutive_poll_failures + 1
                   WHEN ? = 'none' THEN consecutive_poll_failures
                   ELSE 0
                 END,
                 last_poll_error_json = CASE
                   WHEN ? = 'transient_error' THEN ?
                   WHEN ? = 'none' THEN last_poll_error_json
                   ELSE NULL
                 END,
                 next_poll_at = NULL, updated_at = ?, finished_at = ?
             WHERE id = ? AND state NOT IN ('succeeded', 'failed', 'cancelled', 'recovery_required')",
            params![
                request.outcome,
                serde_json::to_string(&error)?,
                request.reason,
                request.poll_outcome,
                request.poll_outcome,
                request.poll_outcome,
                request.poll_outcome,
                serde_json::to_string(&error)?,
                request.poll_outcome,
                now,
                now,
                operation.id
            ],
        )?;
        let job_state = if request.outcome == "cancelled" {
            "cancelled"
        } else {
            "failed"
        };
        tx.execute(
            "UPDATE scheduler_job
             SET state = ?, lease_owner = NULL, lease_token = NULL,
                 lease_expires_at = NULL, result_json = NULL, last_error_json = ?,
                 updated_at = ?, finished_at = ?
             WHERE id = ? AND state = 'running' AND lease_owner = ? AND lease_token = ?",
            params![
                job_state,
                serde_json::to_string(&error)?,
                now,
                now,
                job.id,
                request.worker_id,
                request.lease_token
            ],
        )?;
        let updated = get_operation_tx(&tx, &operation.id)?;
        settle_linked_conversation_tx(&tx, &updated, now)?;
        append_event_tx(
            &tx,
            &format!("evt_{}", Uuid::now_v7()),
            &format!("media_generation.{}", request.outcome),
            &EventScope::default(),
            &json!({ "operationId": operation.id, "error": error }),
            now,
        )?;
        tx.commit()?;
        Ok(Some(updated))
    }

    pub fn request_media_generation_cancel(
        &self,
        request: &RequestMediaGenerationCancel,
    ) -> Result<Option<MediaGenerationOperationRecord>> {
        if request.reason.trim().is_empty() {
            return Err(SystemServiceError::InvalidInput(
                "media generation cancel reason must not be empty".to_string(),
            ));
        }
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let Some(operation) = get_optional_operation_tx(&tx, &request.operation_id)? else {
            tx.commit()?;
            return Ok(None);
        };
        if is_terminal(&operation.state) || operation.state == "cancel_requested" {
            tx.commit()?;
            return Ok(Some(operation));
        }
        let job = crate::scheduler::get_job_tx(&tx, &operation.job_id)?;
        if matches!(job.state.as_str(), "pending" | "ready" | "retry_scheduled")
            && operation.state == "queued"
            && operation.external_operation_id.is_none()
        {
            tx.execute(
                "UPDATE media_generation_operation
                 SET state = 'cancelled', cancel_requested_at = ?, cancel_reason = ?,
                     next_poll_at = NULL, updated_at = ?, finished_at = ? WHERE id = ?",
                params![now, request.reason, now, now, operation.id],
            )?;
            tx.execute(
                "UPDATE scheduler_job SET state = 'cancelled', last_error_json = ?,
                 updated_at = ?, finished_at = ? WHERE id = ? AND state IN ('pending', 'ready', 'retry_scheduled')",
                params![
                    serde_json::to_string(&json!({ "type": "cancelled", "reason": request.reason }))?,
                    now,
                    now,
                    job.id
                ],
            )?;
        } else {
            tx.execute(
                "UPDATE media_generation_operation
                 SET state = 'cancel_requested', cancel_requested_at = ?,
                     cancel_reason = ?, next_poll_at = NULL, updated_at = ?
                 WHERE id = ? AND state NOT IN ('succeeded', 'failed', 'cancelled', 'recovery_required')",
                params![now, request.reason, now, operation.id],
            )?;
            if matches!(job.state.as_str(), "pending" | "ready" | "retry_scheduled") {
                tx.execute(
                    "UPDATE scheduler_job SET state = 'ready', not_before = NULL,
                     updated_at = ? WHERE id = ? AND state IN ('pending', 'ready', 'retry_scheduled')",
                    params![now, job.id],
                )?;
            }
        }
        let updated = get_operation_tx(&tx, &operation.id)?;
        append_event_tx(
            &tx,
            &format!("evt_{}", Uuid::now_v7()),
            "media_generation.cancel_requested",
            &EventScope::default(),
            &json!({ "operationId": operation.id, "reason": request.reason }),
            now,
        )?;
        tx.commit()?;
        Ok(Some(updated))
    }

    pub fn get_media_generation(
        &self,
        request: &GetMediaGenerationOperation,
    ) -> Result<Option<MediaGenerationOperationRecord>> {
        let conn = self.connect()?;
        conn.query_row(
            &format!("{OPERATION_SELECT} WHERE id = ?"),
            params![request.operation_id],
            row_to_media_generation_operation,
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn list_media_generations(
        &self,
        request: &ListMediaGenerationOperations,
    ) -> Result<Vec<MediaGenerationOperationRecord>> {
        let conn = self.connect()?;
        let limit = request.limit.unwrap_or(100).clamp(1, 1000);
        let mut statement = conn.prepare(&format!(
            "{OPERATION_SELECT} WHERE (?1 IS NULL OR principal_id = ?1)
             AND (?2 IS NULL OR state = ?2)
             ORDER BY updated_at DESC, id ASC LIMIT ?3"
        ))?;
        let rows = statement.query_map(
            params![request.principal_id, request.state, limit],
            row_to_media_generation_operation,
        )?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }
}

fn validate_submit(request: &SubmitMediaGenerationOperation) -> Result<()> {
    if request.principal_id.trim().is_empty() || request.idempotency_key.trim().is_empty() {
        return Err(SystemServiceError::InvalidInput(
            "media generation principal_id and idempotency_key are required".to_string(),
        ));
    }
    validate_media_generation_binding(&request.binding)?;
    Ok(())
}

fn validate_frozen_media_route(
    execution_binding: &Value,
    descriptor: &Value,
    media_binding: &Value,
) -> Result<()> {
    let requirements = descriptor
        .get("requiredCapabilities")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            SystemServiceError::Invariant(
                "deferred media tool has no frozen capability requirement".to_string(),
            )
        })?;
    if requirements.len() != 1 {
        return Err(SystemServiceError::Invariant(
            "deferred media tool must own exactly one capability requirement".to_string(),
        ));
    }
    let requirement = &requirements[0];
    let routes = execution_binding
        .get("capabilityRoutes")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            SystemServiceError::Invariant(
                "turn execution binding has no capability routes".to_string(),
            )
        })?;
    let route = routes
        .iter()
        .find(|route| route.get("requirement") == Some(requirement))
        .ok_or_else(|| {
            SystemServiceError::Invariant(
                "deferred media tool requirement is not frozen into the turn".to_string(),
            )
        })?;

    let media = media_binding
        .as_object()
        .expect("validated media binding is an object");
    let mut endpoint = serde_json::Map::new();
    for key in [
        "endpointId",
        "endpointDigest",
        "connection",
        "protocol",
        "model",
    ] {
        endpoint.insert(
            key.to_string(),
            media
                .get(key)
                .expect("validated media endpoint field")
                .clone(),
        );
    }
    if route.get("modelEndpoint") != Some(&Value::Object(endpoint)) {
        return Err(SystemServiceError::Invariant(
            "deferred media binding endpoint is not the frozen capability route".to_string(),
        ));
    }

    let request = media
        .get("request")
        .and_then(Value::as_object)
        .expect("validated media request is an object");
    let requirement = requirement.as_object().ok_or_else(|| {
        SystemServiceError::Invariant("tool capability requirement is invalid".to_string())
    })?;
    if requirement.get("operation") != request.get("operation")
        || requirement.get("outputModalities")
            != Some(&Value::Array(vec![request
                .get("outputModality")
                .expect("validated media output modality")
                .clone()]))
        || requirement
            .get("features")
            .and_then(Value::as_array)
            .is_none_or(|features| !features.is_empty())
    {
        return Err(SystemServiceError::Invariant(
            "deferred media request does not match its frozen capability requirement".to_string(),
        ));
    }
    let mut actual_inputs = vec!["text"];
    for resource in request
        .get("inputResources")
        .and_then(Value::as_array)
        .expect("validated media input resources")
    {
        let modality = media_resource_input_modality(
            resource
                .as_object()
                .expect("validated media resource evidence"),
        )?;
        if !actual_inputs.contains(&modality) {
            actual_inputs.push(modality);
        }
    }
    let required_inputs = requirement
        .get("inputModalities")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            SystemServiceError::Invariant(
                "tool capability input modalities are invalid".to_string(),
            )
        })?;
    if required_inputs.len() != actual_inputs.len()
        || actual_inputs.iter().any(|input| {
            !required_inputs
                .iter()
                .any(|required| required.as_str() == Some(input))
        })
    {
        return Err(SystemServiceError::Invariant(
            "deferred media inputs do not match the frozen capability requirement".to_string(),
        ));
    }
    Ok(())
}

fn ensure_same_deferred_request_tx(
    tx: &rusqlite::Transaction<'_>,
    operation: &MediaGenerationOperationRecord,
    request: &DeferToolExecution,
    binding: &Value,
) -> Result<()> {
    let relation = operation.conversation.as_ref().ok_or_else(|| {
        SystemServiceError::Invariant(
            "tool-linked media operation lost its conversation relation".to_string(),
        )
    })?;
    if relation.session_id != request.session_id
        || relation.turn_id != request.turn_id
        || relation.source_message_id != request.source_message_id
        || relation.tool_execution_id != request.tool_execution_id
        || relation.tool_call_id != request.tool_call_id
        || operation.binding != *binding
    {
        return Err(SystemServiceError::Invariant(
            "conflicting repeated deferred media handoff".to_string(),
        ));
    }
    let execution = crate::tools::get_tool_execution_tx(tx, &request.tool_execution_id)?;
    let attempt = crate::tools::get_tool_attempt_tx(tx, &request.tool_invocation_attempt_id)?;
    if execution.session_id != request.session_id
        || execution.turn_id != request.turn_id
        || execution.input_id != request.input_id
        || execution.source_message_id != request.source_message_id
        || execution.tool_call_id != request.tool_call_id
        || execution.current_invocation_attempt_id.as_deref()
            != Some(request.tool_invocation_attempt_id.as_str())
        || attempt.execution_id != request.tool_execution_id
        || attempt.session_attempt_id != request.session_attempt_id
        || attempt.job_id != request.session_job_id
        || attempt.worker_id != request.worker_id
    {
        return Err(SystemServiceError::Invariant(
            "conflicting repeated deferred media owner identity".to_string(),
        ));
    }
    Ok(())
}

fn deferred_receipt_tx(
    tx: &rusqlite::Transaction<'_>,
    request: &DeferToolExecution,
    operation: MediaGenerationOperationRecord,
) -> Result<DeferToolExecutionReceipt> {
    let job = crate::scheduler::get_job_tx(tx, &operation.job_id)?;
    Ok(DeferToolExecutionReceipt {
        turn: crate::sessions::get_turn_tx(tx, &request.turn_id)?,
        session_attempt: crate::turns::get_attempt_tx(tx, &request.session_attempt_id)?,
        session_job: crate::scheduler::get_job_tx(tx, &request.session_job_id)?,
        tool_execution: crate::tools::get_tool_execution_tx(tx, &request.tool_execution_id)?,
        tool_invocation_attempt: crate::tools::get_tool_attempt_tx(
            tx,
            &request.tool_invocation_attempt_id,
        )?,
        operation: DeferredToolOperationReceipt::MediaGeneration {
            record: Box::new(operation),
            job,
        },
    })
}

fn validate_deferred_request(request: &DeferToolExecution, binding: &Value) -> Result<()> {
    if [
        request.session_id.as_str(),
        request.turn_id.as_str(),
        request.session_attempt_id.as_str(),
        request.input_id.as_str(),
        request.source_message_id.as_str(),
        request.session_job_id.as_str(),
        request.worker_id.as_str(),
        request.lease_token.as_str(),
        request.tool_execution_id.as_str(),
        request.tool_invocation_attempt_id.as_str(),
        request.tool_call_id.as_str(),
    ]
    .iter()
    .any(|value| value.is_empty())
    {
        return Err(SystemServiceError::InvalidInput(
            "deferred media handoff identity fields must not be empty".to_string(),
        ));
    }
    validate_media_generation_binding(binding)
}

fn validate_media_generation_binding(binding: &Value) -> Result<()> {
    let binding = binding.as_object().ok_or_else(|| {
        SystemServiceError::InvalidInput("media generation binding must be an object".to_string())
    })?;
    require_exact_media_keys(
        binding,
        &[
            "endpointId",
            "endpointDigest",
            "connection",
            "protocol",
            "model",
            "request",
            "requestDigest",
        ],
        "media generation binding",
    )?;
    let mut endpoint = serde_json::Map::new();
    for key in [
        "endpointId",
        "endpointDigest",
        "connection",
        "protocol",
        "model",
    ] {
        endpoint.insert(
            key.to_string(),
            binding
                .get(key)
                .expect("required media endpoint field")
                .clone(),
        );
    }
    crate::sessions::validate_capability_model_endpoint_binding(&endpoint)?;

    let request = binding
        .get("request")
        .and_then(Value::as_object)
        .ok_or_else(|| {
            SystemServiceError::InvalidInput(
                "media generation binding request must be an object".to_string(),
            )
        })?;
    require_exact_media_keys(
        request,
        &[
            "operation",
            "prompt",
            "outputModality",
            "inputResources",
            "options",
        ],
        "media generation binding request",
    )?;
    let operation = required_media_string(request, "operation")?;
    if !matches!(
        operation,
        "image.generate" | "image.edit" | "video.generate" | "audio.synthesize"
    ) {
        return Err(SystemServiceError::InvalidInput(
            "media generation operation is invalid".to_string(),
        ));
    }
    let output = required_media_string(request, "outputModality")?;
    let expected_output = match operation {
        "video.generate" => "video",
        "audio.synthesize" => "audio",
        _ => "image",
    };
    if output != expected_output {
        return Err(SystemServiceError::InvalidInput(format!(
            "{operation} requires {expected_output} output"
        )));
    }
    if required_media_string(request, "prompt")?.trim().is_empty() {
        return Err(SystemServiceError::InvalidInput(
            "media generation prompt must not be empty".to_string(),
        ));
    }
    let resources = request
        .get("inputResources")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            SystemServiceError::InvalidInput(
                "media generation inputResources must be an array".to_string(),
            )
        })?;
    crate::sessions::validate_resource_bindings(resources)?;
    let mut inputs = vec!["text".to_string()];
    for resource in resources {
        let modality = media_resource_input_modality(
            resource
                .as_object()
                .expect("validated media input resource object"),
        )?;
        if !inputs.iter().any(|value| value == modality) {
            inputs.push(modality.to_string());
        }
    }
    if operation == "image.edit" && !inputs.iter().any(|value| value == "image") {
        return Err(SystemServiceError::InvalidInput(
            "image.edit requires an image input resource".to_string(),
        ));
    }
    crate::sessions::validate_endpoint_supports_requirement(
        &endpoint,
        operation,
        &inputs,
        &[output.to_string()],
        &[],
    )?;
    if let Some(limit) = endpoint
        .get("model")
        .and_then(Value::as_object)
        .and_then(|model| model.get("limits"))
        .and_then(Value::as_object)
        .and_then(|limits| limits.get("maxInputResources"))
        .and_then(Value::as_u64)
    {
        if resources.len() as u64 > limit {
            return Err(SystemServiceError::InvalidInput(
                "media generation input resources exceed model limit".to_string(),
            ));
        }
    }

    let request_digest = required_media_string(binding, "requestDigest")?;
    crate::sessions::validate_sha256(request_digest, "media generation binding requestDigest")?;
    let actual_request_digest =
        crate::util::hex_sha256(serde_json::to_string(&Value::Object(request.clone()))?.as_bytes());
    if actual_request_digest != request_digest {
        return Err(SystemServiceError::InvalidInput(
            "media generation requestDigest does not match its content".to_string(),
        ));
    }
    Ok(())
}

fn require_exact_media_keys(
    object: &serde_json::Map<String, Value>,
    allowed: &[&str],
    owner: &str,
) -> Result<()> {
    if object.len() != allowed.len() || object.keys().any(|key| !allowed.contains(&key.as_str())) {
        return Err(SystemServiceError::InvalidInput(format!(
            "{owner} contains missing or unknown fields"
        )));
    }
    Ok(())
}

fn required_media_string<'a>(
    object: &'a serde_json::Map<String, Value>,
    key: &str,
) -> Result<&'a str> {
    object
        .get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            SystemServiceError::InvalidInput(format!(
                "media generation {key} must be a non-empty string"
            ))
        })
}

fn media_resource_input_modality(
    resource: &serde_json::Map<String, Value>,
) -> Result<&'static str> {
    let kind = required_media_string(resource, "kind")?;
    match kind {
        "image" => return Ok("image"),
        "audio" => return Ok("audio"),
        "video" => return Ok("video"),
        "document" => return Ok("document"),
        _ => {}
    }
    let media_type = resource.get("mediaType").and_then(Value::as_str);
    if media_type.is_some_and(|value| value.starts_with("image/")) {
        return Ok("image");
    }
    if media_type.is_some_and(|value| value.starts_with("audio/")) {
        return Ok("audio");
    }
    if media_type.is_some_and(|value| value.starts_with("video/")) {
        return Ok("video");
    }
    if media_type.is_some_and(|value| value == "application/pdf" || value.starts_with("text/")) {
        return Ok("document");
    }
    Err(SystemServiceError::InvalidInput(
        "media generation input resource has no supported modality".to_string(),
    ))
}

fn validate_terminal_outcome(outcome: &str) -> Result<()> {
    if matches!(outcome, "failed" | "cancelled" | "recovery_required") {
        Ok(())
    } else {
        Err(SystemServiceError::InvalidInput(format!(
            "invalid media generation terminal outcome: {outcome}"
        )))
    }
}

fn validate_completed_poll_outcome(outcome: &str) -> Result<()> {
    if matches!(outcome, "none" | "completed") {
        Ok(())
    } else {
        Err(SystemServiceError::InvalidInput(format!(
            "invalid successful media generation poll outcome: {outcome}"
        )))
    }
}

fn ensure_successful_poll_source(state: &str, outcome: &str) -> Result<()> {
    let valid = match state {
        "polling" => outcome == "completed",
        "submitting" | "materializing" => outcome == "none",
        _ => false,
    };
    if valid {
        Ok(())
    } else {
        Err(SystemServiceError::Invariant(format!(
            "media generation poll outcome {outcome} is invalid for {state} state"
        )))
    }
}

fn validate_terminal_poll_outcome(outcome: &str) -> Result<()> {
    if matches!(
        outcome,
        "none" | "completed" | "provider_failure" | "transient_error"
    ) {
        Ok(())
    } else {
        Err(SystemServiceError::InvalidInput(format!(
            "invalid media generation terminal poll outcome: {outcome}"
        )))
    }
}

fn is_terminal(state: &str) -> bool {
    matches!(
        state,
        "succeeded" | "failed" | "cancelled" | "recovery_required"
    )
}

fn ensure_lease(job: &crate::SchedulerJobRecord, worker_id: &str, lease_token: &str) -> Result<()> {
    if job.state != "running"
        || job.lease_owner.as_deref() != Some(worker_id)
        || job.lease_token.as_deref() != Some(lease_token)
    {
        return Err(SystemServiceError::Invariant(
            "media generation operation does not own the active job lease".to_string(),
        ));
    }
    Ok(())
}

fn get_operation_tx(
    tx: &rusqlite::Transaction<'_>,
    operation_id: &str,
) -> Result<MediaGenerationOperationRecord> {
    get_optional_operation_tx(tx, operation_id)?.ok_or_else(|| {
        SystemServiceError::Invariant(format!(
            "media generation operation not found: {operation_id}"
        ))
    })
}

fn get_optional_operation_tx(
    tx: &rusqlite::Transaction<'_>,
    operation_id: &str,
) -> Result<Option<MediaGenerationOperationRecord>> {
    tx.query_row(
        &format!("{OPERATION_SELECT} WHERE id = ?"),
        params![operation_id],
        row_to_media_generation_operation,
    )
    .optional()
    .map_err(Into::into)
}

fn find_by_idempotency_tx(
    tx: &rusqlite::Transaction<'_>,
    idempotency_key: &str,
) -> Result<Option<MediaGenerationOperationRecord>> {
    tx.query_row(
        &format!("{OPERATION_SELECT} WHERE idempotency_key = ?"),
        params![idempotency_key],
        row_to_media_generation_operation,
    )
    .optional()
    .map_err(Into::into)
}

fn find_by_tool_execution_tx(
    tx: &rusqlite::Transaction<'_>,
    tool_execution_id: &str,
) -> Result<Option<MediaGenerationOperationRecord>> {
    tx.query_row(
        &format!("{OPERATION_SELECT} WHERE tool_execution_id = ?"),
        params![tool_execution_id],
        row_to_media_generation_operation,
    )
    .optional()
    .map_err(Into::into)
}

fn settle_linked_conversation_tx(
    tx: &rusqlite::Transaction<'_>,
    operation: &MediaGenerationOperationRecord,
    now: i64,
) -> Result<()> {
    let Some(relation) = operation.conversation.as_ref() else {
        return Ok(());
    };
    if !is_terminal(&operation.state) {
        return Err(SystemServiceError::Invariant(
            "linked media conversation can only settle from a terminal operation".to_string(),
        ));
    }
    let execution = crate::tools::get_tool_execution_tx(tx, &relation.tool_execution_id)?;
    if execution.session_id != relation.session_id
        || execution.turn_id != relation.turn_id
        || execution.source_message_id != relation.source_message_id
        || execution.tool_call_id != relation.tool_call_id
    {
        return Err(SystemServiceError::Invariant(
            "linked media conversation relation no longer matches its tool execution".to_string(),
        ));
    }

    if operation.state == "recovery_required" {
        require_linked_conversation_recovery_tx(tx, operation, &execution, now)?;
        return Ok(());
    }

    if operation.state == "succeeded" {
        let mut content = Vec::with_capacity(operation.output_resource_ids.len());
        for resource_id in &operation.output_resource_ids {
            let resource = crate::resources::get_resource_tx(tx, resource_id)?;
            if resource.state != "available" {
                return Err(SystemServiceError::Invariant(format!(
                    "linked media output resource is not available: {resource_id}"
                )));
            }
            crate::resources::require_media_output_provenance_tx(tx, resource_id, &operation.id)?;
            content.push(ToolResultContentPart::Resource {
                resource_id: resource.id,
                sha256: resource.sha256,
                size_bytes: resource.size_bytes,
                kind: resource.kind,
                media_type: resource.media_type,
            });
        }
        if content.is_empty() {
            return Err(SystemServiceError::Invariant(
                "linked successful media operation has no output resources".to_string(),
            ));
        }
        crate::tools::settle_waiting_tool_execution_tx(
            tx,
            &execution.id,
            "succeeded",
            &content,
            None,
            now,
        )?;
    } else {
        let error_code = if operation.state == "cancelled" {
            "media_generation_cancelled"
        } else {
            "media_generation_failed"
        };
        let message = operation.cancel_reason.as_deref().unwrap_or_else(|| {
            if operation.state == "cancelled" {
                "media generation was cancelled"
            } else {
                "media generation failed"
            }
        });
        let public_error = json!({
            "error": error_code,
            "message": message,
            "operationId": operation.id
        });
        let content = [ToolResultContentPart::Json {
            value: public_error.clone(),
        }];
        crate::tools::settle_waiting_tool_execution_tx(
            tx,
            &execution.id,
            "failed",
            &content,
            Some(&public_error),
            now,
        )?;
    }
    crate::tools::wake_waiting_tool_parent_tx(
        tx,
        &execution,
        "media_generation",
        &operation.id,
        &operation.state,
        now,
    )
}

fn require_linked_conversation_recovery_tx(
    tx: &rusqlite::Transaction<'_>,
    operation: &MediaGenerationOperationRecord,
    execution: &crate::ToolExecutionRecord,
    now: i64,
) -> Result<()> {
    let relation = operation
        .conversation
        .as_ref()
        .expect("linked recovery has a conversation relation");
    let tool_attempt_id = execution
        .current_invocation_attempt_id
        .as_deref()
        .ok_or_else(|| {
            SystemServiceError::Invariant(
                "waiting deferred tool has no suspended attempt".to_string(),
            )
        })?;
    let tool_attempt = crate::tools::get_tool_attempt_tx(tx, tool_attempt_id)?;
    let turn = crate::sessions::get_turn_tx(tx, &relation.turn_id)?;
    let session_attempt = crate::turns::get_attempt_tx(tx, &tool_attempt.session_attempt_id)?;
    let error = json!({
        "type": "deferred_media_recovery_required",
        "reason": "media_generation_outcome_ambiguous",
        "mediaOperationId": operation.id,
        "mediaError": operation.error
    });
    crate::tools::require_waiting_tool_recovery_tx(tx, &execution.id, &error, now)?;
    let error_json = serde_json::to_string(&error)?;
    let updated_tool_attempt = tx.execute(
        "UPDATE tool_execution_attempt
         SET state = 'recovery_required', error_json = ?, updated_at = ?, finished_at = ?
         WHERE id = ? AND execution_id = ? AND state = 'suspended'",
        params![error_json, now, now, tool_attempt.id, execution.id],
    )?;
    let updated_attempt = tx.execute(
        "UPDATE session_attempt
         SET state = 'recovery_required', error_json = ?, updated_at = ?, finished_at = ?
         WHERE id = ? AND turn_id = ? AND state = 'suspended'",
        params![error_json, now, now, session_attempt.id, turn.id],
    )?;
    let updated_turn = tx.execute(
        "UPDATE session_turn
         SET state = 'recovery_required', current_attempt_id = ?, error_json = ?,
             updated_at = ?, finished_at = ?
         WHERE id = ? AND current_attempt_id IS NULL
           AND state IN ('waiting', 'cancel_requested')",
        params![session_attempt.id, error_json, now, now, turn.id],
    )?;
    let updated_input = tx.execute(
        "UPDATE session_input SET status = 'failed', updated_at = ?
         WHERE id = ? AND status = 'promoted'",
        params![now, turn.primary_input_id],
    )?;
    let updated_job = tx.execute(
        "UPDATE scheduler_job
         SET state = 'failed', lease_owner = NULL, lease_token = NULL,
             lease_expires_at = NULL, last_error_json = ?, updated_at = ?, finished_at = ?
         WHERE id = ? AND kind = 'session.turn' AND state = 'waiting'",
        params![error_json, now, now, turn.job_id],
    )?;
    if updated_tool_attempt != 1
        || updated_attempt != 1
        || updated_turn != 1
        || updated_input != 1
        || updated_job != 1
    {
        return Err(SystemServiceError::Invariant(
            "linked media recovery transition lost its suspended turn".to_string(),
        ));
    }
    tx.execute(
        "UPDATE session_turn_control SET status = 'cancelled', updated_at = ?
         WHERE turn_id = ? AND status = 'pending'",
        params![now, turn.id],
    )?;
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        "session.turn.recovery_required",
        &EventScope {
            session_id: Some(turn.session_id.clone()),
            turn_id: Some(turn.id.clone()),
            attempt_id: Some(session_attempt.id.clone()),
            input_id: Some(turn.primary_input_id.clone()),
            message_id: Some(relation.source_message_id.clone()),
            ..EventScope::default()
        },
        &error,
        now,
    )?;
    crate::scheduler::append_scheduler_event_tx(
        tx,
        "scheduler.job.failed",
        &turn.job_id,
        &error,
        now,
    )
}

fn complete_job_for_operation_tx(
    tx: &rusqlite::Transaction<'_>,
    job: &crate::SchedulerJobRecord,
    result: Option<&Value>,
    now: i64,
) -> Result<()> {
    let updated = tx.execute(
        "UPDATE scheduler_job SET state = 'succeeded', lease_owner = NULL,
         lease_token = NULL, lease_expires_at = NULL, result_json = ?,
         last_error_json = NULL, updated_at = ?, finished_at = ?
         WHERE id = ? AND state = 'running' AND lease_owner = ? AND lease_token = ?",
        params![
            result.map(serde_json::to_string).transpose()?,
            now,
            now,
            job.id,
            job.lease_owner,
            job.lease_token
        ],
    )?;
    if updated != 1 {
        return Err(SystemServiceError::Invariant(
            "media generation completion lost the active job lease".to_string(),
        ));
    }
    Ok(())
}

fn mark_recovery_tx(
    tx: &rusqlite::Transaction<'_>,
    operation_id: &str,
    job: &crate::SchedulerJobRecord,
    worker_id: &str,
    lease_token: &str,
    error: Value,
    now: i64,
) -> Result<()> {
    tx.execute(
        "UPDATE media_generation_operation SET state = 'recovery_required',
         error_json = ?, updated_at = ?, finished_at = ? WHERE id = ?
         AND state = 'submitting'",
        params![serde_json::to_string(&error)?, now, now, operation_id],
    )?;
    tx.execute(
        "UPDATE scheduler_job SET state = 'failed', lease_owner = NULL,
         lease_token = NULL, lease_expires_at = NULL, last_error_json = ?,
         updated_at = ?, finished_at = ? WHERE id = ? AND state = 'running'
         AND lease_owner = ? AND lease_token = ?",
        params![
            serde_json::to_string(&error)?,
            now,
            now,
            job.id,
            worker_id,
            lease_token
        ],
    )?;
    let operation = get_operation_tx(tx, operation_id)?;
    settle_linked_conversation_tx(tx, &operation, now)?;
    Ok(())
}
