import {
  isDesktopServerProfile,
  type DesktopServerProfile,
  type SaveDesktopServerProfileInput,
} from "./profile.js";

export const DESKTOP_SERVER_IPC = Object.freeze({
  listProfiles: "wanex.desktop.server.list-profiles",
  saveProfile: "wanex.desktop.server.save-profile",
  removeProfile: "wanex.desktop.server.remove-profile",
});

export interface DesktopServerRendererBridge {
  listProfiles(): Promise<readonly DesktopServerProfile[]>;
  saveProfile(input: SaveDesktopServerProfileInput): Promise<DesktopServerProfile>;
  removeProfile(profileId: string): Promise<void>;
}

export function isDesktopServerProfileList(
  value: unknown,
): value is readonly DesktopServerProfile[] {
  return Array.isArray(value) && value.every(isDesktopServerProfile);
}
