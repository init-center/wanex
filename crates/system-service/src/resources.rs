use crate::event_store::append_event_tx;
use crate::rows::row_to_resource;
use crate::{
    CleanupExpiredResourceTickets, EventScope, FileRecord, IngestResource, ListResourceProvenance,
    ListResources, RecordResourceProvenance, ResourceCapability, ResourceContentChunk,
    ResourceInputEvidence, ResourceProvenanceCause, ResourceProvenanceRecord, ResourceRecord,
    ResourceTicket, ResourceTicketCleanupReceipt, Result, RuntimeEvent, SystemService,
    SystemServiceError,
};
use rusqlite::{params, OptionalExtension};
use serde_json::{json, Map, Value};
use std::fs::{self, File, OpenOptions};
use std::io::{ErrorKind, Read, Seek, SeekFrom, Write};
use uuid::Uuid;

const MAX_RESOURCE_CONTENT_CHUNK_BYTES: u64 = 1024 * 1024;

const RESOURCE_SELECT: &str = "SELECT
    id, logical_path, kind, origin, state, media_type, label, size_bytes,
    sha256, source_provider, provider_file_id, provider_operation_id,
    source_url, source_expires_at, metadata_json, width, height, duration_ms,
    created_at, updated_at
 FROM resource";

const RESOURCE_PROVENANCE_SELECT: &str = "SELECT
    id, resource_id, resource_sha256, resource_size_bytes, resource_kind,
    resource_media_type, cause_json, input_resources_json, digest, created_at
 FROM resource_provenance";

const MAX_PROVENANCE_INPUT_RESOURCES: usize = 64;
const MAX_SAFE_INTEGER: i64 = 9_007_199_254_740_991;

impl SystemService {
    pub fn write_atomic_file(
        &self,
        logical_path: &str,
        content: &[u8],
        expected_sha256: Option<&str>,
    ) -> Result<FileRecord> {
        crate::util::validate_logical_path(logical_path)?;

        let sha256 = crate::util::hex_sha256(content);
        if let Some(expected) = expected_sha256 {
            if expected != sha256 {
                return Err(SystemServiceError::Sha256Mismatch {
                    logical_path: logical_path.to_string(),
                    expected: expected.to_string(),
                    actual: sha256,
                });
            }
        }

        let absolute_path = self.root_dir.join("files").join(logical_path);
        if let Some(parent) = absolute_path.parent() {
            fs::create_dir_all(parent)?;
        }

        let resource_id = crate::util::resource_id_for_path(logical_path);
        let lock_path = self
            .root_dir
            .join("locks")
            .join("resource-write")
            .join(format!("{resource_id}.lock"));
        let prepared = crate::atomic_file::prepare_replacement(&absolute_path, content)?;
        let _path_lock = crate::atomic_file::acquire_path_write_lock(&lock_path)?;
        prepared.commit()?;
        crate::util::sync_parent_dir(&absolute_path)?;

        let updated_at = crate::util::now_ms();
        let record = FileRecord {
            resource_id: resource_id.clone(),
            logical_path: logical_path.to_string(),
            absolute_path: absolute_path.clone(),
            size_bytes: content.len() as u64,
            sha256: sha256.clone(),
            updated_at,
        };

        let mut conn = self.connect()?;
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;
        tx.execute(
            "INSERT INTO resource (
                id, logical_path, absolute_path, kind, origin, media_type, label,
                size_bytes, sha256, state, created_at, updated_at
             ) VALUES (?, ?, ?, 'file', 'system', NULL, NULL, ?, ?, 'available', ?, ?)
             ON CONFLICT(logical_path) DO UPDATE SET
               absolute_path = excluded.absolute_path,
               kind = excluded.kind,
               origin = excluded.origin,
               size_bytes = excluded.size_bytes,
               sha256 = excluded.sha256,
               state = 'available',
               updated_at = excluded.updated_at",
            params![
                resource_id,
                record.logical_path,
                record.absolute_path.to_string_lossy(),
                record.size_bytes as i64,
                record.sha256,
                updated_at,
                updated_at,
            ],
        )?;
        tx.commit()?;

