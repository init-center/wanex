import type {
  CreateScheduleDefinitionRequest,
  ListScheduleDefinitionsRequest,
  ReadScheduleDefinitionRequest,
  RemoveScheduleDefinitionRequest,
  ReplaceScheduleDefinitionRequest,
  ScheduleAvailability,
  ScheduleCommands,
  ScheduleDefinition,
  ScheduleDefinitionInput,
  ScheduleDefinitionSpec,
  ScheduleDefinitionSummary,
  ScheduleEvents,
  ScheduleInvalidatedEvent,
  ScheduleMisfirePolicy,
  ScheduleModelPolicy,
  ScheduleMutationOperation,
  ScheduleMutationRejectedResult,
  ScheduleSessionPolicy,
  ScheduleSkipReason,
  ScheduleStatus,
  ScheduleStatusState,
  ScheduleTrigger,
  SetScheduleEnabledRequest,
} from "./model.js";
import type { SchedulePort } from "./port.js";

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 100;
const MAX_ID_BYTES = 256;
const MAX_CURSOR_BYTES = 1_024;
const MAX_TITLE_LENGTH = 200;
const MAX_PROMPT_BYTES = 64 * 1_024;
const MAX_CRON_EXPRESSION_LENGTH = 256;
const MAX_TIME_ZONE_LENGTH = 128;
const MIN_INTERVAL_MS = 1_000;

export interface ScheduleService {
  readonly commands: ScheduleCommands;
  readonly events: ScheduleEvents;
  dispose(): void;
}

export function createScheduleService(options: {
  readonly port?: SchedulePort;
}): ScheduleService {
  const listeners = new Set<Parameters<ScheduleEvents["subscribeScheduleEvents"]>[0]>();
  let sequence = 0;
  let disposed = false;
  const unsubscribe = options.port?.subscribeInvalidations((event) => {
    if (disposed) return;
    const projected: ScheduleInvalidatedEvent = {
      kind: "product.schedule.invalidated",
      sequence: ++sequence,
      at: nonNegativeSafeInteger(event.at, "schedule invalidation time"),
      revision: positiveRevision(event.revision),
    };
    for (const listener of listeners) {
      try {
        listener(projected);
      } catch {
        // Presentation listeners cannot affect durable schedule state.
      }
    }
  });

  return {
    commands: {
      readAvailability() {
        return availability(options.port !== undefined);
      },
      async listDefinitions(request = {}) {
        if (options.port === undefined) {
          return {
            kind: "product.schedule-list",
            availability: unavailableSchedule(),
            schedules: [],
          };
        }
        const normalized = normalizeListRequest(request);
        const page = await options.port.listDefinitions(normalized);
        const definitions = await Promise.all(
          page.definitions.map(async (definition) => ({
            definition,
            status: requireStatus(
              await options.port!.readStatus(definition.scheduleId),
              definition.scheduleId,
            ),
          })),
        );
        const nextCursor = optionalBoundedString(
          page.nextCursor,
          "schedule cursor",
          MAX_CURSOR_BYTES,
        );
        return {
          kind: "product.schedule-list",
          availability: readySchedule(),
          schedules: definitions.map(({ definition, status }) =>
            projectSummary(definition, status),
          ),
          ...(nextCursor === undefined ? {} : { nextCursor }),
        };
      },
      async readDefinition(request: ReadScheduleDefinitionRequest) {
        if (options.port === undefined) {
          return {
            kind: "product.schedule.unavailable",
            availability: unavailableSchedule(),
          };
        }
        const scheduleId = requiredId(request.scheduleId, "scheduleId");
        const definition = await options.port.readDefinition(scheduleId);
        if (definition === null) {
          return { kind: "product.schedule.missing", scheduleId };
        }
        return {
          kind: "product.schedule.found",
          definition,
          status: requireStatus(
            await options.port.readStatus(scheduleId),
            scheduleId,
            definition.revision,
          ),
        };
      },
      async createDefinition(request: CreateScheduleDefinitionRequest) {
        if (options.port === undefined) return notConfigured("create");
        return await options.port.createDefinition({
          definition: normalizeDefinition(request.definition, true),
          idempotencyKey: boundedRequiredString(
            request.idempotencyKey,
            "idempotencyKey",
            MAX_ID_BYTES,
          ),
        });
      },
      async replaceDefinition(request: ReplaceScheduleDefinitionRequest) {
        if (options.port === undefined) return notConfigured("replace");
        return await options.port.replaceDefinition({
          scheduleId: requiredId(request.scheduleId, "scheduleId"),
          expectedRevision: positiveRevision(request.expectedRevision),
          definition: normalizeDefinition(request.definition, undefined),
        });
      },
      async setEnabled(request: SetScheduleEnabledRequest) {
        if (options.port === undefined) return notConfigured("set_enabled");
        if (typeof request.enabled !== "boolean") {
          throw new Error("enabled must be a boolean");
        }
        return await options.port.setEnabled({
          scheduleId: requiredId(request.scheduleId, "scheduleId"),
          expectedRevision: positiveRevision(request.expectedRevision),
          enabled: request.enabled,
        });
      },
      async removeDefinition(request: RemoveScheduleDefinitionRequest) {
        if (options.port === undefined) return notConfigured("remove");
        return await options.port.removeDefinition({
          scheduleId: requiredId(request.scheduleId, "scheduleId"),
          expectedRevision: positiveRevision(request.expectedRevision),
        });
      },
    },
    events: {
      subscribeScheduleEvents(listener) {
        if (disposed) return () => undefined;
        listeners.add(listener);
        let subscribed = true;
        return () => {
          if (!subscribed) return;
          subscribed = false;
          listeners.delete(listener);
        };
      },
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe?.();
      listeners.clear();
    },
  };
}

