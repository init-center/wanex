import { REMOTE_ASSISTANT_ATTACHMENT_UPLOAD_PATH } from "@wanex/assistant-host";
import type {
  AttachmentUploadRequest,
  AttachmentUploadResult,
} from "@wanex/assistant-ui/client";
import { MAX_CONVERSATION_ATTACHMENT_BYTES } from "@wanex/assistant-ui/client/contracts";
import type { DesktopServerProfileCatalog } from "./profile-catalog.js";
import type { DesktopServerResourceBinding } from "./resource-transport.js";

const MAX_RESPONSE_BYTES = 64 * 1024;
type AttachmentDraft = AttachmentUploadResult["attachment"];

export interface DesktopServerAttachmentTransport {
  upload(request: {
    readonly binding: DesktopServerResourceBinding;
    readonly attachment: AttachmentUploadRequest;
    readonly signal: AbortSignal;
  }): Promise<AttachmentDraft>;
}

export interface DesktopServerAttachmentTransportOptions {
  readonly profiles: DesktopServerProfileCatalog;
  readonly fetch?: typeof globalThis.fetch;
}

export function createDesktopServerAttachmentTransport(
  options: DesktopServerAttachmentTransportOptions,
): DesktopServerAttachmentTransport {
  const fetch = options.fetch ?? globalThis.fetch;
  return Object.freeze({ upload });

  async function upload(request: {
    readonly binding: DesktopServerResourceBinding;
    readonly attachment: AttachmentUploadRequest;
    readonly signal: AbortSignal;
  }): Promise<AttachmentDraft> {
    validateAttachmentRequest(request.attachment);
    const profile = await options.profiles.read(request.binding.profileId);
    if (profile === null || profile.serverUrl !== request.binding.serverUrl) {
      throw new Error("Server attachment binding is no longer current");
    }
    const secret = await options.profiles.resolveCredential(
      request.binding.profileId,
    );
    if (secret === null) {
      throw new Error("Server attachment credential is unavailable");
    }
    try {
      const response = await fetch(
        new URL(REMOTE_ASSISTANT_ATTACHMENT_UPLOAD_PATH, profile.serverUrl),
        {
          method: "POST",
          headers: {
            accept: "application/json",
            authorization: `Bearer ${secret.reveal()}`,
            "content-length": String(request.attachment.content.byteLength),
            "content-type": "application/octet-stream",
            "x-wanex-media-type": encodeURIComponent(
              request.attachment.mediaType,
            ),
            ...(request.attachment.kind === undefined
              ? {}
              : {
                  "x-wanex-resource-kind": encodeURIComponent(
                    request.attachment.kind,
                  ),
                }),
            ...(request.attachment.label === undefined
              ? {}
              : {
                  "x-wanex-attachment-label": encodeURIComponent(
                    request.attachment.label,
                  ),
                }),
            ...(request.attachment.sessionId === undefined
              ? {}
              : {
                  "x-wanex-session-id": encodeURIComponent(
                    request.attachment.sessionId,
                  ),
                }),
          },
          body: request.attachment.content as BodyInit,
          signal: request.signal,
          redirect: "error",
          cache: "no-store",
          credentials: "omit",
          referrerPolicy: "no-referrer",
        },
      );
      const payload = await readBoundedJson(response);
      if (!response.ok) throw serverFailure(payload, response.status);
      const attachment = parseSuccess(payload);
      if (attachment === undefined) {
        throw new Error("Server attachment response is invalid");
      }
      if (
        attachment.sizeBytes !== request.attachment.content.byteLength ||
        attachment.mediaType !== request.attachment.mediaType ||
        (request.attachment.kind !== undefined &&
          attachment.resourceKind !== request.attachment.kind)
      ) {
        throw new Error("Server attachment response evidence does not match request");
      }
      return attachment;
    } finally {
      secret.dispose();
    }
  }
}

