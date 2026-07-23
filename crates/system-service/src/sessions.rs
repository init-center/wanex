use crate::event_store::append_event_tx;
use crate::rows::{row_to_session, row_to_session_input, row_to_session_turn};
use crate::{
    AdmissionReceipt, AdmitSessionInput, EnqueueJob, EventScope, ListSessions, Result, RetryPolicy,
    SchedulerJobKind, SessionInputRecord, SessionRecord, SessionTurnRecord, SubmitSessionTurn,
    SubmitSessionTurnReceipt, SystemService, SystemServiceError,
};
use rusqlite::{params, params_from_iter, types::Value as SqlValue, OptionalExtension};
use uuid::Uuid;

pub(crate) const SESSION_TURN_SELECT: &str = "SELECT id, session_id, primary_input_id,
    job_id, state, execution_binding_json, execution_binding_digest, max_steps,
    current_attempt_id, parent_turn_id, regenerates_turn_id, cancel_requested_at,
    cancel_reason, result_json, error_json, created_at, updated_at, finished_at
    FROM session_turn";

impl SystemService {
    pub fn create_session(
        &self,
        id: Option<&str>,
        title: Option<&str>,
        kind: Option<&str>,
    ) -> Result<SessionRecord> {
        let now = crate::util::now_ms();
        let id = id
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| format!("ses_{}", Uuid::now_v7()));
        let kind = kind.unwrap_or("chat");
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        tx.execute(
            "INSERT INTO session (id, title, kind, status, created_at, updated_at, archived_at)
             VALUES (?, ?, ?, 'active', ?, ?, NULL)",
            params![id, title, kind, now, now],
        )?;
        append_event_tx(
            &tx,
            &format!("evt_{}", Uuid::now_v7()),
            "session.created",
            &EventScope {
                session_id: Some(id.clone()),
                ..EventScope::default()
            },
            &serde_json::json!({
                "sessionId": id,
                "kind": kind,
                "status": "active"
            }),
            now,
        )?;
        tx.commit()?;
        self.get_session(&id)?
            .ok_or_else(|| SystemServiceError::Invariant("created session not found".to_string()))
    }

    pub fn get_session(&self, id: &str) -> Result<Option<SessionRecord>> {
        let conn = self.connect()?;
        conn.query_row(
            "SELECT id, title, kind, status, created_at, updated_at, archived_at
             FROM session WHERE id = ?",
            params![id],
            row_to_session,
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn list_sessions(&self, request: &ListSessions) -> Result<Vec<SessionRecord>> {
        validate_list_sessions(request)?;
        let conn = self.connect()?;
        let limit = i64::from(request.limit.unwrap_or(100).min(1000));
        let mut clauses: Vec<&str> = Vec::new();
        let mut values: Vec<SqlValue> = Vec::new();
        if let Some(kind) = &request.kind {
            clauses.push("kind = ?");
            values.push(SqlValue::Text(kind.clone()));
        }
        if let Some(status) = &request.status {
            clauses.push("status = ?");
            values.push(SqlValue::Text(status.clone()));
        }
        if let Some(updated_before) = request.updated_before {
            clauses.push("updated_at < ?");
            values.push(SqlValue::Integer(updated_before));
        }
        if let Some(updated_after) = request.updated_after {
            clauses.push("updated_at > ?");
            values.push(SqlValue::Integer(updated_after));
        }
        values.push(SqlValue::Integer(limit));

        let where_clause = if clauses.is_empty() {
            String::new()
        } else {
            format!(" WHERE {}", clauses.join(" AND "))
        };
        let sql = format!(
            "SELECT id, title, kind, status, created_at, updated_at, archived_at
             FROM session{where_clause}
             ORDER BY updated_at DESC, id ASC LIMIT ?"
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(params_from_iter(values), row_to_session)?;
        collect_rows(rows)
    }

    pub fn admit_session_input(&self, request: &AdmitSessionInput) -> Result<AdmissionReceipt> {
        validate_admit_session_input(request)?;
        let now = crate::util::now_ms();
        let input_id = request
            .id
            .clone()
            .unwrap_or_else(|| format!("inp_{}", Uuid::now_v7()));
        let input_type = request.input_type.as_deref().unwrap_or("user");
        let intent = request.intent.as_deref().unwrap_or("normal");
        let origin_json = request
            .origin
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        tx.execute(
            "INSERT OR IGNORE INTO session_input (
                id, session_id, principal_id, idempotency_key, input_type,
                content_json, origin_json, intent, run_control_policy,
                expected_turn_id, status, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'admitted', ?, ?)",
            params![
                input_id,
                request.session_id,
                request.principal_id,
                request.idempotency_key,
                input_type,
                serde_json::to_string(&request.content)?,
                origin_json,
                intent,
                now,
                now
            ],
        )?;
        let existing =
            get_input_by_idempotency_tx(&tx, &request.session_id, &request.idempotency_key)?;
        ensure_matching_input(&existing, request, input_type, intent)?;
        if existing.id == input_id {
            append_input_admitted_event_tx(&tx, &existing, now)?;
        }
        tx.commit()?;
        Ok(admission_receipt(&existing))
    }

    pub fn submit_session_turn(
        &self,
        request: &SubmitSessionTurn,
    ) -> Result<SubmitSessionTurnReceipt> {
        validate_submit_session_turn(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let receipt = submit_session_turn_tx(&tx, request, now)?;
        tx.commit()?;
        Ok(receipt)
    }

    pub fn list_session_inputs(&self, session_id: &str) -> Result<Vec<SessionInputRecord>> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare(
            "SELECT id, session_id, principal_id, idempotency_key, input_type,
                    content_json, origin_json, intent, run_control_policy,
                    expected_turn_id, status, created_at, updated_at
             FROM session_input
             WHERE session_id = ?
             ORDER BY created_at ASC, id ASC",
        )?;
        let rows = stmt.query_map(params![session_id], row_to_session_input)?;
        collect_rows(rows)
    }
}

pub(crate) fn submit_session_turn_tx(
    tx: &rusqlite::Transaction<'_>,
    request: &SubmitSessionTurn,
    now: i64,
) -> Result<SubmitSessionTurnReceipt> {
    validate_submit_session_turn(request)?;
    let input_id = request
        .id
        .clone()
        .unwrap_or_else(|| format!("inp_{}", Uuid::now_v7()));
    let turn_id = request
        .turn_id
        .clone()
        .unwrap_or_else(|| format!("turn_{}", Uuid::now_v7()));
    let job_id = request
        .job_id
        .clone()
        .unwrap_or_else(|| format!("job_{}", Uuid::now_v7()));
    let input_type = request.input_type.as_deref().unwrap_or("user");
    let intent = request.intent.as_deref().unwrap_or("normal");
    let origin_json = request
        .origin
        .as_ref()
        .map(serde_json::to_string)
        .transpose()?;

    if let Some(existing) =
        find_input_by_idempotency_tx(tx, &request.session_id, &request.idempotency_key)?
    {
        ensure_matching_submit_input(&existing, request, input_type, intent)?;
        let turn = get_turn_by_input_tx(tx, &existing.id)?.ok_or_else(|| {
            SystemServiceError::Invariant(
                "idempotent session input exists without its durable turn".to_string(),
            )
        })?;
        let job = crate::scheduler::get_job_tx(tx, &turn.job_id)?;
        return Ok(SubmitSessionTurnReceipt {
            admission: admission_receipt(&existing),
            turn,
            job,
        });
    }

    tx.execute(
        "INSERT INTO session_input (
            id, session_id, principal_id, idempotency_key, input_type,
            content_json, origin_json, intent, run_control_policy,
            expected_turn_id, status, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'admitted', ?, ?)",
        params![
            input_id,
            request.session_id,
            request.principal_id,
            request.idempotency_key,
            input_type,
            serde_json::to_string(&request.content)?,
            origin_json,
            intent,
            request.run_control_policy.as_deref(),
            request.expected_turn_id.as_deref(),
            now,
            now
        ],
    )?;
    let input = get_input_tx(tx, &input_id)?;
    append_input_admitted_event_tx(tx, &input, now)?;

    let job_idempotency_key = request
        .job_idempotency_key
        .clone()
        .unwrap_or_else(|| format!("session.turn:{}:{}", request.session_id, input_id));
    let payload = serde_json::json!({
        "sessionId": request.session_id,
        "turnId": turn_id,
        "inputId": input_id
    });
    let job = crate::scheduler::enqueue_job_tx(
        tx,
        &EnqueueJob {
            id: Some(job_id.clone()),
            kind: SchedulerJobKind::SessionTurn,
            principal_id: request.principal_id.clone(),
            payload,
            scheduled_at: request.scheduled_at,
            not_before: request.not_before,
            priority: request.priority,
            concurrency_key: Some(format!("session:{}", request.session_id)),
            max_attempts: Some(1),
            retry_policy: Some(RetryPolicy::default()),
            idempotency_key: Some(job_idempotency_key),
            budget_grant_id: request.budget_grant_id.clone(),
        },
        now,
    )?;
    if job.id != job_id || job.kind != "session.turn" {
        return Err(SystemServiceError::Invariant(
            "session turn job idempotency key resolved to a different job".to_string(),
        ));
    }

    let binding_digest = execution_binding_digest(&request.execution_binding)?;
    tx.execute(
        "INSERT INTO session_turn (
            id, session_id, primary_input_id, job_id, state,
            execution_binding_json, execution_binding_digest, max_steps,
            current_attempt_id, parent_turn_id, regenerates_turn_id,
            cancel_requested_at, cancel_reason, result_json, error_json,
            created_at, updated_at, finished_at
         ) VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, NULL, ?, ?, NULL, NULL,
                   NULL, NULL, ?, ?, NULL)",
        params![
            turn_id,
            request.session_id,
            input_id,
            job.id,
            serde_json::to_string(&request.execution_binding)?,
            binding_digest,
            request.max_steps.unwrap_or(32),
            request.parent_turn_id,
            request.regenerates_turn_id,
            now,
            now
        ],
    )?;
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        "session.turn.submitted",
        &EventScope {
            session_id: Some(request.session_id.clone()),
            turn_id: Some(turn_id.clone()),
            input_id: Some(input_id.clone()),
            ..EventScope::default()
        },
        &serde_json::json!({
            "turnId": turn_id,
            "inputId": input_id,
            "jobId": job.id,
            "executionBindingDigest": binding_digest,
            "state": "queued"
        }),
        now,
    )?;
    let turn = get_turn_tx(tx, &turn_id)?;
    Ok(SubmitSessionTurnReceipt {
        admission: admission_receipt(&input),
        turn,
        job,
    })
}

