use crate::event_store::append_event_tx;
use crate::plugin::{get_manifest_by_plugin_tx, validate_plugin_capability};
use crate::rows::{
    row_to_connector_credential, row_to_connector_registration, row_to_connector_session,
};
use crate::{
    ConnectorCredentialRecord, ConnectorRegistrationRecord, ConnectorSessionRecord, EventScope,
    FinishConnectorSession, HeartbeatConnectorSession, ListConnectorCredentials,
    ListConnectorRegistrations, ListConnectorSessions, PutConnectorCredential,
    PutConnectorRegistration, Result, RevokeConnectorCredential, StartConnectorSession,
    SystemService, SystemServiceError, UpdateConnectorRegistrationState,
};
use rusqlite::{params, OptionalExtension};
use uuid::Uuid;

const CONNECTOR_REGISTRATION_SELECT: &str = "SELECT
    id, connector_id, plugin_id, plugin_version, state, metadata_json,
    created_at, updated_at, disabled_at
 FROM connector_registration";

const CONNECTOR_CREDENTIAL_SELECT: &str = "SELECT
    id, connector_id, kind, secret_ref, state, metadata_json,
    created_at, updated_at, revoked_at
 FROM connector_credential";

const CONNECTOR_SESSION_SELECT: &str = "SELECT
    id, connector_id, credential_id, state, owner_id, lease_token,
    lease_expires_at, metadata_json, last_error_json,
    created_at, updated_at, finished_at
 FROM connector_session";

