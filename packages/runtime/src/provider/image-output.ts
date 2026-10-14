import type { ProviderImageOutputEvent } from "./types.js"

export const IMAGE_OUTPUT_LIMITS = Object.freeze({
  count: 16,
  imageBytes: 25 * 1024 * 1024,
  totalBytes: 50 * 1024 * 1024,
  eventBytes: 36 * 1024 * 1024,
  responseBytes: 96 * 1024 * 1024
})

export function decodeImageOutput(base64: string): Uint8Array {
  if (
    base64.length === 0 ||
    base64.length > 4 * Math.ceil(IMAGE_OUTPUT_LIMITS.imageBytes / 3) ||
    base64.length % 4 !== 0
  ) {
    throw new Error("invalid inline image encoding or size")
  }
  // Buffer's permissive decoder must not accept truncated or non-canonical wire data.
  const bytes = Buffer.from(base64, "base64")
  if (bytes.length > IMAGE_OUTPUT_LIMITS.imageBytes || bytes.toString("base64") !== base64) {
    throw new Error("invalid inline image encoding or size")
  }
  return bytes
}

export function validateImageOutput(image: ProviderImageOutputEvent): void {
  if (image.partId.length === 0 || image.partId.length > 128) {
    throw new Error("image output part identity must contain 1 to 128 characters")
  }
  if (!(image.bytes instanceof Uint8Array) || image.bytes.byteLength === 0 ||
      image.bytes.byteLength > IMAGE_OUTPUT_LIMITS.imageBytes) {
    throw new Error("image output exceeds the allowed byte size")
  }
  const b = image.bytes
  const matches = image.mimeType === "image/png"
    ? [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => b[index] === value)
    : image.mimeType === "image/jpeg"
      ? b[0] === 255 && b[1] === 216 && b[2] === 255
      : image.mimeType === "image/webp" && b.length >= 12 &&
        [82, 73, 70, 70].every((value, index) => b[index] === value) &&
        [87, 69, 66, 80].every((value, index) => b[index + 8] === value)
  if (!matches) throw new Error("image output MIME does not match an allowed image signature")
}
