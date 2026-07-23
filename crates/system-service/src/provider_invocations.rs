use crate::event_store::append_event_tx;
use crate::messages::{insert_session_message_tx, NewSessionMessage};
use crate::rows::row_to_provider_invocation;
use crate::{
    BeginProviderInvocation, EventScope, FinishProviderInvocation, FinishProviderInvocationReceipt,
    ListProviderInvocations, MarkProviderInvocationOutput, ProviderInvocationRecord, Result,
    SettleSessionTurn, SystemService, SystemServiceError,
};
use rusqlite::{params, OptionalExtension};
use uuid::Uuid;

const PROVIDER_INVOCATION_SELECT: &str = "SELECT id, session_id, turn_id,
    attempt_id, input_id, job_id, step, invocation_number,
    execution_binding_digest, request_digest, state, output_observed,
    provider_request_id, assistant_message_id, error_json, started_at,
    updated_at, finished_at FROM provider_invocation";

impl SystemService {
    pub fn begin_provider_invocation(
        &self,
        request: &BeginProviderInvocation,
    ) -> Result<ProviderInvocationRecord> {
        validate_begin(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let invocation = begin_provider_invocation_tx(&tx, request, now)?;
        tx.commit()?;
        Ok(invocation)
    }

    pub fn mark_provider_invocation_output(
        &self,
        request: &MarkProviderInvocationOutput,
    ) -> Result<Option<ProviderInvocationRecord>> {
        validate_mark(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let Some(_) = validate_lease(&tx, request_identity(request), now)? else {
            tx.commit()?;
            return Ok(None);
        };
        let invocation = get_provider_invocation_tx(&tx, &request.invocation_id)?;
        ensure_invocation_identity(&invocation, request_identity(request))?;
        if !matches!(invocation.state.as_str(), "dispatched" | "output_observed") {
            return Err(SystemServiceError::Invariant(
                "terminal provider invocation cannot observe new output".to_string(),
            ));
        }
        if invocation.state == "dispatched" {
            tx.execute(
                "UPDATE provider_invocation
                 SET state = 'output_observed', output_observed = 1,
                     provider_request_id = COALESCE(?, provider_request_id), updated_at = ?
                 WHERE id = ? AND state = 'dispatched'",
                params![request.provider_request_id, now, request.invocation_id],
            )?;
            append_provider_event_tx(
                &tx,
                "session.provider_invocation.output_observed",
                &invocation,
                &serde_json::json!({
                    "providerRequestId": request.provider_request_id
                }),
                now,
            )?;
        }
        let invocation = get_provider_invocation_tx(&tx, &request.invocation_id)?;
        tx.commit()?;
        Ok(Some(invocation))
    }

    pub fn finish_provider_invocation(
        &self,
        request: &FinishProviderInvocation,
    ) -> Result<Option<FinishProviderInvocationReceipt>> {
        validate_finish(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let Some(_) = validate_lease(&tx, request_identity(request), now)? else {
            tx.commit()?;
            return Ok(None);
        };
        let receipt = finish_provider_invocation_tx(&tx, request, now)?;
        tx.commit()?;
        Ok(Some(receipt))
    }

    pub fn list_provider_invocations(
        &self,
        request: &ListProviderInvocations,
    ) -> Result<Vec<ProviderInvocationRecord>> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare(&format!(
            "{PROVIDER_INVOCATION_SELECT} WHERE turn_id = ?
             ORDER BY step ASC, invocation_number ASC, id ASC"
        ))?;
        let rows = stmt.query_map(params![request.turn_id], row_to_provider_invocation)?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }
}

pub(crate) fn begin_provider_invocation_tx(
    tx: &rusqlite::Transaction<'_>,
    request: &BeginProviderInvocation,
    now: i64,
) -> Result<ProviderInvocationRecord> {
    validate_begin(request)?;
    let Some(binding_digest) = validate_lease(tx, request_identity(request), now)? else {
        return Err(SystemServiceError::Invariant(
            "provider invocation does not own the active turn lease".to_string(),
        ));
    };
    let turn = crate::sessions::get_turn_tx(tx, &request.turn_id)?;
    let (provider_max_attempts, _) = crate::turns::recovery_bounds(&turn.execution_binding)?;
    if request.invocation_number > provider_max_attempts {
        return Err(SystemServiceError::Invariant(
            "provider invocation exceeds the frozen recovery bound".to_string(),
        ));
    }
    if let Some(existing) = find_provider_invocation_by_step_tx(
        tx,
        &request.turn_id,
        request.step,
        request.invocation_number,
    )? {
        ensure_same_begin(&existing, request, &binding_digest)?;
        return Ok(existing);
    }
    if let Some(previous) =
        find_latest_provider_invocation_for_step_tx(tx, &request.turn_id, request.step)?
    {
        let retryable = previous
            .error
            .as_ref()
            .and_then(|error| error.get("retryable"))
            .and_then(serde_json::Value::as_bool)
            == Some(true);
        if request.invocation_number != previous.invocation_number + 1
            || previous.state != "failed_before_output"
            || previous.output_observed
            || !retryable
            || previous.request_digest != request.request_digest
            || previous.execution_binding_digest != binding_digest
        {
            return Err(SystemServiceError::Invariant(
                "provider retry does not follow retryable durable evidence".to_string(),
            ));
        }
    } else if request.invocation_number != 1 {
        return Err(SystemServiceError::Invariant(
            "first provider invocation for a step must use invocation_number 1".to_string(),
        ));
    }
    let id = request
        .id
        .clone()
        .unwrap_or_else(|| format!("pinv_{}", Uuid::now_v7()));
    tx.execute(
        "INSERT INTO provider_invocation (
            id, session_id, turn_id, attempt_id, input_id, job_id, step,
            invocation_number, execution_binding_digest, request_digest, state,
            output_observed, provider_request_id, assistant_message_id,
            error_json, started_at, updated_at, finished_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'dispatched', 0,
                   NULL, NULL, NULL, ?, ?, NULL)",
        params![
            id,
            request.session_id,
            request.turn_id,
            request.attempt_id,
            request.input_id,
            request.job_id,
            request.step,
            request.invocation_number,
            binding_digest,
            request.request_digest,
            now,
            now
        ],
    )?;
    let invocation = get_provider_invocation_tx(tx, &id)?;
    append_provider_event_tx(
        tx,
        "session.provider_invocation.dispatched",
        &invocation,
        &serde_json::json!({
            "step": request.step,
            "invocationNumber": request.invocation_number,
            "requestDigest": request.request_digest
        }),
        now,
    )?;
    Ok(invocation)
}

pub(crate) fn finish_provider_invocation_tx(
    tx: &rusqlite::Transaction<'_>,
    request: &FinishProviderInvocation,
    now: i64,
) -> Result<FinishProviderInvocationReceipt> {
    validate_finish(request)?;
    let Some(binding_digest) = validate_lease(tx, request_identity(request), now)? else {
        return Err(SystemServiceError::Invariant(
            "provider invocation finish lost the active turn lease".to_string(),
        ));
    };
    let existing = get_provider_invocation_tx(tx, &request.invocation_id)?;
    ensure_invocation_identity(&existing, request_identity(request))?;
    if existing.execution_binding_digest != binding_digest {
        return Err(SystemServiceError::Invariant(
            "provider invocation binding digest changed".to_string(),
        ));
    }
    if is_terminal(&existing.state) {
        return repeated_finish_receipt(tx, &existing, request);
    }
    if request.outcome == "succeeded"
        && request
            .assistant_message
            .as_ref()
            .is_some_and(|content| !message_contains_tool_call(content))
    {
        let pending_steer: bool = tx.query_row(
            "SELECT EXISTS(
               SELECT 1 FROM session_turn_control
               WHERE turn_id = ? AND attempt_id = ? AND kind = 'steer'
                 AND status = 'pending'
             )",
            params![request.turn_id, request.attempt_id],
            |row| row.get(0),
        )?;
        if !pending_steer {
            return Err(SystemServiceError::InvalidInput(
                "non-terminal final provider finish requires a pending steer".to_string(),
            ));
        }
    }

