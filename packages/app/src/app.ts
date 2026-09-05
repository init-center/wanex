import { createWanexAppCommands } from "./commands.js"
import { createWanexAppExtensionContributionManager } from "./app-extension.js"
import { WanexAppAgentContextRefreshMonitor } from "./context-monitor.js"
import { createWanexAppAgentContextProfileManager } from "./context-profile.js"
import { WanexAppConversationOperationController } from "./conversation-operation.js"
import { WanexAppMediaGenerationOperationController } from "./media-generation-operation.js"
import { WanexAppConversationEventHub } from "./conversation-events.js"
import { composeWanexAppAgentContext } from "./agent-context-composition.js"
import {
  readWanexAppActiveModelEndpointId,
  requireWanexAppActiveModelEndpointId,
  upsertWanexAppModelEndpoint
} from "./model-endpoint.js"
import { bootstrapWanexAppRuntime } from "./runtime.js"
import type {
  WanexApp,
  WanexAppOptions,
  WanexAppStatus
} from "./types-app.js"
import type { WanexAppCommandContext } from "./command-context.js"
import { PlanWorkflow } from "./workflows/plan/runtime.js"
import { WanexAppGoalCoordinator } from "./goal-coordinator.js"
import { prepareWanexAppModelCapabilityContext } from "./model-capability-context.js"
import { MediaGenerationAdapterRegistry } from "@wanex/runtime/media-generation"

