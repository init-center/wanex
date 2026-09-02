const ALLOWED_FAILURE_SIGNALS = new Set([
  "cancelled", "conflict", "eacces", "eexist", "enoent", "eperm", "git",
  "invalid_argument", "lease", "path", "pipe", "process", "provider",
  "rename", "rpc", "spawn", "sqlite", "storage", "timeout", "tool",
  "transaction", "worktree",
]);

export function boundedCodingHostDiagnostics(value: unknown): unknown | undefined {
  if (!isRecord(value)) return undefined;
  return {
    state: boundedEnum(
      value.state,
      ["open", "closing", "closed", "diagnostic_failed"],
      "diagnostic_failed",
    ),
    repositories: Array.isArray(value.repositories)
      ? value.repositories.slice(0, 8).map(boundedRepository)
      : [],
  };
}

function boundedRepository(value: unknown): unknown {
  if (!isRecord(value)) {
    return { repositoryId: "unknown", state: "closed", activeTurns: [] };
  }
  return {
    repositoryId: boundedIdentifier(value.repositoryId, "unknown"),
    state: boundedEnum(value.state, ["open", "closing", "closed"], "closed"),
    activeTurns: Array.isArray(value.activeTurns)
      ? value.activeTurns.slice(0, 16).map(boundedTurn)
      : [],
    ...(isRecord(value.runtime)
      ? { runtime: boundedRuntime(value.runtime) }
      : {}),
  };
}

function boundedTurn(value: unknown): unknown {
  const source = isRecord(value) ? value : {};
  const task = isRecord(source.task) ? source.task : {};
  const job = isRecord(source.job) ? source.job : {};
  const turn = isRecord(source.turn) ? source.turn : {};
  return {
    reference: boundedReference(source.reference),
    stage: boundedEnum(source.stage, [
      "scheduled",
      "session_ownership",
      "durable_input_check",
      "input_admission",
      "admission_read",
      "existing_turn_wait",
      "workspace_task_setup",
      "context_prepare",
      "model_endpoint_resolve",
      "turn_submit",
      "worker_start",
      "settlement_wait",
      "workspace_task_settlement",
    ], "scheduled"),
    modelEndpointResolution: boundedEnum(source.modelEndpointResolution, [
      "not_started",
      "resolved",
      "missing",
      "failed",
    ], "not_started"),
    ...(typeof source.runtimeStage === "string"
      ? {
          runtimeStage: boundedEnum(source.runtimeStage, [
            "worker_claimed",
            "turn_attempt_started",
            "input_loaded",
            "context_resolved",
            "provider_resolved",
            "recovery_checkpoint_read",
            "provider_request_prepared",
            "provider_invocation_started",
            "provider_invocation_succeeded",
            "tool_batch_preflight_started",
            "tool_batch_preflight_completed",
            "tool_execution_begin_requested",
            "tool_execution_begin_completed",
            "tool_execution_settled",
            "tool_result_persisted",
            "turn_settlement_started",
            "turn_settled",
          ], "worker_claimed"),
        }
      : {}),
    inputPresent: source.inputPresent === true,
    userMessagePresent: source.userMessagePresent === true,
    providerInvocationCount: boundedCount(source.providerInvocationCount),
    ...(typeof source.latestProviderInvocationState === "string"
      ? {
          latestProviderInvocationState: boundedEnum(
            source.latestProviderInvocationState,
            [
              "dispatched", "output_observed", "succeeded",
              "failed_before_output", "ambiguous",
            ],
            "failed_before_output",
          ),
        }
      : {}),
    ...(isRecord(source.providerFailure)
      ? { providerFailure: boundedFailure(source.providerFailure) }
      : {}),
    tools: boundedTools(source.tools),
    task: {
      present: task.present === true,
      ...(typeof task.state === "string"
        ? { state: boundedEnum(task.state, [
            "preparing", "active", "collecting", "proposed", "releasing",
            "released", "attention",
          ], "preparing") }
        : {}),
      ...(typeof task.outcome === "string"
        ? { outcome: boundedEnum(task.outcome, [
            "read_only_completed", "no_changes", "proposed",
            "execution_failed", "cancelled",
          ], "execution_failed") }
        : {}),
      ...(typeof task.attemptState === "string"
        ? { attemptState: boundedEnum(task.attemptState, [
            "active", "completed", "failed", "expired",
          ], "failed") }
        : {}),
      ...(isRecord(task.failure)
        ? { failure: boundedFailure(task.failure) }
        : {}),
    },
    job: {
      present: job.present === true,
      ...(typeof job.state === "string"
        ? { state: boundedEnum(job.state, [
            "pending", "ready", "running", "waiting", "succeeded",
            "retry_scheduled", "failed", "cancelled",
          ], "failed") }
        : {}),
      ...(job.attempt === undefined ? {} : { attempt: boundedCount(job.attempt) }),
      ...(job.leasePresent === undefined
        ? {}
        : { leasePresent: job.leasePresent === true }),
      ...(isRecord(job.failure)
        ? { failure: boundedFailure(job.failure) }
        : {}),
    },
    turn: {
      present: turn.present === true,
      ...(typeof turn.state === "string"
        ? { state: boundedEnum(turn.state, [
            "queued", "running", "waiting", "cancel_requested", "succeeded",
            "failed", "cancelled", "interrupted", "recovery_required",
          ], "failed") }
        : {}),
      ...(typeof turn.attemptState === "string"
        ? { attemptState: boundedEnum(turn.attemptState, [
            "running", "suspended", "succeeded", "failed", "cancelled",
            "interrupted", "recovery_required",
          ], "failed") }
        : {}),
      ...(isRecord(turn.failure)
        ? { failure: boundedFailure(turn.failure) }
        : {}),
    },
  };
}

