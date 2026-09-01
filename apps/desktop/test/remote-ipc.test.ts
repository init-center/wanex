import { describe, expect, it } from "vitest";
import type { CodingAgentHostClient } from "@wanex/coding/host";
import type { DesktopRemoteConnectionEvent } from "../src/remote/bridge.js";
import {
  DESKTOP_REMOTE_IPC,
  isDesktopRemoteConnectionProfileList,
} from "../src/remote/bridge.js";
import type {
  RemoteCodingConnection,
  RemoteCodingConnectionEvent,
  RemoteCodingConnectionManager,
  RemoteCodingConnectionState,
} from "../src/remote/connection.js";
import { installDesktopRemoteIpc } from "../src/remote/ipc.js";
import type { RemoteConnectionProfile } from "../src/remote/profile.js";
import type { RemoteConnectionProfileCatalog } from "../src/remote/profiles.js";

describe("Desktop remote connection IPC", () => {
  it("projects only semantic profiles and connection events to the active renderer", async () => {
    const profile = testProfile();
    const ipcMain = new TestIpcMain();
    const window = new TestWindow();
    const connection = new TestConnection(profile);
    const manager = new TestConnectionManager(connection);
    const remove = installDesktopRemoteIpc({
      ipcMain,
      profiles: testProfiles(profile),
      connections: manager,
      getWindow: () => window,
    });

    const profiles = await ipcMain.invoke(
      DESKTOP_REMOTE_IPC.listProfiles,
      window.webContents,
    );
    expect(profiles).toEqual([profile]);
    expect(JSON.stringify(profiles)).not.toContain("credentialRef");
    expect(JSON.stringify(profiles)).not.toContain("remote-secret");

    const status = await ipcMain.invoke(
      DESKTOP_REMOTE_IPC.connect,
      window.webContents,
      profile.profileId,
    );
    expect(status).toEqual({
      kind: "wanex.desktop.remote-connection.status",
      profileId: profile.profileId,
      state: "connected",
    });

    connection.publish({
      kind: "canonical-read-required",
      reason: "stream_replaced",
    });
    expect(window.sent).toEqual([
      {
        channel: DESKTOP_REMOTE_IPC.event,
        value: {
          kind: "wanex.desktop.remote-connection.event",
          profileId: profile.profileId,
          event: {
            kind: "canonical-read-required",
            reason: "stream_replaced",
          },
        },
      },
    ]);

    await ipcMain.invoke(
      DESKTOP_REMOTE_IPC.disconnect,
      window.webContents,
      profile.profileId,
    );
    expect(connection.state).toBe("closed");
    remove();
    expect(ipcMain.handlers.size).toBe(0);
  });

  it("rejects requests from a stale or forged renderer", async () => {
    const profile = testProfile();
    const ipcMain = new TestIpcMain();
    const window = new TestWindow();
    installDesktopRemoteIpc({
      ipcMain,
      profiles: testProfiles(profile),
      connections: new TestConnectionManager(new TestConnection(profile)),
      getWindow: () => window,
    });

    await expect(
      ipcMain.invoke(DESKTOP_REMOTE_IPC.listProfiles, {}),
    ).rejects.toThrow("active Desktop window");
  });

  it("saves and removes profiles through the main process lifecycle boundary", async () => {
    const profile = testProfile();
    const savedInputs: unknown[] = [];
    const removedIds: string[] = [];
    const ipcMain = new TestIpcMain();
    const window = new TestWindow();
    const connection = new TestConnection(profile);
    const manager = new TestConnectionManager(connection);
    const remove = installDesktopRemoteIpc({
      ipcMain,
      profiles: testProfiles(profile, { savedInputs, removedIds }),
      connections: manager,
      getWindow: () => window,
    });

    await ipcMain.invoke(
      DESKTOP_REMOTE_IPC.connect,
      window.webContents,
      "office",
    );
    await expect(
      ipcMain.invoke(DESKTOP_REMOTE_IPC.saveProfile, window.webContents, {
        profileId: "office",
        name: "Office updated",
        endpoint: "https://office.example.test/v1/agent-host/message",
        credential: "remote-secret",
      }),
    ).resolves.toEqual(profile);
    expect(savedInputs).toEqual([{
      profileId: "office",
      name: "Office updated",
      endpoint: "https://office.example.test/v1/agent-host/message",
      credential: "remote-secret",
    }]);
    expect(JSON.stringify(profile)).not.toContain("remote-secret");
    expect(connection.state).toBe("closed");

    await expect(
      ipcMain.invoke(DESKTOP_REMOTE_IPC.removeProfile, window.webContents, "office"),
    ).resolves.toBeUndefined();
    expect(removedIds).toEqual(["office"]);
    remove();
  });

  it("rejects secret-bearing or invalid profile payloads before persistence", async () => {
    const profile = testProfile();
    const savedInputs: unknown[] = [];
    const ipcMain = new TestIpcMain();
    const window = new TestWindow();
    const remove = installDesktopRemoteIpc({
      ipcMain,
      profiles: testProfiles(profile, { savedInputs }),
      connections: new TestConnectionManager(new TestConnection(profile)),
      getWindow: () => window,
    });

    await expect(
      ipcMain.invoke(DESKTOP_REMOTE_IPC.saveProfile, window.webContents, {
        profileId: "office",
        name: "Office",
        endpoint: "http://office.example.test/v1/agent-host/message",
        credential: "remote-secret",
      }),
    ).rejects.toThrow("HTTPS");
    await expect(
      ipcMain.invoke(DESKTOP_REMOTE_IPC.saveProfile, window.webContents, {
        profileId: "office",
        name: "Office",
        endpoint: "https://office.example.test/v1/agent-host/message",
        credential: { secret: "remote-secret" },
      }),
    ).rejects.toThrow("credential");
    expect(savedInputs).toHaveLength(0);
    remove();
  });

  it("keeps an active connection when the durable profile save fails", async () => {
    const profile = testProfile();
    const ipcMain = new TestIpcMain();
    const window = new TestWindow();
    const connection = new TestConnection(profile);
    const manager = new TestConnectionManager(connection);
    const remove = installDesktopRemoteIpc({
      ipcMain,
      profiles: testProfiles(profile, { saveError: new Error("conflict") }),
      connections: manager,
      getWindow: () => window,
    });
    await ipcMain.invoke(DESKTOP_REMOTE_IPC.connect, window.webContents, "office");

    await expect(
      ipcMain.invoke(DESKTOP_REMOTE_IPC.saveProfile, window.webContents, {
        profileId: "office",
        name: "Conflicting update",
        endpoint: "https://office.example.test/v1/agent-host/message",
      }),
    ).rejects.toThrow("could not be saved");
    expect(manager.get("office")).toBe(connection);
    expect(connection.state).toBe("connected");
    remove();
  });

  it("keeps an active connection when profile removal fails before cleanup", async () => {
    const profile = testProfile();
    const ipcMain = new TestIpcMain();
    const window = new TestWindow();
    const connection = new TestConnection(profile);
    const manager = new TestConnectionManager(connection);
    const remove = installDesktopRemoteIpc({
      ipcMain,
      profiles: testProfiles(profile, { removeError: new Error("conflict") }),
      connections: manager,
      getWindow: () => window,
    });
    await ipcMain.invoke(DESKTOP_REMOTE_IPC.connect, window.webContents, "office");

    await expect(
      ipcMain.invoke(DESKTOP_REMOTE_IPC.removeProfile, window.webContents, "office"),
    ).rejects.toThrow("could not be removed");
    expect(manager.get("office")).toBe(connection);
    expect(connection.state).toBe("connected");
    remove();
  });

  it("does not report a saved profile as failed when stale connection cleanup throws", async () => {
    const profile = testProfile();
    const ipcMain = new TestIpcMain();
    const window = new TestWindow();
    const connection = new TestConnection(profile, { closeError: new Error("close failed") });
    const manager = new TestConnectionManager(connection);
    const remove = installDesktopRemoteIpc({
      ipcMain,
      profiles: testProfiles(profile),
      connections: manager,
      getWindow: () => window,
    });
    await ipcMain.invoke(DESKTOP_REMOTE_IPC.connect, window.webContents, "office");

    await expect(
      ipcMain.invoke(DESKTOP_REMOTE_IPC.saveProfile, window.webContents, {
        profileId: "office",
        name: "Office updated",
        endpoint: "https://office.example.test/v1/agent-host/message",
      }),
    ).resolves.toEqual(profile);
    expect(manager.get("office")).toBeUndefined();
    remove();
  });

  it("rejects profile projections that contain an internal credential reference", () => {
    expect(
      isDesktopRemoteConnectionProfileList([
        {
          ...testProfile(),
          credentialRef: "wanex-keychain://internal/ref",
        },
      ]),
    ).toBe(false);
  });
});

