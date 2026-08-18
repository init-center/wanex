import type { ContextEpochState } from "@wanex/protocol"
import { expectString } from "./codec-common.js"

export function expectContextEpochState(value: unknown): ContextEpochState {
  const state = expectString(value, "context_epoch.state")
  if (
    state !== "building" &&
    state !== "active" &&
    state !== "superseded" &&
    state !== "failed"
  ) {
    throw new Error(`invalid context epoch state: ${state}`)
  }
  return state
}