pub(crate) fn get_turn_tx(
    tx: &rusqlite::Transaction<'_>,
    turn_id: &str,
) -> Result<SessionTurnRecord> {
    tx.query_row(
        &format!("{SESSION_TURN_SELECT} WHERE id = ?"),
        params![turn_id],
        row_to_session_turn,
    )
    .map_err(Into::into)
}

pub(crate) fn get_optional_turn_tx(
    tx: &rusqlite::Transaction<'_>,
    turn_id: &str,
) -> Result<Option<SessionTurnRecord>> {
    tx.query_row(
        &format!("{SESSION_TURN_SELECT} WHERE id = ?"),
        params![turn_id],
        row_to_session_turn,
    )
    .optional()
    .map_err(Into::into)
}

fn get_turn_by_input_tx(
    tx: &rusqlite::Transaction<'_>,
    input_id: &str,
) -> Result<Option<SessionTurnRecord>> {
    tx.query_row(
        &format!("{SESSION_TURN_SELECT} WHERE primary_input_id = ?"),
        params![input_id],
        row_to_session_turn,
    )
    .optional()
    .map_err(Into::into)
}

pub(crate) fn get_input_tx(
    tx: &rusqlite::Transaction<'_>,
    input_id: &str,
) -> Result<SessionInputRecord> {
    tx.query_row(
        "SELECT id, session_id, principal_id, idempotency_key, input_type,
                content_json, origin_json, intent, run_control_policy,
                expected_turn_id, status, created_at, updated_at
         FROM session_input WHERE id = ?",
        params![input_id],
        row_to_session_input,
    )
    .map_err(Into::into)
}

