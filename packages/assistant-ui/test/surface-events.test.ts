import { describe, expect, it } from "vitest";
import type { SurfaceEvent } from "@wanex/assistant/surface";
import { projectSurfaceEvent } from "../src/client/surface-events.js";

describe("Assistant UI Surface event projection", () => {
  it("projects streamed assistant text without losing its canonical sequence", () => {
    expect(projectSurfaceEvent(event({
      type: "assistant.surface.conversation.assistant-text-delta",
      conversation: {
        kind: "assistant.conversation.assistant-text-delta",
        sequence: 7,
        at: 20,
        operationId: "operation_remote",
        sessionId: "session_remote",
        partId: "part_remote",
        text: "remote delta",
        truncated: false,
      },
    }))).toEqual({
      kind: "assistant-text-delta",
      operationId: "operation_remote",
      sessionId: "session_remote",
      text: "remote delta",
      sequence: 7,
    });
  });

  it("preserves operation identity on invalidation", () => {
    expect(projectSurfaceEvent(event({
      type: "assistant.surface.conversation.operation-invalidated",
      conversation: {
        kind: "assistant.conversation.operation-invalidated",
        sequence: 8,
        at: 21,
        operationId: "operation_remote",
        sessionId: "session_remote",
        cause: "execution_settled",
      },
    }))).toEqual({
      kind: "snapshot-invalidated",
      operationId: "operation_remote",
      sessionId: "session_remote",
    });
  });

  it.each([
    "assistant.surface.state_changed",
    "assistant.surface.command-catalog.invalidated",
    "assistant.surface.command-execution.invalidated",
    "assistant.surface.side-query.invalidated",
    "assistant.surface.plan.invalidated",
    "assistant.surface.goal.invalidated",
    "assistant.surface.team.invalidated",
    "assistant.surface.plugin-management.invalidated",
    "assistant.surface.schedule.invalidated",
  ] as const)("invalidates the snapshot for %s", (type) => {
    expect(projectSurfaceEvent(event({ type }))).toEqual({
      kind: "snapshot-invalidated",
    });
  });

  it("does not refresh for command acknowledgements", () => {
    expect(projectSurfaceEvent(event({
      type: "assistant.surface.command_completed",
    }))).toBeUndefined();
  });
});

function event(
  input: Pick<SurfaceEvent, "type"> & Partial<SurfaceEvent>,
): SurfaceEvent {
  return {
    id: "surface_event",
    sequence: 7,
    command: "status",
    at: 20,
    ...input,
  };
}
