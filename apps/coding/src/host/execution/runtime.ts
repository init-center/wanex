import type { SessionTurnState } from "@wanex/protocol"
import type { PreparedAgentContext } from "@wanex/runtime/context"
import type { AgentRuntimeExecutionStageEvent } from "@wanex/runtime/execution"
import { WanexRuntimeHost } from "@wanex/runtime/host"
import { ToolRegistry } from "@wanex/runtime/tools"
import type { CoreStore } from "@wanex/storage"
import type { WorkspaceStore } from "@wanex/storage/workspace"
import { WorkspaceRuntime } from "@wanex/workspace"
import {
  WorkspaceTaskAttentionError,
  type WorkspaceTaskContext
} from "@wanex/workspace/tasks"
import { registerWorkspaceCodingTools } from "@wanex/workspace/tools"
import {
  notifyCodingHostTurnObserver,
  type CodingHostTurnObserver,
  type CodingHostTurnSignal
} from "../events.js"
import type {
  CodingExecutionOptions,
  CodingModelEndpointResolutionState,
  CodingModelEndpointResolutionRequest,
  CodingTurnExecutionStage,
  CodingTurnReference,
  ResolveCodingTurnApprovalReceipt,
  ResolveCodingTurnApprovalRequest,
  StartCodingTurnRequest
} from "../types.js"
import { diagnosticFailure } from "../diagnostics/failure.js"
import type {
  CodingRecoveryCanonicalDiagnostics,
  CodingRecoveryDiagnostics,
  CodingRuntimeDiagnostics,
  CodingRuntimeEventDiagnostics,
} from "../diagnostics/types.js"
import { codingSessionScope } from "../session-scope.js"
import {
  CodingTurnScopeRegistry,
  codingApplicationScope,
  codingTurnOrigin
} from "./scope.js"
import { CodingTurnSettlementRegistry } from "./settlement.js"
import { codingStartDigest } from "../repository/admission.js"

type CodingStore = CoreStore & WorkspaceStore

const CODING_RUNTIME_QUEUE = "coding"

export class CodingTurnDidNotSucceedError extends Error {
  constructor(readonly turnState: SessionTurnState) {
    super(`coding Turn finished in state ${turnState}`)
    this.name = "CodingTurnDidNotSucceedError"
  }
}

export class CodingTurnRuntime {
  readonly #host: WanexRuntimeHost
  readonly #storage: CodingStore
  readonly #serviceBin: string
  readonly #options: CodingExecutionOptions
  readonly #observeTurn: CodingHostTurnObserver | undefined
  readonly #scopes = new CodingTurnScopeRegistry()
  readonly #settlements: CodingTurnSettlementRegistry
  readonly #stageObservers = new Map<
    string,
    (event: AgentRuntimeExecutionStageEvent) => void
  >()
  readonly #recentRecoveries = new Map<string, CodingRecoveryDiagnostics>()
  #lastEvent: CodingRuntimeEventDiagnostics | undefined
  #started = false

