import type {
  ScheduleDefinition,
  ScheduleDefinitionSpec,
  SchedulePort,
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
  readonly claimedAt: number
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
      readonly occurrenceAt: number
      readonly definitionRevision: number
    }
  | {
      readonly kind: "local.schedule-occurrence.duplicate"
      readonly scheduleId: string
      readonly occurrenceAt: number
      readonly definitionRevision: number
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
  claimOccurrence(
    request: ClaimLocalScheduleOccurrenceRequest
  ): Promise<ClaimLocalScheduleOccurrenceResult>
  dispose(): void
}
