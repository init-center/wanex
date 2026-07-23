use crate::event_store::append_event_tx;
use crate::rows::row_to_resource;
use crate::{
    CleanupExpiredResourceTickets, EventScope, FileRecord, IngestResource, ListResources,
    ResourceCapability, ResourceContentChunk, ResourceRecord, ResourceTicket,
    ResourceTicketCleanupReceipt, Result, RuntimeEvent, SystemService, SystemServiceError,
};
use rusqlite::{params, OptionalExtension};
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

        let mut conn = self.connect()?;
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;
        crate::atomic_file::write_replacing(&absolute_path, content)?;

        crate::util::sync_parent_dir(&absolute_path)?;

        let updated_at = crate::util::now_ms();
        let resource_id = crate::util::resource_id_for_path(logical_path);
        let record = FileRecord {
            resource_id: resource_id.clone(),
            logical_path: logical_path.to_string(),
            absolute_path: absolute_path.clone(),
            size_bytes: content.len() as u64,
            sha256: sha256.clone(),
            updated_at,
        };

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
        let logical_path = request
            .logical_path
            .clone()
            .unwrap_or_else(|| default_resource_logical_path(kind, &sha256));
        crate::util::validate_logical_path(&logical_path)?;
        let resource_id = request
            .id
            .clone()
            .unwrap_or_else(|| format!("res_{sha256}"));
        let now = crate::util::now_ms();
        let source = request.source.clone();
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

fn default_resource_logical_path(kind: &str, sha256: &str) -> String {
    format!("resources/{kind}/{sha256}")
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