    let assistant_message = if request.outcome == "succeeded" {
        let content = request.assistant_message.as_ref().ok_or_else(|| {
            SystemServiceError::InvalidInput(
                "successful provider invocation requires assistant_message".to_string(),
            )
        })?;
        Some(insert_session_message_tx(
            tx,
            NewSessionMessage {
                session_id: &request.session_id,
                turn_id: &request.turn_id,
                attempt_id: Some(&request.attempt_id),
                input_id: Some(&request.input_id),
                role: "assistant",
                status: "completed",
                content,
                provider_state: request.provider_state.as_ref(),
                execution_binding_digest: &binding_digest,
                idempotency_key: Some(&format!(
                    "provider.invocation:{}:assistant",
                    request.invocation_id
                )),
            },
            now,
        )?)
    } else {
        None
    };
    let output_observed = existing.output_observed || request.outcome == "succeeded";
    tx.execute(
        "UPDATE provider_invocation
         SET state = ?, output_observed = ?,
             provider_request_id = COALESCE(?, provider_request_id),
             assistant_message_id = ?, error_json = ?, updated_at = ?, finished_at = ?
         WHERE id = ? AND state IN ('dispatched', 'output_observed')",
        params![
            request.outcome,
            output_observed,
            request.provider_request_id,
            assistant_message.as_ref().map(|message| &message.id),
            request
                .error
                .as_ref()
                .map(serde_json::to_string)
                .transpose()?,
            now,
            now,
            request.invocation_id
        ],
    )?;
    let invocation = get_provider_invocation_tx(tx, &request.invocation_id)?;
    append_provider_event_tx(
        tx,
        &format!("session.provider_invocation.{}", request.outcome),
        &invocation,
        &serde_json::json!({
            "state": request.outcome,
            "outputObserved": output_observed,
            "assistantMessageId": assistant_message.as_ref().map(|message| &message.id),
            "error": request.error
        }),
        now,
    )?;
    Ok(FinishProviderInvocationReceipt {
        invocation,
        assistant_message,
    })
}

