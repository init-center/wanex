import type { SurfaceEvent } from "@wanex/assistant/surface";
import type { ClientEvent } from "./contracts.js";

export function projectSurfaceEvent(
  event: SurfaceEvent,
): ClientEvent | undefined {
  if (event.type === "assistant.surface.conversation.assistant-text-delta") {
    const conversation = event.conversation;
    if (
      conversation?.kind !== "assistant.conversation.assistant-text-delta"
    ) {
      return { kind: "snapshot-invalidated" };
    }
    return {
      kind: "assistant-text-delta",
      operationId: conversation.operationId,
      sessionId: conversation.sessionId,
      text: conversation.text,
      sequence: event.sequence,
    };
  }
  if (event.type === "assistant.surface.conversation.operation-invalidated") {
    const conversation = event.conversation;
    return {
      kind: "snapshot-invalidated",
      ...(conversation?.kind !== "assistant.conversation.operation-invalidated"
        ? {}
        : {
            operationId: conversation.operationId,
            sessionId: conversation.sessionId,
          }),
    };
  }
  return invalidatesSnapshot(event.type)
    ? { kind: "snapshot-invalidated" }
    : undefined;
}

function invalidatesSnapshot(type: SurfaceEvent["type"]): boolean {
  return type === "assistant.surface.state_changed" ||
    type === "assistant.surface.command-catalog.invalidated" ||
    type === "assistant.surface.command-execution.invalidated" ||
    type === "assistant.surface.side-query.invalidated" ||
    type === "assistant.surface.plan.invalidated" ||
    type === "assistant.surface.goal.invalidated" ||
    type === "assistant.surface.team.invalidated" ||
    type === "assistant.surface.plugin-management.invalidated" ||
    type === "assistant.surface.schedule.invalidated";
}