function testProfile(): RemoteConnectionProfile {
  return {
    profileId: "office",
    name: "Office",
    endpoint: "https://office.example.test/v1/agent-host/message",
    credentialConfigured: true,
    createdAt: 1,
    updatedAt: 1,
  };
}

function testProfiles(
  profile: RemoteConnectionProfile,
  hooks: {
    readonly savedInputs?: unknown[];
    readonly removedIds?: string[];
    readonly saveError?: Error;
    readonly removeError?: Error;
  } = {},
): RemoteConnectionProfileCatalog {
  return {
    async list() {
      return [profile];
    },
    async read(profileId) {
      return profileId === profile.profileId ? profile : null;
    },
    async resolveCredential() {
      return null;
    },
    async reconcileCredentialRetirement() {
      return false;
    },
    async save(input) {
      hooks.savedInputs?.push(input);
      if (hooks.saveError !== undefined) throw hooks.saveError;
      return profile;
    },
    async remove(profileId) {
      hooks.removedIds?.push(profileId);
      if (hooks.removeError !== undefined) throw hooks.removeError;
    },
  };
}

class TestConnection implements RemoteCodingConnection {
  state: RemoteCodingConnectionState = "connected";
  readonly client = undefined;
  readonly #listeners = new Set<(event: RemoteCodingConnectionEvent) => void>();

