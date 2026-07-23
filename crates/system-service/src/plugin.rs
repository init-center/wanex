use crate::event_store::append_event_tx;
use crate::rows::{row_to_plugin_install, row_to_plugin_manifest};
use crate::scheduler::enqueue_job_tx;
use crate::{
    EnqueueJob, EventScope, GetPluginInstall, GetPluginManifest, ListPluginInstalls,
    ListPluginManifests, PluginActionSubmission, PluginInstallRecord, PluginManifestRecord,
    PutPluginInstall, PutPluginManifest, Result, SchedulerJobKind, SubmitPluginAction,
    SystemService, SystemServiceError, UpdatePluginInstallState, UpdatePluginManifestState,
};
use rusqlite::{params, OptionalExtension};
use uuid::Uuid;

const PLUGIN_SELECT: &str = "SELECT
    id, plugin_id, version, name, entry_json, capabilities_json,
    state, metadata_json, created_at, updated_at, disabled_at
 FROM plugin_manifest";

const PLUGIN_INSTALL_SELECT: &str = "SELECT
    id, plugin_id, plugin_version, state, layout_json, trust_json,
    install_root_dir, metadata_json, installed_at, updated_at, disabled_at, removed_at
 FROM plugin_install";

impl SystemService {
    pub fn put_plugin_manifest(&self, request: &PutPluginManifest) -> Result<PluginManifestRecord> {
        validate_put_manifest(request)?;
        let id = request
            .id
            .clone()
            .unwrap_or_else(|| format!("plug_{}", Uuid::now_v7()));
        let entry_json = request
            .entry
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let capabilities_json = serde_json::to_string(&request.capabilities)?;
        let metadata_json = request
            .metadata
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;

        if let Some(idempotency_key) = &request.idempotency_key {
            let existing = tx
                .query_row(
                    &format!("{PLUGIN_SELECT} WHERE idempotency_key = ?"),
                    params![idempotency_key],
                    row_to_plugin_manifest,
                )
                .optional()?;
            if let Some(record) = existing {
                validate_existing_manifest(&record, request)?;
                tx.commit()?;
                return Ok(record);
            }
        }

        if let Some(record) =
            get_manifest_by_plugin_tx(&tx, &request.plugin_id, Some(&request.version))?
        {
            validate_existing_manifest(&record, request)?;
            tx.commit()?;
            return Ok(record);
        }

        tx.execute(
            "INSERT INTO plugin_manifest (
                id, plugin_id, version, name, entry_json, capabilities_json,
                state, metadata_json, idempotency_key, created_at, updated_at, disabled_at
             ) VALUES (?, ?, ?, ?, ?, ?, 'registered', ?, ?, ?, ?, NULL)",
            params![
                id,
                request.plugin_id,
                request.version,
                request.name,
                entry_json,
                capabilities_json,
                metadata_json,
                request.idempotency_key,
                now,
                now
            ],
        )?;
        append_plugin_event_tx(
            &tx,
            "plugin.manifest.registered",
            &serde_json::json!({
                "pluginId": request.plugin_id,
                "version": request.version,
                "capabilities": request.capabilities
            }),
            now,
        )?;
        let record = get_manifest_by_plugin_tx(&tx, &request.plugin_id, Some(&request.version))?
            .ok_or_else(|| {
                SystemServiceError::Invariant(format!(
                    "plugin manifest insert missing: {}@{}",
                    request.plugin_id, request.version
                ))
            })?;
        tx.commit()?;
        Ok(record)
    }

    pub fn get_plugin_manifest(
        &self,
        request: &GetPluginManifest,
    ) -> Result<Option<PluginManifestRecord>> {
        if request.plugin_id.is_empty() || request.version.as_deref() == Some("") {
            return Err(SystemServiceError::Invariant(
                "plugin id/version must not be empty".to_string(),
            ));
        }
        let conn = self.connect()?;
        if let Some(version) = &request.version {
            return conn
                .query_row(
                    &format!("{PLUGIN_SELECT} WHERE plugin_id = ? AND version = ?"),
                    params![request.plugin_id, version],
                    row_to_plugin_manifest,
                )
                .optional()
                .map_err(Into::into);
        }
        conn.query_row(
            &format!(
                "{PLUGIN_SELECT}
                 WHERE plugin_id = ?
                 ORDER BY created_at DESC, id ASC
                 LIMIT 1"
            ),
            params![request.plugin_id],
            row_to_plugin_manifest,
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn list_plugin_manifests(
        &self,
        request: &ListPluginManifests,
    ) -> Result<Vec<PluginManifestRecord>> {
        validate_optional_manifest_state(request.state.as_deref())?;
        if let Some(capability) = &request.capability {
            validate_plugin_capability(capability)?;
        }
        let conn = self.connect()?;
        let limit = request.limit.unwrap_or(100).clamp(1, 1000);
        let mut manifests = if let Some(state) = &request.state {
            let mut stmt = conn.prepare(&format!(
                "{PLUGIN_SELECT}
                 WHERE state = ?
                 ORDER BY updated_at DESC, id ASC
                 LIMIT ?"
            ))?;
            let records =
                collect_manifests(stmt.query_map(params![state, limit], row_to_plugin_manifest)?)?;
            records
        } else {
            let mut stmt = conn.prepare(&format!(
                "{PLUGIN_SELECT}
                 ORDER BY updated_at DESC, id ASC
                 LIMIT ?"
            ))?;
            let records =
                collect_manifests(stmt.query_map(params![limit], row_to_plugin_manifest)?)?;
            records
        };
        if let Some(capability) = &request.capability {
            manifests
                .retain(|manifest| manifest.capabilities.iter().any(|item| item == capability));
        }
        Ok(manifests)
    }

    pub fn put_plugin_install(&self, request: &PutPluginInstall) -> Result<PluginInstallRecord> {
        validate_put_plugin_install(request)?;
        let id = request
            .id
            .clone()
            .unwrap_or_else(|| format!("pinst_{}", Uuid::now_v7()));
        let layout_json = serde_json::to_string(&request.layout)?;
        let trust_json = serde_json::to_string(&request.trust)?;
        let metadata_json = request
            .metadata
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;

        if let Some(idempotency_key) = &request.idempotency_key {
            let existing = tx
                .query_row(
                    &format!("{PLUGIN_INSTALL_SELECT} WHERE idempotency_key = ?"),
                    params![idempotency_key],
                    row_to_plugin_install,
                )
                .optional()?;
            if let Some(record) = existing {
                validate_existing_install(&record, request)?;
                tx.commit()?;
                return Ok(record);
            }
        }

        get_manifest_by_plugin_tx(&tx, &request.plugin_id, Some(&request.version))?.ok_or_else(
            || {
                SystemServiceError::Invariant(format!(
                    "plugin manifest does not exist: {}@{}",
                    request.plugin_id, request.version
                ))
            },
        )?;

        if let Some(record) =
            get_install_by_plugin_tx(&tx, &request.plugin_id, Some(&request.version))?
        {
            validate_existing_install(&record, request)?;
            tx.commit()?;
            return Ok(record);
        }

        tx.execute(
            "INSERT INTO plugin_install (
                id, plugin_id, plugin_version, state, layout_json, trust_json,
                install_root_dir, metadata_json, idempotency_key,
                installed_at, updated_at, disabled_at, removed_at
             ) VALUES (?, ?, ?, 'installed', ?, ?, ?, ?, ?, ?, ?, NULL, NULL)",
            params![
                id,
                request.plugin_id,
                request.version,
                layout_json,
                trust_json,
                request.install_root_dir,
                metadata_json,
                request.idempotency_key,
                now,
                now
            ],
        )?;
        append_plugin_event_tx(
            &tx,
            "plugin.install.recorded",
            &serde_json::json!({
                "pluginId": request.plugin_id,
                "version": request.version,
                "installRootDir": request.install_root_dir
            }),
            now,
        )?;
        let record = get_install_by_plugin_tx(&tx, &request.plugin_id, Some(&request.version))?
            .ok_or_else(|| {
                SystemServiceError::Invariant(format!(
                    "plugin install insert missing: {}@{}",
                    request.plugin_id, request.version
                ))
            })?;
        tx.commit()?;
        Ok(record)
    }

    pub fn get_plugin_install(
        &self,
        request: &GetPluginInstall,
    ) -> Result<Option<PluginInstallRecord>> {
        if request.plugin_id.is_empty() || request.version.as_deref() == Some("") {
            return Err(SystemServiceError::Invariant(
                "plugin install plugin id/version must not be empty".to_string(),
            ));
        }
        let conn = self.connect()?;
        get_install_by_plugin_conn(&conn, &request.plugin_id, request.version.as_deref())
    }

    pub fn list_plugin_installs(
        &self,
        request: &ListPluginInstalls,
    ) -> Result<Vec<PluginInstallRecord>> {
        validate_optional_install_state(request.state.as_deref())?;
        if request.plugin_id.as_deref() == Some("") {
            return Err(SystemServiceError::Invariant(
                "plugin install plugin id must not be empty".to_string(),
            ));
        }
        let conn = self.connect()?;
        let limit = request.limit.unwrap_or(100).clamp(1, 1000);
        let records = match (&request.plugin_id, &request.state) {
            (Some(plugin_id), Some(state)) => {
                let mut stmt = conn.prepare(&format!(
                    "{PLUGIN_INSTALL_SELECT}
                     WHERE plugin_id = ? AND state = ?
                     ORDER BY updated_at DESC, id ASC
                     LIMIT ?"
                ))?;
                let records = collect_installs(
                    stmt.query_map(params![plugin_id, state, limit], row_to_plugin_install)?,
                )?;
                records
            }
            (Some(plugin_id), None) => {
                let mut stmt = conn.prepare(&format!(
                    "{PLUGIN_INSTALL_SELECT}
                     WHERE plugin_id = ?
                     ORDER BY updated_at DESC, id ASC
                     LIMIT ?"
                ))?;
                let records = collect_installs(
                    stmt.query_map(params![plugin_id, limit], row_to_plugin_install)?,
                )?;
                records
            }
            (None, Some(state)) => {
                let mut stmt = conn.prepare(&format!(
                    "{PLUGIN_INSTALL_SELECT}
                     WHERE state = ?
                     ORDER BY updated_at DESC, id ASC
                     LIMIT ?"
                ))?;
                let records = collect_installs(
                    stmt.query_map(params![state, limit], row_to_plugin_install)?,
                )?;
                records
            }
            (None, None) => {
                let mut stmt = conn.prepare(&format!(
                    "{PLUGIN_INSTALL_SELECT}
                     ORDER BY updated_at DESC, id ASC
                     LIMIT ?"
                ))?;
                let records =
                    collect_installs(stmt.query_map(params![limit], row_to_plugin_install)?)?;
                records
            }
        };
        Ok(records)
    }

    pub fn update_plugin_manifest_state(
        &self,
        request: &UpdatePluginManifestState,
    ) -> Result<PluginManifestRecord> {
        validate_manifest_state(&request.state)?;
        if request.plugin_id.is_empty() || request.version.as_deref() == Some("") {
            return Err(SystemServiceError::Invariant(
                "plugin id/version must not be empty".to_string(),
            ));
        }
        let now = crate::util::now_ms();
        let disabled_at = if request.state == "disabled" {
            Some(now)
        } else {
            None
        };
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let existing =
            get_manifest_by_plugin_tx(&tx, &request.plugin_id, request.version.as_deref())?
                .ok_or_else(|| {
                    SystemServiceError::Invariant(format!(
                        "plugin manifest does not exist: {}",
                        request.plugin_id
                    ))
                })?;
        tx.execute(
            "UPDATE plugin_manifest
             SET state = ?, updated_at = ?, disabled_at = ?
             WHERE id = ?",
            params![request.state, now, disabled_at, existing.id],
        )?;
        append_plugin_event_tx(
            &tx,
            "plugin.manifest.state_updated",
            &serde_json::json!({
                "pluginId": existing.plugin_id,
                "version": existing.version,
                "fromState": existing.state,
                "toState": request.state
            }),
            now,
        )?;
        let record = get_manifest_by_id_tx(&tx, &existing.id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!(
                "plugin manifest update missing: {}",
                existing.id
            ))
        })?;
        tx.commit()?;
        Ok(record)
    }

    pub fn update_plugin_install_state(
        &self,
        request: &UpdatePluginInstallState,
    ) -> Result<PluginInstallRecord> {
        validate_install_state(&request.state)?;
        if request.plugin_id.is_empty() || request.version.as_deref() == Some("") {
            return Err(SystemServiceError::Invariant(
                "plugin install plugin id/version must not be empty".to_string(),
            ));
        }
        let now = crate::util::now_ms();
        let (disabled_at, removed_at) = match request.state.as_str() {
            "installed" => (None, None),
            "disabled" => (Some(now), None),
            "removed" => (None, Some(now)),
            _ => unreachable!("validated plugin install state"),
        };
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let existing =
            get_install_by_plugin_tx(&tx, &request.plugin_id, request.version.as_deref())?
                .ok_or_else(|| {
                    SystemServiceError::Invariant(format!(
                        "plugin install does not exist: {}",
                        request.plugin_id
                    ))
                })?;
        tx.execute(
            "UPDATE plugin_install
             SET state = ?, updated_at = ?, disabled_at = ?, removed_at = ?
             WHERE id = ?",
            params![request.state, now, disabled_at, removed_at, existing.id],
        )?;
        append_plugin_event_tx(
            &tx,
            "plugin.install.state_updated",
            &serde_json::json!({
                "pluginId": existing.plugin_id,
                "version": existing.version,
                "fromState": existing.state,
                "toState": request.state
            }),
            now,
        )?;
        let record = get_install_by_id_tx(&tx, &existing.id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!("plugin install update missing: {}", existing.id))
        })?;
        tx.commit()?;
        Ok(record)
    }

    pub fn submit_plugin_action(
        &self,
        request: &SubmitPluginAction,
    ) -> Result<PluginActionSubmission> {
        validate_submit_plugin_action(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
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
        if let Some(capability) = &request.required_capability {
            if !manifest.capabilities.iter().any(|item| item == capability) {
                return Err(SystemServiceError::Invariant(format!(
                    "plugin capability not declared: {capability}"
                )));
            }
        }
        let job_idempotency_key = request.job_idempotency_key.clone().unwrap_or_else(|| {
            format!(
                "plugin:{}:{}:{}:job",
                manifest.plugin_id, manifest.version, request.action_id
            )
        });
        let job = enqueue_job_tx(
            &tx,
            &EnqueueJob {
                id: request.job_id.clone(),
                kind: SchedulerJobKind::PluginAction,
                principal_id: request.principal_id.clone(),
                payload: serde_json::json!({
                    "pluginId": manifest.plugin_id,
                    "version": manifest.version,
                    "actionId": request.action_id,
                    "requiredCapability": request.required_capability,
                    "payload": request.payload
                }),
                scheduled_at: request.scheduled_at,
                not_before: request.not_before,
                priority: request.priority,
                concurrency_key: None,
                max_attempts: request.max_attempts,
                retry_policy: request.retry_policy.clone(),
                idempotency_key: Some(job_idempotency_key),
                budget_grant_id: request.budget_grant_id.clone(),
            },
            now,
        )?;
        append_plugin_event_tx(
            &tx,
            "plugin.action.submitted",
            &serde_json::json!({
                "pluginId": manifest.plugin_id,
                "version": manifest.version,
                "actionId": request.action_id,
                "jobId": job.id
            }),
            now,
        )?;
        tx.commit()?;
        Ok(PluginActionSubmission { manifest, job })
    }
}

