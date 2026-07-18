import type {
  JsonValue,
  PluginCapability,
  PluginManifestRecord
} from "@wanex/protocol"
import type { WorkerHandlerContext } from "@wanex/runtime/jobs"
import type { PluginRuntimeStore } from "./storage.js"
import type { WANEX_PLUGIN_HOST_PROTOCOL } from "./types-constants.js"
import type { PluginSandboxAccessRequest, PluginSandboxGuard } from "./types-sandbox.js"
import type { ExecutionHost } from "@wanex/runtime/execution"

export interface PluginActionHandlerContext {
  readonly job: WorkerHandlerContext["job"]
  readonly manifest: PluginManifestRecord
  readonly payload: JsonValue
  readonly storage: PluginRuntimeStore
  readonly signal: AbortSignal
  heartbeat(): Promise<void>
}

export type PluginActionHandler = (
  context: PluginActionHandlerContext
) => Promise<JsonValue | void> | JsonValue | void

export interface PluginActionHandlerDefinition {
  readonly capability: PluginCapability
  readonly version?: string
  readonly sandbox?: PluginSandboxAccessRequest
  readonly handler: PluginActionHandler
}

export interface PluginActionDescriptor {
  readonly capability: PluginCapability
  readonly version?: string
  readonly sandbox?: PluginSandboxAccessRequest
}

export interface ResolvePluginActionRequest {
  readonly pluginId: string
  readonly actionId: string
  readonly version?: string
}

export interface ExecutePluginActionRequest {
  readonly job: WorkerHandlerContext["job"]
  readonly manifest: PluginManifestRecord
  readonly actionId: string
  readonly capability: PluginCapability
  readonly payload: JsonValue
  readonly storage: PluginRuntimeStore
  readonly signal: AbortSignal
  heartbeat(): Promise<void>
}

export interface PluginActionHost {
  resolve(
    request: ResolvePluginActionRequest
  ): Promise<PluginActionDescriptor | undefined> | PluginActionDescriptor | undefined
  execute(
    request: ExecutePluginActionRequest
  ): Promise<JsonValue | void> | JsonValue | void
}

export interface SubprocessPluginActionDescriptor extends PluginActionDescriptor {
  readonly pluginId: string
  readonly actionId: string
}

export interface SubprocessPluginActionHostOptions {
  readonly descriptors: readonly SubprocessPluginActionDescriptor[]
  readonly command: string
  readonly args?: readonly string[]
  readonly cwd?: string
  readonly env?: NodeJS.ProcessEnv
  readonly executionHost?: ExecutionHost
  readonly timeoutMs?: number
  readonly stdoutLimitBytes?: number
  readonly stderrLimitBytes?: number
}

export interface PluginHostExecuteMessage {
  readonly protocol: typeof WANEX_PLUGIN_HOST_PROTOCOL
  readonly type: "execute"
  readonly request: {
    readonly jobId: string
    readonly pluginId: string
    readonly pluginVersion: string
    readonly actionId: string
    readonly capability: PluginCapability
    readonly payload: JsonValue
  }
}

export type PluginHostResponseMessage =
  | {
      readonly protocol: typeof WANEX_PLUGIN_HOST_PROTOCOL
      readonly type: "result"
      readonly result?: JsonValue
    }
  | {
      readonly protocol: typeof WANEX_PLUGIN_HOST_PROTOCOL
      readonly type: "error"
      readonly error: {
        readonly message: string
        readonly code?: string
      }
    }

export type PluginActionCatalog =
  | ReadonlyMap<string, ReadonlyMap<string, PluginActionHandlerDefinition>>
  | Record<string, Record<string, PluginActionHandlerDefinition>>

export interface PluginActionJobHandlerOptions {
  readonly storage: PluginRuntimeStore
  readonly catalog?: PluginActionCatalog
  readonly host?: PluginActionHost
  readonly sandbox?: PluginSandboxGuard
}

export interface PluginActionJobPayload {
  readonly pluginId: string
  readonly version?: string
  readonly actionId: string
  readonly payload: JsonValue
  readonly requiredCapability?: PluginCapability
}
