import { WanexSessionCore } from "@wanex/runtime/sessions"
import { WanexWorker } from "@wanex/runtime/jobs"
import { registerPluginActionJobHandler } from "./action-job-handler.js"
import type { PluginRuntimeStore } from "./storage.js"
import { createPluginPermissionGrantGuard } from "./permission-guard.js"
import type { PluginActionHost } from "./types-action.js"
import type {
  PluginPermissionGrant,
  PluginPermissionGuard
} from "./types-permission.js"

export interface CreatePluginActionWorkerOptions {
  readonly storage: PluginRuntimeStore
  readonly workerId: string
  readonly host: PluginActionHost
  readonly leaseMs: number
  readonly grants?: readonly PluginPermissionGrant[]
  readonly permissionGuard?: PluginPermissionGuard
  readonly heartbeatIntervalMs?: number
  readonly timeoutMs?: number
}

export function createPluginActionWorker(
  options: CreatePluginActionWorkerOptions
): WanexWorker {
  const worker = new WanexWorker({
    session: new WanexSessionCore({ storage: options.storage }),
    workerId: options.workerId,
    leaseMs: options.leaseMs,
    kinds: ["plugin.action"],
    ...(options.heartbeatIntervalMs === undefined
      ? {}
      : { heartbeatIntervalMs: options.heartbeatIntervalMs }),
    ...(options.timeoutMs === undefined
      ? {}
      : { timeoutMs: options.timeoutMs })
  })
  registerPluginActionJobHandler(worker, {
    storage: options.storage,
    host: options.host,
    ...(options.permissionGuard === undefined && options.grants === undefined
      ? {}
      : {
          permissionGuard:
            options.permissionGuard ??
            createPluginPermissionGrantGuard(options.grants ?? [])
        })
  })
  return worker
}