function boundedTools(value: unknown): unknown {
  const tools = isRecord(value) ? value : {};
  return {
    state: boundedEnum(tools.state, ["available", "failed"], "failed"),
    returnedCount: boundedCount(tools.returnedCount),
    truncated: tools.truncated === true,
    items: Array.isArray(tools.items)
      ? tools.items.slice(0, 16).map((item) => {
          const source = isRecord(item) ? item : {};
          return {
            toolName: boundedIdentifier(source.toolName, "unknown"),
            state: boundedEnum(source.state, [
              "running", "waiting", "retry_ready", "approved", "denied",
              "approval_required", "succeeded", "failed", "cancelled",
              "recovery_required",
            ], "failed"),
            attemptCount: boundedCount(source.attemptCount),
            ...(typeof source.currentAttemptState === "string"
              ? {
                  currentAttemptState: boundedEnum(source.currentAttemptState, [
                    "running", "suspended", "succeeded", "failed", "cancelled",
                    "interrupted", "recovery_required",
                  ], "failed"),
                }
              : {}),
            ...(isRecord(source.failure)
              ? { failure: boundedFailure(source.failure) }
              : {}),
          };
        })
      : [],
    ...(isRecord(tools.failure)
      ? { failure: boundedFailure(tools.failure) }
      : {}),
  };
}

function boundedFailure(value: Record<string, unknown>): unknown {
  const safeIdentifier = (candidate: unknown): string | undefined =>
    typeof candidate === "string" && /^[A-Za-z0-9_.:-]{1,128}$/.test(candidate)
      ? candidate
      : undefined;
  const type = safeIdentifier(value.type);
  const name = safeIdentifier(value.name);
  const code = safeIdentifier(value.code);
  return {
    category: boundedEnum(value.category, [
      "cancelled", "timeout", "lease_lost", "permission_denied", "not_found",
      "already_exists", "invalid_path", "conflict", "process_failure",
      "storage_failure", "tool_failure", "provider_failure", "unknown",
    ], "unknown"),
    signals: Array.isArray(value.signals)
      ? value.signals
          .filter(
            (signal): signal is string =>
              typeof signal === "string" && ALLOWED_FAILURE_SIGNALS.has(signal),
          )
          .slice(0, 16)
      : [],
    ...(type === undefined ? {} : { type }),
    ...(name === undefined ? {} : { name }),
    ...(code === undefined ? {} : { code }),
  };
}

function boundedReference(value: unknown): unknown {
  const reference = isRecord(value) ? value : {};
  return {
    repositoryId: boundedIdentifier(reference.repositoryId, "unknown"),
    taskId: boundedIdentifier(reference.taskId, "unknown"),
    sessionId: boundedIdentifier(reference.sessionId, "unknown"),
    inputId: boundedIdentifier(reference.inputId, "unknown"),
    turnId: boundedIdentifier(reference.turnId, "unknown"),
    jobId: boundedIdentifier(reference.jobId, "unknown"),
  };
}