        Ok(record)
    }

    pub fn ingest_resource(&self, request: &IngestResource) -> Result<ResourceRecord> {
        validate_ingest_resource(request)?;
        let sha256 = crate::util::hex_sha256(&request.content);
        if let Some(expected) = &request.expected_sha256 {
            if expected != &sha256 {
                return Err(SystemServiceError::Sha256Mismatch {
                    logical_path: request
                        .logical_path
                        .clone()
                        .unwrap_or_else(|| "resource".to_string()),
                    expected: expected.clone(),
                    actual: sha256,
                });
            }
        }

        let kind = request.kind.as_deref().unwrap_or("artifact");
        let origin = request.origin.as_deref().unwrap_or("system");
        validate_resource_kind(kind)?;
        validate_resource_origin(origin)?;
        let source = request.source.clone();
        let snapshot_digest = crate::util::digest_json(&json!({
            "sha256": &sha256,
            "kind": kind,
            "origin": origin,
            "mediaType": request.media_type,
            "label": request.label,
            "source": source,
            "metadata": request.metadata,
            "width": request.width,
            "height": request.height,
            "durationMs": request.duration_ms,
        }));
        let logical_path = request
            .logical_path
            .clone()
            .unwrap_or_else(|| default_resource_logical_path(kind, &snapshot_digest));
        crate::util::validate_logical_path(&logical_path)?;
        let resource_id = request
            .id
            .clone()
            .unwrap_or_else(|| format!("res_{snapshot_digest}"));
        let now = crate::util::now_ms();
        let metadata_json = request
            .metadata
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        if let Some(existing) = get_resource_identity_conflict_tx(&tx, &resource_id, &logical_path)?
        {
            if existing.id != resource_id
                || existing.logical_path != logical_path
                || existing.sha256 != sha256
                || existing.size_bytes != request.content.len() as i64
                || existing.kind != kind
                || existing.origin != origin
                || existing.state != "available"
                || existing.media_type != request.media_type
                || existing.label != request.label
                || existing.source != source
                || existing.metadata != request.metadata
                || existing.width != request.width
                || existing.height != request.height
                || existing.duration_ms != request.duration_ms
            {
                return Err(SystemServiceError::Invariant(format!(
                    "resource snapshots are immutable: id={resource_id}, logical_path={logical_path}"
                )));
            }
            return Ok(existing);
        }
        let absolute_path = self.root_dir.join("files").join(&logical_path);
        write_immutable_resource_bytes(&absolute_path, &request.content, &sha256)?;
        tx.execute(
            "INSERT INTO resource (
                id, logical_path, absolute_path, kind, origin, media_type, label,
                size_bytes, sha256, state, source_provider, provider_file_id,
                provider_operation_id, source_url, source_expires_at, metadata_json,
                width, height, duration_ms, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                resource_id,
                logical_path,
                absolute_path.to_string_lossy(),
                kind,
                origin,
                request.media_type,
                request.label,
                request.content.len() as i64,
                sha256,
                source.as_ref().and_then(|source| source.provider.as_ref()),
                source
                    .as_ref()
                    .and_then(|source| source.provider_file_id.as_ref()),
                source
                    .as_ref()
                    .and_then(|source| source.provider_operation_id.as_ref()),
                source
                    .as_ref()
                    .and_then(|source| source.source_url.as_ref()),
                source.as_ref().and_then(|source| source.source_expires_at),
                metadata_json,
                request.width,
                request.height,
                request.duration_ms,
                now,
                now,
            ],
        )?;
        let record = get_resource_by_logical_path_tx(&tx, &logical_path)?;
        append_event_tx(
            &tx,
            &format!("evt_{}", Uuid::now_v7()),
            "resource.ingested",
            &EventScope {
                resource_id: Some(record.id.clone()),
                ..EventScope::default()
            },
            &serde_json::json!({
                "resourceId": record.id,
                "logicalPath": record.logical_path,
                "kind": record.kind,
                "origin": record.origin,
                "mediaType": record.media_type,
                "sizeBytes": record.size_bytes,
                "sha256": record.sha256,
                "updatedAt": now
            }),
            now,
        )?;
        tx.commit()?;
        Ok(record)
    }

    pub fn get_resource(&self, resource_id: &str) -> Result<Option<ResourceRecord>> {
        if resource_id.is_empty() {
            return Err(SystemServiceError::Invariant(
                "resource id must not be empty".to_string(),
            ));
        }
        let conn = self.connect()?;
        conn.query_row(
            &format!("{RESOURCE_SELECT} WHERE id = ?"),
            params![resource_id],
            row_to_resource,
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn read_resource_content(
        &self,
        resource_id: &str,
        expected_sha256: &str,
        offset: u64,
        limit: u64,
    ) -> Result<Option<ResourceContentChunk>> {
        if resource_id.is_empty() {
            return Err(SystemServiceError::InvalidInput(
                "resource id must not be empty".to_string(),
            ));
        }
        if expected_sha256.len() != 64 {
            return Err(SystemServiceError::InvalidInput(
                "resource expected_sha256 must contain 64 characters".to_string(),
            ));
        }
        if !(1..=MAX_RESOURCE_CONTENT_CHUNK_BYTES).contains(&limit) {
            return Err(SystemServiceError::InvalidInput(format!(
                "resource content limit must be between 1 and {MAX_RESOURCE_CONTENT_CHUNK_BYTES}"
            )));
        }
        let conn = self.connect()?;
        let stored = conn
            .query_row(
                "SELECT absolute_path, size_bytes, sha256, state FROM resource WHERE id = ?",
                params![resource_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                    ))
                },
            )
            .optional()?;
        let Some((absolute_path, size_bytes, sha256, state)) = stored else {
            return Ok(None);
        };
        if state != "available" {
            return Err(SystemServiceError::InvalidInput(format!(
                "resource is not available: {resource_id} ({state})"
            )));
        }
        if sha256 != expected_sha256 {
            return Err(SystemServiceError::Sha256Mismatch {
                logical_path: resource_id.to_string(),
                expected: expected_sha256.to_string(),
                actual: sha256,
            });
        }
        let size_bytes = u64::try_from(size_bytes).map_err(|_| {
            SystemServiceError::Invariant(format!("resource has a negative size: {resource_id}"))
        })?;
        if offset > size_bytes {
            return Err(SystemServiceError::InvalidInput(format!(
                "resource content offset {offset} exceeds size {size_bytes}"
            )));
        }
        let mut file = File::open(absolute_path)?;
        let actual_size = file.metadata()?.len();
        if actual_size != size_bytes {
            return Err(SystemServiceError::Invariant(format!(
                "resource file size changed: {resource_id} expected {size_bytes}, got {actual_size}"
            )));
        }
        file.seek(SeekFrom::Start(offset))?;
        let read_length = std::cmp::min(limit, size_bytes - offset) as usize;
        let mut content = vec![0; read_length];
        file.read_exact(&mut content)?;
        Ok(Some(ResourceContentChunk {
            resource_id: resource_id.to_string(),
            sha256: expected_sha256.to_string(),
            total_size_bytes: size_bytes,
            offset,
            content,
            eof: offset + read_length as u64 == size_bytes,
        }))
    }

    pub fn list_resources(&self, request: &ListResources) -> Result<Vec<ResourceRecord>> {
        let limit = request.limit.unwrap_or(100).clamp(1, 1_000);
        if let Some(kind) = &request.kind {
            validate_resource_kind(kind)?;
        }
        if let Some(origin) = &request.origin {
            validate_resource_origin(origin)?;
        }
        if let Some(state) = &request.state {
            validate_resource_state(state)?;
        }
        let conn = self.connect()?;
        match (&request.kind, &request.origin, &request.state) {
            (Some(kind), Some(origin), Some(state)) => {
                let mut stmt = conn.prepare(&format!(
                    "{RESOURCE_SELECT}
                     WHERE kind = ? AND origin = ? AND state = ?
                     ORDER BY updated_at DESC, id ASC
                     LIMIT ?"
                ))?;
                let records = collect_resources(
                    stmt.query_map(params![kind, origin, state, limit], row_to_resource)?,
                )?;
                Ok(records)
            }
            (Some(kind), None, Some(state)) => {
                let mut stmt = conn.prepare(&format!(
                    "{RESOURCE_SELECT}
                     WHERE kind = ? AND state = ?
                     ORDER BY updated_at DESC, id ASC
                     LIMIT ?"
                ))?;
                let records = collect_resources(
                    stmt.query_map(params![kind, state, limit], row_to_resource)?,
                )?;
                Ok(records)
            }
            (None, Some(origin), Some(state)) => {
                let mut stmt = conn.prepare(&format!(
                    "{RESOURCE_SELECT}
                     WHERE origin = ? AND state = ?
                     ORDER BY updated_at DESC, id ASC
                     LIMIT ?"
                ))?;
                let records = collect_resources(
                    stmt.query_map(params![origin, state, limit], row_to_resource)?,
                )?;
                Ok(records)
            }
            (Some(kind), Some(origin), None) => {
                let mut stmt = conn.prepare(&format!(
                    "{RESOURCE_SELECT}
                     WHERE kind = ? AND origin = ?
                     ORDER BY updated_at DESC, id ASC
                     LIMIT ?"
                ))?;
                let records = collect_resources(
                    stmt.query_map(params![kind, origin, limit], row_to_resource)?,
                )?;
                Ok(records)
            }
            (Some(kind), None, None) => {
                let mut stmt = conn.prepare(&format!(
                    "{RESOURCE_SELECT}
                     WHERE kind = ?
                     ORDER BY updated_at DESC, id ASC
                     LIMIT ?"
                ))?;
                let records =
                    collect_resources(stmt.query_map(params![kind, limit], row_to_resource)?)?;
                Ok(records)
            }
            (None, Some(origin), None) => {
                let mut stmt = conn.prepare(&format!(
                    "{RESOURCE_SELECT}
                     WHERE origin = ?
                     ORDER BY updated_at DESC, id ASC
                     LIMIT ?"
                ))?;
                let records =
                    collect_resources(stmt.query_map(params![origin, limit], row_to_resource)?)?;
                Ok(records)
            }
            (None, None, Some(state)) => {
                let mut stmt = conn.prepare(&format!(
                    "{RESOURCE_SELECT}
                     WHERE state = ?
                     ORDER BY updated_at DESC, id ASC
                     LIMIT ?"
                ))?;
                let records =
                    collect_resources(stmt.query_map(params![state, limit], row_to_resource)?)?;
                Ok(records)
            }
            (None, None, None) => {
                let mut stmt = conn.prepare(&format!(
                    "{RESOURCE_SELECT}
                     ORDER BY updated_at DESC, id ASC
                     LIMIT ?"
                ))?;
                let records = collect_resources(stmt.query_map(params![limit], row_to_resource)?)?;
                Ok(records)
            }
        }
    }

    pub fn create_resource_ticket(
        &self,
        principal_id: &str,
        resource_id: &str,
        capability: ResourceCapability,
        expires_at: i64,
    ) -> Result<ResourceTicket> {
        let ticket = ResourceTicket {
            id: format!("rt_{}", Uuid::now_v7()),
            principal_id: principal_id.to_string(),
            resource_id: resource_id.to_string(),
            capability,
            expires_at,
            revoked_at: None,
        };

        let conn = self.connect()?;
        conn.execute(
            "INSERT INTO resource_ticket (
                id, principal_id, resource_id, capability,
                expires_at, revoked_at, created_at
             ) VALUES (?, ?, ?, ?, ?, NULL, ?)",
            params![
                ticket.id,
                ticket.principal_id,
                ticket.resource_id,
                ticket.capability.as_str(),
                ticket.expires_at,
                crate::util::now_ms(),
            ],
        )?;

        Ok(ticket)
    }

    pub fn cleanup_expired_resource_tickets(
        &self,
        request: &CleanupExpiredResourceTickets,
    ) -> Result<ResourceTicketCleanupReceipt> {
        let now_ms = request.now_ms.unwrap_or_else(crate::util::now_ms);
        let limit = request.limit.unwrap_or(1_000).clamp(1, 10_000);

        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let revoked_ticket_ids = {
            let mut statement = tx.prepare(
                "SELECT id
                 FROM resource_ticket
                 WHERE revoked_at IS NULL
                   AND expires_at <= ?
                 ORDER BY expires_at ASC, id ASC
                 LIMIT ?",
            )?;
            let rows =
                statement.query_map(params![now_ms, limit], |row| row.get::<_, String>(0))?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        };

        for ticket_id in &revoked_ticket_ids {
            tx.execute(
                "UPDATE resource_ticket
                 SET revoked_at = ?
                 WHERE id = ?
                   AND revoked_at IS NULL",
                params![now_ms, ticket_id],
            )?;
        }

        tx.commit()?;

        let receipt = ResourceTicketCleanupReceipt {
            revoked_count: revoked_ticket_ids.len() as u32,
            revoked_ticket_ids,
            now_ms,
        };

        if receipt.revoked_count > 0 {
            self.append_event(&RuntimeEvent {
                id: format!("evt_{}", Uuid::now_v7()),
                event_type: "resource.ticket.cleanup".to_string(),
                scope: EventScope::default(),
                payload: serde_json::to_value(&receipt)?,
                occurred_at: now_ms,
            })?;
        }

        Ok(receipt)
    }

    pub fn record_resource_provenance(
        &self,
        request: &RecordResourceProvenance,
    ) -> Result<ResourceProvenanceRecord> {
        validate_provenance_request(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;
        let output = validate_resource_input_evidence_tx(&tx, &request.resource)?;
        validate_provenance_cause_tx(&tx, &request.cause, &request.input_resources, &output)?;
        for input in &request.input_resources {
            validate_resource_input_evidence_tx(&tx, input)?;
        }

        let canonical = serde_json::json!({
            "resource": resource_input_evidence_json(&request.resource),
            "cause": resource_provenance_cause_json(&request.cause),
            "inputResources": request
                .input_resources
                .iter()
                .map(resource_input_evidence_json)
                .collect::<Vec<_>>()
        });
        let digest = crate::util::digest_json(&canonical);
        let id = format!("rprov_{digest}");
        let (cause_kind, cause_id) = provenance_cause_identity(&request.cause);
        tx.execute(
            "INSERT OR IGNORE INTO resource_provenance (
                id, resource_id, resource_sha256, resource_size_bytes,
                resource_kind, resource_media_type, cause_kind, cause_id,
                cause_json, input_resources_json, digest, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                id,
                request.resource.resource_id,
                request.resource.sha256,
                request.resource.size_bytes,
                request.resource.kind,
                request.resource.media_type,
                cause_kind,
                cause_id,
                serde_json::to_string(&request.cause)?,
                serde_json::to_string(&request.input_resources)?,
                digest,
                now
            ],
        )?;
        let record = get_resource_provenance_tx(&tx, &id)?;
        if record.resource != request.resource
            || record.cause != request.cause
            || record.input_resources != request.input_resources
            || record.digest != digest
        {
            return Err(SystemServiceError::Invariant(
                "resource provenance digest is bound to different evidence".to_string(),
            ));
        }
        tx.commit()?;
        Ok(record)
    }

    pub fn list_resource_provenance(
        &self,
        request: &ListResourceProvenance,
    ) -> Result<Vec<ResourceProvenanceRecord>> {
        if request.resource_id.as_deref().is_some_and(str::is_empty)
            || request.cause_id.as_deref().is_some_and(str::is_empty)
        {
            return Err(SystemServiceError::InvalidInput(
                "resource provenance filters must not be empty".to_string(),
            ));
        }
        if request.cause_id.is_some() && request.cause_kind.is_none() {
            return Err(SystemServiceError::InvalidInput(
                "resource provenance cause_id requires cause_kind".to_string(),
            ));
        }
        if request
            .cause_kind
            .as_deref()
            .is_some_and(|kind| !matches!(kind, "tool_execution" | "media_generation"))
        {
            return Err(SystemServiceError::InvalidInput(
                "invalid resource provenance cause_kind".to_string(),
            ));
        }
        let limit = request.limit.unwrap_or(100).clamp(1, 1_000);
        let conn = self.connect()?;
        let mut statement = conn.prepare(&format!(
            "{RESOURCE_PROVENANCE_SELECT}
             WHERE (?1 IS NULL OR resource_id = ?1)
               AND (?2 IS NULL OR cause_kind = ?2)
               AND (?3 IS NULL OR cause_id = ?3)
             ORDER BY created_at ASC, id ASC LIMIT ?4"
        ))?;
        let rows = statement.query_map(
            params![
                request.resource_id,
                request.cause_kind,
                request.cause_id,
                limit
            ],
            row_to_resource_provenance,
        )?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }
}

