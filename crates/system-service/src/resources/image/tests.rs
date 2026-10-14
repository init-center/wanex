use super::*;
use image::{ImageBuffer, ImageEncoder, Rgb, Rgba};

fn fixture(format: ImageFormat, width: u32, height: u32, alpha: bool) -> Vec<u8> {
    let pixels = ImageBuffer::from_fn(width, height, |x, y| {
        Rgba([
            (x % 251) as u8,
            (y % 251) as u8,
            127,
            if alpha { 83 } else { 255 },
        ])
    });
    let mut img = DynamicImage::ImageRgba8(pixels);
    if !alpha {
        img = DynamicImage::ImageRgb8(img.to_rgb8());
    }
    let mut bytes = Cursor::new(Vec::new());
    img.write_to(&mut bytes, format).unwrap();
    bytes.into_inner()
}

#[test]
fn small_images_are_decoded_but_preserved_without_loss_or_growth() {
    for format in [ImageFormat::Png, ImageFormat::Jpeg, ImageFormat::WebP] {
        let bytes = fixture(format, 48, 24, format != ImageFormat::Jpeg);
        let result = prepare(&bytes, mime(format), false).unwrap();
        assert_eq!(result.bytes, bytes);
        assert_eq!(result.media_type, mime(format));
        assert_eq!((result.width, result.height), (48, 24));
        assert!(!result.transformed);
    }
}

#[test]
fn resize_preserves_aspect_ratio_and_png_alpha() {
    let bytes = fixture(ImageFormat::Png, 8192, 8, true);
    let result = prepare(&bytes, "image/png", false).unwrap();
    assert!(result.transformed);
    assert_eq!((result.width, result.height), (4096, 4));
    let decoded = image::load_from_memory(&result.bytes).unwrap().to_rgba8();
    assert!(decoded.pixels().all(|p| p[3] == 83));
    assert_eq!(result.media_type, "image/png");
}

#[test]
fn resized_webp_uses_alpha_appropriate_output() {
    for (alpha, expected) in [(true, "image/png"), (false, "image/jpeg")] {
        let result = prepare(
            &fixture(ImageFormat::WebP, 8192, 8, alpha),
            "image/webp",
            false,
        )
        .unwrap();
        assert_eq!(result.media_type, expected);
        assert_eq!((result.width, result.height), (4096, 4));
        assert!(image::load_from_memory(&result.bytes).is_ok());
    }
}

fn exif_orientation(value: u8) -> Vec<u8> {
    // Little-endian TIFF with a single SHORT Orientation IFD entry.
    vec![
        b'I', b'I', 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 1, 3, 0, 1, 0, 0, 0, value, 0, 0, 0, 0, 0, 0, 0,
    ]
}

#[test]
fn exif_rotates_jpeg_and_signed_preservation_keeps_original_bytes() {
    let pixels = ImageBuffer::from_pixel(32, 16, Rgb([170u8, 20, 60]));
    let mut bytes = Vec::new();
    let mut encoder = image::codecs::jpeg::JpegEncoder::new(&mut bytes);
    encoder.set_exif_metadata(exif_orientation(6)).unwrap();
    encoder.encode_image(&pixels).unwrap();
    let normalized = prepare(&bytes, "image/jpeg", false).unwrap();
    assert_eq!((normalized.width, normalized.height), (16, 32));
    assert!(normalized.transformed);
    let unchanged = prepare(&bytes, "image/jpeg", true).unwrap();
    assert_eq!(unchanged.bytes, bytes);
    assert!(!unchanged.transformed);
    let again = prepare(&normalized.bytes, "image/jpeg", false).unwrap();
    assert!(!again.transformed);
    assert_eq!((again.width, again.height), (16, 32));
}

fn chunk(kind: &[u8; 4], data: &[u8]) -> Vec<u8> {
    let mut bytes = (data.len() as u32).to_be_bytes().to_vec();
    bytes.extend_from_slice(kind);
    bytes.extend_from_slice(data);
    let mut crc = !0u32;
    for byte in &bytes[4..] {
        crc ^= u32::from(*byte);
        for _ in 0..8 {
            crc = (crc >> 1) ^ (0xedb88320 & (0u32.wrapping_sub(crc & 1)));
        }
    }
    bytes.extend_from_slice(&(!crc).to_be_bytes());
    bytes
}

#[test]
fn png_exif_orientation_is_applied_too() {
    let mut bytes = fixture(ImageFormat::Png, 8, 4, true);
    bytes.splice(33..33, chunk(b"eXIf", &exif_orientation(6)));
    let result = prepare(&bytes, "image/png", false).unwrap();
    assert_eq!((result.width, result.height), (4, 8));
    assert!(result.transformed);
}

