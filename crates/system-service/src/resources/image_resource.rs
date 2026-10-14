use super::{
    image, record_resource_provenance_tx, resource_input_evidence_json,
    validate_resource_input_evidence_tx,
};
use crate::{
    ImagePreparationMode, IngestResource, ListResourceProvenance, PrepareImageResource,
    PreparedImageResource, RecordResourceProvenance, ResourceInputEvidence,
    ResourceProvenanceCause, ResourceRecord, Result, SystemService, SystemServiceError,
};

pub(super) const POLICY: &str = "image-4096-jpeg85-triangle-preserve4m-20261013";

pub(super) fn normalization_key(source: &ResourceInputEvidence) -> String {
    crate::util::digest_json(&serde_json::json!({
        "source": resource_input_evidence_json(source), "policy": POLICY
    }))
}

impl SystemService {
    pub fn prepare_image_resource(
        &self,
        request: &PrepareImageResource,
    ) -> Result<PreparedImageResource> {
        let source = &request.resource;
        if source.kind != "image"
            || source.size_bytes <= 0
            || source.size_bytes > image::MAX_INPUT_BYTES as i64
        {
            return Err(SystemServiceError::InvalidInput(
                "image resource exceeds input policy".into(),
            ));
        }
        let original = {
            let mut conn = self.connect()?;
            let tx = conn.transaction()?;
            validate_resource_input_evidence_tx(&tx, source)?
        };
        // Hash the actual file before trusting either a cached derivative or its metadata.
        let bytes = self.read_image_bytes(source)?;
        let key = normalization_key(source);
        if request.mode == ImagePreparationMode::Normalize {
            let cached = self.list_resource_provenance(&ListResourceProvenance {
                resource_id: None,
                cause_kind: Some("image_normalization".into()),
                cause_id: Some(key.clone()),
                limit: Some(1),
            })?;
            if let Some(cached) = cached.first() {
                if cached.input_resources != [source.clone()] {
                    return Err(SystemServiceError::Invariant(
                        "image cache input evidence changed".into(),
                    ));
                }
                let mut conn = self.connect()?;
                let tx = conn.transaction()?;
                let resource = validate_resource_input_evidence_tx(&tx, &cached.resource)?;
                drop(tx);
                self.read_image_bytes(&cached.resource)?;
                let width = resource.width.and_then(|v| u32::try_from(v).ok());
                let height = resource.height.and_then(|v| u32::try_from(v).ok());
                if let (Some(width), Some(height)) = (width, height) {
                    return Ok(PreparedImageResource {
                        resource,
                        width,
                        height,
                        transformed: true,
                    });
                }
                return Err(SystemServiceError::Invariant(
                    "image cache dimensions missing".into(),
                ));
            }
        }
        let prepared = image::prepare(
            &bytes,
            source.media_type.as_deref().unwrap_or(""),
            request.mode == ImagePreparationMode::Preserve,
        )?;
        if !prepared.transformed {
            return Ok(PreparedImageResource {
                resource: original,
                width: prepared.width,
                height: prepared.height,
                transformed: false,
            });
        }
        let resource = self.ingest_resource(&IngestResource {
            id: None,
            logical_path: None,
            content: prepared.bytes,
            media_type: Some(prepared.media_type.into()),
            kind: Some("image".into()),
            origin: Some("system".into()),
            label: None,
            source: None,
            metadata: Some(serde_json::json!({ "normalizationKey": key, "policy": POLICY })),
            width: Some(i64::from(prepared.width)),
            height: Some(i64::from(prepared.height)),
            duration_ms: None,
            expected_sha256: None,
        })?;
        let mut conn = self.connect()?;
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;
        record_resource_provenance_tx(
            &tx,
            &RecordResourceProvenance {
                resource: evidence(&resource),
                cause: ResourceProvenanceCause::ImageNormalization {
                    normalization_key: key,
                    policy: POLICY.into(),
                },
                input_resources: vec![source.clone()],
            },
            crate::util::now_ms(),
        )?;
        tx.commit()?;
        Ok(PreparedImageResource {
            resource,
            width: prepared.width,
            height: prepared.height,
            transformed: true,
        })
    }

    fn read_image_bytes(&self, evidence: &ResourceInputEvidence) -> Result<Vec<u8>> {
        if evidence.size_bytes <= 0 || evidence.size_bytes > image::MAX_INPUT_BYTES as i64 {
            return Err(SystemServiceError::InvalidInput(
                "image resource exceeds input policy".into(),
            ));
        }
        let mut bytes = Vec::with_capacity(evidence.size_bytes as usize);
        while bytes.len() < evidence.size_bytes as usize {
            let chunk = self
                .read_resource_content(
                    &evidence.resource_id,
                    &evidence.sha256,
                    bytes.len() as u64,
                    1024 * 1024,
                )?
                .ok_or_else(|| SystemServiceError::NotFound("image resource".into()))?;
            if chunk.content.is_empty() || chunk.total_size_bytes != evidence.size_bytes as u64 {
                return Err(SystemServiceError::Invariant(
                    "image content size changed".into(),
                ));
            }
            bytes.extend_from_slice(&chunk.content);
        }
        if bytes.len() != evidence.size_bytes as usize
            || crate::util::hex_sha256(&bytes) != evidence.sha256
        {
            return Err(SystemServiceError::Invariant(
                "image content hash changed".into(),
            ));
        }
        Ok(bytes)
    }
}

fn evidence(resource: &ResourceRecord) -> ResourceInputEvidence {
    ResourceInputEvidence {
        resource_id: resource.id.clone(),
        sha256: resource.sha256.clone(),
        size_bytes: resource.size_bytes,
        kind: resource.kind.clone(),
        media_type: resource.media_type.clone(),
    }
}

#[cfg(test)]
mod tests;
