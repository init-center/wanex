import type { DelegationGraphRuntime } from "@wanex/team/delegation/graph"
import type { EvalHarnessContext } from "../types.js"

export interface DelegationTerminalPolicyFixtureRequest {
  readonly runtime: DelegationGraphRuntime
  readonly context: EvalHarnessContext
}

export interface DelegationTerminalReleaseResult {
  readonly graphId: string
  readonly syncedTerminalNodeIds: readonly string[]
  readonly terminalMaterializedNodeIds: readonly string[]
  readonly blockedAfterSuccessNodeIds: readonly string[]
}

export interface DelegationRetryPolicyResult {
  readonly retryGraphId: string
  readonly retryJobState: string
  readonly retrySyncNoopReasons: readonly string[]
  readonly retryMaterializedNodeIds: readonly string[]
}
