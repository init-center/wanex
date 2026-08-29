use crate::budget::{objective_budget_has_remaining_tx, reserve_remaining_objective_budget_tx};
use crate::event_store::append_event_tx;
use crate::rows::{
    row_to_objective, row_to_objective_attempt, row_to_objective_attempt_review,
    row_to_objective_verification,
};
use crate::sessions::{session_has_unfinished_work_tx, submit_session_turn_tx};
use crate::turns::{is_terminal_turn_state, request_session_turn_cancel_tx};
use crate::{
    AdmitObjectiveAttempt, AdmitObjectiveAttemptReceipt, ChangeObjectiveState, CreateObjective,
    EventScope, ListObjectiveAttemptReviews, ListObjectiveAttempts, ListObjectiveVerifications,
    ListObjectives, ObjectiveAttemptRecord, ObjectiveAttemptReviewRecord, ObjectiveRecord,
    ObjectiveStopPolicy, ObjectiveSuccessCriterion, ObjectiveVerificationPolicy,
    ObjectiveVerificationRecord, ObjectiveVerificationSubmission, ReconcileObjectiveCancellation,
    RequestObjectiveCancel, RequestObjectiveCancelReceipt, RequestSessionTurnCancel, Result,
    ReviewObjectiveAttempt, ReviewObjectiveAttemptReceipt, SubmitSessionTurnReceipt, SystemService,
    SystemServiceError,
};
use rusqlite::{params, params_from_iter, OptionalExtension, ToSql};
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

const OBJECTIVE_SELECT: &str =
    "SELECT id, session_id, principal_id, objective, boundaries_json, constraints_json,
            success_criteria_json, verification_policy_json, stop_policy_json,
            revision, state, reason_code, reason_detail, active_attempt_id,
            created_at, updated_at, closed_at
     FROM objective";

const OBJECTIVE_ATTEMPT_SELECT: &str =
    "SELECT id, objective_id, attempt_number, input_id, turn_id, job_id,
            execution_binding_digest, trigger, budget_grant_id, idempotency_key, bound_at
     FROM objective_attempt";

const OBJECTIVE_REVIEW_SELECT: &str =
    "SELECT id, objective_id, attempt_id, disposition, reason, created_at
     FROM objective_attempt_review";

const OBJECTIVE_VERIFICATION_SELECT: &str =
    "SELECT id, objective_id, attempt_id, requirement_id, verifier_kind,
            verifier_ref, result, reason, evidence_json, created_at
     FROM objective_verification";

const TERMINAL_OBJECTIVE_STATES: &[&str] = &["limit_reached", "succeeded", "failed", "cancelled"];
const LIVE_OBJECTIVE_STATES: &[&str] = &["active", "paused", "blocked", "cancel_requested"];
const MAX_OBJECTIVE_ATTEMPTS: i64 = 1_000;
const MAX_BLOCKED_ATTEMPTS: i64 = 100;
const MAX_OBJECTIVE_ITEMS: usize = 128;
const MAX_OBJECTIVE_TEXT_BYTES: usize = 64 * 1024;
const MAX_REASON_BYTES: usize = 4 * 1024;

#[derive(Debug)]
struct ParsedCreateObjective {
    boundaries: Vec<String>,
    constraints: Vec<String>,
    success_criteria: Vec<ObjectiveSuccessCriterion>,
    verification_policy: ObjectiveVerificationPolicy,
    stop_policy: ObjectiveStopPolicy,
}

#[derive(Debug)]
struct StateCommandRecord {
    objective_id: String,
    command: String,
    request_digest: String,
}

