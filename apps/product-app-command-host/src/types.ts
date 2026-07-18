import type { AppExtensionResolvedSnapshot } from "@wanex/extension"
import type {
  PluginActionHost,
  PluginPermissionGrant,
  PluginSandboxGuard
} from "@wanex/plugin"
import type {
  ProductAppShell,
  ProductAppShellOptions,
  ProductAppSurfaceAdapter
} from "@wanex/product-app"
import type { ProductAppSurfaceClient } from "@wanex/product-app/surface-client"
import type { StorageHandle } from "@wanex/storage"
import type { RetryPolicy } from "@wanex/protocol"
import type { WorkerLoopOptions } from "@wanex/runtime/jobs"

export interface CreateProductAppCommandHostOptions {
  readonly handle: Pick<StorageHandle, "core" | "transport">
  readonly extensionSnapshot: AppExtensionResolvedSnapshot
  readonly principalId: string
  readonly plugins: readonly ProductAppCommandHostPluginTarget[]
  readonly worker: ProductAppCommandHostWorkerOptions
  readonly submission?: ProductAppCommandHostSubmissionPolicy
  readonly productApp?: Omit<
    ProductAppShellOptions,
    "storage" | "extensions" | "productCommands"
  >
}

export interface ProductAppCommandHostSubmissionPolicy {
  readonly maxAttempts?: number
  readonly retryPolicy?: RetryPolicy
  readonly priority?: number
}

export interface ProductAppCommandHostPluginTarget {
  readonly pluginId: string
  readonly version?: string
  readonly host?: PluginActionHost
}

export interface ProductAppCommandHostWorkerOptions {
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

export interface ProductAppCommandHost {
  readonly app: ProductAppShell
  readonly surface: ProductAppSurfaceAdapter
  readonly client: ProductAppSurfaceClient
  status(): ProductAppCommandHostStatus
  start(): ProductAppCommandHostStatus
  runOnce(): Promise<ProductAppCommandHostRunOnceResult>
  stop(): Promise<ProductAppCommandHostStatus>
  dispose(): Promise<ProductAppCommandHostStatus>
}

export interface ProductAppCommandHostStatus {
  readonly kind: "product-app-command-host.status"
  readonly started: boolean
  readonly disposed: boolean
  readonly pluginCount: number
  readonly completedCount: number
  readonly failedCount: number
  readonly lastWorkerStatus?: ProductAppCommandHostRunOnceResult["status"]
}

export type ProductAppCommandHostRunOnceResult =
  | { readonly status: "idle" }
  | {
      readonly status: "completed" | "failed"
      readonly jobId?: string
    }
