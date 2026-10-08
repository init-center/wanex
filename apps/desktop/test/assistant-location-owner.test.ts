import { describe, expect, it } from "vitest";
import type { AssistantAgentHostClient } from "@wanex/assistant-host";
import type {
  ActionResult,
  Controller,
  Snapshot,
} from "@wanex/assistant-ui";
import type { DesktopServerProfile } from "../src/server/profile.js";
import type {
  DesktopServerAssistantConnection,
  DesktopServerConnectionEvent,
  DesktopServerConnectionManager,
} from "../src/server/connection-manager.js";
import { createDesktopAssistantLocationOwner } from "../src/assistant/owner.js";
import type { DesktopAssistantResourceRelay } from "../src/assistant/resource-relay.js";
import type { DesktopServerAttachmentTransport } from "../src/server/attachment-transport.js";
import type { AttachmentUploadResult } from "@wanex/assistant-ui/client";

type AttachmentDraft = AttachmentUploadResult["attachment"];

describe("Desktop Assistant location owner", () => {
  it("activates a canonical controller and projects only semantic UI events", async () => {
    const remote = fakeRemote("office");
    const controller = fakeController(snapshot("office", 4));
    const owner = createDesktopAssistantLocationOwner({
      connections: remote.manager,
      attachmentTransport: fakeAttachmentTransport(),
      resourceRelay: fakeResourceRelay(),
      createController: async () => controller,
    });
    const observed: unknown[] = [];
    owner.subscribe((event) => observed.push(event));

    const activation = await owner.activateServer({
      expectedGeneration: 0,
      profileId: "office",
    });
    expect(activation).toMatchObject({
      generation: 1,
      location: { kind: "server", profileId: "office", name: "Office" },
      snapshot: { generatedAt: 4 },
    });

    remote.emitSurface({
      id: "event_delta",
      sequence: 5,
      type: "assistant.surface.conversation.assistant-text-delta",
      command: "submitConversationOperation",
      at: 5,
      conversation: {
        kind: "assistant.conversation.assistant-text-delta",
        sequence: 5,
        at: 5,
        operationId: "operation_office",
        sessionId: "session_office",
        partId: "part_office",
        text: "hello",
        truncated: false,
      },
    });
    expect(observed).toEqual([{
      generation: 1,
      event: {
        kind: "assistant-text-delta",
        operationId: "operation_office",
        sessionId: "session_office",
        text: "hello",
        sequence: 5,
      },
    }]);

    remote.emitConnection({ kind: "canonical-read-required", reason: "gap" });
    await Promise.resolve();
    await Promise.resolve();
    expect(controller.refreshCalls).toBe(1);
    expect(observed).toContainEqual({
      generation: 1,
      event: { kind: "snapshot-invalidated" },
    });
    await owner.close();
  });

  it("keeps the current location when a candidate fails", async () => {
    const remote = fakeRemote("office", "broken");
    const owner = createDesktopAssistantLocationOwner({
      connections: remote.manager,
      attachmentTransport: fakeAttachmentTransport(),
      resourceRelay: fakeResourceRelay(),
      createController: async ({ client }) => {
        if (client === remote.clients.get("broken")) {
          throw new Error("canonical read failed");
        }
        return fakeController(snapshot("office", 1));
      },
    });
    await owner.activateServer({ expectedGeneration: 0, profileId: "office" });

    await expect(owner.activateServer({
      expectedGeneration: 1,
      profileId: "broken",
    })).rejects.toThrow("canonical read failed");
    expect(owner.generation).toBe(1);
    await expect(owner.readSnapshot(1)).resolves.toMatchObject({ generatedAt: 1 });
    await owner.close();
  });

  it("admits only the latest concurrent activation", async () => {
    const remote = fakeRemote("first", "second");
    const first = deferred<Controller>();
    const second = deferred<Controller>();
    const owner = createDesktopAssistantLocationOwner({
      connections: remote.manager,
      attachmentTransport: fakeAttachmentTransport(),
      resourceRelay: fakeResourceRelay(),
      createController: async ({ client }) =>
        await (client === remote.clients.get("first") ? first.promise : second.promise),
    });

    const firstActivation = owner.activateServer({
      expectedGeneration: 0,
      profileId: "first",
    });
    const secondActivation = owner.activateServer({
      expectedGeneration: 0,
      profileId: "second",
    });
    second.resolve(fakeController(snapshot("second", 2)));
    await expect(secondActivation).resolves.toMatchObject({
      generation: 1,
      location: { profileId: "second" },
    });
    first.resolve(fakeController(snapshot("first", 1)));
    await expect(firstActivation).rejects.toThrow("activation is stale");
    expect(owner.generation).toBe(1);
    await owner.close();
  });

  it("rejects a late action result after switching while leaving durable work admitted", async () => {
    const remote = fakeRemote("office");
    const action = deferred<ActionResult>();
    const controller = fakeController(snapshot("office", 1), action.promise);
    const owner = createDesktopAssistantLocationOwner({
      connections: remote.manager,
      attachmentTransport: fakeAttachmentTransport(),
      resourceRelay: fakeResourceRelay(),
      createController: async () => controller,
    });
    await owner.activateServer({ expectedGeneration: 0, profileId: "office" });

    const pending = owner.dispatchAction({
      generation: 1,
      action: { type: "refresh" },
      requestId: "request-one",
    });
    const local = await owner.activateLocal({ expectedGeneration: 1 });
    expect(local).toEqual({ generation: 2, location: { kind: "local" } });
    expect(remote.closeCalls).toBe(0);
    expect(remote.surfaceListenerCount()).toBe(0);

    action.resolve({
      ok: true,
      action: "refresh",
      snapshot: snapshot("office", 2),
    });
    await expect(pending).rejects.toThrow("generation is stale");
    expect(controller.dispatchCalls).toBe(1);
    await owner.close();
  });

  it("converges canonical reads on one event-stream resume", async () => {
    const remote = fakeRemote("office");
    const controller = fakeController(snapshot("office", 1));
    const owner = createDesktopAssistantLocationOwner({
      connections: remote.manager,
      attachmentTransport: fakeAttachmentTransport(),
      resourceRelay: fakeResourceRelay(),
      createController: async () => controller,
    });
    await owner.activateServer({ expectedGeneration: 0, profileId: "office" });
    remote.setState("unavailable");

    await Promise.all([owner.readSnapshot(1), owner.readSnapshot(1)]);

    expect(remote.reconnectCalls).toBe(1);
    expect(controller.refreshCalls).toBe(2);
    await owner.close();
  });

  it("uploads through main, refreshes canonical state, and aborts on location retirement", async () => {
    const remote = fakeRemote("office");
    const attachment = uploadedAttachment();
    const uploadedSnapshot = {
      ...snapshot("office", 2),
      attachments: {
        ok: true,
        command: "readConversationAttachments",
        value: {
          kind: "assistant.conversation-attachments",
          draftKey: "__new__",
          attachments: [attachment],
        },
        event: {},
      },
    } as unknown as Snapshot;
    const controller = fakeController(uploadedSnapshot);
    let uploadSignal: AbortSignal | undefined;
    let uploadedRequest: unknown;
    const attachmentTransport: DesktopServerAttachmentTransport = {
      async upload(request) {
        uploadSignal = request.signal;
        uploadedRequest = request.attachment;
        return attachment;
      },
    };
    const owner = createDesktopAssistantLocationOwner({
      connections: remote.manager,
      attachmentTransport,
      resourceRelay: fakeResourceRelay(),
      createController: async () => controller,
    });
    await owner.activateServer({ expectedGeneration: 0, profileId: "office" });
    await expect(owner.uploadAttachment({
      generation: 1,
      content: new Uint8Array([1, 2, 3]),
      mediaType: "image/png",
      kind: "image",
    })).resolves.toMatchObject({
      kind: "web.attachment-uploaded",
      attachment: { resourceId: attachment.resourceId },
      snapshot: { generatedAt: 2 },
    });
    expect(controller.refreshCalls).toBe(1);
    expect(uploadSignal?.aborted).toBe(false);
    expect(uploadedRequest).toEqual({
      content: new Uint8Array([1, 2, 3]),
      mediaType: "image/png",
      kind: "image",
    });
    await owner.close();

    const secondRemote = fakeRemote("office");
    let retiredSignal: AbortSignal | undefined;
    const pending = deferred<AttachmentDraft>();
    const second = createDesktopAssistantLocationOwner({
      connections: secondRemote.manager,
      attachmentTransport: {
        async upload(request) {
          retiredSignal = request.signal;
          return await pending.promise;
        },
      },
      resourceRelay: fakeResourceRelay(),
      createController: async () => fakeController(uploadedSnapshot),
    });
    await second.activateServer({ expectedGeneration: 0, profileId: "office" });
    const interrupted = second.uploadAttachment({
      generation: 1,
      content: new Uint8Array([1]),
      mediaType: "image/png",
    });
    await Promise.resolve();
    await second.activateLocal({ expectedGeneration: 1 });
    expect(retiredSignal?.aborted).toBe(true);
    pending.resolve(attachment);
    await expect(interrupted).rejects.toThrow("generation is stale");
    await second.close();
  });
});

