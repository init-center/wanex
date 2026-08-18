import type {
  SchedulerJobRecord,
  SchedulerJobState,
  SessionInputRecord,
  SessionMessageRecord,
  SessionTurnControlRecord,
  SessionTurnRecord,
  SessionTurnState,
  ToolExecutionAttemptRecord,
  ToolExecutionRecord,
} from "@wanex/protocol";
import { projectWanexAppSessionTranscriptReadModel } from "./read-model.js";
import { projectWanexAppConversationOperationError } from "./conversation-operation-error.js";
import type {
  WanexAppConversationOperationFoundResult,
  WanexAppConversationOperationApprovalReview,
  WanexAppConversationOperationReference,
  WanexAppConversationOperationRecoveryReview,
  WanexAppConversationOperationSteeringReview,
  WanexAppConversationOperationState,
  WanexAppConversationOperationTranscript,
  WanexAppConversationOperationTranscriptRow,
} from "./types-conversation-operation.js";

const DEFAULT_TRANSCRIPT_LIMIT = 50;
const MAX_TRANSCRIPT_LIMIT = 200;
const MAX_TRANSCRIPT_ROW_TEXT_CHARS = 8_192;
const MAX_RESULT_TEXT_CHARS = 32_768;
const MAX_RECOVERY_ITEMS = 64;
const MAX_RECOVERY_ATTEMPTS = 8;
const MAX_RECOVERY_TEXT_CHARS = 4_096;
const MAX_RECOVERY_TITLE_CHARS = 200;
const MAX_APPROVAL_ITEMS = 16;
const MAX_APPROVAL_SUMMARY_CHARS = 512;
const MAX_APPROVAL_DETAILS = 16;
const MAX_APPROVAL_DETAIL_LABEL_CHARS = 128;
const MAX_APPROVAL_DETAIL_VALUE_CHARS = 1_024;
const MAX_PENDING_STEERING_ITEMS = 16;

export function matchesWanexAppConversationJob(
  job: SchedulerJobRecord | null,
  reference: WanexAppConversationOperationReference,
): job is SchedulerJobRecord {
  if (job === null || job.kind !== "session.turn") {
    return false;
  }
  const payload = job.payload as
    | Readonly<Record<string, unknown>>
    | readonly unknown[]
    | null;
  if (
    payload === null ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return false;
  }
  const record = payload as Readonly<Record<string, unknown>>;
  return (
    record.sessionId === reference.sessionId &&
    record.turnId === reference.turnId &&
    record.inputId === reference.inputId
  );
}

export function normalizeWanexAppConversationOperationState(
  state: SchedulerJobState,
  turnState?: SessionTurnState,
): WanexAppConversationOperationState {
  if (turnState !== undefined) {
    switch (turnState) {
      case "queued":
        return "queued";
      case "running":
      case "waiting":
      case "cancel_requested":
      case "succeeded":
      case "failed":
      case "cancelled":
      case "interrupted":
      case "recovery_required":
        return turnState;
    }
  }
  switch (state) {
    case "pending":
    case "ready":
    case "retry_scheduled":
      return "queued";
    case "running":
    case "waiting":
    case "succeeded":
    case "failed":
    case "cancelled":
      return state;
  }
}

