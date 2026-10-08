import { DESKTOP_SERVER_IPC } from "./bridge.js";
import type { DesktopServerConnectionManager } from "./connection-manager.js";
import type { DesktopServerProfileCatalog } from "./profile-catalog.js";
import {
  isDesktopServerProfile,
  isDesktopServerProfileId,
  normalizeServerCredential,
  normalizeServerProfileId,
  normalizeServerProfileName,
  normalizeServerUrl,
  type SaveDesktopServerProfileInput,
} from "./profile.js";

export interface DesktopServerIpcMain {
  handle(
    channel: string,
    listener: (
      event: DesktopServerIpcEvent,
      value?: unknown,
    ) => Promise<unknown>,
  ): void;
  removeHandler(channel: string): void;
}

export interface DesktopServerIpcEvent {
  readonly sender: unknown;
}

export interface DesktopServerIpcWindow {
  readonly webContents: unknown;
  isDestroyed(): boolean;
}

export interface InstallDesktopServerIpcOptions {
  readonly ipcMain: DesktopServerIpcMain;
  readonly profiles: DesktopServerProfileCatalog;
  readonly connections: DesktopServerConnectionManager;
  readonly getWindow: () => DesktopServerIpcWindow | undefined;
}

export function installDesktopServerIpc(
  options: InstallDesktopServerIpcOptions,
): () => void {
  options.ipcMain.handle(DESKTOP_SERVER_IPC.listProfiles, async (event) => {
    assertActiveRenderer(options.getWindow(), event.sender);
    try {
      return await options.profiles.list();
    } catch {
      throw new Error("Server profiles are unavailable");
    }
  });
  options.ipcMain.handle(DESKTOP_SERVER_IPC.saveProfile, async (event, value) => {
    assertActiveRenderer(options.getWindow(), event.sender);
    const input = requireSaveProfileInput(value);
    let profile;
    try {
      profile = await options.profiles.save(input);
      if (!isDesktopServerProfile(profile)) {
        throw new Error("Server profile is invalid");
      }
    } catch {
      throw new Error("Server profile could not be saved");
    }
    await options.connections.closeProfile(input.profileId).catch(() => {});
    return profile;
  });
  options.ipcMain.handle(DESKTOP_SERVER_IPC.removeProfile, async (event, value) => {
    assertActiveRenderer(options.getWindow(), event.sender);
    const profileId = requireProfileId(value);
    try {
      await options.profiles.remove(profileId);
    } catch {
      throw new Error("Server profile could not be removed");
    }
    await options.connections.closeProfile(profileId).catch(() => {});
  });

  return () => {
    options.ipcMain.removeHandler(DESKTOP_SERVER_IPC.listProfiles);
    options.ipcMain.removeHandler(DESKTOP_SERVER_IPC.saveProfile);
    options.ipcMain.removeHandler(DESKTOP_SERVER_IPC.removeProfile);
  };
}

function requireSaveProfileInput(value: unknown): SaveDesktopServerProfileInput {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Server profile input is invalid");
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.some((key) =>
      !["profileId", "name", "serverUrl", "credential"].includes(key)
    ) ||
    !["profileId", "name", "serverUrl"].every((key) => keys.includes(key))
  ) {
    throw new Error("Server profile input is invalid");
  }
  if (
    typeof record.profileId !== "string" ||
    typeof record.name !== "string" ||
    typeof record.serverUrl !== "string"
  ) {
    throw new Error("Server profile input is invalid");
  }
  const input: SaveDesktopServerProfileInput = {
    profileId: normalizeServerProfileId(record.profileId),
    name: normalizeServerProfileName(record.name),
    serverUrl: normalizeServerUrl(record.serverUrl),
  };
  if (Object.hasOwn(record, "credential")) {
    if (record.credential !== null && typeof record.credential !== "string") {
      throw new Error("Server profile credential is invalid");
    }
    if (record.credential !== null) normalizeServerCredential(record.credential);
    return { ...input, credential: record.credential };
  }
  return input;
}

function requireProfileId(value: unknown): string {
  if (!isDesktopServerProfileId(value)) {
    throw new Error("Server profile ID is invalid");
  }
  return value;
}

function assertActiveRenderer(
  owner: DesktopServerIpcWindow | undefined,
  sender: unknown,
): asserts owner is DesktopServerIpcWindow {
  if (
    owner === undefined ||
    owner.isDestroyed() ||
    sender !== owner.webContents
  ) {
    throw new Error(
      "Server profile request did not originate from the active Desktop window",
    );
  }
}