fn validate_put_manifest(request: &PutPluginManifest) -> Result<()> {
    if request.plugin_id.is_empty() || request.version.is_empty() {
        return Err(SystemServiceError::Invariant(
            "plugin id/version must not be empty".to_string(),
        ));
    }
    if request.id.as_deref() == Some("") || request.idempotency_key.as_deref() == Some("") {
        return Err(SystemServiceError::Invariant(
            "plugin manifest id/idempotency_key must not be empty".to_string(),
        ));
    }
    if request.capabilities.is_empty() {
        return Err(SystemServiceError::Invariant(
            "plugin manifest capabilities must not be empty".to_string(),
        ));
    }
    for capability in &request.capabilities {
        validate_plugin_capability(capability)?;
    }
    Ok(())
}

fn validate_submit_plugin_action(request: &SubmitPluginAction) -> Result<()> {
    if request.plugin_id.is_empty()
        || request.version.as_deref() == Some("")
        || request.action_id.is_empty()
        || request.principal_id.is_empty()
    {
        return Err(SystemServiceError::Invariant(
            "plugin action plugin/version/action/principal ids must not be empty".to_string(),
        ));
    }
    if let Some(capability) = &request.required_capability {
        validate_plugin_capability(capability)?;
    }
    Ok(())
}

fn validate_put_plugin_install(request: &PutPluginInstall) -> Result<()> {
    if request.plugin_id.is_empty()
        || request.version.is_empty()
        || request.install_root_dir.is_empty()
    {
        return Err(SystemServiceError::Invariant(
            "plugin install plugin/version/root must not be empty".to_string(),
        ));
    }
    if request.id.as_deref() == Some("") || request.idempotency_key.as_deref() == Some("") {
        return Err(SystemServiceError::Invariant(
            "plugin install id/idempotency_key must not be empty".to_string(),
        ));
    }
    Ok(())
}

