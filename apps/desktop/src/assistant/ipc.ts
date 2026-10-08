import { isDesktopServerProfileId } from "../server/profile.js";
import {
  DESKTOP_ASSISTANT_IPC,
  isDesktopAssistantAttachmentUploadRequest,
  type DesktopAssistantEvent,
} from "./bridge.js";
import type { DesktopAssistantLocationOwner } from "./owner.js";

export interface DesktopAssistantIpcMain {
  handle(
    channel: string,
    listener: (event: DesktopAssistantIpcEvent, value?: unknown) => Promise<unknown>,
  ): void;
  removeHandler(channel: string): void;
}

export interface DesktopAssistantIpcEvent {
  readonly sender: unknown;
}

export interface DesktopAssistantIpcWindow {
  readonly webContents: {
    send(channel: string, value: DesktopAssistantEvent): void;
  };
  isDestroyed(): boolean;
}

export function installDesktopAssistantIpc(options: {
  readonly ipcMain: DesktopAssistantIpcMain;
  readonly owner: DesktopAssistantLocationOwner;
  readonly getWindow: () => DesktopAssistantIpcWindow | undefined;
}): () => void {
  options.ipcMain.handle(DESKTOP_ASSISTANT_IPC.readState, async (event) => {
    assertActiveRenderer(options.getWindow(), event.sender);
    return await options.owner.readState();
  });
  options.ipcMain.handle(DESKTOP_ASSISTANT_IPC.activateServer, async (event, value) => {
    assertActiveRenderer(options.getWindow(), event.sender);
    const request = requireRecord(value, ["expectedGeneration", "profileId"]);
    return await options.owner.activateServer({
      expectedGeneration: requireGeneration(request.expectedGeneration),
      profileId: requireProfileId(request.profileId),
    });
  });
  options.ipcMain.handle(DESKTOP_ASSISTANT_IPC.activateLocal, async (event, value) => {
    assertActiveRenderer(options.getWindow(), event.sender);
    const request = requireRecord(value, ["expectedGeneration"]);
    return await options.owner.activateLocal({
      expectedGeneration: requireGeneration(request.expectedGeneration),
    });
  });
  options.ipcMain.handle(DESKTOP_ASSISTANT_IPC.readSnapshot, async (event, value) => {
    assertActiveRenderer(options.getWindow(), event.sender);
    return await options.owner.readSnapshot(requireGeneration(value));
  });
  options.ipcMain.handle(DESKTOP_ASSISTANT_IPC.dispatchAction, async (event, value) => {
    assertActiveRenderer(options.getWindow(), event.sender);
    const request = requireActionRequest(value);
    return await options.owner.dispatchAction(request);
  });
  options.ipcMain.handle(DESKTOP_ASSISTANT_IPC.uploadAttachment, async (event, value) => {
    assertActiveRenderer(options.getWindow(), event.sender);
    if (!isDesktopAssistantAttachmentUploadRequest(value)) {
      throw new Error("Assistant attachment upload request is invalid");
    }
    return await options.owner.uploadAttachment(value);
  });
  options.ipcMain.handle(DESKTOP_ASSISTANT_IPC.prepareResourceDelivery, async (event, value) => {
    assertActiveRenderer(options.getWindow(), event.sender);
    const request = requireRecord(
      value,
      ["generation", "resourceId", "sha256", "purpose"],
      ["sessionId"],
    );
    if (request.purpose !== "preview" && request.purpose !== "media") {
      throw new Error("Assistant Resource delivery purpose is invalid");
    }
    return await options.owner.prepareResourceDelivery({
      generation: requireGeneration(request.generation),
      resourceId: requireIdentity(request.resourceId, "resource ID"),
      sha256: requireSha256(request.sha256),
      purpose: request.purpose,
      ...(request.sessionId === undefined
        ? {}
        : { sessionId: requireIdentity(request.sessionId, "session ID") }),
    });
  });
  options.ipcMain.handle(DESKTOP_ASSISTANT_IPC.releaseResourceDelivery, async (event, value) => {
    assertActiveRenderer(options.getWindow(), event.sender);
    const request = requireRecord(value, ["generation", "delivery"]);
    if (
      typeof request.delivery !== "object" ||
      request.delivery === null ||
      Array.isArray(request.delivery)
    ) {
      throw new Error("Assistant Resource delivery is invalid");
    }
    const delivery = request.delivery as Record<string, unknown>;
    if (
      Object.keys(delivery).length !== 2 ||
      delivery.kind !== "web.resource-delivery" ||
      typeof delivery.url !== "string"
    ) {
      throw new Error("Assistant Resource delivery is invalid");
    }
    await options.owner.releaseResourceDelivery({
      generation: requireGeneration(request.generation),
      delivery: { kind: "web.resource-delivery", url: delivery.url },
    });
  });

  const removeOwnerListener = options.owner.subscribe((event) => {
    const owner = options.getWindow();
    if (owner === undefined || owner.isDestroyed()) return;
    owner.webContents.send(DESKTOP_ASSISTANT_IPC.event, event);
  });

  return () => {
    removeOwnerListener();
    options.ipcMain.removeHandler(DESKTOP_ASSISTANT_IPC.readState);
    options.ipcMain.removeHandler(DESKTOP_ASSISTANT_IPC.activateServer);
    options.ipcMain.removeHandler(DESKTOP_ASSISTANT_IPC.activateLocal);
    options.ipcMain.removeHandler(DESKTOP_ASSISTANT_IPC.readSnapshot);
    options.ipcMain.removeHandler(DESKTOP_ASSISTANT_IPC.dispatchAction);
    options.ipcMain.removeHandler(DESKTOP_ASSISTANT_IPC.uploadAttachment);
    options.ipcMain.removeHandler(DESKTOP_ASSISTANT_IPC.prepareResourceDelivery);
    options.ipcMain.removeHandler(DESKTOP_ASSISTANT_IPC.releaseResourceDelivery);
  };
}