fn find_input_by_idempotency_tx(
    tx: &rusqlite::Transaction<'_>,
    session_id: &str,
    idempotency_key: &str,
) -> Result<Option<SessionInputRecord>> {
    tx.query_row(
        "SELECT id, session_id, principal_id, idempotency_key, input_type,
                content_json, origin_json, intent, run_control_policy,
                expected_turn_id, status, created_at, updated_at
         FROM session_input WHERE session_id = ? AND idempotency_key = ?",
        params![session_id, idempotency_key],
        row_to_session_input,
    )
    .optional()
    .map_err(Into::into)
}

fn get_input_by_idempotency_tx(
    tx: &rusqlite::Transaction<'_>,
    session_id: &str,
    idempotency_key: &str,
) -> Result<SessionInputRecord> {
    find_input_by_idempotency_tx(tx, session_id, idempotency_key)?.ok_or_else(|| {
        SystemServiceError::Invariant("admitted session input not found".to_string())
    })
}

fn append_input_admitted_event_tx(
    tx: &rusqlite::Transaction<'_>,
    input: &SessionInputRecord,
    now: i64,
) -> Result<()> {
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        "session.input.admitted",
        &EventScope {
            session_id: Some(input.session_id.clone()),
            input_id: Some(input.id.clone()),
            ..EventScope::default()
        },
        &serde_json::json!({
            "inputId": input.id,
            "principalId": input.principal_id,
            "inputType": input.input_type,
            "intent": input.intent,
            "status": input.status
        }),
        now,
    )
}

