import type { AgentContextProfile } from "@wanex/runtime/context"
import type { JsonValue } from "@wanex/protocol"

export interface WanexAppAgentContextCommands {
  setAgentContextProfile(
    profile: AgentContextProfile
  ): Promise<WanexAppAgentContextProfileSetResult>
  refreshAgentContextProfile(): Promise<WanexAppAgentContextProfileReloadResult>
  startAgentContextMonitor(
    options?: WanexAppAgentContextMonitorOptions
  ): Promise<WanexAppAgentContextMonitorStatus>
  stopAgentContextMonitor(): Promise<WanexAppAgentContextMonitorStatus>
}

export interface WanexAppAgentContextStatus {
  readonly configured: boolean
  readonly revision: number
  readonly context?: WanexAppAgentContextSummary
}

export interface WanexAppAgentContextSummary {
  readonly instructionSources: number
  readonly skillNames: readonly string[]
  readonly diagnostics: readonly string[]
  readonly activationToolRegistered: boolean
}

export interface WanexAppAgentContextProfileReloadResult {
  readonly key: string
  readonly reloaded: boolean
  readonly reason?: string
  readonly detail?: JsonValue
  readonly error?: {
    readonly name: string
    readonly message: string
  }
}

export interface WanexAppAgentContextProfileSetResult
  extends WanexAppAgentContextProfileReloadResult {}

export interface WanexAppAgentContextMonitorOptions {
  readonly intervalMs?: number
}

export interface WanexAppAgentContextMonitorStatus {
  readonly running: boolean
  readonly intervalMs: number
  readonly refreshCount: number
  readonly lastResult?: WanexAppAgentContextProfileReloadResult
}
