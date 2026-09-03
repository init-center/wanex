use crate::budget::commit_budget_grant_tx;
use crate::event_store::append_event_tx;
use crate::rows::row_to_scheduler_job;
use crate::{
    CancelJob, ClaimJob, CompleteJob, EnqueueJob, EventScope, FailJob, GetJob, HeartbeatJob,
    ListJobs, Result, RetryPolicy, RetryStrategy, SchedulerJobRecord, SystemService,
    SystemServiceError,
};
use rusqlite::{params, params_from_iter, types::Value as SqlValue, OptionalExtension};
use uuid::Uuid;

pub(crate) const DEFAULT_SCHEDULER_QUEUE: &str = "default";

pub(crate) const JOB_SELECT: &str = "SELECT id, kind, queue, state, principal_id, payload_json,
    scheduled_at, not_before, priority, concurrency_key, attempt, max_attempts,
    retry_policy_json, idempotency_key, budget_grant_id,
    lease_owner, lease_token, lease_expires_at, result_json, last_error_json,
    created_at, updated_at, finished_at
    FROM scheduler_job";

impl SystemService {
    pub fn enqueue_job(&self, request: &EnqueueJob) -> Result<SchedulerJobRecord> {
        if matches!(
            request.kind,
            crate::SchedulerJobKind::SessionTurn
                | crate::SchedulerJobKind::TeamDelivery
                | crate::SchedulerJobKind::TeamDeliveryOutcome
        ) {
            return Err(SystemServiceError::InvalidJobRequest(
                "domain-owned jobs must be created by their specialized transaction".to_string(),
            ));
        }
        validate_enqueue(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let job = enqueue_job_tx(&tx, request, now)?;
        tx.commit()?;
        Ok(job)
    }

    pub fn claim_job(&self, request: &ClaimJob) -> Result<Option<SchedulerJobRecord>> {
        if request.lease_ms <= 0 {
            return Err(SystemServiceError::InvalidJobRequest(
                "job lease_ms must be positive".to_string(),
            ));
        }
        validate_claim_queues(request.queues.as_deref())?;
        let now = crate::util::now_ms();
        let lease_expires_at = now + request.lease_ms;
        let lease_token = format!("joblease_{}", Uuid::now_v7());
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        reset_expired_leases_tx(&tx, now)?;

        let candidates = ready_candidates_tx(
            &tx,
            now,
            request.kinds.as_deref(),
            request.queues.as_deref(),
        )?;
        let Some(job_id) = candidates.first().cloned() else {
            tx.commit()?;
            return Ok(None);
        };
        let updated = tx.execute(
            "UPDATE scheduler_job
             SET state = 'running',
                 attempt = attempt + 1,
                 lease_owner = ?,
                 lease_token = ?,
                 lease_expires_at = ?,
                 updated_at = ?
             WHERE id = ? AND state IN ('pending', 'ready', 'retry_scheduled')",
            params![
                request.worker_id,
                lease_token,
                lease_expires_at,
                now,
                job_id
            ],
        )?;
        if updated == 0 {
            tx.commit()?;
            return Ok(None);
        }
        let claimed_job = get_job_tx(&tx, &job_id)?;
        append_scheduler_event_tx(
            &tx,
            "scheduler.job.claimed",
            &job_id,
            &serde_json::json!({
                "jobId": job_id,
                "workerId": request.worker_id,
                "queue": claimed_job.queue,
                "leaseExpiresAt": lease_expires_at
            }),
            now,
        )?;
        tx.commit()?;
        Ok(Some(claimed_job))
    }

    pub fn heartbeat_job(&self, request: &HeartbeatJob) -> Result<Option<SchedulerJobRecord>> {
        if request.lease_ms <= 0 {
            return Err(SystemServiceError::InvalidJobRequest(
                "job lease_ms must be positive".to_string(),
            ));
        }
        let now = crate::util::now_ms();
        let lease_expires_at = now + request.lease_ms;
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let updated = tx.execute(
            "UPDATE scheduler_job
             SET lease_expires_at = ?, updated_at = ?
             WHERE id = ? AND lease_owner = ? AND lease_token = ?
               AND state = 'running'",
            params![
                lease_expires_at,
                now,
                request.job_id,
                request.worker_id,
                request.lease_token
            ],
        )?;
        if updated == 0 {
            tx.commit()?;
            return Ok(None);
        }
        append_scheduler_event_tx(
            &tx,
            "scheduler.job.heartbeat",
            &request.job_id,
            &serde_json::json!({
                "jobId": request.job_id,
                "workerId": request.worker_id,
                "leaseExpiresAt": lease_expires_at
            }),
            now,
        )?;
        let job = get_job_tx(&tx, &request.job_id)?;
        tx.commit()?;
        Ok(Some(job))
    }

    pub fn complete_job(&self, request: &CompleteJob) -> Result<Option<SchedulerJobRecord>> {
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let job = complete_job_tx(&tx, request, now)?;
        tx.commit()?;
        Ok(job)
    }

    pub fn fail_job(&self, request: &FailJob) -> Result<Option<SchedulerJobRecord>> {
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let updated = fail_job_tx(&tx, request, now)?;
        tx.commit()?;
        Ok(updated)
    }

    pub fn cancel_job(&self, request: &CancelJob) -> Result<Option<SchedulerJobRecord>> {
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let existing = get_optional_job_tx(&tx, &request.job_id)?;
        let Some(existing) = existing else {
            tx.commit()?;
            return Ok(None);
        };
        if existing.kind == "session.turn" {
            return Err(SystemServiceError::InvalidJobRequest(
                "session.turn jobs must be cancelled through request_session_turn_cancel"
                    .to_string(),
            ));
        }
        if is_terminal(&existing.state) {
            tx.commit()?;
            return Ok(Some(existing));
        }
        tx.execute(
            "UPDATE scheduler_job
             SET state = 'cancelled',
                 lease_owner = NULL,
                 lease_token = NULL,
                 lease_expires_at = NULL,
                 result_json = NULL,
                 last_error_json = ?,
                 updated_at = ?,
                 finished_at = ?
             WHERE id = ?",
            params![
                serde_json::to_string(&serde_json::json!({
                    "type": "cancelled",
                    "reason": request.reason
                }))?,
                now,
                now,
                request.job_id
            ],
        )?;
        append_scheduler_event_tx(
            &tx,
            "scheduler.job.cancelled",
            &request.job_id,
            &serde_json::json!({
                "jobId": request.job_id,
                "reason": request.reason
            }),
            now,
        )?;
        if let Some(grant_id) = &existing.budget_grant_id {
            commit_budget_grant_tx(&tx, grant_id, now)?;
        }
        if existing.kind == "team.delivery" {
            crate::team::sync_team_delivery_cancelled_tx(
                &tx,
                &request.job_id,
                &request.reason,
                now,
            )?;
        } else if existing.kind == "team.delivery.outcome" {
            crate::team::sync_team_delivery_outcome_cancelled_tx(
                &tx,
                &request.job_id,
                &request.reason,
                now,
            )?;
        }
        let job = get_job_tx(&tx, &request.job_id)?;
        tx.commit()?;
        Ok(Some(job))
    }

    pub fn get_job(&self, request: &GetJob) -> Result<Option<SchedulerJobRecord>> {
        let conn = self.connect()?;
        conn.query_row(
            &format!("{JOB_SELECT} WHERE id = ?"),
            params![request.job_id],
            row_to_scheduler_job,
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn list_jobs(&self, request: &ListJobs) -> Result<Vec<SchedulerJobRecord>> {
        let conn = self.connect()?;
        let limit = i64::from(request.limit.unwrap_or(100).min(1000));
        match (&request.state, &request.kind) {
            (Some(state), Some(kind)) => {
                let mut stmt = conn.prepare(&format!(
                    "{JOB_SELECT} WHERE state = ? AND kind = ?
                     ORDER BY priority DESC, scheduled_at ASC, id ASC LIMIT ?"
                ))?;
                let rows = stmt.query_map(params![state, kind, limit], row_to_scheduler_job)?;
                collect_jobs(rows)
            }
            (Some(state), None) => {
                let mut stmt = conn.prepare(&format!(
                    "{JOB_SELECT} WHERE state = ?
                     ORDER BY priority DESC, scheduled_at ASC, id ASC LIMIT ?"
                ))?;
                let rows = stmt.query_map(params![state, limit], row_to_scheduler_job)?;
                collect_jobs(rows)
            }
            (None, Some(kind)) => {
                let mut stmt = conn.prepare(&format!(
                    "{JOB_SELECT} WHERE kind = ?
                     ORDER BY priority DESC, scheduled_at ASC, id ASC LIMIT ?"
                ))?;
                let rows = stmt.query_map(params![kind, limit], row_to_scheduler_job)?;
                collect_jobs(rows)
            }
            (None, None) => {
                let mut stmt = conn.prepare(&format!(
                    "{JOB_SELECT} ORDER BY priority DESC, scheduled_at ASC, id ASC LIMIT ?"
                ))?;
                let rows = stmt.query_map(params![limit], row_to_scheduler_job)?;
                collect_jobs(rows)
            }
        }
    }
}

pub(crate) fn enqueue_job_tx(
    tx: &rusqlite::Transaction<'_>,
    request: &EnqueueJob,
    now: i64,
) -> Result<SchedulerJobRecord> {
    validate_enqueue(request)?;
    let id = request
        .id
        .clone()
        .unwrap_or_else(|| format!("job_{}", Uuid::now_v7()));
    let scheduled_at = request.scheduled_at.unwrap_or(now);
    let state = if request.not_before.unwrap_or(scheduled_at) <= now {
        "ready"
    } else {
        "pending"
    };
    let retry_policy = request.retry_policy.clone().unwrap_or_default();
    let priority = request.priority.unwrap_or(0);
    let max_attempts = request.max_attempts.unwrap_or(1);
    let queue = request.queue.as_deref().unwrap_or(DEFAULT_SCHEDULER_QUEUE);

    if let Some(idempotency_key) = &request.idempotency_key {
        if let Some(existing) = find_job_by_idempotency_tx(tx, idempotency_key)? {
            return Ok(existing);
        }
    }

    tx.execute(
        "INSERT INTO scheduler_job (
            id, kind, queue, state, principal_id, payload_json,
            scheduled_at, not_before, priority, concurrency_key, attempt, max_attempts,
            retry_policy_json, idempotency_key, budget_grant_id,
            lease_owner, lease_token, lease_expires_at, result_json, last_error_json,
            created_at, updated_at, finished_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?,
                   NULL, NULL, NULL, NULL, NULL, ?, ?, NULL)",
        params![
            id,
            request.kind.as_str(),
            queue,
            state,
            request.principal_id,
            serde_json::to_string(&request.payload)?,
            scheduled_at,
            request.not_before,
            priority,
            request.concurrency_key,
            max_attempts,
            serde_json::to_string(&retry_policy)?,
            request.idempotency_key,
            request.budget_grant_id,
            now,
            now,
        ],
    )?;
    append_scheduler_event_tx(
        tx,
        "scheduler.job.enqueued",
        &id,
        &serde_json::json!({
            "jobId": id,
            "kind": request.kind.as_str(),
            "queue": queue,
            "state": state,
            "concurrencyKey": request.concurrency_key
        }),
        now,
    )?;
    get_job_tx(tx, &id)
}

pub(crate) fn complete_job_tx(
    tx: &rusqlite::Transaction<'_>,
    request: &CompleteJob,
    now: i64,
) -> Result<Option<SchedulerJobRecord>> {
    complete_job_tx_internal(tx, request, now, None)
}

pub(crate) fn complete_team_delivery_job_tx(
    tx: &rusqlite::Transaction<'_>,
    request: &CompleteJob,
    now: i64,
) -> Result<Option<SchedulerJobRecord>> {
    complete_job_tx_internal(tx, request, now, Some("team.delivery"))
}

pub(crate) fn complete_team_delivery_outcome_job_tx(
    tx: &rusqlite::Transaction<'_>,
    request: &CompleteJob,
    now: i64,
) -> Result<Option<SchedulerJobRecord>> {
    complete_job_tx_internal(tx, request, now, Some("team.delivery.outcome"))
}

fn complete_job_tx_internal(
    tx: &rusqlite::Transaction<'_>,
    request: &CompleteJob,
    now: i64,
    specialized_kind: Option<&str>,
) -> Result<Option<SchedulerJobRecord>> {
    let existing = get_optional_job_tx(tx, &request.job_id)?;
    let Some(existing) = existing else {
        return Ok(None);
    };
    if let Some(expected_kind) = specialized_kind {
        if existing.kind != expected_kind {
            return Err(SystemServiceError::InvalidJobRequest(format!(
                "specialized job completion requires kind {expected_kind}"
            )));
        }
    } else {
        let message = match existing.kind.as_str() {
            "session.turn" => Some(
                "session.turn jobs must be completed through settle_session_turn",
            ),
            "team.delivery" => Some(
                "team.delivery jobs must be completed through materialize_team_delivery",
            ),
            "team.delivery.outcome" => Some(
                "team.delivery.outcome jobs must be completed through project_team_delivery_outcome",
            ),
            _ => None,
        };
        if let Some(message) = message {
            return Err(SystemServiceError::InvalidJobRequest(message.to_string()));
        }
    }
    if existing.state == "succeeded" {
        return Ok(Some(existing));
    }
    let updated = tx.execute(
        "UPDATE scheduler_job
         SET state = 'succeeded',
             lease_owner = NULL,
             lease_token = NULL,
             lease_expires_at = NULL,
             result_json = ?,
             last_error_json = NULL,
             updated_at = ?,
             finished_at = ?
         WHERE id = ? AND lease_owner = ? AND lease_token = ?
           AND state = 'running'",
        params![
            request
                .result
                .as_ref()
                .map(serde_json::to_string)
                .transpose()?,
            now,
            now,
            request.job_id,
            request.worker_id,
            request.lease_token
        ],
    )?;
    if updated == 0 {
        return Ok(None);
    }
    append_scheduler_event_tx(
        tx,
        "scheduler.job.succeeded",
        &request.job_id,
        &serde_json::json!({
            "jobId": request.job_id,
            "workerId": request.worker_id
        }),
        now,
    )?;
    if let Some(grant_id) = &existing.budget_grant_id {
        commit_budget_grant_tx(tx, grant_id, now)?;
    }
    get_optional_job_tx(tx, &request.job_id)
}

pub(crate) fn fail_job_tx(
    tx: &rusqlite::Transaction<'_>,
    request: &FailJob,
    now: i64,
) -> Result<Option<SchedulerJobRecord>> {
    let Some(job) = get_optional_job_tx(tx, &request.job_id)? else {
        return Ok(None);
    };
    if job.state != "running"
        || job.lease_owner.as_deref() != Some(&request.worker_id)
        || job.lease_token.as_deref() != Some(&request.lease_token)
    {
        return Ok(None);
    }
    if job.kind == "session.turn" {
        return crate::turns::fail_session_turn_job_tx(tx, request, now);
    }

    let can_retry =
        job.attempt < job.max_attempts && job.retry_policy.strategy != RetryStrategy::None;
    if can_retry {
        let delay_ms = retry_delay_ms(&job.retry_policy, job.attempt);
        let not_before = now + delay_ms;
        tx.execute(
            "UPDATE scheduler_job
             SET state = 'retry_scheduled',
                 not_before = ?,
                 lease_owner = NULL,
                 lease_token = NULL,
                 lease_expires_at = NULL,
                 result_json = NULL,
                 last_error_json = ?,
                 updated_at = ?
             WHERE id = ?",
            params![
                not_before,
                serde_json::to_string(&request.error)?,
                now,
                request.job_id
            ],
        )?;
        append_scheduler_event_tx(
            tx,
            "scheduler.job.retry_scheduled",
            &request.job_id,
            &serde_json::json!({
                "jobId": request.job_id,
                "attempt": job.attempt,
                "notBefore": not_before,
                "error": request.error
            }),
            now,
        )?;
    } else {
        tx.execute(
            "UPDATE scheduler_job
             SET state = 'failed',
                 lease_owner = NULL,
                 lease_token = NULL,
                 lease_expires_at = NULL,
                 result_json = NULL,
                 last_error_json = ?,
                 updated_at = ?,
                 finished_at = ?
             WHERE id = ?",
            params![
                serde_json::to_string(&request.error)?,
                now,
                now,
                request.job_id
            ],
        )?;
        append_scheduler_event_tx(
            tx,
            "scheduler.job.failed",
            &request.job_id,
            &serde_json::json!({
                "jobId": request.job_id,
                "attempt": job.attempt,
                "error": request.error
            }),
            now,
        )?;
        if let Some(grant_id) = &job.budget_grant_id {
            commit_budget_grant_tx(tx, grant_id, now)?;
        }
    }
    let updated_job = get_optional_job_tx(tx, &request.job_id)?;
    if job.kind == "team.delivery" {
        let updated_job = updated_job.as_ref().ok_or_else(|| {
            SystemServiceError::Invariant(format!(
                "failed team delivery job disappeared: {}",
                request.job_id
            ))
        })?;
        crate::team::sync_team_delivery_failure_tx(tx, updated_job, &request.error, now)?;
    } else if job.kind == "team.delivery.outcome" {
        let updated_job = updated_job.as_ref().ok_or_else(|| {
            SystemServiceError::Invariant(format!(
                "failed team outcome job disappeared: {}",
                request.job_id
            ))
        })?;
        crate::team::sync_team_delivery_outcome_failure_tx(tx, updated_job, &request.error, now)?;
    }
    Ok(updated_job)
}

pub(crate) struct SessionTurnJobSettlement<'a> {
    pub job_id: &'a str,
    pub worker_id: &'a str,
    pub lease_token: &'a str,
    pub state: &'a str,
    pub result: Option<&'a serde_json::Value>,
    pub error: Option<&'a serde_json::Value>,
}

pub(crate) fn settle_job_without_retry_tx(
    tx: &rusqlite::Transaction<'_>,
    settlement: SessionTurnJobSettlement<'_>,
    now: i64,
) -> Result<SchedulerJobRecord> {
    if !matches!(settlement.state, "succeeded" | "failed" | "cancelled") {
        return Err(SystemServiceError::Invariant(
            "invalid terminal scheduler job state".to_string(),
        ));
    }
    let existing = get_job_tx(tx, settlement.job_id)?;
    if is_terminal(&existing.state) {
        return Ok(existing);
    }
    let updated = tx.execute(
        "UPDATE scheduler_job
         SET state = ?, lease_owner = NULL, lease_token = NULL,
             lease_expires_at = NULL, result_json = ?, last_error_json = ?,
             updated_at = ?, finished_at = ?
         WHERE id = ? AND kind = 'session.turn' AND state = 'running'
           AND lease_owner = ? AND lease_token = ? AND lease_expires_at > ?",
        params![
            settlement.state,
            settlement.result.map(serde_json::to_string).transpose()?,
            settlement.error.map(serde_json::to_string).transpose()?,
            now,
            now,
            settlement.job_id,
            settlement.worker_id,
            settlement.lease_token,
            now
        ],
    )?;
    if updated == 0 {
        return Err(SystemServiceError::Invariant(
            "session turn settlement lost its scheduler lease".to_string(),
        ));
    }
    append_scheduler_event_tx(
        tx,
        match settlement.state {
            "succeeded" => "scheduler.job.succeeded",
            "cancelled" => "scheduler.job.cancelled",
            _ => "scheduler.job.failed",
        },
        settlement.job_id,
        &serde_json::json!({
            "jobId": settlement.job_id,
            "workerId": settlement.worker_id,
            "state": settlement.state
        }),
        now,
    )?;
    if let Some(grant_id) = &existing.budget_grant_id {
        commit_budget_grant_tx(tx, grant_id, now)?;
    }
    let job = get_job_tx(tx, settlement.job_id)?;
    crate::team::enqueue_team_delivery_outcome_tx(tx, &job, now)?;
    crate::team::settle_team_delegation_child_tx(tx, &job, now)?;
    Ok(job)
}

pub(crate) fn cancel_unstarted_job_tx(
    tx: &rusqlite::Transaction<'_>,
    job_id: &str,
    reason: &str,
    now: i64,
) -> Result<SchedulerJobRecord> {
    let existing = get_job_tx(tx, job_id)?;
    if is_terminal(&existing.state) {
        return Ok(existing);
    }
    let error = serde_json::json!({"type": "cancelled", "reason": reason});
    let updated = tx.execute(
        "UPDATE scheduler_job
         SET state = 'cancelled', lease_owner = NULL, lease_token = NULL,
             lease_expires_at = NULL, result_json = NULL, last_error_json = ?,
             updated_at = ?, finished_at = ?
         WHERE id = ? AND kind = 'session.turn'
           AND state IN ('pending', 'ready', 'retry_scheduled', 'running')",
        params![serde_json::to_string(&error)?, now, now, job_id],
    )?;
    if updated == 0 {
        return Err(SystemServiceError::Invariant(
            "queued session turn job could not be cancelled".to_string(),
        ));
    }
    append_scheduler_event_tx(tx, "scheduler.job.cancelled", job_id, &error, now)?;
    if let Some(grant_id) = &existing.budget_grant_id {
        commit_budget_grant_tx(tx, grant_id, now)?;
    }
    let job = get_job_tx(tx, job_id)?;
    crate::team::enqueue_team_delivery_outcome_tx(tx, &job, now)?;
    crate::team::settle_team_delegation_child_tx(tx, &job, now)?;
    Ok(job)
}

fn validate_enqueue(request: &EnqueueJob) -> Result<()> {
    if request.principal_id.is_empty() {
        return Err(SystemServiceError::InvalidJobRequest(
            "principal_id must not be empty".to_string(),
        ));
    }
    if request.max_attempts.unwrap_or(1) <= 0 {
        return Err(SystemServiceError::InvalidJobRequest(
            "max_attempts must be positive".to_string(),
        ));
    }
    validate_queue(request.queue.as_deref())?;
    Ok(())
}

fn validate_claim_queues(queues: Option<&[String]>) -> Result<()> {
    if let Some(queues) = queues {
        for queue in queues {
            validate_queue(Some(queue))?;
        }
    }
    Ok(())
}

fn validate_queue(queue: Option<&str>) -> Result<()> {
    let Some(queue) = queue else {
        return Ok(());
    };
    if queue.is_empty()
        || queue.len() > 128
        || !queue
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
    {
        return Err(SystemServiceError::InvalidJobRequest(
            "job queue must be a non-empty opaque identifier of at most 128 ASCII letters, digits, '.', '_' or '-'"
                .to_string(),
        ));
    }
    Ok(())
}

fn retry_delay_ms(policy: &RetryPolicy, attempt: i64) -> i64 {
    let initial = policy.initial_delay_ms.unwrap_or(1_000).max(0);
    let raw = match policy.strategy {
        RetryStrategy::None => 0,
        RetryStrategy::Fixed => initial,
        RetryStrategy::Exponential => {
            initial.saturating_mul(2_i64.saturating_pow((attempt - 1).max(0) as u32))
        }
    };
    policy.max_delay_ms.map_or(raw, |max| raw.min(max))
}

fn is_terminal(state: &str) -> bool {
    matches!(state, "succeeded" | "failed" | "cancelled")
}

fn reset_expired_leases_tx(tx: &rusqlite::Transaction<'_>, now: i64) -> Result<()> {
    let expired = {
        let mut stmt = tx.prepare(&format!(
            "{JOB_SELECT} WHERE state = 'running' AND lease_expires_at <= ?"
        ))?;
        let rows = stmt.query_map(params![now], row_to_scheduler_job)?;
        collect_jobs(rows)?
    };
    for job in expired {
        if job.kind != "session.turn" {
            tx.execute(
                "UPDATE scheduler_job
                 SET state = 'ready', lease_owner = NULL, lease_token = NULL,
                     lease_expires_at = NULL, updated_at = ?
                 WHERE id = ? AND state = 'running'",
                params![now, job.id],
            )?;
            continue;
        }

        let promoted_attempt: Option<String> = tx
            .query_row(
                "SELECT id
                 FROM session_attempt
                 WHERE job_id = ? AND state = 'running'",
                params![job.id],
                |row| row.get(0),
            )
            .optional()?;
        if promoted_attempt.is_some() {
            crate::turns::reconcile_expired_session_turn_job_tx(tx, &job, now)?;
        } else {
            tx.execute(
                "UPDATE scheduler_job
                 SET state = 'ready', attempt = MAX(attempt - 1, 0),
                     lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL,
                     updated_at = ?
                 WHERE id = ? AND state = 'running'",
                params![now, job.id],
            )?;
            append_scheduler_event_tx(
                tx,
                "scheduler.job.released_before_attempt",
                &job.id,
                &serde_json::json!({
                    "jobId": job.id,
                    "reason": "lease_expired_before_turn_promotion"
                }),
                now,
            )?;
        }
    }
    Ok(())
}

fn ready_candidates_tx(
    tx: &rusqlite::Transaction<'_>,
    now: i64,
    kinds: Option<&[crate::SchedulerJobKind]>,
    queues: Option<&[String]>,
) -> Result<Vec<String>> {
    if kinds.is_some_and(|values| values.is_empty())
        || queues.is_some_and(|values| values.is_empty())
    {
        return Ok(Vec::new());
    }
    let mut clauses = vec![
        "candidate.state IN ('pending', 'ready', 'retry_scheduled')".to_string(),
        "COALESCE(candidate.not_before, candidate.scheduled_at) <= ?".to_string(),
        "(candidate.concurrency_key IS NULL OR NOT EXISTS (
             SELECT 1 FROM scheduler_job active
             WHERE active.concurrency_key = candidate.concurrency_key
               AND active.id != candidate.id
               AND active.state = 'running'
         ))"
        .to_string(),
        "(candidate.kind != 'session.turn' OR NOT EXISTS (
             SELECT 1 FROM scheduler_job earlier
             WHERE earlier.concurrency_key = candidate.concurrency_key
               AND earlier.kind = 'session.turn'
               AND earlier.id != candidate.id
               AND earlier.state NOT IN ('succeeded', 'failed', 'cancelled')
               AND (
                 earlier.created_at < candidate.created_at
                 OR (earlier.created_at = candidate.created_at AND earlier.id < candidate.id)
               )
         ))"
        .to_string(),
    ];
    let mut values = vec![SqlValue::Integer(now)];
    if let Some(kinds) = kinds {
        clauses.push(format!(
            "candidate.kind IN ({})",
            std::iter::repeat_n("?", kinds.len())
                .collect::<Vec<_>>()
                .join(", ")
        ));
        values.extend(
            kinds
                .iter()
                .map(|kind| SqlValue::Text(kind.as_str().to_string())),
        );
    }
    if let Some(queues) = queues {
        clauses.push(format!(
            "candidate.queue IN ({})",
            std::iter::repeat_n("?", queues.len())
                .collect::<Vec<_>>()
                .join(", ")
        ));
        values.extend(queues.iter().cloned().map(SqlValue::Text));
    }
    let sql = format!(
        "SELECT candidate.id
         FROM scheduler_job candidate
         WHERE {}
         ORDER BY candidate.priority DESC, candidate.scheduled_at ASC, candidate.id ASC
         LIMIT 1",
        clauses.join(" AND ")
    );
    let mut stmt = tx.prepare(&sql)?;
    let rows = stmt.query_map(params_from_iter(values), |row| row.get::<_, String>(0))?;
    let Some(row) = rows.into_iter().next() else {
        return Ok(Vec::new());
    };
    Ok(vec![row?])
}

