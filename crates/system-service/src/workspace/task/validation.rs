use crate::{
    BeginWorkspaceTaskCollection, BeginWorkspaceTaskRun, FinalizeWorkspaceTaskCollection, Result,
    SystemServiceError, WorkspaceTaskRunRecord,
};
use serde_json::Value;
use std::collections::HashSet;
use std::path::Path;

const MAX_LEASE_MS: i64 = 300_000;
const MAX_SUMMARY_LENGTH: usize = 4_000;
const MAX_FAILURE_BYTES: usize = 32 * 1024;
const MAX_RESOURCE_IDS: usize = 1_024;

pub(super) fn validate_begin(request: &BeginWorkspaceTaskRun) -> Result<()> {
    require_non_empty(&request.id, "workspace task run id")?;
    require_non_empty(&request.workspace_id, "workspace id")?;
    require_non_empty(&request.principal_id, "workspace task principal id")?;
    require_opaque_id(&request.repository_id, "workspace repository id")?;
    require_opaque_id(&request.isolation_id, "workspace isolation id")?;
    if !matches!(request.access.as_str(), "read_only" | "writable") {
        return Err(SystemServiceError::InvalidInput(format!(
            "invalid workspace task access: {}",
            request.access
        )));
    }
    validate_claim(
        &request.id,
        &request.attempt_id,
        &request.owner_id,
        &request.claim_token,
        request.lease_ms,
    )
}

pub(super) fn validate_claim(
    run_id: &str,
    attempt_id: &str,
    owner_id: &str,
    claim_token: &str,
    lease_ms: i64,
) -> Result<()> {
    require_non_empty(run_id, "workspace task run id")?;
    require_non_empty(attempt_id, "workspace task attempt id")?;
    require_non_empty(owner_id, "workspace task owner id")?;
    validate_identity(run_id, attempt_id, claim_token)?;
    validate_lease(lease_ms)
}

pub(super) fn validate_identity(run_id: &str, attempt_id: &str, claim_token: &str) -> Result<()> {
    require_non_empty(run_id, "workspace task run id")?;
    require_non_empty(attempt_id, "workspace task attempt id")?;
    if !(32..=512).contains(&claim_token.len()) {
        return Err(SystemServiceError::InvalidInput(
            "workspace task claim token length is invalid".to_string(),
        ));
    }
    Ok(())
}

pub(super) fn validate_collection(request: &BeginWorkspaceTaskCollection) -> Result<()> {
    if !matches!(
        request.execution_outcome.as_str(),
        "completed" | "failed" | "cancelled"
    ) {
        return Err(SystemServiceError::InvalidInput(format!(
            "invalid workspace task execution outcome: {}",
            request.execution_outcome
        )));
    }
    if request
        .summary
        .as_ref()
        .is_some_and(|value| value.trim().is_empty() || value.len() > MAX_SUMMARY_LENGTH)
    {
        return Err(SystemServiceError::InvalidInput(
            "workspace task summary is empty or too long".to_string(),
        ));
    }
    if request.resource_ids.len() > MAX_RESOURCE_IDS
        || request.resource_ids.iter().any(String::is_empty)
        || request.resource_ids.iter().collect::<HashSet<_>>().len() != request.resource_ids.len()
    {
        return Err(SystemServiceError::InvalidInput(
            "workspace task resource ids are invalid".to_string(),
        ));
    }
    if request.execution_outcome == "completed" && request.failure.is_some() {
        return Err(SystemServiceError::InvalidInput(
            "completed workspace task execution cannot contain failure".to_string(),
        ));
    }
    if request.execution_outcome != "completed" && request.failure.is_none() {
        return Err(SystemServiceError::InvalidInput(
            "stopped workspace task execution requires failure evidence".to_string(),
        ));
    }
    if let Some(failure) = request.failure.as_ref() {
        validate_json_size(failure, "workspace task failure")?;
    }
    Ok(())
}

