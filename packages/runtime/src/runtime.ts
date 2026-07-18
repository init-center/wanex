import {
  createStorageHandle,
  type StorageHandle
} from "@wanex/storage"
import type { SessionMessageRecord, TextMessagePart } from "@wanex/protocol"
import { writeProviderProfile } from "./provider/index.js"
import { WanexRuntimeHost } from "./host/host.js"
import type {
  WanexRuntime,
  WanexRuntimeHealth,
  WanexRuntimeJobState,
  WanexRuntimeOptions,
  WanexRuntimeProviderOptions,
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
  const storage = openRuntimeStorage(options.storage)
  const provider = normalizeProvider(options.provider)

  try {
    await writeProviderProfile(storage.core, {
      id: provider.id,
      kind: provider.kind,
      providerId: provider.providerId,
      modelId: provider.modelId,
      ...(provider.baseUrl === undefined ? {} : { baseUrl: provider.baseUrl }),
      ...(provider.apiKey === undefined ? {} : { apiKey: provider.apiKey }),
      ...(provider.anthropicVersion === undefined
        ? {}
        : { anthropicVersion: provider.anthropicVersion })
    })

    const host = new WanexRuntimeHost({
      storage: storage.core,
      workerCount: options.workerCount ?? 1,
      providerProfileId: provider.id,
      ...(provider.responseText === undefined
        ? {}
        : { fakeResponseText: provider.responseText }),
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
        const submitted = await host.submitUserText(request)
        return {
          sessionId: submitted.session.id,
          inputId: submitted.inputId,
          jobId: submitted.receipt.job.id
        }
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
        const submitted = await host.submitUserText(request)
        const run = await host.runOnce()
        const [job, messages] = await Promise.all([
          storage.core.getJob({ jobId: submitted.receipt.job.id }),
          storage.core.listSessionMessages({
            sessionId: submitted.session.id
          })
        ])
        if (job === null) {
          throw new Error("wanex runtime submitted job was not found")
        }
        return {
          sessionId: submitted.session.id,
          inputId: submitted.inputId,
          jobId: submitted.receipt.job.id,
          jobState: projectJobState(job.state),
          assistantText: assistantText(messages),
          messageCount: messages.length,
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
  readonly baseUrl?: string
  readonly apiKey?: string
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
      ...(provider.baseUrl === undefined ? {} : { baseUrl: provider.baseUrl }),
      ...(provider.apiKey === undefined ? {} : { apiKey: provider.apiKey }),
      ...(provider.anthropicVersion === undefined
        ? {}
        : { anthropicVersion: provider.anthropicVersion })
    }
  }
  throw new Error(`unsupported runtime provider: ${String(provider.kind)}`)
}

function assistantText(messages: readonly SessionMessageRecord[]): string {
  return messages
    .flatMap((message) => message.content)
    .filter((part): part is TextMessagePart => part.type === "text")
    .map((part) => part.text)
    .join("\n")
}

function projectWorkerStatus(status: string): WanexRuntimeWorkerResultStatus {
  return status === "completed" || status === "failed" ? status : "idle"
}

function projectJobState(state: string): WanexRuntimeJobState {
  switch (state) {
    case "queued":
    case "running":
    case "succeeded":
    case "failed":
    case "cancelled":
      return state
    default:
      throw new Error(`unsupported runtime job state: ${state}`)
  }
}
