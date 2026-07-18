import type { WanexAppShellAgentContextRefreshMonitor } from "./context-monitor.js"
import type { WanexAppShellAgentContextProfileManager } from "./context-profile.js"
import type { WanexAppShellExtensionContributionManager } from "./app-extension.js"
import type { BootstrappedWanexAppShellRuntime } from "./runtime.js"

export interface WanexAppShellCommandContext {
  readonly runtime: BootstrappedWanexAppShellRuntime
  readonly agentContext: WanexAppShellAgentContextProfileManager
  readonly agentContextMonitor: WanexAppShellAgentContextRefreshMonitor
  readonly extensions: WanexAppShellExtensionContributionManager
  assertActive(): void
  getActiveProviderProfileId(): string
  refreshActiveProviderProfileId(): Promise<string>
  setActiveProviderProfileId(profileId: string): void
  dispose(): Promise<void>
}