export async function createWanexApp(
  options: WanexAppOptions
): Promise<WanexApp> {
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
    options.extensions?.source
  )
  const events = new WanexAppConversationEventHub()
  const mediaGenerationAdapters = options.mediaGenerationAdapters ?? []
  const mediaGenerationAdapterRegistry = new MediaGenerationAdapterRegistry(
    mediaGenerationAdapters
  )
  const isModelEndpointExecutable = mediaGenerationAdapterRegistry.supports.bind(
    mediaGenerationAdapterRegistry
  )
  let goalCoordinator: WanexAppGoalCoordinator | undefined
  let activeModelEndpointId: string | undefined
  let releaseTrustedProviderHost: (() => void) | undefined
  const host = runtime.app.createRuntimeHost({
    workerCount: options.workerCount ?? 1,
    observeProviderEvent: events.observeProviderEvent,
      observeSessionTurnLifecycle(signal) {
        events.observeSessionTurnLifecycle(signal)
        goalCoordinator?.observeSessionTurnLifecycle(signal)
        options.observeSessionTurnLifecycle?.(signal)
      },
    ...(mediaGenerationAdapters.length === 0
      ? {}
      : { mediaGenerationAdapters }),
    ...(options.mediaGenerationWorkerCount === undefined
      ? {}
      : { mediaGenerationWorkerCount: options.mediaGenerationWorkerCount }),
    ...(options.mediaGenerationMaxOutputBytes === undefined
      ? {}
      : { mediaGenerationMaxOutputBytes: options.mediaGenerationMaxOutputBytes }),
    ...(options.mediaGenerationPollInitialDelayMs === undefined
      ? {}
      : {
          mediaGenerationPollInitialDelayMs:
            options.mediaGenerationPollInitialDelayMs
        }),
    ...(options.mediaGenerationPollMaxDelayMs === undefined
      ? {}
      : { mediaGenerationPollMaxDelayMs: options.mediaGenerationPollMaxDelayMs }),
    ...(options.mediaGenerationMaxConsecutivePollFailures === undefined
      ? {}
      : {
          mediaGenerationMaxConsecutivePollFailures:
            options.mediaGenerationMaxConsecutivePollFailures
        }),
    async resolveAgentContext(request) {
      const discovered = agentContext.current()
      const configured = composeWanexAppAgentContext({
        ...(discovered === undefined ? {} : { discovered }),
        ...(options.runtimeContext === undefined
          ? {}
          : { runtime: options.runtimeContext })
      })
      const contextualRuntime = await options.runtimeContextResolver?.(request)
      try {
        const base = await extensions.prepareAgentContext(
          composeWanexAppAgentContext({
            ...(configured === undefined ? {} : { discovered: configured }),
            ...(contextualRuntime?.context === undefined
              ? {}
              : { runtime: contextualRuntime.context })
          })
        )
        const context = await prepareWanexAppModelCapabilityContext({
          storage: runtime.storage,
          isModelEndpointExecutable,
          ...(base === undefined ? {} : { base }),
          ...(request.executionBinding === undefined
            ? {}
            : { executionBinding: request.executionBinding })
        })
        return {
          ...(context === undefined ? {} : { context }),
          ...(contextualRuntime?.contextIdentity === undefined
            ? {}
            : { contextIdentity: contextualRuntime.contextIdentity }),
          ...(contextualRuntime?.lease === undefined
            ? {}
            : { lease: contextualRuntime.lease })
        }
      } catch (error) {
        contextualRuntime?.lease?.rollback()
        throw error
      }
    }
  })
  const conversationOperations = new WanexAppConversationOperationController({
    storage: runtime.app.storage,
    host
  })
  const mediaGenerationOperations =
    new WanexAppMediaGenerationOperationController({
      host,
      storage: runtime.storage,
      isModelEndpointExecutable
    })
  const planWorkflow = new PlanWorkflow({
    storage: runtime.app.storage,
    runtime: host
  })
  goalCoordinator = new WanexAppGoalCoordinator({
    storage: runtime.app.storage,
    host,
    async resolveActiveModelEndpointId() {
      activeModelEndpointId =
        await readWanexAppActiveModelEndpointId(runtime.storage)
      return activeModelEndpointId
    },
    observeGoalInvalidation: events.observeGoalInvalidation
  })
  let disposed = false
  let disposePromise: Promise<void> | undefined

  if (options.modelEndpoint !== undefined) {
    await upsertWanexAppModelEndpoint({
      storage: runtime.storage,
      modelEndpoint: options.modelEndpoint
    })
  }
  activeModelEndpointId = await readWanexAppActiveModelEndpointId(
    runtime.storage
  )
  conversationOperations.start()
  await goalCoordinator.start()

  const dispose = async (): Promise<void> => {
    if (disposePromise !== undefined) {
      return await disposePromise
    }
    disposed = true
    disposePromise = (async () => {
      let releaseError: unknown
      const release = releaseTrustedProviderHost
      releaseTrustedProviderHost = undefined
      try {
        release?.()
      } catch (error) {
        releaseError = error
      }
      try {
        await agentContextMonitor.stop()
        await goalCoordinator.dispose()
        mediaGenerationOperations.dispose()
        planWorkflow.dispose()
        await conversationOperations.dispose()
        events.dispose()
        await runtime.dispose()
      } catch (error) {
        if (releaseError !== undefined) {
          throw new AggregateError(
            [releaseError, error],
            "trusted Provider host release and App disposal failed"
          )
        }
        throw error
      }
      if (releaseError !== undefined) throw releaseError
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
      ...(activeModelEndpointId === undefined
        ? {}
        : { activeModelEndpointId }),
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
    planWorkflow,
    goalCoordinator,
    isModelEndpointExecutable,
    assertActive,
    async refreshActiveModelEndpointId() {
      const endpointId =
        await requireWanexAppActiveModelEndpointId(runtime.storage)
      activeModelEndpointId = endpointId
      return endpointId
    },
    setActiveModelEndpointId(endpointId) {
      activeModelEndpointId = endpointId
    },
    dispose
  }
  const commands = createWanexAppCommands({
    context,
    isDisposed: () => disposed
  })

  try {
    if (options.trustedProviderHost !== undefined) {
      const { createWanexAppProviderMutationCoordinator } = await import(
        "@wanex/app/provider-mutation"
      )
      const providerMutation = createWanexAppProviderMutationCoordinator({
        storage: runtime.storage,
        modelEndpoints: commands,
        credentialStore: options.trustedProviderHost.credentialStore,
        credentialPolicy: options.trustedProviderHost.credentialPolicy,
        ...(options.trustedProviderHost.createRevisionId === undefined
          ? {}
          : {
              createRevisionId:
                options.trustedProviderHost.createRevisionId
            })
      })
      await providerMutation.reconcilePending()
      const release = options.trustedProviderHost.bindMutationCoordinator?.(
        providerMutation
      )
      if (release !== undefined) releaseTrustedProviderHost = release
      const replacement = await options.trustedProviderHost
        .requestInitialReplacement(await commands.listModelEndpoints())
      if (replacement !== undefined) {
        await providerMutation.replace(replacement)
        activeModelEndpointId = await readWanexAppActiveModelEndpointId(
          runtime.storage
        )
      }
    }
  } catch (error) {
    try {
      await dispose()
    } catch (disposeError) {
      throw new AggregateError(
        [error, disposeError],
        "trusted Provider host initialization failed and App cleanup failed"
      )
    }
    throw error
  }

  return {
    commands,
    events,
    trustedExecution: {
      async prepareExecutionBinding(request) {
        assertActive()
        const modelEndpointId =
          await requireWanexAppActiveModelEndpointId(runtime.storage)
        activeModelEndpointId = modelEndpointId
        return await host.prepareExecutionBinding({
          ...request,
          modelEndpointId
        })
      },
      async submitScheduledTick(request) {
        assertActive()
        return await commands.submitScheduledTick(request)
      },
      wake() {
        assertActive()
        host.wake()
      }
    },
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