fn validate_existing_manifest(
    record: &PluginManifestRecord,
    request: &PutPluginManifest,
) -> Result<()> {
    let entry_matches = match (&record.entry, &request.entry) {
        (None, None) => true,
        (Some(left), Some(right)) => left == right,
        _ => false,
    };
    let metadata_matches = match (&record.metadata, &request.metadata) {
        (None, None) => true,
        (Some(left), Some(right)) => left == right,
        _ => false,
    };
    if record.plugin_id != request.plugin_id
        || record.version != request.version
        || record.name != request.name
        || record.capabilities != request.capabilities
        || !entry_matches
        || !metadata_matches
    {
        return Err(SystemServiceError::Invariant(format!(
            "plugin manifest already exists with different content: {}@{}",
            record.plugin_id, record.version
        )));
    }
    Ok(())
}

fn validate_existing_install(
    record: &PluginInstallRecord,
    request: &PutPluginInstall,
) -> Result<()> {
    let metadata_matches = match (&record.metadata, &request.metadata) {
        (None, None) => true,
        (Some(left), Some(right)) => left == right,
        _ => false,
    };
    if record.plugin_id != request.plugin_id
        || record.version != request.version
        || record.layout != request.layout
        || record.trust != request.trust
        || record.install_root_dir != request.install_root_dir
        || !metadata_matches
    {
        return Err(SystemServiceError::Invariant(format!(
            "plugin install already exists with different content: {}@{}",
            record.plugin_id, record.version
        )));
    }
    Ok(())
}

