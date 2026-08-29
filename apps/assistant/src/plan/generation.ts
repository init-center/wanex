import { randomUUID } from "node:crypto"
import {
  projectBackendSafeError,
  type BackendShell
} from "@wanex/assistant/backend"
import {
  providerNotReadyError,
  projectProviderReadiness
} from "../provider/readiness.js"
import {
  copyState,
  resolveSessionId,
  selectedSessionId,
  type StateCoordinator
} from "../state/assistant.js"
import type {
  DismissPlanGenerationResult,
  PlanEvents,
  PlanGenerationReadModel,
  PlanGenerationReference,
  PlanInvalidationCause,
  ReadPlanGenerationResult,
  StartPlanGenerationRequest
} from "./model.js"

const MAX_PLANNING_REQUEST_CHARACTERS = 32_768
const MAX_OUTPUT_TOKENS = 16_384
const MAX_RETAINED_GENERATIONS = 128
const MAX_ERROR_CHARACTERS = 2_048

type PlanGenerationBackend = {
  readonly commands: Pick<
    BackendShell["commands"],
    | "generatePlanProposal"
    | "readSession"
    | "listModelEndpoints"
  >
}

interface RetainedPlanGeneration {
  readonly controller: AbortController
  model: PlanGenerationReadModel
  task?: Promise<void>
}

export interface PlanGenerationCoordinator {
  readonly events: PlanEvents
  start(
    request: StartPlanGenerationRequest
  ): Promise<PlanGenerationReadModel>
  read(
    request: PlanGenerationReference
  ): ReadPlanGenerationResult
  cancel(
    request: PlanGenerationReference
  ): Promise<PlanGenerationReadModel>
  dismiss(
    request: PlanGenerationReference
  ): Promise<DismissPlanGenerationResult>
  invalidate(request: {
    readonly cause: PlanInvalidationCause
    readonly sessionId?: string
    readonly operationId?: string
    readonly proposalId?: string
  }): void
  dispose(): Promise<void>
}

