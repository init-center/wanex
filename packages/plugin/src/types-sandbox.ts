import type {
  JsonValue,
  PluginCapability,
  PluginManifestRecord
} from "@wanex/protocol"

export type PluginSandboxDecision = "allow" | "deny"

export interface PluginSandboxAccessRequest {
  readonly resources?: readonly string[]
  readonly networks?: readonly string[]
  readonly fileSystemPaths?: readonly string[]
  readonly maxExecutionMs?: number
}

export interface PluginSandboxPolicy extends PluginSandboxAccessRequest {
  readonly pluginId: string
  readonly version?: string
  readonly decision: PluginSandboxDecision
  readonly reason?: string
  readonly capabilities?: readonly PluginCapability[]
}

export interface PluginSandboxExecutionContext {
  readonly policy: PluginSandboxPolicy
  readonly plugin: PluginManifestRecord
  readonly actionId: string
  readonly actionCapability: PluginCapability
  readonly payload: JsonValue
  readonly request?: PluginSandboxAccessRequest
}

export interface PluginSandboxExecutionResult {
  readonly status: "allowed" | "denied"
  readonly policy: PluginSandboxPolicy
  readonly reason?: string
}

export interface PluginSandboxGuardOptions {
  readonly policy: PluginSandboxPolicy
  readonly plugin: PluginManifestRecord
  readonly actionId: string
  readonly actionCapability: PluginCapability
  readonly payload: JsonValue
  readonly request?: PluginSandboxAccessRequest
}

export interface PluginSandboxGuard {
  authorize(options: PluginSandboxGuardOptions): PluginSandboxExecutionResult
}

export interface PluginPermissionGrant extends PluginSandboxAccessRequest {
  readonly pluginId: string
  readonly version?: string
  readonly decision: PluginSandboxDecision
  readonly reason?: string
  readonly capabilities?: readonly PluginCapability[]
  readonly metadata?: JsonValue
}