pub(crate) fn finish_final_provider_invocation_tx(
    tx: &rusqlite::Transaction<'_>,
    request: &SettleSessionTurn,
    assistant_message_id: &str,
    binding_digest: &str,
    now: i64,
) -> Result<()> {
    let invocation_id = request.provider_invocation_id.as_deref().ok_or_else(|| {
        SystemServiceError::InvalidInput(
            "successful turn settlement requires provider_invocation_id".to_string(),
        )
    })?;
    let invocation = get_provider_invocation_tx(tx, invocation_id)?;
    if invocation.session_id != request.session_id
        || invocation.turn_id != request.turn_id
        || invocation.attempt_id != request.attempt_id
        || invocation.input_id != request.input_id
        || invocation.job_id != request.job_id
        || invocation.execution_binding_digest != binding_digest
    {
        return Err(SystemServiceError::Invariant(
            "final provider invocation identity does not match turn settlement".to_string(),
        ));
    }
    if !matches!(invocation.state.as_str(), "dispatched" | "output_observed") {
        return Err(SystemServiceError::Invariant(
            "final provider invocation is not open for settlement".to_string(),
        ));
    }
    let updated = tx.execute(
        "UPDATE provider_invocation
         SET state = 'succeeded', output_observed = 1, assistant_message_id = ?,
             error_json = NULL, updated_at = ?, finished_at = ?
         WHERE id = ? AND state IN ('dispatched', 'output_observed')",
        params![assistant_message_id, now, now, invocation_id],
    )?;
    if updated != 1 {
        return Err(SystemServiceError::Invariant(
            "final provider invocation settlement lost its open record".to_string(),
        ));
    }
    let invocation = get_provider_invocation_tx(tx, invocation_id)?;
    append_provider_event_tx(
        tx,
        "session.provider_invocation.succeeded",
        &invocation,
        &serde_json::json!({
            "state": "succeeded",
            "outputObserved": true,
            "assistantMessageId": assistant_message_id,
            "terminalTurnSettlement": true
        }),
        now,
    )
}

