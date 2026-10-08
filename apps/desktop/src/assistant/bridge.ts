import type {
  Action,
  ActionResult,
  Snapshot,
} from "@wanex/assistant-ui";
import type {
  AttachmentUploadRequest,
  AttachmentUploadResult,
  ClientEvent,
  PreparedResourceDelivery,
} from "@wanex/assistant-ui/client";
import { MAX_CONVERSATION_ATTACHMENT_BYTES } from "@wanex/assistant-ui/client/contracts";

export const DESKTOP_ASSISTANT_IPC = Object.freeze({
  readState: "wanex.desktop.assistant.read-state",
  activateServer: "wanex.desktop.assistant.activate-server",
  activateLocal: "wanex.desktop.assistant.activate-local",
  readSnapshot: "wanex.desktop.assistant.read-snapshot",
  dispatchAction: "wanex.desktop.assistant.dispatch-action",
  uploadAttachment: "wanex.desktop.assistant.upload-attachment",
  prepareResourceDelivery: "wanex.desktop.assistant.prepare-resource-delivery",
  releaseResourceDelivery: "wanex.desktop.assistant.release-resource-delivery",
  event: "wanex.desktop.assistant.event",
});

export interface DesktopAssistantServerLocation {
  readonly kind: "server";
  readonly profileId: string;
  readonly name: string;
}

export interface DesktopAssistantLocalLocation {
  readonly kind: "local";
}

export type DesktopAssistantLocation =
  | DesktopAssistantLocalLocation
  | DesktopAssistantServerLocation;

export interface DesktopAssistantActivation {
  readonly generation: number;
  readonly location: DesktopAssistantServerLocation;
  readonly snapshot: Snapshot;
}

export interface DesktopAssistantLocalActivation {
  readonly generation: number;
  readonly location: DesktopAssistantLocalLocation;
}

export interface DesktopAssistantEvent {
  readonly generation: number;
  readonly event: ClientEvent;
}

export interface DesktopAssistantRendererBridge {
  readState(): Promise<DesktopAssistantActivation | DesktopAssistantLocalActivation>;
  activateServer(request: {
    readonly expectedGeneration: number;
    readonly profileId: string;
  }): Promise<DesktopAssistantActivation>;
  activateLocal(request: {
    readonly expectedGeneration: number;
  }): Promise<DesktopAssistantLocalActivation>;
  readSnapshot(generation: number): Promise<Snapshot>;
  dispatchAction(request: {
    readonly generation: number;
    readonly action: Action;
    readonly requestId?: string;
  }): Promise<ActionResult>;
  uploadAttachment(request: AttachmentUploadRequest & {
    readonly generation: number;
  }): Promise<AttachmentUploadResult>;
  prepareResourceDelivery(request: {
    readonly generation: number;
    readonly resourceId: string;
    readonly sha256: string;
    readonly purpose: "preview" | "media";
    readonly sessionId?: string;
  }): Promise<PreparedResourceDelivery>;
  releaseResourceDelivery(request: {
    readonly generation: number;
    readonly delivery: Pick<PreparedResourceDelivery, "kind" | "url">;
  }): Promise<void>;
  subscribe(listener: (event: DesktopAssistantEvent) => void): () => void;
}

export interface DesktopAssistantEventRelay {
  publish(event: DesktopAssistantEvent): void;
  subscribe(listener: (event: DesktopAssistantEvent) => void): () => void;
}

