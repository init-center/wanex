const CONVERSATION_STATES = [
  "idle",
  "untracked",
  "missing",
  "rejected",
  "queued",
  "running",
  "waiting",
  "cancel_requested",
  "succeeded",
  "failed",
  "cancelled",
  "interrupted",
  "recovery_required",
] as const;

export function boundedAssistantHostDiagnostics(
  value: unknown,
): unknown | undefined {
  if (!isRecord(value)) return undefined;
  const observed = boundedProjection(value.observed);
  if (observed === undefined) return undefined;
  const refreshed = boundedProjection(value.refreshed);
  return {
    refreshState: boundedEnum(
      value.refreshState,
      ["succeeded", "failed", "timed_out"],
      "failed",
    ),
    observed,
    ...(refreshed === undefined ? {} : { refreshed }),
  };
}

function boundedProjection(value: unknown): unknown | undefined {
  if (!isRecord(value)) return undefined;
  const web = isRecord(value.web) ? value.web : value;
  const conversation = isRecord(web.conversation)
    ? web.conversation
    : undefined;
  if (conversation === undefined) return undefined;
  const operation = isRecord(conversation.operation)
    ? conversation.operation
    : undefined;
  const capabilities = isRecord(operation?.capabilities)
    ? operation.capabilities
    : undefined;
  const rows = Array.isArray(conversation.historyRows)
    ? conversation.historyRows
    : [];
  return {
    state: boundedEnum(
      conversation.state,
      CONVERSATION_STATES,
      "missing",
    ),
    sessionIdPresent: nonEmptyString(conversation.sessionId),
    operationIdPresent: nonEmptyString(conversation.operationId),
    operationTerminal: capabilities?.terminal === true,
    operationResultPresent: isRecord(operation?.result),
    canSubmit: conversation.canSubmit === true,
    historyRowCount: boundedCount(rows.length),
    userRowCount: boundedCount(rows.filter((row) =>
      isRecord(row) && row.role === "user"
    ).length),
    assistantRowCount: boundedCount(rows.filter((row) =>
      isRecord(row) && row.role === "assistant"
    ).length),
    transientAssistantPresent:
      nonEmptyString(conversation.transientAssistantText),
  };
}

function nonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.length > 0;
}

function boundedEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" && allowed.includes(value as T)
    ? value as T
    : fallback;
}

function boundedCount(value: unknown): number {
  return Number.isSafeInteger(value) && Number(value) >= 0
    ? Math.min(Number(value), 1_000_000)
    : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
