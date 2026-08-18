import type {
  ScheduleDefinition,
  ScheduleDefinitionPage,
  ScheduleDefinitionSpec,
  ScheduleMutationResult,
  SchedulePortInvalidation,
} from "./model.js";

export interface SchedulePort {
  listDefinitions(request: {
    readonly cursor?: string;
    readonly limit: number;
  }): Promise<ScheduleDefinitionPage>;
  readDefinition(scheduleId: string): Promise<ScheduleDefinition | null>;
  createDefinition(request: {
    readonly definition: ScheduleDefinitionSpec;
    readonly idempotencyKey: string;
  }): Promise<ScheduleMutationResult>;
  replaceDefinition(request: {
    readonly scheduleId: string;
    readonly expectedRevision: number;
    readonly definition: ScheduleDefinitionSpec;
  }): Promise<ScheduleMutationResult>;
  setEnabled(request: {
    readonly scheduleId: string;
    readonly expectedRevision: number;
    readonly enabled: boolean;
  }): Promise<ScheduleMutationResult>;
  removeDefinition(request: {
    readonly scheduleId: string;
    readonly expectedRevision: number;
  }): Promise<ScheduleMutationResult>;
  subscribeInvalidations(
    listener: (event: SchedulePortInvalidation) => void,
  ): () => void;
}
