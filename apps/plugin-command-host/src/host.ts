import { createAppExtensionCatalog } from "@wanex/extension"
import {
  createPluginActionWorker,
  createTrustedSubprocessPluginActionHostFromInstall,
  PluginRuntime,
} from "@wanex/plugin"
import type { WorkerLoop, WorkerRunOnceResult } from "@wanex/runtime/jobs"
import type { CommandExecutionInvalidationListener } from "@wanex/product"
import { createPluginStore } from "@wanex/storage/plugin"
import {
  buildPluginCatalog,
  emptyPluginCatalogGeneration,
  failedRefreshResult,
} from "./catalog-builder.js"
import { PluginExecutionHostRegistry } from "./execution-registry.js"
import { createPluginCommandManagement } from "./management/service.js"
import { createPluginActionProductCommandExecutor } from "./plugin-action/index.js"
import type {
  CreatePluginCommandHostOptions,
  PluginCommandHost,
  PluginCommandHostRefreshResult,
  PluginCommandHostRefreshStatus,
  PluginCommandHostRunOnceResult,
  PluginCommandHostStatus,
  PluginExecutionHostFactory,
} from "./types.js"

export async function createPluginCommandHost(
  options: CreatePluginCommandHostOptions,
): Promise<PluginCommandHost> {
  const storage = Object.assign(
    {},
    options.handle.core,
    createPluginStore(options.handle.transport),
  )
  const principalId = required(options.principalId, "principalId")
  const workerId = required(options.worker.workerId, "workerId")
  const plugin = new PluginRuntime({ storage })
  const catalog = createAppExtensionCatalog(emptyPluginCatalogGeneration())
  const registry = new PluginExecutionHostRegistry(
    options.createActionHost ?? defaultPluginActionHostFactory,
  )
  const executionInvalidationListeners = new Set<
    CommandExecutionInvalidationListener
  >()
  let loop: WorkerLoop | undefined
  const worker = createPluginActionWorker({
    storage,
    workerId,
    leaseMs: options.worker.leaseMs,
    host: registry.actionHost,
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
      : { timeoutMs: options.worker.timeoutMs }),
  })
  const commandProductBinding = {
    extensions: { source: catalog.source },
    productCommands: {
      extensionExecutor: createPluginActionProductCommandExecutor({
        port: {
          async submitAction(request) {
            const submission = await plugin.submitAction(request)
            loop?.wake()
            return submission
          },
        },
        principalId,
        ...(options.submission === undefined
          ? {}
          : { submission: options.submission }),
      }),
      executionInvalidations: {
        subscribeCommandExecutionInvalidations(
          listener: CommandExecutionInvalidationListener,
        ) {
          executionInvalidationListeners.add(listener)
          let subscribed = true
          return () => {
            if (!subscribed) return
            subscribed = false
            executionInvalidationListeners.delete(listener)
          }
        },
      },
    },
  }
  let disposed = false
  let completedCount = 0
  let failedCount = 0
  let lastWorkerStatus: WorkerRunOnceResult["status"] | undefined
  let lastRefresh: PluginCommandHostRefreshStatus | undefined
  let refreshPromise: Promise<PluginCommandHostRefreshResult> | undefined
  let refreshRequested = false

  const status = (): PluginCommandHostStatus => {
    const generation = catalog.source.current()
    const last = lastRefresh
    return {
      kind: "plugin-command-host.status",
      started: loop !== undefined && !loop.stopped,
      disposed,
      activePluginCount: last?.activePluginCount ?? 0,
      commandCount: generation.snapshot.byDomain.command.all.length,
      executionHostCount: registry.size,
      catalogRevision: generation.revision,
      completedCount,
      failedCount,
      ...(lastWorkerStatus === undefined ? {} : { lastWorkerStatus }),
      ...(last === undefined ? {} : { lastRefresh: last }),
    }
  }

  const record = (result: WorkerRunOnceResult): void => {
    lastWorkerStatus = result.status
    if (result.status === "completed") {
      completedCount += 1
    } else if (result.status === "failed") {
      failedCount += 1
    }
    if (result.status !== "idle" && result.job !== null) {
      for (const listener of executionInvalidationListeners) {
        try {
          listener({ kind: "job", id: result.job.id })
        } catch {
          // Product listeners cannot affect worker settlement.
        }
      }
    }
  }

  const refreshOnce = async (): Promise<PluginCommandHostRefreshResult> => {
    const current = catalog.source.current()
    const currentState = {
      revision: current.revision,
      activePluginCount: lastRefresh?.activePluginCount ?? 0,
      commandCount: current.snapshot.byDomain.command.all.length,
    }
    try {
      const built = await buildPluginCatalog(plugin, registry)
      const publication = catalog.publish(built.generation)
      const result: PluginCommandHostRefreshResult = {
        status: "succeeded",
        revision: built.generation.revision,
        activePluginCount: built.activePluginCount,
        commandCount: built.commandCount,
        changed: publication.changed,
        listenerErrorCount: publication.listenerErrors.length,
      }
      lastRefresh = result
      return result
    } catch (error) {
      const result = failedRefreshResult(error, currentState)
      lastRefresh = result
      return result
    }
  }

  const drainRefresh = async (): Promise<PluginCommandHostRefreshResult> => {
    refreshRequested = false
    let result: PluginCommandHostRefreshResult = await refreshOnce()
    let changed = result.status === "succeeded" && result.changed === true
    let listenerErrorCount =
      result.status === "succeeded" ? result.listenerErrorCount ?? 0 : 0
    while (refreshRequested) {
      refreshRequested = false
      result = await refreshOnce()
      if (result.status === "succeeded") {
        changed ||= result.changed === true
        listenerErrorCount += result.listenerErrorCount ?? 0
      }
    }
    if (result.status === "succeeded") {
      result = {
        ...result,
        changed,
        listenerErrorCount,
      }
      lastRefresh = result
    }
    return result
  }

  const refresh = (): Promise<PluginCommandHostRefreshResult> => {
    assertActive(disposed)
    refreshRequested = true
    if (refreshPromise === undefined) {
      refreshPromise = drainRefresh().finally(() => {
        refreshPromise = undefined
      })
    }
    return refreshPromise
  }

  // The optional host is usable with zero plugins and remains startable even
  // when a malformed installed package leaves the previous catalog intact.
  await refresh()
  const management =
    options.management === undefined
      ? undefined
      : await createPluginCommandManagement(
          { runtime: plugin, refresh, status },
          options.management,
        )
  const productBinding = {
    ...commandProductBinding,
    ...(management === undefined ? {} : { pluginManagement: management }),
  }

  return {
    productBinding,
    ...(management === undefined ? {} : { management }),
    status,
    start() {
      assertActive(disposed)
      if (loop === undefined || loop.stopped) {
        loop = worker.start({
          ...(options.worker.loop ?? {}),
          onResult: record,
          onError() {
            failedCount += 1
          },
        })
      }
      return status()
    },
    refresh,
    async runOnce() {
      assertActive(disposed)
      if (loop !== undefined && !loop.stopped) {
        throw new Error("cannot runOnce while plugin command host is started")
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
        await management?.dispose()
        executionInvalidationListeners.clear()
        disposed = true
      }
      return status()
    },
  }
}

const defaultPluginActionHostFactory: PluginExecutionHostFactory = ({
  manifest,
  install,
}) => createTrustedSubprocessPluginActionHostFromInstall({ manifest, install })

function projectRunOnceResult(
  result: WorkerRunOnceResult,
): PluginCommandHostRunOnceResult {
  if (result.status === "idle") {
    return { status: "idle" }
  }
  return {
    status: result.status,
    ...(result.job === null ? {} : { jobId: result.job.id }),
  }
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
    throw new Error("plugin command host is disposed")
  }
}
