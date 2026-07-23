import {
  createStorageHandle,
  type CoreStore,
  type StorageHandle
} from "@wanex/storage"
import type {
  ProviderCapabilities,
  SchedulerJobRecord,
  SchedulerJobState,
  SessionMessageRecord,
  SessionTurnState,
  TextMessagePart
} from "@wanex/protocol"
import {
  FakeProviderAdapter,
  writeProviderProfile
} from "./provider/index.js"
import { WanexRuntimeHost } from "./host/host.js"
import type {
  WanexRuntime,
  WanexRuntimeCancelOperationResult,
  WanexRuntimeHealth,
  WanexRuntimeOperationReference,
  WanexRuntimeOperationState,
  WanexRuntimeOptions,
  WanexRuntimeProviderOptions,
  WanexRuntimeReadOperationResult,
  WanexRuntimeRunOnceResult,
  WanexRuntimeRunResult,
  WanexRuntimeStatus,
  WanexRuntimeSubmitResult,
  WanexRuntimeWorkerResultStatus
} from "./types.js"

const defaultProviderId = "wanex-runtime-default"

export async function createWanexRuntime(
  options: WanexRuntimeOptions
): Promise<WanexRuntime> {
  const provider = normalizeProvider(options.provider)
  validateProviderRuntimeOptions(provider, options.secretResolver !== undefined)
  const storage = openRuntimeStorage(options.storage)

  try {
    await writeProviderProfile(storage.core, {
      id: provider.id,
      kind: provider.kind,
      providerId: provider.providerId,
      modelId: provider.modelId,
      capabilities: provider.capabilities,
      ...(provider.baseUrl === undefined ? {} : { baseUrl: provider.baseUrl }),
      ...(provider.secretRef === undefined
        ? {}
        : { secretRef: provider.secretRef }),
      ...(provider.anthropicVersion === undefined
        ? {}
        : { anthropicVersion: provider.anthropicVersion })
    })

    const host = new WanexRuntimeHost({
      storage: storage.core,
      workerCount: options.workerCount ?? 1,
      providerProfileId: provider.id,
      ...(options.secretResolver === undefined
        ? {}
        : { secretResolver: options.secretResolver }),
      ...(provider.responseText === undefined
        ? {}
        : {
            provider: new FakeProviderAdapter({
              providerId: provider.providerId,
              modelId: provider.modelId,
              responseText: provider.responseText,
              capabilities: provider.capabilities
            })
          }),
      ...(options.leaseMs === undefined ? {} : { leaseMs: options.leaseMs }),
      ...(options.heartbeatIntervalMs === undefined
        ? {}
        : { heartbeatIntervalMs: options.heartbeatIntervalMs }),
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
      ...(options.idleIntervalMs === undefined
        ? {}
        : { idleIntervalMs: options.idleIntervalMs }),
      ...(options.errorIntervalMs === undefined
        ? {}
        : { errorIntervalMs: options.errorIntervalMs }),
      ...(options.observeProviderEvent === undefined
        ? {}
        : { observeProviderEvent: options.observeProviderEvent })
    })
    let disposed = false

    const assertActive = (): void => {
      if (disposed) {
        throw new Error("wanex runtime is disposed")
      }
    }

    return {
      status(): WanexRuntimeStatus {
        const status = host.status()
        return {
          disposed,
          started: status.started,
          workerCount: status.workerCount,
          providerProfileId: provider.id,
          providerKind: provider.kind,
          modelId: provider.modelId
        }
      },
      health(now): WanexRuntimeHealth {
        const health = host.getHealthSnapshot({
          ...(now === undefined ? {} : { now })
        })
        return {
          generatedAt: health.generatedAt,
          started: health.started,
          workerCount: health.workerCount,
          loopCount: health.loopCount,
          activeLoopCount: health.activeLoopCount,
          stoppedLoopCount: health.stoppedLoopCount
        }
      },
      async submit(request): Promise<WanexRuntimeSubmitResult> {
        assertActive()
        const submitted = await host.submitUserTurn(request)
        return {
          sessionId: submitted.session.id,
          inputId: submitted.inputId,
          turnId: submitted.turnId,
          jobId: submitted.receipt.job.id
        }
      },
      async readOperation(request): Promise<WanexRuntimeReadOperationResult> {
        assertActive()
        return await readRuntimeOperation(storage.core, request)
      },
      async cancelOperation(request): Promise<WanexRuntimeCancelOperationResult> {
        assertActive()
        const reference = operationReference(request)
        const receipt = await host.requestSessionTurnCancel({
          ...reference,
          reason: requiredString(request.reason, "runtime cancel reason")
        })
        return { ...reference, status: receipt.status }
      },
      async runOnce(): Promise<WanexRuntimeRunOnceResult> {
        assertActive()
        const result = await host.runOnce()
        return {
          workerResults: result.results.map((item) =>
            projectWorkerStatus(item.worker.status)
          )
        }
      },
      async run(request): Promise<WanexRuntimeRunResult> {
        assertActive()
        if (host.status().started) {
          throw new Error("wanex runtime run requires stopped background workers")
        }
        const submitted = await host.submitUserTurn(request)
        const reference = {
          sessionId: submitted.session.id,
          inputId: submitted.inputId,
          turnId: submitted.turnId,
          jobId: submitted.receipt.job.id
        }
        const run = await host.runOnce()
        const read = await readRuntimeOperation(storage.core, reference)
        if (read.kind === "missing") {
          throw new Error("wanex runtime submitted operation was not found")
        }
        return {
          ...reference,
          state: read.operation.state,
          assistantText: read.operation.assistantText,
          messageCount: read.operation.messageCount,
          workerResults: run.results.map((item) =>
            projectWorkerStatus(item.worker.status)
          )
        }
      },
      start(): void {
        assertActive()
        host.start()
      },
      async stop(): Promise<void> {
        if (disposed) {
          return
        }
        await host.stop()
      },
      async dispose(): Promise<void> {
        if (disposed) {
          return
        }
        disposed = true
        await host.dispose()
        await storage.dispose()
      }
    }
  } catch (error) {
    await storage.dispose()
    throw error
  }
}

