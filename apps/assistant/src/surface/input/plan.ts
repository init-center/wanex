import type {
  DecidePlanProposalRequest,
  ExecutePlanProposalRequest,
  ListPlanProposalsRequest,
  PlanGenerationReference,
  ReadPlanProposalRequest,
  RevisePlanProposalRequest,
  SelectPlanProposalRequest,
  StartPlanGenerationRequest,
} from "../../plan/model.js";
import {
  optionalBoundedIdentityField,
  optionalPositiveIntegerField,
  optionalStringField,
  parseBoundedText,
  parseJsonValue,
  parseRecord,
  parseRequiredBoundedIdentityField,
  parseRequiredPositiveIntegerField,
  parseString,
  SurfaceValidationError,
} from "./common.js";

export function parseSurfaceStartPlanGenerationRequest(
  input: unknown,
): StartPlanGenerationRequest {
  const context = "startPlanGeneration input";
  const record = parseRecord(input, context);
  const text = parseString(record.text, `${context}.text`).trim();
  if (text.length === 0 || Array.from(text).length > 32_768) {
    throw new SurfaceValidationError(
      `${context}.text must contain 1..=32768 characters`,
    );
  }
  const maxOutputTokens = optionalPositiveIntegerField(
    record,
    "maxOutputTokens",
    context,
  ).maxOutputTokens;
  if (maxOutputTokens !== undefined && maxOutputTokens > 16_384) {
    throw new SurfaceValidationError(
      `${context}.maxOutputTokens must not exceed 16384`,
    );
  }
  return {
    text,
    ...optionalStringField(record, "sessionId", context),
    ...optionalStringField(record, "idempotencyKey", context),
    ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
  };
}

export function parseSurfacePlanGenerationReference(
  input: unknown,
  command:
    | "readPlanGeneration"
    | "cancelPlanGeneration"
    | "dismissPlanGeneration",
): PlanGenerationReference {
  return {
    operationId: parseRequiredBoundedIdentityField(
      input,
      "operationId",
      `${command} input`,
    ),
  };
}

export function parseSurfaceSelectPlanProposalRequest(
  input: unknown,
): SelectPlanProposalRequest {
  return {
    proposalId: parseRequiredBoundedIdentityField(
      input,
      "proposalId",
      "selectPlanProposal input",
    ),
  };
}

export function parseSurfaceReadPlanProposalRequest(
  input: unknown,
): ReadPlanProposalRequest {
  if (input === undefined) return {};
  const record = parseRecord(input, "readPlanProposal input");
  return optionalBoundedIdentityField(
    record,
    "proposalId",
    "readPlanProposal input",
  );
}

export function parseSurfaceListPlanProposalsRequest(
  input: unknown,
): ListPlanProposalsRequest {
  if (input === undefined) return {};
  const context = "listPlanProposals input";
  const record = parseRecord(input, context);
  const limit = optionalPositiveIntegerField(record, "limit", context).limit;
  if (limit !== undefined && limit > 200) {
    throw new SurfaceValidationError(`${context}.limit must not exceed 200`);
  }
  return {
    ...optionalBoundedIdentityField(record, "sessionId", context),
    ...(limit === undefined ? {} : { limit }),
  };
}

export function parseSurfaceRevisePlanProposalRequest(
  input: unknown,
): RevisePlanProposalRequest {
  const context = "revisePlanProposal input";
  const record = parseRecord(input, context);
  const title = parseBoundedText(record.title, `${context}.title`, 500);
  const summary = parseBoundedText(record.summary, `${context}.summary`, 20_000);
  const references =
    record.references === undefined
      ? undefined
      : parsePlanReferences(record.references, `${context}.references`);
  return {
    ...optionalBoundedIdentityField(record, "proposalId", context),
    expectedRevision: parseRequiredPositiveIntegerField(
      record,
      "expectedRevision",
      context,
    ),
    title,
    summary,
    steps: parsePlanSteps(record.steps, `${context}.steps`),
    ...(references === undefined ? {} : { references }),
    ...optionalStringField(record, "reason", context),
    ...optionalBoundedIdentityField(record, "idempotencyKey", context),
  };
}

