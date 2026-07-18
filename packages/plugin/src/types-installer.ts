import type { JsonValue } from "@wanex/protocol"
import type { PluginRuntime } from "./runtime.js"
import type {
  RegisterPluginInstallPlanResult
} from "./types-runtime.js"
import type {
  PluginInstallPlan,
  PluginPackageTrustSource
} from "./types-package.js"

export interface PluginInstallerAdapterRequest {
  readonly source: PluginPackageTrustSource
  readonly expectedPluginId?: string
  readonly expectedVersion?: string
  readonly installRootDir?: string
  readonly metadata?: JsonValue
}

export interface PluginInstallerAdapterResult {
  readonly plan: PluginInstallPlan | JsonValue
  readonly metadata?: JsonValue
}

export interface PluginInstallerAdapter {
  install(
    request: PluginInstallerAdapterRequest
  ): Promise<PluginInstallerAdapterResult> | PluginInstallerAdapterResult
}

export interface RunPluginInstallerAdapterRequest {
  readonly runtime: PluginRuntime
  readonly adapter: PluginInstallerAdapter
  readonly request: PluginInstallerAdapterRequest
  readonly manifestId?: string
  readonly manifestIdempotencyKey?: string
  readonly installId?: string
  readonly installIdempotencyKey?: string
}

export interface RunPluginInstallerAdapterResult
  extends RegisterPluginInstallPlanResult {
  readonly installerMetadata?: JsonValue
}
