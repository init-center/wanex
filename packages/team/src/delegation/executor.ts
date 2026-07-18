import type {
  ListJobsRequest,
  SchedulerJobRecord,
  SessionMessageRecord
} from "@wanex/protocol"
import type { SubmitUserTextRequest, SubmitUserTextResult } from "./types.js"

export interface DelegationExecutorWorkerRunSummary {
  readonly status: string
}

export interface DelegationExecutorTaskRunResult {
  readonly worker: DelegationExecutorWorkerRunSummary
  readonly job?: SchedulerJobRecord
}

export interface DelegationExecutorRunOnceResult {
  readonly results: readonly DelegationExecutorTaskRunResult[]
}

export interface DelegationExecutor {
  submitUserText(request: SubmitUserTextRequest): Promise<SubmitUserTextResult>
  runOnce(): Promise<DelegationExecutorRunOnceResult>
  listJobs(request: ListJobsRequest): Promise<SchedulerJobRecord[]>
  listSessionMessages(request: {
    readonly sessionId: string
  }): Promise<SessionMessageRecord[]>
}

export interface DelegationRuntimeHostLike
  extends Omit<DelegationExecutor, "listSessionMessages"> {
  readonly storage: {
    listSessionMessages(request: {
      readonly sessionId: string
    }): Promise<SessionMessageRecord[]>
  }
}

export function delegationExecutorFromRuntimeHost(
  host: DelegationRuntimeHostLike
): DelegationExecutor {
  return {
    async submitUserText(request) {
      return await host.submitUserText(request)
    },
    async runOnce() {
      return await host.runOnce()
    },
    async listJobs(request) {
      return await host.listJobs(request)
    },
    async listSessionMessages(request) {
      return await host.storage.listSessionMessages(request)
    }
  }
}
