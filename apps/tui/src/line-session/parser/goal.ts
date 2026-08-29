import type { StartGoalRequest } from "@wanex/assistant/surface"
import type { TuiLineCommand } from "./model.js"

export function parseGoalStartCommand(rest: string): TuiLineCommand {
  if (rest.length === 0) {
    return {
      kind: "error",
      message: "goal-start requires a JSON Goal request"
    }
  }
  if (rest.length > 128_000) {
    return { kind: "error", message: "goal-start input is too large" }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(rest) as unknown
  } catch {
    return { kind: "error", message: "goal-start input must be valid JSON" }
  }
  const input = normalizeGoalStartInput(parsed)
  return typeof input === "string"
    ? { kind: "error", message: input }
    : { kind: "command", name: "goal-start", input }
}

function normalizeGoalStartInput(value: unknown): StartGoalRequest | string {
  if (!isRecord(value)) return "goal-start input must be a JSON object"
  const objective = requiredGoalText(value.objective, "objective", 32_768)
  if (!objective.ok) return objective.message
  const criteria = goalTextList(value.successCriteria, "successCriteria", true)
  if (typeof criteria === "string") return criteria
  const boundaries = goalTextList(value.boundaries, "boundaries", false)
  if (typeof boundaries === "string") return boundaries
  const constraints = goalTextList(value.constraints, "constraints", false)
  if (typeof constraints === "string") return constraints
  const sessionId = optionalGoalIdentity(value.sessionId, "sessionId")
  if (!sessionId.ok) return sessionId.message
  const stopPolicy = normalizeGoalStopPolicy(value.stopPolicy)
  if (typeof stopPolicy === "string") return stopPolicy
  return {
    objective: objective.value,
    successCriteria: criteria,
    boundaries,
    constraints,
    ...(sessionId.value === undefined ? {} : { sessionId: sessionId.value }),
    ...(stopPolicy === undefined ? {} : { stopPolicy })
  }
}

function normalizeGoalStopPolicy(
  value: unknown
): StartGoalRequest["stopPolicy"] | string {
  if (value === undefined) return undefined
  if (!isRecord(value)) return "stopPolicy must be an object"
  const maxAttempts = optionalBoundedGoalInteger(value.maxAttempts, "maxAttempts")
  if (typeof maxAttempts === "string") return maxAttempts
  const maxBlocked = optionalBoundedGoalInteger(
    value.maxConsecutiveBlockedAttempts,
    "maxConsecutiveBlockedAttempts"
  )
  if (typeof maxBlocked === "string") return maxBlocked
  if (
    maxAttempts !== undefined &&
    maxBlocked !== undefined &&
    maxBlocked > maxAttempts
  ) {
    return "maxConsecutiveBlockedAttempts must not exceed maxAttempts"
  }
  const deadlineAt = optionalPositiveGoalInteger(value.deadlineAt, "deadlineAt")
  if (typeof deadlineAt === "string") return deadlineAt
  const budget = normalizeGoalBudget(value.budget)
  if (typeof budget === "string") return budget
  return {
    ...(maxAttempts === undefined ? {} : { maxAttempts }),
    ...(maxBlocked === undefined
      ? {}
      : { maxConsecutiveBlockedAttempts: maxBlocked }),
    ...(deadlineAt === undefined ? {} : { deadlineAt }),
    ...(budget === undefined ? {} : { budget })
  }
}

function normalizeGoalBudget(
  value: unknown
): NonNullable<StartGoalRequest["stopPolicy"]>["budget"] | string | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) return "budget must be an object"
  const fields = ["tokens", "costMicros", "wallTimeMs", "toolCalls"] as const
  const budget: Record<string, number> = {}
  for (const field of fields) {
    const amount = optionalPositiveGoalInteger(value[field], `budget.${field}`)
    if (typeof amount === "string") return amount
    if (amount !== undefined) budget[field] = amount
  }
  return budget
}

function requiredGoalText(
  value: unknown,
  field: string,
  maxLength: number
):
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly message: string } {
  if (typeof value !== "string") {
    return { ok: false, message: `${field} must be a string` }
  }
  const normalized = value.trim()
  if (normalized.length === 0) {
    return { ok: false, message: `${field} must not be empty` }
  }
  if (normalized.length > maxLength) {
    return { ok: false, message: `${field} is too long` }
  }
  return { ok: true, value: normalized }
}

function goalTextList(
  value: unknown,
  field: string,
  required: boolean
): readonly string[] | string {
  if (value === undefined && !required) return []
  if (!Array.isArray(value)) return `${field} must be an array of strings`
  if (value.length > 64) return `${field} exceeds 64 items`
  const values: string[] = []
  for (const item of value) {
    const normalized = requiredGoalText(item, field, 4_096)
    if (!normalized.ok) return normalized.message
    values.push(normalized.value)
  }
  if (required && values.length === 0) return `${field} must not be empty`
  return values
}

function optionalGoalIdentity(
  value: unknown,
  field: string
):
  | { readonly ok: true; readonly value: string | undefined }
  | { readonly ok: false; readonly message: string } {
  if (value === undefined) return { ok: true, value: undefined }
  if (typeof value !== "string") {
    return { ok: false, message: `${field} must be a string` }
  }
  const normalized = value.trim()
  if (normalized.length === 0 || normalized.length > 512) {
    return {
      ok: false,
      message: `${field} must contain 1-512 characters`
    }
  }
  return { ok: true, value: normalized }
}

function optionalBoundedGoalInteger(
  value: unknown,
  field: string
): number | string | undefined {
  const parsed = optionalPositiveGoalInteger(value, field)
  if (typeof parsed === "number" && parsed > 100) {
    return `${field} must not exceed 100`
  }
  return parsed
}

function optionalPositiveGoalInteger(
  value: unknown,
  field: string
): number | string | undefined {
  if (value === undefined) return undefined
  return Number.isSafeInteger(value) && (value as number) > 0
    ? value as number
    : `${field} must be a positive integer`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
