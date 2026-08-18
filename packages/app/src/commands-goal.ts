import type { ObjectiveRecord } from "@wanex/protocol"
import type { WanexAppCommandContext } from "./command-context.js"
import {
  readWanexAppGoalView,
  requireWanexAppGoalObjective
} from "./goal-read-model.js"
import type {
  WanexAppGoalCommands,
  WanexAppGoalStopPolicy,
  WanexAppGoalView,
  WanexAppStartGoalRequest
} from "./types-goal.js"

const DEFAULT_MAX_GOAL_ATTEMPTS = 8
const DEFAULT_MAX_CONSECUTIVE_BLOCKED_ATTEMPTS = 2
const MAX_GOAL_CONTRACT_BYTES = 64 * 1024

export function createWanexAppGoalCommands(
  context: WanexAppCommandContext
): WanexAppGoalCommands {
  return {
    async startGoal(request) {
      context.assertActive()
      await context.refreshActiveModelEndpointId()
      const objective = requireWanexAppGoalObjective(
        await context.runtime.app.storage.createObjective(
          createObjectiveRequest(request)
        )
      )
      context.goalCoordinator.notifyGoalChanged(objective, "created")
      await context.goalCoordinator.reconcileSession(objective.sessionId)
      return await requireGoalView(context, objective.id)
    },
    async readGoal(request) {
      context.assertActive()
      return await readWanexAppGoalView(
        context.runtime.app.storage,
        normalizeRequiredString(request.objectiveId, "goal objectiveId")
      )
    },
    async listGoals(request = {}) {
      context.assertActive()
      return await context.runtime.app.storage.listObjectives({
        principalId: "wanex-app-goal",
        ...(request.sessionId === undefined
          ? {}
          : { sessionId: normalizeRequiredString(request.sessionId, "goal sessionId") }),
        ...(request.states === undefined ? {} : { states: request.states }),
        ...(request.limit === undefined ? {} : { limit: request.limit })
      })
    },
    async pauseGoal(request) {
      context.assertActive()
      await requireOwnedGoal(context, request.objectiveId)
      const objective = await context.runtime.app.storage.pauseObjective({
        ...request,
        objectiveId: normalizeRequiredString(request.objectiveId, "goal objectiveId"),
        idempotencyKey: normalizeRequiredString(
          request.idempotencyKey,
          "goal idempotencyKey"
        )
      })
      context.goalCoordinator.notifyGoalChanged(objective, "paused")
      return await requireGoalView(context, objective.id)
    },
    async resumeGoal(request) {
      context.assertActive()
      await requireOwnedGoal(context, request.objectiveId)
      const objective = requireWanexAppGoalObjective(
        await context.runtime.app.storage.resumeObjective({
          ...request,
          objectiveId: normalizeRequiredString(request.objectiveId, "goal objectiveId"),
          idempotencyKey: normalizeRequiredString(
            request.idempotencyKey,
            "goal idempotencyKey"
          )
        })
      )
      context.goalCoordinator.notifyGoalChanged(objective, "resumed")
      await context.goalCoordinator.reconcileSession(objective.sessionId)
      return await requireGoalView(context, objective.id)
    },
    async cancelGoal(request) {
      context.assertActive()
      const objective = await context.goalCoordinator.cancelObjective({
        ...request,
        objectiveId: normalizeRequiredString(request.objectiveId, "goal objectiveId"),
        reason: normalizeRequiredString(request.reason, "goal cancellation reason"),
        idempotencyKey: normalizeRequiredString(
          request.idempotencyKey,
          "goal idempotencyKey"
        )
      })
      return await requireGoalView(context, objective.id)
    }
  }
}

function createObjectiveRequest(request: WanexAppStartGoalRequest) {
  const objective = normalizeRequiredString(request.objective, "goal objective")
  const sessionId = normalizeRequiredString(request.sessionId, "goal sessionId")
  const idempotencyKey = normalizeRequiredString(
    request.idempotencyKey,
    "goal idempotencyKey"
  )
  const boundaries = normalizeStringList(request.boundaries ?? [], "goal boundary")
  const constraints = normalizeStringList(request.constraints ?? [], "goal constraint")
  const criteria = normalizeStringList(request.successCriteria, "goal success criterion")
  if (criteria.length === 0) {
    throw new Error("goal requires at least one success criterion")
  }
  const contractBytes = Buffer.byteLength(
    JSON.stringify({ objective, boundaries, constraints, criteria }),
    "utf8"
  )
  if (contractBytes > MAX_GOAL_CONTRACT_BYTES) {
    throw new Error("goal contract exceeds 65536 bytes")
  }
  const criterionRecords = criteria.map((description, index) => ({
    id: `goal_criterion_${String(index + 1).padStart(3, "0")}`,
    description
  }))
  return {
    ...(request.id === undefined
      ? {}
      : { id: normalizeRequiredString(request.id, "goal id") }),
    sessionId,
    principalId: "wanex-app-goal",
    objective,
    boundaries,
    constraints,
    successCriteria: criterionRecords,
    verificationPolicy: {
      requirements: [{
        id: "goal_completion",
        criterionIds: criterionRecords.map((criterion) => criterion.id),
        verifierKind: "model" as const,
        verifierRef: "wanex-app-goal-verifier-v1"
      }]
    },
    stopPolicy: normalizeStopPolicy(request.stopPolicy),
    idempotencyKey
  }
}

function normalizeStopPolicy(
  policy: WanexAppGoalStopPolicy | undefined
) {
  return {
    maxAttempts: policy?.maxAttempts ?? DEFAULT_MAX_GOAL_ATTEMPTS,
    maxConsecutiveBlockedAttempts:
      policy?.maxConsecutiveBlockedAttempts ??
      DEFAULT_MAX_CONSECUTIVE_BLOCKED_ATTEMPTS,
    ...(policy?.deadlineAt === undefined ? {} : { deadlineAt: policy.deadlineAt }),
    ...(policy?.budget === undefined ? {} : { budget: policy.budget })
  }
}

function normalizeStringList(
  values: readonly string[],
  label: string
): readonly string[] {
  return values.map((value) => normalizeRequiredString(value, label))
}

function normalizeRequiredString(value: string, label: string): string {
  const normalized = value.trim()
  if (normalized.length === 0) {
    throw new Error(`${label} must not be empty`)
  }
  return normalized
}

async function requireOwnedGoal(
  context: WanexAppCommandContext,
  objectiveId: string
): Promise<ObjectiveRecord> {
  const objective = await context.runtime.app.storage.getObjective({
    objectiveId: normalizeRequiredString(objectiveId, "goal objectiveId")
  })
  if (objective === null) {
    throw new Error(`goal does not exist: ${objectiveId}`)
  }
  return requireWanexAppGoalObjective(objective)
}

async function requireGoalView(
  context: WanexAppCommandContext,
  objectiveId: string
): Promise<WanexAppGoalView> {
  const view = await readWanexAppGoalView(
    context.runtime.app.storage,
    objectiveId
  )
  if (view === null) {
    throw new Error(`goal does not exist: ${objectiveId}`)
  }
  return view
}
