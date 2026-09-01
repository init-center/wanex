import type { CodingTurnReference } from "../types.js";
import type {
  CodingModelEndpointResolutionState,
  CodingRuntimeDiagnostics,
  CodingTurnDiagnostics,
  CodingTurnExecutionStage,
} from "../types.js";
import type { CoreStore } from "@wanex/storage";
import type { WorkspaceStore } from "@wanex/storage/workspace";

type CodingStore = CoreStore & WorkspaceStore;

export interface CodingTurnProgress {
  stage: CodingTurnExecutionStage;
  modelEndpointResolution: CodingModelEndpointResolutionState;
}

export async function readActiveCodingTurnDiagnostics(request: {
  readonly storage: CodingStore;
  readonly reference: CodingTurnReference;
  readonly progress: CodingTurnProgress;
  readonly runtime?: CodingRuntimeDiagnostics;
}): Promise<CodingTurnDiagnostics> {
  const { reference } = request;
  const [task, job, turn, inputs, messages, attempts, providerInvocations] =
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
    ]);
  const currentAttempt = turn?.currentAttemptId === undefined
    ? undefined
    : attempts.find((attempt) => attempt.id === turn.currentAttemptId);
  return {
    reference: { ...reference },
    stage: request.progress.stage,
    modelEndpointResolution: request.progress.modelEndpointResolution,
    inputPresent: inputs.some((input) => input.id === reference.inputId),
    userMessagePresent: messages.some((message) => message.role === "user"),
    providerInvocationCount: providerInvocations.length,
    task: {
      present: task !== null,
      ...(task === null ? {} : { state: task.run.state }),
      ...(task?.run.outcome === undefined ? {} : { outcome: task.run.outcome }),
      ...(task?.activeAttempt === undefined
        ? {}
        : { attemptState: task.activeAttempt.state }),
    },
    job: {
      present: job !== null,
      ...(job === null ? {} : { state: job.state, attempt: job.attempt }),
      ...(job === null ? {} : { leasePresent: job.leaseToken !== undefined }),
    },
    turn: {
      present: turn !== null,
      ...(turn === null ? {} : { state: turn.state }),
      ...(currentAttempt === undefined
        ? {}
        : { attemptState: currentAttempt.state }),
    },
    ...(request.runtime === undefined ? {} : { runtime: request.runtime }),
  };
}
