use super::*;
use crate::{
    CheckpointProviderInvocation, RecordResourceProvenance, ResourceInputEvidence,
    ResourceProvenanceCause,
};
use serde_json::Value;
use std::collections::HashSet;

const MAX_CHECKPOINT_BYTES: usize = 8 * 1024 * 1024;

impl SystemService {
    pub fn checkpoint_provider_invocation(
        &self,
        request: &CheckpointProviderInvocation,
    ) -> Result<Option<ProviderInvocationRecord>> {
        validate_identity(request_identity(request))?;
        crate::sessions::validate_sha256(&request.response_digest, "provider response digest")?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let Some(binding_digest) = validate_lease(&tx, request_identity(request), now)? else {
            return Ok(None);
        };
        let invocation = get_provider_invocation_tx(&tx, &request.invocation_id)?;
        ensure_invocation_identity(&invocation, request_identity(request))?;
        if invocation.execution_binding_digest != binding_digest
            || crate::util::digest_json(&request.response) != request.response_digest
        {
            return Err(invalid(
                "provider checkpoint digest or binding does not match",
            ));
        }
        if let Some(existing) = &invocation.response_checkpoint {
            if existing != &request.response
                || invocation.response_digest.as_ref() != Some(&request.response_digest)
                || invocation.provider_request_id != request.provider_request_id
            {
                return Err(invalid("conflicting repeated provider checkpoint"));
            }
            tx.commit()?;
            return Ok(Some(invocation));
        }
        if invocation.state != "output_observed" || !invocation.output_observed {
            return Err(invalid("provider checkpoint requires observed output"));
        }
        let turn = crate::sessions::get_turn_tx(&tx, &request.turn_id)?;
        let resources = validate_response_tx(&tx, &request.response, &turn.execution_binding)?;
        tx.execute("UPDATE provider_invocation SET state = 'output_ready', response_checkpoint_json = ?,
            response_digest = ?, provider_request_id = COALESCE(?, provider_request_id), updated_at = ?
            WHERE id = ? AND state = 'output_observed'", params![
            serde_json::to_string(&request.response)?, request.response_digest, request.provider_request_id, now, invocation.id
        ])?;
        for (part_id, resource) in resources {
            crate::resources::record_resource_provenance_tx(
                &tx,
                &RecordResourceProvenance {
                    resource,
                    cause: ResourceProvenanceCause::ProviderOutput {
                        invocation_id: invocation.id.clone(),
                        part_id,
                    },
                    input_resources: invocation.input_resources.clone(),
                },
                now,
            )?;
        }
        let invocation = get_provider_invocation_tx(&tx, &request.invocation_id)?;
        append_provider_event_tx(
            &tx,
            "session.provider_invocation.output_ready",
            &invocation,
            &serde_json::json!({ "responseDigest": request.response_digest }),
            now,
        )?;
        tx.commit()?;
        Ok(Some(invocation))
    }
}

pub(crate) fn validate_publication_tx(
    tx: &rusqlite::Transaction<'_>,
    invocation: &ProviderInvocationRecord,
    content: &Value,
    provider_state: Option<&Value>,
) -> Result<()> {
    if let Some(response) = &invocation.response_checkpoint {
        if !matches!(invocation.state.as_str(), "output_ready" | "succeeded")
            || invocation.response_digest.as_deref()
                != Some(crate::util::digest_json(response).as_str())
            || response.get("parts") != Some(content)
            || response.get("providerState") != provider_state
        {
            return Err(invalid(
                "provider publication does not match its immutable response checkpoint",
            ));
        }
        for part in content
            .as_array()
            .ok_or_else(|| invalid("provider parts must be an array"))?
        {
            if part.get("type").and_then(Value::as_str) == Some("resource") {
                let evidence: ResourceInputEvidence = serde_json::from_value(part.clone())?;
                crate::resources::validate_resource_input_evidence_tx(tx, &evidence)?;
                let exists: bool = tx.query_row(
                    "SELECT EXISTS(SELECT 1 FROM resource_provenance
                    WHERE resource_id = ? AND cause_kind = 'provider_output' AND cause_id = ?)",
                    params![evidence.resource_id, invocation.id],
                    |row| row.get(0),
                )?;
                if !exists {
                    return Err(invalid(
                        "provider publication is missing resource provenance",
                    ));
                }
            }
        }
    } else {
        reject_uncheckpointed_images_tx(tx, content)?;
    }
    Ok(())
}

pub(crate) fn reject_uncheckpointed_images_tx(
    tx: &rusqlite::Transaction<'_>,
    content: &Value,
) -> Result<()> {
    if let Some(parts) = content.as_array() {
        for part in parts {
            if part.get("type").and_then(Value::as_str) == Some("resource") {
                let evidence: ResourceInputEvidence = serde_json::from_value(part.clone())?;
                let resource =
                    crate::resources::validate_resource_input_evidence_tx(tx, &evidence)?;
                if resource.origin == "model_output" && resource.kind == "image" {
                    return Err(invalid(
                        "direct provider image publication requires an invocation checkpoint",
                    ));
                }
            }
        }
    }
    Ok(())
}