export function parseSurfaceDecidePlanProposalRequest(
  input: unknown,
): DecidePlanProposalRequest {
  const context = "decidePlanProposal input";
  const record = parseRecord(input, context);
  const decision = parseString(record.decision, `${context}.decision`);
  if (
    decision !== "approve" &&
    decision !== "reject" &&
    decision !== "withdraw"
  ) {
    throw new SurfaceValidationError(`${context}.decision is not supported`);
  }
  return {
    ...optionalBoundedIdentityField(record, "proposalId", context),
    expectedRevision: parseRequiredPositiveIntegerField(
      record,
      "expectedRevision",
      context,
    ),
    decision,
    ...optionalStringField(record, "reason", context),
    ...optionalBoundedIdentityField(record, "idempotencyKey", context),
  };
}

export function parseSurfaceExecutePlanProposalRequest(
  input: unknown,
): ExecutePlanProposalRequest {
  const context = "executePlanProposal input";
  const record = parseRecord(input, context);
  const maxSteps = optionalPositiveIntegerField(record, "maxSteps", context)
    .maxSteps;
  return {
    ...optionalBoundedIdentityField(record, "proposalId", context),
    expectedRevision: parseRequiredPositiveIntegerField(
      record,
      "expectedRevision",
      context,
    ),
    ...optionalBoundedIdentityField(record, "idempotencyKey", context),
    ...(maxSteps === undefined ? {} : { maxSteps }),
  };
}

function parsePlanSteps(
  input: unknown,
  context: string,
): readonly import("@wanex/protocol").PlanProposalStep[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > 256) {
    throw new SurfaceValidationError(`${context} must contain 1..=256 entries`);
  }
  return input.map((value, index) => {
    const stepContext = `${context}[${index}]`;
    const record = parseRecord(value, stepContext);
    return {
      id: parseBoundedText(record.id, `${stepContext}.id`, 500),
      title: parseBoundedText(record.title, `${stepContext}.title`, 500),
      ...(record.detail === undefined
        ? {}
        : {
            detail: parseBoundedText(
              record.detail,
              `${stepContext}.detail`,
              20_000,
            ),
          }),
      ...(record.metadata === undefined
        ? {}
        : {
            metadata: parseJsonValue(record.metadata, `${stepContext}.metadata`),
          }),
    };
  });
}

function parsePlanReferences(
  input: unknown,
  context: string,
): readonly import("@wanex/protocol").PlanProposalReference[] {
  if (!Array.isArray(input) || input.length > 256) {
    throw new SurfaceValidationError(`${context} must contain at most 256 entries`);
  }
  return input.map((value, index) => {
    const referenceContext = `${context}[${index}]`;
    const record = parseRecord(value, referenceContext);
    const kind = parseString(record.kind, `${referenceContext}.kind`);
    if (!isPlanReferenceKind(kind)) {
      throw new SurfaceValidationError(
        `${referenceContext}.kind is not supported`,
      );
    }
    return {
      kind,
      id: parseBoundedText(record.id, `${referenceContext}.id`, 20_000),
      ...(record.role === undefined
        ? {}
        : {
            role: parseBoundedText(record.role, `${referenceContext}.role`, 500),
          }),
      ...(record.metadata === undefined
        ? {}
        : {
            metadata: parseJsonValue(
              record.metadata,
              `${referenceContext}.metadata`,
            ),
          }),
    };
  });
}

function isPlanReferenceKind(
  value: string,
): value is import("@wanex/protocol").PlanReferenceKind {
  return (
    value === "workspace_change_proposal" ||
    value === "delegation_graph" ||
    value === "delegation_graph_node" ||
    value === "team_conversation" ||
    value === "resource" ||
    value === "context_epoch"
  );
}
