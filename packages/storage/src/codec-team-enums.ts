import type {
  TeamConversationMode,
  TeamConversationState,
  TeamDeliveryRole,
  TeamDeliveryState,
  TeamDeliveryTrigger,
  TeamDiscussionRoundOutcome,
  TeamDiscussionRoundState,
  TeamMessageKind,
  TeamMessageState,
  TeamParticipantKind,
  TeamParticipantState,
  TeamRoutingOutcome
} from "@wanex/protocol"
import { expectString } from "./codec-common.js"

export function expectTeamConversationMode(value: unknown): TeamConversationMode {
  const mode = expectString(value, "team_conversation.mode")
  if (
    mode !== "orchestrated" &&
    mode !== "peer" &&
    mode !== "hybrid"
  ) {
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

export function expectTeamMessageKind(value: unknown): TeamMessageKind {
  const kind = expectString(value, "team_message.kind")
  if (
    kind !== "message" &&
    kind !== "decision" &&
    kind !== "handoff" &&
    kind !== "system"
  ) {
    throw new Error(`invalid team message kind: ${kind}`)
  }
  return kind
}

export function expectTeamMessageState(value: unknown): TeamMessageState {
  const state = expectString(value, "team_message.state")
  if (
    state !== "admitted" &&
    state !== "routed" &&
    state !== "visible" &&
    state !== "blocked" &&
    state !== "superseded"
  ) {
    throw new Error(`invalid team message state: ${state}`)
  }
  return state
}

export function expectTeamRoutingOutcome(value: unknown): TeamRoutingOutcome {
  const outcome = expectString(value, "team_routing_decision.outcome")
  if (outcome !== "deliver" && outcome !== "blocked") {
    throw new Error(`invalid team routing outcome: ${outcome}`)
  }
  return outcome
}

export function expectTeamDeliveryRole(value: unknown): TeamDeliveryRole {
  const role = expectString(value, "team_delivery.role")
  if (role !== "speaker" && role !== "observer" && role !== "summarizer") {
    throw new Error(`invalid team delivery role: ${role}`)
  }
  return role
}

export function expectTeamDeliveryTrigger(value: unknown): TeamDeliveryTrigger {
  const trigger = expectString(value, "team_delivery.trigger")
  if (
    trigger !== "direct" &&
    trigger !== "mention" &&
    trigger !== "lead" &&
    trigger !== "round" &&
    trigger !== "delegation"
  ) {
    throw new Error(`invalid team delivery trigger: ${trigger}`)
  }
  return trigger
}

export function expectTeamDeliveryState(value: unknown): TeamDeliveryState {
  const state = expectString(value, "team_delivery.state")
  if (
    state !== "queued" &&
    state !== "dispatched" &&
    state !== "responded" &&
    state !== "passed" &&
    state !== "failed" &&
    state !== "cancelled"
  ) {
    throw new Error(`invalid team delivery state: ${state}`)
  }
  return state
}

export function expectTeamDiscussionRoundState(
  value: unknown
): TeamDiscussionRoundState {
  const state = expectString(value, "team_discussion_round.state")
  if (state !== "open" && state !== "closed") {
    throw new Error(`invalid team discussion round state: ${state}`)
  }
  return state
}

export function expectTeamDiscussionRoundOutcome(
  value: unknown
): TeamDiscussionRoundOutcome {
  const outcome = expectString(value, "team_discussion_round.outcome")
  if (
    outcome !== "completed" &&
    outcome !== "partial" &&
    outcome !== "failed" &&
    outcome !== "cancelled"
  ) {
    throw new Error(`invalid team discussion round outcome: ${outcome}`)
  }
  return outcome
}