export function createDesktopAssistantEventRelay(
  capacity = 256,
): DesktopAssistantEventRelay {
  if (!Number.isSafeInteger(capacity) || capacity < 2) {
    throw new Error("Assistant event relay capacity is invalid");
  }
  const listeners = new Set<(event: DesktopAssistantEvent) => void>();
  let pending: DesktopAssistantEvent[] = [];
  return {
    publish(event) {
      if (listeners.size === 0) {
        if (
          pending.length > 0 &&
          pending[pending.length - 1]?.generation !== event.generation
        ) {
          pending = [];
        }
        if (pending.length >= capacity) {
          pending = [
            {
              generation: event.generation,
              event: { kind: "snapshot-invalidated" },
            },
          ];
          return;
        }
        pending.push(event);
        return;
      }
      deliver(event);
    },
    subscribe(listener) {
      listeners.add(listener);
      const replay = pending;
      pending = [];
      for (const event of replay) {
        try {
          listener(event);
        } catch {
          // One Renderer listener cannot affect later event delivery.
        }
      }
      return () => listeners.delete(listener);
    },
  };

  function deliver(event: DesktopAssistantEvent): void {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // One Renderer listener cannot affect later event delivery.
      }
    }
  }
}

export function isDesktopAssistantActivation(
  value: unknown,
): value is DesktopAssistantActivation {
  if (!isRecord(value) || !validGeneration(value.generation)) return false;
  return isServerLocation(value.location) && isSnapshot(value.snapshot);
}

export function isDesktopAssistantLocalActivation(
  value: unknown,
): value is DesktopAssistantLocalActivation {
  return isRecord(value) &&
    validGeneration(value.generation) &&
    isRecord(value.location) &&
    value.location.kind === "local";
}

export function isDesktopAssistantState(
  value: unknown,
): value is DesktopAssistantActivation | DesktopAssistantLocalActivation {
  return isDesktopAssistantActivation(value) ||
    isDesktopAssistantLocalActivation(value);
}

export function isDesktopAssistantEvent(
  value: unknown,
): value is DesktopAssistantEvent {
  return isRecord(value) &&
    validGeneration(value.generation) &&
    isClientEvent(value.event);
}

export function isDesktopAssistantActionResult(
  value: unknown,
): value is ActionResult {
  return isRecord(value) &&
    typeof value.ok === "boolean" &&
    typeof value.action === "string" &&
    isSnapshot(value.snapshot);
}

export function isDesktopAssistantAttachmentUploadResult(
  value: unknown,
): value is AttachmentUploadResult {
  if (
    !isRecord(value) ||
    value.kind !== "web.attachment-uploaded" ||
    !isAttachment(value.attachment) ||
    !isRecord(value.attachments) ||
    value.attachments.kind !== "assistant.conversation-attachments" ||
    !Array.isArray(value.attachments.attachments) ||
    !value.attachments.attachments.every(isAttachment) ||
    !isSnapshot(value.snapshot)
  ) return false;
  const attachment = value.attachment;
  return value.attachments.attachments.some(
    (candidate) => candidate.resourceId === attachment.resourceId,
  );
}

export function isDesktopAssistantAttachmentUploadRequest(
  value: unknown,
): value is AttachmentUploadRequest & { readonly generation: number } {
  if (!isRecord(value)) return false;
  const allowed = [
    "generation",
    "content",
    "mediaType",
    "label",
    "sessionId",
    "kind",
  ];
  if (
    Object.keys(value).some((key) => !allowed.includes(key)) ||
    !validGeneration(value.generation) ||
    !(value.content instanceof Uint8Array) ||
    value.content.byteLength === 0 ||
    value.content.byteLength > MAX_CONVERSATION_ATTACHMENT_BYTES ||
    typeof value.mediaType !== "string" ||
    !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u.test(value.mediaType) ||
    !optionalBoundedText(value.label, 255) ||
    !optionalBoundedText(value.sessionId, 512) ||
    (value.kind !== undefined &&
      value.kind !== "file" &&
      value.kind !== "image" &&
      value.kind !== "video" &&
      value.kind !== "audio" &&
      value.kind !== "document")
  ) return false;
  return true;
}

export function isDesktopAssistantSnapshot(value: unknown): value is Snapshot {
  return isSnapshot(value);
}

