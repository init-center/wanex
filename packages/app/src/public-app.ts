import {
  createWanexRuntime,
  type WanexRuntimeJobState,
  type WanexRuntimeProviderOptions
} from "@wanex/runtime"
import type {
  WanexApp,
  WanexAppJobStatus,
  WanexAppOptions,
  WanexAppRunResult,
  WanexAppStatus
} from "./public-types.js"

export async function createWanexApp(
  options: WanexAppOptions
): Promise<WanexApp> {
  const runtime = await createWanexRuntime({
    storage: options.storage,
    provider: runtimeProvider(options.provider)
  })

  return {
    status(): WanexAppStatus {
      const status = runtime.status()
      return {
        disposed: status.disposed,
        providerProfileId: status.providerProfileId,
        activeProviderProfileId: status.providerProfileId
      }
    },
    async run(request): Promise<WanexAppRunResult> {
      const result = await runtime.run(request)
      return {
        sessionId: result.sessionId,
        assistantText: result.assistantText,
        messageCount: result.messageCount,
        jobStatuses: [appJobStatus(result.jobState)]
      }
    },
    async dispose(): Promise<void> {
      await runtime.dispose()
    }
  }
}

function appJobStatus(
  state: WanexRuntimeJobState
): WanexAppJobStatus {
  switch (state) {
    case "queued":
      return "pending"
    case "running":
      return "running"
    case "succeeded":
      return "succeeded"
    case "failed":
      return "failed"
    case "cancelled":
      return "cancelled"
  }
}

function runtimeProvider(
  provider: WanexAppOptions["provider"]
): WanexRuntimeProviderOptions {
  const kind = provider?.kind ?? "fake"
  const id = provider?.id ?? "app-shell-fake"
  const providerId = provider?.providerId ?? kind
  const modelId = provider?.modelId ?? "app-shell-model"
  if (kind === "fake") {
    return {
      kind,
      id,
      providerId,
      modelId,
      responseText: `Fake response from ${modelId}`
    }
  }
  return {
    kind,
    id,
    providerId,
    modelId,
    ...(provider?.baseUrl === undefined ? {} : { baseUrl: provider.baseUrl }),
    ...(provider?.apiKey === undefined ? {} : { apiKey: provider.apiKey }),
    ...(provider?.anthropicVersion === undefined
      ? {}
      : { anthropicVersion: provider.anthropicVersion })
  }
}
