export type ScheduleTrigger =
  | ScheduleOnceTrigger
  | ScheduleIntervalTrigger
  | ScheduleCronTrigger;

export interface ScheduleOnceTrigger {
  readonly kind: "once";
  readonly at: number;
}

export interface ScheduleIntervalTrigger {
  readonly kind: "interval";
  readonly anchorAt: number;
  readonly intervalMs: number;
}

export interface ScheduleCronTrigger {
  readonly kind: "cron";
  readonly expression: string;
  readonly timeZone: string;
}

export type ScheduleSessionPolicy =
  | { readonly kind: "isolated" }
  | { readonly kind: "reuse"; readonly sessionId: string };

export type ScheduleModelPolicy =
  | { readonly kind: "active" }
  | { readonly kind: "pinned"; readonly endpointId: string };

export type ScheduleOverlapPolicy = "skip_if_running";
export type ScheduleMisfirePolicy = "fire_once" | "skip";

export interface ScheduleDefinitionSpec {
  readonly title?: string;
  readonly prompt: string;
  readonly enabled: boolean;
  readonly trigger: ScheduleTrigger;
  readonly sessionPolicy: ScheduleSessionPolicy;
  readonly modelPolicy: ScheduleModelPolicy;
  readonly overlapPolicy: ScheduleOverlapPolicy;
  readonly misfirePolicy: ScheduleMisfirePolicy;
}

