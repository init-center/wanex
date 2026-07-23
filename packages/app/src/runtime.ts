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
} from "./diagnostics/index.js"
import { WanexConfigCore } from "@wanex/runtime/config"
import type {
  ContextCompiler,
  PreparedAgentContext
} from "@wanex/runtime/context"
import {
  resolveRuntimeHostDiagnostics,
  WanexRuntimeHost,
  type RuntimeHostDiagnosticsInput,
  type WanexRuntimeHostBehaviorOptions
} from "@wanex/runtime/host"
import { createAppStore, type AppStore } from "./storage.js"
import type { SecretResolverPort } from "@wanex/runtime/secrets"
import {
  WanexAppConfigReloadController,
  type WanexAppConfigPollResult,
  type WanexAppConfigReloadControllerOptions,
  type WanexAppConfigReloadSubscription
} from "./config-reload.js"

export type WanexAppBootstrapStorageConfig = WanexBootstrapStorageConfig
export type WanexAppBootstrapLocalSystemServiceStorageConfig =
  WanexBootstrapLocalSystemServiceStorageConfig
export type WanexAppBootstrapLocalProfileStorageConfig =
  WanexBootstrapLocalProfileStorageConfig
export type WanexAppBootstrapRemoteHttpStorageConfig =
  WanexBootstrapRemoteHttpStorageConfig

export interface BootstrapWanexAppRuntimeOptions
  extends BootstrapWanexStorageOptions {
  readonly app?: Omit<WanexAppRuntimeOptions, "storage">
}

export interface BootstrappedWanexAppRuntime
  extends BootstrappedWanexStorage {
  readonly app: WanexAppRuntime
  readonly artifacts: BootstrappedWanexAppRuntimeArtifacts
}

export type BootstrappedWanexAppRuntimeArtifacts = BootstrappedWanexArtifacts

export interface WanexAppRuntimeOptions {
  readonly storage: AppStore
  readonly secretResolver?: SecretResolverPort
  readonly config?: WanexConfigCore
  readonly hotReload?: WanexAppConfigReloadController
  readonly configReloadSubscriptions?: readonly WanexAppConfigReloadSubscription[]
  readonly onConfigReload?: WanexAppConfigReloadControllerOptions["onReload"]
  readonly onConfigReloadError?: WanexAppConfigReloadControllerOptions["onError"]
}

export interface WanexAppRuntime {
  readonly storage: AppStore
  readonly config: WanexConfigCore
  readonly hotReload: WanexAppConfigReloadController
  createRuntimeHost(
    options?: WanexAppRuntimeHostOptions
  ): WanexRuntimeHost
  createRuntimeHostWithAgentContext(
    options: WanexAppRuntimeHostWithAgentContextOptions
  ): WanexRuntimeHost
  registerConfigReload(
    subscription: WanexAppConfigReloadSubscription
  ): void
  refreshConfigKey(
    key: string
  ): ReturnType<WanexAppConfigReloadController["refreshKey"]>
  pollConfigReloads(
    request?: Parameters<WanexAppConfigReloadController["pollOnce"]>[0]
  ): Promise<WanexAppConfigPollResult>
  getDiagnostics(
    options?: WanexAppDiagnosticsOptions
  ): Promise<AppDiagnosticsSnapshot>
}

export type WanexAppRuntimeHostOptions = WanexRuntimeHostBehaviorOptions

export interface WanexAppRuntimeHostWithAgentContextOptions {
  readonly context: PreparedAgentContext & {
    readonly contextCompiler: ContextCompiler
  }
  readonly host?: Omit<
    WanexAppRuntimeHostOptions,
    "agentContext" | "contextCompiler" | "tools" | "toolPermissionPolicy"
  >
}

export interface WanexAppDiagnosticsOptions {
  readonly now?: number
  readonly jobLimit?: number
  readonly pluginLimit?: number
  readonly runtimeHost?: RuntimeHostDiagnosticsInput
}

export async function bootstrapWanexAppRuntime(
  options: BootstrapWanexAppRuntimeOptions
): Promise<BootstrappedWanexAppRuntime> {
  const runtime = await bootstrapWanexStorage(options)
  const app = createWanexAppRuntime({
    storage: createAppStore(runtime.storage, runtime.transport),
    ...options.app
  })
  return {
    ...runtime,
    app
  }
}

export function createWanexAppRuntime(
  options: WanexAppRuntimeOptions
): WanexAppRuntime {
  const config =
    options.config ?? new WanexConfigCore({ storage: options.storage })
  const hotReload =
    options.hotReload ??
    new WanexAppConfigReloadController({
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
        ...(options.secretResolver === undefined
          ? {}
          : { secretResolver: options.secretResolver }),
        ...hostOptions
      })
    },
    createRuntimeHostWithAgentContext(runtimeHostOptions) {
      return this.createRuntimeHost({
        ...(runtimeHostOptions.host ?? {}),
        agentContext: runtimeHostOptions.context
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