export function projectWanexAppConversationOperation(request: {
  readonly job: SchedulerJobRecord;
  readonly turn: SessionTurnRecord;
  readonly reference: WanexAppConversationOperationReference;
  readonly input: SessionInputRecord;
  readonly messages: readonly SessionMessageRecord[];
  readonly transcriptLimit?: number;
  readonly recovery?: WanexAppConversationOperationRecoveryReview;
}): WanexAppConversationOperationFoundResult {
  const state = normalizeWanexAppConversationOperationState(
    request.job.state,
    request.turn.state,
  );
  const projectedRows = projectWanexAppSessionTranscriptReadModel(
    request.reference.sessionId,
    {
      inputs: [request.input],
      messages: request.messages,
      turns: [request.turn],
    },
  ).rows;
  return {
    kind: "found",
    reference: request.reference,
    operation: {
      ...request.reference,
      state,
      createdAt: request.job.createdAt,
      updatedAt: request.job.updatedAt,
      ...(request.job.finishedAt === undefined
        ? {}
        : { finishedAt: request.job.finishedAt }),
      ...(request.turn.currentAttemptId === undefined
        ? {}
        : { activeAttemptId: request.turn.currentAttemptId }),
      transcript: projectBoundedTranscript(
        projectedRows,
        normalizeTranscriptLimit(request.transcriptLimit),
        request.reference.inputId,
      ),
      ...(state === "succeeded"
        ? {
            result: projectOperationResult(
              projectedRows,
              request.messages.length,
            ),
          }
        : {}),
      ...(state === "failed"
        ? {
            error: projectWanexAppConversationOperationError(request.turn),
          }
        : {}),
      ...(state === "recovery_required"
        ? {
            error: {
              code: "conversation_operation_recovery_required",
              category: "runtime",
              message:
                "conversation operation requires recovery review; see app diagnostics for details",
            } as const,
            ...(request.recovery === undefined
              ? {}
              : { recovery: request.recovery }),
          }
        : {}),
    },
  };
}

export function projectWanexAppConversationOperationRecovery(request: {
  readonly turn: SessionTurnRecord;
  readonly executions: readonly {
    readonly execution: ToolExecutionRecord;
    readonly attempts: readonly ToolExecutionAttemptRecord[];
  }[];
}): WanexAppConversationOperationRecoveryReview {
  const bounded = request.executions.slice(0, MAX_RECOVERY_ITEMS);
  return {
    items: bounded.map(({ execution, attempts }) => {
      const descriptor = toolDescriptor(execution);
      const deferred = toolResultMode(execution) === "deferred";
      const evidence = truncateText(
        execution.recovery?.message ?? "Tool outcome could not be confirmed.",
        MAX_RECOVERY_TEXT_CHARS,
      );
      const boundedAttempts = attempts.slice(-MAX_RECOVERY_ATTEMPTS);
      const availableDecisions = [
        "confirm_succeeded",
        "confirm_failed",
        ...(!deferred &&
        descriptor.idempotent &&
        execution.attemptCount <
          request.turn.executionBinding.recovery.idempotentToolMaxAttempts
          ? ["retry" as const]
          : []),
        "abandon_turn",
      ] as const;
      return {
        executionId: execution.id,
        recoveryRevision: execution.recoveryRevision,
        tool: descriptor,
        evidence: {
          message: evidence.value,
          messageTruncated: evidence.truncated,
          ...(execution.recovery?.reconciliationRef === undefined
            ? {}
            : {
                reconciliationRef: truncateText(
                  execution.recovery.reconciliationRef,
                  MAX_RECOVERY_TEXT_CHARS,
                ).value,
              }),
        },
        attemptCount: execution.attemptCount,
        attempts: boundedAttempts.map((attempt) => ({
          attemptNumber: attempt.attemptNumber,
          state: attempt.state,
          startedAt: attempt.startedAt,
          updatedAt: attempt.updatedAt,
          ...(attempt.finishedAt === undefined
            ? {}
            : { finishedAt: attempt.finishedAt }),
        })),
        attemptsTruncated: attempts.length > boundedAttempts.length,
        availableDecisions,
      };
    }),
    truncated: request.executions.length > bounded.length,
  };
}

