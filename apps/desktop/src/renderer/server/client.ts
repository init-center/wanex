import type { DesktopServerRendererBridge } from "../../server/bridge.js";

export type ServerProfileClient = Pick<
  DesktopServerRendererBridge,
  "listProfiles" | "saveProfile" | "removeProfile"
>;