impl SystemService {
    pub fn put_connector_registration(
        &self,
        request: &PutConnectorRegistration,
    ) -> Result<ConnectorRegistrationRecord> {
        validate_put_connector_registration(request)?;
        let id = request
            .id
            .clone()
            .unwrap_or_else(|| format!("connreg_{}", Uuid::now_v7()));
        let metadata_json = request
            .metadata
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = conn.transaction()?;

        if let Some(idempotency_key) = &request.idempotency_key {
            let existing = tx
                .query_row(
                    &format!("{CONNECTOR_REGISTRATION_SELECT} WHERE idempotency_key = ?"),
                    params![idempotency_key],
                    row_to_connector_registration,
                )
                .optional()?;
            if let Some(record) = existing {
                validate_existing_connector_registration(&record, request)?;
                tx.commit()?;
                return Ok(record);
            }
        }

        if let Some(record) =
            get_connector_registration_by_connector_tx(&tx, &request.connector_id)?
        {
            validate_existing_connector_registration(&record, request)?;
            tx.commit()?;
            return Ok(record);
        }

        let manifest =
            get_manifest_by_plugin_tx(&tx, &request.plugin_id, request.version.as_deref())?
                .ok_or_else(|| {
                    SystemServiceError::Invariant(format!(
                        "plugin manifest does not exist: {}",
                        request.plugin_id
                    ))
                })?;
        if manifest.state != "registered" {
            return Err(SystemServiceError::Invariant(
                "plugin manifest is disabled".to_string(),
            ));
        }

        tx.execute(
            "INSERT INTO connector_registration (
                id, connector_id, plugin_id, plugin_version, state, metadata_json,
                idempotency_key, created_at, updated_at, disabled_at
             ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, NULL)",
            params![
                id,
                request.connector_id,
                manifest.plugin_id,
                manifest.version,
                metadata_json,
                request.idempotency_key,
                now,
                now
            ],
        )?;
        append_connector_event_tx(
            &tx,
            "connector.registration.put",
            &serde_json::json!({
                "connectorId": request.connector_id,
                "pluginId": manifest.plugin_id,
                "pluginVersion": manifest.version
            }),
            now,
        )?;
        let record = get_connector_registration_by_connector_tx(&tx, &request.connector_id)?
            .ok_or_else(|| {
                SystemServiceError::Invariant(format!(
                    "connector registration insert missing: {}",
                    request.connector_id
                ))
            })?;
        tx.commit()?;
        Ok(record)
    }

    pub fn list_connector_registrations(
        &self,
        request: &ListConnectorRegistrations,
    ) -> Result<Vec<ConnectorRegistrationRecord>> {
        validate_optional_filter("connector_id", request.connector_id.as_deref())?;
        validate_optional_filter("plugin_id", request.plugin_id.as_deref())?;
        validate_optional_connector_registration_state(request.state.as_deref())?;
        let conn = self.connect()?;
        let limit = request.limit.unwrap_or(100).clamp(1, 1000);
        let mut stmt = conn.prepare(&format!(
            "{CONNECTOR_REGISTRATION_SELECT}
             WHERE (?1 IS NULL OR connector_id = ?1)
               AND (?2 IS NULL OR plugin_id = ?2)
               AND (?3 IS NULL OR state = ?3)
             ORDER BY updated_at DESC, id ASC
             LIMIT ?4"
        ))?;
        let records = collect_connector_registrations(stmt.query_map(
            params![
                request.connector_id,
                request.plugin_id,
                request.state,
                limit
            ],
            row_to_connector_registration,
        )?)?;
        Ok(records)
    }

    pub fn update_connector_registration_state(
        &self,
        request: &UpdateConnectorRegistrationState,
    ) -> Result<ConnectorRegistrationRecord> {
        validate_non_empty("connector_id", &request.connector_id)?;
        validate_connector_registration_state(&request.state)?;
        let now = crate::util::now_ms();
        let disabled_at = if request.state == "disabled" {
            Some(now)
        } else {
            None
        };
        let mut conn = self.connect()?;
        let tx = conn.transaction()?;
        let existing = get_connector_registration_by_connector_tx(&tx, &request.connector_id)?
            .ok_or_else(|| {
                SystemServiceError::Invariant(format!(
                    "connector registration does not exist: {}",
                    request.connector_id
                ))
            })?;
        tx.execute(
            "UPDATE connector_registration
             SET state = ?, updated_at = ?, disabled_at = ?
             WHERE id = ?",
            params![request.state, now, disabled_at, existing.id],
        )?;
        append_connector_event_tx(
            &tx,
            "connector.registration.state_updated",
            &serde_json::json!({
                "connectorId": existing.connector_id,
                "pluginId": existing.plugin_id,
                "pluginVersion": existing.plugin_version,
                "fromState": existing.state,
                "toState": request.state
            }),
            now,
        )?;
        let record = get_connector_registration_by_id_tx(&tx, &existing.id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!(
                "connector registration update missing: {}",
                existing.id
            ))
        })?;
        tx.commit()?;
        Ok(record)
    }

    pub fn put_connector_credential(
        &self,
        request: &PutConnectorCredential,
    ) -> Result<ConnectorCredentialRecord> {
        validate_put_connector_credential(request)?;
        let id = request
            .id
            .clone()
            .unwrap_or_else(|| format!("conncred_{}", Uuid::now_v7()));
        let metadata_json = request
            .metadata
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = conn.transaction()?;
        require_active_connector_tx(&tx, &request.connector_id)?;

        if let Some(idempotency_key) = &request.idempotency_key {
            let existing = tx
                .query_row(
                    &format!("{CONNECTOR_CREDENTIAL_SELECT} WHERE idempotency_key = ?"),
                    params![idempotency_key],
                    row_to_connector_credential,
                )
                .optional()?;
            if let Some(record) = existing {
                validate_existing_connector_credential(&record, request)?;
                tx.commit()?;
                return Ok(record);
            }
        }

        if let Some(record) = get_connector_credential_by_unique_tx(
            &tx,
            &request.connector_id,
            &request.kind,
            &request.secret_ref,
        )? {
            validate_existing_connector_credential(&record, request)?;
            tx.commit()?;
            return Ok(record);
        }

        tx.execute(
            "INSERT INTO connector_credential (
                id, connector_id, kind, secret_ref, state, metadata_json,
                idempotency_key, created_at, updated_at, revoked_at
             ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, NULL)",
            params![
                id,
                request.connector_id,
                request.kind,
                request.secret_ref,
                metadata_json,
                request.idempotency_key,
                now,
                now
            ],
        )?;
        append_connector_event_tx(
            &tx,
            "connector.credential.put",
            &serde_json::json!({
                "connectorId": request.connector_id,
                "credentialId": id,
                "kind": request.kind
            }),
            now,
        )?;
        let record = get_connector_credential_by_id_tx(&tx, &id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!("connector credential insert missing: {id}"))
        })?;
        tx.commit()?;
        Ok(record)
    }

    pub fn list_connector_credentials(
        &self,
        request: &ListConnectorCredentials,
    ) -> Result<Vec<ConnectorCredentialRecord>> {
        validate_optional_filter("connector_id", request.connector_id.as_deref())?;
        validate_optional_connector_credential_state(request.state.as_deref())?;
        let conn = self.connect()?;
        let limit = request.limit.unwrap_or(100).clamp(1, 1000);
        let mut stmt = conn.prepare(&format!(
            "{CONNECTOR_CREDENTIAL_SELECT}
             WHERE (?1 IS NULL OR connector_id = ?1)
               AND (?2 IS NULL OR state = ?2)
             ORDER BY updated_at DESC, id ASC
             LIMIT ?3"
        ))?;
        let records = collect_connector_credentials(stmt.query_map(
            params![request.connector_id, request.state, limit],
            row_to_connector_credential,
        )?)?;
        Ok(records)
    }

    pub fn revoke_connector_credential(
        &self,
        request: &RevokeConnectorCredential,
    ) -> Result<ConnectorCredentialRecord> {
        validate_non_empty("credential_id", &request.credential_id)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = conn.transaction()?;
        let existing =
            get_connector_credential_by_id_tx(&tx, &request.credential_id)?.ok_or_else(|| {
                SystemServiceError::Invariant(format!(
                    "connector credential does not exist: {}",
                    request.credential_id
                ))
            })?;
        tx.execute(
            "UPDATE connector_credential
             SET state = 'revoked', updated_at = ?, revoked_at = ?
             WHERE id = ?",
            params![now, now, existing.id],
        )?;
        append_connector_event_tx(
            &tx,
            "connector.credential.revoked",
            &serde_json::json!({
                "connectorId": existing.connector_id,
                "credentialId": existing.id
            }),
            now,
        )?;
        let record =
            get_connector_credential_by_id_tx(&tx, &request.credential_id)?.ok_or_else(|| {
                SystemServiceError::Invariant(format!(
                    "connector credential revoke missing: {}",
                    request.credential_id
                ))
            })?;
        tx.commit()?;
        Ok(record)
    }

    pub fn start_connector_session(
        &self,
        request: &StartConnectorSession,
    ) -> Result<ConnectorSessionRecord> {
        validate_start_connector_session(request)?;
        let id = request
            .id
            .clone()
            .unwrap_or_else(|| format!("connses_{}", Uuid::now_v7()));
        let metadata_json = request
            .metadata
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let now = crate::util::now_ms();
        let lease_token = format!("lease_{}", Uuid::now_v7());
        let lease_expires_at = now + request.lease_ms;
        let state = request.state.as_deref().unwrap_or("connecting");
        let mut conn = self.connect()?;
        let tx = conn.transaction()?;
        if let Some(idempotency_key) = &request.idempotency_key {
            let existing = tx
                .query_row(
                    &format!("{CONNECTOR_SESSION_SELECT} WHERE idempotency_key = ?"),
                    params![idempotency_key],
                    row_to_connector_session,
                )
                .optional()?;
            if let Some(record) = existing {
                validate_existing_connector_session(&record, request)?;
                tx.commit()?;
                return Ok(record);
            }
        }

        require_active_connector_tx(&tx, &request.connector_id)?;
        let credential = get_connector_credential_by_id_tx(&tx, &request.credential_id)?
            .ok_or_else(|| {
                SystemServiceError::Invariant(format!(
                    "connector credential does not exist: {}",
                    request.credential_id
                ))
            })?;
        if credential.connector_id != request.connector_id {
            return Err(SystemServiceError::Invariant(
                "connector credential belongs to another connector".to_string(),
            ));
        }
        if credential.state != "active" {
            return Err(SystemServiceError::Invariant(
                "connector credential is not active".to_string(),
            ));
        }
        expire_stale_connector_sessions_tx(&tx, &request.connector_id, now)?;
        if let Some(active) =
            get_active_connector_session_by_connector_tx(&tx, &request.connector_id, now)?
        {
            return Err(SystemServiceError::Invariant(format!(
                "connector session already active: {}",
                active.id
            )));
        }

        tx.execute(
            "INSERT INTO connector_session (
                id, connector_id, credential_id, state, owner_id, lease_token,
                lease_expires_at, metadata_json, last_error_json, idempotency_key,
                created_at, updated_at, finished_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL)",
            params![
                id,
                request.connector_id,
                request.credential_id,
                state,
                request.owner_id,
                lease_token,
                lease_expires_at,
                metadata_json,
                request.idempotency_key,
                now,
                now
            ],
        )?;
        append_connector_event_tx(
            &tx,
            "connector.session.started",
            &serde_json::json!({
                "connectorId": request.connector_id,
                "sessionId": id,
                "state": state
            }),
            now,
        )?;
        let record = get_connector_session_by_id_tx(&tx, &id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!("connector session insert missing: {id}"))
        })?;
        tx.commit()?;
        Ok(record)
    }

    pub fn heartbeat_connector_session(
        &self,
        request: &HeartbeatConnectorSession,
    ) -> Result<ConnectorSessionRecord> {
        validate_heartbeat_connector_session(request)?;
        let metadata_json = request
            .metadata
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let now = crate::util::now_ms();
        let lease_expires_at = now + request.lease_ms;
        let state = request.state.as_deref();
        let mut conn = self.connect()?;
        let tx = conn.transaction()?;
        let existing = require_owned_connector_session_tx(
            &tx,
            &request.session_id,
            &request.owner_id,
            &request.lease_token,
            now,
        )?;
        tx.execute(
            "UPDATE connector_session
             SET state = COALESCE(?, state),
                 lease_expires_at = ?,
                 metadata_json = COALESCE(?, metadata_json),
                 updated_at = ?
             WHERE id = ?",
            params![state, lease_expires_at, metadata_json, now, existing.id],
        )?;
        let record =
            get_connector_session_by_id_tx(&tx, &request.session_id)?.ok_or_else(|| {
                SystemServiceError::Invariant(format!(
                    "connector session heartbeat missing: {}",
                    request.session_id
                ))
            })?;
        tx.commit()?;
        Ok(record)
    }

    pub fn finish_connector_session(
        &self,
        request: &FinishConnectorSession,
    ) -> Result<ConnectorSessionRecord> {
        validate_finish_connector_session(request)?;
        let metadata_json = request
            .metadata
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let error_json = request
            .error
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = conn.transaction()?;
        let existing = require_owned_connector_session_tx(
            &tx,
            &request.session_id,
            &request.owner_id,
            &request.lease_token,
            now,
        )?;
        tx.execute(
            "UPDATE connector_session
             SET state = ?,
                 metadata_json = COALESCE(?, metadata_json),
                 last_error_json = ?,
                 updated_at = ?,
                 finished_at = ?
             WHERE id = ?",
            params![
                request.state,
                metadata_json,
                error_json,
                now,
                now,
                existing.id
            ],
        )?;
        append_connector_event_tx(
            &tx,
            "connector.session.finished",
            &serde_json::json!({
                "connectorId": existing.connector_id,
                "sessionId": existing.id,
                "state": request.state
            }),
            now,
        )?;
        let record =
            get_connector_session_by_id_tx(&tx, &request.session_id)?.ok_or_else(|| {
                SystemServiceError::Invariant(format!(
                    "connector session finish missing: {}",
                    request.session_id
                ))
            })?;
        tx.commit()?;
        Ok(record)
    }

    pub fn list_connector_sessions(
        &self,
        request: &ListConnectorSessions,
    ) -> Result<Vec<ConnectorSessionRecord>> {
        validate_optional_filter("connector_id", request.connector_id.as_deref())?;
        validate_optional_filter("owner_id", request.owner_id.as_deref())?;
        validate_optional_connector_session_state(request.state.as_deref())?;
        let conn = self.connect()?;
        let limit = request.limit.unwrap_or(100).clamp(1, 1000);
        let mut stmt = conn.prepare(&format!(
            "{CONNECTOR_SESSION_SELECT}
             WHERE (?1 IS NULL OR connector_id = ?1)
               AND (?2 IS NULL OR state = ?2)
               AND (?3 IS NULL OR owner_id = ?3)
             ORDER BY updated_at DESC, id ASC
             LIMIT ?4"
        ))?;
        let records = collect_connector_sessions(stmt.query_map(
            params![request.connector_id, request.state, request.owner_id, limit],
            row_to_connector_session,
        )?)?;
        Ok(records)
    }
}

