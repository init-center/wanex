use crate::event_store::append_event_tx;
use crate::rows::{row_to_plugin_install, row_to_plugin_manifest};
use crate::scheduler::enqueue_job_tx;
use crate::{
    ActivatePluginInstall, EnqueueJob, EventScope, GetPluginActionExecutionAdmission,
    GetPluginInstall, GetPluginManifest, ListPluginInstalls, ListPluginManifests,
    PluginActionExecutionAdmission, PluginActionSubmission, PluginInstallActivation,
    PluginInstallRecord, PluginManifestRecord, PutPluginInstall, PutPluginManifest, Result,
    SchedulerJobKind, SubmitPluginAction, SystemService, SystemServiceError,
    UpdatePluginInstallState, UpdatePluginManifestState,
};
use rusqlite::{params, OptionalExtension, Transaction};
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
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;
        let record = put_plugin_manifest_tx(&tx, request, now)?;
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
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;
        let record = put_plugin_install_tx(&tx, request, now)?;
        tx.commit()?;
        Ok(record)
    }

    pub fn activate_plugin_install(
        &self,
        request: &ActivatePluginInstall,
    ) -> Result<PluginInstallActivation> {
        validate_put_manifest(&request.manifest)?;
        validate_put_plugin_install(&request.install)?;
        if request.manifest.plugin_id != request.install.plugin_id
            || request.manifest.version != request.install.version
        {
            return Err(SystemServiceError::Invariant(
                "plugin activation manifest/install identity mismatch".to_string(),
            ));
        }
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;
        let manifest = put_plugin_manifest_tx(&tx, &request.manifest, now)?;
        let install = put_plugin_install_tx(&tx, &request.install, now)?;
        tx.commit()?;
        Ok(PluginInstallActivation { manifest, install })
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
        if request.plugin_id.is_empty() || request.version.is_empty() {
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
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;
        let existing =
            get_manifest_by_plugin_tx(&tx, &request.plugin_id, Some(request.version.as_str()))?
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
        validate_install_state(&request.expected_state)?;
        validate_install_state(&request.state)?;
        if request.plugin_id.is_empty() || request.version.is_empty() {
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
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;
        let existing =
            get_install_by_plugin_tx(&tx, &request.plugin_id, Some(request.version.as_str()))?
                .ok_or_else(|| {
                    SystemServiceError::Invariant(format!(
                        "plugin install does not exist: {}",
                        request.plugin_id
                    ))
                })?;
        if existing.state != request.expected_state {
            return Err(SystemServiceError::Invariant(format!(
                "plugin install state conflict: {}@{} expected {} but is {}",
                existing.plugin_id, existing.version, request.expected_state, existing.state
            )));
        }
        if existing.state == request.state {
            tx.commit()?;
            return Ok(existing);
        }
        if request.state == "installed" {
            disable_other_installed_plugin_versions_tx(
                &tx,
                &existing.plugin_id,
                &existing.version,
                now,
            )?;
        }
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
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;
        let admission = require_plugin_action_execution_admission_tx(
            &tx,
            &request.plugin_id,
            &request.version,
            request.required_capability.as_deref(),
        )?;
        let manifest = admission.manifest;
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

    pub fn get_plugin_action_execution_admission(
        &self,
        request: &GetPluginActionExecutionAdmission,
    ) -> Result<PluginActionExecutionAdmission> {
        if request.plugin_id.is_empty()
            || request.version.is_empty()
            || request.required_capability.is_empty()
        {
            return Err(SystemServiceError::Invariant(
                "plugin action admission plugin/version/capability must not be empty".to_string(),
            ));
        }
        validate_plugin_capability(&request.required_capability)?;
        let mut conn = self.connect()?;
        let tx = conn.transaction()?;
        let admission = require_plugin_action_execution_admission_tx(
            &tx,
            &request.plugin_id,
            &request.version,
            Some(&request.required_capability),
        )?;
        tx.commit()?;
        Ok(admission)
    }
}

fn put_plugin_manifest_tx(
    tx: &Transaction<'_>,
    request: &PutPluginManifest,
    now: i64,
) -> Result<PluginManifestRecord> {
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
            return Ok(record);
        }
    }
    if let Some(record) = get_manifest_by_plugin_tx(tx, &request.plugin_id, Some(&request.version))?
    {
        validate_existing_manifest(&record, request)?;
        return Ok(record);
    }

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
        tx,
        "plugin.manifest.registered",
        &serde_json::json!({
            "pluginId": request.plugin_id,
            "version": request.version,
            "capabilities": request.capabilities
        }),
        now,
    )?;
    get_manifest_by_plugin_tx(tx, &request.plugin_id, Some(&request.version))?.ok_or_else(|| {
        SystemServiceError::Invariant(format!(
            "plugin manifest insert missing: {}@{}",
            request.plugin_id, request.version
        ))
    })
}

