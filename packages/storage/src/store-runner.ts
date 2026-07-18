import {
  type CancelRunRequest,
  type CompleteRunRequest,
  type FailRunRequest,
  type RunnerClaim,
  type RunnerClaimRequest,
  type RunnerHeartbeatRequest
} from "@wanex/protocol"

import {
  expectBoolean,
  fromRpcRunnerClaim,
  messagePartsToJson,
  toRpcJsonValue
} from "./codec.js"
import { RpcStoreFacetBase } from "./rpc-store-base.js"
import type { SchedulerStorageRpcCommand } from "./generated/storage-rpc.js"

export class RunnerStoreMethods extends RpcStoreFacetBase {
  async claimRunner(request: RunnerClaimRequest): Promise<RunnerClaim | null> {
    const value = await this.callScheduler({
      command: "claim-runner",
      session_id: request.sessionId,
      runner_id: request.runnerId,
      lease_ms: request.leaseMs
    })
    return value === null ? null : fromRpcRunnerClaim(value)
  }

  async heartbeatRunner(
    request: RunnerHeartbeatRequest
  ): Promise<RunnerClaim | null> {
    const value = await this.callScheduler({
      command: "heartbeat-runner",
      session_id: request.sessionId,
      runner_id: request.runnerId,
      lease_token: request.leaseToken,
      lease_ms: request.leaseMs
    })
    return value === null ? null : fromRpcRunnerClaim(value)
  }

  async completeRun(request: CompleteRunRequest): Promise<boolean> {
    const value = await this.callScheduler({
      command: "complete-run",
      session_id: request.sessionId,
      run_id: request.runId,
      input_id: request.inputId,
      runner_id: request.runnerId,
      lease_token: request.leaseToken,
      assistant_message: request.assistantMessage
        ? messagePartsToJson(request.assistantMessage)
        : null
    })
    return expectBoolean(value, "complete-run")
  }

  async failRun(request: FailRunRequest): Promise<boolean> {
    const value = await this.callScheduler({
      command: "fail-run",
      session_id: request.sessionId,
      run_id: request.runId,
      input_id: request.inputId,
      runner_id: request.runnerId,
      lease_token: request.leaseToken,
      error: toRpcJsonValue(request.error)
    })
    return expectBoolean(value, "fail-run")
  }

  async releaseRunner(request: {
    readonly sessionId: string
    readonly runnerId: string
    readonly leaseToken: string
  }): Promise<boolean> {
    const value = await this.callScheduler({
      command: "release-runner",
      session_id: request.sessionId,
      runner_id: request.runnerId,
      lease_token: request.leaseToken
    })
    return expectBoolean(value, "release-runner")
  }

  async cancelRun(request: CancelRunRequest): Promise<boolean> {
    const value = await this.callScheduler({
      command: "cancel-run",
      session_id: request.sessionId,
      run_id: request.runId,
      input_id: request.inputId,
      reason: request.reason
    })
    return expectBoolean(value, "cancel-run")
  }

  private callScheduler(request: SchedulerStorageRpcCommand) {
    return this.call(request)
  }
}
