import { createHash } from "node:crypto"
import type { ResourceKind } from "@wanex/protocol"

export function stableResourceLogicalPath(
  kind: ResourceKind,
  bytes: Uint8Array,
  mediaType?: string
): string {
  const hash = sha256Bytes(bytes)
  const extension = extensionForMediaType(mediaType)
  return `resources/${kind}/${hash}${extension}`
}

export function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function extensionForMediaType(mediaType: string | undefined): string {
  switch (mediaType) {
    case "image/png":
      return ".png"
    case "image/jpeg":
      return ".jpg"
    case "image/webp":
      return ".webp"
    case "video/mp4":
      return ".mp4"
    case "audio/wav":
      return ".wav"
    case "audio/mpeg":
      return ".mp3"
    case "application/pdf":
      return ".pdf"
    default:
      return ""
  }
}