fn put_plugin_install_tx(
    tx: &Transaction<'_>,
    request: &PutPluginInstall,
    now: i64,
) -> Result<PluginInstallRecord> {
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
            return Ok(record);
        }
    }
    get_manifest_by_plugin_tx(tx, &request.plugin_id, Some(&request.version))?.ok_or_else(
        || {
            SystemServiceError::Invariant(format!(
                "plugin manifest does not exist: {}@{}",
                request.plugin_id, request.version
            ))
        },
    )?;
    if let Some(record) = get_install_by_plugin_tx(tx, &request.plugin_id, Some(&request.version))?
    {
        validate_existing_install(&record, request)?;
        return Ok(record);
    }

    disable_other_installed_plugin_versions_tx(tx, &request.plugin_id, &request.version, now)?;

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
        tx,
        "plugin.install.recorded",
        &serde_json::json!({
            "pluginId": request.plugin_id,
            "version": request.version,
            "installRootDir": request.install_root_dir
        }),
        now,
    )?;
    get_install_by_plugin_tx(tx, &request.plugin_id, Some(&request.version))?.ok_or_else(|| {
        SystemServiceError::Invariant(format!(
            "plugin install insert missing: {}@{}",
            request.plugin_id, request.version
        ))
    })
}

fn disable_other_installed_plugin_versions_tx(
    tx: &Transaction<'_>,
    plugin_id: &str,
    selected_version: &str,
    now: i64,
) -> Result<()> {
    let superseded = {
        let mut statement = tx.prepare(&format!(
            "{PLUGIN_INSTALL_SELECT}
             WHERE plugin_id = ? AND plugin_version <> ? AND state = 'installed'
             ORDER BY installed_at ASC, id ASC"
        ))?;
        let records = collect_installs(
            statement.query_map(params![plugin_id, selected_version], row_to_plugin_install)?,
        )?;
        records
    };
    if superseded.is_empty() {
        return Ok(());
    }
    tx.execute(
        "UPDATE plugin_install
         SET state = 'disabled', updated_at = ?, disabled_at = ?, removed_at = NULL
         WHERE plugin_id = ? AND plugin_version <> ? AND state = 'installed'",
        params![now, now, plugin_id, selected_version],
    )?;
    for install in superseded {
        append_plugin_event_tx(
            tx,
            "plugin.install.state_updated",
            &serde_json::json!({
                "pluginId": install.plugin_id,
                "version": install.version,
                "fromState": "installed",
                "toState": "disabled",
                "reason": "superseded"
            }),
            now,
        )?;
    }
    Ok(())
}

fn require_plugin_action_execution_admission_tx(
    tx: &Transaction<'_>,
    plugin_id: &str,
    version: &str,
    required_capability: Option<&str>,
) -> Result<PluginActionExecutionAdmission> {
    let manifest = get_manifest_by_plugin_tx(tx, plugin_id, Some(version))?.ok_or_else(|| {
        SystemServiceError::Invariant(format!(
            "plugin manifest does not exist: {plugin_id}@{version}"
        ))
    })?;
    if manifest.state != "registered" {
        return Err(SystemServiceError::Invariant(format!(
            "plugin manifest is not registered: {plugin_id}@{version}"
        )));
    }
    if let Some(capability) = required_capability {
        if !manifest.capabilities.iter().any(|item| item == capability) {
            return Err(SystemServiceError::Invariant(format!(
                "plugin capability not declared: {capability}"
            )));
        }
    }
    let install = get_install_by_plugin_tx(tx, plugin_id, Some(version))?.ok_or_else(|| {
        SystemServiceError::Invariant(format!(
            "plugin install does not exist: {plugin_id}@{version}"
        ))
    })?;
    validate_plugin_install_execution_trust(&manifest, &install)?;
    Ok(PluginActionExecutionAdmission { manifest, install })
}

