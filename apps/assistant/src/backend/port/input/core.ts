export function parseRecord(
  label: string,
  input: unknown
): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new BackendCommandPortValidationError(
      `${label} must be an object`
    )
  }
  return input as Record<string, unknown>
}

export function parseString(
  record: Record<string, unknown>,
  key: string,
  label: string
): string {
  const value = record[key]
  if (typeof value !== "string" || value.length === 0) {
    throw new BackendCommandPortValidationError(
      `${label}.${key} must be a non-empty string`
    )
  }
  return value
}

export function optionalString(
  record: Record<string, unknown>,
  key: string
): { readonly [K in typeof key]?: string } {
  const value = record[key]
  if (value === undefined) {
    return {}
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new BackendCommandPortValidationError(
      `${key} must be a non-empty string when provided`
    )
  }
  return { [key]: value } as { readonly [K in typeof key]?: string }
}

export function optionalNumber(
  record: Record<string, unknown>,
  key: string
): { readonly [K in typeof key]?: number } {
  const value = record[key]
  if (value === undefined) {
    return {}
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new BackendCommandPortValidationError(
      `${key} must be a finite number when provided`
    )
  }
  return { [key]: value } as { readonly [K in typeof key]?: number }
}

export function optionalBoolean(
  record: Record<string, unknown>,
  key: string
): { readonly [K in typeof key]?: boolean } {
  const value = record[key]
  if (value === undefined) {
    return {}
  }
  if (typeof value !== "boolean") {
    throw new BackendCommandPortValidationError(
      `${key} must be a boolean when provided`
    )
  }
  return { [key]: value } as { readonly [K in typeof key]?: boolean }
}

export function optionalClassifier(record: Record<string, unknown>): {
  readonly classifier?: {
    readonly classifierId: string
    readonly label: string
    readonly confidence: number
  }
} {
  const value = record.classifier
  if (value === undefined) {
    return {}
  }
  const classifier = parseRecord("classifier", value)
  return {
    classifier: {
      classifierId: parseString(classifier, "classifierId", "classifier"),
      label: parseString(classifier, "label", "classifier"),
      confidence: parseNumber(classifier, "confidence", "classifier")
    }
  }
}

export function parseNumber(
  record: Record<string, unknown>,
  key: string,
  label: string
): number {
  const value = record[key]
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new BackendCommandPortValidationError(
      `${label}.${key} must be a finite number`
    )
  }
  return value
}

export function assertBackendPortNoInput(
  command: string,
  input: unknown
): void {
  if (input !== undefined) {
    throw new BackendCommandPortValidationError(
      `${command} does not accept input`
    )
  }
}

export class BackendCommandPortValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BackendCommandPortValidationError"
  }
}
