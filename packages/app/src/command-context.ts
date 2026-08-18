import type { WanexAppAgentContextRefreshMonitor } from "./context-monitor.js"
import type { WanexAppAgentContextProfileManager } from "./context-profile.js"
import type { WanexAppExtensionContributionManager } from "./app-extension.js"
import type { BootstrappedWanexAppRuntime } from "./runtime.js"
import type { WanexAppConversationOperationController } from "./conversation-operation.js"
import type { WanexAppMediaGenerationOperationController } from "./media-generation-operation.js"
import type { PlanWorkflow } from "./workflows/plan/runtime.js"
import type { WanexAppGoalCoordinator } from "./goal-coordinator.js"
import type {
  WanexAppModelEndpointExecutionPredicate
} from "./model-capability.js"

export interface WanexAppCommandContext {
  readonly runtime: BootstrappedWanexAppRuntime
  readonly agentContext: WanexAppAgentContextProfileManager
  readonly agentContextMonitor: WanexAppAgentContextRefreshMonitor
  readonly extensions: WanexAppExtensionContributionManager
  readonly conversationOperations: WanexAppConversationOperationController
  readonly mediaGenerationOperations: WanexAppMediaGenerationOperationController
  readonly planWorkflow: PlanWorkflow
  readonly goalCoordinator: WanexAppGoalCoordinator
  readonly isModelEndpointExecutable: WanexAppModelEndpointExecutionPredicate
  assertActive(): void
  refreshActiveModelEndpointId(): Promise<string>
  setActiveModelEndpointId(endpointId: string | undefined): void
  dispose(): Promise<void>
}
