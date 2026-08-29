import type {
  CodingCommandRequest,
  CodingEventEnvelope,
} from "@wanex/coding";
import {
  isCodingCommandResponse,
  isCodingEventEnvelope,
  isCodingProject,
} from "@wanex/coding";
import {
  DESKTOP_CODING_IPC,
  isCodingCommandRequest,
  type DesktopCodingProjectSelection,
} from "./coding-bridge.js";
import type { DesktopCodingComposition } from "./coding.js";

export interface DesktopCodingIpcMain {
  handle(
    channel: string,
    listener: (event: DesktopCodingIpcEvent, value?: unknown) => Promise<unknown>,
  ): void;
  removeHandler(channel: string): void;
}

export interface DesktopCodingIpcEvent {
  readonly sender: unknown;
}

export interface DesktopCodingWindow {
  readonly webContents: DesktopCodingWebContents;
  isDestroyed(): boolean;
}

export interface DesktopCodingWebContents {
  send(channel: string, value: CodingEventEnvelope): void;
}

export interface InstallDesktopCodingIpcOptions {
  readonly ipcMain: DesktopCodingIpcMain;
  readonly composition: DesktopCodingComposition;
  readonly getWindow: () => DesktopCodingWindow | undefined;
  readonly selectProject: () => Promise<string | undefined>;
}

export function installDesktopCodingIpc(
  options: InstallDesktopCodingIpcOptions,
): () => void {
  options.ipcMain.handle(DESKTOP_CODING_IPC.selectProject, async (event) => {
    assertActiveRenderer(options.getWindow(), event.sender);
    const selected = await options.selectProject();
    if (selected === undefined) {
      return { kind: "cancelled" } satisfies DesktopCodingProjectSelection;
    }
    try {
      const project = await options.composition.openProject(selected);
      if (!isCodingProject(project)) {
        throw new Error("Coding project result is invalid");
      }
      return {
        kind: "selected",
        project,
      } satisfies DesktopCodingProjectSelection;
    } catch {
      throw new Error("Selected directory is not a supported Coding project");
    }
  });
  options.ipcMain.handle(DESKTOP_CODING_IPC.sendCommand, async (event, value) => {
    assertActiveRenderer(options.getWindow(), event.sender);
    if (!isCodingCommandRequest(value)) {
      throw new Error("Invalid Coding command request");
    }
    let response: unknown;
    try {
      response = await options.composition.send(value);
    } catch {
      throw new Error("Coding command failed");
    }
    if (!isCodingCommandResponse(response, value)) {
      throw new Error("Coding command response is invalid");
    }
    return response;
  });
  const unsubscribe = options.composition.subscribe((event) => {
    const owner = options.getWindow();
    if (owner === undefined || owner.isDestroyed()) return;
    if (!isCodingEventEnvelope(event)) return;
    owner.webContents.send(DESKTOP_CODING_IPC.event, event);
  });
  return () => {
    unsubscribe();
    options.ipcMain.removeHandler(DESKTOP_CODING_IPC.selectProject);
    options.ipcMain.removeHandler(DESKTOP_CODING_IPC.sendCommand);
  };
}

function assertActiveRenderer(
  owner: DesktopCodingWindow | undefined,
  sender: unknown,
): asserts owner is DesktopCodingWindow {
  if (owner === undefined || owner.isDestroyed() || sender !== owner.webContents) {
    throw new Error(
      "Coding request did not originate from the active Desktop window",
    );
  }
}
