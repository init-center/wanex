import { randomUUID } from "node:crypto"
import type { BudgetLimit, ObjectiveRecord, ObjectiveState } from "@wanex/protocol"
import type { BackendShell } from "@wanex/assistant/backend"
import {
  providerNotReadyError,
  projectProviderReadiness
} from "../provider/readiness.js"
import {
  resolveSessionId,
  type MutableState
} from "../state/assistant.js"
import type {
  CancelGoalRequest,
  ChangeGoalStateRequest,
  GoalEvents,
  GoalInvalidatedEvent,
  GoalReadModel,
  ReadGoalRequest,
  ReadGoalResult,
  StartGoalRequest
} from "./model.js"

const LIVE_GOAL_STATES = new Set<ObjectiveState>([
  "active",
  "paused",
  "blocked",
  "cancel_requested"
])
const MAX_GOAL_TEXT_BYTES = 32_768
const MAX_GOAL_LIST_ITEMS = 64
const MAX_GOAL_ITEM_BYTES = 4_096
const MAX_GOAL_REASON_CHARACTERS = 2_048
const MAX_PROJECTED_ATTEMPTS = 100

type GoalBackend = {
  readonly commands: Pick<
    BackendShell["commands"],
    | "startGoal"
    | "readGoal"
    | "listGoals"
    | "pauseGoal"
    | "resumeGoal"
    | "cancelGoal"
    | "readSession"
    | "listModelEndpoints"
  >
  readonly events: BackendShell["events"]
}

export interface GoalShellOptions {
  readonly backend: GoalBackend
  readonly state: MutableState
}

export interface GoalShell {
  readonly events: GoalEvents
  read(request?: ReadGoalRequest): Promise<ReadGoalResult>
  start(request: StartGoalRequest): Promise<GoalReadModel>
  pause(request: ChangeGoalStateRequest): Promise<GoalReadModel>
  resume(request: ChangeGoalStateRequest): Promise<GoalReadModel>
  cancel(request: CancelGoalRequest): Promise<GoalReadModel>
  dispose(): Promise<void>
}

