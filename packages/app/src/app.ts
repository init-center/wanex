import { createWanexAppShellCommands } from "./commands.js"
import { createWanexAppShellExtensionContributionManager } from "./app-extension.js"
import { WanexAppShellAgentContextRefreshMonitor } from "./context-monitor.js"
import { createWanexAppShellAgentContextProfileManager } from "./context-profile.js"
import {
  initializeWanexAppShellProviderProfile,
  requireWanexAppShellActiveProviderProfileId,
} from "./provider-profile.js"
import { bootstrapWanexAppShellRuntime } from "./runtime.js"
import type {
  WanexAppShell,
  WanexAppShellOptions,
  WanexAppShellStatus
} from "./types-app.js"
import type { WanexAppShellCommandContext } from "./command-context.js"

const defaultProviderProfileId = "app-shell-fake"

export async function createWanexAppShell(
  options: WanexAppShellOptions
): Promise<WanexAppShell> {
  const providerProfileId = options.providerProfile?.id ?? defaultProviderProfileId
  const providerKind = options.providerProfile?.kind ?? "fake"
  const providerId = options.providerProfile?.providerId ?? providerKind
  const modelId = options.providerProfile?.modelId ?? "app-shell-model"
  const runtime = await bootstrapWanexAppShellRuntime(options)
  const agentContext = await createWanexAppShellAgentContextProfileManager({
    app: runtime.app,
    ...(options.agentContextProfile === undefined
      ? {}
      : { initialProfile: options.agentContextProfile })
  })
  const agentContextMonitor = new WanexAppShellAgentContextRefreshMonitor({
    manager: agentContext
  })
  const extensions = createWanexAppShellExtensionContributionManager(
    options.extensions?.snapshot
  )
  let disposed = false
  let activeProviderProfileId = providerProfileId

  await initializeWanexAppShellProviderProfile({
    storage: runtime.storage,
    profile: {
      id: providerProfileId,
      kind: providerKind,
      providerId,
      modelId,
      ...(options.providerProfile?.baseUrl === undefined
        ? {}
        : { baseUrl: options.providerProfile.baseUrl }),
      ...(options.providerProfile?.apiKey === undefined
        ? {}
        : { apiKey: options.providerProfile.apiKey })
    }
  })
  activeProviderProfileId =
    await requireWanexAppShellActiveProviderProfileId(runtime.storage)

  const dispose = async (): Promise<void> => {
    if (disposed) {
      return
    }
    disposed = true
    await agentContextMonitor.stop()
    await runtime.dispose()
  }

  const assertActive = (): void => {
    if (disposed) {
      throw new Error("app shell is disposed")
    }
  }

  const status = (): WanexAppShellStatus => ({
    disposed,
    providerProfileId,
    activeProviderProfileId,
    agentContext: agentContext.status(),
    agentContextMonitor: agentContextMonitor.status(),
    extensions: extensions.status()
  })

  const context: WanexAppShellCommandContext = {
    runtime,
    agentContext,
    agentContextMonitor,
    extensions,
    assertActive,
    getActiveProviderProfileId() {
      return activeProviderProfileId
    },
    async refreshActiveProviderProfileId() {
      activeProviderProfileId =
        await requireWanexAppShellActiveProviderProfileId(runtime.storage)
      return activeProviderProfileId
    },
    setActiveProviderProfileId(profileId) {
      activeProviderProfileId = profileId
    },
    dispose
  }
  const commands = createWanexAppShellCommands({
    context,
    isDisposed: () => disposed
  })

  return {
    commands,
    status,
    dispose
  }
}