export function projectWanexAppConversationOperationApprovals(
  executions: readonly ToolExecutionRecord[],
): WanexAppConversationOperationApprovalReview {
  const bounded = executions.slice(0, MAX_APPROVAL_ITEMS);
  return {
    items: bounded.map((execution) => {
      if (execution.state !== "approval_required") {
        throw new Error("App approval projection requires a pending Tool execution");
      }
      const permission = jsonRecord(execution.permission);
      const presentation = jsonRecord(permission.presentation);
      if (permission.status !== "approval_required") {
        throw new Error("pending Tool execution has inconsistent permission evidence");
      }
      const summaryValue = requiredString(
        presentation.summary,
        "pending Tool approval summary",
      );
      const detailsValue = presentation.details;
      if (detailsValue !== undefined && !Array.isArray(detailsValue)) {
        throw new Error("pending Tool approval details are invalid");
      }
      const details = detailsValue ?? [];
      const boundedDetails = details.slice(0, MAX_APPROVAL_DETAILS);
      const summary = truncateText(
        summaryValue,
        MAX_APPROVAL_SUMMARY_CHARS,
      );
      return {
        executionId: execution.id,
        approvalRevision: execution.approvalRevision,
        tool: toolDescriptor(execution),
        presentation: {
          summary: summary.value,
          summaryTruncated: summary.truncated,
          details: boundedDetails.map((detail) => {
            const row = jsonRecord(detail);
            const label = truncateText(
              requiredString(row.label, "pending Tool approval detail label"),
              MAX_APPROVAL_DETAIL_LABEL_CHARS,
            );
            const value = truncateText(
              requiredString(row.value, "pending Tool approval detail value"),
              MAX_APPROVAL_DETAIL_VALUE_CHARS,
            );
            return {
              label: label.value,
              labelTruncated: label.truncated,
              value: value.value,
              valueTruncated: value.truncated,
            };
          }),
          detailsTruncated: details.length > boundedDetails.length,
        },
        attemptCount: execution.attemptCount,
        createdAt: execution.createdAt,
        updatedAt: execution.updatedAt,
        availableDecisions: ["approve_once", "deny"] as const,
      };
    }),
    truncated: executions.length > bounded.length,
  };
}

export function projectWanexAppConversationOperationSteering(
  controls: readonly SessionTurnControlRecord[],
): WanexAppConversationOperationSteeringReview {
  const pending = controls.filter(
    (control) => control.kind === "steer" && control.status === "pending",
  );
  const bounded = pending.slice(0, MAX_PENDING_STEERING_ITEMS);
  return {
    pending: bounded.map((control) => {
      if (control.content === undefined || control.content.length === 0) {
        throw new Error("pending steer control is missing content");
      }
      return {
        controlId: control.id,
        attemptId: control.attemptId,
        idempotencyKey: control.idempotencyKey,
        content: control.content,
        createdAt: control.createdAt,
        updatedAt: control.updatedAt,
      };
    }),
    truncated: pending.length > bounded.length,
  };
}

function toolResultMode(
  execution: ToolExecutionRecord,
): "immediate" | "deferred" | undefined {
  const descriptor = execution.descriptor;
  if (
    descriptor === null ||
    typeof descriptor !== "object" ||
    Array.isArray(descriptor)
  ) {
    return undefined;
  }
  const value = (descriptor as Readonly<Record<string, unknown>>).resultMode;
  return value === "immediate" || value === "deferred" ? value : undefined;
}

function toolDescriptor(
  execution: ToolExecutionRecord,
): WanexAppConversationOperationRecoveryReview["items"][number]["tool"] {
  const raw = execution.descriptor;
  const descriptor =
    raw !== null && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Readonly<Record<string, unknown>>)
      : {};
  const name = boundedNonEmptyString(descriptor.name, execution.toolName, 128);
  const annotations =
    descriptor.annotations !== null &&
    typeof descriptor.annotations === "object" &&
    !Array.isArray(descriptor.annotations)
      ? (descriptor.annotations as Readonly<Record<string, unknown>>)
      : {};
  const risk = descriptor.risk;
  return {
    name,
    title: boundedNonEmptyString(
      annotations.title,
      name,
      MAX_RECOVERY_TITLE_CHARS,
    ),
    risk:
      risk === "read_only" || risk === "mutating" || risk === "external"
        ? risk
        : "external",
    idempotent: descriptor.idempotent === true,
  };
}

function boundedNonEmptyString(
  value: unknown,
  fallback: string,
  maxChars: number,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return truncateText(fallback, maxChars).value;
  }
  return truncateText(value, maxChars).value;
}