pub(crate) fn prepare_non_successful_turn_settlement_tx(
    tx: &rusqlite::Transaction<'_>,
    request: &SettleSessionTurn,
    error: &serde_json::Value,
    now: i64,
) -> Result<()> {
    let open_count: i64 = tx.query_row(
        "SELECT COUNT(*) FROM provider_invocation
         WHERE turn_id = ? AND attempt_id = ?
           AND state IN ('dispatched', 'output_observed')",
        params![request.turn_id, request.attempt_id],
        |row| row.get(0),
    )?;
    if open_count == 0 {
        return Ok(());
    }
    if request.outcome != "recovery_required" {
        return Err(SystemServiceError::Invariant(
            "non-successful turn settlement cannot hide an open provider invocation".to_string(),
        ));
    }
    ambiguate_open_provider_invocations_tx(tx, &request.attempt_id, error, now)?;
    Ok(())
}

pub(crate) fn ambiguate_open_provider_invocations_tx(
    tx: &rusqlite::Transaction<'_>,
    attempt_id: &str,
    error: &serde_json::Value,
    now: i64,
) -> Result<usize> {
    let mut stmt = tx.prepare(&format!(
        "{PROVIDER_INVOCATION_SELECT}
         WHERE attempt_id = ? AND state IN ('dispatched', 'output_observed')
         ORDER BY step ASC, invocation_number ASC, id ASC"
    ))?;
    let invocations = stmt
        .query_map(params![attempt_id], row_to_provider_invocation)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    drop(stmt);
    let error_json = serde_json::to_string(error)?;
    for invocation in &invocations {
        let updated = tx.execute(
            "UPDATE provider_invocation
             SET state = 'ambiguous', error_json = ?, updated_at = ?, finished_at = ?
             WHERE id = ? AND state IN ('dispatched', 'output_observed')",
            params![error_json, now, now, invocation.id],
        )?;
        if updated != 1 {
            return Err(SystemServiceError::Invariant(
                "provider ambiguity transition lost its open invocation".to_string(),
            ));
        }
        let updated_invocation = get_provider_invocation_tx(tx, &invocation.id)?;
        append_provider_event_tx(
            tx,
            "session.provider_invocation.ambiguous",
            &updated_invocation,
            &serde_json::json!({
                "state": "ambiguous",
                "outputObserved": updated_invocation.output_observed,
                "error": error,
                "turnRecovery": true
            }),
            now,
        )?;
    }
    Ok(invocations.len())
}

pub(crate) fn get_provider_invocation_tx(
    tx: &rusqlite::Transaction<'_>,
    invocation_id: &str,
) -> Result<ProviderInvocationRecord> {
    tx.query_row(
        &format!("{PROVIDER_INVOCATION_SELECT} WHERE id = ?"),
        params![invocation_id],
        row_to_provider_invocation,
    )
    .map_err(Into::into)
}

fn find_provider_invocation_by_step_tx(
    tx: &rusqlite::Transaction<'_>,
    turn_id: &str,
    step: i64,
    invocation_number: i64,
) -> Result<Option<ProviderInvocationRecord>> {
    tx.query_row(
        &format!(
            "{PROVIDER_INVOCATION_SELECT}
             WHERE turn_id = ? AND step = ? AND invocation_number = ?"
        ),
        params![turn_id, step, invocation_number],
        row_to_provider_invocation,
    )
    .optional()
    .map_err(Into::into)
}