fn validate_plugin_install_execution_trust(
    manifest: &PluginManifestRecord,
    install: &PluginInstallRecord,
) -> Result<()> {
    if install.plugin_id != manifest.plugin_id || install.version != manifest.version {
        return Err(SystemServiceError::Invariant(
            "plugin install identity does not match manifest".to_string(),
        ));
    }
    if install.state != "installed" {
        return Err(SystemServiceError::Invariant(format!(
            "plugin install is not installed: {}@{} is {}",
            install.plugin_id, install.version, install.state
        )));
    }
    let layout = install.layout.as_object().ok_or_else(|| {
        SystemServiceError::Invariant("plugin install layout must be an object".to_string())
    })?;
    if layout.get("pluginId").and_then(serde_json::Value::as_str)
        != Some(manifest.plugin_id.as_str())
        || layout.get("version").and_then(serde_json::Value::as_str)
            != Some(manifest.version.as_str())
    {
        return Err(SystemServiceError::Invariant(
            "plugin install layout identity does not match manifest".to_string(),
        ));
    }
    let trust = install.trust.as_object().ok_or_else(|| {
        SystemServiceError::Invariant("plugin install trust must be an object".to_string())
    })?;
    if trust.get("kind").and_then(serde_json::Value::as_str)
        != Some("wanex.plugin.package.trust.v1")
        || trust.get("pluginId").and_then(serde_json::Value::as_str)
            != Some(manifest.plugin_id.as_str())
        || trust.get("version").and_then(serde_json::Value::as_str)
            != Some(manifest.version.as_str())
    {
        return Err(SystemServiceError::Invariant(
            "plugin install trust identity does not match manifest".to_string(),
        ));
    }
    let source_kind = trust
        .get("source")
        .and_then(serde_json::Value::as_object)
        .and_then(|value| value.get("kind"))
        .and_then(serde_json::Value::as_str);
    if !matches!(
        source_kind,
        Some("local" | "registry" | "archive" | "git" | "builtin")
    ) {
        return Err(SystemServiceError::Invariant(
            "plugin install trust source is invalid".to_string(),
        ));
    }
    let trusted_root = trust
        .get("install")
        .and_then(serde_json::Value::as_object)
        .and_then(|value| value.get("rootDir"))
        .and_then(serde_json::Value::as_str);
    if trusted_root != Some(install.install_root_dir.as_str()) {
        return Err(SystemServiceError::Invariant(
            "plugin install trust root does not match install record".to_string(),
        ));
    }
    let decision = trust
        .get("decision")
        .and_then(serde_json::Value::as_object)
        .and_then(|value| value.get("status"))
        .and_then(serde_json::Value::as_str);
    if decision != Some("allow") {
        return Err(SystemServiceError::Invariant(
            "plugin install trust decision is not allow".to_string(),
        ));
    }
    if let Some(signature) = trust.get("signature") {
        let signature = signature.as_object().ok_or_else(|| {
            SystemServiceError::Invariant("plugin install signature must be an object".to_string())
        })?;
        if signature
            .get("kind")
            .and_then(serde_json::Value::as_str)
            .is_none_or(str::is_empty)
            || signature
                .get("verified")
                .and_then(serde_json::Value::as_bool)
                != Some(true)
        {
            return Err(SystemServiceError::Invariant(
                "plugin install signature is not verified".to_string(),
            ));
        }
    }
    Ok(())
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
        || request.version.is_empty()
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