#[test]
fn preserve_does_not_skip_size_or_decode_checks() {
    let bytes = fixture(ImageFormat::Png, 8192, 8, true);
    let result = prepare(&bytes, "image/png", true).unwrap();
    assert_eq!(result.bytes, bytes);
    assert_eq!((result.width, result.height), (8192, 8));
    assert!(prepare(&bytes[..bytes.len() / 2], "image/png", true).is_err());
    assert!(prepare(&vec![0; MAX_INPUT_BYTES + 1], "image/png", true).is_err());
}

#[test]
fn animation_is_rejected_instead_of_collapsing_to_a_frame() {
    let mut bytes = fixture(ImageFormat::Png, 8, 4, true);
    bytes.splice(33..33, chunk(b"acTL", &[0, 0, 0, 2, 0, 0, 0, 0]));
    for preserve in [false, true] {
        let error = prepare(&bytes, "image/png", preserve)
            .err()
            .unwrap()
            .to_string();
        assert!(error.contains("animated"), "{error}");
    }
}

#[test]
fn high_bit_depth_is_rejected() {
    let img = DynamicImage::ImageRgb16(ImageBuffer::from_pixel(2, 2, Rgb([65535, 42, 10])));
    let mut bytes = Cursor::new(Vec::new());
    img.write_to(&mut bytes, ImageFormat::Png).unwrap();
    assert!(prepare(bytes.get_ref(), "image/png", false)
        .err()
        .unwrap()
        .to_string()
        .contains("high-bit-depth"));
}

#[test]
fn animated_webp_is_rejected_even_in_preserve_mode() {
    fn riff_chunk(kind: &[u8; 4], bytes: &[u8]) -> Vec<u8> {
        let mut result = kind.to_vec();
        result.extend_from_slice(&(bytes.len() as u32).to_le_bytes());
        result.extend_from_slice(bytes);
        if !bytes.len().is_multiple_of(2) {
            result.push(0);
        }
        result
    }
    let frame = fixture(ImageFormat::WebP, 1, 1, false);
    let mut frame_data = vec![0; 16];
    frame_data[12] = 10;
    frame_data.extend_from_slice(&frame[12..]);
    let mut body = b"WEBP".to_vec();
    body.extend(riff_chunk(b"VP8X", &[2, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
    body.extend(riff_chunk(b"ANIM", &[0; 6]));
    body.extend(riff_chunk(b"ANMF", &frame_data));
    let mut bytes = b"RIFF".to_vec();
    bytes.extend_from_slice(&(body.len() as u32).to_le_bytes());
    bytes.extend(body);
    for preserve in [false, true] {
        let error = prepare(&bytes, "image/webp", preserve)
            .err()
            .unwrap()
            .to_string();
        assert!(error.contains("animated"), "{error}");
    }
}

#[test]
fn dimensions_are_checked_before_pixel_decode() {
    let bytes = fixture(ImageFormat::Png, 1, 1, false);
    for (width, height) in [(16385u32, 1u32), (6000, 5000), (0, 1), (u32::MAX, u32::MAX)] {
        let mut altered = bytes.clone();
        let mut header = bytes[16..29].to_vec();
        header[..4].copy_from_slice(&width.to_be_bytes());
        header[4..8].copy_from_slice(&height.to_be_bytes());
        altered.splice(8..33, chunk(b"IHDR", &header));
        assert!(prepare(&altered, "image/png", false).is_err());
    }
    assert!(check_dimensions(6000, 4000).is_ok());
    assert!(check_dimensions(6000, 4001).is_err());
}

#[test]
fn mime_mismatch_unknown_type_and_corruption_are_rejected() {
    let bytes = fixture(ImageFormat::Png, 2, 2, false);
    for media_type in [
        "image/jpeg",
        "image/gif",
        "image/svg+xml",
        "application/octet-stream",
    ] {
        assert!(prepare(&bytes, media_type, false).is_err());
    }
    assert!(prepare(b"secret corrupt contents", "image/png", false).is_err());
    assert!(prepare(&[], "image/png", false).is_err());
}

#[test]
fn encoder_output_is_bounded_during_write() {
    let mut output = BoundedOutput(vec![0; MAX_INPUT_BYTES - 1]);
    output.write_all(&[1]).unwrap();
    assert!(output.write_all(&[2]).is_err());
    assert_eq!(output.0.len(), MAX_INPUT_BYTES);
}