export function readySchedule(): ScheduleAvailability {
  return {
    kind: "product.schedule-availability",
    state: "ready",
    reason: "configured",
    capabilities: capabilities(true),
  };
}

export function unavailableSchedule(): ScheduleAvailability & {
  readonly state: "unavailable";
} {
  return {
    kind: "product.schedule-availability",
    state: "unavailable",
    reason: "not_configured",
    capabilities: capabilities(false),
  };
}

function availability(configured: boolean): ScheduleAvailability {
  return configured ? readySchedule() : unavailableSchedule();
}

function capabilities(enabled: boolean) {
  return {
    canList: enabled,
    canCreate: enabled,
    canEdit: enabled,
    canSetEnabled: enabled,
    canRemove: enabled,
  } as const;
}

function notConfigured(
  operation: ScheduleMutationOperation,
): ScheduleMutationRejectedResult {
  return {
    kind: "product.schedule.rejected",
    operation,
    reason: "not_configured",
    message: "Schedules are not configured.",
  };
}

function normalizeListRequest(request: ListScheduleDefinitionsRequest): {
  readonly cursor?: string;
  readonly limit: number;
} {
  const limit = request.limit ?? DEFAULT_PAGE_LIMIT;
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error("schedule list limit must be a positive safe integer");
  }
  const cursor = optionalBoundedString(
    request.cursor,
    "schedule cursor",
    MAX_CURSOR_BYTES,
  );
  return {
    limit: Math.min(limit, MAX_PAGE_LIMIT),
    ...(cursor === undefined ? {} : { cursor }),
  };
}

function normalizeDefinition(
  input: ScheduleDefinitionInput,
  defaultEnabled: boolean | undefined,
): ScheduleDefinitionSpec {
  const title = optionalBoundedText(input.title, "schedule title", MAX_TITLE_LENGTH);
  const enabled = input.enabled ?? defaultEnabled;
  if (typeof enabled !== "boolean") {
    throw new Error("schedule enabled must be an explicit boolean");
  }
  return {
    ...(title === undefined ? {} : { title }),
    prompt: boundedRequiredString(
      input.prompt,
      "schedule prompt",
      MAX_PROMPT_BYTES,
    ),
    enabled,
    trigger: normalizeTrigger(input.trigger),
    sessionPolicy: normalizeSessionPolicy(input.sessionPolicy),
    modelPolicy: normalizeModelPolicy(input.modelPolicy),
    overlapPolicy: "skip_if_running",
    misfirePolicy: normalizeMisfirePolicy(input.misfirePolicy),
  };
}

