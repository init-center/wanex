import { createWanexAppCommands } from "./commands.js"
import { createWanexAppExtensionContributionManager } from "./app-extension.js"
import { WanexAppAgentContextRefreshMonitor } from "./context-monitor.js"
import { createWanexAppAgentContextProfileManager } from "./context-profile.js"
import { WanexAppConversationOperationController } from "./conversation-operation.js"
import { WanexAppMediaGenerationOperationController } from "./media-generation-operation.js"
import { WanexAppConversationEventHub } from "./conversation-events.js"
import { TEXT_PROVIDER_CAPABILITIES } from "@wanex/runtime/provider"
import {
  initializeWanexAppProviderProfile,
  requireWanexAppActiveProviderProfileId,
} from "./provider-profile.js"
import { bootstrapWanexAppRuntime } from "./runtime.js"
import type {
  WanexApp,
  WanexAppOptions,
  WanexAppStatus
} from "./types-app.js"
import type { WanexAppCommandContext } from "./command-context.js"

const defaultProviderProfileId = "wanex-app-fake"

export async function createWanexApp(
  options: WanexAppOptions
): Promise<WanexApp> {
  const providerProfileId = options.providerProfile?.id ?? defaultProviderProfileId
  const providerKind = options.providerProfile?.kind ?? "fake"
  const providerId = options.providerProfile?.providerId ?? providerKind
  const modelId = options.providerProfile?.modelId ?? "wanex-app-model"
  const runtime = await bootstrapWanexAppRuntime({
    storage: options.storage,
    ...(options.artifacts === undefined ? {} : { artifacts: options.artifacts }),
    ...(options.secretResolver === undefined
      ? {}
      : { app: { secretResolver: options.secretResolver } })
  })
  const agentContext = await createWanexAppAgentContextProfileManager({
    app: runtime.app,
    ...(options.agentContextProfile === undefined
      ? {}
      : { initialProfile: options.agentContextProfile })
  })
  const agentContextMonitor = new WanexAppAgentContextRefreshMonitor({
    manager: agentContext
  })
  const extensions = createWanexAppExtensionContributionManager(
    options.extensions?.snapshot
  )
  const events = new WanexAppConversationEventHub()
  const host = runtime.app.createRuntimeHost({
    workerCount: options.workerCount ?? 1,
    observeProviderEvent: events.observeProviderEvent,
    ...(options.mediaGenerationAdapters === undefined
      ? {}
      : { mediaGenerationAdapters: options.mediaGenerationAdapters }),
    ...(options.mediaGenerationWorkerCount === undefined
      ? {}
      : { mediaGenerationWorkerCount: options.mediaGenerationWorkerCount }),
    ...(options.mediaGenerationMaxOutputBytes === undefined
      ? {}
      : { mediaGenerationMaxOutputBytes: options.mediaGenerationMaxOutputBytes }),
    async resolveAgentContext() {
      return await extensions.prepareAgentContext(agentContext.current())
    }
  })
  const conversationOperations = new WanexAppConversationOperationController({
    storage: runtime.app.storage,
    host
  })
  const mediaGenerationOperations =
    new WanexAppMediaGenerationOperationController({ host })
  let disposed = false
  let disposePromise: Promise<void> | undefined
  let activeProviderProfileId = providerProfileId

  await initializeWanexAppProviderProfile({
    storage: runtime.storage,
    profile: {
      id: providerProfileId,
      kind: providerKind,
      providerId,
      modelId,
      capabilities:
        options.providerProfile?.capabilities ?? TEXT_PROVIDER_CAPABILITIES,
      ...(options.providerProfile?.baseUrl === undefined
        ? {}
        : { baseUrl: options.providerProfile.baseUrl }),
      ...(options.providerProfile?.secretRef === undefined
        ? {}
        : { secretRef: options.providerProfile.secretRef })
    }
  })
  activeProviderProfileId =
    await requireWanexAppActiveProviderProfileId(runtime.storage)
  conversationOperations.start()

  const dispose = async (): Promise<void> => {
    if (disposePromise !== undefined) {
      return await disposePromise
    }
    disposed = true
    disposePromise = (async () => {
      await agentContextMonitor.stop()
      mediaGenerationOperations.dispose()
      await conversationOperations.dispose()
      events.dispose()
      await runtime.dispose()
    })()
    return await disposePromise
  }

  const assertActive = (): void => {
    if (disposed) {
      throw new Error("app is disposed")
    }
  }

  const status = (): WanexAppStatus => {
    const processor = conversationOperations.status()
    return {
      disposed,
      started: processor.started,
      workerCount: processor.workerCount,
      providerProfileId,
      activeProviderProfileId,
      agentContext: agentContext.status(),
      agentContextMonitor: agentContextMonitor.status(),
      extensions: extensions.status()
    }
  }

  const context: WanexAppCommandContext = {
    runtime,
    agentContext,
    agentContextMonitor,
    extensions,
    conversationOperations,
    mediaGenerationOperations,
    assertActive,
    getActiveProviderProfileId() {
      return activeProviderProfileId
    },
    async refreshActiveProviderProfileId() {
      activeProviderProfileId =
        await requireWanexAppActiveProviderProfileId(runtime.storage)
      return activeProviderProfileId
    },
    setActiveProviderProfileId(profileId) {
      activeProviderProfileId = profileId
    },
    dispose
  }
  const commands = createWanexAppCommands({
    context,
    isDisposed: () => disposed
  })

  return {
    commands,
    events,
    status,
    start() {
      assertActive()
      conversationOperations.start()
    },
    async stop() {
      if (disposed) {
        return
      }
      await conversationOperations.stop()
    },
    dispose
  }
}
