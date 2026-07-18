import type {
  TeamConversationMode,
  TeamConversationState,
  TeamParticipantKind,
  TeamParticipantState,
  TeamTurnKind
} from "@wanex/protocol"
import { expectString } from "./codec-common.js"

export function expectTeamConversationMode(value: unknown): TeamConversationMode {
  const mode = expectString(value, "team_conversation.mode")
  if (mode !== "tl" && mode !== "free" && mode !== "hybrid") {
    throw new Error(`invalid team conversation mode: ${mode}`)
  }
  return mode
}

export function expectTeamConversationState(value: unknown): TeamConversationState {
  const state = expectString(value, "team_conversation.state")
  if (
    state !== "open" &&
    state !== "paused" &&
    state !== "closed" &&
    state !== "cancelled"
  ) {
    throw new Error(`invalid team conversation state: ${state}`)
  }
  return state
}

export function expectTeamParticipantKind(value: unknown): TeamParticipantKind {
  const kind = expectString(value, "team_participant.kind")
  if (
    kind !== "user" &&
    kind !== "agent" &&
    kind !== "tool" &&
    kind !== "system"
  ) {
    throw new Error(`invalid team participant kind: ${kind}`)
  }
  return kind
}

export function expectTeamParticipantState(value: unknown): TeamParticipantState {
  const state = expectString(value, "team_participant.state")
  if (state !== "active" && state !== "muted" && state !== "left") {
    throw new Error(`invalid team participant state: ${state}`)
  }
  return state
}

export function expectTeamTurnKind(value: unknown): TeamTurnKind {
  const kind = expectString(value, "team_turn.kind")
  if (
    kind !== "message" &&
    kind !== "decision" &&
    kind !== "handoff" &&
    kind !== "system"
  ) {
    throw new Error(`invalid team turn kind: ${kind}`)
  }
  return kind
}