function validateAttachmentRequest(request: AttachmentUploadRequest): void {
  if (
    !(request.content instanceof Uint8Array) ||
    request.content.byteLength === 0 ||
    request.content.byteLength > MAX_CONVERSATION_ATTACHMENT_BYTES ||
    !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u.test(request.mediaType) ||
    !optionalBoundedText(request.label, 255) ||
    !optionalBoundedText(request.sessionId, 512) ||
    (request.kind !== undefined && !resourceKind(request.kind))
  ) {
    throw new Error("Server attachment request is invalid");
  }
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const mediaType = response.headers.get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== "application/json") {
    await response.body?.cancel().catch(() => {});
    throw new Error("Server attachment response media type is invalid");
  }
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    const size = Number(declared);
    if (!Number.isSafeInteger(size) || size < 0 || size > MAX_RESPONSE_BYTES) {
      await response.body?.cancel().catch(() => {});
      throw new Error("Server attachment response is too large");
    }
  }
  if (response.body === null) {
    throw new Error("Server attachment response is empty");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("Server attachment response is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (total === 0) throw new Error("Server attachment response is empty");
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("Server attachment response is invalid JSON");
  }
}

function parseSuccess(value: unknown): AttachmentDraft | undefined {
  if (!isRecord(value) || !exactKeys(value, ["kind", "attachment"])) {
    return undefined;
  }
  if (value.kind !== "wanex.server.attachment-uploaded") return undefined;
  return parseAttachment(value.attachment);
}

function parseAttachment(value: unknown): AttachmentDraft | undefined {
  if (!isRecord(value)) return undefined;
  const allowed = [
    "kind",
    "resourceId",
    "resourceKind",
    "previewKind",
    "state",
    "sizeBytes",
    "sha256",
    "label",
    "mediaType",
    "width",
    "height",
    "durationMs",
    "addedAt",
  ];
  if (!exactKeys(value, allowed, ["label", "mediaType", "width", "height", "durationMs"])) {
    return undefined;
  }
  if (
    value.kind !== "assistant.attachment" ||
    !boundedText(value.resourceId, 512) ||
    !resourceKind(value.resourceKind) ||
    !previewKind(value.previewKind) ||
    value.state !== "available" ||
    !positiveInteger(value.sizeBytes, MAX_CONVERSATION_ATTACHMENT_BYTES) ||
    typeof value.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(value.sha256) ||
    !positiveInteger(value.addedAt, Number.MAX_SAFE_INTEGER) ||
    !optionalBoundedText(value.label, 255) ||
    !optionalBoundedText(value.mediaType, 255) ||
    !optionalNonNegativeInteger(value.width) ||
    !optionalNonNegativeInteger(value.height) ||
    !optionalNonNegativeInteger(value.durationMs)
  ) {
    return undefined;
  }
  return value as unknown as AttachmentDraft;
}

function serverFailure(payload: unknown, status: number): Error {
  if (
    isRecord(payload) &&
    isRecord(payload.error) &&
    boundedText(payload.error.message, 512)
  ) {
    return new Error(payload.error.message);
  }
  return new Error(`Server attachment upload failed (${status})`);
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const optionalSet = new Set(optional);
  return allowed.every((key) => optionalSet.has(key) || Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.includes(key));
}

function resourceKind(value: unknown): boolean {
  return value === "file" || value === "image" || value === "video" ||
    value === "audio" || value === "document";
}

function previewKind(value: unknown): boolean {
  return value === "file" || value === "image" || value === "video" ||
    value === "audio" || value === "document";
}

function boundedText(value: unknown, max: number): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    Buffer.byteLength(value, "utf8") <= max &&
    !/[\u0000-\u001f\u007f]/u.test(value);
}

function optionalBoundedText(value: unknown, max: number): boolean {
  return value === undefined || boundedText(value, max);
}

function positiveInteger(value: unknown, max: number): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0 &&
    (value as number) <= max;
}

function optionalNonNegativeInteger(value: unknown): boolean {
  return value === undefined ||
    (Number.isSafeInteger(value) && (value as number) >= 0);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
