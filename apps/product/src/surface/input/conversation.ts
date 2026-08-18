import type {
  CancelTrackedConversationOperationRequest,
  PrepareConversationAttachmentRequest,
  QueueGuidedFollowUpRequest,
  ReadConversationAttachmentsRequest,
  ReadTrackedConversationOperationRequest,
  RegenerateTrackedConversationOperationRequest,
  RemoveConversationAttachmentRequest,
  ResolveTrackedConversationApprovalRequest,
  ResolveTrackedConversationRecoveryRequest,
  SteerTrackedConversationOperationRequest,
  SubmitConversationOperationRequest,
} from "../../model.js";
import {
  optionalJsonField,
  optionalStringField,
  optionalToolResultContentField,
  parseRecord,
  parseRequiredNonNegativeIntegerField,
  parseRequiredPositiveIntegerField,
  parseString,
  parseText,
  SurfaceValidationError,
} from "./common.js";

export function parseSurfaceConversationSubmitRequest(
  input: unknown,
): SubmitConversationOperationRequest {
  const record = parseRecord(input, "submitConversationOperation input");
  return {
    text: parseText(record.text, "submitConversationOperation input.text"),
    ...optionalStringField(
      record,
      "sessionId",
      "submitConversationOperation input",
    ),
    ...optionalStringField(
      record,
      "principalId",
      "submitConversationOperation input",
    ),
  };
}

export function parseSurfaceQueueGuidedFollowUpRequest(
  input: unknown,
): QueueGuidedFollowUpRequest {
  const record = parseRecord(input, "queueGuidedFollowUp input");
  return {
    operationId: parseString(
      record.operationId,
      "queueGuidedFollowUp input.operationId",
    ),
    text: parseText(record.text, "queueGuidedFollowUp input.text"),
    ...optionalStringField(record, "sessionId", "queueGuidedFollowUp input"),
  };
}

export function parseSurfaceSteerConversationRequest(
  input: unknown,
  requestId: string | undefined,
): SteerTrackedConversationOperationRequest {
  const context = "steerTrackedConversationOperation input";
  const record = parseRecord(input, context);
  const allowedFields = new Set(["operationId", "text", "sessionId"]);
  for (const field of Object.keys(record)) {
    if (!allowedFields.has(field)) {
      throw new SurfaceValidationError(`${context}.${field} is not supported`);
    }
  }
  const operationId = parseString(record.operationId, `${context}.operationId`);
  const text = parseText(record.text, `${context}.text`);
  if (Buffer.byteLength(operationId, "utf8") > 512) {
    throw new SurfaceValidationError(`${context}.operationId exceeds 512 bytes`);
  }
  if (text.trim().length === 0) {
    throw new SurfaceValidationError(`${context}.text must not be empty`);
  }
  if (Buffer.byteLength(text, "utf8") > 16_384) {
    throw new SurfaceValidationError(`${context}.text exceeds 16384 bytes`);
  }
  return {
    operationId,
    text,
    requestId: parseString(
      requestId,
      "steerTrackedConversationOperation requestId",
    ),
    ...optionalStringField(record, "sessionId", context),
  };
}

export function parseSurfacePrepareConversationAttachmentRequest(
  input: unknown,
): PrepareConversationAttachmentRequest {
  const record = parseRecord(input, "prepareConversationAttachment input");
  return {
    resourceId: parseString(
      record.resourceId,
      "prepareConversationAttachment input.resourceId",
    ),
    ...optionalStringField(
      record,
      "sessionId",
      "prepareConversationAttachment input",
    ),
  };
}

export function parseSurfaceReadConversationAttachmentsRequest(
  input: unknown,
): ReadConversationAttachmentsRequest {
  if (input === undefined) return {};
  const record = parseRecord(input, "readConversationAttachments input");
  return {
    ...optionalStringField(
      record,
      "sessionId",
      "readConversationAttachments input",
    ),
  };
}

export function parseSurfaceRemoveConversationAttachmentRequest(
  input: unknown,
): RemoveConversationAttachmentRequest {
  const record = parseRecord(input, "removeConversationAttachment input");
  return {
    resourceId: parseString(
      record.resourceId,
      "removeConversationAttachment input.resourceId",
    ),
    ...optionalStringField(
      record,
      "sessionId",
      "removeConversationAttachment input",
    ),
  };
}