export function isDesktopPreparedResourceDelivery(
  value: unknown,
): value is PreparedResourceDelivery {
  if (!isRecord(value)) return false;
  const sizeBytes = value.sizeBytes;
  const expiresAt = value.expiresAt;
  const keys = Object.keys(value).sort();
  const required = [
    "expiresAt",
    "kind",
    "mediaType",
    "purpose",
    "resourceId",
    "resourceKind",
    "sha256",
    "sizeBytes",
    "url",
  ];
  if (value.sessionId !== undefined) required.push("sessionId");
  if (keys.length !== required.length ||
      keys.some((key, index) => key !== required.sort()[index])) return false;
  if (
    value.kind !== "web.resource-delivery" ||
    typeof value.url !== "string" ||
    !isLocalResourceCapabilityUrl(value.url) ||
    typeof value.resourceId !== "string" ||
    value.resourceId.length === 0 ||
    typeof value.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(value.sha256) ||
    (value.resourceKind !== "image" &&
      value.resourceKind !== "audio" &&
      value.resourceKind !== "video") ||
    typeof value.mediaType !== "string" ||
    value.mediaType.length === 0 ||
    (value.purpose !== "preview" && value.purpose !== "media") ||
    typeof sizeBytes !== "number" ||
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes <= 0 ||
    typeof expiresAt !== "number" ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= 0 ||
    (value.sessionId !== undefined &&
      (typeof value.sessionId !== "string" || value.sessionId.length === 0))
  ) return false;
  return true;
}

function isServerLocation(value: unknown): value is DesktopAssistantServerLocation {
  return isRecord(value) &&
    value.kind === "server" &&
    typeof value.profileId === "string" &&
    value.profileId.length > 0 &&
    typeof value.name === "string" &&
    value.name.length > 0;
}

function isSnapshot(value: unknown): value is Snapshot {
  return isRecord(value) &&
    value.kind === "web.snapshot" &&
    typeof value.generatedAt === "number" &&
    Number.isSafeInteger(value.eventCursor) &&
    isRecord(value.view);
}

function isClientEvent(value: unknown): value is ClientEvent {
  if (!isRecord(value)) return false;
  if (value.kind === "stream-unavailable") {
    return Object.keys(value).length === 1;
  }
  if (value.kind === "snapshot-invalidated") {
    return optionalString(value.operationId) && optionalString(value.sessionId);
  }
  return value.kind === "assistant-text-delta" &&
    typeof value.operationId === "string" &&
    value.operationId.length > 0 &&
    typeof value.sessionId === "string" &&
    value.sessionId.length > 0 &&
    typeof value.text === "string" &&
    (value.sequence === undefined ||
      (typeof value.sequence === "number" &&
        Number.isSafeInteger(value.sequence) &&
        value.sequence >= 0));
}

function optionalString(value: unknown): boolean {
  return value === undefined || (typeof value === "string" && value.length > 0);
}

function optionalBoundedText(value: unknown, max: number): boolean {
  return value === undefined ||
    (typeof value === "string" &&
      value.length > 0 &&
      Buffer.byteLength(value, "utf8") <= max &&
      !/[\u0000-\u001f\u007f]/u.test(value));
}

function isAttachment(value: unknown): value is AttachmentUploadResult["attachment"] {
  return isRecord(value) &&
    value.kind === "assistant.attachment" &&
    typeof value.resourceId === "string" &&
    value.resourceId.length > 0 &&
    typeof value.sha256 === "string" &&
    /^[a-f0-9]{64}$/u.test(value.sha256) &&
    typeof value.sizeBytes === "number" &&
    Number.isSafeInteger(value.sizeBytes) &&
    value.sizeBytes > 0 &&
    value.state === "available";
}

function validGeneration(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLocalResourceCapabilityUrl(value: string): boolean {
  if (value.length === 0 || value.length > 2_048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "wanex-resource:" &&
      url.hostname === "delivery" &&
      url.port.length === 0 &&
      url.username.length === 0 &&
      url.password.length === 0 &&
      url.search.length === 0 &&
      url.hash.length === 0 &&
      /^\/wrc_[A-Za-z0-9_-]{43}$/u.test(url.pathname);
  } catch {
    return false;
  }
}
