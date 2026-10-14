use super::*;
use std::io::Cursor;

fn ingest(service: &SystemService, width: u32) -> ResourceRecord {
    let img = ::image::DynamicImage::ImageRgba8(::image::ImageBuffer::from_pixel(
        width,
        4,
        ::image::Rgba([70, 100, 200, 128]),
    ));
    let mut content = Cursor::new(Vec::new());
    img.write_to(&mut content, ::image::ImageFormat::Png)
        .unwrap();
    service
        .ingest_resource(&IngestResource {
            id: None,
            logical_path: None,
            content: content.into_inner(),
            media_type: Some("image/png".into()),
            kind: Some("image".into()),
            origin: Some("user_upload".into()),
            label: None,
            source: None,
            metadata: None,
            width: Some(1),
            height: Some(1),
            duration_ms: None,
            expected_sha256: None,
        })
        .unwrap()
}

#[test]
fn preparation_keeps_original_and_reuses_verified_derivative() {
    let dir = tempfile::tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let original = ingest(&service, 8192);
    let request = PrepareImageResource {
        resource: evidence(&original),
        mode: ImagePreparationMode::Normalize,
    };
    let result = service.prepare_image_resource(&request).unwrap();
    assert!(result.transformed);
    assert_eq!((result.width, result.height), (4096, 2));
    assert_ne!(result.resource.id, original.id);
    assert_eq!(
        service.get_resource(&original.id).unwrap(),
        Some(original.clone())
    );
    assert_eq!(service.prepare_image_resource(&request).unwrap(), result);
    let records = service
        .list_resource_provenance(&ListResourceProvenance {
            resource_id: Some(result.resource.id),
            cause_kind: None,
            cause_id: None,
            limit: None,
        })
        .unwrap();
    assert_eq!(records.len(), 1);
    assert_eq!(records[0].input_resources, [evidence(&original)]);
    assert!(matches!(
        records[0].cause,
        ResourceProvenanceCause::ImageNormalization { .. }
    ));
    let preserved = service
        .prepare_image_resource(&PrepareImageResource {
            mode: ImagePreparationMode::Preserve,
            ..request
        })
        .unwrap();
    assert_eq!(preserved.resource, original);
    assert_eq!((preserved.width, preserved.height), (8192, 4));
    assert!(!preserved.transformed);
}

#[test]
fn preparation_rejects_stale_evidence_and_does_not_trust_caller_dimensions() {
    let dir = tempfile::tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let original = ingest(&service, 8);
    let mut request = PrepareImageResource {
        resource: evidence(&original),
        mode: ImagePreparationMode::Normalize,
    };
    let result = service.prepare_image_resource(&request).unwrap();
    assert_eq!((result.width, result.height), (8, 4));
    assert!(!result.transformed);
    request.resource.sha256 = "a".repeat(64);
    assert!(service.prepare_image_resource(&request).is_err());
}

#[test]
fn original_file_tampering_is_detected_even_with_cached_derivative() {
    let dir = tempfile::tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let original = ingest(&service, 8192);
    let request = PrepareImageResource {
        resource: evidence(&original),
        mode: ImagePreparationMode::Normalize,
    };
    service.prepare_image_resource(&request).unwrap();
    let path: String = service
        .connect()
        .unwrap()
        .query_row(
            "SELECT absolute_path FROM resource WHERE id = ?",
            [&original.id],
            |row| row.get(0),
        )
        .unwrap();
    std::fs::write(path, vec![0; original.size_bytes as usize]).unwrap();
    assert!(service
        .prepare_image_resource(&request)
        .unwrap_err()
        .to_string()
        .contains("hash changed"));
}

#[test]
fn clients_cannot_forge_normalization_provenance() {
    let dir = tempfile::tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let original = ingest(&service, 8);
    let source = evidence(&original);
    assert!(service
        .record_resource_provenance(&RecordResourceProvenance {
            resource: source.clone(),
            input_resources: vec![source.clone()],
            cause: ResourceProvenanceCause::ImageNormalization {
                normalization_key: normalization_key(&source),
                policy: POLICY.into()
            },
        })
        .is_err());
}
