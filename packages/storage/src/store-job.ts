import {
  type CancelJobRequest,
  type ClaimJobRequest,
  type CompleteJobRequest,
  type EnqueueJobRequest,
  type FailJobRequest,
  type GetJobRequest,
  type HeartbeatJobRequest,
  type ListJobsRequest,
  type SchedulerJobRecord
} from "@wanex/protocol"

import {
  assertArray,
  fromRpcSchedulerJobRecord,
  toRpcCancelJobRequest,
  toRpcClaimJobRequest,
  toRpcCompleteJobRequest,
  toRpcEnqueueJobRequest,
  toRpcFailJobRequest,
  toRpcGetJobRequest,
  toRpcHeartbeatJobRequest,
  toRpcListJobsRequest
} from "./codec.js"
import { RpcStoreFacetBase } from "./rpc-store-base.js"
import type { SchedulerStorageRpcCommand } from "./generated/storage-rpc.js"

export class JobStoreMethods extends RpcStoreFacetBase {
  async enqueueJob(request: EnqueueJobRequest): Promise<SchedulerJobRecord> {
    const value = await this.callScheduler({
      command: "enqueue-job",
      request: toRpcEnqueueJobRequest(request)
    })
    return fromRpcSchedulerJobRecord(value)
  }

  async claimJob(
    request: ClaimJobRequest
  ): Promise<SchedulerJobRecord | null> {
    const value = await this.callScheduler({
      command: "claim-job",
      request: toRpcClaimJobRequest(request)
    })
    return value === null ? null : fromRpcSchedulerJobRecord(value)
  }

  async heartbeatJob(
    request: HeartbeatJobRequest
  ): Promise<SchedulerJobRecord | null> {
    const value = await this.callScheduler({
      command: "heartbeat-job",
      request: toRpcHeartbeatJobRequest(request)
    })
    return value === null ? null : fromRpcSchedulerJobRecord(value)
  }

  async completeJob(
    request: CompleteJobRequest
  ): Promise<SchedulerJobRecord | null> {
    const value = await this.callScheduler({
      command: "complete-job",
      request: toRpcCompleteJobRequest(request)
    })
    return value === null ? null : fromRpcSchedulerJobRecord(value)
  }

  async failJob(request: FailJobRequest): Promise<SchedulerJobRecord | null> {
    const value = await this.callScheduler({
      command: "fail-job",
      request: toRpcFailJobRequest(request)
    })
    return value === null ? null : fromRpcSchedulerJobRecord(value)
  }

  async cancelJob(
    request: CancelJobRequest
  ): Promise<SchedulerJobRecord | null> {
    const value = await this.callScheduler({
      command: "cancel-job",
      request: toRpcCancelJobRequest(request)
    })
    return value === null ? null : fromRpcSchedulerJobRecord(value)
  }

  async getJob(request: GetJobRequest): Promise<SchedulerJobRecord | null> {
    const value = await this.callScheduler({
      command: "get-job",
      request: toRpcGetJobRequest(request)
    })
    return value === null ? null : fromRpcSchedulerJobRecord(value)
  }

  async listJobs(request: ListJobsRequest): Promise<SchedulerJobRecord[]> {
    const value = await this.callScheduler({
      command: "list-jobs",
      request: toRpcListJobsRequest(request)
    })
    assertArray(value, "scheduler jobs")
    return value.map(fromRpcSchedulerJobRecord)
  }

  private callScheduler(request: SchedulerStorageRpcCommand) {
    return this.call(request)
  }
}
