import { createHash } from "node:crypto";
import { basename } from "node:path";
import type {
  PrincipalId,
  SessionTurnRecord,
  WorkspaceTaskRunSnapshot,
} from "@wanex/protocol";
import {
  type ExecutionEnvironment,
} from "@wanex/runtime/execution";
import type { CoreStore } from "@wanex/storage";
import type { PreparedAgentContext } from "@wanex/runtime/context";
import { canonicalizeUserMessageInput } from "@wanex/runtime/resources";
import type { WorkspaceStore } from "@wanex/storage/workspace";
import {
  LocalRepositoryLocator,
  WorkspaceRuntime,
  WorkspaceTransactionCleanupRequiredError,
  WorkspaceTransactionRecoveryRequiredError,
} from "@wanex/workspace";
import { WorkspaceGitRuntime } from "@wanex/workspace/git";
import {
  FixedWorkspaceIsolationAdapter,
  GitWorktreeIsolationAdapter,
} from "@wanex/workspace/isolation";
import { ProcessWorkspaceSnapshotClient } from "@wanex/workspace/snapshot";
import {
  WorkspaceTaskAttentionError,
  WorkspaceTaskRuntime,
} from "@wanex/workspace/tasks";
import {
  CodingTurnDidNotSucceedError,
  type CodingTurnRuntime,
} from "../execution/runtime.js";
import { CodingHostError } from "../errors.js";
import {
  codingApplicationScope,
  codingTurnOrigin,
} from "../execution/scope.js";
import {
  codingSessionScope,
  sessionBelongsToCodingRepository,
} from "../session-scope.js";
import { readCodingTranscript } from "./transcript.js";
import { prepareCodingRepositoryContext } from "./context.js";
import type {
  CodingProposalActionReceipt,
  CodingProposalActionRequest,
  CodingProposalApplyReceipt,
  CodingProposalDecisionRequest,
  CodingProposalSnapshot,
  CodingProposalUndoReceipt,
  CodingRepository,
  CodingRepositoryRecovery,
  CodingRepositoryRecoveryPolicy,
  CodingRepositoryContextPolicy,
  CodingRepositoryState,
  CodingSessionPage,
  CodingSessionSnapshot,
  CodingTurnPage,
  CodingTurnOperation,
  CodingTurnReceipt,
  CodingTurnReference,
  CodingTurnSnapshot,
  ListCodingSessionsRequest,
  ListCodingTurnsRequest,
  ResolveCodingTurnRecoveryRequest,
  StartCodingTurnRequest,
  UndoCodingProposalRequest,
} from "../types.js";
import type { CodingRepositoryDiagnostics } from "../diagnostics/types.js";
import type { CodingRepositoryIdentity } from "./identity.js";
import {
  listCodingSessions,
  listCodingTurns,
  readCodingSession,
} from "./history.js";
import { CodingRepositoryReview } from "./review.js";
import { readCodingTurnSnapshot } from "./turn.js";
import { codingStartDigest } from "./admission.js";
import {
  readActiveCodingTurnDiagnostics,
  type CodingTurnProgress,
} from "./diagnostics.js";

type CodingStore = CoreStore & WorkspaceStore;

