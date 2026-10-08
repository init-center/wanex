import { describe, expect, it } from "vitest";
import type { ActionResult, Snapshot } from "@wanex/assistant-ui";
import type {
  DesktopAssistantEvent,
  DesktopAssistantRendererBridge,
} from "../src/assistant/bridge.js";
import type { PreparedResourceDelivery } from "@wanex/assistant-ui/client";
import { createDesktopAssistantEventRelay } from "../src/assistant/bridge.js";
import { createDesktopRemoteAssistantClient } from "../src/renderer/assistant/client.js";

describe("Desktop remote Assistant Renderer client", () => {
  it("scopes reads, actions, and events to one activation generation", async () => {
    const fixture = bridge();
    const initial = snapshot(1);
    const client = createDesktopRemoteAssistantClient(fixture.bridge, {
      generation: 4,
      location: { kind: "server", profileId: "office", name: "Office" },
      snapshot: initial,
    });
    const events: unknown[] = [];
    client.subscribe?.((event) => events.push(event));

    await expect(client.readInitialSnapshot?.()).resolves.toBe(initial);
    await client.readSnapshot();
    await client.dispatchAction({ type: "refresh" }, { requestId: "request-four" });
    await client.uploadAttachment?.({
      content: new Uint8Array([1]),
      mediaType: "image/png",
      kind: "image",
    });
    const delivery = await client.prepareResourceDelivery?.({
      resourceId: "resource-four",
      sha256: "a".repeat(64),
      purpose: "preview",
    });
    if (delivery === undefined) throw new Error("resource delivery is unavailable");
    await client.releaseResourceDelivery?.(delivery);
    expect(fixture.readGenerations).toEqual([4]);
    expect(fixture.actions).toEqual([{
      generation: 4,
      action: { type: "refresh" },
      requestId: "request-four",
    }]);
    expect(fixture.resourceReleases).toEqual([{
      generation: 4,
      delivery: {
        kind: "web.resource-delivery",
        url: delivery.url,
      },
    }]);
    expect(fixture.attachmentUploads).toEqual([{
      generation: 4,
      content: new Uint8Array([1]),
      mediaType: "image/png",
      kind: "image",
    }]);

    fixture.publish({ generation: 3, event: { kind: "stream-unavailable" } });
    fixture.publish({ generation: 4, event: { kind: "snapshot-invalidated" } });
    expect(events).toEqual([{ kind: "snapshot-invalidated" }]);
    expect(client.uploadAttachment).toBeTypeOf("function");
    expect(client.prepareResourceDelivery).toBeTypeOf("function");
    expect(client.listProviders).toBeUndefined();
    expect(client.mcpSettings).toBeUndefined();
  });

  it("replays the bounded activation gap and collapses overflow to canonical recovery", () => {
    const relay = createDesktopAssistantEventRelay(2);
    relay.publish({ generation: 1, event: { kind: "snapshot-invalidated" } });
    relay.publish({ generation: 1, event: { kind: "snapshot-invalidated" } });
    relay.publish({ generation: 1, event: { kind: "snapshot-invalidated" } });
    const events: DesktopAssistantEvent[] = [];

    relay.subscribe((event) => events.push(event));

    expect(events).toEqual([
      { generation: 1, event: { kind: "snapshot-invalidated" } },
    ]);
  });

  it("forwards Workspace approval as an ordinary Assistant surface action", async () => {
    const fixture = bridge();
    const client = createDesktopRemoteAssistantClient(fixture.bridge, {
      generation: 7,
      location: { kind: "server", profileId: "office", name: "Office" },
      snapshot: snapshot(1),
    });
    const action = {
      type: "resolve-conversation-approval" as const,
      input: {
        sessionId: "session_workspace_access",
        approvalId: "approval_workspace_access",
        expectedApprovalRevision: 0,
        decision: "approve_once" as const,
        reason: "User allowed the requested workspace read",
      },
    };

    await client.dispatchAction(action, { requestId: "workspace-access-decision" });
    expect(fixture.actions).toEqual([{
      generation: 7,
      action,
      requestId: "workspace-access-decision",
    }]);
    expect(JSON.stringify(fixture.actions)).not.toContain("/Users/server-only");
  });
});

function bridge(): {
  readonly bridge: DesktopAssistantRendererBridge;
  readonly readGenerations: number[];
  readonly actions: unknown[];
  readonly resourceReleases: unknown[];
  readonly attachmentUploads: unknown[];
  publish(event: DesktopAssistantEvent): void;
} {
  const readGenerations: number[] = [];
  const actions: unknown[] = [];
  const resourceReleases: unknown[] = [];
  const attachmentUploads: unknown[] = [];
  const listeners = new Set<(event: DesktopAssistantEvent) => void>();
  const current = snapshot(2);
  return {
    readGenerations,
    actions,
    resourceReleases,
    attachmentUploads,
    publish(event) { for (const listener of listeners) listener(event); },
    bridge: {
      async readState() { return { generation: 0, location: { kind: "local" } }; },
      async activateServer() { throw new Error("not used"); },
      async activateLocal() { throw new Error("not used"); },
      async readSnapshot(generation) {
        readGenerations.push(generation);
        return current;
      },
      async dispatchAction(request) {
        actions.push(request);
        return { ok: true, action: request.action.type, snapshot: current } as ActionResult;
      },
      async uploadAttachment(request) {
        attachmentUploads.push(request);
        const attachment = {
          kind: "assistant.attachment" as const,
          resourceId: "res_renderer_upload",
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
        return preparedResourceDelivery(request.generation);
      },
      async releaseResourceDelivery(request) {
        resourceReleases.push(request);
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
  };
}

function preparedResourceDelivery(generation: number): PreparedResourceDelivery {
  return {
    kind: "web.resource-delivery",
    url: `wanex-resource://delivery/wrc_${"a".repeat(43)}`,
    resourceId: `resource-${generation}`,
    sha256: "a".repeat(64),
    resourceKind: "image",
    mediaType: "image/png",
    sizeBytes: 1,
    purpose: "preview",
    expiresAt: 10_000,
  };
}

function snapshot(generatedAt: number): Snapshot {
  return {
    kind: "web.snapshot",
    generatedAt,
    eventCursor: generatedAt,
    view: {},
  } as unknown as Snapshot;
}