function openRuntimeStorage(
  config: WanexRuntimeOptions["storage"]
): Pick<StorageHandle, "core" | "transport" | "dispose"> {
  if (config.kind !== "injected") return createStorageHandle(config)
  return {
    core: config.handle.core,
    transport: config.handle.transport,
    async dispose() {}
  }
}

interface NormalizedProvider {
  readonly id: string
  readonly kind: "fake" | "openai-compatible" | "anthropic" | "deepseek"
  readonly providerId: string
  readonly modelId: string
  readonly capabilities: ProviderCapabilities
  readonly baseUrl?: string
  readonly secretRef?: string
  readonly anthropicVersion?: string
  readonly responseText?: string
}

function normalizeProvider(
  provider: WanexRuntimeProviderOptions | undefined
): NormalizedProvider {
  if (provider === undefined) {
    return {
      id: defaultProviderId,
      kind: "fake",
      capabilities: { input: ["text"], output: ["text"] },
      providerId: "fake",
      modelId: "wanex-runtime-model",
      responseText: "Wanex runtime response"
    }
  }
  if (provider.kind === "fake" || provider.kind === undefined) {
    return {
      id: provider.id ?? defaultProviderId,
      kind: "fake",
      providerId: provider.providerId ?? "fake",
      modelId: provider.modelId ?? "wanex-runtime-model",
      capabilities: provider.capabilities ?? {
        input: ["text"],
        output: ["text"]
      },
      responseText: provider.responseText ?? "Wanex runtime response"
    }
  }
  if (
    provider.kind === "openai-compatible" ||
    provider.kind === "anthropic" ||
    provider.kind === "deepseek"
  ) {
    return {
      id: provider.id ?? defaultProviderId,
      kind: provider.kind,
      providerId: provider.providerId ?? provider.kind,
      modelId: provider.modelId,
      capabilities: provider.capabilities,
      ...(provider.baseUrl === undefined ? {} : { baseUrl: provider.baseUrl }),
      ...(provider.secretRef === undefined
        ? {}
        : { secretRef: provider.secretRef }),
      ...(provider.anthropicVersion === undefined
        ? {}
        : { anthropicVersion: provider.anthropicVersion })
    }
  }
  throw new Error(`unsupported runtime provider: ${String(provider.kind)}`)
}