  constructor(options: {
    readonly storage: CodingStore
    readonly serviceBin: string
    readonly execution: CodingExecutionOptions
    readonly observeTurn?: CodingHostTurnObserver
  }) {
    if (
      options.execution.modelEndpointId !== undefined &&
      options.execution.resolveModelEndpointId !== undefined
    ) {
      throw new Error(
        "coding execution cannot combine a static model endpoint with a resolver",
      )
    }
    this.#storage = options.storage
    this.#serviceBin = options.serviceBin
    this.#options = options.execution
    this.#observeTurn = options.observeTurn
    this.#settlements = new CodingTurnSettlementRegistry(
      options.storage,
      (signal) => {
        this.observeTurnSignal(signal)
        notifyCodingHostTurnObserver(options.observeTurn, signal)
      },
    )
    this.#host = new WanexRuntimeHost({
      storage: options.storage,
      workerCount: options.execution.workerCount ?? 1,
      agentQueue: CODING_RUNTIME_QUEUE,
      resolveAgentContext: this.#scopes.resolve,
      observeSessionTurnResult: this.#settlements.observe,
      ...(options.execution.modelEndpointId === undefined ||
      options.execution.resolveModelEndpointId !== undefined
        ? {}
        : { modelEndpointId: options.execution.modelEndpointId }),
      ...(options.execution.secretResolver === undefined
        ? {}
        : { secretResolver: options.execution.secretResolver }),
      ...(options.execution.provider === undefined
        ? {}
        : { provider: options.execution.provider }),
      ...(options.execution.recovery === undefined
        ? {}
        : { recovery: options.execution.recovery }),
      ...(options.execution.toolMaxConcurrency === undefined
        ? {}
        : { toolMaxConcurrency: options.execution.toolMaxConcurrency }),
      ...(options.execution.leaseMs === undefined
        ? {}
        : { leaseMs: options.execution.leaseMs }),
      ...(options.execution.heartbeatIntervalMs === undefined
        ? {}
        : { heartbeatIntervalMs: options.execution.heartbeatIntervalMs }),
      ...(options.execution.timeoutMs === undefined
        ? {}
        : { timeoutMs: options.execution.timeoutMs }),
      ...(options.execution.idleIntervalMs === undefined
        ? {}
        : { idleIntervalMs: options.execution.idleIntervalMs }),
      ...(options.execution.errorIntervalMs === undefined
        ? {}
        : { errorIntervalMs: options.execution.errorIntervalMs }),
      observeProviderEvent: (event) => {
        try {
          options.execution.observeProviderEvent?.(event)
        } catch {
          // User observers are advisory and isolated from application signals.
        }
        this.#lastEvent = {
          kind: "provider_event",
          reference: providerReference(event),
          providerEventType: event.event.type,
        }
        notifyCodingHostTurnObserver(options.observeTurn, {
          kind: "provider_event",
          reference: providerReference(event),
          event
        })
      },
      observeExecutionStage: (event) => {
        const turnId = event.turnId ?? ""
        const recovery = this.#recentRecoveries.get(turnId)
        if (recovery !== undefined) {
          this.recordRecovery({ ...recovery, runtimeStage: event.stage })
        }
        this.#stageObservers.get(turnId)?.(event)
      }
    })
  }

  async execute(request: {
    readonly task: WorkspaceTaskContext
    readonly repositoryId: string
    readonly reference: CodingTurnReference
    readonly turn: StartCodingTurnRequest
    readonly principalId: string
    readonly agentContext: PreparedAgentContext
    readonly onSubmitted: () => Promise<void> | void
    readonly onRuntimeStage?: (
      event: AgentRuntimeExecutionStageEvent
    ) => void
    readonly onStage: (
      stage: CodingTurnExecutionStage,
      modelEndpointResolution?: CodingModelEndpointResolutionState,
    ) => void
  }): Promise<SessionTurnState> {
    if (
      request.task.executionScope.binding.policy.process.cleanup !==
      "durable_supervisor"
    ) {
      throw new Error("coding writable task requires supervised process cleanup")
    }
    const tools = this.createTools(request.task, request.reference, request.principalId)
    const applicationScope = codingApplicationScope({
      repositoryId: request.repositoryId,
      workspaceId: request.task.workspaceId,
      taskId: request.reference.taskId
    })
    const releaseScope = this.#scopes.register({
      ...request.reference,
      executionEnvironment: request.task.executionScope.binding,
      applicationScope,
      tools,
      baseContext: request.agentContext,
      toolPermissionPolicy: this.#options.toolPermissionPolicy
    })
    const waiter = this.#settlements.wait(request.reference)
    const stageObserver = request.onRuntimeStage === undefined
      ? undefined
      : (event: AgentRuntimeExecutionStageEvent) => {
          request.onRuntimeStage?.(event)
        }
    if (stageObserver !== undefined) {
      this.#stageObservers.set(request.reference.turnId, stageObserver)
    }
    try {
      request.onStage("model_endpoint_resolve")
      let modelEndpointId: string | undefined
      try {
        modelEndpointId = await this.resolveModelEndpointId(request)
      } catch (error) {
        request.onStage("model_endpoint_resolve", "failed")
        throw error
      }
      request.onStage(
        "turn_submit",
        modelEndpointId === undefined ? "missing" : "resolved",
      )
      const submitted = await this.#host.submitUserTurn({
        ...(modelEndpointId === undefined
          ? {}
          : {
              modelEndpointId,
            }),
        content: request.turn.content,
        sessionId: request.reference.sessionId,
        sessionScope: codingSessionScope(request.repositoryId),
        inputId: request.reference.inputId,
        turnId: request.reference.turnId,
        jobId: request.reference.jobId,
        principalId: request.principalId,
        idempotencyKey: request.turn.idempotencyKey,
        jobIdempotencyKey: `coding:${request.reference.taskId}:job`,
        executionEnvironment: request.task.executionScope.binding,
        applicationScope,
        origin: codingTurnOrigin(
          applicationScope,
          codingStartDigest(request.turn)
        ),
        ...(request.turn.title === undefined ? {} : { title: request.turn.title }),
        ...(request.turn.maxSteps === undefined
          ? {}
          : { maxSteps: request.turn.maxSteps }),
        ...(request.turn.maxOutputTokens === undefined
          ? {}
          : { maxOutputTokens: request.turn.maxOutputTokens })
      })
      assertSubmittedReference(submitted, request.reference)
      await request.onSubmitted()
      this.notify("submitted", request.reference)
      request.onStage("worker_start")
      this.start()
      await this.#settlements.refresh(request.reference)
      request.onStage("settlement_wait")
      const state = await waiter.promise
      if (state !== "succeeded") throw new CodingTurnDidNotSucceedError(state)
      return state
    } finally {
      if (
        stageObserver !== undefined &&
        this.#stageObservers.get(request.reference.turnId) === stageObserver
      ) {
        this.#stageObservers.delete(request.reference.turnId)
      }
      waiter.release()
      releaseScope()
    }
  }

  diagnostics(): CodingRuntimeDiagnostics {
    const health = this.#host.getHealthSnapshot()
    const agentLoops = health.loops.filter((loop) => loop.kind === "agent")
    return {
      started: health.started,
      workerCount: health.workerCount,
      activeLoopCount: health.activeLoopCount,
      activeExecutionCount: health.activeExecutionCount,
      agentLoopRunCount: agentLoops.reduce((total, loop) => total + loop.runCount, 0),
      agentLoopFailedCount: agentLoops.reduce(
        (total, loop) => total + loop.failedCount,
        0,
      ),
      settlement: this.#settlements.diagnostics(),
      recentRecoveries: [...this.#recentRecoveries.values()]
        .sort((left, right) => left.reference.turnId.localeCompare(right.reference.turnId)),
      ...(this.#lastEvent === undefined ? {} : { lastEvent: this.#lastEvent }),
    }
  }

  private observeTurnSignal(signal: CodingHostTurnSignal): void {
    if (signal.kind === "provider_event") {
      this.#lastEvent = {
        kind: "provider_event",
        reference: { ...signal.reference },
        providerEventType: signal.event.event.type,
      }
      return
    }
    this.#lastEvent = {
      kind: "turn_signal",
      reference: { ...signal.reference },
      signal: signal.kind,
    }
  }

  private recordRecovery(value: CodingRecoveryDiagnostics): void {
    this.#recentRecoveries.delete(value.reference.turnId)
    this.#recentRecoveries.set(value.reference.turnId, value)
    while (this.#recentRecoveries.size > 8) {
      const oldest = this.#recentRecoveries.keys().next().value
      if (oldest === undefined) break
      this.#recentRecoveries.delete(oldest)
    }
  }

  async refreshRecoveryDiagnostics(
    reference: CodingTurnReference,
    executionId: string,
  ): Promise<void> {
    const current = this.#recentRecoveries.get(reference.turnId)
    if (current === undefined || current.executionId !== executionId) return
    this.recordRecovery({
      ...current,
      canonical: await this.readRecoveryCanonical(reference, executionId),
    })
  }

  private async readRecoveryCanonical(
    reference: CodingTurnReference,
    executionId: string,
  ): Promise<CodingRecoveryCanonicalDiagnostics> {
    try {
      const [execution, providerInvocations, task, job, turn] = await Promise.all([
        this.#storage.getToolExecution(executionId),
        this.#storage.listProviderInvocations({ turnId: reference.turnId }),
        this.#storage.getWorkspaceTaskRun({ runId: reference.taskId }),
        this.#storage.getJob({ jobId: reference.jobId }),
        this.#storage.getSessionTurn(reference.turnId),
      ])
      const attempts = execution === null
        ? []
        : await this.#storage.listToolExecutionAttempts({ executionId })
      const currentToolAttempt = execution?.currentInvocationAttemptId === undefined
        ? undefined
        : attempts.find((attempt) => attempt.id === execution.currentInvocationAttemptId)
      const sessionAttempts = turn === null
        ? []
        : await this.#storage.listSessionAttempts({ turnId: reference.turnId })
      const currentSessionAttempt = turn?.currentAttemptId === undefined
        ? undefined
        : sessionAttempts.find((attempt) => attempt.id === turn.currentAttemptId)
      const latestProviderInvocation = [...providerInvocations].sort(
        (left, right) =>
          right.step - left.step || right.invocationNumber - left.invocationNumber,
      )[0]
      return {
        readState: "available",
        ...(execution === null
          ? {}
          : {
              tool: {
                state: execution.state,
                attemptCount: execution.attemptCount,
                ...(currentToolAttempt === undefined
                  ? {}
                  : { currentAttemptState: currentToolAttempt.state }),
              },
            }),
        provider: {
          invocationCount: providerInvocations.length,
          ...(latestProviderInvocation === undefined
            ? {}
            : { latestState: latestProviderInvocation.state }),
        },
        ...(task === null
          ? {}
          : {
              task: {
                state: task.run.state,
                ...(task.activeAttempt === undefined
                  ? {}
                  : { attemptState: task.activeAttempt.state }),
              },
            }),
        ...(job === null
          ? {}
          : { job: { state: job.state, attempt: job.attempt } }),
        ...(turn === null
          ? {}
          : {
              turn: {
                state: turn.state,
                ...(currentSessionAttempt === undefined
                  ? {}
                  : { attemptState: currentSessionAttempt.state }),
              },
            }),
      }
    } catch (error) {
      return {
        readState: "failed",
        provider: { invocationCount: 0 },
        readFailure: diagnosticFailure(error) ?? {
          category: "unknown",
          signals: [],
        },
      }
    }
  }

  async resumeAfterRecovery(request: {
    readonly task: WorkspaceTaskContext
    readonly repositoryId: string
    readonly reference: CodingTurnReference
    readonly principalId: string
    readonly agentContext: PreparedAgentContext
    readonly onRuntimeStage?: (
      event: AgentRuntimeExecutionStageEvent
    ) => void
    readonly recovery: import("../types.js").ResolveCodingTurnRecoveryRequest
  }): Promise<SessionTurnState> {
    if (
      request.task.executionScope.binding.policy.process.cleanup !==
      "durable_supervisor"
    ) {
      throw new WorkspaceTaskAttentionError({
        name: "CodingRecoveryExecutionUnavailable",
        message: "coding recovery requires supervised process cleanup"
      })
    }
    const tools = this.createTools(
      request.task,
      request.reference,
      request.principalId
    )
    const applicationScope = codingApplicationScope({
      repositoryId: request.repositoryId,
      workspaceId: request.task.workspaceId,
      taskId: request.reference.taskId
    })
    const releaseScope = this.#scopes.register({
      ...request.reference,
      executionEnvironment: request.task.executionScope.binding,
      applicationScope,
      tools,
      baseContext: request.agentContext,
      toolPermissionPolicy: this.#options.toolPermissionPolicy
    })
    const waiter = this.#settlements.wait(request.reference)
    const recovery: CodingRecoveryDiagnostics = {
      reference: { ...request.reference },
      executionId: request.recovery.executionId,
      expectedRecoveryRevision: request.recovery.expectedRecoveryRevision,
      decision: request.recovery.decision,
      phase: "resolving",
    }
    this.recordRecovery(recovery)
    const stageObserver = request.onRuntimeStage === undefined
      ? undefined
      : (event: AgentRuntimeExecutionStageEvent) => {
          const current = this.#recentRecoveries.get(request.reference.turnId)
          if (current !== undefined) {
            this.recordRecovery({ ...current, runtimeStage: event.stage })
          }
          request.onRuntimeStage?.(event)
        }
    if (stageObserver !== undefined) {
      this.#stageObservers.set(request.reference.turnId, stageObserver)
    }
    try {
      let receipt: import("@wanex/protocol").ResolveToolExecutionRecoveryReceipt
      try {
        receipt = await this.#storage.resolveToolExecutionRecovery({
          executionId: request.recovery.executionId,
          expectedRecoveryRevision: request.recovery.expectedRecoveryRevision,
          decision: request.recovery.decision,
          principalId: request.principalId,
          reason: request.recovery.reason,
          idempotencyKey: request.recovery.requestId,
          ...(request.recovery.content === undefined
            ? {}
            : { content: request.recovery.content }),
          ...(request.recovery.contentDigest === undefined
            ? {}
            : { contentDigest: request.recovery.contentDigest }),
          ...(request.recovery.error === undefined
            ? {}
            : { error: request.recovery.error })
        })
      } catch (error) {
        throw recoveryAttentionError(error)
      }
      const action = receipt.recoveryDecision.action
      this.recordRecovery({
        ...recovery,
        phase: action === "turn_requeued" ? "requeued" : "failed",
        action,
        canonical: await this.readRecoveryCanonical(
          request.reference,
          request.recovery.executionId,
        ),
      })
      if (action !== "turn_requeued") {
        throw new WorkspaceTaskAttentionError({
          name:
            action === "turn_abandoned"
              ? "CodingTurnRecoveryAbandoned"
              : "CodingTurnRecoveryPending",
          message:
            action === "turn_abandoned"
              ? "coding Turn was abandoned after an unknown Tool outcome"
              : "coding Turn still has unresolved Tool recovery items"
        })
      }
      this.start()
      this.#host.wake()
      await this.#settlements.refresh(request.reference)
      const state = await waiter.promise
      const current = this.#recentRecoveries.get(request.reference.turnId) ?? recovery
      this.recordRecovery({
        ...current,
        phase: state === "succeeded" ? "settled" : "failed",
        canonical: await this.readRecoveryCanonical(
          request.reference,
          request.recovery.executionId,
        ),
      })
      if (state === "recovery_required") {
        throw new WorkspaceTaskAttentionError({
          name: "CodingTurnRecoveryRequired",
          message: "coding Turn requires another recovery decision"
        })
      }
      if (state !== "succeeded") {
        throw new CodingTurnDidNotSucceedError(state)
      }
      return state
    } catch (error) {
      const current = this.#recentRecoveries.get(request.reference.turnId) ?? recovery
      const failure = diagnosticFailure(error)
      this.recordRecovery({
        ...current,
        phase: "failed",
        canonical: await this.readRecoveryCanonical(
          request.reference,
          request.recovery.executionId,
        ),
        ...(failure === undefined ? {} : { failure }),
      })
      throw error
    } finally {
      if (
        stageObserver !== undefined &&
        this.#stageObservers.get(request.reference.turnId) === stageObserver
      ) {
        this.#stageObservers.delete(request.reference.turnId)
      }
      waiter.release()
      releaseScope()
    }
  }

  async cancel(reference: CodingTurnReference, reason: string): Promise<void> {
    await this.#host.requestSessionTurnCancel({
      sessionId: reference.sessionId,
      inputId: reference.inputId,
      turnId: reference.turnId,
      jobId: reference.jobId,
      reason
    })
    this.notify("cancel_requested", reference)
    await this.#settlements.refresh(reference)
  }

  async resolveApproval(
    reference: CodingTurnReference,
    request: ResolveCodingTurnApprovalRequest
  ): Promise<ResolveCodingTurnApprovalReceipt> {
    const execution = await this.#storage.getToolExecution(request.executionId)
    if (
      execution === null ||
      execution.sessionId !== reference.sessionId ||
      execution.inputId !== reference.inputId ||
      execution.turnId !== reference.turnId
    ) {
      throw new Error("coding Tool approval does not belong to the exact Turn")
    }
    const reason = normalizeApprovalReason(request.reason)
    const receipt = await this.#storage.resolveToolExecutionApproval({
      executionId: request.executionId,
      expectedApprovalRevision: request.expectedApprovalRevision,
      decision: request.decision,
      principalId: execution.principalId,
      reason,
      idempotencyKey:
        request.idempotencyKey ??
        `coding:${reference.taskId}:approval:${request.executionId}:${request.expectedApprovalRevision}`
    })
    this.notify("approval_resolved", reference)
    this.#host.wake()
    return {
      executionId: request.executionId,
      decision: receipt.approvalDecision.decision,
      approvalRevision: receipt.approvalDecision.approvalRevision
    }
  }

  wake(): void {
    this.#host.wake()
  }

  async dispose(): Promise<void> {
    await this.#host.dispose()
    if (this.#scopes.size !== 0) {
      throw new Error("coding Runtime disposed with active Turn scopes")
    }
  }

  private start(): void {
    if (this.#started) return
    this.#host.start()
    this.#started = true
  }

  private createTools(
    task: WorkspaceTaskContext,
    reference: CodingTurnReference,
    principalId: string
  ): ToolRegistry {
    const tools = new ToolRegistry()
    registerWorkspaceCodingTools(tools, {
      scopeId: reference.taskId,
      rootDir: task.rootDir,
      runtime: new WorkspaceRuntime({
        storage: this.#storage,
        rootDir: task.rootDir,
        serviceBin: this.#serviceBin,
        executionScope: task.executionScope,
        workspaceId: reference.taskId,
        principalId
      }),
      executionProcess: task.executionScope.process,
      fileSystem: task.executionScope.fileSystem,
      programPolicy: this.#options.programPolicy
    })
    return tools
  }

  private async resolveModelEndpointId(request: {
    readonly repositoryId: string
    readonly reference: CodingTurnReference
    readonly turn: StartCodingTurnRequest
  }): Promise<string | undefined> {
    if (this.#options.resolveModelEndpointId === undefined) {
      return request.turn.modelEndpointId
    }
    const resolution: CodingModelEndpointResolutionRequest = {
      repositoryId: request.repositoryId,
      sessionId: request.reference.sessionId,
      inputId: request.reference.inputId,
      turnId: request.reference.turnId,
      jobId: request.reference.jobId,
      ...(request.turn.modelEndpointId === undefined
        ? {}
        : { requestedModelEndpointId: request.turn.modelEndpointId }),
    }
    return await this.#options.resolveModelEndpointId(resolution)
  }

  private notify(
    kind: import("../events.js").CodingHostTurnSignalKind,
    reference: CodingTurnReference
  ): void {
    const signal = { kind, reference } as const
    this.observeTurnSignal(signal)
    notifyCodingHostTurnObserver(this.#observeTurn, signal)
  }
}

function recoveryAttentionError(error: unknown): WorkspaceTaskAttentionError {
  const message = error instanceof Error ? error.message : String(error)
  return new WorkspaceTaskAttentionError({
    name: "CodingTurnRecoveryFailed",
    message: `coding Turn recovery could not be resolved: ${message}`
  })
}

function providerReference(
  event: import("@wanex/runtime/provider").ProviderRunEvent
): CodingHostTurnSignal["reference"] {
  return {
    sessionId: event.sessionId,
    inputId: event.inputId,
    turnId: event.turnId,
    jobId: event.jobId
  }
}

function normalizeApprovalReason(value: string): string {
  const normalized = value.trim()
  if (normalized.length === 0 || Buffer.byteLength(normalized, "utf8") > 1_024) {
    throw new Error("coding approval reason must contain 1 to 1024 UTF-8 bytes")
  }
  return normalized
}

function assertSubmittedReference(
  submitted: Awaited<ReturnType<WanexRuntimeHost["submitUserTurn"]>>,
  expected: CodingTurnReference
): void {
  if (
    submitted.session.id !== expected.sessionId ||
    submitted.inputId !== expected.inputId ||
    submitted.turnId !== expected.turnId ||
    submitted.receipt.job.id !== expected.jobId
  ) {
    throw new Error("Runtime changed the preallocated Coding Turn identity")
  }
}
