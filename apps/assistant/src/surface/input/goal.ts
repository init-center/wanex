import type {
  CancelGoalRequest,
  ChangeGoalStateRequest,
  ReadGoalRequest,
  StartGoalRequest,
} from "../../goal/model.js";
import {
  optionalBoundedIdentityField,
  optionalPositiveIntegerField,
  parseBoundedText,
  parseRecord,
  parseRequiredBoundedIdentityField,
  parseRequiredPositiveIntegerField,
  SurfaceValidationError,
} from "./common.js";

export function parseSurfaceReadGoalRequest(
  input: unknown,
): ReadGoalRequest {
  if (input === undefined) return {};
  const context = "readGoal input";
  const record = parseRecord(input, context);
  return {
    ...optionalBoundedIdentityField(record, "goalId", context),
    ...optionalBoundedIdentityField(record, "sessionId", context),
  };
}

export function parseSurfaceStartGoalRequest(
  input: unknown,
): StartGoalRequest {
  const context = "startGoal input";
  const record = parseRecord(input, context);
  const objective = parseBoundedText(
    record.objective,
    `${context}.objective`,
    32_768,
  ).trim();
  if (objective.length === 0) {
    throw new SurfaceValidationError(`${context}.objective must not be empty`);
  }
  return {
    objective,
    ...optionalBoundedIdentityField(record, "sessionId", context),
    boundaries: parseOptionalGoalTextList(
      record.boundaries,
      `${context}.boundaries`,
    ),
    constraints: parseOptionalGoalTextList(
      record.constraints,
      `${context}.constraints`,
    ),
    successCriteria: parseRequiredGoalTextList(
      record.successCriteria,
      `${context}.successCriteria`,
    ),
    ...(record.stopPolicy === undefined
      ? {}
      : { stopPolicy: parseGoalStopPolicy(record.stopPolicy, `${context}.stopPolicy`) }),
    ...optionalBoundedIdentityField(record, "idempotencyKey", context),
  };
}

export function parseSurfaceChangeGoalStateRequest(
  input: unknown,
  command: "pauseGoal" | "resumeGoal",
): ChangeGoalStateRequest {
  const context = `${command} input`;
  const record = parseRecord(input, context);
  return {
    goalId: parseRequiredBoundedIdentityField(input, "goalId", context),
    expectedRevision: parseRequiredPositiveIntegerField(
      record,
      "expectedRevision",
      context,
    ),
    ...optionalBoundedTextField(record, "reason", context, 4_096),
    ...optionalBoundedIdentityField(record, "idempotencyKey", context),
  };
}

export function parseSurfaceCancelGoalRequest(
  input: unknown,
): CancelGoalRequest {
  const context = "cancelGoal input";
  const record = parseRecord(input, context);
  const reason = parseBoundedText(
    record.reason,
    `${context}.reason`,
    4_096,
  ).trim();
  if (reason.length === 0) {
    throw new SurfaceValidationError(`${context}.reason must not be empty`);
  }
  return {
    goalId: parseRequiredBoundedIdentityField(input, "goalId", context),
    expectedRevision: parseRequiredPositiveIntegerField(
      record,
      "expectedRevision",
      context,
    ),
    reason,
    ...optionalBoundedIdentityField(record, "idempotencyKey", context),
  };
}

function parseOptionalGoalTextList(
  input: unknown,
  context: string,
): readonly string[] {
  return input === undefined ? [] : parseGoalTextList(input, context, false);
}

function parseRequiredGoalTextList(
  input: unknown,
  context: string,
): readonly string[] {
  return parseGoalTextList(input, context, true);
}

function parseGoalTextList(
  input: unknown,
  context: string,
  required: boolean,
): readonly string[] {
  if (
    !Array.isArray(input) ||
    input.length > 64 ||
    (required && input.length === 0)
  ) {
    throw new SurfaceValidationError(
      `${context} must contain ${required ? "1..=64" : "at most 64"} entries`,
    );
  }
  return input.map((value, index) => {
    const text = parseBoundedText(value, `${context}[${index}]`, 4_096).trim();
    if (text.length === 0) {
      throw new SurfaceValidationError(`${context}[${index}] must not be empty`);
    }
    return text;
  });
}

function parseGoalStopPolicy(
  input: unknown,
  context: string,
): NonNullable<StartGoalRequest["stopPolicy"]> {
  const record = parseRecord(input, context);
  const maxAttempts = optionalPositiveIntegerField(record, "maxAttempts", context)
    .maxAttempts;
  const maxConsecutiveBlockedAttempts = optionalPositiveIntegerField(
    record,
    "maxConsecutiveBlockedAttempts",
    context,
  ).maxConsecutiveBlockedAttempts;
  if (
    (maxAttempts !== undefined && maxAttempts > 100) ||
    (maxConsecutiveBlockedAttempts !== undefined &&
      maxConsecutiveBlockedAttempts > 100)
  ) {
    throw new SurfaceValidationError(
      `${context} attempt limits must not exceed 100`,
    );
  }
  const deadlineAt = optionalPositiveIntegerField(record, "deadlineAt", context)
    .deadlineAt;
  return {
    ...(maxAttempts === undefined ? {} : { maxAttempts }),
    ...(maxConsecutiveBlockedAttempts === undefined
      ? {}
      : { maxConsecutiveBlockedAttempts }),
    ...(deadlineAt === undefined ? {} : { deadlineAt }),
    ...(record.budget === undefined
      ? {}
      : { budget: parseGoalBudget(record.budget, `${context}.budget`) }),
  };
}

function parseGoalBudget(
  input: unknown,
  context: string,
): import("@wanex/protocol").BudgetLimit {
  const record = parseRecord(input, context);
  return {
    ...optionalPositiveIntegerField(record, "tokens", context),
    ...optionalPositiveIntegerField(record, "costMicros", context),
    ...optionalPositiveIntegerField(record, "wallTimeMs", context),
    ...optionalPositiveIntegerField(record, "toolCalls", context),
  };
}

function optionalBoundedTextField(
  record: Record<string, unknown>,
  field: string,
  context: string,
  maxCharacters: number,
): { readonly [key: string]: string } {
  if (!(field in record) || record[field] === undefined) return {};
  const value = parseBoundedText(
    record[field],
    `${context}.${field}`,
    maxCharacters,
  ).trim();
  if (value.length === 0) return {};
  return { [field]: value };
}
