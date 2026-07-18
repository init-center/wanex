import { randomUUID } from "node:crypto"
import { WanexAgentRuntime } from "../execution/agent-runtime/index.js"
import type { CoreStore } from "@wanex/storage"
import type { WanexRuntimeHostBehaviorOptions } from "./types.js"

export const DEFAULT_RUNTIME_HOST_WORKER_COUNT = 1

export interface CreateRuntimeHostAgentWorkersRequest
  extends WanexRuntimeHostBehaviorOptions {
  readonly storage: CoreStore
}

export function createRuntimeHostAgentWorkers(
  request: CreateRuntimeHostAgentWorkersRequest
): WanexAgentRuntime[] {
  const workerCount = request.workerCount ?? DEFAULT_RUNTIME_HOST_WORKER_COUNT
  if (!Number.isInteger(workerCount) || workerCount <= 0) {
    throw new Error("runtime host workerCount must be a positive integer")
  }
  return Array.from({ length: workerCount }, (_, index) =>
    new WanexAgentRuntime({
      storage: request.storage,
      workerId: `runtime_host_worker_${index}_${randomUUID()}`,
      runnerId: `runtime_host_runner_${index}_${randomUUID()}`,
      ...(request.providerProfileId === undefined
        ? {}
        : { providerProfileId: request.providerProfileId }),
      ...(request.provider === undefined ? {} : { provider: request.provider }),
      ...(request.tools === undefined ? {} : { tools: request.tools }),
      ...(request.toolPermissionPolicy === undefined
        ? {}
        : { toolPermissionPolicy: request.toolPermissionPolicy }),
      ...(request.toolRecoveryPolicy === undefined
        ? {}
        : { toolRecoveryPolicy: request.toolRecoveryPolicy }),
      ...(request.toolMaxConcurrency === undefined
        ? {}
        : { toolMaxConcurrency: request.toolMaxConcurrency }),
      ...(request.contextCompiler === undefined
        ? {}
        : { contextCompiler: request.contextCompiler }),
      ...(request.fakeResponseText === undefined
        ? {}
        : { fakeResponseText: request.fakeResponseText }),
      ...(request.leaseMs === undefined ? {} : { leaseMs: request.leaseMs }),
      ...(request.heartbeatIntervalMs === undefined
        ? {}
        : { heartbeatIntervalMs: request.heartbeatIntervalMs }),
      ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
      ...(request.observeProviderEvent === undefined
        ? {}
        : { observeProviderEvent: request.observeProviderEvent })
    })
  )
}
