use crate::{
    BeginWorkspaceChangeTransaction, FinalizeWorkspaceChangeTransaction, Result,
    SystemServiceError, WorkspaceChangeTransactionFilePlan,
};
use sha2::{Digest, Sha256};
use std::collections::HashSet;

pub(super) fn validate_begin(request: &BeginWorkspaceChangeTransaction) -> Result<()> {
    if request.id.is_empty()
        || request.workspace_id.is_empty()
        || request.changeset_id.is_empty()
        || request.source_id.is_empty()
        || request.idempotency_key.is_empty()
        || request.attempt_id.is_empty()
        || request.owner_id.is_empty()
    {
        return Err(SystemServiceError::InvalidInput(
            "workspace transaction identifiers must not be empty".to_string(),
        ));
    }
    if !matches!(request.operation.as_str(), "apply" | "undo") {
        return Err(SystemServiceError::InvalidInput(format!(
            "invalid workspace transaction operation: {}",
            request.operation
        )));
    }
    if !matches!(request.source_kind.as_str(), "proposal" | "tool" | "host") {
        return Err(SystemServiceError::InvalidInput(format!(
            "invalid workspace transaction source kind: {}",
            request.source_kind
        )));
    }
    if (request.operation == "undo") != request.undo_source_operation_id.is_some() {
        return Err(SystemServiceError::InvalidInput(
            "workspace undo transaction requires exactly one source operation".to_string(),
        ));
    }
    if request.source_kind == "proposal" {
        let proposal = request.proposal.as_ref().ok_or_else(|| {
            SystemServiceError::InvalidInput(
                "proposal workspace transaction requires proposal binding".to_string(),
            )
        })?;
        if proposal.proposal_id != request.source_id
            || proposal.proposal_id.is_empty()
            || proposal.proposal_attempt_id.is_empty()
        {
            return Err(SystemServiceError::InvalidInput(
                "workspace transaction proposal binding does not match source".to_string(),
            ));
        }
        validate_token(&proposal.proposal_claim_token)?;
    } else if request.proposal.is_some() {
        return Err(SystemServiceError::InvalidInput(
            "non-proposal workspace transaction cannot contain proposal binding".to_string(),
        ));
    }
    validate_sha256(&request.root_identity_sha256, "workspace root identity")?;
    validate_token(&request.claim_token)?;
    validate_lease(request.lease_ms)
}

pub(super) fn validate_claim(
    transaction_id: &str,
    attempt_id: &str,
    owner_id: Option<&str>,
    claim_token: &str,
    lease_ms: Option<i64>,
) -> Result<()> {
    if transaction_id.is_empty() || attempt_id.is_empty() || owner_id.is_some_and(str::is_empty) {
        return Err(SystemServiceError::InvalidInput(
            "workspace transaction claim identifiers must not be empty".to_string(),
        ));
    }
    validate_token(claim_token)?;
    if let Some(lease_ms) = lease_ms {
        validate_lease(lease_ms)?;
    }
    Ok(())
}

pub(super) fn validate_plan(files: &[WorkspaceChangeTransactionFilePlan]) -> Result<String> {
    if files.is_empty() || files.len() > 10_000 {
        return Err(SystemServiceError::InvalidInput(
            "workspace transaction plan must contain between 1 and 10000 files".to_string(),
        ));
    }
    let mut paths = HashSet::with_capacity(files.len());
    for (index, file) in files.iter().enumerate() {
        if file.ordinal != index as i64 {
            return Err(SystemServiceError::InvalidInput(
                "workspace transaction file ordinals must be contiguous from zero".to_string(),
            ));
        }
        validate_relative_path(&file.path)?;
        if !paths.insert(file.path.as_str()) {
            return Err(SystemServiceError::InvalidInput(format!(
                "workspace transaction path appears more than once: {}",
                file.path
            )));
        }
        validate_text_evidence(
            file.before_text.as_deref(),
            file.before_sha256.as_deref(),
            "before",
        )?;
        validate_text_evidence(
            file.after_text.as_deref(),
            file.after_sha256.as_deref(),
            "after",
        )?;
        if file.before_text.is_none() && file.after_text.is_none() {
            return Err(SystemServiceError::InvalidInput(format!(
                "workspace transaction file has no before or after content: {}",
                file.path
            )));
        }
        if file.before_text == file.after_text {
            return Err(SystemServiceError::InvalidInput(format!(
                "workspace transaction file does not change content: {}",
                file.path
            )));
        }
    }
    let encoded = serde_json::to_vec(files)?;
    Ok(sha256_bytes(&encoded))
}