impl SystemService {
    pub fn create_objective(&self, request: &CreateObjective) -> Result<ObjectiveRecord> {
        let now = crate::util::now_ms();
        let parsed = validate_create_objective(request, now)?;
        let request_digest = digest_request(request)?;
        let id = request
            .id
            .clone()
            .unwrap_or_else(|| format!("objective_{}", Uuid::now_v7()));
        let mut conn = self.connect()?;
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;

        if let Some(existing) = find_objective_by_create_key_tx(&tx, &request.idempotency_key)? {
            let stored_digest: String = tx.query_row(
                "SELECT create_request_digest FROM objective WHERE id = ?",
                params![existing.id],
                |row| row.get(0),
            )?;
            require_matching_digest(&stored_digest, &request_digest, "objective create")?;
            tx.commit()?;
            return Ok(existing);
        }

        let session_status: Option<String> = tx
            .query_row(
                "SELECT status FROM session WHERE id = ?",
                params![request.session_id],
                |row| row.get(0),
            )
            .optional()?;
        match session_status.as_deref() {
            Some("active") => {}
            Some(_) => {
                return Err(SystemServiceError::Conflict(format!(
                    "objective session is archived: {}",
                    request.session_id
                )))
            }
            None => {
                return Err(SystemServiceError::Invariant(format!(
                    "objective session does not exist: {}",
                    request.session_id
                )))
            }
        }

        tx.execute(
            "INSERT INTO objective (
                id, session_id, principal_id, objective, boundaries_json,
                constraints_json, success_criteria_json, verification_policy_json,
                stop_policy_json, revision, state, reason_code, reason_detail,
                active_attempt_id, create_request_digest, create_idempotency_key,
                created_at, updated_at, closed_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'active', 'created', NULL,
                       NULL, ?, ?, ?, ?, NULL)",
            params![
                id,
                request.session_id,
                request.principal_id,
                request.objective,
                serde_json::to_string(&parsed.boundaries)?,
                serde_json::to_string(&parsed.constraints)?,
                serde_json::to_string(&parsed.success_criteria)?,
                serde_json::to_string(&parsed.verification_policy)?,
                serde_json::to_string(&parsed.stop_policy)?,
                request_digest,
                request.idempotency_key,
                now,
                now,
            ],
        )
        .map_err(map_live_objective_conflict)?;
        append_event_tx(
            &tx,
            &format!("evt_{}", Uuid::now_v7()),
            "objective.created",
            &EventScope {
                session_id: Some(request.session_id.clone()),
                objective_id: Some(id.clone()),
                ..EventScope::default()
            },
            &serde_json::json!({
                "objectiveId": id,
                "sessionId": request.session_id,
                "revision": 1,
                "state": "active",
                "createdAt": now
            }),
            now,
        )?;
        let record = get_objective_tx(&tx, &id)?;
        tx.commit()?;
        Ok(record)
    }

    pub fn get_objective(&self, objective_id: &str) -> Result<Option<ObjectiveRecord>> {
        validate_non_empty(objective_id, "objective_id")?;
        let conn = self.connect()?;
        get_optional_objective_conn(&conn, objective_id)
    }

    pub fn list_objectives(&self, request: &ListObjectives) -> Result<Vec<ObjectiveRecord>> {
        validate_list_objectives(request)?;
        let mut sql = format!("{OBJECTIVE_SELECT} WHERE 1 = 1");
        let mut values: Vec<Box<dyn ToSql>> = Vec::new();
        if let Some(session_id) = &request.session_id {
            sql.push_str(" AND session_id = ?");
            values.push(Box::new(session_id.clone()));
        }
        if let Some(principal_id) = &request.principal_id {
            sql.push_str(" AND principal_id = ?");
            values.push(Box::new(principal_id.clone()));
        }
        if let Some(states) = &request.states {
            sql.push_str(" AND state IN (");
            sql.push_str(&vec!["?"; states.len()].join(","));
            sql.push(')');
            values.extend(
                states
                    .iter()
                    .cloned()
                    .map(|state| Box::new(state) as Box<dyn ToSql>),
            );
        }
        sql.push_str(" ORDER BY updated_at DESC, id ASC LIMIT ?");
        values.push(Box::new(request.limit.unwrap_or(100).clamp(1, 1_000)));
        let conn = self.connect()?;
        let mut stmt = conn.prepare(&sql)?;
        let objectives = collect_objectives(stmt.query_map(
            params_from_iter(values.iter().map(|value| value.as_ref())),
            row_to_objective,
        )?)?;
        Ok(objectives)
    }

    pub fn pause_objective(&self, request: &ChangeObjectiveState) -> Result<ObjectiveRecord> {
        self.change_objective_state(request, "pause")
    }

    pub fn resume_objective(&self, request: &ChangeObjectiveState) -> Result<ObjectiveRecord> {
        self.change_objective_state(request, "resume")
    }

    fn change_objective_state(
        &self,
        request: &ChangeObjectiveState,
        command: &str,
    ) -> Result<ObjectiveRecord> {
        validate_change_objective_state(request)?;
        let request_digest = digest_request(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;
        if let Some(existing) = find_state_command_tx(&tx, &request.idempotency_key)? {
            validate_state_command(&existing, &request.objective_id, command, &request_digest)?;
            let objective = get_objective_tx(&tx, &request.objective_id)?;
            tx.commit()?;
            return Ok(objective);
        }
        let objective = get_objective_tx(&tx, &request.objective_id)?;
        require_objective_revision(&objective, request.expected_revision)?;
        let (to_state, reason_code) = match (command, objective.state.as_str()) {
            ("pause", "active" | "blocked") => ("paused", "user_paused"),
            ("resume", "paused" | "blocked") => ("active", "user_resumed"),
            _ => {
                return Err(SystemServiceError::Conflict(format!(
                    "objective cannot {command} from state {}",
                    objective.state
                )))
            }
        };
        let updated = update_objective_tx(
            &tx,
            &objective,
            to_state,
            reason_code,
            request.reason.as_deref(),
            objective.active_attempt_id.as_deref(),
            false,
            now,
        )?;
        record_state_command_tx(
            &tx,
            &request.idempotency_key,
            &objective,
            &updated,
            command,
            &request_digest,
            now,
        )?;
        append_objective_state_event_tx(&tx, &objective, &updated, command, now)?;
        tx.commit()?;
        Ok(updated)
    }

    pub fn admit_objective_attempt(
        &self,
        request: &AdmitObjectiveAttempt,
    ) -> Result<AdmitObjectiveAttemptReceipt> {
        validate_admit_objective_attempt(request)?;
        let request_digest = digest_request(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;

        if let Some(existing) = find_objective_attempt_by_key_tx(&tx, &request.idempotency_key)? {
            validate_existing_attempt_tx(&tx, &existing, request, &request_digest)?;
            // The first admission may reserve a budget grant and inject it into
            // the durable Turn. Reconstruct that admission-owned field before
            // replaying the exact Session Turn request.
            let mut turn = request.turn.clone();
            if turn.budget_grant_id.is_none() {
                turn.budget_grant_id = existing.budget_grant_id.clone();
            }
            let submission = submit_session_turn_tx(&tx, &turn, now)?;
            validate_attempt_submission(&existing, &submission)?;
            let objective = get_objective_tx(&tx, &request.objective_id)?;
            tx.commit()?;
            return Ok(AdmitObjectiveAttemptReceipt::Admitted {
                objective: Box::new(objective),
                attempt: existing,
                submission: Box::new(submission),
            });
        }
        if let Some(existing) = find_state_command_tx(&tx, &request.idempotency_key)? {
            validate_state_command(
                &existing,
                &request.objective_id,
                "admit_limit",
                &request_digest,
            )?;
            let objective = get_objective_tx(&tx, &request.objective_id)?;
            tx.commit()?;
            return Ok(AdmitObjectiveAttemptReceipt::LimitReached { objective });
        }

        let objective = get_objective_tx(&tx, &request.objective_id)?;
        require_objective_revision(&objective, request.expected_revision)?;
        if objective.state != "active" {
            return Err(SystemServiceError::Conflict(format!(
                "objective is not eligible for admission: {}",
                objective.state
            )));
        }
        if objective.active_attempt_id.is_some() {
            return Err(SystemServiceError::Conflict(
                "objective already has an active attempt".to_string(),
            ));
        }
        validate_objective_turn(&objective, request)?;
        if session_has_unfinished_work_tx(&tx, &objective.session_id)? {
            return Err(SystemServiceError::Conflict(format!(
                "objective session has unfinished work: {}",
                objective.session_id
            )));
        }
        let attempt_number = count_objective_attempts_tx(&tx, &objective.id)? + 1;
        validate_attempt_trigger(request.trigger.as_str(), attempt_number)?;
        if let Some(reason_code) = objective_limit_reason_tx(&tx, &objective, attempt_number, now)?
        {
            let updated = update_objective_tx(
                &tx,
                &objective,
                "limit_reached",
                reason_code,
                None,
                None,
                true,
                now,
            )?;
            record_state_command_tx(
                &tx,
                &request.idempotency_key,
                &objective,
                &updated,
                "admit_limit",
                &request_digest,
                now,
            )?;
            append_objective_state_event_tx(&tx, &objective, &updated, "admit_limit", now)?;
            tx.commit()?;
            return Ok(AdmitObjectiveAttemptReceipt::LimitReached { objective: updated });
        }

        let budget_grant = match &objective.stop_policy.budget {
            Some(limit) => reserve_remaining_objective_budget_tx(
                &tx,
                &objective.id,
                &objective.principal_id,
                limit,
                &format!("objective:{}:{}", objective.id, request.idempotency_key),
                objective.stop_policy.deadline_at,
                now,
            )?,
            None => None,
        };
        if objective.stop_policy.budget.is_some() && budget_grant.is_none() {
            let updated = update_objective_tx(
                &tx,
                &objective,
                "limit_reached",
                "budget",
                None,
                None,
                true,
                now,
            )?;
            record_state_command_tx(
                &tx,
                &request.idempotency_key,
                &objective,
                &updated,
                "admit_limit",
                &request_digest,
                now,
            )?;
            append_objective_state_event_tx(&tx, &objective, &updated, "admit_limit", now)?;
            tx.commit()?;
            return Ok(AdmitObjectiveAttemptReceipt::LimitReached { objective: updated });
        }

        let mut turn = request.turn.clone();
        turn.budget_grant_id = budget_grant.as_ref().map(|grant| grant.id.clone());
        let submission = submit_session_turn_tx(&tx, &turn, now)?;
        let attempt_id = format!("objectiveatt_{}", Uuid::now_v7());
        tx.execute(
            "INSERT INTO objective_attempt (
                id, objective_id, attempt_number, input_id, turn_id, job_id,
                execution_binding_digest, trigger, budget_grant_id, request_digest,
                idempotency_key, bound_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                attempt_id,
                objective.id,
                attempt_number,
                submission.admission.input_id,
                submission.turn.id,
                submission.job.id,
                submission.turn.execution_binding_digest,
                request.trigger,
                budget_grant.as_ref().map(|grant| grant.id.as_str()),
                request_digest,
                request.idempotency_key,
                now,
            ],
        )?;
        let changed = tx.execute(
            "UPDATE objective
             SET active_attempt_id = ?, revision = revision + 1, updated_at = ?
             WHERE id = ? AND revision = ? AND state = 'active'
               AND active_attempt_id IS NULL",
            params![attempt_id, now, objective.id, objective.revision],
        )?;
        if changed != 1 {
            return Err(objective_revision_conflict(
                &objective.id,
                objective.revision,
            ));
        }
        let attempt = get_objective_attempt_tx(&tx, &attempt_id)?;
        let updated = get_objective_tx(&tx, &objective.id)?;
        append_event_tx(
            &tx,
            &format!("evt_{}", Uuid::now_v7()),
            "objective.attempt.admitted",
            &EventScope {
                session_id: Some(updated.session_id.clone()),
                turn_id: Some(attempt.turn_id.clone()),
                input_id: Some(attempt.input_id.clone()),
                objective_id: Some(updated.id.clone()),
                ..EventScope::default()
            },
            &serde_json::json!({
                "objectiveId": updated.id,
                "attemptId": attempt.id,
                "attemptNumber": attempt.attempt_number,
                "inputId": attempt.input_id,
                "turnId": attempt.turn_id,
                "jobId": attempt.job_id,
                "revision": updated.revision,
                "boundAt": now
            }),
            now,
        )?;
        tx.commit()?;
        Ok(AdmitObjectiveAttemptReceipt::Admitted {
            objective: Box::new(updated),
            attempt,
            submission: Box::new(submission),
        })
    }

    pub fn review_objective_attempt(
        &self,
        request: &ReviewObjectiveAttempt,
    ) -> Result<ReviewObjectiveAttemptReceipt> {
        validate_review_objective_attempt(request)?;
        let submissions: Vec<ObjectiveVerificationSubmission> =
            serde_json::from_value(request.verifications.clone()).map_err(|error| {
                SystemServiceError::Invariant(format!(
                    "objective verifications are invalid: {error}"
                ))
            })?;
        let request_digest = digest_request(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;
        if let Some(existing) = find_objective_review_by_key_tx(&tx, &request.idempotency_key)? {
            validate_existing_review_tx(&tx, &existing, request, &request_digest)?;
            let objective = get_objective_tx(&tx, &request.objective_id)?;
            let attempt = get_objective_attempt_tx(&tx, &request.attempt_id)?;
            let verifications = list_objective_verifications_tx(&tx, &existing.id)?;
            tx.commit()?;
            return Ok(ReviewObjectiveAttemptReceipt {
                objective,
                attempt,
                review: existing,
                verifications,
            });
        }
        let objective = get_objective_tx(&tx, &request.objective_id)?;
        require_objective_revision(&objective, request.expected_revision)?;
        if !matches!(objective.state.as_str(), "active" | "paused") {
            return Err(SystemServiceError::Conflict(format!(
                "objective attempt cannot be reviewed in state {}",
                objective.state
            )));
        }
        if objective.active_attempt_id.as_deref() != Some(request.attempt_id.as_str()) {
            return Err(SystemServiceError::Conflict(
                "objective review does not target the active attempt".to_string(),
            ));
        }
        let attempt = get_objective_attempt_tx(&tx, &request.attempt_id)?;
        if attempt.objective_id != objective.id {
            return Err(SystemServiceError::Invariant(
                "objective attempt belongs to a different objective".to_string(),
            ));
        }
        require_terminal_attempt_turn_tx(&tx, &attempt)?;
        validate_verification_submissions(&objective, &submissions, &request.disposition)?;
        let review_id = request
            .id
            .clone()
            .unwrap_or_else(|| format!("objectivereview_{}", Uuid::now_v7()));
        tx.execute(
            "INSERT INTO objective_attempt_review (
                id, objective_id, attempt_id, disposition, reason,
                request_digest, idempotency_key, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                review_id,
                objective.id,
                attempt.id,
                request.disposition,
                request.reason,
                request_digest,
                request.idempotency_key,
                now,
            ],
        )?;
        let verifications =
            insert_verifications_tx(&tx, &objective, &attempt, &review_id, &submissions, now)?;
        let (to_state, reason_code, close) = review_next_state_tx(
            &tx,
            &objective,
            &request.disposition,
            attempt.attempt_number,
            now,
        )?;
        let updated = update_objective_tx(
            &tx,
            &objective,
            to_state,
            reason_code,
            request.reason.as_deref(),
            None,
            close,
            now,
        )?;
        let review = get_objective_review_tx(&tx, &review_id)?;
        append_event_tx(
            &tx,
            &format!("evt_{}", Uuid::now_v7()),
            "objective.attempt.reviewed",
            &EventScope {
                session_id: Some(objective.session_id.clone()),
                turn_id: Some(attempt.turn_id.clone()),
                input_id: Some(attempt.input_id.clone()),
                objective_id: Some(objective.id.clone()),
                ..EventScope::default()
            },
            &serde_json::json!({
                "objectiveId": objective.id,
                "attemptId": attempt.id,
                "reviewId": review.id,
                "disposition": review.disposition,
                "revision": updated.revision,
                "state": updated.state,
                "reviewedAt": now
            }),
            now,
        )?;
        append_objective_state_event_tx(&tx, &objective, &updated, "attempt_review", now)?;
        tx.commit()?;
        Ok(ReviewObjectiveAttemptReceipt {
            objective: updated,
            attempt,
            review,
            verifications,
        })
    }

    pub fn request_objective_cancel(
        &self,
        request: &RequestObjectiveCancel,
    ) -> Result<RequestObjectiveCancelReceipt> {
        validate_request_objective_cancel(request)?;
        let request_digest = digest_request(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;
        if let Some(existing) = find_state_command_tx(&tx, &request.idempotency_key)? {
            validate_state_command(&existing, &request.objective_id, "cancel", &request_digest)?;
            let objective = get_objective_tx(&tx, &request.objective_id)?;
            tx.commit()?;
            return Ok(RequestObjectiveCancelReceipt {
                objective,
                turn_cancellation: None,
            });
        }
        let objective = get_objective_tx(&tx, &request.objective_id)?;
        require_objective_revision(&objective, request.expected_revision)?;
        if is_terminal_objective_state(&objective.state) {
            return Err(SystemServiceError::Conflict(format!(
                "objective is already terminal: {}",
                objective.state
            )));
        }
        if objective.state == "cancel_requested" {
            return Err(SystemServiceError::Conflict(
                "objective cancellation is already requested".to_string(),
            ));
        }
        let (to_state, active_attempt_id, close, turn_cancellation) =
            match objective.active_attempt_id.as_deref() {
                None => ("cancelled", None, true, None),
                Some(attempt_id) => {
                    let attempt = get_objective_attempt_tx(&tx, attempt_id)?;
                    let receipt = request_session_turn_cancel_tx(
                        &tx,
                        &RequestSessionTurnCancel {
                            session_id: objective.session_id.clone(),
                            turn_id: attempt.turn_id.clone(),
                            input_id: attempt.input_id.clone(),
                            job_id: attempt.job_id.clone(),
                            reason: request.reason.clone(),
                        },
                        now,
                    )?;
                    if matches!(receipt.status.as_str(), "cancelled" | "already_terminal") {
                        ("cancelled", None, true, Some(receipt))
                    } else if receipt.status == "cancel_requested" {
                        ("cancel_requested", Some(attempt_id), false, Some(receipt))
                    } else {
                        return Err(SystemServiceError::Invariant(
                            "objective active attempt cancellation target is missing".to_string(),
                        ));
                    }
                }
            };
        let updated = update_objective_tx(
            &tx,
            &objective,
            to_state,
            if to_state == "cancelled" {
                "cancelled"
            } else {
                "cancel_requested"
            },
            Some(&request.reason),
            active_attempt_id,
            close,
            now,
        )?;
        record_state_command_tx(
            &tx,
            &request.idempotency_key,
            &objective,
            &updated,
            "cancel",
            &request_digest,
            now,
        )?;
        append_objective_state_event_tx(&tx, &objective, &updated, "cancel", now)?;
        tx.commit()?;
        Ok(RequestObjectiveCancelReceipt {
            objective: updated,
            turn_cancellation,
        })
    }

    pub fn reconcile_objective_cancellation(
        &self,
        request: &ReconcileObjectiveCancellation,
    ) -> Result<ObjectiveRecord> {
        validate_reconcile_objective_cancellation(request)?;
        let request_digest = digest_request(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;
        if let Some(existing) = find_state_command_tx(&tx, &request.idempotency_key)? {
            validate_state_command(
                &existing,
                &request.objective_id,
                "cancel_reconcile",
                &request_digest,
            )?;
            let objective = get_objective_tx(&tx, &request.objective_id)?;
            tx.commit()?;
            return Ok(objective);
        }
        let objective = get_objective_tx(&tx, &request.objective_id)?;
        require_objective_revision(&objective, request.expected_revision)?;
        if objective.state != "cancel_requested"
            || objective.active_attempt_id.as_deref() != Some(request.attempt_id.as_str())
        {
            return Err(SystemServiceError::Conflict(
                "objective cancellation reconciliation target changed".to_string(),
            ));
        }
        let attempt = get_objective_attempt_tx(&tx, &request.attempt_id)?;
        require_terminal_attempt_turn_tx(&tx, &attempt)?;
        let updated = update_objective_tx(
            &tx,
            &objective,
            "cancelled",
            "cancelled",
            objective.reason.detail.as_deref(),
            None,
            true,
            now,
        )?;
        record_state_command_tx(
            &tx,
            &request.idempotency_key,
            &objective,
            &updated,
            "cancel_reconcile",
            &request_digest,
            now,
        )?;
        append_objective_state_event_tx(&tx, &objective, &updated, "cancel_reconcile", now)?;
        tx.commit()?;
        Ok(updated)
    }

    pub fn list_objective_attempts(
        &self,
        request: &ListObjectiveAttempts,
    ) -> Result<Vec<ObjectiveAttemptRecord>> {
        validate_non_empty(&request.objective_id, "objective attempt objective_id")?;
        let conn = self.connect()?;
        let mut stmt = conn.prepare(&format!(
            "{OBJECTIVE_ATTEMPT_SELECT}
             WHERE objective_id = ? ORDER BY attempt_number ASC, id ASC LIMIT ?"
        ))?;
        let attempts = collect_attempts(stmt.query_map(
            params![
                request.objective_id,
                request.limit.unwrap_or(100).clamp(1, 1_000)
            ],
            row_to_objective_attempt,
        )?)?;
        Ok(attempts)
    }

    pub fn list_objective_attempt_reviews(
        &self,
        request: &ListObjectiveAttemptReviews,
    ) -> Result<Vec<ObjectiveAttemptReviewRecord>> {
        validate_non_empty(&request.objective_id, "objective review objective_id")?;
        let mut sql = format!("{OBJECTIVE_REVIEW_SELECT} WHERE objective_id = ?");
        let mut values: Vec<Box<dyn ToSql>> = vec![Box::new(request.objective_id.clone())];
        if let Some(attempt_id) = &request.attempt_id {
            sql.push_str(" AND attempt_id = ?");
            values.push(Box::new(attempt_id.clone()));
        }
        sql.push_str(" ORDER BY created_at ASC, id ASC LIMIT ?");
        values.push(Box::new(request.limit.unwrap_or(100).clamp(1, 1_000)));
        let conn = self.connect()?;
        let mut stmt = conn.prepare(&sql)?;
        let reviews = collect_reviews(stmt.query_map(
            params_from_iter(values.iter().map(|value| value.as_ref())),
            row_to_objective_attempt_review,
        )?)?;
        Ok(reviews)
    }

    pub fn list_objective_verifications(
        &self,
        request: &ListObjectiveVerifications,
    ) -> Result<Vec<ObjectiveVerificationRecord>> {
        validate_non_empty(&request.objective_id, "objective verification objective_id")?;
        if let Some(result) = &request.result {
            validate_verification_result(result)?;
        }
        let mut sql = format!("{OBJECTIVE_VERIFICATION_SELECT} WHERE objective_id = ?");
        let mut values: Vec<Box<dyn ToSql>> = vec![Box::new(request.objective_id.clone())];
        if let Some(attempt_id) = &request.attempt_id {
            sql.push_str(" AND attempt_id = ?");
            values.push(Box::new(attempt_id.clone()));
        }
        if let Some(requirement_id) = &request.requirement_id {
            sql.push_str(" AND requirement_id = ?");
            values.push(Box::new(requirement_id.clone()));
        }
        if let Some(result) = &request.result {
            sql.push_str(" AND result = ?");
            values.push(Box::new(result.clone()));
        }
        sql.push_str(" ORDER BY created_at ASC, id ASC LIMIT ?");
        values.push(Box::new(request.limit.unwrap_or(100).clamp(1, 1_000)));
        let conn = self.connect()?;
        let mut stmt = conn.prepare(&sql)?;
        let verifications = collect_verifications(stmt.query_map(
            params_from_iter(values.iter().map(|value| value.as_ref())),
            row_to_objective_verification,
        )?)?;
        Ok(verifications)
    }
}

fn validate_create_objective(request: &CreateObjective, now: i64) -> Result<ParsedCreateObjective> {
    validate_optional_non_empty(request.id.as_deref(), "objective id")?;
    validate_non_empty(&request.session_id, "objective session_id")?;
    validate_non_empty(&request.principal_id, "objective principal_id")?;
    validate_bounded_text(
        &request.objective,
        "objective text",
        MAX_OBJECTIVE_TEXT_BYTES,
    )?;
    validate_non_empty(&request.idempotency_key, "objective idempotency_key")?;
    let boundaries: Vec<String> = parse_json_value(&request.boundaries, "objective boundaries")?;
    let constraints: Vec<String> = parse_json_value(&request.constraints, "objective constraints")?;
    let success_criteria: Vec<ObjectiveSuccessCriterion> =
        parse_json_value(&request.success_criteria, "objective success_criteria")?;
    let verification_policy: ObjectiveVerificationPolicy = parse_json_value(
        &request.verification_policy,
        "objective verification_policy",
    )?;
    let stop_policy: ObjectiveStopPolicy =
        parse_json_value(&request.stop_policy, "objective stop_policy")?;
    validate_string_list(&boundaries, "objective boundaries")?;
    validate_string_list(&constraints, "objective constraints")?;
    validate_objective_success_contract(&success_criteria, &verification_policy)?;
    validate_objective_stop_policy(&stop_policy, now)?;
    Ok(ParsedCreateObjective {
        boundaries,
        constraints,
        success_criteria,
        verification_policy,
        stop_policy,
    })
}

fn validate_objective_success_contract(
    criteria: &[ObjectiveSuccessCriterion],
    policy: &ObjectiveVerificationPolicy,
) -> Result<()> {
    if criteria.is_empty() || criteria.len() > MAX_OBJECTIVE_ITEMS {
        return Err(SystemServiceError::Invariant(
            "objective must have a bounded non-empty success criteria list".to_string(),
        ));
    }
    if policy.requirements.is_empty() || policy.requirements.len() > MAX_OBJECTIVE_ITEMS {
        return Err(SystemServiceError::Invariant(
            "objective must have a bounded non-empty verification policy".to_string(),
        ));
    }
    let mut criterion_ids = HashSet::new();
    for criterion in criteria {
        validate_non_empty(&criterion.id, "objective criterion id")?;
        validate_bounded_text(
            &criterion.description,
            "objective criterion description",
            MAX_REASON_BYTES,
        )?;
        if !criterion_ids.insert(criterion.id.as_str()) {
            return Err(SystemServiceError::Invariant(
                "objective success criterion ids must be unique".to_string(),
            ));
        }
    }
    let mut requirement_ids = HashSet::new();
    let mut covered = HashSet::new();
    for requirement in &policy.requirements {
        validate_non_empty(&requirement.id, "objective verification requirement id")?;
        validate_non_empty(&requirement.verifier_ref, "objective verifier_ref")?;
        validate_verifier_kind(&requirement.verifier_kind)?;
        if !requirement_ids.insert(requirement.id.as_str()) {
            return Err(SystemServiceError::Invariant(
                "objective verification requirement ids must be unique".to_string(),
            ));
        }
        if requirement.criterion_ids.is_empty() {
            return Err(SystemServiceError::Invariant(
                "objective verification requirement must cover a criterion".to_string(),
            ));
        }
        let mut local = HashSet::new();
        for criterion_id in &requirement.criterion_ids {
            if !criterion_ids.contains(criterion_id.as_str()) {
                return Err(SystemServiceError::Invariant(format!(
                    "objective verification references unknown criterion: {criterion_id}"
                )));
            }
            if !local.insert(criterion_id.as_str()) {
                return Err(SystemServiceError::Invariant(
                    "objective verification criterion ids must be unique".to_string(),
                ));
            }
            covered.insert(criterion_id.as_str());
        }
    }
    if covered.len() != criterion_ids.len() {
        return Err(SystemServiceError::Invariant(
            "every objective success criterion must be verified".to_string(),
        ));
    }
    Ok(())
}

fn validate_objective_stop_policy(policy: &ObjectiveStopPolicy, now: i64) -> Result<()> {
    if !(1..=MAX_OBJECTIVE_ATTEMPTS).contains(&policy.max_attempts) {
        return Err(SystemServiceError::Invariant(format!(
            "objective max_attempts must be between 1 and {MAX_OBJECTIVE_ATTEMPTS}"
        )));
    }
    if !(1..=MAX_BLOCKED_ATTEMPTS).contains(&policy.max_consecutive_blocked_attempts) {
        return Err(SystemServiceError::Invariant(format!(
            "objective max_consecutive_blocked_attempts must be between 1 and {MAX_BLOCKED_ATTEMPTS}"
        )));
    }
    if policy.deadline_at.is_some_and(|deadline| deadline <= now) {
        return Err(SystemServiceError::Invariant(
            "objective deadline_at must be in the future".to_string(),
        ));
    }
    if let Some(budget) = &policy.budget {
        let values = [
            budget.tokens,
            budget.cost_micros,
            budget.wall_time_ms,
            budget.tool_calls,
        ];
        if values.iter().flatten().any(|value| *value < 0)
            || !values.iter().flatten().any(|value| *value > 0)
        {
            return Err(SystemServiceError::Invariant(
                "objective budget must contain at least one positive dimension".to_string(),
            ));
        }
    }
    Ok(())
}

fn validate_list_objectives(request: &ListObjectives) -> Result<()> {
    validate_optional_non_empty(request.session_id.as_deref(), "objective list session_id")?;
    validate_optional_non_empty(
        request.principal_id.as_deref(),
        "objective list principal_id",
    )?;
    if let Some(states) = &request.states {
        if states.is_empty()
            || states.len() > LIVE_OBJECTIVE_STATES.len() + TERMINAL_OBJECTIVE_STATES.len()
        {
            return Err(SystemServiceError::Invariant(
                "objective list states must be bounded and non-empty".to_string(),
            ));
        }
        let mut unique = HashSet::new();
        for state in states {
            validate_objective_state(state)?;
            if !unique.insert(state) {
                return Err(SystemServiceError::Invariant(
                    "objective list states must be unique".to_string(),
                ));
            }
        }
    }
    Ok(())
}

fn validate_change_objective_state(request: &ChangeObjectiveState) -> Result<()> {
    validate_non_empty(&request.objective_id, "objective state objective_id")?;
    validate_non_empty(&request.idempotency_key, "objective state idempotency_key")?;
    validate_optional_bounded_text(request.reason.as_deref(), "objective state reason")
}

fn validate_admit_objective_attempt(request: &AdmitObjectiveAttempt) -> Result<()> {
    validate_non_empty(&request.objective_id, "objective admission objective_id")?;
    validate_non_empty(
        &request.idempotency_key,
        "objective admission idempotency_key",
    )?;
    validate_attempt_trigger_kind(&request.trigger)?;
    if request.turn.budget_grant_id.is_some() {
        return Err(SystemServiceError::Invariant(
            "objective admission owns budget grant selection".to_string(),
        ));
    }
    Ok(())
}

fn validate_objective_turn(
    objective: &ObjectiveRecord,
    request: &AdmitObjectiveAttempt,
) -> Result<()> {
    let turn = &request.turn;
    if turn.session_id != objective.session_id {
        return Err(SystemServiceError::Invariant(
            "objective attempt must target its bound session".to_string(),
        ));
    }
    if turn.principal_id != objective.principal_id {
        return Err(SystemServiceError::Invariant(
            "objective attempt principal must match the objective".to_string(),
        ));
    }
    let origin = turn.origin.as_ref().and_then(serde_json::Value::as_object);
    if origin
        .and_then(|value| value.get("kind"))
        .and_then(|value| value.as_str())
        != Some("objective")
        || origin
            .and_then(|value| value.get("sourceRef"))
            .and_then(|value| value.as_str())
            != Some(objective.id.as_str())
        || origin.is_some_and(|value| value.len() != 2)
    {
        return Err(SystemServiceError::Invariant(
            "objective attempt requires an exact Objective origin".to_string(),
        ));
    }
    if turn
        .input_type
        .as_deref()
        .is_some_and(|value| value != "user")
        || turn
            .intent
            .as_deref()
            .is_some_and(|value| value != "normal")
        || turn.run_control_policy.is_some()
        || turn.expected_turn_id.is_some()
        || turn.regenerates_turn_id.is_some()
        || turn.scheduled_at.is_some()
        || turn.not_before.is_some()
    {
        return Err(SystemServiceError::Invariant(
            "objective attempt must be a fresh immediate normal turn".to_string(),
        ));
    }
    Ok(())
}

fn validate_review_objective_attempt(request: &ReviewObjectiveAttempt) -> Result<()> {
    validate_optional_non_empty(request.id.as_deref(), "objective review id")?;
    validate_non_empty(&request.objective_id, "objective review objective_id")?;
    validate_non_empty(&request.attempt_id, "objective review attempt_id")?;
    validate_non_empty(&request.idempotency_key, "objective review idempotency_key")?;
    validate_optional_bounded_text(request.reason.as_deref(), "objective review reason")?;
    if !matches!(
        request.disposition.as_str(),
        "continue" | "blocked" | "succeeded" | "failed"
    ) {
        return Err(SystemServiceError::Invariant(
            "objective review disposition is invalid".to_string(),
        ));
    }
    Ok(())
}

fn validate_verification_submissions(
    objective: &ObjectiveRecord,
    submissions: &[ObjectiveVerificationSubmission],
    disposition: &str,
) -> Result<()> {
    if submissions.len() > MAX_OBJECTIVE_ITEMS {
        return Err(SystemServiceError::Invariant(
            "objective verification submission is too large".to_string(),
        ));
    }
    let requirements: HashMap<_, _> = objective
        .verification_policy
        .requirements
        .iter()
        .map(|requirement| (requirement.id.as_str(), requirement))
        .collect();
    let mut seen = HashSet::new();
    let mut passed = HashSet::new();
    let mut has_blocked = false;
    for submission in submissions {
        let requirement = requirements
            .get(submission.requirement_id.as_str())
            .ok_or_else(|| {
                SystemServiceError::Invariant(format!(
                    "objective verification references unknown requirement: {}",
                    submission.requirement_id
                ))
            })?;
        if !seen.insert(submission.requirement_id.as_str()) {
            return Err(SystemServiceError::Invariant(
                "objective verification requirement is duplicated".to_string(),
            ));
        }
        if submission.verifier_kind != requirement.verifier_kind
            || submission.verifier_ref != requirement.verifier_ref
        {
            return Err(SystemServiceError::Invariant(
                "objective verification authority does not match frozen policy".to_string(),
            ));
        }
        validate_verification_result(&submission.result)?;
        validate_optional_bounded_text(
            submission.reason.as_deref(),
            "objective verification reason",
        )?;
        if submission.evidence.is_empty() || submission.evidence.len() > MAX_OBJECTIVE_ITEMS {
            return Err(SystemServiceError::Invariant(
                "objective verification evidence must be bounded and non-empty".to_string(),
            ));
        }
        for evidence in &submission.evidence {
            validate_verification_evidence(evidence)?;
        }
        if submission.result == "passed" {
            passed.insert(submission.requirement_id.as_str());
        }
        has_blocked |= submission.result == "blocked";
    }
    let all_passed = passed.len() == requirements.len();
    if disposition == "succeeded" && !all_passed {
        return Err(SystemServiceError::Invariant(
            "objective success requires every frozen verification requirement to pass".to_string(),
        ));
    }
    if disposition != "succeeded" && all_passed {
        return Err(SystemServiceError::Invariant(
            "a fully verified objective must settle as succeeded".to_string(),
        ));
    }
    if disposition == "blocked" && !has_blocked {
        return Err(SystemServiceError::Invariant(
            "a blocked objective review requires blocked verification evidence".to_string(),
        ));
    }
    Ok(())
}

fn validate_verification_evidence(evidence: &crate::ObjectiveVerificationEvidence) -> Result<()> {
    if !matches!(
        evidence.kind.as_str(),
        "provider_output"
            | "resource"
            | "tool_execution"
            | "runtime_projection"
            | "human_attestation"
    ) {
        return Err(SystemServiceError::Invariant(
            "objective verification evidence kind is invalid".to_string(),
        ));
    }
    validate_non_empty(
        &evidence.reference_id,
        "objective verification evidence reference_id",
    )?;
    validate_sha256(&evidence.digest, "objective verification evidence digest")
}

fn validate_request_objective_cancel(request: &RequestObjectiveCancel) -> Result<()> {
    validate_non_empty(&request.objective_id, "objective cancel objective_id")?;
    validate_bounded_text(&request.reason, "objective cancel reason", MAX_REASON_BYTES)?;
    validate_non_empty(&request.idempotency_key, "objective cancel idempotency_key")
}

fn validate_reconcile_objective_cancellation(
    request: &ReconcileObjectiveCancellation,
) -> Result<()> {
    validate_non_empty(
        &request.objective_id,
        "objective cancellation reconciliation objective_id",
    )?;
    validate_non_empty(
        &request.attempt_id,
        "objective cancellation reconciliation attempt_id",
    )?;
    validate_non_empty(
        &request.idempotency_key,
        "objective cancellation reconciliation idempotency_key",
    )
}

fn review_next_state_tx(
    tx: &rusqlite::Transaction<'_>,
    objective: &ObjectiveRecord,
    disposition: &str,
    attempt_number: i64,
    now: i64,
) -> Result<(&'static str, &'static str, bool)> {
    match disposition {
        "succeeded" => return Ok(("succeeded", "verification_succeeded", true)),
        "failed" => return Ok(("failed", "unrecoverable_failure", true)),
        _ => {}
    }
    if objective.state == "paused" {
        return Ok(("paused", "user_paused", false));
    }
    if attempt_number >= objective.stop_policy.max_attempts {
        return Ok(("limit_reached", "max_attempts", true));
    }
    if objective
        .stop_policy
        .deadline_at
        .is_some_and(|deadline| now >= deadline)
    {
        return Ok(("limit_reached", "deadline", true));
    }
    if let Some(limit) = &objective.stop_policy.budget {
        if !objective_budget_has_remaining_tx(tx, &objective.id, limit)? {
            return Ok(("limit_reached", "budget", true));
        }
    }
    if disposition == "blocked" {
        let blocked = consecutive_blocked_reviews_tx(tx, &objective.id)?;
        if blocked >= objective.stop_policy.max_consecutive_blocked_attempts {
            return Ok(("blocked", "verification_blocked", false));
        }
    }
    Ok(("active", "verification_failed", false))
}

fn objective_limit_reason_tx<'a>(
    tx: &rusqlite::Transaction<'_>,
    objective: &ObjectiveRecord,
    next_attempt_number: i64,
    now: i64,
) -> Result<Option<&'a str>> {
    if next_attempt_number > objective.stop_policy.max_attempts {
        return Ok(Some("max_attempts"));
    }
    if objective
        .stop_policy
        .deadline_at
        .is_some_and(|deadline| now >= deadline)
    {
        return Ok(Some("deadline"));
    }
    if let Some(limit) = &objective.stop_policy.budget {
        if !objective_budget_has_remaining_tx(tx, &objective.id, limit)? {
            return Ok(Some("budget"));
        }
    }
    Ok(None)
}