pub(crate) fn validate_resource_input_evidence_tx(
    tx: &rusqlite::Transaction<'_>,
    evidence: &ResourceInputEvidence,
) -> Result<ResourceRecord> {
    validate_resource_input_evidence_shape(evidence)?;
    let record = tx
        .query_row(
            &format!("{RESOURCE_SELECT} WHERE id = ?"),
            params![evidence.resource_id],
            row_to_resource,
        )
        .optional()?
        .ok_or_else(|| {
            SystemServiceError::InvalidInput(format!(
                "resource evidence is missing: {}",
                evidence.resource_id
            ))
        })?;
    if record.state != "available"
        || record.sha256 != evidence.sha256
        || record.size_bytes != evidence.size_bytes
        || record.kind != evidence.kind
        || record.media_type != evidence.media_type
    {
        return Err(SystemServiceError::Invariant(format!(
            "resource evidence does not match available immutable resource: {}",
            evidence.resource_id
        )));
    }
    Ok(record)
}

pub(crate) fn get_resource_tx(
    tx: &rusqlite::Transaction<'_>,
    resource_id: &str,
) -> Result<ResourceRecord> {
    tx.query_row(
        &format!("{RESOURCE_SELECT} WHERE id = ?"),
        params![resource_id],
        row_to_resource,
    )
    .optional()?
    .ok_or_else(|| {
        SystemServiceError::Invariant(format!(
            "resource not found after durable publication: {resource_id}"
        ))
    })
}