export function createPlanGenerationCoordinator(request: {
  readonly backend: PlanGenerationBackend
  readonly state: StateCoordinator
  readonly now?: () => number
  readonly createOperationId?: () => string
}): PlanGenerationCoordinator {
  const now = request.now ?? Date.now
  const createOperationId =
    request.createOperationId ?? (() => `plangen_${randomUUID()}`)
  const generations = new Map<string, RetainedPlanGeneration>()
  const activeBySession = new Map<string, string>()
  const listeners = new Set<
    Parameters<PlanEvents["subscribePlanEvents"]>[0]
  >()
  let eventSequence = 0
  let disposed = false
  let tail: Promise<void> = Promise.resolve()

  function serialize<T>(run: () => Promise<T>): Promise<T> {
    const result = tail.then(run, run)
    tail = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  function emit(
    cause: PlanInvalidationCause,
    retained?: RetainedPlanGeneration,
    explicit?: {
      readonly sessionId?: string
      readonly operationId?: string
      readonly proposalId?: string
    }
  ): void {
    if (disposed) return
    eventSequence += 1
    const model = retained?.model
    const sessionId = explicit?.sessionId ?? model?.sessionId
    const operationId = explicit?.operationId ?? model?.operationId
    const proposalId = explicit?.proposalId ?? model?.proposalId
    const event = {
      kind: "assistant.plan.invalidated" as const,
      sequence: eventSequence,
      at: now(),
      cause,
      ...(sessionId === undefined ? {} : { sessionId }),
      ...(operationId === undefined ? {} : { operationId }),
      ...(proposalId === undefined ? {} : { proposalId })
    }
    for (const listener of listeners) {
      try {
        listener(event)
      } catch {
        // Presentation subscribers are isolated from coordinator state.
      }
    }
  }

  async function execute(
    retained: RetainedPlanGeneration,
    input: StartPlanGenerationRequest,
    text: string
  ): Promise<void> {
    try {
      const proposal = await request.backend.commands.generatePlanProposal({
        sessionId: retained.model.sessionId,
        planningRequest: [
          {
            id: `part_plan_request_${retained.model.operationId}`,
            type: "text",
            text
          }
        ],
        idempotencyKey:
          normalizeOptionalIdentity(input.idempotencyKey) ??
          `assistant:plan-generation:${retained.model.operationId}`,
        ...(input.maxOutputTokens === undefined
          ? {}
          : { maxOutputTokens: input.maxOutputTokens }),
        signal: retained.controller.signal
      })
      if (!settleRunning(retained, {
        state: "succeeded",
        proposalId: proposal.id
      })) {
        return
      }
      await request.state.mutate(async (state) => {
        if (selectedSessionId(state) !== retained.model.sessionId) {
          return { value: undefined }
        }
        const next = copyState(state)
        next.selectedPlanProposalId = proposal.id
        return { value: undefined, next }
      })
      emit("generation_succeeded", retained)
    } catch (error) {
      const projected = projectBackendSafeError(error)
      if (!settleRunning(retained, {
        state: "failed",
        error: {
          ...projected,
          message: boundedText(projected.message, MAX_ERROR_CHARACTERS)
        }
      })) {
        return
      }
      emit("generation_failed", retained)
    }
  }

  function settleRunning(
    retained: RetainedPlanGeneration,
    terminal:
      | {
          readonly state: "succeeded"
          readonly proposalId: string
        }
      | {
          readonly state: "failed"
          readonly error: NonNullable<PlanGenerationReadModel["error"]>
        }
  ): boolean {
    if (retained.model.state !== "running") return false
    const finishedAt = now()
    const base = {
      kind: retained.model.kind,
      operationId: retained.model.operationId,
      sessionId: retained.model.sessionId,
      startedAt: retained.model.startedAt,
      updatedAt: finishedAt,
      finishedAt
    }
    retained.model =
      terminal.state === "succeeded"
        ? { ...base, state: "succeeded", proposalId: terminal.proposalId }
        : { ...base, state: "failed", error: terminal.error }
    activeBySession.delete(retained.model.sessionId)
    pruneTerminalGenerations(generations)
    return true
  }

  return {
    events: {
      subscribePlanEvents(listener) {
        if (disposed) return () => {}
        listeners.add(listener)
        let subscribed = true
        return () => {
          if (!subscribed) return
          subscribed = false
          listeners.delete(listener)
        }
      }
    },
    async start(input) {
      return await serialize(async () => {
        assertActive(disposed)
        const text = normalizePlanningRequest(input.text)
        normalizeMaxOutputTokens(input.maxOutputTokens)
        const sessionId = resolveSessionId(
          request.state.state,
          input.sessionId
        )
        if (sessionId === undefined) {
          throw new Error("select an active session before generating a plan")
        }
        if (activeBySession.has(sessionId)) {
          throw new Error(`a plan generation is already running for Session: ${sessionId}`)
        }
        const [session, endpointList] = await Promise.all([
          request.backend.commands.readSession({ sessionId }),
          request.backend.commands.listModelEndpoints()
        ])
        if (session.kind === "wanex-app.session.missing") {
          throw new Error(`selected Plan Session does not exist: ${sessionId}`)
        }
        if (session.session.status !== "active") {
          throw new Error(`selected Plan Session is archived: ${sessionId}`)
        }
        const readiness = projectProviderReadiness(endpointList)
        if (!readiness.canRun) {
          throw new Error(providerNotReadyError(readiness).message)
        }

        const operationId = createOperationId()
        const startedAt = now()
        const retained: RetainedPlanGeneration = {
          controller: new AbortController(),
          model: {
            kind: "assistant.plan-generation",
            operationId,
            sessionId,
            state: "running",
            startedAt,
            updatedAt: startedAt
          }
        }
        generations.set(operationId, retained)
        activeBySession.set(sessionId, operationId)
        emit("generation_started", retained)
        retained.task = Promise.resolve().then(
          async () => await execute(retained, input, text)
        )
        return copyGeneration(retained.model)
      })
    },
    read(input) {
      const operationId = normalizeRequiredIdentity(
        input.operationId,
        "Plan generation operationId"
      )
      const retained = generations.get(operationId)
      if (retained === undefined) {
        return { kind: "assistant.plan-generation.missing", operationId }
      }
      return {
        kind: "assistant.plan-generation.found",
        generation: copyGeneration(retained.model)
      }
    },
    async cancel(input) {
      return await serialize(async () => {
        assertActive(disposed)
        const retained = requireGeneration(generations, input.operationId)
        if (retained.model.state !== "running") {
          throw new Error(`Plan generation is not running: ${retained.model.operationId}`)
        }
        const finishedAt = now()
        retained.model = {
          ...retained.model,
          state: "cancelled",
          updatedAt: finishedAt,
          finishedAt
        }
        activeBySession.delete(retained.model.sessionId)
        emit("generation_cancelled", retained)
        retained.controller.abort()
        await retained.task
        return copyGeneration(retained.model)
      })
    },
    async dismiss(input) {
      return await serialize(async () => {
        assertActive(disposed)
        const retained = requireGeneration(generations, input.operationId)
        if (retained.model.state === "running") {
          throw new Error(`cannot dismiss a running Plan generation: ${retained.model.operationId}`)
        }
        generations.delete(retained.model.operationId)
        emit("generation_dismissed", retained)
        return {
          kind: "assistant.plan-generation.dismissed",
          operationId: retained.model.operationId
        }
      })
    },
    invalidate(input) {
      emit(input.cause, undefined, input)
    },
    async dispose() {
      await serialize(async () => {
        if (disposed) return
        const running = [...generations.values()].filter(
          (retained) => retained.model.state === "running"
        )
        for (const retained of running) {
          const finishedAt = now()
          retained.model = {
            ...retained.model,
            state: "cancelled",
            updatedAt: finishedAt,
            finishedAt
          }
          retained.controller.abort()
        }
        await Promise.all(running.map(async (retained) => await retained.task))
        disposed = true
        generations.clear()
        activeBySession.clear()
        listeners.clear()
      })
    }
  }
}

function normalizePlanningRequest(value: string): string {
  const text = value.trim()
  if (text.length === 0) {
    throw new Error("Plan generation request must not be empty")
  }
  if (Array.from(text).length > MAX_PLANNING_REQUEST_CHARACTERS) {
    throw new Error(
      `Plan generation request must not exceed ${MAX_PLANNING_REQUEST_CHARACTERS} characters`
    )
  }
  return text
}

function normalizeMaxOutputTokens(value: number | undefined): void {
  if (value === undefined) return
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_OUTPUT_TOKENS) {
    throw new Error(
      `Plan maxOutputTokens must be an integer from 1 to ${MAX_OUTPUT_TOKENS}`
    )
  }
}

