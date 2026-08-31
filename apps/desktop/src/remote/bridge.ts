import type {
  RemoteCodingCanonicalReadReason,
  RemoteCodingConnectionEvent,
  RemoteCodingConnectionState,
} from "./connection.js";
import {
  isRemoteConnectionProfile,
  isRemoteConnectionProfileId,
  type RemoteConnectionProfile,
} from "./profile.js";

export const DESKTOP_REMOTE_IPC = Object.freeze({
  listProfiles: "wanex.desktop.remote.list-profiles",
  connect: "wanex.desktop.remote.connect",
  reconnectEvents: "wanex.desktop.remote.reconnect-events",
  disconnect: "wanex.desktop.remote.disconnect",
  event: "wanex.desktop.remote.event",
});

export interface DesktopRemoteConnectionStatus {
  readonly kind: "wanex.desktop.remote-connection.status";
  readonly profileId: string;
  readonly state: RemoteCodingConnectionState;
}

export interface DesktopRemoteConnectionEvent {
  readonly kind: "wanex.desktop.remote-connection.event";
  readonly profileId: string;
  readonly event: RemoteCodingConnectionEvent;
}

export interface DesktopRemoteRendererBridge {
  listProfiles(): Promise<readonly RemoteConnectionProfile[]>;
  connect(profileId: string): Promise<DesktopRemoteConnectionStatus>;
  reconnectEvents(profileId: string): Promise<DesktopRemoteConnectionStatus>;
  disconnect(profileId: string): Promise<void>;
  subscribe(
    listener: (event: DesktopRemoteConnectionEvent) => void,
  ): () => void;
}

export function isDesktopRemoteConnectionStatus(
  value: unknown,
): value is DesktopRemoteConnectionStatus {
  if (!isRecord(value)) return false;
  return (
    Object.keys(value).length === 3 &&
    value.kind === "wanex.desktop.remote-connection.status" &&
    isRemoteConnectionProfileId(value.profileId) &&
    isRemoteCodingConnectionState(value.state)
  );
}

export function isDesktopRemoteConnectionEvent(
  value: unknown,
): value is DesktopRemoteConnectionEvent {
  if (!isRecord(value)) return false;
  return (
    Object.keys(value).length === 3 &&
    value.kind === "wanex.desktop.remote-connection.event" &&
    isRemoteConnectionProfileId(value.profileId) &&
    isRemoteCodingConnectionEvent(value.event)
  );
}

export function isDesktopRemoteConnectionProfileList(
  value: unknown,
): value is readonly RemoteConnectionProfile[] {
  return Array.isArray(value) && value.every(isRemoteConnectionProfile);
}

function isRemoteCodingConnectionEvent(
  value: unknown,
): value is RemoteCodingConnectionEvent {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "state-changed") {
    return (
      Object.keys(value).length === 2 &&
      isRemoteCodingConnectionState(value.state)
    );
  }
  return (
    Object.keys(value).length === 2 &&
    value.kind === "canonical-read-required" &&
    isRemoteCodingCanonicalReadReason(value.reason)
  );
}

function isRemoteCodingConnectionState(
  value: unknown,
): value is RemoteCodingConnectionState {
  return (
    value === "disconnected" ||
    value === "connecting" ||
    value === "connected" ||
    value === "reconnecting" ||
    value === "unavailable" ||
    value === "closed"
  );
}

function isRemoteCodingCanonicalReadReason(
  value: unknown,
): value is RemoteCodingCanonicalReadReason {
  return (
    value === "gap" ||
    value === "overflow" ||
    value === "stream_replaced" ||
    value === "unavailable"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