function normalizeTrigger(trigger: ScheduleTrigger): ScheduleTrigger {
  if (trigger.kind === "once") {
    return {
      kind: "once",
      at: nonNegativeSafeInteger(trigger.at, "schedule once time"),
    };
  }
  if (trigger.kind === "interval") {
    const intervalMs = positiveSafeInteger(
      trigger.intervalMs,
      "schedule intervalMs",
    );
    if (intervalMs < MIN_INTERVAL_MS) {
      throw new Error(`schedule intervalMs must be at least ${MIN_INTERVAL_MS}`);
    }
    return {
      kind: "interval",
      anchorAt: nonNegativeSafeInteger(
        trigger.anchorAt,
        "schedule interval anchorAt",
      ),
      intervalMs,
    };
  }
  if (trigger.kind === "cron") {
    return {
      kind: "cron",
      expression: boundedRequiredText(
        trigger.expression,
        "schedule cron expression",
        MAX_CRON_EXPRESSION_LENGTH,
      ),
      timeZone: boundedRequiredText(
        trigger.timeZone,
        "schedule timeZone",
        MAX_TIME_ZONE_LENGTH,
      ),
    };
  }
  throw new Error(`unsupported schedule trigger: ${String((trigger as { kind?: unknown }).kind)}`);
}

function normalizeSessionPolicy(
  policy: ScheduleSessionPolicy | undefined,
): ScheduleSessionPolicy {
  if (policy === undefined || policy.kind === "isolated") {
    return { kind: "isolated" };
  }
  if (policy.kind === "reuse") {
    return {
      kind: "reuse",
      sessionId: requiredId(policy.sessionId, "sessionId"),
    };
  }
  throw new Error(`unsupported schedule session policy: ${String((policy as { kind?: unknown }).kind)}`);
}

function normalizeModelPolicy(
  policy: ScheduleModelPolicy | undefined,
): ScheduleModelPolicy {
  if (policy === undefined || policy.kind === "active") {
    return { kind: "active" };
  }
  if (policy.kind === "pinned") {
    return {
      kind: "pinned",
      endpointId: requiredId(policy.endpointId, "endpointId"),
    };
  }
  throw new Error(`unsupported schedule model policy: ${String((policy as { kind?: unknown }).kind)}`);
}

function normalizeMisfirePolicy(
  policy: ScheduleMisfirePolicy | undefined,
): ScheduleMisfirePolicy {
  if (policy === undefined || policy === "fire_once") return "fire_once";
  if (policy === "skip") return "skip";
  throw new Error(`unsupported schedule misfire policy: ${String(policy)}`);
}

function projectSummary(
  definition: ScheduleDefinition,
  status: ScheduleStatus,
): ScheduleDefinitionSummary {
  return {
    kind: "product.schedule-summary",
    scheduleId: definition.scheduleId,
    ...(definition.title === undefined ? {} : { title: definition.title }),
    enabled: definition.enabled,
    trigger: definition.trigger,
    revision: positiveRevision(definition.revision),
    updatedAt: nonNegativeSafeInteger(definition.updatedAt, "schedule updatedAt"),
    status: projectStatus(status, definition.scheduleId, definition.revision),
  };
}

function requireStatus(
  status: ScheduleStatus | null,
  scheduleId: string,
  expectedRevision?: number,
): ScheduleStatus {
  if (status === null) {
    throw new Error(`Schedule status is missing for ${scheduleId}`);
  }
  return projectStatus(status, scheduleId, expectedRevision);
}