export async function composeCodingRepository(options: {
  readonly identity: CodingRepositoryIdentity;
  readonly dataDir: string;
  readonly repositoryRoot: string;
  readonly worktreeParent: string;
  readonly serviceBin: string;
  readonly storage: CodingStore;
  readonly executionEnvironment: ExecutionEnvironment;
  readonly executionScope: import("@wanex/runtime/execution").ExecutionScope;
  readonly ownerId: PrincipalId;
  readonly principalId: PrincipalId;
  readonly gitBin?: string;
  readonly gitTimeoutMs?: number;
  readonly recovery?: CodingRepositoryRecoveryPolicy;
  readonly context?: CodingRepositoryContextPolicy;
  readonly baseAgentContext?: PreparedAgentContext;
  readonly execution?: CodingTurnRuntime;
  readonly onClose: () => void;
}): Promise<CodingRepository> {
  const locator = new LocalRepositoryLocator({
    repositories: [
      {
        repositoryId: options.identity.repositoryId,
        repositoryRoot: options.repositoryRoot,
        worktreeParent: options.worktreeParent,
        serviceBin: options.serviceBin,
        fileSystem: options.executionScope.fileSystem,
        ...(options.gitBin === undefined ? {} : { gitBin: options.gitBin }),
        ...(options.gitTimeoutMs === undefined
          ? {}
          : { gitTimeoutMs: options.gitTimeoutMs }),
      },
    ],
  });

  let repository: Awaited<ReturnType<typeof locator.locate>>;
  try {
    repository = await locator.locate(options.identity.repositoryId);
  } catch (error) {
    throw new CodingHostError(
      "repository_data_overlap",
      "coding host repository storage could not be isolated",
      error,
    );
  }

  const readOnlyIsolation = new FixedWorkspaceIsolationAdapter({
    rootDir: repository.repositoryRoot,
    fileSystem: options.executionScope.fileSystem,
    workspaceId: options.identity.workspaceId,
  });
  const writableIsolation = new GitWorktreeIsolationAdapter({
    repositoryId: options.identity.repositoryId,
    locator,
    snapshot: new ProcessWorkspaceSnapshotClient(),
    executionScope: options.executionScope,
  });
  const workspace = new WorkspaceRuntime({
    storage: options.storage,
    rootDir: repository.repositoryRoot,
    serviceBin: repository.serviceBin,
    executionScope: options.executionScope,
    workspaceId: options.identity.workspaceId,
    principalId: options.principalId,
  });
  const tasks = new WorkspaceTaskRuntime({
    storage: options.storage,
    readOnlyIsolation,
    writableIsolation,
    writableCollection: new WorkspaceGitRuntime({
      repositoryId: options.identity.repositoryId,
      worktreeParent: repository.worktreeParent,
      executionScope: options.executionScope,
    }),
    repositoryId: options.identity.repositoryId,
    workspaceId: options.identity.workspaceId,
    principalId: options.principalId,
    ownerId: options.ownerId,
    executionEnvironment: options.executionEnvironment,
  });
  const review = new CodingRepositoryReview({
    repositoryId: options.identity.repositoryId,
    workspaceId: options.identity.workspaceId,
    principalId: options.principalId,
    storage: options.storage,
    workspace,
  });

  let transaction: CodingRepositoryRecovery["transaction"] = "clean";
  try {
    await workspace.recoverPendingTransactions(options.identity.workspaceId);
  } catch (error) {
    if (
      error instanceof WorkspaceTransactionRecoveryRequiredError ||
      error instanceof WorkspaceTransactionCleanupRequiredError
    ) {
      transaction = "attention";
    } else {
      throw new CodingHostError(
        "repository_recovery_failed",
        "repository transaction recovery failed",
        error,
      );
    }
  }

  let taskRecovery;
  try {
    taskRecovery = await tasks.recoverExpiredTasks({
      workspaceId: options.identity.workspaceId,
      ...(options.recovery?.maxRuns === undefined
        ? {}
        : { maxRuns: options.recovery.maxRuns }),
      ...(options.recovery?.budgetMs === undefined
        ? {}
        : { budgetMs: options.recovery.budgetMs }),
    });
  } catch (error) {
    throw new CodingHostError(
      "repository_recovery_failed",
      "repository task recovery failed",
      error,
    );
  }
  try {
    await reconcileRecoveredCodingTurns(options.storage, taskRecovery.entries);
  } catch (error) {
    throw new CodingHostError(
      "repository_recovery_failed",
      "repository Turn recovery reconciliation failed",
      error,
    );
  }

  return new CodingRepositoryHandle(
    options.identity.repositoryId,
    basename(options.repositoryRoot),
    {
      transaction,
      tasks: {
        attempted: taskRecovery.attempted,
        released: taskRecovery.released,
        attention: taskRecovery.attention,
        skipped: taskRecovery.skipped,
        failed: taskRecovery.failed,
        remaining: taskRecovery.remaining,
        entries: taskRecovery.entries.map((entry) => ({ ...entry })),
        diagnostics: taskRecovery.diagnostics.map((entry) => ({ ...entry })),
      },
    },
    {
      principalId: options.principalId,
      workspaceId: options.identity.workspaceId,
      storage: options.storage,
      tasks,
      review,
      executionScope: options.executionScope,
      ...(options.execution === undefined
        ? {}
        : { execution: options.execution }),
      ...(options.context === undefined ? {} : { context: options.context }),
      ...(options.baseAgentContext === undefined
        ? {}
        : { baseAgentContext: options.baseAgentContext }),
      onClose: options.onClose,
    },
  );
}

async function reconcileRecoveredCodingTurns(
  storage: CodingStore,
  entries: readonly { readonly runId: string; readonly outcome: string }[],
): Promise<void> {
  for (const entry of entries) {
    if (entry.outcome !== "attention") continue;
    const task = await storage.getWorkspaceTaskRun({ runId: entry.runId });
    const jobId = task?.run.jobId;
    if (jobId === undefined) continue;
    const job = await storage.getJob({ jobId });
    if (job === null) continue;
    if (job.kind !== "session.turn") {
      throw new Error("Coding Workspace task is linked to a non-Turn job");
    }
    const identity = sessionTurnIdentity(job.payload);
    await storage.requestSessionTurnCancel({
      ...identity,
      jobId,
      reason: "coding workspace owner was lost before Turn settlement",
    });
  }
}

function sessionTurnIdentity(value: import("@wanex/protocol").JsonValue): {
  readonly sessionId: string;
  readonly inputId: string;
  readonly turnId: string;
} {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Coding session Turn job payload is invalid");
  }
  const record = value as Readonly<
    Record<string, import("@wanex/protocol").JsonValue>
  >;
  const sessionId = requireString(record.sessionId, "sessionId");
  const inputId = requireString(record.inputId, "inputId");
  const turnId = requireString(record.turnId, "turnId");
  return { sessionId, inputId, turnId };
}

