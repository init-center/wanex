import { describe, expect, it } from "vitest";
import type { CodingEventEnvelope } from "@wanex/coding";
import type { DesktopCodingEvent, DesktopCodingRendererBridge } from "../src/coding-bridge.js";
import { createDesktopRendererCodingClient } from "../src/renderer/coding/client.js";

describe("Desktop Renderer Coding client", () => {
  it("keeps the bridge envelope boundary and separates canonical reads", () => {
    const { bridge, publish } = fakeBridge();
    const client = createDesktopRendererCodingClient(bridge);
    const events: unknown[] = [];
    const canonicalReads: unknown[] = [];
    client.subscribe((event) => events.push(event));
    client.subscribeCanonicalReads((event) => canonicalReads.push(event));

    const envelope: CodingEventEnvelope = {
      protocol: "wanex.coding/1",
      kind: "event",
      event: {
        kind: "turn_invalidated",
        projectId: "project-1",
        reason: "turn_progress",
        streamId: "coding-events",
        sequence: 1,
        occurredAt: 1,
        turnId: "turn-1",
      },
    };
    publish(envelope);
    publish({
      kind: "wanex.desktop.coding.canonical-read-required",
      projectId: "project-1",
    });

    expect(events).toEqual([envelope.event]);
    expect(canonicalReads).toEqual([{
      kind: "wanex.desktop.coding.canonical-read-required",
      projectId: "project-1",
    }]);
  });
});

function fakeBridge(): {
  readonly bridge: DesktopCodingRendererBridge;
  readonly publish: (event: DesktopCodingEvent) => void;
} {
  const listeners = new Set<(event: DesktopCodingEvent) => void>();
  return {
    bridge: {
      selectProject: async () => ({ kind: "cancelled" }),
      listRemoteProfiles: async () => [],
      listRemoteProjects: async (profileId) => ({ profileId, projects: [] }),
      selectRemoteProject: async () => ({ kind: "cancelled" }),
      sendCodingCommand: async () => undefined,
      subscribeCodingEvents(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    publish(event) {
      for (const listener of listeners) listener(event);
    },
  };
}
