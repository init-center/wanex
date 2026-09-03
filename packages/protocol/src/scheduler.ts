import type { JsonValue } from "./json.js"

export type SchedulerJobKind =
  | "session.turn"
  | "workspace.task"
  | "team.delivery"
  | "team.delivery.outcome"
  | "plugin.action"
  | "channel.delivery"
  | "gateway.delivery"
  | "memory.compaction"
  | "resource.cleanup"
  | "budget.grant_expire"
  | "provider.retry"
  | "config.sync"
  | "media.generate"

export const DEFAULT_SCHEDULER_QUEUE = "default" as const

export type SchedulerJobState =
  | "pending"
  | "ready"
  | "running"
  | "waiting"
  | "succeeded"
  | "retry_scheduled"
  | "failed"
  | "cancelled"

export interface RetryPolicy {
  readonly strategy: "none" | "fixed" | "exponential"
  readonly initialDelayMs?: number
  readonly maxDelayMs?: number
}

export interface EnqueueJobRequest {
  readonly id?: string
  readonly kind: SchedulerJobKind
  readonly queue?: string
  readonly principalId: string
  readonly payload: JsonValue
  readonly scheduledAt?: number
  readonly notBefore?: number
  readonly priority?: number
  readonly concurrencyKey?: string
  readonly maxAttempts?: number
  readonly retryPolicy?: RetryPolicy
  readonly idempotencyKey?: string
  readonly budgetGrantId?: string
}

export interface ClaimJobRequest {
  readonly workerId: string
  readonly leaseMs: number
  readonly kinds?: readonly SchedulerJobKind[]
  readonly queues?: readonly string[]
}

export interface HeartbeatJobRequest {
  readonly jobId: string
  readonly workerId: string
  readonly leaseToken: string
  readonly leaseMs: number
}

export interface CompleteJobRequest {
  readonly jobId: string
  readonly workerId: string
  readonly leaseToken: string
  readonly result?: JsonValue
}

export interface FailJobRequest {
  readonly jobId: string
  readonly workerId: string
  readonly leaseToken: string
  readonly error: JsonValue
}

export interface CancelJobRequest {
  readonly jobId: string
  readonly reason: string
}

export interface GetJobRequest {
  readonly jobId: string
}

export interface ListJobsRequest {
  readonly state?: SchedulerJobState
  readonly kind?: SchedulerJobKind
  readonly limit?: number
}

export interface SchedulerJobRecord {
  readonly id: string
  readonly kind: SchedulerJobKind
  readonly queue: string
  readonly state: SchedulerJobState
  readonly principalId: string
  readonly payload: JsonValue
  readonly scheduledAt: number
  readonly notBefore?: number
  readonly priority: number
  readonly concurrencyKey?: string
  readonly attempt: number
  readonly maxAttempts: number
  readonly retryPolicy: RetryPolicy
  readonly idempotencyKey?: string
  readonly budgetGrantId?: string
  readonly leaseOwner?: string
  readonly leaseToken?: string
  readonly leaseExpiresAt?: number
  readonly result?: JsonValue
  readonly lastError?: JsonValue
  readonly createdAt: number
  readonly updatedAt: number
  readonly finishedAt?: number
}
