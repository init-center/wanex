export function containsSensitiveText(
  value: unknown,
  sensitiveText: string
): boolean {
  if (sensitiveText.length === 0) {
    return false
  }
  return visitSensitiveValue(value, sensitiveText, new Set())
}

function visitSensitiveValue(
  value: unknown,
  sensitiveText: string,
  seen: Set<object>
): boolean {
  if (typeof value === "string") {
    return value.includes(sensitiveText)
  }
  if (value === null || typeof value !== "object") {
    return false
  }
  if (seen.has(value)) {
    return false
  }
  seen.add(value)
  return Object.values(value).some((item) =>
    visitSensitiveValue(item, sensitiveText, seen)
  )
}