fn find_latest_provider_invocation_for_step_tx(
    tx: &rusqlite::Transaction<'_>,
    turn_id: &str,
    step: i64,
) -> Result<Option<ProviderInvocationRecord>> {
    tx.query_row(
        &format!(
            "{PROVIDER_INVOCATION_SELECT}
             WHERE turn_id = ? AND step = ?
             ORDER BY invocation_number DESC, id DESC LIMIT 1"
        ),
        params![turn_id, step],
        row_to_provider_invocation,
    )
    .optional()
    .map_err(Into::into)
}

struct InvocationIdentity<'a> {
    session_id: &'a str,
    turn_id: &'a str,
    attempt_id: &'a str,
    input_id: &'a str,
    job_id: &'a str,
    worker_id: &'a str,
    lease_token: &'a str,
}

fn request_identity<T: ProviderInvocationIdentity>(request: &T) -> InvocationIdentity<'_> {
    InvocationIdentity {
        session_id: request.session_id(),
        turn_id: request.turn_id(),
        attempt_id: request.attempt_id(),
        input_id: request.input_id(),
        job_id: request.job_id(),
        worker_id: request.worker_id(),
        lease_token: request.lease_token(),
    }
}

trait ProviderInvocationIdentity {
    fn session_id(&self) -> &str;
    fn turn_id(&self) -> &str;
    fn attempt_id(&self) -> &str;
    fn input_id(&self) -> &str;
    fn job_id(&self) -> &str;
    fn worker_id(&self) -> &str;
    fn lease_token(&self) -> &str;
}

macro_rules! impl_invocation_identity {
    ($type:ty) => {
        impl ProviderInvocationIdentity for $type {
            fn session_id(&self) -> &str {
                &self.session_id
            }
            fn turn_id(&self) -> &str {
                &self.turn_id
            }
            fn attempt_id(&self) -> &str {
                &self.attempt_id
            }
            fn input_id(&self) -> &str {
                &self.input_id
            }
            fn job_id(&self) -> &str {
                &self.job_id
            }
            fn worker_id(&self) -> &str {
                &self.worker_id
            }
            fn lease_token(&self) -> &str {
                &self.lease_token
            }
        }
    };
}

impl_invocation_identity!(BeginProviderInvocation);
impl_invocation_identity!(MarkProviderInvocationOutput);
impl_invocation_identity!(FinishProviderInvocation);

fn validate_lease(
    tx: &rusqlite::Transaction<'_>,
    identity: InvocationIdentity<'_>,
    now: i64,
) -> Result<Option<String>> {
    crate::turns::validate_turn_attempt_lease_tx(
        tx,
        &crate::turns::TurnAttemptLeaseIdentity {
            session_id: identity.session_id,
            turn_id: identity.turn_id,
            attempt_id: identity.attempt_id,
            input_id: identity.input_id,
            job_id: identity.job_id,
            worker_id: identity.worker_id,
            lease_token: identity.lease_token,
        },
        now,
    )
}

fn ensure_invocation_identity(
    invocation: &ProviderInvocationRecord,
    identity: InvocationIdentity<'_>,
) -> Result<()> {
    if invocation.session_id != identity.session_id
        || invocation.turn_id != identity.turn_id
        || invocation.attempt_id != identity.attempt_id
        || invocation.input_id != identity.input_id
        || invocation.job_id != identity.job_id
    {
        return Err(SystemServiceError::Invariant(
            "provider invocation identity does not match active turn".to_string(),
        ));
    }
    Ok(())
}

fn ensure_same_begin(
    existing: &ProviderInvocationRecord,
    request: &BeginProviderInvocation,
    binding_digest: &str,
) -> Result<()> {
    ensure_invocation_identity(existing, request_identity(request))?;
    if existing.request_digest != request.request_digest
        || existing.execution_binding_digest != binding_digest
    {
        return Err(SystemServiceError::Invariant(
            "conflicting repeated provider invocation begin".to_string(),
        ));
    }
    Ok(())
}