pub(crate) fn require_connector_capability_tx(
    tx: &rusqlite::Transaction<'_>,
    connector_id: &str,
    capability: &str,
) -> Result<ConnectorRegistrationRecord> {
    validate_plugin_capability(capability)?;
    let registration =
        get_connector_registration_by_connector_tx(tx, connector_id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!(
                "connector registration does not exist: {connector_id}"
            ))
        })?;
    if registration.state != "active" {
        return Err(SystemServiceError::Invariant(format!(
            "connector registration is not active: {connector_id}"
        )));
    }
    let manifest = get_manifest_by_plugin_tx(
        tx,
        &registration.plugin_id,
        Some(&registration.plugin_version),
    )?
    .ok_or_else(|| {
        SystemServiceError::Invariant(format!(
            "plugin manifest does not exist: {}@{}",
            registration.plugin_id, registration.plugin_version
        ))
    })?;
    if manifest.state != "registered" {
        return Err(SystemServiceError::Invariant(
            "plugin manifest is disabled".to_string(),
        ));
    }
    if !manifest.capabilities.iter().any(|item| item == capability) {
        return Err(SystemServiceError::Invariant(format!(
            "connector plugin capability not declared: {capability}"
        )));
    }
    Ok(registration)
}

fn require_active_connector_tx(
    tx: &rusqlite::Transaction<'_>,
    connector_id: &str,
) -> Result<ConnectorRegistrationRecord> {
    let registration =
        get_connector_registration_by_connector_tx(tx, connector_id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!(
                "connector registration does not exist: {connector_id}"
            ))
        })?;
    if registration.state != "active" {
        return Err(SystemServiceError::Invariant(format!(
            "connector registration is not active: {connector_id}"
        )));
    }
    let manifest = get_manifest_by_plugin_tx(
        tx,
        &registration.plugin_id,
        Some(&registration.plugin_version),
    )?
    .ok_or_else(|| {
        SystemServiceError::Invariant(format!(
            "plugin manifest does not exist: {}@{}",
            registration.plugin_id, registration.plugin_version
        ))
    })?;
    if manifest.state != "registered" {
        return Err(SystemServiceError::Invariant(
            "plugin manifest is disabled".to_string(),
        ));
    }
    Ok(registration)
}

