import { readFile, stat } from "node:fs/promises"
import { basename, extname } from "node:path"
import type { Shell } from "@wanex/product"
import type { ResourceKind } from "@wanex/protocol"
import type { TuiAttachmentHost } from "../model.js"

const MAX_TUI_ATTACHMENT_BYTES = 25 * 1024 * 1024

export function createTuiAttachmentHost(
  shell: Shell
): TuiAttachmentHost {
  return {
    async attachPath(request) {
      const path = request.path.trim()
      if (path.length === 0) {
        throw new Error("attachment path must not be empty")
      }
      const fileStat = await stat(path)
      if (!fileStat.isFile()) {
        throw new Error("attachment path must point to a regular file")
      }
      if (fileStat.size <= 0 || fileStat.size > MAX_TUI_ATTACHMENT_BYTES) {
        throw new Error(
          `attachment file must contain 1 to ${MAX_TUI_ATTACHMENT_BYTES} bytes`
        )
      }
      const label = basename(path)
      const media = mediaTypeForPath(path)
      const resource = await shell.trustedResources.ingestResource({
        content: new Uint8Array(await readFile(path)),
        mediaType: media.mediaType,
        kind: media.kind,
        origin: "user_upload",
        label
      })
      await shell.prepareConversationAttachment({
        resourceId: resource.id,
        ...(request.sessionId === undefined
          ? {}
          : { sessionId: request.sessionId })
      })
      return {
        resourceId: resource.id,
        label
      }
    }
  }
}

function mediaTypeForPath(path: string): {
  readonly mediaType: string
  readonly kind: ResourceKind
} {
  const extension = extname(path).toLowerCase()
  const known: Readonly<Record<string, { readonly mediaType: string; readonly kind: ResourceKind }>> = {
    ".png": { mediaType: "image/png", kind: "image" },
    ".jpg": { mediaType: "image/jpeg", kind: "image" },
    ".jpeg": { mediaType: "image/jpeg", kind: "image" },
    ".gif": { mediaType: "image/gif", kind: "image" },
    ".webp": { mediaType: "image/webp", kind: "image" },
    ".mp3": { mediaType: "audio/mpeg", kind: "audio" },
    ".wav": { mediaType: "audio/wav", kind: "audio" },
    ".mp4": { mediaType: "video/mp4", kind: "video" },
    ".webm": { mediaType: "video/webm", kind: "video" },
    ".pdf": { mediaType: "application/pdf", kind: "document" },
    ".txt": { mediaType: "text/plain", kind: "document" },
    ".md": { mediaType: "text/markdown", kind: "document" },
    ".json": { mediaType: "application/json", kind: "document" },
    ".csv": { mediaType: "text/csv", kind: "document" }
  }
  return known[extension] ?? { mediaType: "application/octet-stream", kind: "file" }
}
