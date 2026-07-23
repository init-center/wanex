import {
  createMemoryCompactionWorker,
  planMemoryCompaction,
  submitMemoryCompactionJob,
  type MemoryCompactionPlan,
  type MemoryCompactionRetentionPolicy
} from "../memory/index.js"
import type {
  JsonValue,
  SchedulerJobRecord,
  SessionId
} from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import type { WorkerRunOnceResult } from "../jobs/index.js"
import type { AgentRunOnceResult } from "../execution/agent-runtime/index.js"

export interface RuntimeHostMemoryCompactionOptions {
  readonly enabled?: boolean
  readonly workerCount?: number
  readonly policy?: Parameters<typeof planMemoryCompaction>[0]["policy"]
  readonly waterlineTokens?: number
  readonly minimumTokenSavings?: number
  readonly principalId?: string
  readonly priority?: number
  readonly maxAttempts?: number
  readonly retention?: MemoryCompactionRetentionPolicy
}

export interface RuntimeHostMemoryRunOnceResult {
  readonly plans: readonly MemoryCompactionPlan[]
  readonly submittedJobs: readonly SchedulerJobRecord[]
  readonly workerResults: readonly WorkerRunOnceResult[]
}

export type RuntimeHostMemoryWorker = ReturnType<
  typeof createMemoryCompactionWorker
>

export type RuntimeHostMemoryCompactionConfig = Required<
  Pick<
    RuntimeHostMemoryCompactionOptions,
    "enabled" | "workerCount" | "principalId"
  >
> &
  Omit<
    RuntimeHostMemoryCompactionOptions,
    "enabled" | "workerCount" | "principalId"
  >

export interface CreateMemoryWorkersRequest {
  readonly storage: CoreStore
  readonly config: RuntimeHostMemoryCompactionConfig | undefined
  readonly leaseMs?: number
  readonly heartbeatIntervalMs?: number
  readonly timeoutMs?: number
  createWorkerId(index: number): string
}

const DEFAULT_MEMORY_PRINCIPAL_ID = "runtime-host-memory"

export function normalizeMemoryCompactionOptions(
  options: RuntimeHostMemoryCompactionOptions | undefined
): RuntimeHostMemoryCompactionConfig | undefined {
  if (options?.enabled !== true) {
    return undefined
  }
  const workerCount = options.workerCount ?? 1
  if (!Number.isInteger(workerCount) || workerCount <= 0) {
    throw new Error("runtime host memory workerCount must be a positive integer")
  }
  return {
    ...options,
    enabled: true,
    workerCount,
    principalId: options.principalId ?? DEFAULT_MEMORY_PRINCIPAL_ID
  }
}

export function createRuntimeHostMemoryWorkers(
  request: CreateMemoryWorkersRequest
): RuntimeHostMemoryWorker[] {
  if (request.config === undefined) {
    return []
  }
  return Array.from({ length: request.config.workerCount }, (_, index) =>
    createMemoryCompactionWorker({
      storage: request.storage,
      workerId: request.createWorkerId(index),
      ...(request.leaseMs === undefined ? {} : { leaseMs: request.leaseMs }),
      ...(request.heartbeatIntervalMs === undefined
        ? {}
        : { heartbeatIntervalMs: request.heartbeatIntervalMs }),
      ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
      ...(request.config?.policy === undefined
        ? {}
        : { policy: request.config.policy }),
      ...(request.config?.retention === undefined
        ? {}
        : { retention: request.config.retention })
    })
  )
}

export async function runMemoryCompactionOnce(request: {
  readonly storage: CoreStore
  readonly config: RuntimeHostMemoryCompactionConfig | undefined
  readonly workers: readonly RuntimeHostMemoryWorker[]
  readonly agentResults: readonly AgentRunOnceResult[]
}): Promise<RuntimeHostMemoryRunOnceResult | undefined> {
  if (request.config === undefined) {
    return undefined
  }
  const completedSessionIds = sessionIdsFromCompletedRuns(request.agentResults)
  const plans: MemoryCompactionPlan[] = []
  const submittedJobs: SchedulerJobRecord[] = []
  for (const completed of completedSessionIds) {
    const plan = await planMemoryCompaction({
      storage: request.storage,
      sessionId: completed.sessionId,
      ...(request.config.policy === undefined
        ? {}
        : { policy: request.config.policy }),
      ...(request.config.waterlineTokens === undefined
        ? {}
        : { waterlineTokens: request.config.waterlineTokens }),
      ...(request.config.minimumTokenSavings === undefined
        ? {}
        : { minimumTokenSavings: request.config.minimumTokenSavings })
    })
    plans.push(plan)
    if (plan.decision !== "submit") {
      continue
    }
    submittedJobs.push(
      await submitMemoryCompactionJob(request.storage, {
        principalId: request.config.principalId,
        sessionId: completed.sessionId,
        ...(request.config.policy === undefined
          ? {}
          : { policy: request.config.policy }),
        priority: request.config.priority ?? 0,
        maxAttempts: request.config.maxAttempts ?? 3,
        idempotencyKey: `memory.compaction:${completed.jobId}:${plan.policyVersion}`
      })
    )
  }
  const workerResults = await Promise.all(
    request.workers.map(async (worker) => await worker.runOnce())
  )
  return {
    plans,
    submittedJobs,
    workerResults
  }
}

function sessionIdsFromCompletedRuns(
  results: readonly AgentRunOnceResult[]
): Array<{ readonly jobId: string; readonly sessionId: SessionId }> {
  const completed: Array<{
    readonly jobId: string
    readonly sessionId: SessionId
  }> = []
  for (const result of results) {
    if (result.worker.status !== "completed" || result.job === undefined) {
      continue
    }
    if (result.job.kind !== "session.turn") {
      continue
    }
    const sessionId = sessionIdFromSessionTurnPayload(result.job.payload)
    if (sessionId === null) {
      continue
    }
    completed.push({
      jobId: result.job.id,
      sessionId
    })
  }
  return completed
}

function sessionIdFromSessionTurnPayload(payload: JsonValue): SessionId | null {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return null
  }
  const sessionId = (payload as { readonly sessionId?: unknown }).sessionId
  return typeof sessionId === "string" && sessionId.length > 0
    ? sessionId
    : null
}