fn validate_put_connector_registration(request: &PutConnectorRegistration) -> Result<()> {
    validate_non_empty("connector_id", &request.connector_id)?;
    validate_non_empty("plugin_id", &request.plugin_id)?;
    validate_optional_filter("id", request.id.as_deref())?;
    validate_optional_filter("version", request.version.as_deref())?;
    validate_optional_filter("idempotency_key", request.idempotency_key.as_deref())?;
    Ok(())
}

fn validate_put_connector_credential(request: &PutConnectorCredential) -> Result<()> {
    validate_non_empty("connector_id", &request.connector_id)?;
    validate_non_empty("kind", &request.kind)?;
    validate_non_empty("secret_ref", &request.secret_ref)?;
    validate_optional_filter("id", request.id.as_deref())?;
    validate_optional_filter("idempotency_key", request.idempotency_key.as_deref())?;
    Ok(())
}

fn validate_existing_connector_credential(
    record: &ConnectorCredentialRecord,
    request: &PutConnectorCredential,
) -> Result<()> {
    if record.connector_id != request.connector_id
        || record.kind != request.kind
        || record.secret_ref != request.secret_ref
    {
        return Err(SystemServiceError::Invariant(
            "connector credential idempotency conflict".to_string(),
        ));
    }
    Ok(())
}

