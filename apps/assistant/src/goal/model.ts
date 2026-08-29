import type {
  BudgetLimit,
  ObjectiveAttemptDisposition,
  ObjectiveAttemptTrigger,
  ObjectiveState,
  ObjectiveStateReasonCode,
  ObjectiveVerificationResult
} from "@wanex/protocol"

export interface StartGoalRequest {
  readonly sessionId?: string
  readonly objective: string
  readonly boundaries?: readonly string[]
  readonly constraints?: readonly string[]
  readonly successCriteria: readonly string[]
  readonly stopPolicy?: GoalStopPolicy
  readonly idempotencyKey?: string
}

export interface GoalStopPolicy {
  readonly maxAttempts?: number
  readonly maxConsecutiveBlockedAttempts?: number
  readonly deadlineAt?: number
  readonly budget?: BudgetLimit
}

export interface ReadGoalRequest {
  readonly goalId?: string
  readonly sessionId?: string
}

export interface ChangeGoalStateRequest {
  readonly goalId: string
  readonly expectedRevision: number
  readonly reason?: string
  readonly idempotencyKey?: string
}

export interface CancelGoalRequest {
  readonly goalId: string
  readonly expectedRevision: number
  readonly reason: string
  readonly idempotencyKey?: string
}

export type ReadGoalResult =
  | {
      readonly kind: "assistant.goal.found"
      readonly goal: GoalReadModel
    }
  | {
      readonly kind: "assistant.goal.no-session"
      readonly message: "select a session before reading its Goal"
    }
  | {
      readonly kind: "assistant.goal.missing"
      readonly goalId?: string
      readonly sessionId?: string
    }

export interface GoalReadModel {
  readonly kind: "assistant.goal"
  readonly goalId: string
  readonly sessionId: string
  readonly revision: number
  readonly state: ObjectiveState
  readonly objective: string
  readonly boundaries: readonly string[]
  readonly constraints: readonly string[]
  readonly successCriteria: readonly GoalCriterionReadModel[]
  readonly stopPolicy: GoalStopPolicyReadModel
  readonly reason: {
    readonly code: ObjectiveStateReasonCode
    readonly detail?: string
  }
  readonly attemptCount: number
  readonly activeAttemptId?: string
  readonly attempts: readonly GoalAttemptReadModel[]
  readonly canPause: boolean
  readonly canResume: boolean
  readonly canCancel: boolean
  readonly createdAt: number
  readonly updatedAt: number
  readonly closedAt?: number
}

export interface GoalCriterionReadModel {
  readonly id: string
  readonly description: string
}

export interface GoalStopPolicyReadModel {
  readonly maxAttempts: number
  readonly maxConsecutiveBlockedAttempts: number
  readonly deadlineAt?: number
  readonly budget?: BudgetLimit
}

export interface GoalAttemptReadModel {
  readonly attemptId: string
  readonly attemptNumber: number
  readonly inputId: string
  readonly turnId: string
  readonly jobId: string
  readonly trigger: ObjectiveAttemptTrigger
  readonly boundAt: number
  readonly review?: {
    readonly disposition: ObjectiveAttemptDisposition
    readonly reason?: string
    readonly createdAt: number
  }
  readonly verifications: readonly {
    readonly requirementId: string
    readonly result: ObjectiveVerificationResult
    readonly reason?: string
    readonly createdAt: number
  }[]
}

export type GoalInvalidationCause =
  | "created"
  | "paused"
  | "resumed"
  | "attempt_admitted"
  | "attempt_reviewed"
  | "cancel_requested"
  | "cancelled"
  | "recovery_parked"
  | "limit_reached"

export interface GoalInvalidatedEvent {
  readonly kind: "assistant.goal.invalidated"
  readonly sequence: number
  readonly at: number
  readonly goalId: string
  readonly sessionId: string
  readonly cause: GoalInvalidationCause
}

export type GoalEventListener = (
  event: GoalInvalidatedEvent
) => void

export type GoalEventUnsubscribe = () => void

export interface GoalEvents {
  subscribeGoalEvents(
    listener: GoalEventListener
  ): GoalEventUnsubscribe
}
