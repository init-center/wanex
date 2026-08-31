import type {
  DesktopRemoteConnectionEvent,
  DesktopRemoteConnectionStatus,
} from "./bridge.js";
import { DESKTOP_REMOTE_IPC } from "./bridge.js";
import type {
  RemoteCodingConnection,
  RemoteCodingConnectionManager,
} from "./connection.js";
import type { RemoteConnectionProfileCatalog } from "./profiles.js";
import { isRemoteConnectionProfileId } from "./profile.js";

export interface DesktopRemoteIpcMain {
  handle(
    channel: string,
    listener: (
      event: DesktopRemoteIpcEvent,
      value?: unknown,
    ) => Promise<unknown>,
  ): void;
  removeHandler(channel: string): void;
}

export interface DesktopRemoteIpcEvent {
  readonly sender: unknown;
}

export interface DesktopRemoteIpcWindow {
  readonly webContents: {
    send(channel: string, value: DesktopRemoteConnectionEvent): void;
  };
  isDestroyed(): boolean;
}

export interface InstallDesktopRemoteIpcOptions {
  readonly ipcMain: DesktopRemoteIpcMain;
  readonly profiles: RemoteConnectionProfileCatalog;
  readonly connections: RemoteCodingConnectionManager;
  readonly getWindow: () => DesktopRemoteIpcWindow | undefined;
}

export function installDesktopRemoteIpc(
  options: InstallDesktopRemoteIpcOptions,
): () => void {
  const connectionSubscriptions = new Map<string, () => void>();
  options.ipcMain.handle(DESKTOP_REMOTE_IPC.listProfiles, async (event) => {
    assertActiveRenderer(options.getWindow(), event.sender);
    try {
      return await options.profiles.list();
    } catch {
      throw new Error("Remote connection profiles are unavailable");
    }
  });
  options.ipcMain.handle(DESKTOP_REMOTE_IPC.connect, async (event, value) => {
    assertActiveRenderer(options.getWindow(), event.sender);
    const profileId = requireProfileId(value);
    try {
      const connection = await options.connections.connect(profileId);
      subscribeConnection(profileId, connection);
      return connectionStatus(profileId, connection.state);
    } catch {
      throw new Error("Remote Coding connection failed");
    }
  });
  options.ipcMain.handle(
    DESKTOP_REMOTE_IPC.reconnectEvents,
    async (event, value) => {
      assertActiveRenderer(options.getWindow(), event.sender);
      const profileId = requireProfileId(value);
      const connection = options.connections.get(profileId);
      if (connection === undefined) {
        throw new Error("Remote Coding connection is not open");
      }
      try {
        await connection.reconnectEvents();
        return connectionStatus(profileId, connection.state);
      } catch {
        throw new Error("Remote Coding event stream could not be restarted");
      }
    },
  );
  options.ipcMain.handle(
    DESKTOP_REMOTE_IPC.disconnect,
    async (event, value) => {
      assertActiveRenderer(options.getWindow(), event.sender);
      const profileId = requireProfileId(value);
      connectionSubscriptions.get(profileId)?.();
      connectionSubscriptions.delete(profileId);
      await options.connections.close(profileId);
    },
  );

  return () => {
    for (const unsubscribe of connectionSubscriptions.values()) unsubscribe();
    connectionSubscriptions.clear();
    options.ipcMain.removeHandler(DESKTOP_REMOTE_IPC.listProfiles);
    options.ipcMain.removeHandler(DESKTOP_REMOTE_IPC.connect);
    options.ipcMain.removeHandler(DESKTOP_REMOTE_IPC.reconnectEvents);
    options.ipcMain.removeHandler(DESKTOP_REMOTE_IPC.disconnect);
  };

  function subscribeConnection(
    profileId: string,
    connection: RemoteCodingConnection,
  ): void {
    if (connectionSubscriptions.has(profileId)) return;
    const unsubscribe = connection.subscribe((event) => {
      const owner = options.getWindow();
      if (owner === undefined || owner.isDestroyed()) return;
      owner.webContents.send(DESKTOP_REMOTE_IPC.event, {
        kind: "wanex.desktop.remote-connection.event",
        profileId,
        event,
      });
    });
    connectionSubscriptions.set(profileId, unsubscribe);
  }
}

function connectionStatus(
  profileId: string,
  state: DesktopRemoteConnectionStatus["state"],
): DesktopRemoteConnectionStatus {
  return {
    kind: "wanex.desktop.remote-connection.status",
    profileId,
    state,
  };
}

function requireProfileId(value: unknown): string {
  if (!isRemoteConnectionProfileId(value)) {
    throw new Error("Remote connection profile ID is invalid");
  }
  return value;
}

function assertActiveRenderer(
  owner: DesktopRemoteIpcWindow | undefined,
  sender: unknown,
): asserts owner is DesktopRemoteIpcWindow {
  if (
    owner === undefined ||
    owner.isDestroyed() ||
    sender !== owner.webContents
  ) {
    throw new Error(
      "Remote request did not originate from the active Desktop window",
    );
  }
}
