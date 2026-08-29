export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function exactObject(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return (
    required.every((key) => keys.includes(key)) &&
    keys.every((key) => required.includes(key) || optional.includes(key))
  );
}

export function boundedString(
  value: unknown,
  maxBytes: number,
  allowEmpty = false,
): value is string {
  return (
    typeof value === "string" &&
    (allowEmpty || value.trim().length > 0) &&
    utf8Length(value) <= maxBytes
  );
}

export function positiveInteger(
  value: unknown,
  maximum?: number,
): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) > 0 &&
    (maximum === undefined || (value as number) <= maximum)
  );
}

export function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function timestamp(value: unknown): value is number {
  return nonNegativeInteger(value);
}

export function optional<T>(
  value: unknown,
  predicate: (value: unknown) => value is T,
): value is T | undefined {
  return value === undefined || predicate(value);
}

export function literal<T extends string>(
  value: unknown,
  values: readonly T[],
): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
