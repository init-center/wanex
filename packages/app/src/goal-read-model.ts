import type { ObjectiveRecord, SessionMessageRecord, SessionTurnRecord } from "@wanex/protocol"
import type { AppStore } from "./storage.js"
import type { WanexAppGoalView } from "./types-goal.js"

const MAX_COHERENT_READ_ATTEMPTS = 3

export async function readWanexAppGoalView(
  storage: AppStore,
  objectiveId: string
): Promise<WanexAppGoalView | null> {
  for (let readAttempt = 0; readAttempt < MAX_COHERENT_READ_ATTEMPTS; readAttempt += 1) {
    const before = await storage.getObjective({ objectiveId })
    if (before === null) {
      return null
    }
    requireWanexAppGoalObjective(before)
    const [attempts, reviews, verifications, after] = await Promise.all([
      storage.listObjectiveAttempts({ objectiveId }),
      storage.listObjectiveAttemptReviews({ objectiveId }),
      storage.listObjectiveVerifications({ objectiveId }),
      storage.getObjective({ objectiveId })
    ])
    if (after === null) {
      return null
    }
    requireWanexAppGoalObjective(after)
    if (before.revision === after.revision) {
      return { objective: after, attempts, reviews, verifications }
    }
  }
  throw new Error("goal changed while its read model was being assembled")
}

export function requireWanexAppGoalObjective(
  objective: ObjectiveRecord
): ObjectiveRecord {
  if (objective.principalId !== "wanex-app-goal") {
    throw new Error("objective is not owned by Wanex App Goal Mode")
  }
  return objective
}

export function messagesThroughGoalAttempt(options: {
  readonly messages: readonly SessionMessageRecord[]
  readonly turns: readonly SessionTurnRecord[]
  readonly turnId: string
}): readonly SessionMessageRecord[] {
  const turnIndex = options.turns.findIndex((turn) => turn.id === options.turnId)
  if (turnIndex < 0) {
    throw new Error(`goal attempt turn does not exist: ${options.turnId}`)
  }
  const eligibleTurnIds = new Set(
    options.turns.slice(0, turnIndex + 1).map((turn) => turn.id)
  )
  return options.messages.filter((message) => eligibleTurnIds.has(message.turnId))
}
