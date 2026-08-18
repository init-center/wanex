import type {
  ChannelBindingState,
  ChannelDeliveryState,
  ChannelInboundEventState,
  ChannelProjectionRecord,
  ChannelProjectionTargetKind
} from "@wanex/protocol"
import { expectString } from "./codec-common.js"

export function expectChannelBindingState(value: unknown): ChannelBindingState {
  const state = expectString(value, "channel_binding.state")
  if (state !== "active" && state !== "revoked") {
    throw new Error(`invalid channel binding state: ${state}`)
  }
  return state
}

export function expectChannelInboundEventState(
  value: unknown
): ChannelInboundEventState {
  const state = expectString(value, "channel_inbound_event.state")
  if (
    state !== "received" &&
    state !== "projected" &&
    state !== "ignored" &&
    state !== "failed"
  ) {
    throw new Error(`invalid channel inbound event state: ${state}`)
  }
  return state
}

export function expectChannelDeliveryState(value: unknown): ChannelDeliveryState {
  const state = expectString(value, "channel_delivery.state")
  if (
    state !== "pending" &&
    state !== "sent" &&
    state !== "failed" &&
    state !== "cancelled"
  ) {
    throw new Error(`invalid channel delivery state: ${state}`)
  }
  return state
}

export function expectChannelProjectionTargetKind(
  value: unknown
): ChannelProjectionTargetKind {
  const kind = expectString(value, "channel_projection.target_kind")
  if (
    kind !== "session.turn" &&
    kind !== "team.message" &&
    kind !== "workspace.task" &&
    kind !== "ignored"
  ) {
    throw new Error(`invalid channel projection target kind: ${kind}`)
  }
  return kind
}

export function expectChannelProjectionState(
  value: unknown
): ChannelProjectionRecord["state"] {
  const state = expectString(value, "channel_projection.state")
  if (state !== "projected" && state !== "ignored") {
    throw new Error(`invalid channel projection state: ${state}`)
  }
  return state
}