fn validate_existing_connector_session(
    record: &ConnectorSessionRecord,
    request: &StartConnectorSession,
) -> Result<()> {
    if record.connector_id != request.connector_id
        || record.credential_id != request.credential_id
        || record.owner_id != request.owner_id
    {
        return Err(SystemServiceError::Invariant(
            "connector session idempotency conflict".to_string(),
        ));
    }
    Ok(())
}

fn validate_start_connector_session(request: &StartConnectorSession) -> Result<()> {
    validate_non_empty("connector_id", &request.connector_id)?;
    validate_non_empty("credential_id", &request.credential_id)?;
    validate_non_empty("owner_id", &request.owner_id)?;
    validate_positive("lease_ms", request.lease_ms)?;
    validate_optional_filter("id", request.id.as_deref())?;
    validate_optional_filter("idempotency_key", request.idempotency_key.as_deref())?;
    if let Some(state) = &request.state {
        validate_live_connector_session_state(state)?;
    }
    Ok(())
}

fn validate_heartbeat_connector_session(request: &HeartbeatConnectorSession) -> Result<()> {
    validate_non_empty("session_id", &request.session_id)?;
    validate_non_empty("owner_id", &request.owner_id)?;
    validate_non_empty("lease_token", &request.lease_token)?;
    validate_positive("lease_ms", request.lease_ms)?;
    if let Some(state) = &request.state {
        validate_live_connector_session_state(state)?;
    }
    Ok(())
}

