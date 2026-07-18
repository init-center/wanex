import type {
  CancelJobRequest,
  ClaimJobRequest,
  CompleteJobRequest,
  EnqueueJobRequest,
  FailJobRequest,
  HeartbeatJobRequest,
  ListJobsRequest,
  SchedulerJobRecord
} from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import { assertPositiveLease } from "./session-commands.js"

export class SchedulerCommands {
  constructor(private readonly storage: CoreStore) {}

  async enqueueJob(request: EnqueueJobRequest): Promise<SchedulerJobRecord> {
    return await this.storage.enqueueJob(request)
  }

  async claimJob(request: ClaimJobRequest): Promise<SchedulerJobRecord | null> {
    assertPositiveLease(request.leaseMs, "job leaseMs must be positive")
    return await this.storage.claimJob(request)
  }

  async heartbeatJob(
    request: HeartbeatJobRequest
  ): Promise<SchedulerJobRecord | null> {
    assertPositiveLease(request.leaseMs, "job leaseMs must be positive")
    return await this.storage.heartbeatJob(request)
  }

  async completeJob(
    request: CompleteJobRequest
  ): Promise<SchedulerJobRecord | null> {
    return await this.storage.completeJob(request)
  }

  async failJob(request: FailJobRequest): Promise<SchedulerJobRecord | null> {
    return await this.storage.failJob(request)
  }

  async cancelJob(
    request: CancelJobRequest
  ): Promise<SchedulerJobRecord | null> {
    if (request.reason.length === 0) {
      throw new Error("cancel job reason must not be empty")
    }
    return await this.storage.cancelJob(request)
  }

  async listJobs(request: ListJobsRequest): Promise<SchedulerJobRecord[]> {
    return await this.storage.listJobs(request)
  }
}
