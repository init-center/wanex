import { createPluginActionProductCommandExecutor } from "./plugin-action/index.js"
import {
  createCompositePluginActionHost,
  createPluginActionWorker,
  PluginRuntime
} from "@wanex/plugin"
import {
  createProductAppShell,
  createProductAppSurfaceAdapter
} from "@wanex/product-app"
import {
  createInProcessProductAppSurfaceClientTransport,
  createProductAppSurfaceClient
} from "@wanex/product-app/surface-client"
import type { WorkerLoop, WorkerRunOnceResult } from "@wanex/runtime/jobs"
import { createPluginStore } from "@wanex/storage/plugin"
import type {
  CreateProductAppCommandHostOptions,
  ProductAppCommandHost,
  ProductAppCommandHostPluginTarget,
  ProductAppCommandHostRunOnceResult,
  ProductAppCommandHostStatus
} from "./types.js"

export async function createProductAppCommandHost(
  options: CreateProductAppCommandHostOptions
): Promise<ProductAppCommandHost> {
  const storage = Object.assign(
    {},
    options.handle.core,
    createPluginStore(options.handle.transport)
  )
  const principalId = required(options.principalId, "principalId")
  const workerId = required(options.worker.workerId, "workerId")
  const targets = normalizeTargets(options.plugins)
  const plugin = new PluginRuntime({ storage })
  const entries = await Promise.all(
    targets.map(async (target) => ({
      pluginId: target.pluginId,
      host:
        target.host ??
        (await plugin.createTrustedSubprocessActionHost(
          target.pluginId,
          target.version
        ))
    }))
  )
  const worker = createPluginActionWorker({
    storage,
    workerId,
    leaseMs: options.worker.leaseMs,
    host: createCompositePluginActionHost(entries),
    ...(options.worker.grants === undefined
      ? {}
      : { grants: options.worker.grants }),
    ...(options.worker.sandbox === undefined
      ? {}
      : { sandbox: options.worker.sandbox }),
    ...(options.worker.heartbeatIntervalMs === undefined
      ? {}
      : { heartbeatIntervalMs: options.worker.heartbeatIntervalMs }),
    ...(options.worker.timeoutMs === undefined
      ? {}
      : { timeoutMs: options.worker.timeoutMs })
  })
  const app = await createProductAppShell({
    ...(options.productApp ?? {}),
    storage: {
      kind: "injected",
      handle: options.handle
    },
    extensions: { snapshot: options.extensionSnapshot },
    productCommands: {
      extensionExecutor: createPluginActionProductCommandExecutor({
        port: plugin,
        principalId,
        ...(options.submission === undefined
          ? {}
          : { submission: options.submission })
      })
    }
  })
  const surface = createProductAppSurfaceAdapter(app)
  const client = createProductAppSurfaceClient(
    createInProcessProductAppSurfaceClientTransport(surface)
  )
  let loop: WorkerLoop | undefined
  let disposed = false
  let completedCount = 0
  let failedCount = 0
  let lastWorkerStatus: WorkerRunOnceResult["status"] | undefined

  const status = (): ProductAppCommandHostStatus => ({
    kind: "product-app-command-host.status",
    started: loop !== undefined && !loop.stopped,
    disposed,
    pluginCount: targets.length,
    completedCount,
    failedCount,
    ...(lastWorkerStatus === undefined ? {} : { lastWorkerStatus })
  })
  const record = (result: WorkerRunOnceResult): void => {
    lastWorkerStatus = result.status
    if (result.status === "completed") {
      completedCount += 1
    } else if (result.status === "failed") {
      failedCount += 1
    }
  }

  return {
    app,
    surface,
    client,
    status,
    start() {
      assertActive(disposed)
      if (loop === undefined || loop.stopped) {
        loop = worker.start({
          ...(options.worker.loop ?? {}),
          onResult: record,
          onError() {
            failedCount += 1
          }
        })
      }
      return status()
    },
    async runOnce() {
      assertActive(disposed)
      if (loop !== undefined && !loop.stopped) {
        throw new Error("cannot runOnce while product command host is started")
      }
      const result = await worker.runOnce()
      record(result)
      return projectRunOnceResult(result)
    },
    async stop() {
      if (loop !== undefined) {
        loop.stop()
        await loop.waitForIdle()
        loop = undefined
      }
      return status()
    },
    async dispose() {
      if (!disposed) {
        if (loop !== undefined) {
          loop.stop()
          await loop.waitForIdle()
          loop = undefined
        }
        await surface.dispose()
        await app.dispose()
        disposed = true
      }
      return status()
    }
  }
}

function projectRunOnceResult(
  result: WorkerRunOnceResult
): ProductAppCommandHostRunOnceResult {
  if (result.status === "idle") {
    return { status: "idle" }
  }
  return {
    status: result.status,
    ...(result.job === null ? {} : { jobId: result.job.id })
  }
}

function normalizeTargets(
  targets: readonly ProductAppCommandHostPluginTarget[]
): readonly ProductAppCommandHostPluginTarget[] {
  if (targets.length === 0) {
    throw new Error("product command host requires at least one plugin target")
  }
  const seen = new Set<string>()
  return targets.map((target) => {
    const pluginId = required(target.pluginId, "pluginId")
    if (seen.has(pluginId)) {
      throw new Error(`duplicate product command host plugin target: ${pluginId}`)
    }
    seen.add(pluginId)
    return {
      ...target,
      pluginId,
      ...(target.version === undefined
        ? {}
        : { version: required(target.version, "plugin version") })
    }
  })
}

function required(value: string, label: string): string {
  const normalized = value.trim()
  if (normalized.length === 0) {
    throw new Error(`${label} must not be empty`)
  }
  return normalized
}

function assertActive(disposed: boolean): void {
  if (disposed) {
    throw new Error("product command host is disposed")
  }
}