fn admission_receipt(input: &SessionInputRecord) -> AdmissionReceipt {
    AdmissionReceipt {
        input_id: input.id.clone(),
        session_id: input.session_id.clone(),
        durability: "local-durable".to_string(),
        status: "admitted".to_string(),
    }
}

fn ensure_matching_input(
    existing: &SessionInputRecord,
    request: &AdmitSessionInput,
    input_type: &str,
    intent: &str,
) -> Result<()> {
    if existing.principal_id != request.principal_id
        || existing.input_type != input_type
        || existing.content != request.content
        || existing.origin != request.origin
        || existing.intent != intent
    {
        return Err(SystemServiceError::Invariant(
            "conflicting repeated session input admission".to_string(),
        ));
    }
    Ok(())
}

fn ensure_matching_submit_input(
    existing: &SessionInputRecord,
    request: &SubmitSessionTurn,
    input_type: &str,
    intent: &str,
) -> Result<()> {
    if existing.principal_id != request.principal_id
        || existing.input_type != input_type
        || existing.content != request.content
        || existing.origin != request.origin
        || existing.intent != intent
        || existing.run_control_policy != request.run_control_policy
        || existing.expected_turn_id != request.expected_turn_id
    {
        return Err(SystemServiceError::Invariant(
            "conflicting repeated session turn submission".to_string(),
        ));
    }
    Ok(())
}