export function projectWanexAppConversationOperationProgress(request: {
  readonly job: SchedulerJobRecord;
  readonly turn: SessionTurnRecord;
  readonly reference: WanexAppConversationOperationReference;
  readonly approvals?: WanexAppConversationOperationApprovalReview;
  readonly steering?: WanexAppConversationOperationSteeringReview;
}): WanexAppConversationOperationFoundResult {
  return {
    kind: "found",
    reference: request.reference,
    operation: {
      ...request.reference,
      state: normalizeWanexAppConversationOperationState(
        request.job.state,
        request.turn.state,
      ),
      createdAt: request.job.createdAt,
      updatedAt: request.job.updatedAt,
      ...(request.turn.currentAttemptId === undefined
        ? {}
        : { activeAttemptId: request.turn.currentAttemptId }),
      transcript: {
        rows: [],
        totalRows: 0,
        truncated: false,
      },
      ...(request.approvals === undefined
        ? {}
        : { approvals: request.approvals }),
      ...(request.steering === undefined
        ? {}
        : { steering: request.steering }),
    },
  };
}

function jsonRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("pending Tool approval evidence is invalid");
  }
  return value as Readonly<Record<string, unknown>>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function projectBoundedTranscript(
  projectedRows: ReturnType<
    typeof projectWanexAppSessionTranscriptReadModel
  >["rows"],
  limit: number,
  sourceInputId: string,
): WanexAppConversationOperationTranscript {
  const rows = projectedRows.map(projectBoundedTranscriptRow);
  const boundedRows = preserveSourceInput(rows, limit, sourceInputId);
  return {
    rows: boundedRows,
    totalRows: rows.length,
    truncated:
      rows.length > boundedRows.length || rows.some((row) => row.textTruncated),
  };
}

function preserveSourceInput(
  rows: readonly WanexAppConversationOperationTranscriptRow[],
  limit: number,
  sourceInputId: string,
): readonly WanexAppConversationOperationTranscriptRow[] {
  if (rows.length <= limit) {
    return rows;
  }
  const sourceInput = rows.find(
    (row) => row.role === "user" && row.inputId === sourceInputId,
  );
  if (sourceInput === undefined) {
    return rows.slice(-limit);
  }
  if (limit === 1) {
    return [sourceInput];
  }
  return [
    sourceInput,
    ...rows.filter((row) => row.id !== sourceInput.id).slice(-(limit - 1)),
  ];
}

function projectBoundedTranscriptRow(
  row: ReturnType<
    typeof projectWanexAppSessionTranscriptReadModel
  >["rows"][number],
): WanexAppConversationOperationTranscriptRow {
  const text = truncateText(row.text, MAX_TRANSCRIPT_ROW_TEXT_CHARS);
  return {
    id: row.id,
    kind: row.kind,
    role: row.role,
    status: row.status,
    text: text.value,
    textTruncated: text.truncated,
    parts: row.parts,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.inputId === undefined ? {} : { inputId: row.inputId }),
    ...(row.turnId === undefined ? {} : { turnId: row.turnId }),
    ...(row.regeneratesTurnId === undefined
      ? {}
      : { regeneratesTurnId: row.regeneratesTurnId }),
    ...(row.attemptId === undefined ? {} : { attemptId: row.attemptId }),
  };
}

function projectOperationResult(
  rows: ReturnType<typeof projectWanexAppSessionTranscriptReadModel>["rows"],
  messageCount: number,
) {
  const source = rows
    .filter((row) => row.kind === "message" && row.role === "assistant")
    .map((row) => row.text)
    .join("\n");
  const assistantText = truncateText(source, MAX_RESULT_TEXT_CHARS);
  return {
    assistantText: assistantText.value,
    assistantTextTruncated: assistantText.truncated,
    messageCount,
  };
}

function normalizeTranscriptLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_TRANSCRIPT_LIMIT;
  }
  if (!Number.isInteger(limit) || limit <= 0 || limit > MAX_TRANSCRIPT_LIMIT) {
    throw new Error(
      `conversation operation transcriptLimit must be an integer between 1 and ${MAX_TRANSCRIPT_LIMIT}`,
    );
  }
  return limit;
}

function truncateText(
  value: string,
  maxChars: number,
): { readonly value: string; readonly truncated: boolean } {
  if (value.length <= maxChars) {
    return { value, truncated: false };
  }
  return {
    value: value.slice(0, maxChars),
    truncated: true,
  };
}
