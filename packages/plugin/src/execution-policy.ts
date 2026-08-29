import type {
  BindExecutionScopeRequest,
  ExecutionEnvironment
} from "@wanex/runtime/execution"
import type { PluginActionDescriptor } from "./types.js"

const PLUGIN_ROOT_ID = "plugin"
const MAX_PLUGIN_READ_BYTES = 50 * 1024 * 1024
const MAX_PLUGIN_DIRECTORY_ENTRIES = 100_000

export interface CompiledPluginExecution {
  readonly bind: BindExecutionScopeRequest
  readonly timeoutMs: number
}

export function compilePluginExecution(options: {
  readonly descriptor: PluginActionDescriptor
  readonly environment: ExecutionEnvironment
  readonly cwd: string
  readonly scopeId: string
  readonly timeoutMs: number
}): CompiledPluginExecution {
  const permissions = options.descriptor.permissions
  if ((permissions?.networks?.length ?? 0) > 0) {
    throw new Error(
      "plugin network destination constraints are not enforceable by the current execution policy"
    )
  }
  if ((permissions?.fileSystemPaths?.length ?? 0) > 0) {
    throw new Error(
      "plugin filesystem path constraints are not enforceable by the current execution policy"
    )
  }

  const timeoutMs = Math.min(
    options.timeoutMs,
    permissions?.maxExecutionMs ?? options.timeoutMs
  )
  return {
    timeoutMs,
    bind: {
      scopeId: options.scopeId,
      policy: {
        revision: 1,
        filesystem: {
          roots: [{ id: PLUGIN_ROOT_ID, effects: ["read"] }],
          maxReadBytes: MAX_PLUGIN_READ_BYTES,
          maxDirectoryEntries: MAX_PLUGIN_DIRECTORY_ENTRIES
        },
        process: {
          oneShot: true,
          managed: false,
          cleanup: options.environment.capabilities.process.cleanup,
          environmentVariables: []
        },
        network: "unrestricted",
        isolation: "none",
        pty: false
      },
      fileSystemRoots: [{ id: PLUGIN_ROOT_ID, path: options.cwd }]
    }
  }
}