#[allow(clippy::too_many_arguments)]
fn update_objective_tx(
    tx: &rusqlite::Transaction<'_>,
    objective: &ObjectiveRecord,
    state: &str,
    reason_code: &str,
    reason_detail: Option<&str>,
    active_attempt_id: Option<&str>,
    close: bool,
    now: i64,
) -> Result<ObjectiveRecord> {
    validate_objective_state(state)?;
    validate_reason_code(reason_code)?;
    let closed_at = close.then_some(now);
    let changed = tx.execute(
        "UPDATE objective
         SET state = ?, reason_code = ?, reason_detail = ?, active_attempt_id = ?,
             revision = revision + 1, updated_at = ?, closed_at = ?
         WHERE id = ? AND revision = ?",
        params![
            state,
            reason_code,
            reason_detail,
            active_attempt_id,
            now,
            closed_at,
            objective.id,
            objective.revision,
        ],
    )?;
    if changed != 1 {
        return Err(objective_revision_conflict(
            &objective.id,
            objective.revision,
        ));
    }
    get_objective_tx(tx, &objective.id)
}

fn record_state_command_tx(
    tx: &rusqlite::Transaction<'_>,
    idempotency_key: &str,
    before: &ObjectiveRecord,
    after: &ObjectiveRecord,
    command: &str,
    request_digest: &str,
    now: i64,
) -> Result<()> {
    tx.execute(
        "INSERT INTO objective_state_command (
            idempotency_key, objective_id, command, request_digest,
            from_revision, to_revision, from_state, to_state, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params![
            idempotency_key,
            before.id,
            command,
            request_digest,
            before.revision,
            after.revision,
            before.state,
            after.state,
            now,
        ],
    )?;
    Ok(())
}

