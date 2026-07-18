import {
  type JsonValue,
  type RunnerClaim
} from "@wanex/protocol"

import {
  expectNumber,
  expectString,
  isRecord
} from "./codec-helpers.js"

export function fromRpcRunnerClaim(value: JsonValue): RunnerClaim {
  if (!isRecord(value)) {
    throw new Error("runner claim must be an object")
  }
  return {
    sessionId: expectString(value.session_id, "claim.session_id"),
    inputId: expectString(value.input_id, "claim.input_id"),
    runId: expectString(value.run_id, "claim.run_id"),
    runnerId: expectString(value.runner_id, "claim.runner_id"),
    leaseToken: expectString(value.lease_token, "claim.lease_token"),
    leaseExpiresAt: expectNumber(value.lease_expires_at, "claim.lease_expires_at")
  }
}