function uploadedAttachment(): AttachmentDraft {
  return {
    kind: "assistant.attachment",
    resourceId: "res_desktop_upload",
    resourceKind: "image",
    previewKind: "image",
    state: "available",
    sizeBytes: 3,
    sha256: "a".repeat(64),
    mediaType: "image/png",
    addedAt: 2,
  };
}

function fakeAttachmentTransport(): DesktopServerAttachmentTransport {
  return {
    async upload() {
      throw new Error("not used");
    },
  };
}

function fakeResourceRelay(): DesktopAssistantResourceRelay {
  return {
    prepare() {
      throw new Error("not used");
    },
    async release() {},
    async retireGeneration() {},
    async retireProfile() {},
    async handle() {
      return new Response(null, { status: 404 });
    },
    async close() {},
  };
}

function fakeController(
  current: Snapshot,
  actionResult?: Promise<ActionResult>,
): Controller & { readonly refreshCalls: number; readonly dispatchCalls: number } {
  let refreshCalls = 0;
  let dispatchCalls = 0;
  return {
    get refreshCalls() { return refreshCalls; },
    get dispatchCalls() { return dispatchCalls; },
    snapshot: () => current,
    async refresh() {
      refreshCalls += 1;
      return current;
    },
    async reconcileEvents() {
      return current;
    },
    async dispatchAction(action) {
      dispatchCalls += 1;
      return actionResult === undefined
        ? {
            ok: true,
            action: action.type,
            snapshot: current,
          }
        : await actionResult;
    },
  };
}

