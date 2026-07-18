import {
  bootstrapWanexStorage,
  type BootstrappedWanexArtifacts,
  type BootstrappedWanexStorage,
  type BootstrapWanexStorageOptions,
  type WanexBootstrapStorageConfig,
  type WanexBootstrapLocalProfileStorageConfig,
  type WanexBootstrapLocalSystemServiceStorageConfig,
  type WanexBootstrapRemoteHttpStorageConfig
} from "@wanex/runtime/bootstrap"
import {
  buildAppDiagnosticsSnapshot,
  type AppDiagnosticsSnapshot
} from "@wanex/app/diagnostics"
import { WanexConfigCore } from "@wanex/runtime/config"
import type { ContextCompiler } from "@wanex/runtime/context"
import {
  resolveRuntimeHostDiagnostics,
  WanexRuntimeHost,
  type RuntimeHostDiagnosticsInput,
  type WanexRuntimeHostBehaviorOptions
} from "@wanex/runtime/host"
import { createAppStore, type AppStore } from "./storage.js"
import type { ToolPermissionPolicy, ToolRegistry } from "@wanex/runtime/tools"
import {
  WanexAppShellConfigReloadController,
  type WanexAppShellConfigPollResult,
  type WanexAppShellConfigReloadControllerOptions,
  type WanexAppShellConfigReloadSubscription
} from "./config-reload.js"

export type WanexAppShellBootstrapStorageConfig = WanexBootstrapStorageConfig
export type WanexAppShellBootstrapLocalSystemServiceStorageConfig =
  WanexBootstrapLocalSystemServiceStorageConfig
export type WanexAppShellBootstrapLocalProfileStorageConfig =
  WanexBootstrapLocalProfileStorageConfig
export type WanexAppShellBootstrapRemoteHttpStorageConfig =
  WanexBootstrapRemoteHttpStorageConfig

export interface BootstrapWanexAppShellRuntimeOptions
  extends BootstrapWanexStorageOptions {
  readonly app?: Omit<WanexAppShellRuntimeOptions, "storage">
}

export interface BootstrappedWanexAppShellRuntime
  extends BootstrappedWanexStorage {
  readonly app: WanexAppShellRuntime
  readonly artifacts: BootstrappedWanexAppShellRuntimeArtifacts
}

export type BootstrappedWanexAppShellRuntimeArtifacts = BootstrappedWanexArtifacts

export interface WanexAppShellRuntimeOptions {
  readonly storage: AppStore
  readonly config?: WanexConfigCore
  readonly hotReload?: WanexAppShellConfigReloadController
  readonly configReloadSubscriptions?: readonly WanexAppShellConfigReloadSubscription[]
  readonly onConfigReload?: WanexAppShellConfigReloadControllerOptions["onReload"]
  readonly onConfigReloadError?: WanexAppShellConfigReloadControllerOptions["onError"]
}

export interface WanexAppShellRuntime {
  readonly storage: AppStore
  readonly config: WanexConfigCore
  readonly hotReload: WanexAppShellConfigReloadController
  createRuntimeHost(
    options?: WanexAppShellRuntimeHostOptions
  ): WanexRuntimeHost
  createRuntimeHostWithAgentContext(
    options: WanexAppShellRuntimeHostWithAgentContextOptions
  ): WanexRuntimeHost
  registerConfigReload(
    subscription: WanexAppShellConfigReloadSubscription
  ): void
  refreshConfigKey(
    key: string
  ): ReturnType<WanexAppShellConfigReloadController["refreshKey"]>
  pollConfigReloads(
    request?: Parameters<WanexAppShellConfigReloadController["pollOnce"]>[0]
  ): Promise<WanexAppShellConfigPollResult>
  getDiagnostics(
    options?: WanexAppShellDiagnosticsOptions
  ): Promise<AppDiagnosticsSnapshot>
}

export type WanexAppShellRuntimeHostOptions = WanexRuntimeHostBehaviorOptions

