import type {
  CodingCommandRequest,
  CodingEventEnvelope,
  CodingProjectReadModel,
} from "@wanex/coding";
import { isCodingProject } from "@wanex/coding";

export { isCodingCommandRequest } from "@wanex/coding";

export const DESKTOP_CODING_IPC = Object.freeze({
  selectProject: "wanex.desktop.coding.select-project",
  sendCommand: "wanex.desktop.coding.send-command",
  event: "wanex.desktop.coding.event",
});

export type DesktopCodingProjectSelection =
  | {
      readonly kind: "selected";
      readonly project: CodingProjectReadModel;
    }
  | {
      readonly kind: "cancelled";
    };

export interface DesktopCodingRendererBridge {
  selectProject(): Promise<DesktopCodingProjectSelection>;
  sendCodingCommand(request: CodingCommandRequest): Promise<unknown>;
  subscribeCodingEvents(
    listener: (event: CodingEventEnvelope) => void,
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
    Object.keys(selection).length === 2 &&
    isCodingProject(selection.project)
  );
}
