import { WanexAgentRunner } from "../core/index.js"
import { workerAcknowledged } from "../../jobs/index.js"
import { readActiveAbortReason } from "../../jobs/active-abort.js"
import {
  assertAgentContextMatchesBinding,
  providerForTurnBinding
} from "../turn-binding.js"
import type { JsonValue, SchedulerJobRecord } from "@wanex/protocol"
import type { WorkerHandler } from "../../jobs/index.js"
import type {
  RegisterSessionTurnHandlerOptions,
  SessionTurnHandlerOptions,
  SessionTurnJobPayload
} from "./types.js"
import { assertTurnResourcesMatchBinding } from "../../resources/index.js"
import { createInlineContextCapacityCompactor } from "../../context/capacity/index.js"
import { SemanticContextCompiler } from "../../context/memory/index.js"
import { TurnControlEventObserver } from "./turn-control-observer.js"
import {
  notifyAgentRuntimeExecutionStage,
  type AgentRuntimeExecutionStage
} from "../stage.js"

export function createSessionTurnHandler(
  options: SessionTurnHandlerOptions
): WorkerHandler {
  const turnControlObserver =
    options.turnControlObserver ??
    new TurnControlEventObserver({ storage: options.storage })
  return async ({ job, signal, heartbeat, registerActiveAttempt }) => {
    const payload = parseSessionTurnPayload(job.payload)
    const observeStage = (
      stage: AgentRuntimeExecutionStage,
      attemptId?: string
    ): void => {
      notifyAgentRuntimeExecutionStage(options.observeExecutionStage, {
        kind: "wanex-runtime.execution-stage",
        stage,
        sessionId: payload.sessionId,
        inputId: payload.inputId,
        turnId: payload.turnId,
        jobId: job.id,
        ...(attemptId === undefined ? {} : { attemptId })
      })
    }
    observeStage("worker_claimed")
    const workerId = requireField(job.leaseOwner, "claimed job lease owner")
    const leaseToken = requireField(job.leaseToken, "claimed job lease token")
    const started = await options.session.startTurnAttempt({
      sessionId: payload.sessionId,
      turnId: payload.turnId,
      inputId: payload.inputId,
      jobId: job.id,
      workerId,
      leaseToken
    })
    observeStage("turn_attempt_started", started.attempt.id)
    const activeRegistration = registerActiveAttempt(started.attempt.id)
    const controlObserver = turnControlObserver.observe({
      sessionId: payload.sessionId,
      turnId: payload.turnId,
      attemptId: started.attempt.id,
      jobId: job.id,
      startedAt: started.attempt.startedAt,
      registration: activeRegistration
    })
    try {
    const input = (await options.session.listInputs({ sessionId: payload.sessionId }))
      .find((candidate) => candidate.id === payload.inputId)
    if (input === undefined) {
      throw new Error(`started turn input not found: ${payload.inputId}`)
    }
    observeStage("input_loaded", started.attempt.id)
    assertTurnResourcesMatchBinding(
      input.content,
      started.turn.executionBinding.resources
    )
    const resolvedContext = await options.resolveAgentContext?.({
      sessionId: payload.sessionId,
      turnId: payload.turnId,
      inputId: payload.inputId,
      ...(input.origin === undefined ? {} : { origin: input.origin }),
      executionBinding: started.turn.executionBinding,
      signal
    })
    const agentContext = resolvedContext ?? options.agentContext
    assertAgentContextMatchesBinding(started.turn.executionBinding, agentContext)
    observeStage("context_resolved", started.attempt.id)
    const provider = await providerForTurnBinding(
      started.turn.executionBinding,
      {
        storage: options.storage,
        ...(options.directProvider === undefined
          ? {}
          : { directProvider: options.directProvider }),
        ...(options.secretResolver === undefined
          ? {}
          : { secretResolver: options.secretResolver })
      }
    )
    observeStage("provider_resolved", started.attempt.id)
    const runner = new WanexAgentRunner({
      session: options.session,
      provider,
      ...(agentContext?.tools === undefined ? {} : { tools: agentContext.tools }),
      ...(agentContext?.toolPermissionPolicy === undefined
        ? {}
        : { toolPermissionPolicy: agentContext.toolPermissionPolicy }),
      ...(options.toolMaxConcurrency === undefined
        ? {}
        : { toolMaxConcurrency: options.toolMaxConcurrency }),
      contextCompiler:
        agentContext?.contextCompiler ??
        new SemanticContextCompiler({ epochStore: options.storage }),
      compactContext: createInlineContextCapacityCompactor({
        storage: options.storage,
        job,
        modelEndpoint: started.turn.executionBinding.modelEndpoint,
        provider
      }),
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
      ...(options.observeProviderEvent === undefined
        ? {}
        : { observeProviderEvent: options.observeProviderEvent }),
      ...(options.observeExecutionStage === undefined
        ? {}
        : { observeExecutionStage: options.observeExecutionStage })
    })
    const result = await runner.executeTurn({
      execution: {
        sessionId: payload.sessionId,
        turnId: payload.turnId,
        attemptId: started.attempt.id,
        inputId: payload.inputId,
        jobId: job.id,
        workerId,
        leaseToken,
        principalId: input.principalId,
        maxSteps: started.turn.maxSteps,
        maxOutputTokens:
          started.turn.executionBinding.completion.maxOutputTokens,
        recovery: started.turn.executionBinding.recovery,
        ...(job.budgetGrantId === undefined
          ? {}
          : { budgetGrantId: job.budgetGrantId })
      },
      signal,
      heartbeat
    })
    if (result.outcome === "suspended") {
      const suspendedJob = "sessionJob" in result.receipt
        ? result.receipt.sessionJob
        : result.receipt.job
      return workerAcknowledged(suspendedJob)
    }
    return workerAcknowledged(result.settlement.job, result.error)
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error))
      const abortReason = readActiveAbortReason(signal)
      if (
        abortReason?.kind === "lease_lost" ||
        abortReason?.kind === "host_shutdown"
      ) {
        throw normalized
      }
      const settlement = await options.session.settleTurn({
        sessionId: payload.sessionId,
        turnId: payload.turnId,
        attemptId: started.attempt.id,
        inputId: payload.inputId,
        jobId: job.id,
        workerId,
        leaseToken,
        outcome: "failed",
        error: { name: normalized.name, message: normalized.message },
        reason: normalized.message
      })
      return workerAcknowledged(settlement.job, normalized)
    } finally {
      await controlObserver.stop()
    }
  }
}

export function registerSessionTurnHandler(
  options: RegisterSessionTurnHandlerOptions
): void {
  options.worker.register("session.turn", createSessionTurnHandler(options))
}

function parseSessionTurnPayload(payload: JsonValue): SessionTurnJobPayload {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("session.turn payload must be an object")
  }
  const record = payload as Record<string, JsonValue>
  return {
    sessionId: expectString(record.sessionId, "session.turn.sessionId"),
    turnId: expectString(record.turnId, "session.turn.turnId"),
    inputId: expectString(record.inputId, "session.turn.inputId")
  }
}

function expectString(value: JsonValue | undefined, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`)
  }
  return value
}

function requireField(value: string | undefined, label: string): string {
  if (value === undefined || value.length === 0) {
    throw new Error(`${label} is missing`)
  }
  return value
}

export function sessionTurnJobIdentity(job: SchedulerJobRecord): SessionTurnJobPayload {
  return parseSessionTurnPayload(job.payload)
}