export interface WanexAppShellRuntimeHostWithAgentContextOptions {
  readonly context: {
    readonly contextCompiler: ContextCompiler
    readonly tools?: ToolRegistry
    readonly toolPermissionPolicy?: ToolPermissionPolicy
  }
  readonly host?: WanexAppShellRuntimeHostOptions
}

export interface WanexAppShellDiagnosticsOptions {
  readonly now?: number
  readonly jobLimit?: number
  readonly pluginLimit?: number
  readonly runtimeHost?: RuntimeHostDiagnosticsInput
}

export async function bootstrapWanexAppShellRuntime(
  options: BootstrapWanexAppShellRuntimeOptions
): Promise<BootstrappedWanexAppShellRuntime> {
  const runtime = await bootstrapWanexStorage(options)
  const app = createWanexAppShellRuntime({
    storage: createAppStore(runtime.storage, runtime.transport),
    ...options.app
  })
  return {
    ...runtime,
    app
  }
}

export function createWanexAppShellRuntime(
  options: WanexAppShellRuntimeOptions
): WanexAppShellRuntime {
  const config =
    options.config ?? new WanexConfigCore({ storage: options.storage })
  const hotReload =
    options.hotReload ??
    new WanexAppShellConfigReloadController({
      storage: options.storage,
      config,
      ...(options.configReloadSubscriptions === undefined
        ? {}
        : { subscriptions: options.configReloadSubscriptions }),
      ...(options.onConfigReload === undefined
        ? {}
        : { onReload: options.onConfigReload }),
      ...(options.onConfigReloadError === undefined
        ? {}
        : { onError: options.onConfigReloadError })
    })
  return {
    storage: options.storage,
    config,
    hotReload,
    createRuntimeHost(hostOptions = {}) {
      return new WanexRuntimeHost({
        storage: options.storage,
        ...hostOptions
      })
    },
    createRuntimeHostWithAgentContext(runtimeHostOptions) {
      return this.createRuntimeHost({
        ...(runtimeHostOptions.host ?? {}),
        contextCompiler: runtimeHostOptions.context.contextCompiler,
        ...(runtimeHostOptions.context.tools === undefined
          ? {}
          : { tools: runtimeHostOptions.context.tools }),
        ...(runtimeHostOptions.context.toolPermissionPolicy === undefined
          ? {}
          : {
              toolPermissionPolicy:
                runtimeHostOptions.context.toolPermissionPolicy
            })
      })
    },
    registerConfigReload(subscription) {
      hotReload.register(subscription)
    },
    refreshConfigKey(key) {
      return hotReload.refreshKey(key)
    },
    async pollConfigReloads(request = {}) {
      return await hotReload.pollOnce(request)
    },
    async getDiagnostics(diagnosticsOptions = {}) {
      const [jobs, manifests, installs, runtimeHostDiagnostics] =
        await Promise.all([
          options.storage.listJobs({ limit: diagnosticsOptions.jobLimit ?? 50 }),
          options.storage.listPluginManifests({
            limit: diagnosticsOptions.pluginLimit ?? 50
          }),
          options.storage.listPluginInstalls({
            limit: diagnosticsOptions.pluginLimit ?? 50
          }),
          diagnosticsOptions.runtimeHost === undefined
            ? Promise.resolve(undefined)
            : resolveRuntimeHostDiagnostics(diagnosticsOptions.runtimeHost, {
                ...(diagnosticsOptions.now === undefined
                  ? {}
                  : { now: diagnosticsOptions.now }),
                jobLimit: diagnosticsOptions.jobLimit ?? 50
              })
        ])
      return buildAppDiagnosticsSnapshot({
        ...(diagnosticsOptions.now === undefined
          ? {}
          : { now: diagnosticsOptions.now }),
        jobs,
        plugin: {
          manifests,
          installs
        },
        ...(runtimeHostDiagnostics === undefined
          ? {}
          : {
              runtimeHost: runtimeHostDiagnostics.summary,
              ...(runtimeHostDiagnostics.health === undefined
                ? {}
                : { runtimeHostHealth: runtimeHostDiagnostics.health })
            })
      })
    }
  }
}