function snapshot(id: string, generatedAt: number): Snapshot {
  return {
    kind: "web.snapshot",
    generatedAt,
    eventCursor: generatedAt,
    view: { title: id },
  } as unknown as Snapshot;
}

function fakeRemote(...profileIds: string[]): {
  readonly manager: DesktopServerConnectionManager;
  readonly clients: Map<string, AssistantAgentHostClient>;
  readonly closeCalls: number;
  readonly reconnectCalls: number;
  emitSurface(event: Parameters<Parameters<AssistantAgentHostClient["subscribeSurfaceEvents"]>[0]>[0]): void;
  emitConnection(event: DesktopServerConnectionEvent): void;
  surfaceListenerCount(): number;
  setState(state: DesktopServerAssistantConnection["state"]): void;
} {
  const surfaceListeners = new Set<Parameters<AssistantAgentHostClient["subscribeSurfaceEvents"]>[0]>();
  const connectionListeners = new Set<(event: DesktopServerConnectionEvent) => void>();
  const clients = new Map<string, AssistantAgentHostClient>();
  const connections = new Map<string, DesktopServerAssistantConnection>();
  let closeCalls = 0;
  let reconnectCalls = 0;
  let state: DesktopServerAssistantConnection["state"] = "connected";
  for (const profileId of profileIds) {
    const profile: DesktopServerProfile = {
      profileId,
      name: profileId[0]!.toUpperCase() + profileId.slice(1),
      serverUrl: `https://${profileId}.example.test/`,
      credentialConfigured: true,
      createdAt: 1,
      updatedAt: 1,
    };
    const client = {
      subscribeSurfaceEvents(listener: Parameters<AssistantAgentHostClient["subscribeSurfaceEvents"]>[0]) {
        surfaceListeners.add(listener);
        return () => surfaceListeners.delete(listener);
      },
    } as unknown as AssistantAgentHostClient;
    clients.set(profileId, client);
    connections.set(profileId, {
      domain: "assistant",
      profile,
      get state() { return state; },
      client,
      async connect() { return client; },
      async reconnectEvents() {
        reconnectCalls += 1;
        state = "connected";
      },
      subscribe(listener) {
        connectionListeners.add(listener);
        return () => connectionListeners.delete(listener);
      },
      async close() { closeCalls += 1; },
    });
  }
  return {
    clients,
    get closeCalls() { return closeCalls; },
    get reconnectCalls() { return reconnectCalls; },
    setState(next) { state = next; },
    surfaceListenerCount: () => surfaceListeners.size,
    emitSurface(event) {
      for (const listener of surfaceListeners) listener(event);
    },
    emitConnection(event) {
      for (const listener of connectionListeners) listener(event);
    },
    manager: {
      async listProfiles() { return [...connections.values()].map(({ profile }) => profile); },
      async connectAssistant(profileId) {
        const connection = connections.get(profileId);
        if (connection === undefined) throw new Error("profile missing");
        return connection;
      },
      getAssistant: (profileId) => connections.get(profileId),
      async closeProfile() {},
      async close() {},
    },
  };
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => { resolve = fulfill; });
  return { promise, resolve };
}
