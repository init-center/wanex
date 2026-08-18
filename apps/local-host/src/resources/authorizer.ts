import type { Shell } from "@wanex/product"
import type {
  LocalResourceDeliveryAuthorizationRequest,
  LocalResourceDeliveryAuthorizer
} from "./model.js"

export function createLocalResourceDeliveryAuthorizer(
  shell: Pick<
    Shell,
    "readSessionTranscript" | "readConversationAttachments"
  >
): LocalResourceDeliveryAuthorizer {
  return {
    async authorize(request) {
      if (hasMatchingDraftAttachment(shell, request)) return true
      if (request.sessionId === undefined) return false
      const result = await shell.readSessionTranscript({
        sessionId: request.sessionId
      })
      if (result.kind !== "product.session-transcript.found") return false
      return result.transcript.rows.some((row) =>
        row.parts.some((part) =>
          part.type === "resource" &&
          part.resourceId === request.resourceId &&
          part.sha256 === request.expectedSha256
        )
      )
    }
  }
}

function hasMatchingDraftAttachment(
  shell: Pick<Shell, "readConversationAttachments">,
  request: LocalResourceDeliveryAuthorizationRequest
): boolean {
  const attachments = shell.readConversationAttachments(
    request.sessionId === undefined ? {} : { sessionId: request.sessionId }
  )
  if (attachments.sessionId !== request.sessionId) return false
  return attachments.attachments.some((attachment) =>
    attachment.resourceId === request.resourceId &&
    attachment.sha256 === request.expectedSha256
  )
}
