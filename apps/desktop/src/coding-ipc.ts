import { isCodingCommandResponse } from "@wanex/coding";
import {
  DESKTOP_CODING_IPC,
  isDesktopCodingEvent,
  isCodingCommandRequest,
  isDesktopCodingProjectSelection,
  type DesktopCodingProjectSelection,
} from "./coding-bridge.js";
import type { DesktopCodingEvent } from "./coding-bridge.js";
import type { DesktopCodingRouter } from "./coding/router.js";
import {
  isRemoteConnectionProfile,
  isRemoteConnectionProfileId,
} from "./remote/profile.js";

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
  send(channel: string, value: DesktopCodingEvent): void;
}

export interface InstallDesktopCodingIpcOptions {
  readonly ipcMain: DesktopCodingIpcMain;
  readonly router: DesktopCodingRouter;
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
      const result = await options.router.openLocalProject(selected);
      if (!isDesktopCodingProjectSelection(result) || result.kind !== "selected") {
        throw new Error("Coding project result is invalid");
      }
      return result;
    } catch (error) {
      proofDiagnostic("open-local-project", error);
      throw new Error("Selected directory is not a supported Coding project");
    }
  });
  options.ipcMain.handle(
    DESKTOP_CODING_IPC.listRemoteProfiles,
    async (event) => {
      assertActiveRenderer(options.getWindow(), event.sender);
      try {
        const profiles = await options.router.listRemoteProfiles();
        if (!profiles.every(isRemoteConnectionProfile)) {
          throw new Error("Remote Coding profiles are invalid");
        }
        return profiles;
      } catch {
        throw new Error("Remote Coding profiles are unavailable");
      }
    },
  );
  options.ipcMain.handle(
    DESKTOP_CODING_IPC.listRemoteProjects,
    async (event, value) => {
      assertActiveRenderer(options.getWindow(), event.sender);
      const profileId = requireRemoteProfileId(value);
      try {
        return await options.router.listRemoteProjects(profileId);
      } catch {
        throw new Error("Remote Coding projects are unavailable");
      }
    },
  );
  options.ipcMain.handle(
    DESKTOP_CODING_IPC.selectRemoteProject,
    async (event, value) => {
      assertActiveRenderer(options.getWindow(), event.sender);
      const selection = requireRemoteProjectSelection(value);
      try {
        const result = await options.router.openRemoteProject(
          selection.profileId,
          selection.projectId,
        );
        if (!isDesktopCodingProjectSelection(result) || result.kind !== "selected") {
          throw new Error("Remote Coding project result is invalid");
        }
        return result;
      } catch {
        throw new Error("Remote Coding project is unavailable");
      }
    },
  );
  options.ipcMain.handle(DESKTOP_CODING_IPC.sendCommand, async (event, value) => {
    assertActiveRenderer(options.getWindow(), event.sender);
    if (!isCodingCommandRequest(value)) {
      throw new Error("Invalid Coding command request");
    }
    let response: unknown;
    try {
      response = await options.router.send(value);
    } catch (error) {
      proofDiagnostic("send-command", error);
      throw new Error("Coding command failed");
    }
    if (!isCodingCommandResponse(response, value)) {
      throw new Error("Coding command response is invalid");
    }
    proofDiagnostic(
      `send-command:${value.command}:${response.ok ? "ok" : "rejected"}`,
    );
    return response;
  });
  const unsubscribe = options.router.subscribe((event) => {
    const owner = options.getWindow();
    if (owner === undefined || owner.isDestroyed()) return;
    if (!isDesktopCodingEvent(event)) return;
    owner.webContents.send(DESKTOP_CODING_IPC.event, event);
  });
  return () => {
    unsubscribe();
    options.ipcMain.removeHandler(DESKTOP_CODING_IPC.selectProject);
    options.ipcMain.removeHandler(DESKTOP_CODING_IPC.listRemoteProfiles);
    options.ipcMain.removeHandler(DESKTOP_CODING_IPC.listRemoteProjects);
    options.ipcMain.removeHandler(DESKTOP_CODING_IPC.selectRemoteProject);
    options.ipcMain.removeHandler(DESKTOP_CODING_IPC.sendCommand);
  };
}

function proofDiagnostic(operation: string, error?: unknown): void {
  if (process.env.WANEX_DESKTOP_PROOF_RECEIPT === undefined) return;
  if (error === undefined) {
    console.error(`[wanex-desktop-proof] ${operation}`);
    return;
  }
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`[wanex-desktop-proof] ${operation}: ${detail}`);
}

function requireRemoteProfileId(value: unknown): string {
  if (!isRemoteConnectionProfileId(value)) {
    throw new Error("Remote Coding profile ID is invalid");
  }
  return value;
}

function requireRemoteProjectSelection(value: unknown): {
  readonly profileId: string;
  readonly projectId: string;
} {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== 2
  ) {
    throw new Error("Remote Coding project selection is invalid");
  }
  const selection = value as Record<string, unknown>;
  const profileId = requireRemoteProfileId(selection.profileId);
  if (
    typeof selection.projectId !== "string" ||
    selection.projectId.length === 0 ||
    selection.projectId.length > 512
  ) {
    throw new Error("Remote Coding project ID is invalid");
  }
  return { profileId, projectId: selection.projectId };
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
