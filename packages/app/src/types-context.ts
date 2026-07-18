import type { AgentContextProfile } from "@wanex/runtime/context"
import type { JsonValue } from "@wanex/protocol"

export interface WanexAppShellAgentContextCommands {
  setAgentContextProfile(
    profile: AgentContextProfile
  ): Promise<WanexAppShellAgentContextProfileSetResult>
  refreshAgentContextProfile(): Promise<WanexAppShellAgentContextProfileReloadResult>
  startAgentContextMonitor(
    options?: WanexAppShellAgentContextMonitorOptions
  ): Promise<WanexAppShellAgentContextMonitorStatus>
  stopAgentContextMonitor(): Promise<WanexAppShellAgentContextMonitorStatus>
}

export interface WanexAppShellAgentContextStatus {
  readonly configured: boolean
  readonly revision: number
  readonly context?: WanexAppShellAgentContextSummary
}

export interface WanexAppShellAgentContextSummary {
  readonly instructionSources: number
  readonly skillNames: readonly string[]
  readonly diagnostics: readonly string[]
  readonly activationToolRegistered: boolean
}

export interface WanexAppShellAgentContextProfileReloadResult {
  readonly key: string
  readonly reloaded: boolean
  readonly reason?: string
  readonly detail?: JsonValue
  readonly error?: {
    readonly name: string
    readonly message: string
  }
}

export interface WanexAppShellAgentContextProfileSetResult
  extends WanexAppShellAgentContextProfileReloadResult {}

export interface WanexAppShellAgentContextMonitorOptions {
  readonly intervalMs?: number
}

export interface WanexAppShellAgentContextMonitorStatus {
  readonly running: boolean
  readonly intervalMs: number
  readonly refreshCount: number
  readonly lastResult?: WanexAppShellAgentContextProfileReloadResult
}
