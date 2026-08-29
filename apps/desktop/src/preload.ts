import { contextBridge, ipcRenderer } from "electron";
import { isCodingEventEnvelope } from "@wanex/coding";
import {
  DESKTOP_CODING_IPC,
  isCodingCommandRequest,
  isDesktopCodingProjectSelection,
  type DesktopCodingRendererBridge,
} from "./coding-bridge.js";
import type { CodingEventEnvelope } from "@wanex/coding";

const bridge: DesktopCodingRendererBridge = {
  selectProject: async () => {
    const selection = await ipcRenderer.invoke(DESKTOP_CODING_IPC.selectProject);
    if (!isDesktopCodingProjectSelection(selection)) {
      throw new Error("Coding project selection is invalid");
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
      if (!isCodingEventEnvelope(value)) return;
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