pub(crate) fn resource_input_evidence_json(evidence: &ResourceInputEvidence) -> Value {
    let mut object = Map::from_iter([
        (
            "resourceId".to_string(),
            Value::String(evidence.resource_id.clone()),
        ),
        ("sha256".to_string(), Value::String(evidence.sha256.clone())),
        ("sizeBytes".to_string(), Value::from(evidence.size_bytes)),
        ("kind".to_string(), Value::String(evidence.kind.clone())),
    ]);
    if let Some(media_type) = &evidence.media_type {
        object.insert("mediaType".to_string(), Value::String(media_type.clone()));
    }
    Value::Object(object)
}

pub(crate) fn require_media_output_provenance_tx(
    tx: &rusqlite::Transaction<'_>,
    resource_id: &str,
    operation_id: &str,
) -> Result<()> {
    let exists: bool = tx.query_row(
        "SELECT EXISTS(
           SELECT 1 FROM resource_provenance
           WHERE resource_id = ? AND cause_kind = 'media_generation' AND cause_id = ?
         )",
        params![resource_id, operation_id],
        |row| row.get(0),
    )?;
    if !exists {
        return Err(SystemServiceError::Invariant(format!(
            "media generation output has no matching provenance: {resource_id}"
        )));
    }
    Ok(())
}

