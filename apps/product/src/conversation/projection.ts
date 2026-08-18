import { createHash } from "node:crypto";
import type {
  BackendConversationOperationReadResult,
  BackendSessionTranscriptPart,
} from "@wanex/product/backend";
import type {
  CapabilityRequestInteraction,
  ConversationOperationFoundResult,
  TrustedConversationOperationReference,
} from "./model.js";
import { conversationHistoryRowId } from "./history-row.js";
import { projectConversationTimelineParts } from "./timeline.js";

const terminalStates = new Set([
  "succeeded",
  "failed",
  "cancelled",
  "interrupted",
]);
const cancellableStates = new Set(["queued", "running", "waiting"]);

export function projectConversationOperation(
  source: Extract<
    BackendConversationOperationReadResult,
    { readonly kind: "found" }
  >,
): ConversationOperationFoundResult {
  const operation = source.operation;
  const terminal = terminalStates.has(operation.state);
  const timelineParts = projectConversationTimelineParts(
    source.reference.sessionId,
    operation.transcript.rows,
  );
  const transcriptRows = operation.transcript.rows.flatMap((row, rowIndex) => {
    const parts = timelineParts[rowIndex] ?? [];
    const capabilityRequests = projectCapabilityRequests(row.parts);
    if (parts.length === 0 && capabilityRequests.length === 0) return [];
    return [{
      key: conversationHistoryRowId(source.reference.sessionId, row.id),
      kind: row.kind,
      role: row.role,
      status: row.status,
      parts,
      capabilityRequests,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }];
  });
  return {
    kind: "product.conversation-operation.found",
    operation: {
      kind: "product.conversation-operation",
      operationId: conversationOperationId(source.reference),
      sessionId: source.reference.sessionId,
      state: operation.state,
      createdAt: operation.createdAt,
      updatedAt: operation.updatedAt,
      ...(operation.finishedAt === undefined
        ? {}
        : { finishedAt: operation.finishedAt }),
      transcript: {
        rows: transcriptRows,
        totalRows: operation.transcript.totalRows,
        truncated: operation.transcript.truncated,
      },
      ...(operation.result === undefined ? {} : { result: operation.result }),
      ...(operation.error === undefined ? {} : { error: operation.error }),
      ...(operation.approvals === undefined
        ? {}
        : {
            approvals: {
              items: operation.approvals.items.map((item) => ({
                approvalId: conversationApprovalId(
                  source.reference,
                  item.executionId,
                ),
                approvalRevision: item.approvalRevision,
                tool: item.tool,
                presentation: item.presentation,
                attemptCount: item.attemptCount,
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
                availableDecisions: item.availableDecisions,
              })),
              truncated: operation.approvals.truncated,
            },
          }),
      ...(operation.recovery === undefined
        ? {}
        : {
            recovery: {
              items: operation.recovery.items.map((item) => ({
                recoveryId: conversationRecoveryId(
                  source.reference,
                  item.executionId,
                ),
                recoveryRevision: item.recoveryRevision,
                tool: item.tool,
                evidence: {
                  message: item.evidence.message,
                  messageTruncated: item.evidence.messageTruncated,
                  ...(item.evidence.reconciliationRef === undefined
                    ? {}
                    : {
                        reconciliationRef: stableOpaqueId(
                          "reconciliation",
                          source.reference,
                          `${item.executionId}:${item.evidence.reconciliationRef}`,
                        ),
                      }),
                },
                attemptCount: item.attemptCount,
                attempts: item.attempts,
                attemptsTruncated: item.attemptsTruncated,
                availableDecisions: item.availableDecisions,
              })),
              truncated: operation.recovery.truncated,
            },
          }),
      ...(operation.steering === undefined
        ? {}
        : {
            steering: {
              pending: operation.steering.pending.map((item) => {
                const text = projectSteeringText(item.content);
                return {
                  steeringId: conversationSteeringId(
                    source.reference,
                    item.controlId,
                  ),
                  text: text.value,
                  textTruncated: text.truncated,
                  createdAt: item.createdAt,
                  updatedAt: item.updatedAt,
                };
              }),
              truncated: operation.steering.truncated,
            },
          }),
      capabilities: {
        cancellable: cancellableStates.has(operation.state),
        regeneratable: terminal,
        steerable:
          operation.state === "running" &&
          operation.activeAttemptId !== undefined &&
          (operation.steering?.pending.length ?? 0) === 0,
        terminal,
      },
    },
  };
}

export function projectCapabilityRequests(
  parts: readonly BackendSessionTranscriptPart[],
): readonly CapabilityRequestInteraction[] {
  return parts.flatMap((part) =>
    part.type !== "capability_request"
      ? []
      : [
          {
            kind: "product.capability-request" as const,
            operation: part.operation,
            requirements: part.requirements,
            setupRequired: part.setupRequired,
          },
        ],
  );
}

export function conversationOperationId(
  reference: TrustedConversationOperationReference,
): string {
  return stableOpaqueId("operation", reference);
}

export function conversationRecoveryId(
  reference: TrustedConversationOperationReference,
  executionId: string,
): string {
  return stableOpaqueId("recovery", reference, executionId);
}

export function conversationApprovalId(
  reference: TrustedConversationOperationReference,
  executionId: string,
): string {
  return stableOpaqueId("approval", reference, executionId);
}

export function conversationSteeringId(
  reference: TrustedConversationOperationReference,
  controlId: string,
): string {
  return stableOpaqueId("steering", reference, controlId);
}

function stableOpaqueId(
  kind:
    | "operation"
    | "row"
    | "approval"
    | "recovery"
    | "reconciliation"
    | "steering",
  reference: TrustedConversationOperationReference,
  suffix = "",
): string {
  const digest = createHash("sha256")
    .update(
      [
        reference.sessionId,
        reference.inputId,
        reference.turnId,
        reference.jobId,
        suffix,
      ].join("\u0000"),
      "utf8",
    )
    .digest("hex")
    .slice(0, 24);
  return `product_conversation_${kind}_${digest}`;
}

function projectSteeringText(
  content: readonly { readonly type: string; readonly text?: string }[],
): { readonly value: string; readonly truncated: boolean } {
  const value = content
    .filter(
      (part): part is { readonly type: string; readonly text: string } =>
        part.type === "text" && typeof part.text === "string",
    )
    .map((part) => part.text)
    .join("\n");
  const maximum = 16_384;
  return value.length <= maximum
    ? { value, truncated: false }
    : { value: value.slice(0, maximum), truncated: true };
}