fn validate_manifest_state(state: &str) -> Result<()> {
    if !matches!(state, "registered" | "disabled") {
        return Err(SystemServiceError::Invariant(format!(
            "invalid plugin manifest state: {state}"
        )));
    }
    Ok(())
}

fn validate_optional_manifest_state(state: Option<&str>) -> Result<()> {
    if let Some(state) = state {
        validate_manifest_state(state)?;
    }
    Ok(())
}

fn validate_install_state(state: &str) -> Result<()> {
    if !matches!(state, "installed" | "disabled" | "removed") {
        return Err(SystemServiceError::Invariant(format!(
            "invalid plugin install state: {state}"
        )));
    }
    Ok(())
}

fn validate_optional_install_state(state: Option<&str>) -> Result<()> {
    if let Some(state) = state {
        validate_install_state(state)?;
    }
    Ok(())
}

pub(crate) fn validate_plugin_capability(capability: &str) -> Result<()> {
    if !matches!(
        capability,
        "resource.read"
            | "resource.write"
            | "workspace.change.propose"
            | "delegation.graph.read"
            | "delegation.graph.write"
            | "team.conversation.read"
            | "team.conversation.write"
            | "channel.connect"
            | "channel.receive"
            | "channel.deliver"
            | "config.read"
            | "config.write"
            | "network.fetch"
    ) {
        return Err(SystemServiceError::Invariant(format!(
            "invalid plugin capability: {capability}"
        )));
    }
    Ok(())
}