pub(crate) fn append_scheduler_event_tx(
    tx: &rusqlite::Transaction<'_>,
    event_type: &str,
    job_id: &str,
    payload: &serde_json::Value,
    occurred_at: i64,
) -> Result<()> {
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        event_type,
        &EventScope::default(),
        &serde_json::json!({
            "jobId": job_id,
            "scheduler": payload
        }),
        occurred_at,
    )
}

fn collect_jobs(
    rows: impl Iterator<Item = rusqlite::Result<SchedulerJobRecord>>,
) -> Result<Vec<SchedulerJobRecord>> {
    let mut jobs = Vec::new();
    for row in rows {
        jobs.push(row?);
    }
    Ok(jobs)
}

fn find_job_by_idempotency_tx(
    tx: &rusqlite::Transaction<'_>,
    idempotency_key: &str,
) -> Result<Option<SchedulerJobRecord>> {
    tx.query_row(
        &format!("{JOB_SELECT} WHERE idempotency_key = ?"),
        params![idempotency_key],
        row_to_scheduler_job,
    )
    .optional()
    .map_err(Into::into)
}

pub(crate) fn get_optional_job_tx(
    tx: &rusqlite::Transaction<'_>,
    job_id: &str,
) -> Result<Option<SchedulerJobRecord>> {
    tx.query_row(
        &format!("{JOB_SELECT} WHERE id = ?"),
        params![job_id],
        row_to_scheduler_job,
    )
    .optional()
    .map_err(Into::into)
}

pub(crate) fn get_job_tx(
    tx: &rusqlite::Transaction<'_>,
    job_id: &str,
) -> Result<SchedulerJobRecord> {
    get_optional_job_tx(tx, job_id)?
        .ok_or_else(|| SystemServiceError::Invariant(format!("scheduler job not found: {job_id}")))
}
