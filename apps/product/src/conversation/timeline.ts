import type { BackendSessionTranscriptPart } from "@wanex/product/backend";
import {
  TOOL_ACTIVITY_PRESENTATION_LIMITS,
  type ToolActivityEvidence,
  type ToolActivityPresentation,
  type ToolActivityPresentationDetail,
  type ToolExecutionState,
} from "@wanex/protocol";
import { conversationPartKey } from "./history-row.js";
import type {
  ConversationPresentationPart,
  ConversationToolState,
} from "./model.js";

interface ConversationTimelineSourceRow {
  readonly id: string;
  readonly turnId?: string;
  readonly parts: readonly BackendSessionTranscriptPart[];
}

interface CorrelatedToolCall {
  readonly name: string;
}

interface CorrelatedToolResult {
  readonly failed: boolean;
}

export function projectConversationTimelineParts(
  sessionId: string,
  rows: readonly ConversationTimelineSourceRow[],
): readonly (readonly ConversationPresentationPart[])[] {
  const calls = correlatedToolCalls(rows);
  const results = correlatedToolResults(rows);

  return rows.map((row) =>
    row.parts.flatMap<ConversationPresentationPart>((part, partIndex) => {
      const key = conversationPartKey(sessionId, row.id, partIndex);
      switch (part.type) {
        case "text":
          return [{ key, type: "text" as const, text: part.text }];
        case "reasoning":
          return part.hidden || part.text === undefined
            ? []
            : [{ key, type: "reasoning" as const, text: part.text }];
        case "tool_call": {
          const correlationKey = toolCorrelationKey(row, part.toolCallId);
          const result = results.get(correlationKey);
          const state = projectConversationToolState(
            part.executionState,
            result,
          );
          return [
            {
              key,
              type: "tool" as const,
              name: part.toolName,
              state,
              ...(part.activity === undefined
                ? {}
                : {
                    presentation: projectToolActivityPresentation(part.activity),
                  }),
            },
          ];
        }
        case "tool_result": {
          const correlationKey = toolCorrelationKey(row, part.toolCallId);
          if (calls.has(correlationKey)) {
            return [];
          }
          return [
            {
              key,
              type: "tool" as const,
              name: "Tool",
              state: part.isError
                ? ("failed" as const)
                : ("succeeded" as const),
            },
          ];
        }
        case "resource":
          return [
            {
              key,
              type: "resource" as const,
              resourceId: part.resourceId,
              sha256: part.sha256,
              sizeBytes: part.sizeBytes,
              kind: part.kind,
              ...(part.mediaType === undefined
                ? {}
                : { mediaType: part.mediaType }),
            },
          ];
        case "capability_request":
        case "hidden":
          return [];
      }
    }),
  );
}

function correlatedToolCalls(
  rows: readonly ConversationTimelineSourceRow[],
): ReadonlyMap<string, CorrelatedToolCall> {
  const calls = new Map<string, CorrelatedToolCall>();
  const ambiguous = new Set<string>();
  for (const row of rows) {
    for (const part of row.parts) {
      if (part.type !== "tool_call") continue;
      const key = toolCorrelationKey(row, part.toolCallId);
      const current = calls.get(key);
      if (current !== undefined && current.name !== part.toolName) {
        calls.delete(key);
        ambiguous.add(key);
      } else if (!ambiguous.has(key)) {
        calls.set(key, { name: part.toolName });
      }
    }
  }
  return calls;
}

function correlatedToolResults(
  rows: readonly ConversationTimelineSourceRow[],
): ReadonlyMap<string, CorrelatedToolResult> {
  const results = new Map<string, CorrelatedToolResult>();
  for (const row of rows) {
    for (const part of row.parts) {
      if (part.type !== "tool_result") continue;
      const key = toolCorrelationKey(row, part.toolCallId);
      const current = results.get(key);
      results.set(key, { failed: part.isError || current?.failed === true });
    }
  }
  return results;
}

function toolCorrelationKey(
  row: ConversationTimelineSourceRow,
  toolCallId: string,
): string {
  return `${row.turnId ?? `row:${row.id}`}\u0000${toolCallId}`;
}

function projectToolActivityPresentation(
  activity: ToolActivityEvidence,
): ToolActivityPresentation {
  const current = activity.result ?? activity.call;
  const details = activity.result === undefined
    ? (activity.call.details ?? [])
    : mergeToolActivityDetails(
        activity.call.details ?? [],
        activity.result.details ?? [],
      );
  return {
    summary: current.summary,
    ...(details.length === 0 ? {} : { details }),
  };
}

function mergeToolActivityDetails(
  call: readonly ToolActivityPresentationDetail[],
  result: readonly ToolActivityPresentationDetail[],
): readonly ToolActivityPresentationDetail[] {
  const merged = call.slice(0, TOOL_ACTIVITY_PRESENTATION_LIMITS.details);
  const positions = new Map(merged.map((detail, index) => [detail.label, index]));
  for (const detail of result) {
    const position = positions.get(detail.label);
    if (position !== undefined) {
      merged[position] = detail;
      continue;
    }
    if (merged.length === TOOL_ACTIVITY_PRESENTATION_LIMITS.details) continue;
    positions.set(detail.label, merged.length);
    merged.push(detail);
  }
  return merged;
}

function projectConversationToolState(
  executionState: ToolExecutionState | undefined,
  result: CorrelatedToolResult | undefined,
): ConversationToolState {
  if (executionState === undefined) {
    return result === undefined
      ? "running"
      : result.failed
        ? "failed"
        : "succeeded";
  }
  switch (executionState) {
    case "running":
      return "running";
    case "waiting":
    case "retry_ready":
    case "approved":
    case "approval_required":
      return "waiting";
    case "succeeded":
      return "succeeded";
    case "failed":
    case "denied":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "recovery_required":
      return "needs_attention";
  }
}
