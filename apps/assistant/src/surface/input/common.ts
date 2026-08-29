import type {
  ArchiveSessionRequest,
  RendererPreferences,
  RestoreSessionRequest,
} from "../../model.js";
import type { StartGoalRequest } from "../../goal/model.js";
import type { SurfaceError } from "../model.js";

export function expectSurfaceNoInput(
  input: unknown,
  command: string,
): void {
  if (input !== undefined) {
    throw new SurfaceValidationError(`${command} input must be omitted`);
  }
}

export class SurfaceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SurfaceValidationError";
  }
}

export function normalizeSurfaceError(error: unknown): SurfaceError {
  if (error instanceof SurfaceValidationError) {
    return normalizeSurfaceValidationError(error);
  }
  return {
    code: "command_error",
    category: "runtime",
    message: "surface command failed; see assistant diagnostics for details",
  };
}

export function normalizeSurfaceValidationError(
  error: unknown,
): SurfaceError {
  return {
    code: "validation_error",
    category: "validation",
    message: error instanceof Error ? error.message : "invalid surface request",
  };
}

export function optionalRequestId(requestId: string | undefined): {
  readonly requestId?: string;
} {
  return requestId === undefined ? {} : { requestId };
}

export function parseRequiredStringField(
  input: unknown,
  field: string,
  context: string,
): string {
  const record = parseRecord(input, context);
  return parseString(record[field], `${context}.${field}`);
}

export function parseRequiredBoundedIdentityField(
  input: unknown,
  field: string,
  context: string,
): string {
  const value = parseRequiredStringField(input, field, context).trim();
  if (value.length > 500) {
    throw new SurfaceValidationError(
      `${context}.${field} must not exceed 500 characters`,
    );
  }
  return value;
}

export function optionalBoundedIdentityField(
  record: Record<string, unknown>,
  field: string,
  context: string,
): { readonly [key: string]: string } {
  if (!(field in record) || record[field] === undefined) return {};
  const value = parseString(record[field], `${context}.${field}`).trim();
  if (value.length > 500) {
    throw new SurfaceValidationError(
      `${context}.${field} must not exceed 500 characters`,
    );
  }
  return { [field]: value };
}

export function parseBoundedText(
  input: unknown,
  context: string,
  maxCharacters: number,
): string {
  const value = parseString(input, context);
  if (Array.from(value).length > maxCharacters) {
    throw new SurfaceValidationError(
      `${context} must not exceed ${maxCharacters} characters`,
    );
  }
  return value;
}

export function parseJsonValue(
  value: unknown,
  context: string,
): import("@wanex/protocol").JsonValue {
  if (!isJsonValue(value)) {
    throw new SurfaceValidationError(`${context} must be JSON data`);
  }
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > 32_768) {
    throw new SurfaceValidationError(`${context} exceeds 32768 bytes`);
  }
  return value;
}

export function parseRecord(
  input: unknown,
  context: string,
): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new SurfaceValidationError(`${context} must be an object`);
  }
  return input as Record<string, unknown>;
}

export function parseString(input: unknown, context: string): string {
  if (typeof input !== "string" || input.trim().length === 0) {
    throw new SurfaceValidationError(`${context} must be a non-empty string`);
  }
  return input;
}

export function parseText(input: unknown, context: string): string {
  if (typeof input !== "string") {
    throw new SurfaceValidationError(`${context} must be a string`);
  }
  return input;
}

export function optionalStringField(
  record: Record<string, unknown>,
  field: string,
  context: string,
): { readonly [key: string]: string } {
  if (!(field in record) || record[field] === undefined) {
    return {};
  }
  return { [field]: parseString(record[field], `${context}.${field}`) };
}

export function optionalNumberField(
  record: Record<string, unknown>,
  field: string,
  context: string,
): { readonly [key: string]: number } {
  if (!(field in record) || record[field] === undefined) {
    return {};
  }
  const value = record[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SurfaceValidationError(
      `${context}.${field} must be a finite number`,
    );
  }
  return { [field]: value };
}

export function optionalJsonField(
  record: Record<string, unknown>,
  field: "error",
  context: string,
): { readonly error?: import("@wanex/protocol").JsonValue } {
  if (!(field in record) || record[field] === undefined) return {};
  const value = record[field];
  if (!isJsonValue(value)) {
    throw new SurfaceValidationError(`${context}.${field} must be JSON data`);
  }
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > 32_768) {
    throw new SurfaceValidationError(`${context}.${field} exceeds 32768 bytes`);
  }
  return { [field]: value };
}

