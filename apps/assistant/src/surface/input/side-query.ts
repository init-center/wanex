import type {
  ReadSideQueryRequest,
  StartSideQueryRequest,
} from "../../model.js";
import {
  optionalPositiveIntegerField,
  parseRecord,
  parseRequiredStringField,
  parseText,
  SurfaceValidationError,
} from "./common.js";

export function parseSurfaceStartSideQueryRequest(
  input: unknown,
): StartSideQueryRequest {
  const context = "startSideQuery input";
  const record = parseRecord(input, context);
  const question = parseText(record.question, `${context}.question`).trim();
  if (question.length === 0) {
    throw new SurfaceValidationError(`${context}.question must not be empty`);
  }
  if (question.length > 16_384) {
    throw new SurfaceValidationError(
      `${context}.question must not exceed 16384 characters`,
    );
  }
  const maxOutputTokens = optionalPositiveIntegerField(
    record,
    "maxOutputTokens",
    context,
  ).maxOutputTokens;
  if (maxOutputTokens !== undefined && maxOutputTokens > 4_096) {
    throw new SurfaceValidationError(
      `${context}.maxOutputTokens must not exceed 4096`,
    );
  }
  return {
    question,
    ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
  };
}

export function parseSurfaceSideQueryReference(
  input: unknown,
  command: "readSideQuery" | "cancelSideQuery" | "dismissSideQuery",
): ReadSideQueryRequest {
  const context = `${command} input`;
  const queryId = parseRequiredStringField(input, "queryId", context);
  if (queryId.length > 256) {
    throw new SurfaceValidationError(
      `${context}.queryId must not exceed 256 characters`,
    );
  }
  return { queryId };
}
