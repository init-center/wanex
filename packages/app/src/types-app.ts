import type {
  AgentContextProfile,
  PreparedAgentContext
} from "@wanex/runtime/context"
import type {
  SessionTurnAgentContextIdentity,
  ResolveSessionTurnAgentContextRequest,
  SessionTurnAgentContextLease
} from "@wanex/runtime/execution"
import type {
  RuntimeHostPrepareExecutionBindingRequest,
  RuntimeHostPreparedExecutionBinding,
  RuntimeHostSessionTurnLifecycleSignal
} from "@wanex/runtime/host"
import type { BootstrapWanexStorageOptions } from "@wanex/runtime/bootstrap"
import type {
  SecretResolverPort,
  SecretStorePort
} from "@wanex/runtime/secrets"
import type { WanexAppExtensionOptions, WanexAppExtensionStatus } from "./types-extension.js"
import type {
  WanexAppAgentCommands
} from "./types-agent.js"
import type { WanexAppConversationOperationCommands } from "./types-conversation-operation.js"
import type { WanexAppEvents } from "./types-events.js"
import type {
  WanexAppAgentContextCommands,
  WanexAppAgentContextMonitorStatus,
  WanexAppAgentContextStatus
} from "./types-context.js"
import type {
  WanexAppDiagnosticsCommands
} from "./types-diagnostics.js"
import type {
  WanexAppExecutionReferenceCommands
} from "./types-execution-reference.js"
import type {
  WanexAppLifecycleCommands
} from "./types-lifecycle.js"
import type {
  WanexAppModelEndpointCommands,
  WanexAppModelEndpointListReadModel,
  WanexAppModelEndpointOptions
} from "./types-model-endpoint.js"
import type { WanexAppModelCapabilityCommands } from "./types-model-capability.js"
import type { WanexAppResourceCommands } from "./types-resources.js"
import type {
  WanexAppReadModelCommands
} from "./types-read-model.js"
import type {
  WanexAppResultEnvelopeCommands
} from "./types-result-envelope.js"
import type {
  WanexAppScheduleCommands
} from "./types-schedule.js"
import type {
  WanexAppWorkflowCommands
} from "./types-workflow.js"
import type {
  WanexAppWorkflowEnvelopeCommands
} from "./types-workflow-envelope.js"
import type { WanexAppMediaGenerationCommands } from "./types-media-generation.js"
import type { WanexAppSessionLifecycleCommands } from "./types-session-lifecycle.js"
import type { MediaGenerationAdapter } from "@wanex/runtime/media-generation"
import type { WanexAppPlanCommands } from "./types-plan.js"
import type { WanexAppGoalCommands } from "./types-goal.js"
import type {
  WanexAppProviderCredentialPolicy,
  WanexAppProviderMutationCoordinator,
  WanexAppProviderReplaceRequest
} from "./provider-mutation.js"

export interface WanexAppTrustedProviderHostOptions {
  readonly credentialStore: SecretStorePort
  readonly credentialPolicy: WanexAppProviderCredentialPolicy
  readonly createRevisionId?: () => string
  bindMutationCoordinator?(
    coordinator: WanexAppProviderMutationCoordinator
  ): void | (() => void)
  requestInitialReplacement(
    endpoints: WanexAppModelEndpointListReadModel
  ): Promise<WanexAppProviderReplaceRequest | undefined>
}

export interface WanexAppOptions extends BootstrapWanexStorageOptions {
  readonly modelEndpoint?: WanexAppModelEndpointOptions
  readonly agentContextProfile?: AgentContextProfile
  readonly runtimeContext?: Pick<
    PreparedAgentContext,
    "tools" | "toolPermissionPolicy"
  >
  readonly runtimeContextResolver?: WanexAppRuntimeContextResolver
  readonly observeSessionTurnLifecycle?: (
    signal: RuntimeHostSessionTurnLifecycleSignal
  ) => void
  readonly extensions?: WanexAppExtensionOptions
  readonly workerCount?: number
  readonly secretResolver?: SecretResolverPort
  readonly trustedProviderHost?: WanexAppTrustedProviderHostOptions
  readonly mediaGenerationAdapters?: readonly MediaGenerationAdapter[]
  readonly mediaGenerationWorkerCount?: number
  readonly mediaGenerationMaxOutputBytes?: number
  readonly mediaGenerationPollInitialDelayMs?: number
  readonly mediaGenerationPollMaxDelayMs?: number
  readonly mediaGenerationMaxConsecutivePollFailures?: number
}

export interface WanexApp {
  readonly commands: WanexAppCommands
  readonly events: WanexAppEvents
  readonly trustedExecution: WanexAppTrustedExecutionHost
  status(): WanexAppStatus
  start(): void
  stop(): Promise<void>
  dispose(): Promise<void>
}

export type WanexAppRuntimeContext = Pick<
  PreparedAgentContext,
  "tools" | "toolPermissionPolicy"
>

export interface WanexAppRuntimeContextResolution {
  readonly context?: WanexAppRuntimeContext
  readonly contextIdentity?: SessionTurnAgentContextIdentity
  readonly lease?: SessionTurnAgentContextLease
}

export type WanexAppRuntimeContextResolver = (
  request: ResolveSessionTurnAgentContextRequest
) =>
  | Promise<WanexAppRuntimeContextResolution | undefined>
  | WanexAppRuntimeContextResolution
  | undefined

export interface WanexAppTrustedExecutionHost {
  prepareExecutionBinding(
    request: Omit<RuntimeHostPrepareExecutionBindingRequest, "modelEndpointId">
  ): Promise<RuntimeHostPreparedExecutionBinding>
  submitScheduledTick(
    request: import("./types-schedule.js").WanexAppSubmitScheduledTickRequest
  ): Promise<import("./types-schedule.js").WanexAppScheduledTickResult>
  wake(): void
}

export interface WanexAppCommands
  extends WanexAppAgentCommands,
    WanexAppConversationOperationCommands,
    WanexAppAgentContextCommands,
    WanexAppDiagnosticsCommands,
    WanexAppExecutionReferenceCommands,
    WanexAppLifecycleCommands,
    WanexAppModelEndpointCommands,
    WanexAppModelCapabilityCommands,
    WanexAppGoalCommands,
    WanexAppPlanCommands,
    WanexAppResourceCommands,
    WanexAppReadModelCommands,
    WanexAppResultEnvelopeCommands,
    WanexAppScheduleCommands,
    WanexAppSessionLifecycleCommands,
    WanexAppWorkflowCommands,
    WanexAppWorkflowEnvelopeCommands,
    WanexAppMediaGenerationCommands {}

export interface WanexAppStatus {
  readonly disposed: boolean
  readonly started: boolean
  readonly workerCount: number
  readonly activeModelEndpointId?: string
  readonly agentContext: WanexAppAgentContextStatus
  readonly agentContextMonitor: WanexAppAgentContextMonitorStatus
  readonly extensions: WanexAppExtensionStatus
}
