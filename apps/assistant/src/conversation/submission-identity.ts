import { createHash } from "node:crypto"
import type {
  SubmitConversationOperationRequest,
  TrustedConversationSubmissionIdentity
} from "./model.js"

export function conversationSubmissionIdentity(
  request: Pick<
    SubmitConversationOperationRequest,
    "text" | "sessionId" | "principalId" | "idempotencyKey"
  >
): TrustedConversationSubmissionIdentity | undefined {
  if (request.idempotencyKey === undefined) return undefined
  return {
    idempotencyKeyDigest: sha256(request.idempotencyKey),
    requestFingerprint: sha256(
      JSON.stringify([
        "assistant.conversation.submit",
        request.text,
        request.sessionId ?? null,
        request.principalId ?? null
      ])
    )
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}
