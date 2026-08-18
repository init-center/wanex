import { describe, expect, it } from "vitest";
import type {
  SessionMessageRecord,
  SessionTurnRecord,
  ToolActivityRecord,
} from "@wanex/protocol";
import { jsonToolResultContent, toolResultPart } from "@wanex/runtime/tools";
import { projectWanexAppSessionTranscriptReadModel } from "../src/internal-index.js";

const capabilityEvidence = {
  kind: "capability.request",
  operation: "image.generate",
  requirements: [
    {
      requirement: {
        operation: "image.generate",
        inputModalities: ["text"],
        outputModalities: ["image"],
        features: [],
      },
      status: "unconfigured",
      reason: "no model endpoint satisfies image.generate",
      candidateModelEndpointIds: [],
      candidateModelEndpointIdsTruncated: false,
    },
  ],
} as const;

describe("Wanex App transcript projection", () => {
  it("projects only a validated bounded capability interaction", () => {
    const transcript = projectWanexAppSessionTranscriptReadModel("session", {
      inputs: [],
      messages: [
        message({
          id: "assistant-call",
          sequence: 1,
          turnId: "turn-a",
          role: "assistant",
          content: [
            {
              id: "capability-call",
              type: "tool_call",
              toolCallId: "call-1",
              toolName: "capability_request",
              input: { operation: "image.generate" },
            },
          ],
        }),
        message({
          id: "tool-result",
          sequence: 2,
          turnId: "turn-a",
          role: "tool",
          content: [
            toolResultPart(
              "call-1",
              jsonToolResultContent(capabilityEvidence),
              false,
            ),
          ],
        }),
      ],
    });

    expect(transcript.rows[1]?.parts).toEqual([
      expect.objectContaining({
        type: "tool_result",
        toolCallId: "call-1",
        isError: false,
      }),
      {
        partId: expect.stringMatching(/:capability-request$/),
        type: "capability_request",
        visibility: "default",
        toolCallId: "call-1",
        operation: "image.generate",
        requirements: [
          {
            requirement: {
              operation: "image.generate",
              inputModalities: ["text"],
              outputModalities: ["image"],
              features: [],
            },
            status: "unconfigured",
            reason: "no model endpoint satisfies image.generate",
          },
        ],
        setupRequired: true,
      },
    ]);
    const serialized = JSON.stringify(transcript);
    expect(serialized).not.toContain("candidateModelEndpointIds");
    expect(serialized).not.toContain("secretRef");
  });

  it("fails closed for a cross-turn call ID match and malformed evidence", () => {
    const malformed = {
      ...capabilityEvidence,
      requirements: [
        {
          ...capabilityEvidence.requirements[0],
          status: "unknown",
        },
      ],
    };
    const transcript = projectWanexAppSessionTranscriptReadModel("session", {
      inputs: [],
      messages: [
        message({
          id: "assistant-call",
          sequence: 1,
          turnId: "turn-a",
          role: "assistant",
          content: [
            {
              id: "capability-call",
              type: "tool_call",
              toolCallId: "call-reused",
              toolName: "capability_request",
              input: { operation: "image.generate" },
            },
          ],
        }),
        message({
          id: "cross-turn-result",
          sequence: 2,
          turnId: "turn-b",
          role: "tool",
          content: [
            toolResultPart(
              "call-reused",
              jsonToolResultContent(capabilityEvidence),
              false,
            ),
          ],
        }),
        message({
          id: "malformed-result",
          sequence: 3,
          turnId: "turn-a",
          role: "tool",
          content: [
            toolResultPart(
              "call-reused",
              jsonToolResultContent(malformed as never),
              false,
            ),
          ],
        }),
      ],
    });

    expect(
      transcript.rows
        .flatMap((row) => row.parts)
        .filter((part) => part.type === "capability_request"),
    ).toEqual([]);
  });

  it("projects the existing regeneration relation on the repeated user row", () => {
    const transcript = projectWanexAppSessionTranscriptReadModel("session", {
      inputs: [],
      messages: [
        message({
          id: "regenerated-user",
          sequence: 3,
          turnId: "turn-new",
          role: "user",
          content: [{ id: "text", type: "text", text: "same request" }],
        }),
      ],
      turns: [
        {
          id: "turn-new",
          regeneratesTurnId: "turn-source",
        } as SessionTurnRecord,
      ],
    });

    expect(transcript.rows[0]).toMatchObject({
      role: "user",
      turnId: "turn-new",
      regeneratesTurnId: "turn-source",
    });
  });

  it("joins only safe Tool activity evidence to its exact source call", () => {
    const transcript = projectWanexAppSessionTranscriptReadModel("session", {
      inputs: [],
      messages: [
        message({
          id: "assistant-call",
          sequence: 1,
          turnId: "turn-a",
          role: "assistant",
          content: [{
            id: "tool-call",
            type: "tool_call",
            toolCallId: "call-1",
            toolName: "workspace_read",
            input: { path: "/private/raw-input" },
          }],
        }),
        message({
          id: "other-assistant-call",
          sequence: 2,
          turnId: "turn-a",
          role: "assistant",
          content: [{
            id: "other-tool-call",
            type: "tool_call",
            toolCallId: "call-1",
            toolName: "workspace_read",
            input: { path: "/private/other-input" },
          }],
        }),
      ],
      toolActivities: [{
        sessionId: "session",
        turnId: "turn-a",
        sourceMessageId: "assistant-call",
        toolCallId: "call-1",
        toolName: "workspace_read",
        state: "succeeded",
        activity: {
          call: {
            summary: "Read project file",
            details: [{ label: "Path", value: "src/main.ts" }],
          },
          result: { summary: "File read" },
        },
        updatedAt: 3,
      }],
    });

    expect(transcript.rows[0]?.parts[0]).toMatchObject({
      type: "tool_call",
      executionState: "succeeded",
      activity: {
        call: { summary: "Read project file" },
        result: { summary: "File read" },
      },
    });
    expect(transcript.rows[1]?.parts[0]).not.toHaveProperty("executionState");
    expect(transcript.rows[1]?.parts[0]).not.toHaveProperty("activity");
    const serialized = JSON.stringify(transcript);
    expect(serialized).not.toContain("raw-input");
    expect(serialized).not.toContain("executionId");
    expect(serialized).not.toContain("permission");
  });

  it("retains exact Tool execution state without presentation evidence", () => {
    const transcript = projectWanexAppSessionTranscriptReadModel("session", {
      inputs: [],
      messages: [message({
        id: "assistant-call",
        sequence: 1,
        turnId: "turn-a",
        role: "assistant",
        content: [{
          id: "tool-call",
          type: "tool_call",
          toolCallId: "call-1",
          toolName: "third_party_tool",
          input: { secret: "not projected" },
        }],
      })],
      toolActivities: [{
        sessionId: "session",
        turnId: "turn-a",
        sourceMessageId: "assistant-call",
        toolCallId: "call-1",
        toolName: "third_party_tool",
        state: "recovery_required",
        updatedAt: 3,
      }],
    });

    expect(transcript.rows[0]?.parts[0]).toEqual(expect.objectContaining({
      type: "tool_call",
      toolName: "third_party_tool",
      executionState: "recovery_required",
    }));
    expect(transcript.rows[0]?.parts[0]).not.toHaveProperty("activity");
    expect(JSON.stringify(transcript)).not.toContain("not projected");
  });

  it("projects bounded failure presentation without lower raw error data", () => {
    const unsafeRecord: ToolActivityRecord & {
      readonly error: { readonly message: string };
    } = {
      sessionId: "session",
      turnId: "turn-a",
      sourceMessageId: "assistant-call",
      toolCallId: "call-1",
      toolName: "workspace_read",
      state: "failed",
      activity: {
        call: { summary: "Read workspace file" },
        result: {
          summary: "Workspace file read failed",
          details: [{ label: "Path", value: "src/main.ts" }],
        },
      },
      error: { message: "private absolute path and remote response" },
      updatedAt: 3,
    };
    const transcript = projectWanexAppSessionTranscriptReadModel("session", {
      inputs: [],
      messages: [message({
        id: "assistant-call",
        sequence: 1,
        turnId: "turn-a",
        role: "assistant",
        content: [{
          id: "tool-call",
          type: "tool_call",
          toolCallId: "call-1",
          toolName: "workspace_read",
          input: { secret: "private input" },
        }],
      })],
      toolActivities: [unsafeRecord],
    });

    expect(transcript.rows[0]?.parts[0]).toMatchObject({
      type: "tool_call",
      executionState: "failed",
      activity: {
        result: {
          summary: "Workspace file read failed",
          details: [{ label: "Path", value: "src/main.ts" }],
        },
      },
    });
    const serialized = JSON.stringify(transcript);
    expect(serialized).not.toContain("private absolute path");
    expect(serialized).not.toContain("private input");
    expect(serialized).not.toContain('"error"');
  });
});

function message(options: {
  readonly id: string;
  readonly sequence: number;
  readonly turnId: string;
  readonly role: SessionMessageRecord["role"];
  readonly content: SessionMessageRecord["content"];
}): SessionMessageRecord {
  return {
    ...options,
    sessionId: "session",
    status: "completed",
    executionBindingDigest: "binding",
    createdAt: options.sequence,
    updatedAt: options.sequence,
  };
}