fn validate_response_tx(
    tx: &rusqlite::Transaction<'_>,
    response: &Value,
    binding: &Value,
) -> Result<Vec<(String, ResourceInputEvidence)>> {
    if serde_json::to_vec(response)?.len() > MAX_CHECKPOINT_BYTES {
        return Err(invalid("provider checkpoint exceeds its byte limit"));
    }
    object_keys(response, &["parts", "providerState", "usage", "finish"])?;
    let endpoint = &binding["modelEndpoint"];
    if !endpoint["model"]["outputModalities"]
        .as_array()
        .is_some_and(|values| values.iter().any(|value| value == "image"))
    {
        return Err(invalid("frozen model does not support image output"));
    }
    let finish = &response["finish"];
    object_keys(finish, &["type", "reason", "rawReason"])?;
    if finish["type"] != "finish"
        || !matches!(finish["reason"].as_str(), Some("stop" | "tool_calls"))
    {
        return Err(invalid(
            "image checkpoint requires a complete provider response",
        ));
    }
    let states = response["providerState"]
        .as_array()
        .ok_or_else(|| invalid("checkpoint provider state must be an array"))?;
    for state in states {
        object_keys(
            state,
            &[
                "providerId",
                "modelId",
                "stateKind",
                "replayPolicy",
                "payload",
            ],
        )?;
        if state["providerId"] != endpoint["connection"]["providerId"]
            || state["modelId"] != endpoint["model"]["id"]
            || !matches!(
                state["stateKind"].as_str(),
                Some("reasoning" | "thinking" | "tool_replay" | "response_id" | "opaque")
            )
            || !matches!(
                state["replayPolicy"].as_str(),
                Some("required" | "optional" | "forbidden")
            )
            || state.get("payload").is_none()
        {
            return Err(invalid(
                "checkpoint provider state has an invalid scope or shape",
            ));
        }
    }
    if let Some(usage) = response.get("usage") {
        object_keys(
            usage,
            &[
                "inputTokens",
                "outputTokens",
                "reasoningTokens",
                "cacheReadTokens",
                "cacheWriteTokens",
                "metadata",
            ],
        )?;
        for (key, value) in usage.as_object().expect("validated usage object") {
            if key == "metadata" {
                if !value.is_object() {
                    return Err(invalid("provider usage metadata must be an object"));
                }
            } else if !value
                .as_u64()
                .is_some_and(|value| value <= 9_007_199_254_740_991)
            {
                return Err(invalid(
                    "provider usage must be a non-negative safe integer",
                ));
            }
        }
    }
    let parts = response["parts"]
        .as_array()
        .ok_or_else(|| invalid("checkpoint parts must be an array"))?;
    let mut ids = HashSet::new();
    let mut resources = Vec::new();
    let mut total = 0;
    let mut tools = HashSet::new();
    for part in parts {
        let id = part["id"]
            .as_str()
            .filter(|id| !id.is_empty())
            .ok_or_else(|| invalid("checkpoint part id is required"))?;
        if !ids.insert(id) {
            return Err(invalid("checkpoint part identity is duplicated"));
        }
        match part["type"].as_str() {
            Some("resource") => {
                object_keys(
                    part,
                    &[
                        "type",
                        "id",
                        "visibility",
                        "resourceId",
                        "sha256",
                        "sizeBytes",
                        "kind",
                        "mediaType",
                    ],
                )?;
                let resource: ResourceInputEvidence = serde_json::from_value(part.clone())?;
                let stored = crate::resources::validate_resource_input_evidence_tx(tx, &resource)?;
                if id.len() > 128
                    || stored.origin != "model_output"
                    || stored.kind != "image"
                    || !matches!(
                        stored.media_type.as_deref(),
                        Some("image/png" | "image/jpeg" | "image/webp")
                    )
                    || stored.size_bytes > 25 * 1024 * 1024
                {
                    return Err(invalid(
                        "provider checkpoint contains an invalid image resource",
                    ));
                }
                total += stored.size_bytes;
                resources.push((id.to_string(), resource));
            }
            Some("text" | "reasoning") => {
                object_keys(part, &["type", "id", "text", "visibility", "providerState"])?;
                if !part["text"].is_string() {
                    return Err(invalid("checkpoint text must be a string"));
                }
            }
            Some("tool_call") => {
                object_keys(part, &["type", "id", "toolCallId", "toolName", "input"])?;
                if !part["toolName"]
                    .as_str()
                    .is_some_and(|value| !value.is_empty())
                    || !part["input"].is_object()
                    || !part["toolCallId"]
                        .as_str()
                        .is_some_and(|value| !value.is_empty() && tools.insert(value))
                {
                    return Err(invalid("checkpoint tool call is invalid"));
                }
            }
            _ => return Err(invalid("checkpoint contains an unsupported provider part")),
        }
    }
    if resources.is_empty()
        || resources.len() > 16
        || total > 50 * 1024 * 1024
        || (finish["reason"] == "tool_calls") != !tools.is_empty()
    {
        return Err(invalid(
            "checkpoint image bounds or tool finish evidence is invalid",
        ));
    }
    Ok(resources)
}

fn object_keys(value: &Value, allowed: &[&str]) -> Result<()> {
    if !value
        .as_object()
        .is_some_and(|object| object.keys().all(|key| allowed.contains(&key.as_str())))
    {
        return Err(invalid("provider checkpoint object has an invalid shape"));
    }
    Ok(())
}

fn invalid(message: &str) -> SystemServiceError {
    SystemServiceError::Invariant(message.to_string())
}