function requireActionRequest(value: unknown): {
  readonly generation: number;
  readonly action: unknown;
  readonly requestId?: string;
} {
  const request = requireRecord(value, ["generation", "action"], ["requestId"]);
  const requestId = request.requestId;
  if (requestId !== undefined && !isBoundedIdentity(requestId)) {
    throw new Error("Assistant request ID is invalid");
  }
  return {
    generation: requireGeneration(request.generation),
    action: request.action,
    ...(requestId === undefined ? {} : { requestId }),
  };
}

function requireRecord(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Assistant request is invalid");
  }
  const record = value as Readonly<Record<string, unknown>>;
  const allowed = new Set([...required, ...optional]);
  if (
    required.some((key) => !Object.hasOwn(record, key)) ||
    Object.keys(record).some((key) => !allowed.has(key))
  ) {
    throw new Error("Assistant request is invalid");
  }
  return record;
}

function requireGeneration(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error("Assistant location generation is invalid");
  }
  return value as number;
}

function requireProfileId(value: unknown): string {
  if (!isDesktopServerProfileId(value)) {
    throw new Error("Assistant server profile ID is invalid");
  }
  return value;
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) {
    throw new Error(`Assistant ${label} is invalid`);
  }
  return value;
}

function requireSha256(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error("Assistant Resource SHA-256 is invalid");
  }
  return value;
}

function isBoundedIdentity(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    Buffer.byteLength(value, "utf8") <= 256 &&
    !/[\u0000-\u001f\u007f]/u.test(value);
}

function assertActiveRenderer(
  owner: DesktopAssistantIpcWindow | undefined,
  sender: unknown,
): asserts owner is DesktopAssistantIpcWindow {
  if (
    owner === undefined ||
    owner.isDestroyed() ||
    sender !== owner.webContents
  ) {
    throw new Error(
      "Assistant request did not originate from the active Desktop window",
    );
  }
}