export function parseSurfaceConversationReadRequest(
  input: unknown,
): ReadTrackedConversationOperationRequest {
  if (input === undefined) return {};
  const record = parseRecord(input, "readTrackedConversationOperation input");
  return {
    ...optionalStringField(
      record,
      "sessionId",
      "readTrackedConversationOperation input",
    ),
  };
}

export function parseSurfaceCancelConversationRequest(
  input: unknown,
): CancelTrackedConversationOperationRequest {
  const record = parseRecord(input, "cancelTrackedConversationOperation input");
  return {
    reason: parseString(
      record.reason,
      "cancelTrackedConversationOperation input.reason",
    ),
    ...optionalStringField(
      record,
      "sessionId",
      "cancelTrackedConversationOperation input",
    ),
  };
}

export function parseSurfaceConversationRegenerateRequest(
  input: unknown,
): RegenerateTrackedConversationOperationRequest {
  if (input === undefined) return {};
  const record = parseRecord(
    input,
    "regenerateTrackedConversationOperation input",
  );
  return {
    ...optionalStringField(
      record,
      "sessionId",
      "regenerateTrackedConversationOperation input",
    ),
    ...optionalStringField(
      record,
      "principalId",
      "regenerateTrackedConversationOperation input",
    ),
  };
}

export function parseSurfaceConversationRecoveryRequest(
  input: unknown,
): ResolveTrackedConversationRecoveryRequest {
  const context = "resolveTrackedConversationRecovery input";
  const record = parseRecord(input, context);
  const recoveryId = parseString(record.recoveryId, `${context}.recoveryId`);
  if (Buffer.byteLength(recoveryId, "utf8") > 512) {
    throw new SurfaceValidationError(`${context}.recoveryId exceeds 512 bytes`);
  }
  const decision = parseString(record.decision, `${context}.decision`);
  if (
    decision !== "confirm_succeeded" &&
    decision !== "confirm_failed" &&
    decision !== "retry" &&
    decision !== "abandon_turn"
  ) {
    throw new SurfaceValidationError(`${context}.decision is not supported`);
  }
  const reason = parseString(record.reason, `${context}.reason`);
  if (Buffer.byteLength(reason, "utf8") > 4_096) {
    throw new SurfaceValidationError(`${context}.reason exceeds 4096 bytes`);
  }
  const content = optionalToolResultContentField(record, context);
  const error = optionalJsonField(record, "error", context);
  const confirmation =
    decision === "confirm_succeeded" || decision === "confirm_failed";
  if (confirmation && content.content === undefined) {
    throw new SurfaceValidationError(
      `${context}.content is required for a confirmation decision`,
    );
  }
  if (
    !confirmation &&
    (content.content !== undefined || error.error !== undefined)
  ) {
    throw new SurfaceValidationError(
      `${context}.content and error are not allowed for retry or abandon`,
    );
  }
  return {
    recoveryId,
    expectedRecoveryRevision: parseRequiredPositiveIntegerField(
      record,
      "expectedRecoveryRevision",
      context,
    ),
    decision,
    reason,
    ...optionalStringField(record, "sessionId", context),
    ...content,
    ...error,
  };
}

export function parseSurfaceConversationApprovalRequest(
  input: unknown,
): ResolveTrackedConversationApprovalRequest {
  const context = "resolveTrackedConversationApproval input";
  const record = parseRecord(input, context);
  const approvalId = parseString(record.approvalId, `${context}.approvalId`);
  if (Buffer.byteLength(approvalId, "utf8") > 512) {
    throw new SurfaceValidationError(`${context}.approvalId exceeds 512 bytes`);
  }
  const decision = parseString(record.decision, `${context}.decision`);
  if (decision !== "approve_once" && decision !== "deny") {
    throw new SurfaceValidationError(`${context}.decision is not supported`);
  }
  const reason = parseString(record.reason, `${context}.reason`);
  if (Buffer.byteLength(reason, "utf8") > 1_024) {
    throw new SurfaceValidationError(`${context}.reason exceeds 1024 bytes`);
  }
  return {
    approvalId,
    expectedApprovalRevision: parseRequiredNonNegativeIntegerField(
      record,
      "expectedApprovalRevision",
      context,
    ),
    decision,
    reason,
    ...optionalStringField(record, "sessionId", context),
  };
}