  constructor(
    readonly profile: RemoteConnectionProfile,
    private readonly options: { readonly closeError?: Error } = {},
  ) {}

  async connect(): Promise<CodingAgentHostClient> {
    throw new Error("not used by the IPC fixture");
  }

  async reconnectEvents(): Promise<void> {
    this.state = "reconnecting";
  }

  subscribe(
    listener: (event: RemoteCodingConnectionEvent) => void,
  ): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async close(): Promise<void> {
    this.state = "closed";
    this.#listeners.clear();
    if (this.options.closeError !== undefined) throw this.options.closeError;
  }

  publish(event: RemoteCodingConnectionEvent): void {
    for (const listener of this.#listeners) listener(event);
  }
}

class TestConnectionManager implements RemoteCodingConnectionManager {
  #active: TestConnection | undefined;

  constructor(private readonly connection: TestConnection) {}

  async listProfiles(): Promise<readonly RemoteConnectionProfile[]> {
    return [this.connection.profile];
  }

  async connect(profileId: string): Promise<RemoteCodingConnection> {
    if (profileId !== this.connection.profile.profileId) {
      throw new Error("profile is unavailable");
    }
    this.#active = this.connection;
    return this.connection;
  }

  get(profileId: string): RemoteCodingConnection | undefined {
    return this.#active?.profile.profileId === profileId
      ? this.#active
      : undefined;
  }

  async close(profileId?: string): Promise<void> {
    if (
      this.#active === undefined ||
      (profileId !== undefined && this.#active.profile.profileId !== profileId)
    ) {
      return;
    }
    const active = this.#active;
    this.#active = undefined;
    await active.close();
  }
}

class TestIpcMain {
  readonly handlers = new Map<
    string,
    (event: { readonly sender: unknown }, value?: unknown) => Promise<unknown>
  >();

  handle(
    channel: string,
    listener: (
      event: { readonly sender: unknown },
      value?: unknown,
    ) => Promise<unknown>,
  ): void {
    this.handlers.set(channel, listener);
  }

  removeHandler(channel: string): void {
    this.handlers.delete(channel);
  }

  async invoke(
    channel: string,
    sender: unknown,
    value?: unknown,
  ): Promise<unknown> {
    const handler = this.handlers.get(channel);
    if (handler === undefined) throw new Error(`missing handler: ${channel}`);
    return await handler({ sender }, value);
  }
}

class TestWindow {
  readonly sent: {
    readonly channel: string;
    readonly value: DesktopRemoteConnectionEvent;
  }[] = [];
  readonly webContents = {
    send: (channel: string, value: DesktopRemoteConnectionEvent) => {
      this.sent.push({ channel, value });
    },
  };

  isDestroyed(): boolean {
    return false;
  }
}