pub(super) fn validate_finalize(request: &FinalizeWorkspaceChangeTransaction) -> Result<()> {
    validate_claim(
        &request.transaction_id,
        &request.attempt_id,
        None,
        &request.claim_token,
        None,
    )?;
    if !matches!(
        request.outcome.as_str(),
        "applied" | "conflicted" | "rolled_back" | "recovery_required"
    ) {
        return Err(SystemServiceError::InvalidInput(format!(
            "invalid workspace transaction outcome: {}",
            request.outcome
        )));
    }
    let requires_operation = matches!(request.outcome.as_str(), "applied" | "conflicted");
    if requires_operation != request.operation_id.is_some()
        || requires_operation != request.receipt.is_some()
    {
        return Err(SystemServiceError::InvalidInput(
            "workspace transaction operation and receipt evidence do not match outcome".to_string(),
        ));
    }
    if request.outcome == "recovery_required" && request.failure.is_none() {
        return Err(SystemServiceError::InvalidInput(
            "recovery-required workspace transaction requires failure evidence".to_string(),
        ));
    }
    if request.outcome != "recovery_required" && request.failure.is_some() {
        return Err(SystemServiceError::InvalidInput(
            "terminal workspace transaction outcome cannot contain recovery failure".to_string(),
        ));
    }
    Ok(())
}

pub(super) fn validate_sha256(value: &str, label: &str) -> Result<()> {
    if value.len() != 64
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(SystemServiceError::InvalidInput(format!(
            "{label} must be a lowercase SHA-256 digest"
        )));
    }
    Ok(())
}

fn validate_text_evidence(text: Option<&str>, sha256: Option<&str>, label: &str) -> Result<()> {
    match (text, sha256) {
        (None, None) => Ok(()),
        (Some(text), Some(sha256)) => {
            validate_sha256(sha256, &format!("workspace transaction {label} hash"))?;
            if sha256_bytes(text.as_bytes()) != sha256 {
                return Err(SystemServiceError::InvalidInput(format!(
                    "workspace transaction {label} text does not match hash"
                )));
            }
            Ok(())
        }
        _ => Err(SystemServiceError::InvalidInput(format!(
            "workspace transaction {label} text and hash must be present together"
        ))),
    }
}

fn validate_relative_path(path: &str) -> Result<()> {
    if path.is_empty()
        || path.starts_with('/')
        || path.ends_with('/')
        || path.contains('\\')
        || path.contains('\0')
        || path
            .split('/')
            .any(|part| part.is_empty() || part == "." || part == "..")
    {
        return Err(SystemServiceError::InvalidInput(format!(
            "workspace transaction path is not normalized and relative: {path}"
        )));
    }
    Ok(())
}

fn validate_token(token: &str) -> Result<()> {
    if !(32..=512).contains(&token.len()) {
        return Err(SystemServiceError::InvalidInput(
            "workspace transaction claim token must contain between 32 and 512 bytes".to_string(),
        ));
    }
    Ok(())
}

fn validate_lease(lease_ms: i64) -> Result<()> {
    if !(10..=300_000).contains(&lease_ms) {
        return Err(SystemServiceError::InvalidInput(
            "workspace transaction lease_ms must be between 10 and 300000".to_string(),
        ));
    }
    Ok(())
}

fn sha256_bytes(bytes: &[u8]) -> String {
    let mut digest = Sha256::new();
    digest.update(bytes);
    format!("{:x}", digest.finalize())
}