fn validate_finish_connector_session(request: &FinishConnectorSession) -> Result<()> {
    validate_non_empty("session_id", &request.session_id)?;
    validate_non_empty("owner_id", &request.owner_id)?;
    validate_non_empty("lease_token", &request.lease_token)?;
    if !matches!(request.state.as_str(), "disconnected" | "failed") {
        return Err(SystemServiceError::Invariant(format!(
            "invalid connector session finish state: {}",
            request.state
        )));
    }
    Ok(())
}

fn validate_existing_connector_registration(
    record: &ConnectorRegistrationRecord,
    request: &PutConnectorRegistration,
) -> Result<()> {
    if record.connector_id != request.connector_id || record.plugin_id != request.plugin_id {
        return Err(SystemServiceError::Invariant(
            "connector registration idempotency conflict".to_string(),
        ));
    }
    if let Some(version) = &request.version {
        if record.plugin_version != *version {
            return Err(SystemServiceError::Invariant(
                "connector registration idempotency conflict".to_string(),
            ));
        }
    }
    Ok(())
}

fn validate_connector_credential_state(state: &str) -> Result<()> {
    if !matches!(state, "active" | "revoked") {
        return Err(SystemServiceError::Invariant(format!(
            "invalid connector credential state: {state}"
        )));
    }
    Ok(())
}

fn validate_optional_connector_credential_state(state: Option<&str>) -> Result<()> {
    if let Some(state) = state {
        validate_connector_credential_state(state)?;
    }
    Ok(())
}

fn validate_live_connector_session_state(state: &str) -> Result<()> {
    if !matches!(state, "connecting" | "connected") {
        return Err(SystemServiceError::Invariant(format!(
            "invalid live connector session state: {state}"
        )));
    }
    Ok(())
}

fn validate_connector_session_state(state: &str) -> Result<()> {
    if !matches!(
        state,
        "connecting" | "connected" | "disconnected" | "expired" | "failed"
    ) {
        return Err(SystemServiceError::Invariant(format!(
            "invalid connector session state: {state}"
        )));
    }
    Ok(())
}

fn validate_optional_connector_session_state(state: Option<&str>) -> Result<()> {
    if let Some(state) = state {
        validate_connector_session_state(state)?;
    }
    Ok(())
}

fn validate_connector_registration_state(state: &str) -> Result<()> {
    if !matches!(state, "active" | "disabled") {
        return Err(SystemServiceError::Invariant(format!(
            "invalid connector registration state: {state}"
        )));
    }
    Ok(())
}

fn validate_optional_connector_registration_state(state: Option<&str>) -> Result<()> {
    if let Some(state) = state {
        validate_connector_registration_state(state)?;
    }
    Ok(())
}

fn validate_positive(name: &str, value: i64) -> Result<()> {
    if value <= 0 {
        return Err(SystemServiceError::Invariant(format!(
            "connector {name} must be positive"
        )));
    }
    Ok(())
}

fn validate_non_empty(name: &str, value: &str) -> Result<()> {
    if value.is_empty() {
        return Err(SystemServiceError::Invariant(format!(
            "connector {name} must not be empty"
        )));
    }
    Ok(())
}

fn validate_optional_filter(name: &str, value: Option<&str>) -> Result<()> {
    if value == Some("") {
        return Err(SystemServiceError::Invariant(format!(
            "connector {name} must not be empty"
        )));
    }
    Ok(())
}

fn get_connector_credential_by_id_tx(
    tx: &rusqlite::Transaction<'_>,
    id: &str,
) -> Result<Option<ConnectorCredentialRecord>> {
    tx.query_row(
        &format!("{CONNECTOR_CREDENTIAL_SELECT} WHERE id = ?"),
        params![id],
        row_to_connector_credential,
    )
    .optional()
    .map_err(Into::into)
}

fn get_connector_credential_by_unique_tx(
    tx: &rusqlite::Transaction<'_>,
    connector_id: &str,
    kind: &str,
    secret_ref: &str,
) -> Result<Option<ConnectorCredentialRecord>> {
    tx.query_row(
        &format!(
            "{CONNECTOR_CREDENTIAL_SELECT}
             WHERE connector_id = ? AND kind = ? AND secret_ref = ?"
        ),
        params![connector_id, kind, secret_ref],
        row_to_connector_credential,
    )
    .optional()
    .map_err(Into::into)
}

