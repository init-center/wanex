import type { AgentContextProfile } from "@wanex/runtime/context"
import type { WanexAppShellExtensionOptions, WanexAppShellExtensionStatus } from "./types-extension.js"
import type {
  WanexAppShellAgentCommands
} from "./types-agent.js"
import type { BootstrapWanexAppShellRuntimeOptions } from "./runtime.js"
import type {
  WanexAppShellAgentContextCommands,
  WanexAppShellAgentContextMonitorStatus,
  WanexAppShellAgentContextStatus
} from "./types-context.js"
import type {
  WanexAppShellDiagnosticsCommands
} from "./types-diagnostics.js"
import type {
  WanexAppShellExecutionReferenceCommands
} from "./types-execution-reference.js"
import type {
  WanexAppShellLifecycleCommands
} from "./types-lifecycle.js"
import type {
  WanexAppShellProviderProfileCommands,
  WanexAppShellProviderProfileOptions
} from "./types-provider-profile.js"
import type {
  WanexAppShellReadModelCommands
} from "./types-read-model.js"
import type {
  WanexAppShellResultEnvelopeCommands
} from "./types-result-envelope.js"
import type {
  WanexAppShellScheduleCommands
} from "./types-schedule.js"
import type {
  WanexAppShellWorkflowCommands
} from "./types-workflow.js"
import type {
  WanexAppShellWorkflowEnvelopeCommands
} from "./types-workflow-envelope.js"

export interface WanexAppShellOptions extends BootstrapWanexAppShellRuntimeOptions {
  readonly providerProfile?: WanexAppShellProviderProfileOptions
  readonly agentContextProfile?: AgentContextProfile
  readonly extensions?: WanexAppShellExtensionOptions
}

export interface WanexAppShell {
  readonly commands: WanexAppShellCommands
  status(): WanexAppShellStatus
  dispose(): Promise<void>
}

export interface WanexAppShellCommands
  extends WanexAppShellAgentCommands,
    WanexAppShellAgentContextCommands,
    WanexAppShellDiagnosticsCommands,
    WanexAppShellExecutionReferenceCommands,
    WanexAppShellLifecycleCommands,
    WanexAppShellProviderProfileCommands,
    WanexAppShellReadModelCommands,
    WanexAppShellResultEnvelopeCommands,
    WanexAppShellScheduleCommands,
    WanexAppShellWorkflowCommands,
    WanexAppShellWorkflowEnvelopeCommands {}

export interface WanexAppShellStatus {
  readonly disposed: boolean
  readonly providerProfileId: string
  readonly activeProviderProfileId: string
  readonly agentContext: WanexAppShellAgentContextStatus
  readonly agentContextMonitor: WanexAppShellAgentContextMonitorStatus
  readonly extensions: WanexAppShellExtensionStatus
}
