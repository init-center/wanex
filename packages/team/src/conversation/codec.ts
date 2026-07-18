import type {
  JsonValue,
  TeamConversationMode,
  TeamParticipantKind
} from "@wanex/protocol"
import { validateTeamRoundPolicy } from "./policy.js"
import type {
  TeamRoundJobPayload,
  TeamRoundJobResult,
  TeamRoundPolicy
} from "./types.js"

export function teamRoundJobPayloadToJson(
  payload: TeamRoundJobPayload
): JsonValue {
  return {
    conversationId: payload.conversationId,
    policy: teamRoundPolicyToJson(payload.policy),
    ...(payload.metadata === undefined ? {} : { metadata: payload.metadata })
  }
}

export function teamRoundJobPayloadFromJson(value: JsonValue): TeamRoundJobPayload {
  if (!isRecord(value)) {
    throw new Error("team.round.close payload must be an object")
  }
  return {
    conversationId: expectNonEmptyString(
      value.conversationId,
      "team.round.close.conversationId"
    ),
    policy: teamRoundPolicyFromJson(value.policy),
    ...(value.metadata === undefined ? {} : { metadata: value.metadata })
  }
}

export function teamRoundJobResultToJson(result: TeamRoundJobResult): JsonValue {
  return {
    conversationId: result.conversationId,
    stopReason: result.stopReason,
    turnIds: [...result.turnIds],
    ...(result.metadata === undefined ? {} : { metadata: result.metadata })
  }
}

function teamRoundPolicyToJson(policy: TeamRoundPolicy): JsonValue {
  validateTeamRoundPolicy(policy)
  return {
    maxTurns: policy.maxTurns,
    ...(policy.mode === undefined ? {} : { mode: policy.mode }),
    ...(policy.includeParticipantKinds === undefined
      ? {}
      : { includeParticipantKinds: [...policy.includeParticipantKinds] }),
    ...(policy.metadata === undefined ? {} : { metadata: policy.metadata })
  }
}

function teamRoundPolicyFromJson(value: unknown): TeamRoundPolicy {
  if (!isRecord(value)) {
    throw new Error("team round policy must be an object")
  }
  const policy: TeamRoundPolicy = {
    maxTurns: expectPositiveInteger(value.maxTurns, "team round policy maxTurns"),
    ...(value.mode === undefined || value.mode === null
      ? {}
      : { mode: expectTeamConversationMode(value.mode) }),
    ...(value.includeParticipantKinds === undefined ||
    value.includeParticipantKinds === null
      ? {}
      : {
          includeParticipantKinds: expectTeamParticipantKinds(
            value.includeParticipantKinds
          )
        }),
    ...(value.metadata === undefined ? {} : { metadata: value.metadata as JsonValue })
  }
  validateTeamRoundPolicy(policy)
  return policy
}

function expectTeamConversationMode(value: unknown): TeamConversationMode {
  if (value !== "tl" && value !== "free" && value !== "hybrid") {
    throw new Error(`invalid team round mode: ${String(value)}`)
  }
  return value
}

function expectTeamParticipantKinds(value: unknown): TeamParticipantKind[] {
  if (!Array.isArray(value)) {
    throw new Error("team round participant kinds must be an array")
  }
  return value.map(expectTeamParticipantKind)
}

function expectTeamParticipantKind(value: unknown): TeamParticipantKind {
  if (
    value !== "user" &&
    value !== "agent" &&
    value !== "tool" &&
    value !== "system"
  ) {
    throw new Error(`invalid team round participant kind: ${String(value)}`)
  }
  return value
}

function expectPositiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
  return value
}

function expectNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`)
  }
  return value
}

function isRecord(value: unknown): value is { readonly [key: string]: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
