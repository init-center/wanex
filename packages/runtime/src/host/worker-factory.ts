import { randomUUID } from "node:crypto"
import { WanexAgentRuntime } from "../execution/agent-runtime/index.js"
import { WanexMediaGenerationRuntime } from "../media-generation/index.js"
import type { CoreStore } from "@wanex/storage"
import type { ActiveExecutionAbortRegistry } from "../jobs/active-abort.js"
import type { WanexRuntimeHostBehaviorOptions } from "./types.js"

export const DEFAULT_RUNTIME_HOST_WORKER_COUNT = 1

export interface CreateRuntimeHostAgentWorkersRequest
  extends WanexRuntimeHostBehaviorOptions {
  readonly storage: CoreStore
  readonly activeAbortRegistry: ActiveExecutionAbortRegistry
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
      activeAbortRegistry: request.activeAbortRegistry,
      workerId: `runtime_host_worker_${index}_${randomUUID()}`,
      ...(request.modelEndpointId === undefined
        ? {}
        : { modelEndpointId: request.modelEndpointId }),
      ...(request.secretResolver === undefined
        ? {}
        : { secretResolver: request.secretResolver }),
      ...(request.provider === undefined ? {} : { provider: request.provider }),
      ...(request.tools === undefined ? {} : { tools: request.tools }),
      ...(request.toolPermissionPolicy === undefined
        ? {}
        : { toolPermissionPolicy: request.toolPermissionPolicy }),
      ...(request.recovery === undefined
        ? {}
        : { recovery: request.recovery }),
      ...(request.toolMaxConcurrency === undefined
        ? {}
        : { toolMaxConcurrency: request.toolMaxConcurrency }),
      ...(request.contextCompiler === undefined
        ? {}
        : { contextCompiler: request.contextCompiler }),
      ...(request.agentContext === undefined
        ? {}
        : { agentContext: request.agentContext }),
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
        : { observeProviderEvent: request.observeProviderEvent }),
      ...(request.resolveAgentContext === undefined
        ? {}
        : { resolveAgentContext: request.resolveAgentContext })
    })
  )
}

export const DEFAULT_RUNTIME_HOST_MEDIA_GENERATION_WORKER_COUNT = 1

export interface CreateRuntimeHostMediaGenerationWorkersRequest
  extends WanexRuntimeHostBehaviorOptions {
  readonly storage: CoreStore
  readonly activeAbortRegistry: ActiveExecutionAbortRegistry
}

export function createRuntimeHostMediaGenerationWorkers(
  request: CreateRuntimeHostMediaGenerationWorkersRequest
): WanexMediaGenerationRuntime[] {
  const adapters = request.mediaGenerationAdapters
  if (adapters === undefined || adapters.length === 0) {
    return []
  }
  const workerCount =
    request.mediaGenerationWorkerCount ??
    DEFAULT_RUNTIME_HOST_MEDIA_GENERATION_WORKER_COUNT
  if (!Number.isInteger(workerCount) || workerCount <= 0) {
    throw new Error(
      "runtime host mediaGenerationWorkerCount must be a positive integer"
    )
  }
  return Array.from({ length: workerCount }, (_, index) =>
    new WanexMediaGenerationRuntime({
      storage: request.storage,
      adapters,
      activeAbortRegistry: request.activeAbortRegistry,
      workerId: `runtime_host_media_generation_worker_${index}_${randomUUID()}`,
      ...(request.leaseMs === undefined ? {} : { leaseMs: request.leaseMs }),
      ...(request.heartbeatIntervalMs === undefined
        ? {}
        : { heartbeatIntervalMs: request.heartbeatIntervalMs }),
      ...(request.timeoutMs === undefined
        ? {}
        : { timeoutMs: request.timeoutMs }),
      ...(request.mediaGenerationMaxOutputBytes === undefined
        ? {}
        : { maxOutputBytes: request.mediaGenerationMaxOutputBytes }),
      ...(request.mediaGenerationPollInitialDelayMs === undefined
        ? {}
        : { pollInitialDelayMs: request.mediaGenerationPollInitialDelayMs }),
      ...(request.mediaGenerationPollMaxDelayMs === undefined
        ? {}
        : { pollMaxDelayMs: request.mediaGenerationPollMaxDelayMs }),
      ...(request.mediaGenerationMaxConsecutivePollFailures === undefined
        ? {}
        : {
            maxConsecutivePollFailures:
              request.mediaGenerationMaxConsecutivePollFailures
          })
    })
  )
}
