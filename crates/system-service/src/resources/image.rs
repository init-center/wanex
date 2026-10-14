use crate::{Result, SystemServiceError};
use image::{metadata::Orientation, ColorType, DynamicImage, ImageDecoder, ImageFormat};
use std::io::{Cursor, Write};

pub(super) const MAX_INPUT_BYTES: usize = 25 * 1024 * 1024;
const MAX_EDGE: u32 = 16_384;
const MAX_PIXELS: u64 = 24_000_000;
const TARGET_EDGE: u32 = 4096;
const PRESERVE_BYTES: usize = 4 * 1024 * 1024;

pub(super) struct PreparedImage {
    pub bytes: Vec<u8>,
    pub media_type: &'static str,
    pub width: u32,
    pub height: u32,
    pub transformed: bool,
}

fn invalid(message: &str) -> SystemServiceError {
    SystemServiceError::InvalidInput(format!("image input: {message}"))
}

fn codec_error(_: image::ImageError) -> SystemServiceError {
    invalid("unsupported, corrupt or over-budget image")
}

fn limits() -> image::Limits {
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(MAX_EDGE);
    limits.max_image_height = Some(MAX_EDGE);
    limits.max_alloc = Some(256 * 1024 * 1024);
    limits
}

fn check_dimensions(width: u32, height: u32) -> Result<()> {
    if width == 0
        || height == 0
        || width > MAX_EDGE
        || height > MAX_EDGE
        || u64::from(width) * u64::from(height) > MAX_PIXELS
    {
        return Err(invalid("dimensions exceed policy"));
    }
    Ok(())
}

pub(super) fn prepare(bytes: &[u8], media_type: &str, preserve: bool) -> Result<PreparedImage> {
    if bytes.is_empty() || bytes.len() > MAX_INPUT_BYTES {
        return Err(invalid("compressed byte limit exceeded"));
    }
    let format = match media_type {
        "image/png" => ImageFormat::Png,
        "image/jpeg" => ImageFormat::Jpeg,
        "image/webp" => ImageFormat::WebP,
        _ => return Err(invalid("unsupported media type")),
    };
    if image::guess_format(bytes).map_err(codec_error)? != format {
        return Err(invalid("media type does not match content"));
    }
    let reader = Cursor::new(bytes);
    let mut decoder: Box<dyn ImageDecoder> = match format {
        ImageFormat::Png => {
            let decoder = image::codecs::png::PngDecoder::with_limits(reader, limits())
                .map_err(codec_error)?;
            if decoder.is_apng().map_err(codec_error)? {
                return Err(invalid("animated images are not supported"));
            }
            Box::new(decoder)
        }
        ImageFormat::Jpeg => {
            Box::new(image::codecs::jpeg::JpegDecoder::new(reader).map_err(codec_error)?)
        }
        ImageFormat::WebP => {
            let decoder = image::codecs::webp::WebPDecoder::new(reader).map_err(codec_error)?;
            if decoder.has_animation() {
                return Err(invalid("animated images are not supported"));
            }
            Box::new(decoder)
        }
        _ => unreachable!(),
    };
    let (width, height) = decoder.dimensions();
    check_dimensions(width, height)?;
    if !matches!(
        decoder.color_type(),
        ColorType::L8 | ColorType::La8 | ColorType::Rgb8 | ColorType::Rgba8
    ) {
        return Err(invalid("high-bit-depth images are not supported"));
    }
    decoder.set_limits(limits()).map_err(codec_error)?;
    // PNG exposes EXIF without overriding orientation(); read the same standard tag.
    let orientation = match decoder.exif_metadata().map_err(codec_error)? {
        Some(exif) => Orientation::from_exif_chunk(&exif).unwrap_or(Orientation::NoTransforms),
        None => decoder.orientation().map_err(codec_error)?,
    };
    let mut decoded = DynamicImage::from_decoder(decoder).map_err(codec_error)?;
    if preserve
        || (orientation == Orientation::NoTransforms
            && width.max(height) <= TARGET_EDGE
            && bytes.len() <= PRESERVE_BYTES)
    {
        return Ok(PreparedImage {
            bytes: bytes.to_vec(),
            media_type: mime(format),
            width,
            height,
            transformed: false,
        });
    }
    decoded.apply_orientation(orientation);
    if decoded.width().max(decoded.height()) > TARGET_EDGE {
        decoded = decoded.resize(
            TARGET_EDGE,
            TARGET_EDGE,
            image::imageops::FilterType::Triangle,
        );
    }
    let output_format = if format == ImageFormat::Png || decoded.color().has_alpha() {
        ImageFormat::Png
    } else {
        ImageFormat::Jpeg
    };
    let mut output = BoundedOutput(Vec::new());
    match output_format {
        ImageFormat::Png => {
            use image::ImageEncoder;
            image::codecs::png::PngEncoder::new(&mut output)
                .write_image(
                    decoded.as_bytes(),
                    decoded.width(),
                    decoded.height(),
                    decoded.color().into(),
                )
                .map_err(codec_error)?;
        }
        _ => image::codecs::jpeg::JpegEncoder::new_with_quality(&mut output, 85)
            .encode_image(&decoded)
            .map_err(codec_error)?,
    }
    Ok(PreparedImage {
        bytes: output.0,
        media_type: mime(output_format),
        width: decoded.width(),
        height: decoded.height(),
        transformed: true,
    })
}

fn mime(format: ImageFormat) -> &'static str {
    match format {
        ImageFormat::Png => "image/png",
        ImageFormat::Jpeg => "image/jpeg",
        ImageFormat::WebP => "image/webp",
        _ => unreachable!(),
    }
}

// Bound encoded output while writing, not only after allocating the whole result.
struct BoundedOutput(Vec<u8>);

impl Write for BoundedOutput {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        if bytes.len() > MAX_INPUT_BYTES.saturating_sub(self.0.len()) {
            return Err(std::io::Error::other("image output exceeds byte policy"));
        }
        self.0.extend_from_slice(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

#[cfg(test)]
mod tests;
