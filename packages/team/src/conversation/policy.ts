import type {
  TeamConversationRecord,
  TeamParticipantKind,
  TeamParticipantRecord,
  TeamTurnRecord
} from "@wanex/protocol"
import type {
  TeamRoundPolicy,
  TeamSpeakerHandler,
  TeamSpeakerHandlers
} from "./types.js"

export function validateTeamRoundPolicy(policy: TeamRoundPolicy): void {
  if (!Number.isInteger(policy.maxTurns) || policy.maxTurns <= 0) {
    throw new Error("team round policy maxTurns must be a positive integer")
  }
  if (policy.includeParticipantKinds !== undefined) {
    for (const kind of policy.includeParticipantKinds) {
      assertTeamParticipantKind(kind)
    }
  }
}

export function selectNextSpeaker(options: {
  readonly conversation: TeamConversationRecord
  readonly participants: readonly TeamParticipantRecord[]
  readonly turns: readonly TeamTurnRecord[]
  readonly policy: TeamRoundPolicy
}): TeamParticipantRecord | undefined {
  const mode = options.policy.mode ?? options.conversation.mode
  const candidates = options.participants.filter((participant) =>
    isParticipantIncluded(participant, options.policy)
  )
  if (candidates.length === 0) {
    return undefined
  }
  if (mode === "tl") {
    return candidates.find(isTlParticipant)
  }
  if (mode === "hybrid") {
    return candidates.find(isTlParticipant) ?? selectRoundRobin(candidates, options.turns)
  }
  return selectRoundRobin(candidates, options.turns)
}

export function getSpeakerHandler(
  handlers: TeamSpeakerHandlers,
  participantId: string
): TeamSpeakerHandler | undefined {
  if (isHandlerMap(handlers)) {
    return handlers.get(participantId)
  }
  return handlers[participantId]
}

function isHandlerMap(
  handlers: TeamSpeakerHandlers
): handlers is ReadonlyMap<string, TeamSpeakerHandler> {
  return typeof (handlers as { readonly get?: unknown }).get === "function"
}

function isParticipantIncluded(
  participant: TeamParticipantRecord,
  policy: TeamRoundPolicy
): boolean {
  const kinds = policy.includeParticipantKinds ?? ["agent", "tool"]
  return kinds.includes(participant.kind)
}

function isTlParticipant(participant: TeamParticipantRecord): boolean {
  if (participant.role === "tl") {
    return true
  }
  if (
    typeof participant.metadata === "object" &&
    participant.metadata !== null &&
    !Array.isArray(participant.metadata)
  ) {
    return (participant.metadata as { readonly tl?: unknown }).tl === true
  }
  return false
}

function selectRoundRobin(
  participants: readonly TeamParticipantRecord[],
  turns: readonly TeamTurnRecord[]
): TeamParticipantRecord | undefined {
  if (participants.length === 0) {
    return undefined
  }
  const lastSpeakerId = [...turns]
    .reverse()
    .find((turn) =>
      participants.some((participant) => participant.id === turn.speakerParticipantId)
    )?.speakerParticipantId
  if (lastSpeakerId === undefined) {
    return participants[0]
  }
  const index = participants.findIndex((participant) => participant.id === lastSpeakerId)
  return participants[(index + 1) % participants.length]
}

function assertTeamParticipantKind(value: TeamParticipantKind): void {
  if (
    value !== "user" &&
    value !== "agent" &&
    value !== "tool" &&
    value !== "system"
  ) {
    throw new Error(`invalid team round participant kind: ${String(value)}`)
  }
}