fn collect_connector_credentials(
    rows: impl Iterator<Item = rusqlite::Result<ConnectorCredentialRecord>>,
) -> Result<Vec<ConnectorCredentialRecord>> {
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}

fn get_connector_session_by_id_tx(
    tx: &rusqlite::Transaction<'_>,
    id: &str,
) -> Result<Option<ConnectorSessionRecord>> {
    tx.query_row(
        &format!("{CONNECTOR_SESSION_SELECT} WHERE id = ?"),
        params![id],
        row_to_connector_session,
    )
    .optional()
    .map_err(Into::into)
}

fn get_active_connector_session_by_connector_tx(
    tx: &rusqlite::Transaction<'_>,
    connector_id: &str,
    now: i64,
) -> Result<Option<ConnectorSessionRecord>> {
    tx.query_row(
        &format!(
            "{CONNECTOR_SESSION_SELECT}
             WHERE connector_id = ?
               AND state IN ('connecting', 'connected')
               AND lease_expires_at > ?
             ORDER BY updated_at DESC, id ASC
             LIMIT 1"
        ),
        params![connector_id, now],
        row_to_connector_session,
    )
    .optional()
    .map_err(Into::into)
}

fn expire_stale_connector_sessions_tx(
    tx: &rusqlite::Transaction<'_>,
    connector_id: &str,
    now: i64,
) -> Result<()> {
    tx.execute(
        "UPDATE connector_session
         SET state = 'expired', updated_at = ?, finished_at = ?
         WHERE connector_id = ?
           AND state IN ('connecting', 'connected')
           AND lease_expires_at <= ?",
        params![now, now, connector_id, now],
    )?;
    Ok(())
}

fn require_owned_connector_session_tx(
    tx: &rusqlite::Transaction<'_>,
    session_id: &str,
    owner_id: &str,
    lease_token: &str,
    now: i64,
) -> Result<ConnectorSessionRecord> {
    let session = get_connector_session_by_id_tx(tx, session_id)?.ok_or_else(|| {
        SystemServiceError::Invariant(format!("connector session does not exist: {session_id}"))
    })?;
    if session.owner_id != owner_id || session.lease_token != lease_token {
        return Err(SystemServiceError::Invariant(
            "connector session lease owner mismatch".to_string(),
        ));
    }
    if !matches!(session.state.as_str(), "connecting" | "connected") {
        return Err(SystemServiceError::Invariant(format!(
            "connector session is not live: {}",
            session.state
        )));
    }
    if session.lease_expires_at <= now {
        tx.execute(
            "UPDATE connector_session
             SET state = 'expired', updated_at = ?, finished_at = ?
             WHERE id = ?",
            params![now, now, session.id],
        )?;
        return Err(SystemServiceError::Invariant(
            "connector session lease expired".to_string(),
        ));
    }
    Ok(session)
}

fn get_connector_registration_by_id_tx(
    tx: &rusqlite::Transaction<'_>,
    id: &str,
) -> Result<Option<ConnectorRegistrationRecord>> {
    tx.query_row(
        &format!("{CONNECTOR_REGISTRATION_SELECT} WHERE id = ?"),
        params![id],
        row_to_connector_registration,
    )
    .optional()
    .map_err(Into::into)
}

fn get_connector_registration_by_connector_tx(
    tx: &rusqlite::Transaction<'_>,
    connector_id: &str,
) -> Result<Option<ConnectorRegistrationRecord>> {
    tx.query_row(
        &format!("{CONNECTOR_REGISTRATION_SELECT} WHERE connector_id = ?"),
        params![connector_id],
        row_to_connector_registration,
    )
    .optional()
    .map_err(Into::into)
}

fn collect_connector_registrations(
    rows: impl Iterator<Item = rusqlite::Result<ConnectorRegistrationRecord>>,
) -> Result<Vec<ConnectorRegistrationRecord>> {
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}

fn collect_connector_sessions(
    rows: impl Iterator<Item = rusqlite::Result<ConnectorSessionRecord>>,
) -> Result<Vec<ConnectorSessionRecord>> {
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}

fn append_connector_event_tx(
    tx: &rusqlite::Transaction<'_>,
    event_type: &str,
    payload: &serde_json::Value,
    occurred_at: i64,
) -> Result<()> {
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        event_type,
        &EventScope::default(),
        payload,
        occurred_at,
    )
}