fn validate_provenance_request(request: &RecordResourceProvenance) -> Result<()> {
    if request.input_resources.len() > MAX_PROVENANCE_INPUT_RESOURCES {
        return Err(SystemServiceError::InvalidInput(format!(
            "resource provenance accepts at most {MAX_PROVENANCE_INPUT_RESOURCES} inputs"
        )));
    }
    let mut seen = std::collections::HashSet::new();
    for input in &request.input_resources {
        validate_resource_input_evidence_shape(input)?;
        if !seen.insert(input.resource_id.as_str()) {
            return Err(SystemServiceError::InvalidInput(format!(
                "resource provenance input is duplicated: {}",
                input.resource_id
            )));
        }
    }
    validate_resource_input_evidence_shape(&request.resource)
}

fn validate_resource_input_evidence_shape(evidence: &ResourceInputEvidence) -> Result<()> {
    if evidence.resource_id.is_empty()
        || evidence.size_bytes <= 0
        || evidence.size_bytes > MAX_SAFE_INTEGER
    {
        return Err(SystemServiceError::InvalidInput(
            "resource evidence identity and positive safe size are required".to_string(),
        ));
    }
    crate::sessions::validate_sha256(&evidence.sha256, "resource evidence sha256")?;
    validate_resource_kind(&evidence.kind)?;
    if evidence.media_type.as_deref().is_some_and(str::is_empty) {
        return Err(SystemServiceError::InvalidInput(
            "resource evidence media_type must not be empty".to_string(),
        ));
    }
    Ok(())
}

