import type { ContextEpochState, ContextReplacementTier } from "@wanex/protocol"
import { expectString } from "./codec-common.js"

export function expectContextEpochState(value: unknown): ContextEpochState {
  const state = expectString(value, "context_epoch.state")
  if (state !== "building" && state !== "active" && state !== "superseded") {
    throw new Error(`invalid context epoch state: ${state}`)
  }
  return state
}

export function expectContextReplacementTier(value: unknown): ContextReplacementTier {
  const tier = expectString(value, "context_replacement.tier")
  if (tier !== "tier1_snip" && tier !== "tier2_placeholder") {
    throw new Error(`invalid context replacement tier: ${tier}`)
  }
  return tier
}