function boundedRuntime(runtime: Record<string, unknown>): unknown {
  const settlement = isRecord(runtime.settlement)
    ? boundedSettlement(runtime.settlement)
    : {
        pendingCount: 0,
        pendingReferences: [],
      };
  const recoveries = Array.isArray(runtime.recentRecoveries)
    ? runtime.recentRecoveries.slice(0, 8).map(boundedRecovery)
    : [];
  return {
    started: runtime.started === true,
    workerCount: boundedCount(runtime.workerCount),
    activeLoopCount: boundedCount(runtime.activeLoopCount),
    activeExecutionCount: boundedCount(runtime.activeExecutionCount),
    agentLoopRunCount: boundedCount(runtime.agentLoopRunCount),
    agentLoopFailedCount: boundedCount(runtime.agentLoopFailedCount),
    settlement,
    recentRecoveries: recoveries,
    ...(isRecord(runtime.lastEvent)
      ? { lastEvent: boundedRuntimeEvent(runtime.lastEvent) }
      : {}),
  };
}

function boundedSettlement(value: Record<string, unknown>): unknown {
  return {
    pendingCount: boundedCount(value.pendingCount),
    pendingReferences: Array.isArray(value.pendingReferences)
      ? value.pendingReferences.slice(0, 16).map(boundedRuntimeReference)
      : [],
    ...(typeof value.lastEvent === "string"
      ? {
          lastEvent: boundedEnum(
            value.lastEvent,
            [
              "wait_registered",
              "wait_released",
              "signal_observed",
              "canonical_terminal",
              "refresh_failed",
            ],
            "refresh_failed",
          ),
        }
      : {}),
    ...(isRecord(value.lastReference)
      ? { lastReference: boundedRuntimeReference(value.lastReference) }
      : {}),
    ...(typeof value.lastOutcome === "string"
      ? {
          lastOutcome: boundedEnum(
            value.lastOutcome,
            ["completed", "failed", "suspended"],
            "failed",
          ),
        }
      : {}),
  };
}

function boundedRecovery(value: unknown): unknown {
  const source = isRecord(value) ? value : {};
  const canonical = isRecord(source.canonical)
    ? boundedRecoveryCanonical(source.canonical)
    : undefined;
  return {
    reference: boundedReference(source.reference),
    executionId: boundedIdentifier(source.executionId, "unknown"),
    expectedRecoveryRevision: boundedCount(source.expectedRecoveryRevision),
    decision: boundedEnum(
      source.decision,
      ["confirm_succeeded", "confirm_failed", "retry", "abandon_turn"],
      "abandon_turn",
    ),
    phase: boundedEnum(
      source.phase,
      ["resolving", "requeued", "settled", "failed"],
      "failed",
    ),
    ...(typeof source.runtimeStage === "string"
      ? {
          runtimeStage: boundedEnum(source.runtimeStage, [
            "worker_claimed",
            "turn_attempt_started",
            "input_loaded",
            "context_resolved",
            "provider_resolved",
            "recovery_checkpoint_read",
            "provider_request_prepared",
            "provider_invocation_started",
            "provider_invocation_succeeded",
            "tool_batch_preflight_started",
            "tool_batch_preflight_completed",
            "tool_execution_begin_requested",
            "tool_execution_begin_completed",
            "tool_execution_settled",
            "tool_result_persisted",
            "turn_settlement_started",
            "turn_settled",
          ], "worker_claimed"),
        }
      : {}),
    ...(typeof source.action === "string"
      ? {
          action: boundedEnum(
            source.action,
            ["waiting_for_other_recovery", "turn_requeued", "turn_abandoned"],
            "waiting_for_other_recovery",
          ),
        }
      : {}),
    ...(canonical === undefined ? {} : { canonical }),
    ...(isRecord(source.failure)
      ? { failure: boundedFailure(source.failure) }
      : {}),
  };
}

