import type { WanexAppAgentContextRefreshMonitor } from "./context-monitor.js"
import type { WanexAppAgentContextProfileManager } from "./context-profile.js"
import type { WanexAppExtensionContributionManager } from "./app-extension.js"
import type { BootstrappedWanexAppRuntime } from "./runtime.js"
import type { WanexAppConversationOperationController } from "./conversation-operation.js"
import type { WanexAppMediaGenerationOperationController } from "./media-generation-operation.js"

export interface WanexAppCommandContext {
  readonly runtime: BootstrappedWanexAppRuntime
  readonly agentContext: WanexAppAgentContextProfileManager
  readonly agentContextMonitor: WanexAppAgentContextRefreshMonitor
  readonly extensions: WanexAppExtensionContributionManager
  readonly conversationOperations: WanexAppConversationOperationController
  readonly mediaGenerationOperations: WanexAppMediaGenerationOperationController
  assertActive(): void
  getActiveProviderProfileId(): string
  refreshActiveProviderProfileId(): Promise<string>
  setActiveProviderProfileId(profileId: string): void
  dispose(): Promise<void>
}
