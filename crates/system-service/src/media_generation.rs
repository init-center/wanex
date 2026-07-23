use crate::event_store::append_event_tx;
use crate::rows::row_to_media_generation_operation;
use crate::scheduler::enqueue_job_tx;
use crate::{
    AcceptMediaGenerationOperation, BeginMediaGenerationOperation,
    CheckpointMediaGenerationOperation, CompleteMediaGenerationOperation, EnqueueJob, EventScope,
    GetMediaGenerationOperation, ListMediaGenerationOperations, MediaGenerationBeginReceipt,
    MediaGenerationOperationRecord, RecordMediaGenerationOutputs, RequestMediaGenerationCancel,
    Result, RetryPolicy, SchedulerJobKind, SettleMediaGenerationOperation,
    SubmitMediaGenerationOperation, SystemService, SystemServiceError,
};
use rusqlite::{params, OptionalExtension};
use serde_json::{json, Value};
use uuid::Uuid;

const OPERATION_SELECT: &str = "SELECT id, job_id, principal_id, idempotency_key,
    state, binding_json, dispatch_attempt, external_operation_id,
    provider_checkpoint_json, output_references_json, output_resource_ids_json,
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
                id, job_id, principal_id, idempotency_key, state, binding_json,
                dispatch_attempt, external_operation_id, provider_checkpoint_json,
                output_references_json, output_resource_ids_json, progress_json,
                error_json, cancel_requested_at, cancel_reason, created_at,
                updated_at, finished_at
             ) VALUES (?, ?, ?, ?, 'queued', ?, 0, NULL, NULL, '[]', '[]', NULL,
                       NULL, NULL, NULL, ?, ?, NULL)",
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
            "polling" => "resume_polling",
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

    pub fn checkpoint_media_generation(
        &self,
        request: &CheckpointMediaGenerationOperation,
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
        if operation.state != "polling" {
            return Err(SystemServiceError::Invariant(
                "media generation checkpoint requires polling state".to_string(),
            ));
        }
        tx.execute(
            "UPDATE media_generation_operation
             SET provider_checkpoint_json = ?, progress_json = ?, updated_at = ?
             WHERE id = ? AND state = 'polling'",
            params![
                request
                    .provider_checkpoint
                    .as_ref()
                    .map(serde_json::to_string)
                    .transpose()?,
                request
                    .progress
                    .as_ref()
                    .map(serde_json::to_string)
                    .transpose()?,
                now,
                operation.id
            ],
        )?;
        let updated = get_operation_tx(&tx, &operation.id)?;
        tx.commit()?;
        Ok(Some(updated))
    }

    pub fn record_media_generation_outputs(
        &self,
        request: &RecordMediaGenerationOutputs,
    ) -> Result<Option<MediaGenerationOperationRecord>> {
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
        tx.execute(
            "UPDATE media_generation_operation
             SET state = 'materializing', output_references_json = ?,
                 progress_json = ?, updated_at = ?
             WHERE id = ? AND state IN ('submitting', 'polling')",
            params![
                serde_json::to_string(&request.output_references)?,
                request
                    .progress
                    .as_ref()
                    .map(serde_json::to_string)
                    .transpose()?,
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
        for resource_id in &request.output_resource_ids {
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
        }
        tx.execute(
            "UPDATE media_generation_operation
             SET state = 'succeeded', output_resource_ids_json = ?,
                 progress_json = ?, error_json = NULL, updated_at = ?, finished_at = ?
             WHERE id = ? AND state NOT IN ('succeeded', 'failed', 'cancelled', 'recovery_required')",
            params![
                serde_json::to_string(&request.output_resource_ids)?,
                request.result.as_ref().map(serde_json::to_string).transpose()?,
                now,
                now,
                operation.id
            ],
        )?;
        complete_job_for_operation_tx(&tx, &job, request.result.as_ref(), now)?;
        let updated = get_operation_tx(&tx, &operation.id)?;
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
        let error = request.error.clone().unwrap_or_else(|| {
            json!({
                "type": request.outcome,
                "reason": request.reason
            })
        });
        tx.execute(
            "UPDATE media_generation_operation
             SET state = ?, error_json = ?, cancel_reason = COALESCE(cancel_reason, ?),
                 updated_at = ?, finished_at = ?
             WHERE id = ? AND state NOT IN ('succeeded', 'failed', 'cancelled', 'recovery_required')",
            params![
                request.outcome,
                serde_json::to_string(&error)?,
                request.reason,
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
        if matches!(job.state.as_str(), "pending" | "ready" | "retry_scheduled") {
            tx.execute(
                "UPDATE media_generation_operation
                 SET state = 'cancelled', cancel_requested_at = ?, cancel_reason = ?,
                     updated_at = ?, finished_at = ? WHERE id = ?",
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
                     cancel_reason = ?, updated_at = ?
                 WHERE id = ? AND state NOT IN ('succeeded', 'failed', 'cancelled', 'recovery_required')",
                params![now, request.reason, now, operation.id],
            )?;
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
    if !request.binding.is_object() {
        return Err(SystemServiceError::InvalidInput(
            "media generation binding must be an object".to_string(),
        ));
    }
    Ok(())
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
    Ok(())
}