fn insert_verifications_tx(
    tx: &rusqlite::Transaction<'_>,
    objective: &ObjectiveRecord,
    attempt: &ObjectiveAttemptRecord,
    review_id: &str,
    submissions: &[ObjectiveVerificationSubmission],
    now: i64,
) -> Result<Vec<ObjectiveVerificationRecord>> {
    let mut records = Vec::with_capacity(submissions.len());
    for submission in submissions {
        let id = format!("objectivever_{}", Uuid::now_v7());
        tx.execute(
            "INSERT INTO objective_verification (
                id, objective_id, attempt_id, review_id, requirement_id,
                verifier_kind, verifier_ref, result, reason, evidence_json, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                id,
                objective.id,
                attempt.id,
                review_id,
                submission.requirement_id,
                submission.verifier_kind,
                submission.verifier_ref,
                submission.result,
                submission.reason,
                serde_json::to_string(&submission.evidence)?,
                now,
            ],
        )?;
        append_event_tx(
            tx,
            &format!("evt_{}", Uuid::now_v7()),
            "objective.verification.recorded",
            &EventScope {
                session_id: Some(objective.session_id.clone()),
                turn_id: Some(attempt.turn_id.clone()),
                input_id: Some(attempt.input_id.clone()),
                objective_id: Some(objective.id.clone()),
                ..EventScope::default()
            },
            &serde_json::json!({
                "objectiveId": objective.id,
                "attemptId": attempt.id,
                "verificationId": id,
                "requirementId": submission.requirement_id,
                "result": submission.result,
                "createdAt": now
            }),
            now,
        )?;
        records.push(get_objective_verification_tx(tx, &id)?);
    }
    Ok(records)
}