pub(super) fn validate_finalization(request: &FinalizeWorkspaceTaskCollection) -> Result<()> {
    if !matches!(
        request.outcome.as_str(),
        "read_only_completed" | "no_changes" | "proposed" | "execution_failed" | "cancelled"
    ) {
        return Err(SystemServiceError::InvalidInput(format!(
            "invalid workspace task outcome: {}",
            request.outcome
        )));
    }
    if request.outcome == "proposed" {
        if request.changeset.is_none() || request.proposal_id.as_ref().is_none_or(String::is_empty)
        {
            return Err(SystemServiceError::InvalidInput(
                "proposed workspace task requires changeset and proposal id".to_string(),
            ));
        }
    } else if request.changeset.is_some()
        || request.proposal_id.is_some()
        || request.title.is_some()
        || request.proposal_metadata.is_some()
    {
        return Err(SystemServiceError::InvalidInput(
            "non-proposed workspace task cannot contain proposal fields".to_string(),
        ));
    }
    if let Some(metadata) = request.proposal_metadata.as_ref() {
        validate_json_size(metadata, "workspace task proposal metadata")?;
    }
    Ok(())
}

pub(super) fn validate_revision(value: Option<&str>) -> Result<()> {
    if let Some(value) = value {
        if !matches!(value.len(), 40 | 64) || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Err(SystemServiceError::InvalidInput(
                "workspace task base revision must be a Git object id".to_string(),
            ));
        }
    }
    Ok(())
}

pub(super) fn validate_runtime_ref(value: Option<&str>) -> Result<()> {
    if let Some(value) = value {
        if value.is_empty()
            || Path::new(value).is_absolute()
            || value.contains('\\')
            || value.contains("..")
            || value.contains("://")
        {
            return Err(SystemServiceError::InvalidInput(
                "workspace task runtime ref is invalid".to_string(),
            ));
        }
    }
    Ok(())
}

pub(super) fn validate_run_state(state: &str) -> Result<()> {
    if matches!(
        state,
        "preparing" | "active" | "collecting" | "proposed" | "releasing" | "released" | "attention"
    ) {
        Ok(())
    } else {
        Err(SystemServiceError::InvalidInput(format!(
            "invalid workspace task run state: {state}"
        )))
    }
}

pub(super) fn require_state(run: &WorkspaceTaskRunRecord, from: &str, to: &str) -> Result<()> {
    if run.state == from {
        Ok(())
    } else {
        Err(SystemServiceError::Conflict(format!(
            "workspace task cannot transition from {} to {to}",
            run.state
        )))
    }
}

pub(super) fn validate_lease(lease_ms: i64) -> Result<()> {
    if !(10..=MAX_LEASE_MS).contains(&lease_ms) {
        return Err(SystemServiceError::InvalidInput(format!(
            "workspace task lease must be between 10 and {MAX_LEASE_MS} milliseconds"
        )));
    }
    Ok(())
}

pub(super) fn checked_lease(now: i64, lease_ms: i64) -> Result<i64> {
    validate_lease(lease_ms)?;
    now.checked_add(lease_ms).ok_or_else(|| {
        SystemServiceError::InvalidInput("workspace task lease overflow".to_string())
    })
}

pub(super) fn require_non_empty(value: &str, label: &str) -> Result<()> {
    if value.is_empty() {
        Err(SystemServiceError::InvalidInput(format!(
            "{label} must not be empty"
        )))
    } else {
        Ok(())
    }
}

fn require_opaque_id(value: &str, label: &str) -> Result<()> {
    require_non_empty(value, label)?;
    if value.len() > 256
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-' | b'.' | b':'))
    {
        return Err(SystemServiceError::InvalidInput(format!(
            "{label} must be an opaque identifier"
        )));
    }
    Ok(())
}

pub(super) fn validate_json_size(value: &Value, label: &str) -> Result<()> {
    if serde_json::to_vec(value)?.len() > MAX_FAILURE_BYTES {
        return Err(SystemServiceError::InvalidInput(format!(
            "{label} exceeds {MAX_FAILURE_BYTES} bytes"
        )));
    }
    Ok(())
}

pub(super) fn optional_json(value: &Option<Value>) -> Result<Option<String>> {
    value
        .as_ref()
        .map(serde_json::to_string)
        .transpose()
        .map_err(Into::into)
}