function projectStatus(
  status: ScheduleStatus,
  expectedScheduleId: string,
  expectedRevision?: number,
): ScheduleStatus {
  const scheduleId = requiredId(status.scheduleId, "schedule status scheduleId");
  if (scheduleId !== expectedScheduleId) {
    throw new Error("Schedule status scheduleId does not match definition");
  }
  const definitionRevision = positiveRevision(status.definitionRevision);
  if (
    expectedRevision !== undefined &&
    definitionRevision !== positiveRevision(expectedRevision)
  ) {
    throw new Error("Schedule status revision does not match definition");
  }
  const state = statusState(status.state);
  const nextAt = optionalNonNegativeSafeInteger(status.nextAt, "schedule nextAt");
  const retryAt = optionalNonNegativeSafeInteger(
    status.retryAt,
    "schedule retryAt",
  );
  const lastOutcome = status.lastOutcome === undefined
    ? undefined
    : projectLastOutcome(status.lastOutcome);
  if (state === "retrying") {
    if (retryAt === undefined || nextAt !== undefined) {
      throw new Error("retrying Schedule status requires retryAt only");
    }
  } else if (retryAt !== undefined) {
    throw new Error("only retrying Schedule status may include retryAt");
  }
  if (state === "scheduled" && nextAt === undefined) {
    throw new Error("scheduled Schedule status requires nextAt");
  }
  if (
    (state === "running" || state === "completed" || state === "disabled") &&
    nextAt !== undefined
  ) {
    throw new Error(`${state} Schedule status cannot include nextAt`);
  }
  return {
    kind: "product.schedule-status",
    scheduleId,
    definitionRevision,
    state,
    ...(nextAt === undefined ? {} : { nextAt }),
    ...(retryAt === undefined ? {} : { retryAt }),
    ...(lastOutcome === undefined ? {} : { lastOutcome }),
  };
}

function projectLastOutcome(
  outcome: NonNullable<ScheduleStatus["lastOutcome"]>,
): NonNullable<ScheduleStatus["lastOutcome"]> {
  const kind = outcome.kind;
  if (kind !== "submitted" && kind !== "skipped") {
    throw new Error("Schedule last outcome kind is invalid");
  }
  const occurrenceAt = nonNegativeSafeInteger(
    outcome.occurrenceAt,
    "schedule last occurrence time",
  );
  const settledAt = nonNegativeSafeInteger(
    outcome.settledAt,
    "schedule last settled time",
  );
  const reason = outcome.reason;
  if (kind === "submitted" && reason !== undefined) {
    throw new Error("submitted Schedule outcome cannot have a skip reason");
  }
  return {
    kind,
    occurrenceAt,
    settledAt,
    ...(reason === undefined ? {} : { reason: skipReason(reason) }),
  };
}

function statusState(value: ScheduleStatusState): ScheduleStatusState {
  if (
    value === "disabled" ||
    value === "scheduled" ||
    value === "running" ||
    value === "retrying" ||
    value === "completed"
  ) {
    return value;
  }
  throw new Error("Schedule status state is invalid");
}

function skipReason(value: ScheduleSkipReason): ScheduleSkipReason {
  if (
    value === "misfire" ||
    value === "previous_job_active" ||
    value === "superseded"
  ) {
    return value;
  }
  throw new Error("Schedule skip reason is invalid");
}

function requiredId(value: string, field: string): string {
  return boundedRequiredString(value, field, MAX_ID_BYTES);
}

function boundedRequiredString(value: string, field: string, maxBytes: number): string {
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const normalized = value.trim();
  if (normalized.length === 0) throw new Error(`${field} must not be empty`);
  if (new TextEncoder().encode(normalized).byteLength > maxBytes) {
    throw new Error(`${field} must be at most ${maxBytes} bytes`);
  }
  return normalized;
}

function optionalBoundedString(
  value: string | undefined,
  field: string,
  maxBytes: number,
): string | undefined {
  return value === undefined
    ? undefined
    : boundedRequiredString(value, field, maxBytes);
}

function optionalBoundedText(
  value: string | undefined,
  field: string,
  maxLength: number,
): string | undefined {
  if (value === undefined) return undefined;
  return boundedRequiredText(value, field, maxLength);
}

function boundedRequiredText(value: string, field: string, maxLength: number): string {
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const normalized = value.trim();
  if (normalized.length === 0) throw new Error(`${field} must not be empty`);
  if (normalized.length > maxLength) {
    throw new Error(`${field} must contain at most ${maxLength} characters`);
  }
  return normalized;
}

function positiveRevision(value: number): number {
  return positiveSafeInteger(value, "schedule revision");
}

function positiveSafeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive safe integer`);
  }
  return value;
}

function nonNegativeSafeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative safe integer`);
  }
  return value;
}

function optionalNonNegativeSafeInteger(
  value: number | undefined,
  field: string,
): number | undefined {
  return value === undefined ? undefined : nonNegativeSafeInteger(value, field);
}
