import type { SurfaceError } from "../model.js";

export function isSurfaceError(value: unknown): value is SurfaceError {
  if (!isRecord(value)) return false;
  return (
    isSurfaceErrorCode(value.code) &&
    (value.category === "validation" || value.category === "runtime") &&
    typeof value.message === "string"
  );
}

export function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

export function optionalRecord(value: unknown): boolean {
  return value === undefined || isRecord(value);
}

export function optionalSurfaceError(value: unknown): boolean {
  return value === undefined || isSurfaceError(value);
}

export function optionalPositiveInteger(value: unknown): boolean {
  return value === undefined || isPositiveSafeInteger(value);
}

export function optionalSideQuerySafeError(value: unknown): boolean {
  return value === undefined || isSideQuerySafeError(value);
}

export function isSideQuerySafeError(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    (value.code === "validation_error" ||
      value.code === "lifecycle_error" ||
      value.code === "runtime_error" ||
      value.code === "unknown_error" ||
      value.code === "unknown_command") &&
    (value.category === "validation" ||
      value.category === "lifecycle" ||
      value.category === "runtime" ||
      value.category === "unknown") &&
    typeof value.message === "string"
  );
}

export function optionalNumber(value: unknown): boolean {
  return value === undefined || typeof value === "number";
}

export function optionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === "boolean";
}

export function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

export function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSurfaceErrorCode(value: unknown): boolean {
  return (
    value === "unknown_command" ||
    value === "validation_error" ||
    value === "command_error" ||
    value === "invalid_transport_response"
  );
}
