import type {
  ProductAppSurfaceClientCommandEnvelope
} from "@wanex/product-app/surface-client"

export interface ProductAppTuiAgentTurnSummary {
  readonly sessionId: string
  readonly assistantText: string
  readonly messageCount: number
  readonly jobStatuses: readonly string[]
}

export type ProductAppTuiAgentTurnOutcome =
  | ProductAppTuiAgentTurnCompletedOutcome
  | ProductAppTuiAgentTurnBlockedOutcome

export interface ProductAppTuiAgentTurnCompletedOutcome {
  readonly kind: "completed"
  readonly summary: ProductAppTuiAgentTurnSummary
}

export interface ProductAppTuiAgentTurnBlockedOutcome {
  readonly kind: "blocked"
  readonly command: string
  readonly code: string
  readonly category: string
  readonly message: string
}

export function agentTurnOutcomeFromSurfaceEnvelope(
  envelope: ProductAppSurfaceClientCommandEnvelope<unknown>
): ProductAppTuiAgentTurnOutcome {
  if (!envelope.ok) {
    throw new Error(`runAgentTurn failed: ${envelope.error.message}`)
  }
  const commandEnvelope = envelope.value
  if (!isRecord(commandEnvelope)) {
    throw new Error("runAgentTurn returned an invalid product command envelope")
  }
  if (commandEnvelope.ok === false) {
    return blockedAgentTurnOutcome(commandEnvelope)
  }
  if (commandEnvelope.ok !== true) {
    throw new Error("runAgentTurn returned an invalid product command envelope")
  }
  const value = commandEnvelope.value
  if (!isRecord(value)) {
    throw new Error("runAgentTurn returned an invalid value")
  }
  return {
    kind: "completed",
    summary: {
      sessionId: requireString(value.sessionId, "runAgentTurn value.sessionId"),
      assistantText: requireString(
        value.assistantText,
        "runAgentTurn value.assistantText"
      ),
      messageCount: requireNumber(
        value.messageCount,
        "runAgentTurn value.messageCount"
      ),
      jobStatuses: requireStringArray(
        value.jobStatuses,
        "runAgentTurn value.jobStatuses"
      )
    }
  }
}

function blockedAgentTurnOutcome(
  commandEnvelope: Readonly<Record<string, unknown>>
): ProductAppTuiAgentTurnBlockedOutcome {
  const error = commandEnvelope.error
  if (!isRecord(error)) {
    throw new Error("runAgentTurn returned an invalid error")
  }
  return {
    kind: "blocked",
    command: requireString(commandEnvelope.command, "runAgentTurn command"),
    code: requireString(error.code, "runAgentTurn error.code"),
    category: requireString(error.category, "runAgentTurn error.category"),
    message: requireString(error.message, "runAgentTurn error.message")
  }
}

function requireString(value: unknown, context: string): string {
  if (typeof value !== "string") {
    throw new Error(`${context} must be a string`)
  }
  return value
}

function requireNumber(value: unknown, context: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${context} must be a number`)
  }
  return value
}

function requireStringArray(value: unknown, context: string): readonly string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`${context} must be a string array`)
  }
  return value
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