fn require_terminal_attempt_turn_tx(
    tx: &rusqlite::Transaction<'_>,
    attempt: &ObjectiveAttemptRecord,
) -> Result<()> {
    let identity: Option<(String, String, String, String)> = tx
        .query_row(
            "SELECT state, primary_input_id, job_id, execution_binding_digest
             FROM session_turn WHERE id = ?",
            params![attempt.turn_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .optional()?;
    let Some((state, input_id, job_id, binding_digest)) = identity else {
        return Err(SystemServiceError::Invariant(
            "objective attempt turn does not exist".to_string(),
        ));
    };
    if input_id != attempt.input_id
        || job_id != attempt.job_id
        || binding_digest != attempt.execution_binding_digest
    {
        return Err(SystemServiceError::Invariant(
            "objective attempt canonical execution binding changed".to_string(),
        ));
    }
    if !is_terminal_turn_state(&state) {
        return Err(SystemServiceError::Conflict(format!(
            "objective attempt turn is not terminal: {state}"
        )));
    }
    Ok(())
}

fn validate_attempt_submission(
    attempt: &ObjectiveAttemptRecord,
    submission: &SubmitSessionTurnReceipt,
) -> Result<()> {
    if attempt.input_id != submission.admission.input_id
        || attempt.turn_id != submission.turn.id
        || attempt.job_id != submission.job.id
        || attempt.execution_binding_digest != submission.turn.execution_binding_digest
        || attempt.budget_grant_id != submission.job.budget_grant_id
    {
        return Err(SystemServiceError::Invariant(
            "objective attempt idempotency resolved to a different Turn binding".to_string(),
        ));
    }
    Ok(())
}

fn append_objective_state_event_tx(
    tx: &rusqlite::Transaction<'_>,
    before: &ObjectiveRecord,
    after: &ObjectiveRecord,
    cause: &str,
    now: i64,
) -> Result<()> {
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        "objective.state_changed",
        &EventScope {
            session_id: Some(after.session_id.clone()),
            objective_id: Some(after.id.clone()),
            ..EventScope::default()
        },
        &serde_json::json!({
            "objectiveId": after.id,
            "fromRevision": before.revision,
            "toRevision": after.revision,
            "fromState": before.state,
            "toState": after.state,
            "reason": after.reason,
            "cause": cause,
            "updatedAt": now
        }),
        now,
    )?;
    Ok(())
}

fn find_state_command_tx(
    tx: &rusqlite::Transaction<'_>,
    idempotency_key: &str,
) -> Result<Option<StateCommandRecord>> {
    tx.query_row(
        "SELECT objective_id, command, request_digest
         FROM objective_state_command WHERE idempotency_key = ?",
        params![idempotency_key],
        |row| {
            Ok(StateCommandRecord {
                objective_id: row.get(0)?,
                command: row.get(1)?,
                request_digest: row.get(2)?,
            })
        },
    )
    .optional()
    .map_err(Into::into)
}

fn validate_state_command(
    command: &StateCommandRecord,
    objective_id: &str,
    expected_command: &str,
    request_digest: &str,
) -> Result<()> {
    if command.objective_id != objective_id || command.command != expected_command {
        return Err(SystemServiceError::Invariant(
            "objective state idempotency key was reused for another command".to_string(),
        ));
    }
    require_matching_digest(
        &command.request_digest,
        request_digest,
        "objective state command",
    )
}

fn validate_existing_attempt_tx(
    tx: &rusqlite::Transaction<'_>,
    attempt: &ObjectiveAttemptRecord,
    request: &AdmitObjectiveAttempt,
    request_digest: &str,
) -> Result<()> {
    if attempt.objective_id != request.objective_id
        || attempt.trigger != request.trigger
        || attempt.idempotency_key != request.idempotency_key
    {
        return Err(SystemServiceError::Invariant(
            "objective attempt idempotency key was reused".to_string(),
        ));
    }
    let stored_digest: String = tx.query_row(
        "SELECT request_digest FROM objective_attempt WHERE id = ?",
        params![attempt.id],
        |row| row.get(0),
    )?;
    require_matching_digest(&stored_digest, request_digest, "objective attempt")
}

fn validate_existing_review_tx(
    tx: &rusqlite::Transaction<'_>,
    review: &ObjectiveAttemptReviewRecord,
    request: &ReviewObjectiveAttempt,
    request_digest: &str,
) -> Result<()> {
    if review.objective_id != request.objective_id
        || review.attempt_id != request.attempt_id
        || review.disposition != request.disposition
    {
        return Err(SystemServiceError::Invariant(
            "objective review idempotency key was reused".to_string(),
        ));
    }
    let stored_digest: String = tx.query_row(
        "SELECT request_digest FROM objective_attempt_review WHERE id = ?",
        params![review.id],
        |row| row.get(0),
    )?;
    require_matching_digest(&stored_digest, request_digest, "objective review")
}

fn find_objective_by_create_key_tx(
    tx: &rusqlite::Transaction<'_>,
    idempotency_key: &str,
) -> Result<Option<ObjectiveRecord>> {
    tx.query_row(
        &format!("{OBJECTIVE_SELECT} WHERE create_idempotency_key = ?"),
        params![idempotency_key],
        row_to_objective,
    )
    .optional()
    .map_err(Into::into)
}

fn get_objective_tx(tx: &rusqlite::Transaction<'_>, objective_id: &str) -> Result<ObjectiveRecord> {
    tx.query_row(
        &format!("{OBJECTIVE_SELECT} WHERE id = ?"),
        params![objective_id],
        row_to_objective,
    )
    .optional()?
    .ok_or_else(|| {
        SystemServiceError::Invariant(format!("objective does not exist: {objective_id}"))
    })
}

fn get_optional_objective_conn(
    conn: &rusqlite::Connection,
    objective_id: &str,
) -> Result<Option<ObjectiveRecord>> {
    conn.query_row(
        &format!("{OBJECTIVE_SELECT} WHERE id = ?"),
        params![objective_id],
        row_to_objective,
    )
    .optional()
    .map_err(Into::into)
}

fn get_objective_attempt_tx(
    tx: &rusqlite::Transaction<'_>,
    attempt_id: &str,
) -> Result<ObjectiveAttemptRecord> {
    tx.query_row(
        &format!("{OBJECTIVE_ATTEMPT_SELECT} WHERE id = ?"),
        params![attempt_id],
        row_to_objective_attempt,
    )
    .optional()?
    .ok_or_else(|| {
        SystemServiceError::Invariant(format!("objective attempt does not exist: {attempt_id}"))
    })
}

fn find_objective_attempt_by_key_tx(
    tx: &rusqlite::Transaction<'_>,
    idempotency_key: &str,
) -> Result<Option<ObjectiveAttemptRecord>> {
    tx.query_row(
        &format!("{OBJECTIVE_ATTEMPT_SELECT} WHERE idempotency_key = ?"),
        params![idempotency_key],
        row_to_objective_attempt,
    )
    .optional()
    .map_err(Into::into)
}

fn get_objective_review_tx(
    tx: &rusqlite::Transaction<'_>,
    review_id: &str,
) -> Result<ObjectiveAttemptReviewRecord> {
    tx.query_row(
        &format!("{OBJECTIVE_REVIEW_SELECT} WHERE id = ?"),
        params![review_id],
        row_to_objective_attempt_review,
    )
    .map_err(Into::into)
}

fn find_objective_review_by_key_tx(
    tx: &rusqlite::Transaction<'_>,
    idempotency_key: &str,
) -> Result<Option<ObjectiveAttemptReviewRecord>> {
    tx.query_row(
        &format!("{OBJECTIVE_REVIEW_SELECT} WHERE idempotency_key = ?"),
        params![idempotency_key],
        row_to_objective_attempt_review,
    )
    .optional()
    .map_err(Into::into)
}

fn get_objective_verification_tx(
    tx: &rusqlite::Transaction<'_>,
    verification_id: &str,
) -> Result<ObjectiveVerificationRecord> {
    tx.query_row(
        &format!("{OBJECTIVE_VERIFICATION_SELECT} WHERE id = ?"),
        params![verification_id],
        row_to_objective_verification,
    )
    .map_err(Into::into)
}

fn list_objective_verifications_tx(
    tx: &rusqlite::Transaction<'_>,
    review_id: &str,
) -> Result<Vec<ObjectiveVerificationRecord>> {
    let mut stmt = tx.prepare(&format!(
        "{OBJECTIVE_VERIFICATION_SELECT} WHERE review_id = ?
         ORDER BY created_at ASC, id ASC"
    ))?;
    let verifications =
        collect_verifications(stmt.query_map(params![review_id], row_to_objective_verification)?)?;
    Ok(verifications)
}

fn count_objective_attempts_tx(tx: &rusqlite::Transaction<'_>, objective_id: &str) -> Result<i64> {
    tx.query_row(
        "SELECT COUNT(*) FROM objective_attempt WHERE objective_id = ?",
        params![objective_id],
        |row| row.get(0),
    )
    .map_err(Into::into)
}

fn consecutive_blocked_reviews_tx(
    tx: &rusqlite::Transaction<'_>,
    objective_id: &str,
) -> Result<i64> {
    let mut stmt = tx.prepare(
        "SELECT review.disposition
         FROM objective_attempt_review review
         JOIN objective_attempt attempt ON attempt.id = review.attempt_id
         WHERE review.objective_id = ?
         ORDER BY attempt.attempt_number DESC",
    )?;
    let rows = stmt.query_map(params![objective_id], |row| row.get::<_, String>(0))?;
    let mut count = 0;
    for row in rows {
        if row? != "blocked" {
            break;
        }
        count += 1;
    }
    Ok(count)
}

fn require_objective_revision(objective: &ObjectiveRecord, expected_revision: i64) -> Result<()> {
    if objective.revision != expected_revision {
        return Err(objective_revision_conflict(
            &objective.id,
            expected_revision,
        ));
    }
    Ok(())
}

fn objective_revision_conflict(objective_id: &str, expected_revision: i64) -> SystemServiceError {
    SystemServiceError::Conflict(format!(
        "objective revision changed: {objective_id} expected {expected_revision}"
    ))
}

fn map_live_objective_conflict(error: rusqlite::Error) -> SystemServiceError {
    if matches!(
        &error,
        rusqlite::Error::SqliteFailure(code, _)
            if code.code == rusqlite::ErrorCode::ConstraintViolation
    ) {
        return SystemServiceError::Conflict(
            "session already has a nonterminal objective".to_string(),
        );
    }
    error.into()
}

fn validate_attempt_trigger(trigger: &str, attempt_number: i64) -> Result<()> {
    validate_attempt_trigger_kind(trigger)?;
    if (attempt_number == 1 && trigger != "initial") || (attempt_number > 1 && trigger == "initial")
    {
        return Err(SystemServiceError::Invariant(
            "objective attempt trigger does not match attempt number".to_string(),
        ));
    }
    Ok(())
}

fn validate_attempt_trigger_kind(trigger: &str) -> Result<()> {
    if !matches!(
        trigger,
        "initial" | "automatic_continuation" | "user_resume"
    ) {
        return Err(SystemServiceError::Invariant(
            "objective attempt trigger is invalid".to_string(),
        ));
    }
    Ok(())
}

fn validate_objective_state(state: &str) -> Result<()> {
    if LIVE_OBJECTIVE_STATES.contains(&state) || TERMINAL_OBJECTIVE_STATES.contains(&state) {
        Ok(())
    } else {
        Err(SystemServiceError::Invariant(
            "objective state is invalid".to_string(),
        ))
    }
}

fn validate_reason_code(code: &str) -> Result<()> {
    if matches!(
        code,
        "created"
            | "user_paused"
            | "user_resumed"
            | "verification_succeeded"
            | "verification_blocked"
            | "max_attempts"
            | "deadline"
            | "budget"
            | "verification_failed"
            | "cancel_requested"
            | "cancelled"
            | "unrecoverable_failure"
    ) {
        Ok(())
    } else {
        Err(SystemServiceError::Invariant(
            "objective reason code is invalid".to_string(),
        ))
    }
}

fn validate_verifier_kind(kind: &str) -> Result<()> {
    if matches!(kind, "model" | "script" | "human" | "runtime") {
        Ok(())
    } else {
        Err(SystemServiceError::Invariant(
            "objective verifier kind is invalid".to_string(),
        ))
    }
}

fn validate_verification_result(result: &str) -> Result<()> {
    if matches!(result, "passed" | "failed" | "inconclusive" | "blocked") {
        Ok(())
    } else {
        Err(SystemServiceError::Invariant(
            "objective verification result is invalid".to_string(),
        ))
    }
}

fn is_terminal_objective_state(state: &str) -> bool {
    TERMINAL_OBJECTIVE_STATES.contains(&state)
}

fn parse_json_value<T: serde::de::DeserializeOwned>(
    value: &serde_json::Value,
    name: &str,
) -> Result<T> {
    serde_json::from_value(value.clone())
        .map_err(|error| SystemServiceError::Invariant(format!("{name} is invalid: {error}")))
}

fn validate_string_list(values: &[String], name: &str) -> Result<()> {
    if values.len() > MAX_OBJECTIVE_ITEMS {
        return Err(SystemServiceError::Invariant(format!(
            "{name} is too large"
        )));
    }
    for value in values {
        validate_bounded_text(value, name, MAX_REASON_BYTES)?;
    }
    Ok(())
}

fn validate_non_empty(value: &str, name: &str) -> Result<()> {
    if value.trim().is_empty() {
        return Err(SystemServiceError::Invariant(format!(
            "{name} must not be empty"
        )));
    }
    Ok(())
}

fn validate_optional_non_empty(value: Option<&str>, name: &str) -> Result<()> {
    if let Some(value) = value {
        validate_non_empty(value, name)?;
    }
    Ok(())
}

fn validate_bounded_text(value: &str, name: &str, max_bytes: usize) -> Result<()> {
    validate_non_empty(value, name)?;
    if value.len() > max_bytes {
        return Err(SystemServiceError::Invariant(format!(
            "{name} exceeds {max_bytes} bytes"
        )));
    }
    Ok(())
}

fn validate_optional_bounded_text(value: Option<&str>, name: &str) -> Result<()> {
    if let Some(value) = value {
        validate_bounded_text(value, name, MAX_REASON_BYTES)?;
    }
    Ok(())
}

fn validate_sha256(value: &str, name: &str) -> Result<()> {
    if value.len() != 64 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(SystemServiceError::Invariant(format!(
            "{name} must be a SHA-256 hex digest"
        )));
    }
    Ok(())
}

