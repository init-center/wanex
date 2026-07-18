use crate::budget::commit_budget_grant_tx;
use crate::event_store::append_event_tx;
use crate::rows::row_to_scheduler_job;
use crate::{
    CancelJob, ClaimJob, CompleteJob, EnqueueJob, EventScope, FailJob, GetJob, HeartbeatJob,
    ListJobs, Result, RetryPolicy, RetryStrategy, SchedulerJobRecord, SystemService,
    SystemServiceError,
};
use rusqlite::{params, OptionalExtension};
use uuid::Uuid;

const JOB_SELECT: &str = "SELECT id, kind, state, principal_id, payload_json,
    scheduled_at, not_before, priority, attempt, max_attempts,
    retry_policy_json, idempotency_key, budget_grant_id,
    lease_owner, lease_token, lease_expires_at, result_json, last_error_json,
    created_at, updated_at, finished_at
    FROM scheduler_job";

impl SystemService {
    pub fn enqueue_job(&self, request: &EnqueueJob) -> Result<SchedulerJobRecord> {
        validate_enqueue(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = conn.transaction()?;
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
        let now = crate::util::now_ms();
        let lease_expires_at = now + request.lease_ms;
        let lease_token = format!("joblease_{}", Uuid::now_v7());
        let mut conn = self.connect()?;
        let tx = conn.transaction()?;
        reset_expired_leases_tx(&tx, now)?;

        let candidates = ready_candidates_tx(&tx, now, request.kinds.as_deref())?;
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
        append_scheduler_event_tx(
            &tx,
            "scheduler.job.claimed",
            &job_id,
            &serde_json::json!({
                "jobId": job_id,
                "workerId": request.worker_id,
                "leaseExpiresAt": lease_expires_at
            }),
            now,
        )?;
        let job = get_job_tx(&tx, &job_id)?;
        tx.commit()?;
        Ok(Some(job))
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
        let tx = conn.transaction()?;
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
        let tx = conn.transaction()?;
        let job = complete_job_tx(&tx, request, now)?;
        tx.commit()?;
        Ok(job)
    }

    pub fn fail_job(&self, request: &FailJob) -> Result<Option<SchedulerJobRecord>> {
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = conn.transaction()?;
        let updated = fail_job_tx(&tx, request, now)?;
        tx.commit()?;
        Ok(updated)
    }

    pub fn cancel_job(&self, request: &CancelJob) -> Result<Option<SchedulerJobRecord>> {
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = conn.transaction()?;
        let existing = get_optional_job_tx(&tx, &request.job_id)?;
        let Some(existing) = existing else {
            tx.commit()?;
            return Ok(None);
        };
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

    if let Some(idempotency_key) = &request.idempotency_key {
        if let Some(existing) = find_job_by_idempotency_tx(tx, idempotency_key)? {
            return Ok(existing);
        }
    }

    tx.execute(
        "INSERT INTO scheduler_job (
            id, kind, state, principal_id, payload_json,
            scheduled_at, not_before, priority, attempt, max_attempts,
            retry_policy_json, idempotency_key, budget_grant_id,
            lease_owner, lease_token, lease_expires_at, result_json, last_error_json,
            created_at, updated_at, finished_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?,
                   NULL, NULL, NULL, NULL, NULL, ?, ?, NULL)",
        params![
            id,
            request.kind.as_str(),
            state,
            request.principal_id,
            serde_json::to_string(&request.payload)?,
            scheduled_at,
            request.not_before,
            priority,
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
            "state": state
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
    let existing = get_optional_job_tx(tx, &request.job_id)?;
    let Some(existing) = existing else {
        return Ok(None);
    };
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
    get_optional_job_tx(tx, &request.job_id)
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
    tx.execute(
        "UPDATE scheduler_job
         SET state = 'ready',
             lease_owner = NULL,
             lease_token = NULL,
             lease_expires_at = NULL,
             updated_at = ?
         WHERE state = 'running' AND lease_expires_at <= ?",
        params![now, now],
    )?;
    Ok(())
}

fn ready_candidates_tx(
    tx: &rusqlite::Transaction<'_>,
    now: i64,
    kinds: Option<&[crate::SchedulerJobKind]>,
) -> Result<Vec<String>> {
    let mut candidates = Vec::new();
    if let Some(kinds) = kinds {
        for kind in kinds {
            let mut stmt = tx.prepare(
                "SELECT id FROM scheduler_job
                 WHERE state IN ('pending', 'ready', 'retry_scheduled')
                   AND COALESCE(not_before, scheduled_at) <= ?
                   AND kind = ?
                 ORDER BY priority DESC, scheduled_at ASC, id ASC
                 LIMIT 1",
            )?;
            let rows = stmt.query_map(params![now, kind.as_str()], |row| row.get(0))?;
            for row in rows {
                candidates.push(row?);
            }
        }
        candidates.sort();
        candidates.truncate(1);
        return Ok(candidates);
    }

    let mut stmt = tx.prepare(
        "SELECT id FROM scheduler_job
         WHERE state IN ('pending', 'ready', 'retry_scheduled')
           AND COALESCE(not_before, scheduled_at) <= ?
         ORDER BY priority DESC, scheduled_at ASC, id ASC
         LIMIT 1",
    )?;
    let rows = stmt.query_map(params![now], |row| row.get(0))?;
    for row in rows {
        candidates.push(row?);
    }
    Ok(candidates)
}

fn append_scheduler_event_tx(
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

fn get_optional_job_tx(
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

fn get_job_tx(tx: &rusqlite::Transaction<'_>, job_id: &str) -> Result<SchedulerJobRecord> {
    get_optional_job_tx(tx, job_id)?
        .ok_or_else(|| SystemServiceError::Invariant(format!("scheduler job not found: {job_id}")))
}
