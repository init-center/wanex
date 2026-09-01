import { contextBridge, ipcRenderer } from "electron";
import {
  DESKTOP_CODING_IPC,
  isDesktopCodingEvent,
  isDesktopCodingRemoteProjectList,
  isCodingCommandRequest,
  isDesktopCodingProjectSelection,
  type DesktopCodingRendererBridge,
} from "./coding-bridge.js";
import {
  DESKTOP_REMOTE_IPC,
  isDesktopRemoteConnectionEvent,
  isDesktopRemoteConnectionProfileList,
  isDesktopRemoteConnectionStatus,
  type DesktopRemoteRendererBridge,
} from "./remote/bridge.js";
import { isRemoteConnectionProfile } from "./remote/profile.js";

const bridge: DesktopCodingRendererBridge = {
  selectProject: async () => {
    const selection = await ipcRenderer.invoke(DESKTOP_CODING_IPC.selectProject);
    if (!isDesktopCodingProjectSelection(selection)) {
      throw new Error("Coding project selection is invalid");
    }
    return selection;
  },
  listRemoteProfiles: async () => {
    const value = await ipcRenderer.invoke(DESKTOP_CODING_IPC.listRemoteProfiles);
    if (!isDesktopRemoteConnectionProfileList(value)) {
      throw new Error("Remote Coding profile list is invalid");
    }
    return value;
  },
  listRemoteProjects: async (profileId) => {
    const value = await ipcRenderer.invoke(
      DESKTOP_CODING_IPC.listRemoteProjects,
      profileId,
    );
    if (!isDesktopCodingRemoteProjectList(value)) {
      throw new Error("Remote Coding project list is invalid");
    }
    return value;
  },
  selectRemoteProject: async (profileId, projectId) => {
    const selection = await ipcRenderer.invoke(
      DESKTOP_CODING_IPC.selectRemoteProject,
      { profileId, projectId },
    );
    if (!isDesktopCodingProjectSelection(selection)) {
      throw new Error("Remote Coding project selection is invalid");
    }
    return selection;
  },
  sendCodingCommand: async (request) => {
    if (!isCodingCommandRequest(request)) {
      throw new Error("Invalid Coding command request");
    }
    return await ipcRenderer.invoke(DESKTOP_CODING_IPC.sendCommand, request);
  },
  subscribeCodingEvents(listener) {
    const receive = (_event: Electron.IpcRendererEvent, value: unknown) => {
      if (!isDesktopCodingEvent(value)) return;
      try {
        listener(value);
      } catch {
        // One renderer subscriber cannot affect the main-process bridge.
      }
    };
    ipcRenderer.on(DESKTOP_CODING_IPC.event, receive);
    return () => ipcRenderer.removeListener(DESKTOP_CODING_IPC.event, receive);
  },
};

contextBridge.exposeInMainWorld("wanexCoding", Object.freeze(bridge));

const remoteBridge: DesktopRemoteRendererBridge = {
  listProfiles: async () => {
    const value = await ipcRenderer.invoke(DESKTOP_REMOTE_IPC.listProfiles);
    if (!isDesktopRemoteConnectionProfileList(value)) {
      throw new Error("Remote connection profile list is invalid");
    }
    return value;
  },
  saveProfile: async (input) => {
    const value = await ipcRenderer.invoke(
      DESKTOP_REMOTE_IPC.saveProfile,
      input,
    );
    if (!isRemoteConnectionProfile(value)) {
      throw new Error("Remote connection profile is invalid");
    }
    return value;
  },
  removeProfile: async (profileId) => {
    await ipcRenderer.invoke(DESKTOP_REMOTE_IPC.removeProfile, profileId);
  },
  connect: async (profileId) => {
    const value = await ipcRenderer.invoke(DESKTOP_REMOTE_IPC.connect, profileId);
    if (!isDesktopRemoteConnectionStatus(value)) {
      throw new Error("Remote connection status is invalid");
    }
    return value;
  },
  reconnectEvents: async (profileId) => {
    const value = await ipcRenderer.invoke(
      DESKTOP_REMOTE_IPC.reconnectEvents,
      profileId,
    );
    if (!isDesktopRemoteConnectionStatus(value)) {
      throw new Error("Remote connection status is invalid");
    }
    return value;
  },
  disconnect: async (profileId) => {
    await ipcRenderer.invoke(DESKTOP_REMOTE_IPC.disconnect, profileId);
  },
  subscribe(listener) {
    const receive = (_event: Electron.IpcRendererEvent, value: unknown) => {
      if (!isDesktopRemoteConnectionEvent(value)) return;
      try {
        listener(value);
      } catch {
        // One renderer subscriber cannot affect the main-process bridge.
      }
    };
    ipcRenderer.on(DESKTOP_REMOTE_IPC.event, receive);
    return () => ipcRenderer.removeListener(DESKTOP_REMOTE_IPC.event, receive);
  },
};

contextBridge.exposeInMainWorld("wanexRemote", Object.freeze(remoteBridge));
