import { describe, expect, it } from "vitest";
import {
  DESKTOP_SERVER_IPC,
  isDesktopServerProfileList,
} from "../src/server/bridge.js";
import type { DesktopServerConnectionManager } from "../src/server/connection-manager.js";
import { installDesktopServerIpc } from "../src/server/ipc.js";
import type {
  DesktopServerProfile,
  SaveDesktopServerProfileInput,
} from "../src/server/profile.js";
import type { DesktopServerProfileCatalog } from "../src/server/profile-catalog.js";

describe("Desktop server profile IPC", () => {
  it("projects semantic profiles only to the active renderer", async () => {
    const profile = testProfile();
    const ipcMain = new TestIpcMain();
    const window = new TestWindow();
    const remove = installDesktopServerIpc({
      ipcMain,
      profiles: testProfiles(profile),
      connections: testConnections(),
      getWindow: () => window,
    });

    const value = await ipcMain.invoke(
      DESKTOP_SERVER_IPC.listProfiles,
      window.webContents,
    );

    expect(value).toEqual([profile]);
    expect(isDesktopServerProfileList(value)).toBe(true);
    expect(JSON.stringify(value)).not.toContain("credentialRef");
    expect(JSON.stringify(value)).not.toContain("server-secret");
    remove();
    expect(ipcMain.handlers.size).toBe(0);
  });

  it("saves a canonical root URL then retires both domain connections", async () => {
    const profile = testProfile();
    const savedInputs: SaveDesktopServerProfileInput[] = [];
    const closedProfiles: string[] = [];
    const ipcMain = new TestIpcMain();
    const window = new TestWindow();
    installDesktopServerIpc({
      ipcMain,
      profiles: testProfiles(profile, { savedInputs }),
      connections: testConnections(closedProfiles),
      getWindow: () => window,
    });

    await expect(
      ipcMain.invoke(DESKTOP_SERVER_IPC.saveProfile, window.webContents, {
        profileId: "office",
        name: " Office ",
        serverUrl: "https://office.example.test",
        credential: "server-secret",
      }),
    ).resolves.toEqual(profile);
    expect(savedInputs).toEqual([{
      profileId: "office",
      name: "Office",
      serverUrl: "https://office.example.test/",
      credential: "server-secret",
    }]);
    expect(closedProfiles).toEqual(["office"]);
  });

  it("removes a profile durably before retiring its domain connections", async () => {
    const profile = testProfile();
    const removedIds: string[] = [];
    const closedProfiles: string[] = [];
    const ipcMain = new TestIpcMain();
    const window = new TestWindow();
    installDesktopServerIpc({
      ipcMain,
      profiles: testProfiles(profile, { removedIds }),
      connections: testConnections(closedProfiles),
      getWindow: () => window,
    });

    await expect(
      ipcMain.invoke(
        DESKTOP_SERVER_IPC.removeProfile,
        window.webContents,
        profile.profileId,
      ),
    ).resolves.toBeUndefined();
    expect(removedIds).toEqual([profile.profileId]);
    expect(closedProfiles).toEqual([profile.profileId]);
  });

  it("rejects forged renderers and non-profile payloads before persistence", async () => {
    const profile = testProfile();
    const savedInputs: SaveDesktopServerProfileInput[] = [];
    const ipcMain = new TestIpcMain();
    const window = new TestWindow();
    installDesktopServerIpc({
      ipcMain,
      profiles: testProfiles(profile, { savedInputs }),
      connections: testConnections(),
      getWindow: () => window,
    });

    await expect(
      ipcMain.invoke(DESKTOP_SERVER_IPC.listProfiles, {}),
    ).rejects.toThrow("active Desktop window");
    await expect(
      ipcMain.invoke(DESKTOP_SERVER_IPC.saveProfile, window.webContents, {
        profileId: "office",
        name: "Office",
        endpoint: "https://office.example.test/v1/agent-host/message",
      }),
    ).rejects.toThrow("input is invalid");
    await expect(
      ipcMain.invoke(DESKTOP_SERVER_IPC.saveProfile, window.webContents, {
        profileId: "office",
        name: "Office",
        serverUrl: "http://office.example.test/",
      }),
    ).rejects.toThrow("HTTPS origin");
    await expect(
      ipcMain.invoke(DESKTOP_SERVER_IPC.saveProfile, window.webContents, {
        profileId: "office",
        name: "Office",
        serverUrl: "https://office.example.test/admin",
      }),
    ).rejects.toThrow("HTTPS origin");
    expect(savedInputs).toEqual([]);
  });

  it("does not retire active connections when persistence fails", async () => {
    const profile = testProfile();
    const closedProfiles: string[] = [];
    const ipcMain = new TestIpcMain();
    const window = new TestWindow();
    const profiles = testProfiles(profile);
    profiles.save = async () => {
      throw new Error("persistence failed");
    };
    profiles.remove = async () => {
      throw new Error("persistence failed");
    };
    installDesktopServerIpc({
      ipcMain,
      profiles,
      connections: testConnections(closedProfiles),
      getWindow: () => window,
    });

    await expect(
      ipcMain.invoke(DESKTOP_SERVER_IPC.saveProfile, window.webContents, {
        profileId: "office",
        name: "Office",
        serverUrl: "https://office.example.test/",
      }),
    ).rejects.toThrow("could not be saved");
    await expect(
      ipcMain.invoke(
        DESKTOP_SERVER_IPC.removeProfile,
        window.webContents,
        "office",
      ),
    ).rejects.toThrow("could not be removed");
    expect(closedProfiles).toEqual([]);
  });
});

function testProfile(): DesktopServerProfile {
  return {
    profileId: "office",
    name: "Office",
    serverUrl: "https://office.example.test/",
    credentialConfigured: true,
    createdAt: 1,
    updatedAt: 1,
  };
}

function testProfiles(
  profile: DesktopServerProfile,
  evidence: {
    readonly savedInputs?: SaveDesktopServerProfileInput[];
    readonly removedIds?: string[];
  } = {},
): DesktopServerProfileCatalog {
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
      evidence.savedInputs?.push(input);
      return profile;
    },
    async remove(profileId) {
      evidence.removedIds?.push(profileId);
    },
  };
}

function testConnections(
  closedProfiles: string[] = [],
): DesktopServerConnectionManager {
  return {
    listProfiles: async () => [],
    connectAssistant: async () => {
      throw new Error("not used");
    },
    getAssistant: () => undefined,
    closeProfile: async (profileId) => {
      closedProfiles.push(profileId);
    },
    close: async () => {},
  };
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

  async invoke(channel: string, sender: unknown, value?: unknown): Promise<unknown> {
    const handler = this.handlers.get(channel);
    if (handler === undefined) throw new Error(`missing handler: ${channel}`);
    return await handler({ sender }, value);
  }
}

class TestWindow {
  readonly webContents = {};

  isDestroyed(): boolean {
    return false;
  }
}
