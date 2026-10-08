import { contextBridge, ipcRenderer } from "electron";
import {
  DESKTOP_SERVER_IPC,
  isDesktopServerProfileList,
  type DesktopServerRendererBridge,
} from "./server/bridge.js";
import { isDesktopServerProfile } from "./server/profile.js";
import {
  DESKTOP_ASSISTANT_IPC,
  createDesktopAssistantEventRelay,
  isDesktopAssistantActionResult,
  isDesktopAssistantAttachmentUploadRequest,
  isDesktopAssistantAttachmentUploadResult,
  isDesktopAssistantActivation,
  isDesktopAssistantEvent,
  isDesktopAssistantLocalActivation,
  isDesktopAssistantSnapshot,
  isDesktopAssistantState,
  isDesktopPreparedResourceDelivery,
  type DesktopAssistantRendererBridge,
} from "./assistant/bridge.js";

const serverBridge: DesktopServerRendererBridge = {
  listProfiles: async () => {
    const value = await ipcRenderer.invoke(DESKTOP_SERVER_IPC.listProfiles);
    if (!isDesktopServerProfileList(value)) {
      throw new Error("Server profile list is invalid");
    }
    return value;
  },
  saveProfile: async (input) => {
    const value = await ipcRenderer.invoke(
      DESKTOP_SERVER_IPC.saveProfile,
      input,
    );
    if (!isDesktopServerProfile(value)) {
      throw new Error("Server profile is invalid");
    }
    return value;
  },
  removeProfile: async (profileId) => {
    await ipcRenderer.invoke(DESKTOP_SERVER_IPC.removeProfile, profileId);
  },
};

contextBridge.exposeInMainWorld("wanexServer", Object.freeze(serverBridge));

const assistantEventRelay = createDesktopAssistantEventRelay();
const assistantBridge: DesktopAssistantRendererBridge = {
  readState: async () => {
    const value = await ipcRenderer.invoke(DESKTOP_ASSISTANT_IPC.readState);
    if (!isDesktopAssistantState(value)) {
      throw new Error("Assistant location state is invalid");
    }
    return value;
  },
  activateServer: async (request) => {
    const value = await ipcRenderer.invoke(
      DESKTOP_ASSISTANT_IPC.activateServer,
      request,
    );
    if (!isDesktopAssistantActivation(value)) {
      throw new Error("Assistant server activation is invalid");
    }
    return value;
  },
  activateLocal: async (request) => {
    const value = await ipcRenderer.invoke(
      DESKTOP_ASSISTANT_IPC.activateLocal,
      request,
    );
    if (!isDesktopAssistantLocalActivation(value)) {
      throw new Error("Assistant local activation is invalid");
    }
    return value;
  },
  readSnapshot: async (generation) => {
    const value = await ipcRenderer.invoke(
      DESKTOP_ASSISTANT_IPC.readSnapshot,
      generation,
    );
    if (!isDesktopAssistantSnapshot(value)) {
      throw new Error("Assistant snapshot is invalid");
    }
    return value;
  },
  dispatchAction: async (request) => {
    const value = await ipcRenderer.invoke(
      DESKTOP_ASSISTANT_IPC.dispatchAction,
      request,
    );
    if (!isDesktopAssistantActionResult(value)) {
      throw new Error("Assistant action result is invalid");
    }
    return value;
  },
  uploadAttachment: async (request) => {
    if (!isDesktopAssistantAttachmentUploadRequest(request)) {
      throw new Error("Assistant attachment upload request is invalid");
    }
    const value = await ipcRenderer.invoke(
      DESKTOP_ASSISTANT_IPC.uploadAttachment,
      request,
    );
    if (!isDesktopAssistantAttachmentUploadResult(value)) {
      throw new Error("Assistant attachment upload result is invalid");
    }
    return value;
  },
  prepareResourceDelivery: async (request) => {
    const value = await ipcRenderer.invoke(
      DESKTOP_ASSISTANT_IPC.prepareResourceDelivery,
      request,
    );
    if (!isDesktopPreparedResourceDelivery(value)) {
      throw new Error("Assistant Resource delivery is invalid");
    }
    return value;
  },
  releaseResourceDelivery: async (request) => {
    await ipcRenderer.invoke(
      DESKTOP_ASSISTANT_IPC.releaseResourceDelivery,
      request,
    );
  },
  subscribe(listener) {
    return assistantEventRelay.subscribe(listener);
  },
};

contextBridge.exposeInMainWorld("wanexAssistant", Object.freeze(assistantBridge));

ipcRenderer.on(
  DESKTOP_ASSISTANT_IPC.event,
  (_event: Electron.IpcRendererEvent, value: unknown) => {
    if (isDesktopAssistantEvent(value)) assistantEventRelay.publish(value);
  },
);
