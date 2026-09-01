import type {
  CodingCommandRequest,
  CodingEventEnvelope,
  CodingProjectReadModel,
} from "@wanex/coding";
import { isCodingEventEnvelope, isCodingProject } from "@wanex/coding";
import {
  isRemoteConnectionProfileId,
  type RemoteConnectionProfile,
} from "./remote/profile.js";

export { isCodingCommandRequest } from "@wanex/coding";

export const DESKTOP_CODING_IPC = Object.freeze({
  selectProject: "wanex.desktop.coding.select-project",
  listRemoteProfiles: "wanex.desktop.coding.list-remote-profiles",
  listRemoteProjects: "wanex.desktop.coding.list-remote-projects",
  selectRemoteProject: "wanex.desktop.coding.select-remote-project",
  sendCommand: "wanex.desktop.coding.send-command",
  event: "wanex.desktop.coding.event",
});

export interface DesktopCodingProjectCapabilities {
  readonly proposalApply: boolean;
}

export type DesktopCodingProjectLocation =
  | {
      readonly kind: "local";
    }
  | {
      readonly kind: "remote";
      readonly profileId: string;
    };

export type DesktopCodingProjectSelection =
  | {
      readonly kind: "selected";
      readonly project: CodingProjectReadModel;
      readonly location: DesktopCodingProjectLocation;
      readonly capabilities: DesktopCodingProjectCapabilities;
    }
  | {
      readonly kind: "cancelled";
    };

export interface DesktopCodingRemoteProjectList {
  readonly profileId: string;
  readonly projects: readonly CodingProjectReadModel[];
}

export interface DesktopCodingCanonicalReadRequired {
  readonly kind: "wanex.desktop.coding.canonical-read-required";
  readonly projectId: string;
}

export type DesktopCodingEvent =
  | CodingEventEnvelope
  | DesktopCodingCanonicalReadRequired;

export interface DesktopCodingRendererBridge {
  selectProject(): Promise<DesktopCodingProjectSelection>;
  listRemoteProfiles(): Promise<readonly RemoteConnectionProfile[]>;
  listRemoteProjects(profileId: string): Promise<DesktopCodingRemoteProjectList>;
  selectRemoteProject(
    profileId: string,
    projectId: string,
  ): Promise<DesktopCodingProjectSelection>;
  sendCodingCommand(request: CodingCommandRequest): Promise<unknown>;
  subscribeCodingEvents(
    listener: (event: DesktopCodingEvent) => void,
  ): () => void;
}

export function isDesktopCodingProjectSelection(
  value: unknown,
): value is DesktopCodingProjectSelection {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const selection = value as Record<string, unknown>;
  if (selection.kind === "cancelled") {
    return Object.keys(selection).length === 1;
  }
  return (
    selection.kind === "selected" &&
    Object.keys(selection).length === 4 &&
    isCodingProject(selection.project) &&
    isDesktopCodingProjectLocation(selection.location) &&
    isDesktopCodingProjectCapabilities(selection.capabilities)
  );
}

export function isDesktopCodingRemoteProjectList(
  value: unknown,
): value is DesktopCodingRemoteProjectList {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const list = value as Record<string, unknown>;
  return (
    Object.keys(list).length === 2 &&
    isRemoteConnectionProfileId(list.profileId) &&
    Array.isArray(list.projects) &&
    list.projects.length <= 100 &&
    list.projects.every(isCodingProject)
  );
}

export function isDesktopCodingEvent(value: unknown): value is DesktopCodingEvent {
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as { readonly kind?: unknown }).kind ===
      "wanex.desktop.coding.canonical-read-required"
  ) {
    const event = value as Record<string, unknown>;
    return (
      Object.keys(event).length === 2 &&
      typeof event.projectId === "string" &&
      event.projectId.length > 0 &&
      event.projectId.length <= 512
    );
  }
  return isCodingEventEnvelope(value);
}

function isDesktopCodingProjectLocation(
  value: unknown,
): value is DesktopCodingProjectLocation {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const location = value as Record<string, unknown>;
  if (location.kind === "local") {
    return Object.keys(location).length === 1;
  }
  return (
    location.kind === "remote" &&
    Object.keys(location).length === 2 &&
    typeof location.profileId === "string"
  );
}

function isDesktopCodingProjectCapabilities(
  value: unknown,
): value is DesktopCodingProjectCapabilities {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    typeof (value as { readonly proposalApply?: unknown }).proposalApply ===
      "boolean"
  );
}