fn digest_request<T: serde::Serialize>(request: &T) -> Result<String> {
    Ok(crate::util::hex_sha256(&serde_json::to_vec(request)?))
}

fn require_matching_digest(stored: &str, requested: &str, name: &str) -> Result<()> {
    if stored != requested {
        return Err(SystemServiceError::Invariant(format!(
            "conflicting repeated {name}"
        )));
    }
    Ok(())
}

fn collect_objectives(
    rows: rusqlite::MappedRows<
        '_,
        impl FnMut(&rusqlite::Row<'_>) -> rusqlite::Result<ObjectiveRecord>,
    >,
) -> Result<Vec<ObjectiveRecord>> {
    collect_rows(rows)
}

fn collect_attempts(
    rows: rusqlite::MappedRows<
        '_,
        impl FnMut(&rusqlite::Row<'_>) -> rusqlite::Result<ObjectiveAttemptRecord>,
    >,
) -> Result<Vec<ObjectiveAttemptRecord>> {
    collect_rows(rows)
}

fn collect_reviews(
    rows: rusqlite::MappedRows<
        '_,
        impl FnMut(&rusqlite::Row<'_>) -> rusqlite::Result<ObjectiveAttemptReviewRecord>,
    >,
) -> Result<Vec<ObjectiveAttemptReviewRecord>> {
    collect_rows(rows)
}

fn collect_verifications(
    rows: rusqlite::MappedRows<
        '_,
        impl FnMut(&rusqlite::Row<'_>) -> rusqlite::Result<ObjectiveVerificationRecord>,
    >,
) -> Result<Vec<ObjectiveVerificationRecord>> {
    collect_rows(rows)
}

fn collect_rows<T>(rows: impl Iterator<Item = rusqlite::Result<T>>) -> Result<Vec<T>> {
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}
