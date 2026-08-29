import type {
  PluginActionHost,
  PluginPermissionGrant,
  PluginPermissionGuard
} from "@wanex/plugin"
import type {
  ShellOptions
} from "@wanex/assistant"
import type { StorageHandle } from "@wanex/storage"
import type { RetryPolicy } from "@wanex/protocol"
import type { WorkerLoopOptions } from "@wanex/runtime/jobs"
import type { ExecutionEnvironment } from "@wanex/runtime/execution"
import type {
  PluginManagementPort,
} from "@wanex/assistant/plugin-management"
import type { PluginCommandManagementOptions } from "./management/index.js"

export interface CreateAssistantPluginHostOptions {
  readonly handle: Pick<StorageHandle, "core" | "transport">
  readonly principalId: string
  readonly worker: AssistantPluginHostWorkerOptions
  readonly executionEnvironment: ExecutionEnvironment
  readonly submission?: AssistantPluginHostSubmissionPolicy
  readonly createActionHost?: PluginActionHostFactory
  readonly management?: PluginCommandManagementOptions
}

export interface AssistantPluginHostSubmissionPolicy {
  readonly maxAttempts?: number
  readonly retryPolicy?: RetryPolicy
  readonly priority?: number
}

export interface AssistantPluginHostWorkerOptions {
  readonly workerId: string
  readonly leaseMs: number
  readonly grants?: readonly PluginPermissionGrant[]
  readonly permissionGuard?: PluginPermissionGuard
  readonly heartbeatIntervalMs?: number
  readonly timeoutMs?: number
  readonly loop?: Pick<
    WorkerLoopOptions,
    "idleIntervalMs" | "errorIntervalMs"
  >
}

export interface AssistantPluginBinding {
  readonly extensions: NonNullable<ShellOptions["extensions"]>
  readonly assistantCommands: NonNullable<ShellOptions["assistantCommands"]>
  readonly pluginManagement?: NonNullable<ShellOptions["pluginManagement"]>
}

export interface AssistantPluginHost {
  readonly assistantBinding: AssistantPluginBinding
  readonly management?: PluginManagementPort
  status(): AssistantPluginHostStatus
  start(): AssistantPluginHostStatus
  refresh(): Promise<AssistantPluginHostRefreshResult>
  runOnce(): Promise<AssistantPluginHostRunOnceResult>
  stop(): Promise<AssistantPluginHostStatus>
  dispose(): Promise<AssistantPluginHostStatus>
}

export interface AssistantPluginHostStatus {
  readonly kind: "assistant-plugin-host.status"
  readonly started: boolean
  readonly disposed: boolean
  readonly activePluginCount: number
  readonly commandCount: number
  readonly actionHostCount: number
  readonly catalogRevision: string
  readonly completedCount: number
  readonly failedCount: number
  readonly lastWorkerStatus?: AssistantPluginHostRunOnceResult["status"]
  readonly lastRefresh?: AssistantPluginHostRefreshStatus
}

export type AssistantPluginHostDiagnosticCode =
  | "active_plugin_limit_exceeded"
  | "duplicate_active_plugin"
  | "manifest_missing"
  | "manifest_inactive"
  | "identity_mismatch"
  | "trust_invalid"
  | "layout_invalid"
  | "command_resolution_failed"
  | "host_creation_failed"
  | "refresh_failed"

export interface AssistantPluginHostRefreshStatus {
  readonly status: "succeeded" | "failed"
  readonly revision: string
  readonly activePluginCount: number
  readonly commandCount: number
  readonly changed?: boolean
  readonly listenerErrorCount?: number
  readonly diagnostic?: {
    readonly code: AssistantPluginHostDiagnosticCode
    readonly message: string
  }
}

export type AssistantPluginHostRefreshResult = AssistantPluginHostRefreshStatus

export interface PluginActionHostFactory {
  (request: {
    readonly manifest: import("@wanex/protocol").PluginManifestRecord
    readonly install: import("@wanex/protocol").PluginInstallRecord
    readonly executionEnvironment: ExecutionEnvironment
  }): PluginActionHost | Promise<PluginActionHost>
}

export type AssistantPluginHostRunOnceResult =
  | { readonly status: "idle" }
  | {
      readonly status: "completed" | "failed"
      readonly jobId?: string
    }