function normalizeOptionalIdentity(value: string | undefined): string | undefined {
  return value === undefined
    ? undefined
    : normalizeRequiredIdentity(value, "idempotencyKey")
}

function normalizeRequiredIdentity(value: string, label: string): string {
  const normalized = value.trim()
  if (normalized.length === 0 || normalized.length > 500) {
    throw new Error(`${label} must contain 1..=500 characters`)
  }
  return normalized
}

function requireGeneration(
  generations: ReadonlyMap<string, RetainedPlanGeneration>,
  operationId: string
): RetainedPlanGeneration {
  const normalized = normalizeRequiredIdentity(operationId, "Plan generation operationId")
  const retained = generations.get(normalized)
  if (retained === undefined) {
    throw new Error(`Plan generation does not exist: ${normalized}`)
  }
  return retained
}

function copyGeneration(
  model: PlanGenerationReadModel
): PlanGenerationReadModel {
  return {
    ...model,
    ...(model.error === undefined ? {} : { error: { ...model.error } })
  }
}

function pruneTerminalGenerations(
  generations: Map<string, RetainedPlanGeneration>
): void {
  if (generations.size <= MAX_RETAINED_GENERATIONS) return
  const removable = [...generations.entries()]
    .filter(([, retained]) => retained.model.state !== "running")
    .sort((left, right) => left[1].model.updatedAt - right[1].model.updatedAt)
  for (const [operationId] of removable) {
    if (generations.size <= MAX_RETAINED_GENERATIONS) return
    generations.delete(operationId)
  }
}

function boundedText(value: string, maxCharacters: number): string {
  return Array.from(value).slice(0, maxCharacters).join("")
}

function assertActive(disposed: boolean): void {
  if (disposed) throw new Error("Plan generation coordinator is disposed")
}
