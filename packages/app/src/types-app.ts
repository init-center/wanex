import type { AgentContextProfile } from "@wanex/runtime/context"
import type { BootstrapWanexStorageOptions } from "@wanex/runtime/bootstrap"
import type { SecretResolverPort } from "@wanex/runtime/secrets"
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
  WanexAppProviderProfileCommands,
  WanexAppProviderProfileOptions
} from "./types-provider-profile.js"
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
import type { MediaGenerationAdapter } from "@wanex/runtime/media-generation"

export interface WanexAppOptions extends BootstrapWanexStorageOptions {
  readonly providerProfile?: WanexAppProviderProfileOptions
  readonly agentContextProfile?: AgentContextProfile
  readonly extensions?: WanexAppExtensionOptions
  readonly workerCount?: number
  readonly secretResolver?: SecretResolverPort
  readonly mediaGenerationAdapters?: readonly MediaGenerationAdapter[]
  readonly mediaGenerationWorkerCount?: number
  readonly mediaGenerationMaxOutputBytes?: number
}

export interface WanexApp {
  readonly commands: WanexAppCommands
  readonly events: WanexAppEvents
  status(): WanexAppStatus
  start(): void
  stop(): Promise<void>
  dispose(): Promise<void>
}

export interface WanexAppCommands
  extends WanexAppAgentCommands,
    WanexAppConversationOperationCommands,
    WanexAppAgentContextCommands,
    WanexAppDiagnosticsCommands,
    WanexAppExecutionReferenceCommands,
    WanexAppLifecycleCommands,
    WanexAppProviderProfileCommands,
    WanexAppResourceCommands,
    WanexAppReadModelCommands,
    WanexAppResultEnvelopeCommands,
    WanexAppScheduleCommands,
    WanexAppWorkflowCommands,
    WanexAppWorkflowEnvelopeCommands,
    WanexAppMediaGenerationCommands {}

export interface WanexAppStatus {
  readonly disposed: boolean
  readonly started: boolean
  readonly workerCount: number
  readonly providerProfileId: string
  readonly activeProviderProfileId: string
  readonly agentContext: WanexAppAgentContextStatus
  readonly agentContextMonitor: WanexAppAgentContextMonitorStatus
  readonly extensions: WanexAppExtensionStatus
}