fn repeated_finish_receipt(
    tx: &rusqlite::Transaction<'_>,
    existing: &ProviderInvocationRecord,
    request: &FinishProviderInvocation,
) -> Result<FinishProviderInvocationReceipt> {
    if existing.state != request.outcome
        || existing.provider_request_id != request.provider_request_id
        || existing.error != request.error
    {
        return Err(SystemServiceError::Invariant(
            "conflicting repeated provider invocation finish".to_string(),
        ));
    }
    let assistant_message = existing
        .assistant_message_id
        .as_deref()
        .map(|message_id| crate::messages::get_message_tx(tx, message_id))
        .transpose()?;
    Ok(FinishProviderInvocationReceipt {
        invocation: existing.clone(),
        assistant_message,
    })
}

fn append_provider_event_tx(
    tx: &rusqlite::Transaction<'_>,
    event_type: &str,
    invocation: &ProviderInvocationRecord,
    payload: &serde_json::Value,
    now: i64,
) -> Result<()> {
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        event_type,
        &EventScope {
            session_id: Some(invocation.session_id.clone()),
            turn_id: Some(invocation.turn_id.clone()),
            attempt_id: Some(invocation.attempt_id.clone()),
            input_id: Some(invocation.input_id.clone()),
            message_id: invocation.assistant_message_id.clone(),
            ..EventScope::default()
        },
        &serde_json::json!({
            "invocationId": invocation.id,
            "jobId": invocation.job_id,
            "provider": payload
        }),
        now,
    )
}

fn validate_begin(request: &BeginProviderInvocation) -> Result<()> {
    validate_identity(request_identity(request))?;
    if request.step <= 0 || request.invocation_number <= 0 || request.request_digest.is_empty() {
        return Err(SystemServiceError::InvalidInput(
            "provider invocation step, number, and request digest must be valid".to_string(),
        ));
    }
    Ok(())
}

fn validate_mark(request: &MarkProviderInvocationOutput) -> Result<()> {
    validate_identity(request_identity(request))?;
    if request.invocation_id.is_empty() {
        return Err(SystemServiceError::InvalidInput(
            "provider invocation id must not be empty".to_string(),
        ));
    }
    Ok(())
}

fn validate_finish(request: &FinishProviderInvocation) -> Result<()> {
    validate_mark(&MarkProviderInvocationOutput {
        session_id: request.session_id.clone(),
        turn_id: request.turn_id.clone(),
        attempt_id: request.attempt_id.clone(),
        input_id: request.input_id.clone(),
        job_id: request.job_id.clone(),
        worker_id: request.worker_id.clone(),
        lease_token: request.lease_token.clone(),
        invocation_id: request.invocation_id.clone(),
        provider_request_id: request.provider_request_id.clone(),
    })?;
    if !matches!(
        request.outcome.as_str(),
        "succeeded" | "failed_before_output" | "ambiguous"
    ) {
        return Err(SystemServiceError::InvalidInput(
            "provider invocation outcome is invalid".to_string(),
        ));
    }
    if request.outcome != "succeeded" && request.assistant_message.is_some() {
        return Err(SystemServiceError::InvalidInput(
            "failed provider invocation cannot append assistant output".to_string(),
        ));
    }
    Ok(())
}

fn message_contains_tool_call(content: &serde_json::Value) -> bool {
    content.as_array().is_some_and(|parts| {
        parts
            .iter()
            .any(|part| part.get("type").and_then(serde_json::Value::as_str) == Some("tool_call"))
    })
}

fn validate_identity(identity: InvocationIdentity<'_>) -> Result<()> {
    if identity.session_id.is_empty()
        || identity.turn_id.is_empty()
        || identity.attempt_id.is_empty()
        || identity.input_id.is_empty()
        || identity.job_id.is_empty()
        || identity.worker_id.is_empty()
        || identity.lease_token.is_empty()
    {
        return Err(SystemServiceError::InvalidInput(
            "provider invocation execution identity must not be empty".to_string(),
        ));
    }
    Ok(())
}

fn is_terminal(state: &str) -> bool {
    matches!(state, "succeeded" | "failed_before_output" | "ambiguous")
}