pub(crate) fn get_manifest_by_plugin_tx(
    tx: &rusqlite::Transaction<'_>,
    plugin_id: &str,
    version: Option<&str>,
) -> Result<Option<PluginManifestRecord>> {
    if let Some(version) = version {
        return tx
            .query_row(
                &format!("{PLUGIN_SELECT} WHERE plugin_id = ? AND version = ?"),
                params![plugin_id, version],
                row_to_plugin_manifest,
            )
            .optional()
            .map_err(Into::into);
    }
    tx.query_row(
        &format!(
            "{PLUGIN_SELECT}
             WHERE plugin_id = ?
             ORDER BY created_at DESC, id ASC
             LIMIT 1"
        ),
        params![plugin_id],
        row_to_plugin_manifest,
    )
    .optional()
    .map_err(Into::into)
}

fn get_manifest_by_id_tx(
    tx: &rusqlite::Transaction<'_>,
    manifest_id: &str,
) -> Result<Option<PluginManifestRecord>> {
    tx.query_row(
        &format!("{PLUGIN_SELECT} WHERE id = ?"),
        params![manifest_id],
        row_to_plugin_manifest,
    )
    .optional()
    .map_err(Into::into)
}

fn get_install_by_plugin_tx(
    tx: &rusqlite::Transaction<'_>,
    plugin_id: &str,
    version: Option<&str>,
) -> Result<Option<PluginInstallRecord>> {
    if let Some(version) = version {
        return tx
            .query_row(
                &format!("{PLUGIN_INSTALL_SELECT} WHERE plugin_id = ? AND plugin_version = ?"),
                params![plugin_id, version],
                row_to_plugin_install,
            )
            .optional()
            .map_err(Into::into);
    }
    tx.query_row(
        &format!(
            "{PLUGIN_INSTALL_SELECT}
             WHERE plugin_id = ?
             ORDER BY installed_at DESC, id ASC
             LIMIT 1"
        ),
        params![plugin_id],
        row_to_plugin_install,
    )
    .optional()
    .map_err(Into::into)
}

