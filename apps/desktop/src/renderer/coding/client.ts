import {
  createCodingClient,
} from "@wanex/coding";
import type {
  DesktopCodingRendererBridge,
  DesktopCodingCanonicalReadRequired,
} from "../../coding-bridge.js";
import type { CodingWorkbenchClient } from "./controller.js";

export type { CodingWorkbenchClient } from "./controller.js";

export function createDesktopRendererCodingClient(
  bridge: DesktopCodingRendererBridge,
): CodingWorkbenchClient {
  const client = createCodingClient({
    send: async (request) => await bridge.sendCodingCommand(request),
    subscribe: (listener) => bridge.subscribeCodingEvents((event) => {
      if (isCanonicalReadRequired(event)) return;
      listener(event);
    }),
  });
  const subscribeCanonicalReads = (
    listener: (event: DesktopCodingCanonicalReadRequired) => void,
  ): (() => void) => bridge.subscribeCodingEvents((event) => {
    if (!isCanonicalReadRequired(event)) return;
    listener(event);
  });
  return Object.freeze({
    ...client,
    selectProject: () => bridge.selectProject(),
    listRemoteProfiles: () => bridge.listRemoteProfiles(),
    listRemoteProjects: (profileId) => bridge.listRemoteProjects(profileId),
    selectRemoteProject: (profileId, projectId) =>
      bridge.selectRemoteProject(profileId, projectId),
    subscribeCanonicalReads,
  });
}

function isCanonicalReadRequired(
  event: Parameters<DesktopCodingRendererBridge["subscribeCodingEvents"]>[0] extends (
    event: infer E,
  ) => void
    ? E
    : never,
): event is DesktopCodingCanonicalReadRequired {
  return event.kind === "wanex.desktop.coding.canonical-read-required";
}
