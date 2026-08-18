import type {
  PluginActionHost,
  PluginPermissionGrant,
  PluginSandboxGuard
} from "@wanex/plugin"
import type {
  ShellOptions
} from "@wanex/product"
import type { StorageHandle } from "@wanex/storage"
import type { RetryPolicy } from "@wanex/protocol"
import type { WorkerLoopOptions } from "@wanex/runtime/jobs"
import type {
  PluginManagementPort,
} from "@wanex/product/plugin-management"
import type { PluginCommandManagementOptions } from "./management/index.js"

export interface CreatePluginCommandHostOptions {
  readonly handle: Pick<StorageHandle, "core" | "transport">
  readonly principalId: string
  readonly worker: PluginCommandHostWorkerOptions
  readonly submission?: PluginCommandHostSubmissionPolicy
  readonly createActionHost?: PluginExecutionHostFactory
  readonly management?: PluginCommandManagementOptions
}

export interface PluginCommandHostSubmissionPolicy {
  readonly maxAttempts?: number
  readonly retryPolicy?: RetryPolicy
  readonly priority?: number
}

export interface PluginCommandHostWorkerOptions {
  readonly workerId: string
  readonly leaseMs: number
  readonly grants?: readonly PluginPermissionGrant[]
  readonly sandbox?: PluginSandboxGuard
  readonly heartbeatIntervalMs?: number
  readonly timeoutMs?: number
  readonly loop?: Pick<
    WorkerLoopOptions,
    "idleIntervalMs" | "errorIntervalMs"
  >
}

export interface PluginCommandProductBinding {
  readonly extensions: NonNullable<ShellOptions["extensions"]>
  readonly productCommands: NonNullable<ShellOptions["productCommands"]>
  readonly pluginManagement?: NonNullable<ShellOptions["pluginManagement"]>
}

export interface PluginCommandHost {
  readonly productBinding: PluginCommandProductBinding
  readonly management?: PluginManagementPort
  status(): PluginCommandHostStatus
  start(): PluginCommandHostStatus
  refresh(): Promise<PluginCommandHostRefreshResult>
  runOnce(): Promise<PluginCommandHostRunOnceResult>
  stop(): Promise<PluginCommandHostStatus>
  dispose(): Promise<PluginCommandHostStatus>
}

export interface PluginCommandHostStatus {
  readonly kind: "plugin-command-host.status"
  readonly started: boolean
  readonly disposed: boolean
  readonly activePluginCount: number
  readonly commandCount: number
  readonly executionHostCount: number
  readonly catalogRevision: string
  readonly completedCount: number
  readonly failedCount: number
  readonly lastWorkerStatus?: PluginCommandHostRunOnceResult["status"]
  readonly lastRefresh?: PluginCommandHostRefreshStatus
}

export type PluginCommandHostDiagnosticCode =
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

export interface PluginCommandHostRefreshStatus {
  readonly status: "succeeded" | "failed"
  readonly revision: string
  readonly activePluginCount: number
  readonly commandCount: number
  readonly changed?: boolean
  readonly listenerErrorCount?: number
  readonly diagnostic?: {
    readonly code: PluginCommandHostDiagnosticCode
    readonly message: string
  }
}

export type PluginCommandHostRefreshResult = PluginCommandHostRefreshStatus

export interface PluginExecutionHostFactory {
  (request: {
    readonly manifest: import("@wanex/protocol").PluginManifestRecord
    readonly install: import("@wanex/protocol").PluginInstallRecord
  }): PluginActionHost | Promise<PluginActionHost>
}

export type PluginCommandHostRunOnceResult =
  | { readonly status: "idle" }
  | {
      readonly status: "completed" | "failed"
      readonly jobId?: string
    }
