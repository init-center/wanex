import type {
  ScheduleDefinition,
  ScheduleDefinitionSpec,
  SchedulePort,
  ScheduleStatus,
} from "@wanex/product/schedule"

export interface LocalScheduleDefinitionRecord {
  readonly kind: "local.schedule-definition"
  readonly scheduleId: string
  readonly idempotencyDigest: string
  readonly definition: ScheduleDefinitionSpec
  readonly createdAt: number
}

export interface LocalScheduleOccurrenceRecord {
  readonly kind: "local.schedule-occurrence"
  readonly scheduleId: string
  readonly definitionRevision: number
  readonly occurrenceAt: number
  readonly definition: ScheduleDefinitionSpec
  readonly execution: LocalScheduleExecutionIdentity
  readonly claimedAt: number
  readonly delivery: LocalScheduleOccurrenceDelivery
}

export interface LocalScheduleExecutionIdentity {
  readonly tickId: string
  readonly sessionId: string
  readonly inputId: string
  readonly turnId: string
  readonly jobId: string
  readonly idempotencyKey: string
  readonly jobIdempotencyKey: string
}

export type LocalScheduleOccurrenceDelivery =
  | LocalSchedulePendingDelivery
  | LocalScheduleSubmittedDelivery
  | LocalScheduleSkippedDelivery

export interface LocalSchedulePendingDelivery {
  readonly state: "pending"
  readonly attempts: number
  readonly nextAttemptAt: number
  readonly lastFailure?: {
    readonly kind: "submission_failed"
    readonly at: number
  }
}

export interface LocalScheduleSubmittedDelivery {
  readonly state: "submitted"
  readonly settledAt: number
  readonly sessionId: string
  readonly inputId: string
  readonly turnId: string
  readonly jobId: string
  readonly submittedAt: number
}

export interface LocalScheduleSkippedDelivery {
  readonly state: "skipped"
  readonly reason: "misfire" | "previous_job_active" | "superseded"
  readonly settledAt: number
  readonly previousJobId?: string
}

export interface LocalScheduleOccurrence {
  readonly record: LocalScheduleOccurrenceRecord
  readonly revision: number
  readonly updatedAt: number
}

export interface LocalScheduleOccurrencePage {
  readonly occurrences: readonly LocalScheduleOccurrence[]
  readonly nextAfterKey?: string
}

export interface LocalSchedulePendingRecord {
  readonly kind: "local.schedule-pending"
  readonly scheduleId: string
  readonly occurrenceKey: string
}

export interface LocalSchedulePendingEntry {
  readonly record: LocalSchedulePendingRecord
  readonly revision: number
  readonly updatedAt: number
}

export interface LocalScheduleDefinitionPage {
  readonly definitions: readonly ScheduleDefinition[]
  readonly invalidEntryCount: number
  readonly nextAfterKey?: string
}

export interface ClaimLocalScheduleOccurrenceRequest {
  readonly scheduleId: string
  readonly expectedDefinitionRevision: number
  readonly occurrenceAt: number
}

export type ClaimLocalScheduleOccurrenceResult =
  | {
      readonly kind: "local.schedule-occurrence.claimed"
      readonly definition: ScheduleDefinition
      readonly occurrence: LocalScheduleOccurrence
    }
  | {
      readonly kind: "local.schedule-occurrence.existing"
      readonly occurrence: LocalScheduleOccurrence
    }
  | {
      readonly kind: "local.schedule-occurrence.pending"
      readonly occurrence: LocalScheduleOccurrence
    }
  | {
      readonly kind: "local.schedule-occurrence.definition-missing"
      readonly scheduleId: string
      readonly occurrenceAt: number
    }
  | {
      readonly kind: "local.schedule-occurrence.definition-changed"
      readonly scheduleId: string
      readonly occurrenceAt: number
      readonly expectedDefinitionRevision: number
      readonly currentDefinition: ScheduleDefinition
    }
  | {
      readonly kind: "local.schedule-occurrence.definition-disabled"
      readonly scheduleId: string
      readonly occurrenceAt: number
      readonly definition: ScheduleDefinition
    }

export interface LocalScheduleAdapter {
  readonly port: SchedulePort
  listDefinitionRecords(request: {
    readonly afterKey?: string
    readonly limit: number
  }): Promise<LocalScheduleDefinitionPage>
  readStatus(scheduleId: string): Promise<ScheduleStatus | null>
  claimOccurrence(
    request: ClaimLocalScheduleOccurrenceRequest
  ): Promise<ClaimLocalScheduleOccurrenceResult>
  listOccurrences(request: {
    readonly scheduleId?: string
    readonly afterKey?: string
    readonly limit: number
  }): Promise<LocalScheduleOccurrencePage>
  listPendingOccurrences(request: {
    readonly afterKey?: string
    readonly limit: number
  }): Promise<LocalScheduleOccurrencePage>
  updateOccurrenceDelivery(request: {
    readonly occurrence: LocalScheduleOccurrence
    readonly delivery: LocalScheduleOccurrenceDelivery
  }): Promise<
    | { readonly kind: "updated"; readonly occurrence: LocalScheduleOccurrence }
    | { readonly kind: "conflict"; readonly current: LocalScheduleOccurrence | null }
  >
  pruneSettledOccurrences(scheduleId: string): Promise<void>
  dispose(): void
}