function requireString(
  value: import("@wanex/protocol").JsonValue | undefined,
  label: string,
): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Coding session Turn job ${label} is invalid`);
  }
  return value;
}

class CodingRepositoryHandle implements CodingRepository {
  #currentState: CodingRepositoryState = "open";
  readonly #active = new Map<string, ActiveCodingTurn>();
  readonly #pending = new Set<Promise<unknown>>();
  #closePromise: Promise<void> | undefined;
  readonly #options: CodingRepositoryHandleOptions;

  constructor(
    readonly repositoryId: string,
    readonly repositoryName: string,
    readonly recovery: CodingRepositoryRecovery,
    options: CodingRepositoryHandleOptions,
  ) {
    this.#options = options;
  }

  get state(): CodingRepositoryState {
    return this.#currentState;
  }

  get sharedCheckoutReady(): boolean {
    return this.recovery.transaction === "clean";
  }

  startTurn(request: StartCodingTurnRequest): CodingTurnOperation {
    this.assertOpen();
    if (!this.sharedCheckoutReady) {
      throw new CodingHostError(
        "repository_not_ready",
        "coding repository requires transaction recovery before writable execution",
      );
    }
    const execution = this.#options.execution;
    if (execution === undefined) {
      throw new CodingHostError(
        "execution_unavailable",
        "coding host execution is not configured",
      );
    }
    const normalizedRequest = normalizeStartRequest(request);
    const reference = createTurnReference(
      this.repositoryId,
      normalizedRequest.sessionId,
      normalizedRequest.idempotencyKey,
    );
    const fingerprint = codingStartDigest(normalizedRequest);
    const existing = this.#active.get(reference.taskId);
    if (existing !== undefined) {
      if (existing.fingerprint !== fingerprint) {
        throw new CodingHostError(
          "invalid_request",
          "coding Turn idempotency key was reused with different execution input",
        );
      }
      return existing.operation;
    }
    const controller = new AbortController();
    const progress: CodingTurnProgress = {
      stage: "scheduled",
      modelEndpointResolution: "not_started",
    };
    let submitted = false;
    let cancelPromise: Promise<void> | undefined;
    const cancel = (reason: string): Promise<void> => {
      const normalized = normalizeCancellationReason(reason);
      if (!controller.signal.aborted) controller.abort(normalized);
      if (!submitted) return Promise.resolve();
      cancelPromise ??= execution.cancel(reference, normalized);
      return cancelPromise;
    };
    const result = Promise.resolve().then(
      async () =>
        await this.runTurn({
          request: normalizedRequest,
          reference,
          controller,
          execution,
          progress,
          async onSubmitted() {
            submitted = true;
            if (controller.signal.aborted) {
              await cancel(String(controller.signal.reason));
            }
          },
        }),
    );
    let active: ActiveCodingTurn;
    const operation: CodingTurnOperation = {
      reference,
      result,
      cancel,
      resolveApproval: async (approval) => {
        if (this.#active.get(reference.taskId) !== active) {
          throw new Error("coding Turn is no longer active");
        }
        return await execution.resolveApproval(reference, approval);
      },
    };
    active = { reference, result, cancel, fingerprint, operation, progress };
    this.#active.set(reference.taskId, active);
    void result
      .finally(() => {
        if (this.#active.get(reference.taskId) === active) {
          this.#active.delete(reference.taskId);
        }
      })
      .catch(() => {});
    return operation;
  }

  async readDiagnostics(): Promise<CodingRepositoryDiagnostics> {
    const activeTurns = await Promise.all(
      [...this.#active.values()]
        .sort((left, right) => left.reference.turnId.localeCompare(right.reference.turnId))
        .map(async (active) =>
          await readActiveCodingTurnDiagnostics({
            storage: this.#options.storage,
            reference: active.reference,
            progress: active.progress,
          })),
    );
    return {
      repositoryId: this.repositoryId,
      state: this.#currentState,
      activeTurns,
      ...(this.#options.execution === undefined
        ? {}
        : { runtime: this.#options.execution.diagnostics() }),
    };
  }

  listSessions(request: ListCodingSessionsRequest): Promise<CodingSessionPage> {
    this.assertOpen();
    return this.track(
      async () =>
        await listCodingSessions({
          storage: this.#options.storage,
          repositoryId: this.repositoryId,
          page: request,
        }),
    );
  }

  getSession(sessionId: string): Promise<CodingSessionSnapshot | null> {
    this.assertOpen();
    return this.track(
      async () =>
        await readCodingSession({
          storage: this.#options.storage,
          repositoryId: this.repositoryId,
          sessionId,
        }),
    );
  }

  readTranscript(
    request: import("../types.js").ReadCodingTranscriptRequest,
  ): Promise<import("../types.js").CodingTranscriptWindow | null> {
    this.assertOpen();
    return this.track(
      async () =>
        await readCodingTranscript({
          storage: this.#options.storage,
          repositoryId: this.repositoryId,
          page: request,
        }),
    );
  }

  listTurns(request: ListCodingTurnsRequest): Promise<CodingTurnPage> {
    this.assertOpen();
    return this.track(
      async () =>
        await listCodingTurns({
          storage: this.#options.storage,
          repositoryId: this.repositoryId,
          workspaceId: this.#options.workspaceId,
          page: request,
        }),
    );
  }

  getTurn(turnId: string): Promise<CodingTurnSnapshot | null> {
    this.assertOpen();
    return this.track(
      async () =>
        await readCodingTurnSnapshot({
          storage: this.#options.storage,
          repositoryId: this.repositoryId,
          workspaceId: this.#options.workspaceId,
          turnId,
        }),
    );
  }

  resolveTurnRecovery(
    request: ResolveCodingTurnRecoveryRequest,
  ): Promise<CodingTurnSnapshot> {
    this.assertOpen();
    return this.track(async () => {
      const snapshot = await readCodingTurnSnapshot({
        storage: this.#options.storage,
        repositoryId: this.repositoryId,
        workspaceId: this.#options.workspaceId,
        turnId: request.turnId,
      });
      if (snapshot === null) {
        throw new CodingHostError(
          "turn_unavailable",
          "coding recovery Turn is unavailable",
        );
      }
      const execution = await this.#options.storage.getToolExecution(
        request.executionId,
      );
      if (
        execution === null ||
        execution.sessionId !== snapshot.reference.sessionId ||
        execution.inputId !== snapshot.reference.inputId ||
        execution.turnId !== snapshot.reference.turnId
      ) {
        throw new CodingHostError(
          "turn_unavailable",
          "coding recovery Tool execution does not belong to the exact Turn",
        );
      }
      if (execution.state !== "recovery_required") return snapshot;
      if (execution.recoveryRevision !== request.expectedRecoveryRevision) {
        throw new CodingHostError(
          "invalid_request",
          "coding recovery revision is stale",
        );
      }
      const task = await this.#options.storage.getWorkspaceTaskRun({
        runId: snapshot.reference.taskId,
      });
      if (task === null || task.run.jobId !== snapshot.reference.jobId) {
        throw new CodingHostError(
          "turn_unavailable",
          "coding recovery Workspace task is unavailable",
        );
      }
      if (task.run.state !== "attention") return snapshot;
      const executionRuntime = this.#options.execution;
      if (executionRuntime === undefined) {
        throw new CodingHostError(
          "execution_unavailable",
          "coding host execution is not configured",
        );
      }
      const receipt = await this.#options.tasks.resumeTask({
        runId: snapshot.reference.taskId,
        input: {
          kind: "coding_turn_recovery",
          executionId: request.executionId,
          requestId: request.requestId,
        },
        handler: async (context) => {
          const state = await executionRuntime.resumeAfterRecovery({
            task: context,
            repositoryId: this.repositoryId,
            reference: snapshot.reference,
            principalId: this.#options.principalId,
            agentContext: await prepareCodingRepositoryContext({
              rootDir: context.rootDir,
              ...(this.#options.context === undefined
                ? {}
                : { policy: this.#options.context }),
              ...(this.#options.baseAgentContext === undefined
                ? {}
                : { base: this.#options.baseAgentContext }),
            }),
            recovery: request,
          });
          if (state !== "succeeded") {
            throw new CodingTurnDidNotSucceedError(state);
          }
          return { summary: "Coding changes" };
        },
      });
      if (
        receipt.error !== undefined &&
        receipt.error.name === "CodingTurnRecoveryFailed"
      ) {
        await executionRuntime.refreshRecoveryDiagnostics(
          snapshot.reference,
          request.executionId,
        );
        throw new Error(receipt.error.message);
      }
      await executionRuntime.refreshRecoveryDiagnostics(
        snapshot.reference,
        request.executionId,
      );
      const resolved = await readCodingTurnSnapshot({
        storage: this.#options.storage,
        repositoryId: this.repositoryId,
        workspaceId: this.#options.workspaceId,
        turnId: snapshot.reference.turnId,
      });
      if (resolved === null) {
        throw new Error("coding recovery Turn disappeared after continuation");
      }
      return resolved;
    });
  }

  getProposal(proposalId: string): Promise<CodingProposalSnapshot | null> {
    this.assertOpen();
    return this.track(
      async () => await this.#options.review.getProposal(proposalId),
    );
  }

  decideProposal(
    request: CodingProposalDecisionRequest,
  ): Promise<CodingProposalActionReceipt> {
    this.assertOpen();
    return this.track(
      async () => await this.#options.review.decideProposal(request),
    );
  }

  requestProposalApply(
    request: CodingProposalActionRequest,
  ): Promise<CodingProposalActionReceipt> {
    this.assertOpen();
    return this.track(
      async () => await this.#options.review.requestApply(request),
    );
  }

  applyProposal(proposalId: string): Promise<CodingProposalApplyReceipt> {
    this.assertOpen();
    this.assertSharedCheckoutReady();
    return this.track(
      async () => await this.#options.review.applyProposal(proposalId),
    );
  }

  undoProposal(
    request: UndoCodingProposalRequest,
  ): Promise<CodingProposalUndoReceipt> {
    this.assertOpen();
    this.assertSharedCheckoutReady();
    return this.track(
      async () => await this.#options.review.undoProposal(request),
    );
  }

  close(): Promise<void> {
    if (this.#closePromise !== undefined) return this.#closePromise;
    this.#currentState = "closing";
    this.#closePromise = Promise.resolve().then(async () => {
      const active = [...this.#active.values()];
      const cancellation = await Promise.allSettled(
        active.map(
          async (operation) =>
            await operation.cancel("coding repository is closing"),
        ),
      );
      const settlement = await Promise.allSettled(
        active.map(async (operation) => await operation.result),
      );
      await Promise.allSettled([...this.#pending]);
      const scopeClose = await Promise.allSettled([
        this.#options.executionScope.close(),
      ]);
      this.#active.clear();
      this.#currentState = "closed";
      this.#options.onClose();
      const failure = [...cancellation, ...settlement, ...scopeClose].find(
        (item): item is PromiseRejectedResult => item.status === "rejected",
      );
      if (failure !== undefined) throw failure.reason;
    });
    return this.#closePromise;
  }

  private async runTurn(options: {
    readonly request: StartCodingTurnRequest;
    readonly reference: CodingTurnReference;
    readonly controller: AbortController;
    readonly execution: CodingTurnRuntime;
    readonly progress: CodingTurnProgress;
    readonly onSubmitted: () => Promise<void>;
  }): Promise<CodingTurnReceipt> {
    if (options.request.sessionId !== undefined) {
      options.progress.stage = "session_ownership";
      await assertSessionRepositoryOwnership(
        this.#options.storage,
        options.request.sessionId,
        this.repositoryId,
      );
    }
    options.progress.stage = "durable_input_check";
    await assertDurableCodingStartMatches(
      this.#options.storage,
      this.repositoryId,
      this.#options.principalId,
      options.reference,
      options.request,
    );
    options.progress.stage = "input_admission";
    await admitCodingStartInput({
      storage: this.#options.storage,
      repositoryId: this.repositoryId,
      workspaceId: this.#options.workspaceId,
      principalId: this.#options.principalId,
      reference: options.reference,
      request: options.request,
    });
    options.progress.stage = "admission_read";
    const admission = await readCodingStartAdmission({
      storage: this.#options.storage,
      repositoryId: this.repositoryId,
      workspaceId: this.#options.workspaceId,
      principalId: this.#options.principalId,
      reference: options.reference,
      request: options.request,
    });
    if (admission.kind === "terminal") {
      return await codingReceiptFromDurable(
        this.#options.storage,
        options.reference,
      );
    }
    if (admission.kind === "attention") {
      throw new CodingHostError(
        "turn_unavailable",
        "coding Turn admission requires explicit recovery before it can continue",
      );
    }
    if (admission.kind === "attached" || admission.kind === "pending") {
      options.progress.stage = "existing_turn_wait";
      return await waitForCodingReceipt({
        storage: this.#options.storage,
        reference: options.reference,
        controller: options.controller,
        execution: options.execution,
        tasks: this.#options.tasks,
        workspaceId: this.#options.workspaceId,
      });
    }
    let turnState: CodingTurnReceipt["turnState"];
    const handler = async (context: import("@wanex/workspace/tasks").WorkspaceTaskContext) => {
      if (options.controller.signal.aborted) {
        throw new Error(String(options.controller.signal.reason));
      }
      try {
        options.progress.stage = "context_prepare";
        const agentContext = await prepareCodingRepositoryContext({
          rootDir: context.rootDir,
          ...(this.#options.context === undefined
            ? {}
            : { policy: this.#options.context }),
          ...(this.#options.baseAgentContext === undefined
            ? {}
            : { base: this.#options.baseAgentContext }),
        });
        turnState = await options.execution.execute({
          task: context,
          repositoryId: this.repositoryId,
          reference: options.reference,
          turn: options.request,
          principalId: this.#options.principalId,
          agentContext,
          onSubmitted: options.onSubmitted,
          onRuntimeStage: (event) => {
            options.progress.runtimeStage = event.stage;
          },
          onStage: (stage, modelEndpointResolution) => {
            options.progress.stage = stage;
            if (modelEndpointResolution !== undefined) {
              options.progress.modelEndpointResolution = modelEndpointResolution;
            }
          },
        });
      } catch (error) {
        if (error instanceof CodingTurnDidNotSucceedError) {
          turnState = error.turnState;
          if (error.turnState === "recovery_required") {
            throw new WorkspaceTaskAttentionError({
              name: "CodingTurnRecoveryRequired",
              message:
                "coding Turn requires explicit recovery before the workspace can continue",
            });
          }
        }
        throw error;
      }
      return {
        summary: normalizeProposalTitle(options.request.proposalTitle),
      };
    };
    options.progress.stage = "workspace_task_setup";
    const task = admission.kind === "admission_recovery"
      ? await this.#options.tasks.resumeTask({
          runId: options.reference.taskId,
          input: {
            kind: "coding_turn_admission_recovery",
            sessionId: options.reference.sessionId,
            inputId: options.reference.inputId,
            turnId: options.reference.turnId,
          },
          handler,
        })
      : await this.#options.tasks.runTask({
          id: options.reference.taskId,
          access: "writable",
          input: {
            kind: "coding_turn",
            sessionId: options.reference.sessionId,
            inputId: options.reference.inputId,
            turnId: options.reference.turnId,
          },
          jobId: options.reference.jobId,
          agentId: options.request.agentId ?? this.#options.principalId,
          handler,
        });
    options.progress.stage = "workspace_task_settlement";
    if (
      task.status === "failed" &&
      (task.error?.message === "workspace task is already active" ||
        task.error?.message === "workspace task continuation is already active")
    ) {
      return await waitForCodingReceipt({
        storage: this.#options.storage,
        reference: options.reference,
        controller: options.controller,
        execution: options.execution,
        tasks: this.#options.tasks,
        workspaceId: this.#options.workspaceId,
      });
    }
    const snapshot = await this.#options.storage.getWorkspaceTaskRun({
      runId: options.reference.taskId,
    });
    return {
      reference: options.reference,
      ...(turnState === undefined ? {} : { turnState }),
      task: {
        status: task.status,
        ...(snapshot?.run.outcome === undefined
          ? {}
          : { outcome: snapshot.run.outcome }),
        ...(task.changeSet === undefined
          ? {}
          : { changeSetId: task.changeSet.id }),
        ...(task.proposal === undefined
          ? {}
          : { proposalId: task.proposal.id }),
      },
    };
  }

  private assertOpen(): void {
    if (this.#currentState !== "open") {
      throw new CodingHostError(
        "repository_closed",
        "coding repository is closed",
      );
    }
  }

  private assertSharedCheckoutReady(): void {
    if (!this.sharedCheckoutReady) {
      throw new CodingHostError(
        "repository_not_ready",
        "coding repository requires transaction recovery before shared-checkout mutation",
      );
    }
  }

  private track<T>(operation: () => Promise<T>): Promise<T> {
    const promise = Promise.resolve().then(operation);
    this.#pending.add(promise);
    void promise.finally(() => this.#pending.delete(promise)).catch(() => {});
    return promise;
  }
}

interface CodingRepositoryHandleOptions {
  readonly principalId: PrincipalId;
  readonly workspaceId: string;
  readonly storage: CodingStore;
  readonly tasks: WorkspaceTaskRuntime;
  readonly review: CodingRepositoryReview;
  readonly executionScope: import("@wanex/runtime/execution").ExecutionScope;
  readonly execution?: CodingTurnRuntime;
  readonly context?: CodingRepositoryContextPolicy;
  readonly baseAgentContext?: PreparedAgentContext;
  readonly onClose: () => void;
}

async function assertSessionRepositoryOwnership(
  storage: CodingStore,
  sessionId: string,
  repositoryId: string,
): Promise<void> {
  const session = await storage.getSession(sessionId);
  if (session === null) return;
  if (!sessionBelongsToCodingRepository(session, repositoryId)) {
    throw new CodingHostError(
      "session_unavailable",
      "coding session does not belong to this repository",
    );
  }
}

interface ActiveCodingTurn {
  readonly reference: CodingTurnReference;
  readonly result: Promise<CodingTurnReceipt>;
  readonly cancel: (reason: string) => Promise<void>;
  readonly fingerprint: string;
  readonly operation: CodingTurnOperation;
  readonly progress: CodingTurnProgress;
}

function createTurnReference(
  repositoryId: string,
  requestedSessionId: string | undefined,
  idempotencyKey: string,
): CodingTurnReference {
  const scope = `${repositoryId}\0${requestedSessionId ?? "<new-session>"}\0${idempotencyKey}`;
  const id = createHash("sha256").update(scope, "utf8").digest("hex");
  const sessionId =
    requestedSessionId ?? `ses_coding_${createHash("sha256").update(`${repositoryId}\0${idempotencyKey}`, "utf8").digest("hex")}`;
  return {
    repositoryId,
    taskId: `wtsk_coding_${id}`,
    sessionId,
    inputId: `inp_coding_${id}`,
    turnId: `turn_coding_${id}`,
    jobId: `job_coding_${id}`,
  };
}

function normalizeStartRequest(request: StartCodingTurnRequest): StartCodingTurnRequest {
  const idempotencyKey = request.idempotencyKey.trim();
  if (
    idempotencyKey.length === 0 ||
    Buffer.byteLength(idempotencyKey, "utf8") > 512
  ) {
    throw new CodingHostError(
      "invalid_request",
      "coding Turn idempotencyKey must contain 1 to 512 UTF-8 bytes",
    );
  }
  return { ...request, idempotencyKey };
}

function normalizeProposalTitle(value: string | undefined): string {
  const normalized = value?.trim() ?? "Coding changes";
  if (normalized.length === 0 || normalized.length > 512) {
    throw new Error("coding proposal title must contain 1 to 512 characters");
  }
  return normalized;
}

async function assertDurableCodingStartMatches(
  storage: CodingStore,
  repositoryId: string,
  principalId: string,
  reference: CodingTurnReference,
  request: StartCodingTurnRequest,
): Promise<void> {
  const turn = await storage.getSessionTurn(reference.turnId);
  const inputs = await storage.listSessionInputs({
    sessionId: reference.sessionId,
  });
  const input = inputs.find((candidate) => candidate.id === reference.inputId);
  if (turn === null) {
    if (input === undefined) return;
    assertCodingInputMatches(input, principalId, request);
    await assertCodingSessionMatches(storage, reference.sessionId, repositoryId);
    return;
  }
  if (
    turn.sessionId !== reference.sessionId ||
    turn.primaryInputId !== reference.inputId ||
    turn.jobId !== reference.jobId
  ) {
    throw new CodingHostError(
      "invalid_request",
      "coding Turn idempotency key resolved to a different durable identity",
    );
  }
  if (input === undefined) {
    throw new CodingHostError(
      "invalid_request",
      "coding durable Turn input is missing",
    );
  }
  assertCodingInputMatches(input, principalId, request);
  await assertCodingSessionMatches(storage, reference.sessionId, repositoryId);
}

async function admitCodingStartInput(request: {
  readonly storage: CodingStore;
  readonly repositoryId: string;
  readonly workspaceId: string;
  readonly principalId: string;
  readonly reference: CodingTurnReference;
  readonly request: StartCodingTurnRequest;
}): Promise<void> {
  const session = await ensureCodingSession(request);
  if (!sessionBelongsToCodingRepository(session, request.repositoryId)) {
    throw new CodingHostError(
      "session_unavailable",
      "coding session does not belong to this repository",
    );
  }
  const canonical = await canonicalizeUserMessageInput(
    request.storage,
    request.request.content,
  );
  await request.storage.admitSessionInput({
    id: request.reference.inputId,
    sessionId: request.reference.sessionId,
    principalId: request.principalId,
    idempotencyKey: request.request.idempotencyKey,
    content: canonical.content,
    origin: codingTurnOrigin(
      codingApplicationScope({
        repositoryId: request.repositoryId,
        workspaceId: request.workspaceId,
        taskId: request.reference.taskId,
      }),
      codingStartDigest(request.request),
    ),
    inputType: "user",
    intent: "normal",
  });
}

async function ensureCodingSession(request: {
  readonly storage: CodingStore;
  readonly repositoryId: string;
  readonly reference: CodingTurnReference;
  readonly request: StartCodingTurnRequest;
}): Promise<import("@wanex/protocol").SessionRecord> {
  const existing = await request.storage.getSession(request.reference.sessionId);
  if (existing !== null) return existing;
  try {
    return await request.storage.createSession({
      id: request.reference.sessionId,
      ...(request.request.title === undefined
        ? {}
        : { title: request.request.title }),
      kind: "agent",
      scope: codingSessionScope(request.repositoryId),
    });
  } catch (error) {
    const raced = await request.storage.getSession(request.reference.sessionId);
    if (raced !== null) return raced;
    throw error;
  }
}

function assertCodingInputMatches(
  input: import("@wanex/protocol").SessionInputRecord,
  principalId: string,
  request: StartCodingTurnRequest,
): void {
  const requestDigest = input.origin?.metadata?.requestDigest;
  if (
    input.principalId !== principalId ||
    input.idempotencyKey !== request.idempotencyKey ||
    typeof requestDigest !== "string" ||
    requestDigest !== codingStartDigest(request)
  ) {
    throw new CodingHostError(
      "invalid_request",
      "coding Turn idempotency key was reused with different execution input",
    );
  }
}

async function assertCodingSessionMatches(
  storage: CodingStore,
  sessionId: string,
  repositoryId: string,
): Promise<void> {
  const session = await storage.getSession(sessionId);
  if (session === null || !sessionBelongsToCodingRepository(session, repositoryId)) {
    throw new CodingHostError(
      "session_unavailable",
      "coding durable Turn session does not belong to this repository",
    );
  }
}

type CodingStartAdmission =
  | { readonly kind: "new" }
  | { readonly kind: "pending"; readonly task: WorkspaceTaskRunSnapshot }
  | {
      readonly kind: "attached";
      readonly task: WorkspaceTaskRunSnapshot;
      readonly turn: SessionTurnRecord;
    }
  | {
      readonly kind: "terminal";
      readonly task: WorkspaceTaskRunSnapshot;
      readonly turn: SessionTurnRecord;
    }
  | {
      readonly kind: "attention";
      readonly task: WorkspaceTaskRunSnapshot;
      readonly turn?: SessionTurnRecord;
    }
  | {
      readonly kind: "admission_recovery";
      readonly task: WorkspaceTaskRunSnapshot;
    };

async function readCodingStartAdmission(request: {
  readonly storage: CodingStore;
  readonly repositoryId: string;
  readonly workspaceId: string;
  readonly principalId: string;
  readonly reference: CodingTurnReference;
  readonly request: StartCodingTurnRequest;
}): Promise<CodingStartAdmission> {
  const [turn, task] = await Promise.all([
    request.storage.getSessionTurn(request.reference.turnId),
    request.storage.getWorkspaceTaskRun({ runId: request.reference.taskId }),
  ]);
  if (task === null && turn === null) return { kind: "new" };
  if (task === null) {
    throw new CodingHostError(
      "turn_unavailable",
      "coding Turn has durable Session state but no Workspace task",
    );
  }
  assertCodingTaskMatches(request, task);
  if (turn === null) {
    if (task.run.state === "attention") {
      if (
        await isRecoverableCodingAdmission(
          request.storage,
          task,
          request.reference,
        )
      ) {
        return { kind: "admission_recovery", task };
      }
      return { kind: "attention", task };
    }
    return task.run.state === "released"
      ? { kind: "attention", task }
      : { kind: "pending", task };
  }
  await assertDurableCodingStartMatches(
    request.storage,
    request.repositoryId,
    request.principalId,
    request.reference,
    request.request,
  );
  if (turn.state === "recovery_required" || task.run.state === "attention") {
    return { kind: "attention", task, turn };
  }
  if (turn.state === "succeeded" && task.run.state === "released") {
    return { kind: "terminal", task, turn };
  }
  if (
    (turn.state === "failed" ||
      turn.state === "cancelled" ||
      turn.state === "interrupted") &&
    task.run.state === "released"
  ) {
    return { kind: "terminal", task, turn };
  }
  return { kind: "attached", task, turn };
}

async function isRecoverableCodingAdmission(
  storage: CodingStore,
  task: WorkspaceTaskRunSnapshot,
  reference: CodingTurnReference,
): Promise<boolean> {
  const [inputs, job] = await Promise.all([
    storage.listSessionInputs({ sessionId: reference.sessionId }),
    storage.getJob({ jobId: reference.jobId }),
  ]);
  const input = inputs.find((candidate) => candidate.id === reference.inputId);
  return input?.status === "admitted" && job === null && task.run.jobId === reference.jobId;
}

function assertCodingTaskMatches(
  request: {
    readonly repositoryId: string;
    readonly workspaceId: string;
    readonly principalId: string;
    readonly reference: CodingTurnReference;
    readonly request: StartCodingTurnRequest;
  },
  task: WorkspaceTaskRunSnapshot,
): void {
  if (
    task.run.id !== request.reference.taskId ||
    task.run.repositoryId !== request.repositoryId ||
    task.run.workspaceId !== request.workspaceId ||
    task.run.principalId !== request.principalId ||
    task.run.access !== "writable" ||
    task.run.jobId !== request.reference.jobId ||
    task.run.agentId !== (request.request.agentId ?? request.principalId)
  ) {
    throw new CodingHostError(
      "invalid_request",
      "coding idempotency key resolved to a different Workspace task",
    );
  }
}

const ATTACH_WAIT_TIMEOUT_MS = 60_000;
const ATTACH_WAIT_INITIAL_DELAY_MS = 10;
const ATTACH_WAIT_MAX_DELAY_MS = 500;

async function waitForCodingReceipt(request: {
  readonly storage: CodingStore;
  readonly reference: CodingTurnReference;
  readonly controller: AbortController;
  readonly execution: CodingTurnRuntime;
  readonly tasks: WorkspaceTaskRuntime;
  readonly workspaceId: string;
}): Promise<CodingTurnReceipt> {
  const deadline = Date.now() + ATTACH_WAIT_TIMEOUT_MS;
  let delay = ATTACH_WAIT_INITIAL_DELAY_MS;
  let cancelSent = false;
  while (true) {
    const state = await readCodingStartAdmissionForObservation(
      request.storage,
      request.reference,
    );
    if (state.kind === "terminal") {
      return await codingReceiptFromDurable(request.storage, request.reference);
    }
    if (state.kind === "attention") {
      if (state.turn !== undefined) {
        return await codingReceiptFromDurable(request.storage, request.reference);
      }
      throw new CodingHostError(
        "turn_unavailable",
        "coding Turn admission requires explicit recovery before it can continue",
      );
    }
    if (state.kind === "admission_recovery") {
      throw new CodingHostError(
        "turn_unavailable",
        "coding Turn admission requires retry after the previous owner was lost",
      );
    }
    if (
      state.kind === "pending" &&
      state.task.activeAttempt !== undefined &&
      state.task.activeAttempt.leaseExpiresAt <= Date.now()
    ) {
      await request.tasks.recoverExpiredTasks({
        workspaceId: request.workspaceId,
        maxRuns: 1,
        budgetMs: 100,
      });
    }
    if (
      request.controller.signal.aborted &&
      state.kind === "attached" &&
      !cancelSent
    ) {
      cancelSent = true;
      await request.execution.cancel(
        request.reference,
        String(request.controller.signal.reason),
      );
    }
    if (Date.now() >= deadline) {
      throw new CodingHostError(
        "turn_unavailable",
        "attached Coding Turn observation exceeded its deadline",
      );
    }
    await delayWithAbort(delay);
    delay = Math.min(ATTACH_WAIT_MAX_DELAY_MS, delay * 2);
  }
}

async function readCodingStartAdmissionForObservation(
  storage: CodingStore,
  reference: CodingTurnReference,
): Promise<
  | { readonly kind: "pending"; readonly task: WorkspaceTaskRunSnapshot }
  | { readonly kind: "attached" }
  | { readonly kind: "terminal" }
  | { readonly kind: "attention"; readonly turn?: SessionTurnRecord }
  | { readonly kind: "admission_recovery" }
> {
  const [turn, task] = await Promise.all([
    storage.getSessionTurn(reference.turnId),
    storage.getWorkspaceTaskRun({ runId: reference.taskId }),
  ]);
  if (task === null) {
    throw new CodingHostError(
      "turn_unavailable",
      "attached Coding Turn lost its Workspace task",
    );
  }
  if (turn === null) {
    if (task.run.state === "attention") {
      if (await isRecoverableCodingAdmission(storage, task, reference)) {
        return { kind: "admission_recovery" };
      }
      return { kind: "attention" };
    }
    return task.run.state === "released"
      ? { kind: "attention" }
      : { kind: "pending", task };
  }
  if (turn.state === "recovery_required" || task.run.state === "attention") {
    return { kind: "attention", turn };
  }
  if (
    (turn.state === "succeeded" ||
      turn.state === "failed" ||
      turn.state === "cancelled" ||
      turn.state === "interrupted") &&
    task.run.state === "released"
  ) {
    return { kind: "terminal" };
  }
  return { kind: "attached" };
}

async function codingReceiptFromDurable(
  storage: CodingStore,
  reference: CodingTurnReference,
): Promise<CodingTurnReceipt> {
  const [turn, task] = await Promise.all([
    storage.getSessionTurn(reference.turnId),
    storage.getWorkspaceTaskRun({ runId: reference.taskId }),
  ]);
  if (turn === null || task === null) {
    throw new CodingHostError(
      "turn_unavailable",
      "coding Turn durable receipt is incomplete",
    );
  }
  return {
    reference,
    turnState: turn.state,
    task: {
      status:
        task.run.state === "released" &&
        !["execution_failed", "cancelled"].includes(task.run.outcome ?? "")
          ? "succeeded"
          : "failed",
      ...(task.run.outcome === undefined ? {} : { outcome: task.run.outcome }),
      ...(task.run.changeSetId === undefined
        ? {}
        : { changeSetId: task.run.changeSetId }),
      ...(task.run.proposalId === undefined
        ? {}
        : { proposalId: task.run.proposalId }),
    },
  };
}

async function delayWithAbort(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeCancellationReason(value: string): string {
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    Buffer.byteLength(normalized, "utf8") > 1_024
  ) {
    throw new Error(
      "coding cancellation reason must contain 1 to 1024 UTF-8 bytes",
    );
  }
  return normalized;
}
