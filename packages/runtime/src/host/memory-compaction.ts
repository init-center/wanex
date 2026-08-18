import {
  createMemoryCompactionWorker,
  planMemoryCompaction,
  submitMemoryCompactionJob,
  type MemoryCompactionPlan,
  type MemoryCompactionRetentionPolicy
} from "../memory/index.js"
import type {
  ModelEndpointExecutionBinding,
  SchedulerJobRecord,
  SessionId
} from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import type { WorkerRunOnceResult } from "../jobs/index.js"
import type { AgentRunOnceResult } from "../execution/agent-runtime/index.js"
import { sessionTurnJobIdentity } from "../execution/worker/index.js"
import type { ProviderAdapter } from "../provider/index.js"
import type { SecretResolverPort } from "../secrets/index.js"

export interface RuntimeHostMemoryCompactionOptions {
  readonly enabled?: boolean
  readonly workerCount?: number
  readonly policy?: Parameters<typeof planMemoryCompaction>[0]["policy"]
  readonly principalId?: string
  readonly priority?: number
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
  readonly directProvider?: ProviderAdapter
  readonly secretResolver?: SecretResolverPort
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
      ...(request.directProvider === undefined
        ? {}
        : { directProvider: request.directProvider }),
      ...(request.secretResolver === undefined
        ? {}
        : { secretResolver: request.secretResolver }),
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
  const completedTurns = await completedTurnsFromRuns(
    request.storage,
    request.agentResults
  )
  const plans: MemoryCompactionPlan[] = []
  const submittedJobs: SchedulerJobRecord[] = []
  for (const completed of completedTurns) {
    const plan = await planMemoryCompaction({
      storage: request.storage,
      sessionId: completed.sessionId,
      modelEndpoint: completed.modelEndpoint,
      ...(request.config.policy === undefined
        ? {}
        : { policy: request.config.policy })
    })
    plans.push(plan)
    if (plan.decision !== "submit") {
      continue
    }
    if (plan.evidence === undefined) {
      throw new Error("submitted memory compaction plan is missing frozen evidence")
    }
    submittedJobs.push(
      await submitMemoryCompactionJob(request.storage, {
        principalId: request.config.principalId,
        evidence: plan.evidence,
        priority: request.config.priority ?? 0,
        idempotencyKey: `memory.compaction:${completed.sessionId}:${plan.evidence.sourceDigest}:${plan.evidence.policyDigest}`
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

async function completedTurnsFromRuns(
  storage: CoreStore,
  results: readonly AgentRunOnceResult[]
): Promise<Array<{
    readonly jobId: string
    readonly sessionId: SessionId
    readonly modelEndpoint: ModelEndpointExecutionBinding
  }>> {
  const completed: Array<{
    readonly jobId: string
    readonly sessionId: SessionId
    readonly modelEndpoint: ModelEndpointExecutionBinding
  }> = []
  for (const result of results) {
    if (result.worker.status !== "completed" || result.job === undefined) {
      continue
    }
    if (result.job.kind !== "session.turn") {
      continue
    }
    const identity = sessionTurnJobIdentity(result.job)
    const turn = (await storage.listSessionTurns({ sessionId: identity.sessionId }))
      .find((candidate) => candidate.id === identity.turnId)
    if (
      turn === undefined ||
      turn.jobId !== result.job.id ||
      !isTerminalTurnState(turn.state)
    ) continue
    completed.push({
      jobId: result.job.id,
      sessionId: identity.sessionId,
      modelEndpoint: turn.executionBinding.modelEndpoint
    })
  }
  return completed
}

function isTerminalTurnState(state: string): boolean {
  return (
    state === "succeeded" ||
    state === "failed" ||
    state === "cancelled" ||
    state === "interrupted"
  )
}