function validateProviderRuntimeOptions(
  provider: NormalizedProvider,
  secretResolverConfigured: boolean
): void {
  if (provider.kind === "fake") return
  if (provider.baseUrl === undefined || provider.baseUrl.length === 0) {
    throw new Error(`${provider.kind} provider requires baseUrl`)
  }
  if (provider.secretRef === undefined || provider.secretRef.length === 0) {
    throw new Error(`${provider.kind} provider requires secretRef`)
  }
  if (!/^[A-Za-z][A-Za-z0-9+.-]*:/.test(provider.secretRef)) {
    throw new Error(
      `${provider.kind} provider secretRef must include a URI scheme`
    )
  }
  if (!secretResolverConfigured) {
    throw new Error(`${provider.kind} provider requires secret resolver`)
  }
}

function assistantText(
  messages: readonly SessionMessageRecord[],
  turnId: string
): string {
  return messages
    .filter((message) => message.turnId === turnId && message.role === "assistant")
    .flatMap((message) => message.content)
    .filter((part): part is TextMessagePart => part.type === "text")
    .map((part) => part.text)
    .join("\n")
}

async function readRuntimeOperation(
  storage: CoreStore,
  request: WanexRuntimeOperationReference
): Promise<WanexRuntimeReadOperationResult> {
  const reference = operationReference(request)
  const [job, turns] = await Promise.all([
    storage.getJob({ jobId: reference.jobId }),
    storage.listSessionTurns({ sessionId: reference.sessionId })
  ])
  if (!matchesRuntimeOperationJob(job, reference)) {
    return { kind: "missing", reference }
  }
  const turn = turns.find((candidate) =>
    candidate.id === reference.turnId &&
    candidate.primaryInputId === reference.inputId &&
    candidate.jobId === reference.jobId
  )
  if (turn === undefined) {
    return { kind: "missing", reference }
  }
  const messages = await storage.listSessionMessages({
    sessionId: reference.sessionId
  })
  const operationMessages = messages.filter(
    (message) => message.turnId === reference.turnId
  )
  return {
    kind: "found",
    reference,
    operation: {
      ...reference,
      state: runtimeOperationState(job.state, turn.state),
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      ...(job.finishedAt === undefined ? {} : { finishedAt: job.finishedAt }),
      ...(turn.currentAttemptId === undefined
        ? {}
        : { activeAttemptId: turn.currentAttemptId }),
      assistantText: assistantText(operationMessages, reference.turnId),
      messageCount: operationMessages.length
    }
  }
}

function matchesRuntimeOperationJob(
  job: SchedulerJobRecord | null,
  reference: WanexRuntimeOperationReference
): job is SchedulerJobRecord {
  if (job === null || job.kind !== "session.turn") {
    return false
  }
  const payload = job.payload
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return false
  }
  const record = payload as Readonly<Record<string, unknown>>
  return (
    record.sessionId === reference.sessionId &&
    record.turnId === reference.turnId &&
    record.inputId === reference.inputId
  )
}

function runtimeOperationState(
  jobState: SchedulerJobState,
  turnState: SessionTurnState
): WanexRuntimeOperationState {
  switch (turnState) {
    case "queued":
      return "queued"
    case "running":
    case "cancel_requested":
    case "succeeded":
    case "failed":
    case "cancelled":
    case "interrupted":
    case "recovery_required":
      return turnState
  }
  switch (jobState) {
    case "pending":
    case "ready":
    case "retry_scheduled":
      return "queued"
    case "running":
    case "succeeded":
    case "failed":
    case "cancelled":
      return jobState
  }
}

function operationReference(
  request: WanexRuntimeOperationReference
): WanexRuntimeOperationReference {
  return {
    sessionId: requiredString(request.sessionId, "runtime operation sessionId"),
    inputId: requiredString(request.inputId, "runtime operation inputId"),
    turnId: requiredString(request.turnId, "runtime operation turnId"),
    jobId: requiredString(request.jobId, "runtime operation jobId")
  }
}

function requiredString(value: string, label: string): string {
  if (value.length === 0) {
    throw new Error(`${label} must not be empty`)
  }
  return value
}

function projectWorkerStatus(status: string): WanexRuntimeWorkerResultStatus {
  return status === "completed" || status === "failed" ? status : "idle"
}
