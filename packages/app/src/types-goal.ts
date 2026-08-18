import type {
  BudgetLimit,
  ObjectiveAttemptRecord,
  ObjectiveAttemptReviewRecord,
  ObjectiveRecord,
  ObjectiveState,
  ObjectiveVerificationRecord
} from "@wanex/protocol"

export interface WanexAppGoalCommands {
  startGoal(request: WanexAppStartGoalRequest): Promise<WanexAppGoalView>
  readGoal(request: WanexAppReadGoalRequest): Promise<WanexAppGoalView | null>
  listGoals(request?: WanexAppListGoalsRequest): Promise<readonly ObjectiveRecord[]>
  pauseGoal(request: WanexAppChangeGoalStateRequest): Promise<WanexAppGoalView>
  resumeGoal(request: WanexAppChangeGoalStateRequest): Promise<WanexAppGoalView>
  cancelGoal(request: WanexAppCancelGoalRequest): Promise<WanexAppGoalView>
}

export interface WanexAppStartGoalRequest {
  readonly id?: string
  readonly sessionId: string
  readonly objective: string
  readonly boundaries?: readonly string[]
  readonly constraints?: readonly string[]
  readonly successCriteria: readonly string[]
  readonly stopPolicy?: WanexAppGoalStopPolicy
  readonly idempotencyKey: string
}

export interface WanexAppGoalStopPolicy {
  readonly maxAttempts?: number
  readonly maxConsecutiveBlockedAttempts?: number
  readonly deadlineAt?: number
  readonly budget?: BudgetLimit
}

export interface WanexAppReadGoalRequest {
  readonly objectiveId: string
}

export interface WanexAppListGoalsRequest {
  readonly sessionId?: string
  readonly states?: readonly ObjectiveState[]
  readonly limit?: number
}

export interface WanexAppChangeGoalStateRequest {
  readonly objectiveId: string
  readonly expectedRevision: number
  readonly reason?: string
  readonly idempotencyKey: string
}

export interface WanexAppCancelGoalRequest {
  readonly objectiveId: string
  readonly expectedRevision: number
  readonly reason: string
  readonly idempotencyKey: string
}

export interface WanexAppGoalView {
  readonly objective: ObjectiveRecord
  readonly attempts: readonly ObjectiveAttemptRecord[]
  readonly reviews: readonly ObjectiveAttemptReviewRecord[]
  readonly verifications: readonly ObjectiveVerificationRecord[]
}
