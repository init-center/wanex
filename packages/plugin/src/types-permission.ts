import type {
  JsonValue,
  PluginCapability,
  PluginManifestRecord
} from "@wanex/protocol"

export type PluginPermissionDecisionStatus = "allow" | "deny"

export interface PluginPermissionRequest {
  readonly resources?: readonly string[]
  readonly networks?: readonly string[]
  readonly fileSystemPaths?: readonly string[]
  readonly maxExecutionMs?: number
}

export interface PluginPermissionPolicy extends PluginPermissionRequest {
  readonly pluginId: string
  readonly version?: string
  readonly decision: PluginPermissionDecisionStatus
  readonly reason?: string
  readonly capabilities?: readonly PluginCapability[]
}

export interface PluginPermissionContext {
  readonly policy: PluginPermissionPolicy
  readonly plugin: PluginManifestRecord
  readonly actionId: string
  readonly actionCapability: PluginCapability
  readonly payload: JsonValue
  readonly request?: PluginPermissionRequest
}

export interface PluginPermissionDecision {
  readonly status: "allowed" | "denied"
  readonly policy: PluginPermissionPolicy
  readonly reason?: string
}

export interface PluginPermissionGuardOptions {
  readonly policy: PluginPermissionPolicy
  readonly plugin: PluginManifestRecord
  readonly actionId: string
  readonly actionCapability: PluginCapability
  readonly payload: JsonValue
  readonly request?: PluginPermissionRequest
}

export interface PluginPermissionGuard {
  authorize(options: PluginPermissionGuardOptions): PluginPermissionDecision
}

export interface PluginPermissionGrant extends PluginPermissionRequest {
  readonly pluginId: string
  readonly version?: string
  readonly decision: PluginPermissionDecisionStatus
  readonly reason?: string
  readonly capabilities?: readonly PluginCapability[]
  readonly metadata?: JsonValue
}