fn execution_binding_digest(binding: &serde_json::Value) -> Result<String> {
    let object = binding.as_object().ok_or_else(|| {
        SystemServiceError::InvalidJobRequest("execution_binding must be an object".to_string())
    })?;
    let allowed_binding_keys = [
        "digest",
        "createdAt",
        "provider",
        "resources",
        "recovery",
        "contextSnapshot",
        "toolSnapshot",
        "permissionSnapshot",
        "environmentSnapshot",
    ];
    if object
        .keys()
        .any(|key| !allowed_binding_keys.contains(&key.as_str()))
    {
        return Err(SystemServiceError::InvalidJobRequest(
            "execution_binding contains an unknown field".to_string(),
        ));
    }
    if object
        .get("createdAt")
        .and_then(serde_json::Value::as_i64)
        .is_none()
    {
        return Err(SystemServiceError::InvalidJobRequest(
            "execution_binding.createdAt must be an integer".to_string(),
        ));
    }
    let digest = binding_string(object, "digest")?;
    validate_sha256(digest, "execution_binding.digest")?;
    let provider = object
        .get("provider")
        .and_then(serde_json::Value::as_object)
        .ok_or_else(|| {
            SystemServiceError::InvalidJobRequest(
                "execution_binding.provider must be an object".to_string(),
            )
        })?;
    validate_provider_binding(provider)?;
    let resources = object
        .get("resources")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| {
            SystemServiceError::InvalidJobRequest(
                "execution_binding.resources must be an array".to_string(),
            )
        })?;
    validate_resource_bindings(resources)?;
    let recovery = object
        .get("recovery")
        .and_then(serde_json::Value::as_object)
        .ok_or_else(|| {
            SystemServiceError::InvalidJobRequest(
                "execution_binding.recovery must be an object".to_string(),
            )
        })?;
    validate_recovery_binding(recovery)?;

    let mut unsigned = object.clone();
    unsigned.remove("digest");
    let actual = crate::util::hex_sha256(
        serde_json::to_string(&serde_json::Value::Object(unsigned))?.as_bytes(),
    );
    if actual != digest {
        return Err(SystemServiceError::InvalidJobRequest(
            "execution_binding.digest does not match its content".to_string(),
        ));
    }
    Ok(digest.to_string())
}

fn validate_recovery_binding(recovery: &serde_json::Map<String, serde_json::Value>) -> Result<()> {
    let allowed_keys = ["providerMaxAttempts", "idempotentToolMaxAttempts"];
    if recovery
        .keys()
        .any(|key| !allowed_keys.contains(&key.as_str()))
        || recovery.len() != allowed_keys.len()
    {
        return Err(SystemServiceError::InvalidJobRequest(
            "execution_binding.recovery contains missing or unknown fields".to_string(),
        ));
    }
    for key in allowed_keys {
        if recovery
            .get(key)
            .and_then(serde_json::Value::as_i64)
            .is_none_or(|value| value <= 0)
        {
            return Err(SystemServiceError::InvalidJobRequest(format!(
                "execution_binding.recovery.{key} must be a positive integer"
            )));
        }
    }
    Ok(())
}

fn validate_provider_binding(provider: &serde_json::Map<String, serde_json::Value>) -> Result<()> {
    let allowed_provider_keys = [
        "profileId",
        "profileDigest",
        "adapterId",
        "providerId",
        "modelId",
        "capabilities",
        "baseUrl",
        "secretRef",
        "anthropicVersion",
        "requestConfig",
    ];
    if provider
        .keys()
        .any(|key| !allowed_provider_keys.contains(&key.as_str()))
    {
        return Err(SystemServiceError::InvalidJobRequest(
            "execution_binding.provider contains an unknown field".to_string(),
        ));
    }
    let profile_digest = binding_string(provider, "profileDigest")?;
    validate_sha256(profile_digest, "execution_binding.provider.profileDigest")?;
    let adapter_id = binding_string(provider, "adapterId")?;
    if !matches!(
        adapter_id,
        "fake" | "openai-compatible" | "anthropic" | "deepseek"
    ) {
        return Err(SystemServiceError::InvalidJobRequest(
            "execution_binding.provider.adapterId is invalid".to_string(),
        ));
    }
    let capabilities = provider
        .get("capabilities")
        .and_then(serde_json::Value::as_object)
        .ok_or_else(|| {
            SystemServiceError::InvalidJobRequest(
                "execution_binding.provider.capabilities must be an object".to_string(),
            )
        })?;
    validate_provider_capabilities(adapter_id, capabilities)?;

    let mut profile = serde_json::Map::new();
    profile.insert(
        "id".to_string(),
        serde_json::Value::String(binding_string(provider, "profileId")?.to_string()),
    );
    profile.insert(
        "kind".to_string(),
        serde_json::Value::String(adapter_id.to_string()),
    );
    for key in ["providerId", "modelId"] {
        profile.insert(
            key.to_string(),
            serde_json::Value::String(binding_string(provider, key)?.to_string()),
        );
    }
    profile.insert(
        "capabilities".to_string(),
        serde_json::Value::Object(capabilities.clone()),
    );
    for key in ["baseUrl", "secretRef", "anthropicVersion"] {
        if let Some(value) = provider.get(key) {
            let value = value
                .as_str()
                .filter(|value| !value.is_empty())
                .ok_or_else(|| {
                    SystemServiceError::InvalidJobRequest(format!(
                        "execution_binding.provider.{key} must be a non-empty string"
                    ))
                })?;
            profile.insert(
                key.to_string(),
                serde_json::Value::String(value.to_string()),
            );
        }
    }
    let actual = crate::util::hex_sha256(
        serde_json::to_string(&serde_json::Value::Object(profile))?.as_bytes(),
    );
    if actual != profile_digest {
        return Err(SystemServiceError::InvalidJobRequest(
            "execution_binding.provider.profileDigest does not match its content".to_string(),
        ));
    }
    Ok(())
}