fn validate_provenance_cause_tx(
    tx: &rusqlite::Transaction<'_>,
    cause: &ResourceProvenanceCause,
    input_resources: &[ResourceInputEvidence],
    output: &ResourceRecord,
) -> Result<()> {
    match cause {
        ResourceProvenanceCause::ToolExecution {
            execution_id,
            session_id,
            turn_id,
            source_message_id,
            tool_call_id,
        } => {
            if output.origin != "tool_output" {
                return Err(SystemServiceError::Invariant(
                    "tool provenance requires a tool_output resource".to_string(),
                ));
            }
            let identity: Option<(String, String, String, String, String)> = tx
                .query_row(
                    "SELECT session_id, turn_id, source_message_id, tool_call_id, state
                     FROM tool_execution WHERE id = ?",
                    params![execution_id],
                    |row| {
                        Ok((
                            row.get(0)?,
                            row.get(1)?,
                            row.get(2)?,
                            row.get(3)?,
                            row.get(4)?,
                        ))
                    },
                )
                .optional()?;
            let Some((stored_session, stored_turn, stored_message, stored_call, state)) = identity
            else {
                return Err(SystemServiceError::InvalidInput(
                    "tool provenance execution does not exist".to_string(),
                ));
            };
            if stored_session != *session_id
                || stored_turn != *turn_id
                || stored_message != *source_message_id
                || stored_call != *tool_call_id
                || !matches!(state.as_str(), "running" | "recovery_required")
            {
                return Err(SystemServiceError::Invariant(
                    "tool provenance cause does not match durable execution identity".to_string(),
                ));
            }
        }
        ResourceProvenanceCause::MediaGeneration { operation_id } => {
            if output.origin != "model_output" {
                return Err(SystemServiceError::Invariant(
                    "media provenance requires a model_output resource".to_string(),
                ));
            }
            let operation: Option<(String, String)> = tx
                .query_row(
                    "SELECT state, binding_json FROM media_generation_operation WHERE id = ?",
                    params![operation_id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .optional()?;
            let Some((state, binding_json)) = operation else {
                return Err(SystemServiceError::InvalidInput(
                    "media provenance operation does not exist".to_string(),
                ));
            };
            if !matches!(state.as_str(), "submitting" | "polling" | "materializing") {
                return Err(SystemServiceError::Invariant(
                    "media provenance requires an active generation operation".to_string(),
                ));
            }
            let binding: Value = serde_json::from_str(&binding_json)?;
            let frozen = binding
                .get("request")
                .and_then(|value| value.get("inputResources"))
                .cloned()
                .ok_or_else(|| {
                    SystemServiceError::Invariant(
                        "media generation binding has no frozen input resources".to_string(),
                    )
                })?;
            let frozen: Vec<ResourceInputEvidence> = serde_json::from_value(frozen)?;
            if frozen != input_resources {
                return Err(SystemServiceError::Invariant(
                    "media provenance inputs do not match frozen operation evidence".to_string(),
                ));
            }
        }
    }
    Ok(())
}

fn provenance_cause_identity(cause: &ResourceProvenanceCause) -> (&'static str, &str) {
    match cause {
        ResourceProvenanceCause::ToolExecution { execution_id, .. } => {
            ("tool_execution", execution_id)
        }
        ResourceProvenanceCause::MediaGeneration { operation_id } => {
            ("media_generation", operation_id)
        }
    }
}

fn resource_provenance_cause_json(cause: &ResourceProvenanceCause) -> Value {
    match cause {
        ResourceProvenanceCause::ToolExecution {
            execution_id,
            session_id,
            turn_id,
            source_message_id,
            tool_call_id,
        } => serde_json::json!({
            "kind": "tool_execution",
            "executionId": execution_id,
            "sessionId": session_id,
            "turnId": turn_id,
            "sourceMessageId": source_message_id,
            "toolCallId": tool_call_id
        }),
        ResourceProvenanceCause::MediaGeneration { operation_id } => serde_json::json!({
            "kind": "media_generation",
            "operationId": operation_id
        }),
    }
}

fn get_resource_provenance_tx(
    tx: &rusqlite::Transaction<'_>,
    id: &str,
) -> Result<ResourceProvenanceRecord> {
    tx.query_row(
        &format!("{RESOURCE_PROVENANCE_SELECT} WHERE id = ?"),
        params![id],
        row_to_resource_provenance,
    )
    .map_err(Into::into)
}

fn row_to_resource_provenance(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<ResourceProvenanceRecord> {
    let cause_json: String = row.get(6)?;
    let inputs_json: String = row.get(7)?;
    Ok(ResourceProvenanceRecord {
        id: row.get(0)?,
        resource: ResourceInputEvidence {
            resource_id: row.get(1)?,
            sha256: row.get(2)?,
            size_bytes: row.get(3)?,
            kind: row.get(4)?,
            media_type: row.get(5)?,
        },
        cause: serde_json::from_str(&cause_json).map_err(json_sql_error)?,
        input_resources: serde_json::from_str(&inputs_json).map_err(json_sql_error)?,
        digest: row.get(8)?,
        created_at: row.get(9)?,
    })
}

fn json_sql_error(error: serde_json::Error) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(error))
}

fn write_immutable_resource_bytes(
    absolute_path: &std::path::Path,
    content: &[u8],
    expected_sha256: &str,
) -> Result<()> {
    if let Some(parent) = absolute_path.parent() {
        fs::create_dir_all(parent)?;
    }
    match OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(absolute_path)
    {
        Ok(mut file) => {
            file.write_all(content)?;
            file.sync_all()?;
        }
        Err(error) if error.kind() == ErrorKind::AlreadyExists => {
            let existing = fs::read(absolute_path)?;
            let actual_sha256 = crate::util::hex_sha256(&existing);
            if actual_sha256 != expected_sha256 {
                return Err(SystemServiceError::Sha256Mismatch {
                    logical_path: absolute_path.to_string_lossy().into_owned(),
                    expected: expected_sha256.to_string(),
                    actual: actual_sha256,
                });
            }
        }
        Err(error) => return Err(error.into()),
    }
    crate::util::sync_parent_dir(absolute_path)
}

fn get_resource_identity_conflict_tx(
    tx: &rusqlite::Transaction<'_>,
    resource_id: &str,
    logical_path: &str,
) -> Result<Option<ResourceRecord>> {
    tx.query_row(
        &format!("{RESOURCE_SELECT} WHERE id = ? OR logical_path = ? LIMIT 1"),
        params![resource_id, logical_path],
        row_to_resource,
    )
    .optional()
    .map_err(Into::into)
}

fn validate_ingest_resource(request: &IngestResource) -> Result<()> {
    if request.content.is_empty() {
        return Err(SystemServiceError::Invariant(
            "resource content must not be empty".to_string(),
        ));
    }
    if let Some(width) = request.width {
        if width < 0 {
            return Err(SystemServiceError::Invariant(
                "resource width must be non-negative".to_string(),
            ));
        }
    }
    if let Some(height) = request.height {
        if height < 0 {
            return Err(SystemServiceError::Invariant(
                "resource height must be non-negative".to_string(),
            ));
        }
    }
    if let Some(duration_ms) = request.duration_ms {
        if duration_ms < 0 {
            return Err(SystemServiceError::Invariant(
                "resource duration_ms must be non-negative".to_string(),
            ));
        }
    }
    Ok(())
}

fn validate_resource_kind(kind: &str) -> Result<()> {
    match kind {
        "file" | "image" | "video" | "audio" | "document" | "artifact" | "log" | "patch"
        | "url" => Ok(()),
        _ => Err(SystemServiceError::Invariant(format!(
            "invalid resource kind: {kind}"
        ))),
    }
}

fn validate_resource_origin(origin: &str) -> Result<()> {
    match origin {
        "user_upload" | "model_output" | "tool_output" | "provider_file" | "remote_url"
        | "system" => Ok(()),
        _ => Err(SystemServiceError::Invariant(format!(
            "invalid resource origin: {origin}"
        ))),
    }
}

fn validate_resource_state(state: &str) -> Result<()> {
    match state {
        "pending" | "fetching" | "available" | "failed" | "expired" | "deleted" => Ok(()),
        _ => Err(SystemServiceError::Invariant(format!(
            "invalid resource state: {state}"
        ))),
    }
}

fn default_resource_logical_path(kind: &str, snapshot_digest: &str) -> String {
    format!("resources/{kind}/{snapshot_digest}")
}

fn get_resource_by_logical_path_tx(
    tx: &rusqlite::Transaction<'_>,
    logical_path: &str,
) -> Result<ResourceRecord> {
    tx.query_row(
        &format!("{RESOURCE_SELECT} WHERE logical_path = ?"),
        params![logical_path],
        row_to_resource,
    )
    .map_err(Into::into)
}

fn collect_resources(
    rows: impl Iterator<Item = rusqlite::Result<ResourceRecord>>,
) -> Result<Vec<ResourceRecord>> {
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}
