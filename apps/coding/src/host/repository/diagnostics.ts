import type { CodingTurnReference } from "../types.js";
import type {
  CodingModelEndpointResolutionState,
  CodingTurnExecutionStage,
} from "../types.js";
import type {
  CodingRuntimeDiagnostics,
  CodingToolDiagnostics,
  CodingTurnDiagnostics,
} from "../diagnostics/types.js";
import type { CoreStore } from "@wanex/storage";
import type { WorkspaceStore } from "@wanex/storage/workspace";
import { diagnosticFailure } from "../diagnostics/failure.js";
import type { AgentRuntimeExecutionStage } from "@wanex/runtime/execution";

type CodingStore = CoreStore & WorkspaceStore;

const MAX_DIAGNOSTIC_TOOLS = 16;

export interface CodingTurnProgress {
  stage: CodingTurnExecutionStage;
  modelEndpointResolution: CodingModelEndpointResolutionState;
  runtimeStage?: AgentRuntimeExecutionStage;
}

export async function readActiveCodingTurnDiagnostics(request: {
  readonly storage: CodingStore;
  readonly reference: CodingTurnReference;
  readonly progress: CodingTurnProgress;
  readonly runtime?: CodingRuntimeDiagnostics;
}): Promise<CodingTurnDiagnostics> {
  const { reference } = request;
  const [task, job, turn, inputs, messages, attempts, providerInvocations, tools] =
    await Promise.all([
      request.storage.getWorkspaceTaskRun({ runId: reference.taskId }),
      request.storage.getJob({ jobId: reference.jobId }),
      request.storage.getSessionTurn(reference.turnId),
      request.storage.listSessionInputs({
        sessionId: reference.sessionId,
        limit: 64,
      }),
      request.storage.listSessionMessages({
        sessionId: reference.sessionId,
        turnIds: [reference.turnId],
      }),
      request.storage.listSessionAttempts({ turnId: reference.turnId }),
      request.storage.listProviderInvocations({ turnId: reference.turnId }),
      readToolDiagnostics(request.storage, reference.turnId),
    ]);
  const currentAttempt = turn?.currentAttemptId === undefined
    ? undefined
    : attempts.find((attempt) => attempt.id === turn.currentAttemptId);
  const latestProviderInvocation = [...providerInvocations].sort(
    (left, right) =>
      right.step - left.step || right.invocationNumber - left.invocationNumber,
  )[0];
  const providerFailure = diagnosticFailure(latestProviderInvocation?.error);
  const taskFailure = diagnosticFailure(
    task?.activeAttempt?.failure,
    task?.run.failure,
  );
  const jobFailure = diagnosticFailure(job?.lastError);
  const turnFailure = diagnosticFailure(currentAttempt?.error, turn?.error);
  return {
    reference: { ...reference },
    stage: request.progress.stage,
    modelEndpointResolution: request.progress.modelEndpointResolution,
    ...(request.progress.runtimeStage === undefined
      ? {}
      : { runtimeStage: request.progress.runtimeStage }),
    inputPresent: inputs.some((input) => input.id === reference.inputId),
    userMessagePresent: messages.some((message) => message.role === "user"),
    providerInvocationCount: providerInvocations.length,
    ...(latestProviderInvocation === undefined
      ? {}
      : { latestProviderInvocationState: latestProviderInvocation.state }),
    ...(providerFailure === undefined ? {} : { providerFailure }),
    tools,
    task: {
      present: task !== null,
      ...(task === null ? {} : { state: task.run.state }),
      ...(task?.run.outcome === undefined ? {} : { outcome: task.run.outcome }),
      ...(task?.activeAttempt === undefined
        ? {}
        : { attemptState: task.activeAttempt.state }),
      ...(taskFailure === undefined ? {} : { failure: taskFailure }),
    },
    job: {
      present: job !== null,
      ...(job === null ? {} : { state: job.state, attempt: job.attempt }),
      ...(job === null ? {} : { leasePresent: job.leaseToken !== undefined }),
      ...(jobFailure === undefined ? {} : { failure: jobFailure }),
    },
    turn: {
      present: turn !== null,
      ...(turn === null ? {} : { state: turn.state }),
      ...(currentAttempt === undefined
        ? {}
        : { attemptState: currentAttempt.state }),
      ...(turnFailure === undefined ? {} : { failure: turnFailure }),
    },
    ...(request.runtime === undefined ? {} : { runtime: request.runtime }),
  };
}

async function readToolDiagnostics(
  storage: CodingStore,
  turnId: string,
): Promise<CodingToolDiagnostics> {
  try {
    const observed = await storage.listToolExecutions({
      turnId,
      limit: MAX_DIAGNOSTIC_TOOLS + 1,
    });
    const executions = observed.slice(0, MAX_DIAGNOSTIC_TOOLS);
    const attempts = await Promise.all(
      executions.map(async (execution) => ({
        execution,
        attempts: execution.currentInvocationAttemptId === undefined
          ? []
          : await storage.listToolExecutionAttempts({ executionId: execution.id }),
      })),
    );
    return {
      state: "available",
      returnedCount: executions.length,
      truncated: observed.length > executions.length,
      items: attempts.map(({ execution, attempts: invocationAttempts }) => {
        const currentAttempt = execution.currentInvocationAttemptId === undefined
          ? undefined
          : invocationAttempts.find(
              (attempt) => attempt.id === execution.currentInvocationAttemptId,
            );
        const failure = diagnosticFailure(currentAttempt?.error, execution.error);
        return {
          toolName: execution.toolName,
          state: execution.state,
          attemptCount: execution.attemptCount,
          ...(currentAttempt === undefined
            ? {}
            : { currentAttemptState: currentAttempt.state }),
          ...(failure === undefined ? {} : { failure }),
        };
      }),
    };
  } catch (error) {
    return {
      state: "failed",
      returnedCount: 0,
      truncated: false,
      items: [],
      failure: diagnosticFailure(error) ?? {
        category: "unknown",
        signals: [],
      },
    };
  }
}