fn validate_provider_capabilities(
    adapter_id: &str,
    capabilities: &serde_json::Map<String, serde_json::Value>,
) -> Result<()> {
    if capabilities.len() != 2
        || !capabilities.contains_key("input")
        || !capabilities.contains_key("output")
    {
        return Err(SystemServiceError::InvalidJobRequest(
            "execution_binding.provider.capabilities contains missing or unknown fields"
                .to_string(),
        ));
    }
    let inputs = capability_strings(capabilities, "input")?;
    let outputs = capability_strings(capabilities, "output")?;
    if !inputs.iter().any(|value| value == "text") || !outputs.iter().any(|value| value == "text") {
        return Err(SystemServiceError::InvalidJobRequest(
            "conversational provider capabilities require text input and output".to_string(),
        ));
    }
    let supported_inputs: &[&str] = match adapter_id {
        "fake" => &["text", "image", "audio", "video", "document"],
        "openai-compatible" => &["text", "image"],
        "anthropic" => &["text", "image", "document"],
        "deepseek" => &["text"],
        _ => unreachable!("adapter id was validated above"),
    };
    if inputs
        .iter()
        .any(|value| !supported_inputs.contains(&value.as_str()))
        || outputs.iter().any(|value| value != "text")
    {
        return Err(SystemServiceError::InvalidJobRequest(format!(
            "execution_binding.provider.capabilities are not supported by {adapter_id}"
        )));
    }
    Ok(())
}

fn capability_strings(
    capabilities: &serde_json::Map<String, serde_json::Value>,
    key: &str,
) -> Result<Vec<String>> {
    let values = capabilities
        .get(key)
        .and_then(serde_json::Value::as_array)
        .filter(|values| !values.is_empty())
        .ok_or_else(|| {
            SystemServiceError::InvalidJobRequest(format!(
                "execution_binding.provider.capabilities.{key} must be a non-empty array"
            ))
        })?;
    let mut result = Vec::with_capacity(values.len());
    for value in values {
        let value = value.as_str().ok_or_else(|| {
            SystemServiceError::InvalidJobRequest(format!(
                "execution_binding.provider.capabilities.{key} must contain strings"
            ))
        })?;
        if result.iter().any(|existing| existing == value) {
            return Err(SystemServiceError::InvalidJobRequest(format!(
                "execution_binding.provider.capabilities.{key} contains a duplicate"
            )));
        }
        result.push(value.to_string());
    }
    Ok(result)
}