export function createGoalShell(
  options: GoalShellOptions
): GoalShell {
  const listeners = new Set<
    Parameters<GoalEvents["subscribeGoalEvents"]>[0]
  >()
  let sequence = 0
  let disposed = false
  const unsubscribe = options.backend.events.subscribeGoalEvents((event) => {
    if (disposed) return
    sequence += 1
    const projected: GoalInvalidatedEvent = {
      kind: "assistant.goal.invalidated",
      sequence,
      at: event.at,
      goalId: event.objectiveId,
      sessionId: event.sessionId,
      cause: event.cause
    }
    for (const listener of listeners) {
      try {
        listener(projected)
      } catch {
        // Presentation listeners cannot affect canonical Goal coordination.
      }
    }
  })

  return {
    events: {
      subscribeGoalEvents(listener) {
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
    async read(request = {}) {
      const explicitGoalId = optionalIdentity(request.goalId, "goalId")
      if (explicitGoalId !== undefined) {
        const view = await options.backend.commands.readGoal({
          objectiveId: explicitGoalId
        })
        if (view === null) {
          return { kind: "assistant.goal.missing", goalId: explicitGoalId }
        }
        const sessionId = resolveSessionId(
          options.state,
          request.sessionId
        )
        if (sessionId !== undefined && view.objective.sessionId !== sessionId) {
          throw new Error("Goal does not belong to the selected Session")
        }
        return { kind: "assistant.goal.found", goal: projectGoal(view) }
      }

      const sessionId = resolveSessionId(options.state, request.sessionId)
      if (sessionId === undefined) {
        return {
          kind: "assistant.goal.no-session",
          message: "select a session before reading its Goal"
        }
      }
      const goals = await options.backend.commands.listGoals({
        sessionId,
        limit: MAX_PROJECTED_ATTEMPTS
      })
      const selected = currentSessionGoal(goals)
      if (selected === undefined) {
        return { kind: "assistant.goal.missing", sessionId }
      }
      const view = await options.backend.commands.readGoal({
        objectiveId: selected.id
      })
      if (view === null) {
        throw new Error(`Goal disappeared during canonical read: ${selected.id}`)
      }
      return { kind: "assistant.goal.found", goal: projectGoal(view) }
    },
    async start(request) {
      const sessionId = await requireRunnableSession(options, request.sessionId)
      const objective = boundedRequiredText(
        request.objective,
        "Goal objective",
        MAX_GOAL_TEXT_BYTES
      )
      const boundaries = boundedTextList(request.boundaries ?? [], "Goal boundary")
      const constraints = boundedTextList(request.constraints ?? [], "Goal constraint")
      const successCriteria = boundedTextList(
        request.successCriteria,
        "Goal success criterion"
      )
      if (successCriteria.length === 0) {
        throw new Error("Goal requires at least one success criterion")
      }
      const stopPolicy = normalizeStopPolicy(request.stopPolicy)
      const view = await options.backend.commands.startGoal({
        sessionId,
        objective,
        boundaries,
        constraints,
        successCriteria,
        ...(stopPolicy === undefined ? {} : { stopPolicy }),
        idempotencyKey:
          optionalIdentity(request.idempotencyKey, "Goal idempotencyKey") ??
          `assistant:goal:start:${randomUUID()}`
      })
      return projectGoal(view)
    },
    async pause(request) {
      const view = await requireGoalForControl(options.backend, request.goalId)
      if (view.objective.state !== "active" && view.objective.state !== "blocked") {
        throw new Error(`Goal cannot pause from state ${view.objective.state}`)
      }
      return projectGoal(await options.backend.commands.pauseGoal({
        objectiveId: view.objective.id,
        expectedRevision: positiveInteger(
          request.expectedRevision,
          "Goal expectedRevision"
        ),
        ...(request.reason === undefined
          ? {}
          : {
              reason: boundedRequiredText(
                request.reason,
                "Goal reason",
                MAX_GOAL_ITEM_BYTES
              )
            }),
        idempotencyKey:
          optionalIdentity(request.idempotencyKey, "Goal idempotencyKey") ??
          `assistant:goal:pause:${randomUUID()}`
      }))
    },
    async resume(request) {
      const view = await requireGoalForControl(options.backend, request.goalId)
      if (view.objective.state !== "paused" && view.objective.state !== "blocked") {
        throw new Error(`Goal cannot resume from state ${view.objective.state}`)
      }
      await requireRunnableSession(options, view.objective.sessionId)
      return projectGoal(await options.backend.commands.resumeGoal({
        objectiveId: view.objective.id,
        expectedRevision: positiveInteger(
          request.expectedRevision,
          "Goal expectedRevision"
        ),
        ...(request.reason === undefined
          ? {}
          : {
              reason: boundedRequiredText(
                request.reason,
                "Goal reason",
                MAX_GOAL_ITEM_BYTES
              )
            }),
        idempotencyKey:
          optionalIdentity(request.idempotencyKey, "Goal idempotencyKey") ??
          `assistant:goal:resume:${randomUUID()}`
      }))
    },
    async cancel(request) {
      const view = await requireGoalForControl(options.backend, request.goalId)
      if (!canCancelGoal(view.objective.state)) {
        throw new Error(`Goal cannot cancel from state ${view.objective.state}`)
      }
      return projectGoal(await options.backend.commands.cancelGoal({
        objectiveId: view.objective.id,
        expectedRevision: positiveInteger(
          request.expectedRevision,
          "Goal expectedRevision"
        ),
        reason: boundedRequiredText(
          request.reason,
          "Goal cancellation reason",
          MAX_GOAL_ITEM_BYTES
        ),
        idempotencyKey:
          optionalIdentity(request.idempotencyKey, "Goal idempotencyKey") ??
          `assistant:goal:cancel:${randomUUID()}`
      }))
    },
    async dispose() {
      if (disposed) return
      disposed = true
      unsubscribe()
      listeners.clear()
    }
  }
}

function projectGoal(
  view: NonNullable<
    Awaited<ReturnType<GoalBackend["commands"]["readGoal"]>>
  >
): GoalReadModel {
  const reviews = new Map(view.reviews.map((review) => [review.attemptId, review]))
  const verifications = new Map<string, typeof view.verifications>()
  for (const verification of view.verifications) {
    const current = verifications.get(verification.attemptId) ?? []
    verifications.set(verification.attemptId, [...current, verification])
  }
  const objective = view.objective
  return {
    kind: "assistant.goal",
    goalId: objective.id,
    sessionId: objective.sessionId,
    revision: objective.revision,
    state: objective.state,
    objective: objective.objective,
    boundaries: [...objective.boundaries],
    constraints: [...objective.constraints],
    successCriteria: objective.successCriteria.map((criterion) => ({ ...criterion })),
    stopPolicy: {
      maxAttempts: objective.stopPolicy.maxAttempts,
      maxConsecutiveBlockedAttempts:
        objective.stopPolicy.maxConsecutiveBlockedAttempts,
      ...(objective.stopPolicy.deadlineAt === undefined
        ? {}
        : { deadlineAt: objective.stopPolicy.deadlineAt }),
      ...(objective.stopPolicy.budget === undefined
        ? {}
        : { budget: { ...objective.stopPolicy.budget } })
    },
    reason: {
      code: objective.reason.code,
      ...(objective.reason.detail === undefined
        ? {}
        : {
            detail: boundedOutput(
              objective.reason.detail,
              MAX_GOAL_REASON_CHARACTERS
            )
          })
    },
    attemptCount: view.attempts.length,
    ...(objective.activeAttemptId === undefined
      ? {}
      : { activeAttemptId: objective.activeAttemptId }),
    attempts: view.attempts.slice(0, MAX_PROJECTED_ATTEMPTS).map((attempt) => {
      const review = reviews.get(attempt.id)
      return {
        attemptId: attempt.id,
        attemptNumber: attempt.attemptNumber,
        inputId: attempt.inputId,
        turnId: attempt.turnId,
        jobId: attempt.jobId,
        trigger: attempt.trigger,
        boundAt: attempt.boundAt,
        ...(review === undefined
          ? {}
          : {
              review: {
                disposition: review.disposition,
                ...(review.reason === undefined
                  ? {}
                  : {
                      reason: boundedOutput(
                        review.reason,
                        MAX_GOAL_REASON_CHARACTERS
                      )
                    }),
                createdAt: review.createdAt
              }
            }),
        verifications: (verifications.get(attempt.id) ?? []).map(
          (verification) => ({
            requirementId: verification.requirementId,
            result: verification.result,
            ...(verification.reason === undefined
              ? {}
              : {
                  reason: boundedOutput(
                    verification.reason,
                    MAX_GOAL_REASON_CHARACTERS
                  )
                }),
            createdAt: verification.createdAt
          })
        )
      }
    }),
    canPause: objective.state === "active" || objective.state === "blocked",
    canResume: objective.state === "paused" || objective.state === "blocked",
    canCancel: canCancelGoal(objective.state),
    createdAt: objective.createdAt,
    updatedAt: objective.updatedAt,
    ...(objective.closedAt === undefined ? {} : { closedAt: objective.closedAt })
  }
}

async function requireRunnableSession(
  options: GoalShellOptions,
  requestedSessionId: string | undefined
): Promise<string> {
  const sessionId = resolveSessionId(options.state, requestedSessionId)
  if (sessionId === undefined) {
    throw new Error("select an active Session before starting or resuming a Goal")
  }
  const [session, endpoints] = await Promise.all([
    options.backend.commands.readSession({ sessionId }),
    options.backend.commands.listModelEndpoints()
  ])
  if (session.kind === "wanex-app.session.missing") {
    throw new Error(`Goal Session does not exist: ${sessionId}`)
  }
  if (session.session.status !== "active") {
    throw new Error(`Goal Session is archived: ${sessionId}`)
  }
  const readiness = projectProviderReadiness(endpoints)
  if (!readiness.canRun) {
    throw new Error(providerNotReadyError(readiness).message)
  }
  return sessionId
}

async function requireGoalForControl(
  backend: GoalBackend,
  goalId: string
) {
  const normalized = boundedRequiredText(goalId, "goalId", 512)
  const view = await backend.commands.readGoal({ objectiveId: normalized })
  if (view === null) throw new Error(`Goal does not exist: ${normalized}`)
  return view
}

function currentSessionGoal(
  goals: readonly ObjectiveRecord[]
): ObjectiveRecord | undefined {
  return goals.find((goal) => LIVE_GOAL_STATES.has(goal.state)) ?? goals[0]
}

function canCancelGoal(state: ObjectiveState): boolean {
  return state === "active" || state === "paused" || state === "blocked"
}

function normalizeStopPolicy(
  value: StartGoalRequest["stopPolicy"]
): StartGoalRequest["stopPolicy"] {
  if (value === undefined) return undefined
  const maxAttempts = optionalPositiveInteger(
    value.maxAttempts,
    "Goal maxAttempts",
    100
  )
  const maxBlocked = optionalPositiveInteger(
    value.maxConsecutiveBlockedAttempts,
    "Goal maxConsecutiveBlockedAttempts",
    100
  )
  if (
    maxAttempts !== undefined &&
    maxBlocked !== undefined &&
    maxBlocked > maxAttempts
  ) {
    throw new Error("Goal maxConsecutiveBlockedAttempts cannot exceed maxAttempts")
  }
  if (
    value.deadlineAt !== undefined &&
    (!Number.isSafeInteger(value.deadlineAt) || value.deadlineAt <= 0)
  ) {
    throw new Error("Goal deadlineAt must be a positive integer")
  }
  return {
    ...(maxAttempts === undefined ? {} : { maxAttempts }),
    ...(maxBlocked === undefined
      ? {}
      : { maxConsecutiveBlockedAttempts: maxBlocked }),
    ...(value.deadlineAt === undefined ? {} : { deadlineAt: value.deadlineAt }),
    ...(value.budget === undefined
      ? {}
      : { budget: normalizeBudget(value.budget) })
  }
}

function normalizeBudget(value: BudgetLimit): BudgetLimit {
  const entries = Object.entries(value)
  for (const [name, amount] of entries) {
    if (amount !== undefined && (!Number.isSafeInteger(amount) || amount <= 0)) {
      throw new Error(`Goal budget ${name} must be a positive integer`)
    }
  }
  return { ...value }
}

function boundedTextList(values: readonly string[], label: string): readonly string[] {
  if (values.length > MAX_GOAL_LIST_ITEMS) {
    throw new Error(`${label} list exceeds ${MAX_GOAL_LIST_ITEMS} items`)
  }
  return values.map((value) =>
    boundedRequiredText(value, label, MAX_GOAL_ITEM_BYTES)
  )
}

function boundedRequiredText(value: string, label: string, maxBytes: number): string {
  const normalized = value.trim()
  if (normalized.length === 0) throw new Error(`${label} must not be empty`)
  if (Buffer.byteLength(normalized, "utf8") > maxBytes) {
    throw new Error(`${label} exceeds ${maxBytes} bytes`)
  }
  return normalized
}

function boundedOutput(value: string, maxCharacters: number): string {
  const characters = Array.from(value)
  return characters.length <= maxCharacters
    ? value
    : `${characters.slice(0, Math.max(0, maxCharacters - 3)).join("")}...`
}

function optionalIdentity(value: string | undefined, label: string): string | undefined {
  return value === undefined ? undefined : boundedRequiredText(value, label, 512)
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be positive`)
  }
  return value
}

function optionalPositiveInteger(
  value: number | undefined,
  label: string,
  max: number
): number | undefined {
  if (value === undefined) return undefined
  if (!Number.isSafeInteger(value) || value <= 0 || value > max) {
    throw new Error(`${label} must be an integer from 1 to ${max}`)
  }
  return value
}
