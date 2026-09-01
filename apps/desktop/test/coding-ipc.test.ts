import { describe, expect, it } from "vitest";
import {
  DESKTOP_CODING_IPC,
} from "../src/coding-bridge.js";
import {
  isCodingCommandResponse,
  isCodingEventEnvelope,
} from "@wanex/coding";
import {
  installDesktopCodingIpc,
  type DesktopCodingIpcEvent,
  type DesktopCodingIpcMain,
  type DesktopCodingWindow,
} from "../src/coding-ipc.js";
import type { DesktopCodingRouter } from "../src/coding/router.js";
import type { DesktopCodingEvent } from "../src/coding-bridge.js";

describe("Desktop Coding IPC", () => {
  it("keeps project paths inside main and rejects malformed commands", async () => {
    const ipc = new FakeIpcMain();
    let openedPath: string | undefined;
    const router = fakeRouter({
      openLocalProject: async (path) => {
        openedPath = path;
        return selectedProject();
      },
    });
    const window = fakeWindow();
    const remove = installDesktopCodingIpc({
      ipcMain: ipc,
      router,
      getWindow: () => window,
      selectProject: async () => "/private/selected/project",
    });

    await expect(ipc.listener(DESKTOP_CODING_IPC.selectProject, {
      sender: window.webContents,
    })).resolves.toMatchObject({ kind: "selected", project: project() });
    expect(openedPath).toBe("/private/selected/project");
    await expect(ipc.listener(DESKTOP_CODING_IPC.sendCommand, {
      sender: window.webContents,
    }, { command: "not-valid" })).rejects.toThrow(
      "Invalid Coding command request",
    );

    remove();
    expect(ipc.removed).toEqual([
      DESKTOP_CODING_IPC.selectProject,
      DESKTOP_CODING_IPC.listRemoteProfiles,
      DESKTOP_CODING_IPC.listRemoteProjects,
      DESKTOP_CODING_IPC.selectRemoteProject,
      DESKTOP_CODING_IPC.sendCommand,
    ]);
  });

  it("accepts only the active window sender and forwards validated events", async () => {
    const ipc = new FakeIpcMain();
    const active = fakeWindow();
    const foreign = fakeWindow();
    const router = fakeRouter();
    const remove = installDesktopCodingIpc({
      ipcMain: ipc,
      router,
      getWindow: () => active,
      selectProject: async () => undefined,
    });

    await expect(ipc.listener(DESKTOP_CODING_IPC.selectProject, {
      sender: foreign.webContents,
    })).rejects.toThrow("active Desktop window");

    router.publish({
      protocol: "wanex.coding/1",
      kind: "event",
      event: {
        kind: "project_invalidated",
        projectId: "project-1",
        reason: "project_opened",
        streamId: "stream-1",
        sequence: 1,
        occurredAt: 1,
      },
    });
    router.publish({
      kind: "wanex.desktop.coding.canonical-read-required",
      projectId: "project-1",
    });
    router.publish({
      protocol: "wanex.coding/1",
      kind: "event",
      event: { kind: "project_invalidated" },
    } as never);
    expect(active.webContents.sent).toEqual([
      [DESKTOP_CODING_IPC.event, expect.objectContaining({ kind: "event" })],
      [DESKTOP_CODING_IPC.event, {
        kind: "wanex.desktop.coding.canonical-read-required",
        projectId: "project-1",
      }],
    ]);
    remove();
  });

  it("rejects a response that does not satisfy the Coding transport contract", async () => {
    const ipc = new FakeIpcMain();
    const window = fakeWindow();
    const router = fakeRouter({
      send: async () => ({ ok: true, value: "not-a-project-list" }),
    });
    const remove = installDesktopCodingIpc({
      ipcMain: ipc,
      router,
      getWindow: () => window,
      selectProject: async () => undefined,
    });

    const request = {
      protocol: "wanex.coding/1" as const,
      kind: "command" as const,
      requestId: "response-contract",
      command: "project.list" as const,
    };
    await expect(
      ipc.listener(DESKTOP_CODING_IPC.sendCommand, {
        sender: window.webContents,
      }, request),
    ).rejects.toThrow("Coding command response is invalid");
    remove();
  });

  it("uses the public transport validators for nested command and event data", () => {
    expect(isCodingCommandResponse({
      protocol: "wanex.coding/1",
      kind: "response",
      requestId: "request-1",
      command: "project.list",
      ok: true,
      value: "invalid",
    }, { requestId: "request-1", command: "project.list" })).toBe(false);
    expect(isCodingEventEnvelope({
      protocol: "wanex.coding/1",
      kind: "event",
      event: { kind: "project_invalidated" },
    })).toBe(false);
  });
});

class FakeIpcMain implements DesktopCodingIpcMain {
  readonly handlers = new Map<string, (event: DesktopCodingIpcEvent, value?: unknown) => Promise<unknown>>();
  readonly removed: string[] = [];

  handle(channel: string, listener: (event: DesktopCodingIpcEvent, value?: unknown) => Promise<unknown>): void {
    this.handlers.set(channel, listener);
  }

  removeHandler(channel: string): void {
    this.handlers.delete(channel);
    this.removed.push(channel);
  }

  async listener(channel: string, event: DesktopCodingIpcEvent, value?: unknown): Promise<unknown> {
    const handler = this.handlers.get(channel);
    if (handler === undefined) throw new Error(`missing handler: ${channel}`);
    return await handler(event, value);
  }
}

function fakeWindow(): DesktopCodingWindow & { readonly webContents: DesktopCodingWindow["webContents"] & { readonly sent: unknown[][] } } {
  const sent: unknown[][] = [];
  const webContents = {
    sent,
    send(channel: string, value: unknown) {
      sent.push([channel, value]);
    },
  };
  return {
    webContents,
    isDestroyed: () => false,
  };
}

function fakeRouter(options: {
  readonly openLocalProject?: DesktopCodingRouter["openLocalProject"];
  readonly send?: DesktopCodingRouter["send"];
} = {}): DesktopCodingRouter & {
  publish(event: Parameters<DesktopCodingRouter["subscribe"]>[0] extends (value: infer Event) => void ? Event : never): void;
} {
  const listeners = new Set<(event: DesktopCodingEvent) => void>();
  return {
    openLocalProject: options.openLocalProject ?? (async () => selectedProject()),
    listRemoteProfiles: async () => [],
    listRemoteProjects: async (profileId) => ({ profileId, projects: [] }),
    openRemoteProject: async () => selectedProject(),
    send: options.send ?? (async () => ({
      protocol: "wanex.coding/1",
      kind: "response",
      requestId: "request-1",
      command: "project.list",
      ok: true,
      value: [],
    })),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close: async () => {},
    publish(event) {
      for (const listener of listeners) listener(event);
    },
  };
}

function selectedProject() {
  return {
    kind: "selected" as const,
    project: project(),
    location: { kind: "local" as const },
    capabilities: { proposalApply: true },
  };
}

function project() {
  return {
    projectId: "project-1",
    name: "project",
    state: "ready" as const,
    openedAt: 1,
    recovery: {
      transactionAttention: false,
      taskAttentionCount: 0,
      taskFailureCount: 0,
      moreTasksPending: false,
    },
  };
}