export function optionalToolResultContentField(
  record: Record<string, unknown>,
  context: string,
): {
  readonly content?: readonly import("@wanex/protocol").ToolResultContentPart[];
} {
  if (!("content" in record) || record.content === undefined) return {};
  if (!Array.isArray(record.content) || record.content.length === 0) {
    throw new SurfaceValidationError(
      `${context}.content must be a non-empty array`,
    );
  }
  const content = record.content.map((raw, index) => {
    if (!isRecordValue(raw) || typeof raw.type !== "string") {
      throw new SurfaceValidationError(
        `${context}.content[${index}] must be a typed object`,
      );
    }
    if (raw.type === "text" && typeof raw.text === "string") {
      return { type: "text" as const, text: raw.text };
    }
    if (raw.type === "json" && isJsonValue(raw.value)) {
      return { type: "json" as const, value: raw.value };
    }
    if (
      raw.type === "resource" &&
      typeof raw.resourceId === "string" &&
      typeof raw.sha256 === "string" &&
      typeof raw.sizeBytes === "number" &&
      isResourceKind(raw.kind) &&
      (raw.mediaType === undefined || typeof raw.mediaType === "string")
    ) {
      return {
        type: "resource" as const,
        resourceId: raw.resourceId,
        sha256: raw.sha256,
        sizeBytes: raw.sizeBytes,
        kind: raw.kind,
        ...(raw.mediaType === undefined ? {} : { mediaType: raw.mediaType }),
      };
    }
    throw new SurfaceValidationError(
      `${context}.content[${index}] is not valid Tool result content`,
    );
  });
  if (Buffer.byteLength(JSON.stringify(content), "utf8") > 32_768) {
    throw new SurfaceValidationError(`${context}.content exceeds 32768 bytes`);
  }
  return { content };
}

export function isRecordValue(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isResourceKind(
  value: unknown,
): value is import("@wanex/protocol").ResourceKind {
  return (
    typeof value === "string" &&
    [
      "file",
      "image",
      "video",
      "audio",
      "document",
      "artifact",
      "log",
      "patch",
      "url",
    ].includes(value)
  );
}

export function isJsonValue(
  value: unknown,
): value is import("@wanex/protocol").JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== "object") return false;
  return Object.values(value as Readonly<Record<string, unknown>>).every(
    isJsonValue,
  );
}

export function optionalPositiveIntegerField(
  record: Record<string, unknown>,
  field: string,
  context: string,
): { readonly [key: string]: number } {
  if (!(field in record) || record[field] === undefined) {
    return {};
  }
  const value = record[field];
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new SurfaceValidationError(
      `${context}.${field} must be a positive integer`,
    );
  }
  return { [field]: value };
}

export function parseRequiredPositiveIntegerField(
  record: Record<string, unknown>,
  field: string,
  context: string,
): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new SurfaceValidationError(
      `${context}.${field} must be a positive integer`,
    );
  }
  return value;
}

export function parseRequiredNonNegativeIntegerField(
  record: Record<string, unknown>,
  field: string,
  context: string,
): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new SurfaceValidationError(
      `${context}.${field} must be a non-negative integer`,
    );
  }
  return value;
}

export function parseSurfaceSessionStateRequest(
  input: unknown,
  command: "archiveSession" | "restoreSession",
): ArchiveSessionRequest | RestoreSessionRequest {
  const context = `${command} input`;
  const record = parseRecord(input, context);
  return {
    sessionId: parseString(record.sessionId, `${context}.sessionId`),
    expectedRevision: parseRequiredPositiveIntegerField(
      record,
      "expectedRevision",
      context,
    ),
  };
}

export function optionalTheme(
  record: Record<string, unknown>,
): Partial<RendererPreferences> {
  if (!("theme" in record) || record.theme === undefined) {
    return {};
  }
  const theme = parseString(
    record.theme,
    "updatePreferences input.preferences.theme",
  );
  if (theme === "system" || theme === "light" || theme === "dark") {
    return { theme };
  }
  throw new SurfaceValidationError(
    "updatePreferences input.preferences.theme is not supported",
  );
}

export function optionalDensity(
  record: Record<string, unknown>,
): Partial<RendererPreferences> {
  if (!("density" in record) || record.density === undefined) {
    return {};
  }
  const density = parseString(
    record.density,
    "updatePreferences input.preferences.density",
  );
  if (density === "comfortable" || density === "compact") {
    return { density };
  }
  throw new SurfaceValidationError(
    "updatePreferences input.preferences.density is not supported",
  );
}