function boundedRecoveryCanonical(value: Record<string, unknown>): unknown {
  const tool = isRecord(value.tool) ? value.tool : undefined;
  const provider = isRecord(value.provider) ? value.provider : {};
  const task = isRecord(value.task) ? value.task : undefined;
  const job = isRecord(value.job) ? value.job : undefined;
  const turn = isRecord(value.turn) ? value.turn : undefined;
  return {
    readState: boundedEnum(value.readState, ["available", "failed"], "failed"),
    ...(tool === undefined
      ? {}
      : {
          tool: {
            state: boundedEnum(tool.state, [
              "pending",
              "running",
              "waiting",
              "retry_ready",
              "approved",
              "denied",
              "succeeded",
              "failed",
              "cancelled",
              "recovery_required",
            ], "failed"),
            attemptCount: boundedCount(tool.attemptCount),
            ...(typeof tool.currentAttemptState === "string"
              ? {
                  currentAttemptState: boundedEnum(tool.currentAttemptState, [
                    "running",
                    "suspended",
                    "succeeded",
                    "failed",
                    "cancelled",
                    "interrupted",
                    "recovery_required",
                  ], "failed"),
                }
              : {}),
          },
        }),
    provider: {
      invocationCount: boundedCount(provider.invocationCount),
      ...(typeof provider.latestState === "string"
        ? {
            latestState: boundedEnum(provider.latestState, [
              "dispatched",
              "output_observed",
              "succeeded",
              "failed_before_output",
              "ambiguous",
            ], "failed_before_output"),
          }
        : {}),
    },
    ...(task === undefined
      ? {}
      : {
          task: {
            state: boundedEnum(task.state, [
              "preparing",
              "active",
              "collecting",
              "proposed",
              "releasing",
              "released",
              "attention",
            ], "preparing"),
            ...(typeof task.attemptState === "string"
              ? {
                  attemptState: boundedEnum(task.attemptState, [
                    "active",
                    "completed",
                    "failed",
                    "expired",
                  ], "failed"),
                }
              : {}),
          },
        }),
    ...(job === undefined
      ? {}
      : {
          job: {
            state: boundedEnum(job.state, [
              "pending",
              "ready",
              "running",
              "waiting",
              "succeeded",
              "retry_scheduled",
              "failed",
              "cancelled",
            ], "failed"),
            attempt: boundedCount(job.attempt),
          },
        }),
    ...(turn === undefined
      ? {}
      : {
          turn: {
            state: boundedEnum(turn.state, [
              "queued",
              "running",
              "waiting",
              "cancel_requested",
              "succeeded",
              "failed",
              "cancelled",
              "interrupted",
              "recovery_required",
            ], "failed"),
            ...(typeof turn.attemptState === "string"
              ? {
                  attemptState: boundedEnum(turn.attemptState, [
                    "running",
                    "suspended",
                    "succeeded",
                    "failed",
                    "cancelled",
                    "interrupted",
                    "recovery_required",
                  ], "failed"),
                }
              : {}),
          },
        }),
    ...(isRecord(value.readFailure)
      ? { readFailure: boundedFailure(value.readFailure) }
      : {}),
  };
}

function boundedRuntimeEvent(value: Record<string, unknown>): unknown {
  return {
    kind: boundedEnum(value.kind, ["provider_event", "turn_signal"], "turn_signal"),
    reference: boundedReference(value.reference),
    ...(typeof value.signal === "string"
      ? {
          signal: boundedEnum(value.signal, [
            "submitted",
            "progress",
            "suspended",
            "settled",
            "cancel_requested",
            "approval_resolved",
          ], "progress"),
        }
      : {}),
    ...(typeof value.providerEventType === "string"
      ? {
          providerEventType: boundedEnum(value.providerEventType, [
            "text_delta",
            "reasoning_delta",
            "tool_call_start",
            "tool_call_delta",
            "tool_call_end",
            "provider_state",
            "usage",
            "finish",
            "error",
          ], "error"),
        }
      : {}),
  };
}

function boundedRuntimeReference(value: unknown): unknown {
  const reference = isRecord(value) ? value : {};
  return {
    sessionId: boundedIdentifier(reference.sessionId, "unknown"),
    inputId: boundedIdentifier(reference.inputId, "unknown"),
    turnId: boundedIdentifier(reference.turnId, "unknown"),
    jobId: boundedIdentifier(reference.jobId, "unknown"),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedIdentifier(value: unknown, fallback: string): string {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,256}$/.test(value)
    ? value
    : fallback;
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
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? Math.min(value as number, 1_000_000)
    : 0;
}
