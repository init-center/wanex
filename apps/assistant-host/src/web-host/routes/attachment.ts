import type { IncomingMessage, ServerResponse } from "node:http"
import type { Controller } from "@wanex/assistant-ui"
import {
  normalizeMaxAttachmentBytes,
  readAttachmentUploadHttpRequest
} from "../../resources/attachment-http.js"
import { sendJson } from "../response.js"
import type { WebNodeRequestHandlerOptions } from "../types.js"

export async function handleAttachmentUpload(request: {
  readonly controller: Controller
  readonly attachments: WebNodeRequestHandlerOptions["attachments"]
  readonly maxAttachmentBytes: number
  readonly request: IncomingMessage
  readonly response: ServerResponse
}): Promise<void> {
  const upload = await readAttachmentUploadHttpRequest({
    input: request.request,
    maxAttachmentBytes: request.maxAttachmentBytes
  })
  const uploaded = await request.attachments.uploadAttachment(upload)
  const snapshot = await request.controller.refresh()
  sendJson(request.response, 201, {
    ok: true,
    kind: "web.attachment-upload-response",
    upload: uploaded,
    snapshot
  })
}

export { normalizeMaxAttachmentBytes }