export interface ScheduleDefinition extends ScheduleDefinitionSpec {
  readonly kind: "assistant.schedule-definition";
  readonly scheduleId: string;
  readonly revision: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface ScheduleDefinitionSummary {
  readonly kind: "assistant.schedule-summary";
  readonly scheduleId: string;
  readonly title?: string;
  readonly enabled: boolean;
  readonly trigger: ScheduleTrigger;
  readonly revision: number;
  readonly updatedAt: number;
  readonly status: ScheduleStatus;
}

export type ScheduleStatusState =
  | "disabled"
  | "scheduled"
  | "running"
  | "retrying"
  | "completed";

export type ScheduleSkipReason =
  | "misfire"
  | "previous_job_active"
  | "superseded";

export interface ScheduleLastOutcome {
  readonly kind: "submitted" | "skipped";
  readonly occurrenceAt: number;
  readonly settledAt: number;
  readonly reason?: ScheduleSkipReason;
}

export interface ScheduleStatus {
  readonly kind: "assistant.schedule-status";
  readonly scheduleId: string;
  readonly definitionRevision: number;
  readonly state: ScheduleStatusState;
  readonly nextAt?: number;
  readonly retryAt?: number;
  readonly lastOutcome?: ScheduleLastOutcome;
}

export type ScheduleAvailability =
  | ScheduleReadyAvailability
  | ScheduleUnavailableAvailability;

export interface ScheduleReadyAvailability {
  readonly kind: "assistant.schedule-availability";
  readonly state: "ready";
  readonly reason: "configured";
  readonly capabilities: ScheduleCapabilities;
}

export interface ScheduleUnavailableAvailability {
  readonly kind: "assistant.schedule-availability";
  readonly state: "unavailable";
  readonly reason: "not_configured";
  readonly capabilities: ScheduleCapabilities;
}

export interface ScheduleCapabilities {
  readonly canList: boolean;
  readonly canCreate: boolean;
  readonly canEdit: boolean;
  readonly canSetEnabled: boolean;
  readonly canRemove: boolean;
}

export interface ScheduleDefinitionPage {
  readonly definitions: readonly ScheduleDefinition[];
  readonly nextCursor?: string;
}

export interface ScheduleListReadModel {
  readonly kind: "assistant.schedule-list";
  readonly availability: ScheduleAvailability;
  readonly schedules: readonly ScheduleDefinitionSummary[];
  readonly nextCursor?: string;
}

export type ScheduleDefinitionReadResult =
  | {
      readonly kind: "assistant.schedule.found";
      readonly definition: ScheduleDefinition;
      readonly status: ScheduleStatus;
    }
  | {
      readonly kind: "assistant.schedule.missing";
      readonly scheduleId: string;
    }
  | {
      readonly kind: "assistant.schedule.unavailable";
      readonly availability: ScheduleUnavailableAvailability;
    };

export interface ScheduleDefinitionInput {
  readonly title?: string;
  readonly prompt: string;
  readonly enabled?: boolean;
  readonly trigger: ScheduleTrigger;
  readonly sessionPolicy?: ScheduleSessionPolicy;
  readonly modelPolicy?: ScheduleModelPolicy;
  readonly misfirePolicy?: ScheduleMisfirePolicy;
}

export interface ScheduleReplacementInput extends Omit<
  ScheduleDefinitionInput,
  "enabled"
> {
  readonly enabled: boolean;
}

export interface ListScheduleDefinitionsRequest {
  readonly cursor?: string;
  readonly limit?: number;
}

export interface ReadScheduleDefinitionRequest {
  readonly scheduleId: string;
}

export interface CreateScheduleDefinitionRequest {
  readonly definition: ScheduleDefinitionInput;
  readonly idempotencyKey: string;
}

export interface ReplaceScheduleDefinitionRequest {
  readonly scheduleId: string;
  readonly expectedRevision: number;
  readonly definition: ScheduleReplacementInput;
}

export interface SetScheduleEnabledRequest {
  readonly scheduleId: string;
  readonly expectedRevision: number;
  readonly enabled: boolean;
}

export interface RemoveScheduleDefinitionRequest {
  readonly scheduleId: string;
  readonly expectedRevision: number;
}

export type ScheduleMutationOperation =
  | "create"
  | "replace"
  | "set_enabled"
  | "remove";

export type ScheduleMutationResult =
  | ScheduleDefinitionAppliedResult
  | ScheduleRemovalAppliedResult
  | ScheduleMutationConflictResult
  | ScheduleMutationRejectedResult;

export interface ScheduleDefinitionAppliedResult {
  readonly kind: "assistant.schedule.applied";
  readonly operation: Exclude<ScheduleMutationOperation, "remove">;
  readonly definition: ScheduleDefinition;
}

export interface ScheduleRemovalAppliedResult {
  readonly kind: "assistant.schedule.applied";
  readonly operation: "remove";
  readonly scheduleId: string;
  readonly revision: number;
}

export interface ScheduleMutationConflictResult {
  readonly kind: "assistant.schedule.conflict";
  readonly operation: ScheduleMutationOperation;
  readonly reason:
    | "not_found"
    | "revision_conflict"
    | "idempotency_conflict";
  readonly scheduleId?: string;
  readonly expectedRevision?: number;
  readonly current?: ScheduleDefinition;
  readonly message: string;
}

export interface ScheduleMutationRejectedResult {
  readonly kind: "assistant.schedule.rejected";
  readonly operation: ScheduleMutationOperation;
  readonly reason:
    | "not_configured"
    | "invalid_definition"
    | "storage_failed"
    | "disposed";
  readonly message: string;
}

export interface SchedulePortInvalidation {
  readonly at: number;
  readonly revision: number;
}

export interface ScheduleInvalidatedEvent extends SchedulePortInvalidation {
  readonly kind: "assistant.schedule.invalidated";
  readonly sequence: number;
}

export type ScheduleEventListener = (event: ScheduleInvalidatedEvent) => void;

export interface ScheduleEvents {
  subscribeScheduleEvents(listener: ScheduleEventListener): () => void;
}

export interface ScheduleCommands {
  readAvailability(): ScheduleAvailability;
  listDefinitions(
    request?: ListScheduleDefinitionsRequest,
  ): Promise<ScheduleListReadModel>;
  readDefinition(
    request: ReadScheduleDefinitionRequest,
  ): Promise<ScheduleDefinitionReadResult>;
  createDefinition(
    request: CreateScheduleDefinitionRequest,
  ): Promise<ScheduleMutationResult>;
  replaceDefinition(
    request: ReplaceScheduleDefinitionRequest,
  ): Promise<ScheduleMutationResult>;
  setEnabled(
    request: SetScheduleEnabledRequest,
  ): Promise<ScheduleMutationResult>;
  removeDefinition(
    request: RemoveScheduleDefinitionRequest,
  ): Promise<ScheduleMutationResult>;
}
