import { describe, expect, it } from "vitest";
import type { ActionResult, Snapshot } from "@wanex/assistant-ui";
import {
  DESKTOP_ASSISTANT_IPC,
  type DesktopAssistantEvent,
} from "../src/assistant/bridge.js";
import { installDesktopAssistantIpc } from "../src/assistant/ipc.js";
import type { DesktopAssistantLocationOwner } from "../src/assistant/owner.js";

describe("Desktop Assistant IPC", () => {
  it("accepts exact semantic requests from the active window", async () => {
    const ipcMain = new TestIpcMain();
    const window = new TestWindow();
    const owner = testOwner();
    const remove = installDesktopAssistantIpc({
      ipcMain,
      owner,
      getWindow: () => window,
    });

    await expect(ipcMain.invoke(
      DESKTOP_ASSISTANT_IPC.activateServer,
      window.webContents,
      { expectedGeneration: 0, profileId: "office" },
    )).resolves.toMatchObject({ generation: 1, location: { profileId: "office" } });
    await expect(ipcMain.invoke(
      DESKTOP_ASSISTANT_IPC.dispatchAction,
      window.webContents,
      { generation: 1, action: { type: "refresh" }, requestId: "request-one" },
    )).resolves.toMatchObject({ ok: true, action: "refresh" });
    expect(owner.observedActions).toEqual([{
      generation: 1,
      action: { type: "refresh" },
      requestId: "request-one",
    }]);
    await expect(ipcMain.invoke(
      DESKTOP_ASSISTANT_IPC.uploadAttachment,
      window.webContents,
      {
        generation: 1,
        content: new Uint8Array([1, 2]),
        mediaType: "image/png",
        kind: "image",
      },
    )).resolves.toMatchObject({
      kind: "web.attachment-uploaded",
      attachment: { resourceId: "res_ipc_upload" },
    });
    expect(owner.observedUploads).toHaveLength(1);

    owner.publish({ generation: 1, event: { kind: "snapshot-invalidated" } });
    expect(window.sent).toEqual([{
      channel: DESKTOP_ASSISTANT_IPC.event,
      value: { generation: 1, event: { kind: "snapshot-invalidated" } },
    }]);
    remove();
    expect(ipcMain.handlers.size).toBe(0);
  });

  it("rejects forged senders, extra keys, invalid generations, and invalid IDs", async () => {
    const ipcMain = new TestIpcMain();
    const window = new TestWindow();
    installDesktopAssistantIpc({
      ipcMain,
      owner: testOwner(),
      getWindow: () => window,
    });

    await expect(ipcMain.invoke(
      DESKTOP_ASSISTANT_IPC.activateServer,
      {},
      { expectedGeneration: 0, profileId: "office" },
    )).rejects.toThrow("active Desktop window");
    await expect(ipcMain.invoke(
      DESKTOP_ASSISTANT_IPC.activateServer,
      window.webContents,
      { expectedGeneration: 0, profileId: "office", endpoint: "secret" },
    )).rejects.toThrow("request is invalid");
    await expect(ipcMain.invoke(
      DESKTOP_ASSISTANT_IPC.readSnapshot,
      window.webContents,
      -1,
    )).rejects.toThrow("generation is invalid");
    await expect(ipcMain.invoke(
      DESKTOP_ASSISTANT_IPC.activateServer,
      window.webContents,
      { expectedGeneration: 0, profileId: "../office" },
    )).rejects.toThrow("profile ID is invalid");
    await expect(ipcMain.invoke(
      DESKTOP_ASSISTANT_IPC.uploadAttachment,
      window.webContents,
      {
        generation: 1,
        content: new Uint8Array(25 * 1024 * 1024 + 1),
        mediaType: "image/png",
      },
    )).rejects.toThrow("upload request is invalid");
    await expect(ipcMain.invoke(
      DESKTOP_ASSISTANT_IPC.uploadAttachment,
      window.webContents,
      {
        generation: 1,
        content: new Uint8Array([1]),
        mediaType: "image/png",
        serverUrl: "https://attacker.example.test",
      },
    )).rejects.toThrow("upload request is invalid");
  });
});

function testOwner(): DesktopAssistantLocationOwner & {
  readonly observedActions: unknown[];
  readonly observedUploads: unknown[];
  publish(event: DesktopAssistantEvent): void;
} {
  const listeners = new Set<(event: DesktopAssistantEvent) => void>();
  const observedActions: unknown[] = [];
  const observedUploads: unknown[] = [];
  const current = snapshot();
  return {
    generation: 0,
    observedActions,
    observedUploads,
    publish(event) { for (const listener of listeners) listener(event); },
    async readState() { return { generation: 0, location: { kind: "local" } }; },
    async activateServer(request) {
      return {
        generation: request.expectedGeneration + 1,
        location: { kind: "server", profileId: request.profileId, name: "Office" },
        snapshot: current,
      };
    },
    async activateLocal(request) {
      return { generation: request.expectedGeneration + 1, location: { kind: "local" } };
    },
    async readSnapshot() { return current; },
    async dispatchAction(request) {
      observedActions.push(request);
      return actionResult(current);
    },
    async uploadAttachment(request) {
      observedUploads.push(request);
      const attachment = {
        kind: "assistant.attachment" as const,
        resourceId: "res_ipc_upload",
        resourceKind: "image" as const,
        previewKind: "image" as const,
        state: "available" as const,
        sizeBytes: request.content.byteLength,
        sha256: "a".repeat(64),
        mediaType: request.mediaType,
        addedAt: 1,
      };
      return {
        kind: "web.attachment-uploaded" as const,
        attachment,
        attachments: {
          kind: "assistant.conversation-attachments" as const,
          draftKey: "__new__",
          attachments: [attachment],
        },
        snapshot: current,
      };
    },
    async prepareResourceDelivery(request) {
      return {
        kind: "web.resource-delivery" as const,
        url: `wanex-resource://delivery/wrc_${"a".repeat(43)}`,
        resourceId: request.resourceId,
        sha256: request.sha256,
        resourceKind: "image" as const,
        mediaType: "image/png",
        sizeBytes: 1,
        purpose: request.purpose,
        ...(request.sessionId === undefined ? {} : { sessionId: request.sessionId }),
        expiresAt: Date.now() + 60_000,
      };
    },
    async releaseResourceDelivery() {},
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async close() {},
  };
}

function snapshot(): Snapshot {
  return {
    kind: "web.snapshot",
    generatedAt: 1,
    eventCursor: 0,
    view: {},
  } as unknown as Snapshot;
}

function actionResult(current: Snapshot): ActionResult {
  return { ok: true, action: "refresh", snapshot: current };
}

class TestIpcMain {
  readonly handlers = new Map<string, (event: { sender: unknown }, value?: unknown) => Promise<unknown>>();
  handle(channel: string, listener: (event: { sender: unknown }, value?: unknown) => Promise<unknown>): void {
    this.handlers.set(channel, listener);
  }
  removeHandler(channel: string): void { this.handlers.delete(channel); }
  async invoke(channel: string, sender: unknown, value?: unknown): Promise<unknown> {
    const handler = this.handlers.get(channel);
    if (handler === undefined) throw new Error("handler missing");
    return await handler({ sender }, value);
  }
}

class TestWindow {
  readonly sent: { channel: string; value: DesktopAssistantEvent }[] = [];
  readonly webContents = {
    send: (channel: string, value: DesktopAssistantEvent) => {
      this.sent.push({ channel, value });
    },
  };
  isDestroyed(): boolean { return false; }
}
