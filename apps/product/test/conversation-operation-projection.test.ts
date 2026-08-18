import { describe, expect, it } from "vitest";
import type { BackendConversationOperationReadResult } from "../src/backend/index.js";
import { projectConversationOperation } from "../src/conversation/operation.js";

const reference = {
  sessionId: "ses_product_projection",
  inputId: "input_product_projection",
  turnId: "turn_product_projection",
  jobId: "job_product_projection",
} as const;

describe("Product conversation operation projection", () => {
  it("preserves ordered visible Parts while correlating and redacting Tool activity", () => {
    const source = foundOperation({
      state: "succeeded",
      transcript: {
        rows: [
          {
            id: "message:structured-assistant",
            kind: "message",
            role: "assistant",
            status: "completed",
            text: "# Result\nprivate reasoning\n[tool_call:search_database]",
            textTruncated: false,
            parts: [
              {
                partId: "trusted-heading-part",
                type: "text",
                visibility: "default",
                text: "# Result",
              },
              {
                partId: "trusted-reasoning-part",
                type: "reasoning",
                visibility: "default",
                text: "Checked the durable index.",
                hidden: false,
              },
              {
                partId: "trusted-hidden-part",
                type: "hidden",
                sourceType: "reasoning",
                visibility: "internal",
                hidden: true,
              },
              {
                partId: "trusted-tool-call-part",
                type: "tool_call",
                visibility: "default",
                toolCallId: "trusted-call-id",
                toolName: "search_database",
                executionState: "succeeded",
                activity: {
                  call: {
                    summary: "Search durable records",
                    details: [{ label: "Scope", value: "Current workspace" }],
                  },
                  result: {
                    summary: "Record found",
                    details: [{ label: "Matches", value: "1" }],
                  },
                },
              },
              {
                partId: "trusted-tail-part",
                type: "text",
                visibility: "default",
                text: "Found the record.",
              },
            ],
            createdAt: 10,
            updatedAt: 11,
            turnId: reference.turnId,
            attemptId: "trusted-attempt-id",
          },
          {
            id: "message:structured-tool",
            kind: "message",
            role: "tool",
            status: "completed",
            text: "[tool_result]\n[resource:structured-image]",
            textTruncated: false,
            parts: [
              {
                partId: "trusted-tool-result-part",
                type: "tool_result",
                visibility: "default",
                toolCallId: "trusted-call-id",
                isError: false,
              },
              {
                partId: "trusted-resource-part",
                type: "resource",
                visibility: "default",
                resourceId: "structured-image",
                sha256: "d".repeat(64),
                sizeBytes: 1_024,
                kind: "image",
                mediaType: "image/png",
              },
            ],
            createdAt: 12,
            updatedAt: 13,
            turnId: reference.turnId,
            attemptId: "trusted-attempt-id",
          },
        ],
        totalRows: 2,
        truncated: false,
      },
    });

    const projected = projectConversationOperation(source);

    expect(projected.operation.transcript.rows.map((row) => row.parts)).toEqual([
      [
        expect.objectContaining({ type: "text", text: "# Result" }),
        expect.objectContaining({
          type: "reasoning",
          text: "Checked the durable index.",
        }),
        expect.objectContaining({
          type: "tool",
          name: "search_database",
          state: "succeeded",
          presentation: {
            summary: "Record found",
            details: [
              { label: "Scope", value: "Current workspace" },
              { label: "Matches", value: "1" },
            ],
          },
        }),
        expect.objectContaining({ type: "text", text: "Found the record." }),
      ],
      [
        expect.objectContaining({
          type: "resource",
          resourceId: "structured-image",
          mediaType: "image/png",
        }),
      ],
    ]);
    const tool = projected.operation.transcript.rows[0]?.parts[2];
    expect(tool).toMatchObject({ type: "tool", state: "succeeded" });
    expect(tool).toHaveProperty("key", expect.stringMatching(/^product_conversation_part_/));
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain("trusted-call-id");
    expect(serialized).not.toContain("trusted-attempt-id");
    expect(serialized).not.toContain("trusted-heading-part");
    expect(serialized).not.toContain("trusted-hidden-part");
    expect(serialized).not.toContain("toolCallId");
    expect(serialized).not.toContain("partId");
  });

  it("omits a correlated Tool result row with no remaining visible content", () => {
    const source = foundOperation({
      state: "succeeded",
      transcript: {
        rows: [
          {
            id: "message:assistant-tool-call",
            kind: "message",
            role: "assistant",
            status: "completed",
            text: "[tool_call:read_file]",
            textTruncated: false,
            parts: [{
              partId: "tool-call",
              type: "tool_call",
              visibility: "default",
              toolCallId: "call-read-file",
              toolName: "read_file",
            }],
            createdAt: 10,
            updatedAt: 11,
            turnId: reference.turnId,
          },
          {
            id: "message:tool-result",
            kind: "message",
            role: "tool",
            status: "completed",
            text: "[tool_result]",
            textTruncated: false,
            parts: [{
              partId: "tool-result",
              type: "tool_result",
              visibility: "default",
              toolCallId: "call-read-file",
              isError: false,
            }],
            createdAt: 12,
            updatedAt: 13,
            turnId: reference.turnId,
          },
        ],
        totalRows: 2,
        truncated: false,
      },
    });

    const projected = projectConversationOperation(source);

    expect(projected.operation.transcript.rows).toHaveLength(1);
    expect(projected.operation.transcript.rows[0]?.parts).toEqual([
      expect.objectContaining({
        type: "tool",
        name: "read_file",
        state: "succeeded",
      }),
    ]);
  });

  it.each([
    ["running", "running"],
    ["waiting", "waiting"],
    ["retry_ready", "waiting"],
    ["approved", "waiting"],
    ["approval_required", "waiting"],
    ["succeeded", "succeeded"],
    ["failed", "failed"],
    ["denied", "failed"],
    ["cancelled", "cancelled"],
    ["recovery_required", "needs_attention"],
  ] as const)("maps durable Tool state %s to Product state %s", (
    executionState,
    expectedState,
  ) => {
    const source = foundOperation({
      state: executionState === "recovery_required" ? "recovery_required" : "running",
      transcript: {
        rows: [{
          id: `message:${executionState}`,
          kind: "message",
          role: "assistant",
          status: "completed",
          text: "[tool_call:test_tool]",
          textTruncated: false,
          parts: [{
            partId: `tool-call:${executionState}`,
            type: "tool_call",
            visibility: "default",
            toolCallId: "call-state",
            toolName: "test_tool",
            executionState,
          }],
          createdAt: 10,
          updatedAt: 11,
          turnId: reference.turnId,
        }],
        totalRows: 1,
        truncated: false,
      },
    });

    expect(projectConversationOperation(source).operation.transcript.rows[0]
      ?.parts[0]).toMatchObject({
        type: "tool",
        state: expectedState,
      });
  });

  it("keeps unmatched Tool failures visible without leaking their call identity", () => {
    const source = foundOperation({
      state: "failed",
      transcript: {
        rows: [
          {
            id: "message:orphan-tool-result",
            kind: "message",
            role: "tool",
            status: "failed",
            text: "[tool_result:error]",
            textTruncated: false,
            parts: [
              {
                partId: "trusted-orphan-result",
                type: "tool_result",
                visibility: "default",
                toolCallId: "trusted-orphan-call",
                isError: true,
              },
            ],
            createdAt: 10,
            updatedAt: 11,
            turnId: reference.turnId,
          },
        ],
        totalRows: 1,
        truncated: true,
      },
    });

    const projected = projectConversationOperation(source);

    expect(projected.operation.transcript.rows[0]?.parts).toEqual([
      expect.objectContaining({ type: "tool", name: "Tool", state: "failed" }),
    ]);
    expect(JSON.stringify(projected)).not.toContain("trusted-orphan-call");
  });

  it("preserves bounded App capacity evidence as a terminal recovery path", () => {
    const source = foundOperation({
      state: "failed",
      transcript: {
        rows: [
          {
            id: "message:capacity-user",
            kind: "message",
            role: "user",
            status: "failed",
            text: "keep this failed request visible",
            textTruncated: false,
            parts: [
              {
                partId: "capacity-user-text",
                type: "text",
                visibility: "user",
                text: "keep this failed request visible",
              },
            ],
            createdAt: 10,
            updatedAt: 11,
            inputId: reference.inputId,
            turnId: reference.turnId
          }
        ],
        totalRows: 1,
        truncated: false
      },
      error: {
        code: "conversation_context_capacity_exceeded",
        category: "capacity",
        message: "This request is larger than the selected model's context capacity.",
        modelEndpointId: "small-endpoint",
        capacity: {
          reasons: ["input_tokens_exceeded"],
          inputTokens: 901,
          inputTokenCeiling: 700,
          inputResources: 0,
          requestedOutputTokens: 100,
          compactionAttempted: true
        }
      }
    })

    const projected = projectConversationOperation(source)

    expect(projected.operation).toMatchObject({
      state: "failed",
      error: {
        code: "conversation_context_capacity_exceeded",
        category: "capacity",
        modelEndpointId: "small-endpoint",
        capacity: { inputTokens: 901, inputTokenCeiling: 700 }
      },
      capabilities: { terminal: true, regeneratable: true },
      transcript: {
        rows: [
          {
            role: "user",
            parts: [
              { type: "text", text: "keep this failed request visible" },
            ],
          },
        ]
      }
    })
  })

  it("projects waiting work and immutable generated Resource metadata", () => {
    const source = foundOperation({
      state: "waiting",
      transcript: {
        rows: [
          {
            id: "message:msg_generated_tool_result",
            kind: "message",
            role: "tool",
            status: "completed",
            text: "[tool_result]\n[resource:res_generated_image]",
            textTruncated: false,
            parts: [
              {
                partId: "tool_result:resource:0",
                type: "resource",
                visibility: "default",
                resourceId: "res_generated_image",
                sha256: "a".repeat(64),
                sizeBytes: 4_096,
                kind: "image",
                mediaType: "image/png",
              },
            ],
            createdAt: 12,
            updatedAt: 13,
            turnId: reference.turnId,
            attemptId: "attempt_suspended",
          },
        ],
        totalRows: 1,
        truncated: false,
      },
    });

    const projected = projectConversationOperation(source);

    expect(projected.operation).toMatchObject({
      state: "waiting",
      capabilities: {
        cancellable: true,
        regeneratable: false,
        terminal: false,
      },
      transcript: {
        rows: [
          {
            parts: [
              {
                type: "resource",
                resourceId: "res_generated_image",
                sha256: "a".repeat(64),
                sizeBytes: 4_096,
                kind: "image",
                mediaType: "image/png",
              },
            ],
          },
        ],
      },
    });
    expect(JSON.stringify(projected)).not.toContain("tool_result:resource:0");
    expect(JSON.stringify(projected)).not.toContain("attempt_suspended");
  });

  it("projects validated capability interactions without generic result JSON", () => {
    const source = foundOperation({
      state: "succeeded",
      transcript: {
        rows: [
          {
            id: "message:msg_capability_result",
            kind: "message",
            role: "tool",
            status: "completed",
            text: "[tool_result]",
            textTruncated: false,
            parts: [
              {
                partId: "tool-result",
                type: "tool_result",
                visibility: "default",
                toolCallId: "call_capability",
                isError: false,
              },
              {
                partId: "capability-interaction",
                type: "capability_request",
                visibility: "default",
                toolCallId: "call_capability",
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
                    reason: "image generation is not configured",
                  },
                ],
                setupRequired: true,
              },
            ],
            createdAt: 12,
            updatedAt: 13,
            turnId: reference.turnId,
            attemptId: "attempt_capability",
          },
        ],
        totalRows: 1,
        truncated: false,
      },
    });

    const projected = projectConversationOperation(source);

    expect(projected.operation.transcript.rows[0]).toMatchObject({
      capabilityRequests: [
        {
          kind: "product.capability-request",
          operation: "image.generate",
          setupRequired: true,
          requirements: [
            {
              status: "unconfigured",
              reason: "image generation is not configured",
            },
          ],
        },
      ],
    });
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain("tool-result");
    expect(serialized).not.toContain("attempt_capability");
    expect(serialized).not.toContain("toolCallId");
  });

  it("preserves suspended recovery evidence without offering deferred retry", () => {
    const source = foundOperation({
      state: "recovery_required",
      transcript: { rows: [], totalRows: 0, truncated: false },
      recovery: {
        items: [
          {
            executionId: "trusted_deferred_execution_id",
            recoveryRevision: 2,
            tool: {
              name: "image_generate",
              title: "Generate image",
              risk: "external",
              idempotent: true,
            },
            evidence: {
              message: "media outcome requires reconciliation",
              messageTruncated: false,
              reconciliationRef: "trusted_media_reconciliation_ref",
            },
            attemptCount: 1,
            attempts: [
              {
                attemptNumber: 1,
                state: "suspended",
                startedAt: 10,
                updatedAt: 11,
                finishedAt: 11,
              },
            ],
            attemptsTruncated: false,
            availableDecisions: [
              "confirm_succeeded",
              "confirm_failed",
              "abandon_turn",
            ],
          },
        ],
        truncated: false,
      },
    });

    const projected = projectConversationOperation(source);
    const item = projected.operation.recovery?.items[0];

    expect(item).toMatchObject({
      attempts: [{ state: "suspended" }],
      availableDecisions: [
        "confirm_succeeded",
        "confirm_failed",
        "abandon_turn",
      ],
    });
    expect(item?.availableDecisions).not.toContain("retry");
    expect(JSON.stringify(projected)).not.toContain(
      "trusted_deferred_execution_id",
    );
    expect(JSON.stringify(projected)).not.toContain(
      "trusted_media_reconciliation_ref",
    );
  });

  it("projects pending approvals with opaque identity and bounded presentation", () => {
    const source = foundOperation({
      state: "waiting",
      transcript: { rows: [], totalRows: 0, truncated: false },
      approvals: {
        items: [
          {
            executionId: "trusted_approval_execution_id",
            approvalRevision: 0,
            tool: {
              name: "external_publish",
              title: "Publish externally",
              risk: "external",
              idempotent: false,
            },
            presentation: {
              summary: "Publish the reviewed artifact?",
              summaryTruncated: false,
              details: [
                {
                  label: "Destination",
                  labelTruncated: false,
                  value: "Configured release service",
                  valueTruncated: false,
                },
              ],
              detailsTruncated: false,
            },
            attemptCount: 0,
            createdAt: 12,
            updatedAt: 13,
            availableDecisions: ["approve_once", "deny"],
          },
        ],
        truncated: false,
      },
    });

    const projected = projectConversationOperation(source);
    const item = projected.operation.approvals?.items[0];

    expect(item).toMatchObject({
      approvalRevision: 0,
      tool: { name: "external_publish", risk: "external", idempotent: false },
      presentation: {
        summary: "Publish the reviewed artifact?",
        details: [
          { label: "Destination", value: "Configured release service" },
        ],
      },
      attemptCount: 0,
      availableDecisions: ["approve_once", "deny"],
    });
    expect(item?.approvalId).toMatch(/^product_conversation_approval_/);
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain("trusted_approval_execution_id");
    expect(serialized).not.toContain("authorizationRef");
    expect(serialized).not.toContain("inputSchema");
  });
});

function foundOperation(
  operation: Pick<
    Extract<
      BackendConversationOperationReadResult,
      { readonly kind: "found" }
    >["operation"],
    "state" | "transcript"
  > &
    Partial<
      Pick<
        Extract<
          BackendConversationOperationReadResult,
          { readonly kind: "found" }
        >["operation"],
        "approvals" | "recovery" | "error"
      >
    >,
): Extract<
  BackendConversationOperationReadResult,
  { readonly kind: "found" }
> {
  return {
    kind: "found",
    reference,
    operation: {
      ...reference,
      state: operation.state,
      createdAt: 10,
      updatedAt: 13,
      transcript: operation.transcript,
      ...(operation.recovery === undefined
        ? {}
        : { recovery: operation.recovery }),
      ...(operation.approvals === undefined
        ? {}
        : { approvals: operation.approvals }),
      ...(operation.error === undefined ? {} : { error: operation.error }),
    },
  };
}