fn validate_resource_bindings(resources: &[serde_json::Value]) -> Result<()> {
    let mut resource_ids = std::collections::HashSet::new();
    for resource in resources {
        let object = resource.as_object().ok_or_else(|| {
            SystemServiceError::InvalidJobRequest(
                "execution_binding.resources must contain objects".to_string(),
            )
        })?;
        let allowed_keys = ["resourceId", "sha256", "sizeBytes", "kind", "mediaType"];
        if object
            .keys()
            .any(|key| !allowed_keys.contains(&key.as_str()))
            || !(4..=5).contains(&object.len())
        {
            return Err(SystemServiceError::InvalidJobRequest(
                "execution_binding resource contains missing or unknown fields".to_string(),
            ));
        }
        let resource_id = binding_string(object, "resourceId")?;
        if !resource_ids.insert(resource_id.to_string()) {
            return Err(SystemServiceError::InvalidJobRequest(
                "execution_binding resources contain a duplicate resourceId".to_string(),
            ));
        }
        validate_sha256(
            binding_string(object, "sha256")?,
            "execution_binding.resources.sha256",
        )?;
        if object
            .get("sizeBytes")
            .and_then(serde_json::Value::as_i64)
            .is_none_or(|value| value <= 0)
        {
            return Err(SystemServiceError::InvalidJobRequest(
                "execution_binding.resources.sizeBytes must be a positive integer".to_string(),
            ));
        }
        if !matches!(
            binding_string(object, "kind")?,
            "file"
                | "image"
                | "video"
                | "audio"
                | "document"
                | "artifact"
                | "log"
                | "patch"
                | "url"
        ) {
            return Err(SystemServiceError::InvalidJobRequest(
                "execution_binding.resources.kind is invalid".to_string(),
            ));
        }
        if let Some(media_type) = object.get("mediaType") {
            if media_type.as_str().is_none_or(str::is_empty) {
                return Err(SystemServiceError::InvalidJobRequest(
                    "execution_binding.resources.mediaType must be a non-empty string".to_string(),
                ));
            }
        }
    }
    Ok(())
}

fn binding_string<'a>(
    object: &'a serde_json::Map<String, serde_json::Value>,
    key: &str,
) -> Result<&'a str> {
    object
        .get(key)
        .and_then(serde_json::Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            SystemServiceError::InvalidJobRequest(format!(
                "execution_binding.{key} must be a non-empty string"
            ))
        })
}

fn validate_sha256(value: &str, label: &str) -> Result<()> {
    if value.len() != 64
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(SystemServiceError::InvalidJobRequest(format!(
            "{label} must be a lowercase sha256 digest"
        )));
    }
    Ok(())
}

fn validate_submit_session_turn(request: &SubmitSessionTurn) -> Result<()> {
    validate_session_identity(
        &request.session_id,
        &request.principal_id,
        &request.idempotency_key,
    )?;
    if request.max_steps.unwrap_or(32) <= 0 {
        return Err(SystemServiceError::InvalidJobRequest(
            "max_steps must be positive".to_string(),
        ));
    }
    execution_binding_digest(&request.execution_binding)?;
    Ok(())
}

fn validate_admit_session_input(request: &AdmitSessionInput) -> Result<()> {
    validate_session_identity(
        &request.session_id,
        &request.principal_id,
        &request.idempotency_key,
    )
}

fn validate_session_identity(
    session_id: &str,
    principal_id: &str,
    idempotency_key: &str,
) -> Result<()> {
    if session_id.is_empty() || principal_id.is_empty() || idempotency_key.is_empty() {
        return Err(SystemServiceError::InvalidJobRequest(
            "session_id, principal_id, and idempotency_key must not be empty".to_string(),
        ));
    }
    Ok(())
}

fn validate_list_sessions(request: &ListSessions) -> Result<()> {
    if request.limit == Some(0) {
        return Err(SystemServiceError::InvalidInput(
            "session list limit must be positive".to_string(),
        ));
    }
    Ok(())
}

fn collect_rows<T>(rows: impl Iterator<Item = rusqlite::Result<T>>) -> Result<Vec<T>> {
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}