fn get_install_by_plugin_conn(
    conn: &rusqlite::Connection,
    plugin_id: &str,
    version: Option<&str>,
) -> Result<Option<PluginInstallRecord>> {
    if let Some(version) = version {
        return conn
            .query_row(
                &format!("{PLUGIN_INSTALL_SELECT} WHERE plugin_id = ? AND plugin_version = ?"),
                params![plugin_id, version],
                row_to_plugin_install,
            )
            .optional()
            .map_err(Into::into);
    }
    conn.query_row(
        &format!(
            "{PLUGIN_INSTALL_SELECT}
             WHERE plugin_id = ?
             ORDER BY installed_at DESC, id ASC
             LIMIT 1"
        ),
        params![plugin_id],
        row_to_plugin_install,
    )
    .optional()
    .map_err(Into::into)
}

fn get_install_by_id_tx(
    tx: &rusqlite::Transaction<'_>,
    install_id: &str,
) -> Result<Option<PluginInstallRecord>> {
    tx.query_row(
        &format!("{PLUGIN_INSTALL_SELECT} WHERE id = ?"),
        params![install_id],
        row_to_plugin_install,
    )
    .optional()
    .map_err(Into::into)
}

fn collect_manifests(
    rows: impl Iterator<Item = rusqlite::Result<PluginManifestRecord>>,
) -> Result<Vec<PluginManifestRecord>> {
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}

fn collect_installs(
    rows: impl Iterator<Item = rusqlite::Result<PluginInstallRecord>>,
) -> Result<Vec<PluginInstallRecord>> {
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}

fn append_plugin_event_tx(
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
