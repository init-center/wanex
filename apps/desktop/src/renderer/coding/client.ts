import {
  createCodingClient,
} from "@wanex/coding";
import type {
  DesktopCodingRendererBridge,
} from "../../coding-bridge.js";
import type { CodingWorkbenchClient } from "./controller.js";

export type { CodingWorkbenchClient } from "./controller.js";

export function createDesktopRendererCodingClient(
  bridge: DesktopCodingRendererBridge,
): CodingWorkbenchClient {
  const client = createCodingClient({
    send: async (request) => await bridge.sendCodingCommand(request),
    subscribe: (listener) => bridge.subscribeCodingEvents(listener),
  });
  return Object.freeze({
    ...client,
    selectProject: () => bridge.selectProject(),
  });
}
