import type {
  JsonValue,
  PluginInstallRecord,
  PluginManifestRecord
} from "@wanex/protocol"
import {
  assertPluginInstallExecutable,
  assertPluginPackageTrusted,
  isPluginPackageTrustRecord,
  pluginPackageTrustRecordFromJson,
  pluginSubprocessManifestEntryFromJson,
  resolveTrustedPluginCommand
} from "./codec.js"
import {
  executeSubprocessPluginAction,
  pluginActionDescriptorFromDefinitionLike,
  validateSubprocessPluginActionHostOptions
} from "./subprocess.js"
import { WANEX_PLUGIN_HOST_PROTOCOL } from "./types.js"
import type {
  PluginActionHost,
  PluginHostExecuteMessage,
  PluginPackageTrustRecord,
  SubprocessPluginActionDescriptor,
  SubprocessPluginActionHostOptions
} from "./types.js"

export function createSubprocessPluginActionHost(
  options: SubprocessPluginActionHostOptions
): PluginActionHost {
  validateSubprocessPluginActionHostOptions(options)
  const descriptors = new Map<string, SubprocessPluginActionDescriptor>()
  for (const descriptor of options.descriptors) {
    descriptors.set(
      pluginActionKey(descriptor.pluginId, descriptor.version, descriptor.actionId),
      descriptor
    )
  }
  return {
    resolve(request) {
      const descriptor = descriptors.get(
        pluginActionKey(request.pluginId, request.version, request.actionId)
      )
      if (descriptor === undefined) {
        return undefined
      }
      return pluginActionDescriptorFromDefinitionLike(descriptor)
    },
    async execute(request) {
      const descriptor = descriptors.get(
        pluginActionKey(
          request.manifest.pluginId,
          request.manifest.version,
          request.actionId
        )
      )
      if (descriptor === undefined) {
        throw new Error(
          `plugin action descriptor not found during execution: ${request.manifest.pluginId}/${request.actionId}`
        )
      }
      const message: PluginHostExecuteMessage = {
        protocol: WANEX_PLUGIN_HOST_PROTOCOL,
        type: "execute",
        request: {
          jobId: request.job.id,
          pluginId: request.manifest.pluginId,
          pluginVersion: request.manifest.version,
          actionId: request.actionId,
          capability: request.capability,
          payload: request.payload
        }
      }
      const response = await executeSubprocessPluginAction(
        options,
        descriptor,
        message,
        request.signal
      )
      if (response.type === "error") {
        throw new Error(`plugin subprocess error: ${response.error.message}`)
      }
      return response.result
    }
  }
}

export function createSubprocessPluginActionHostFromManifest(
  manifest: PluginManifestRecord,
  options: Pick<
    SubprocessPluginActionHostOptions,
    "cwd" | "executionEnvironment"
  >
): PluginActionHost {
  if (manifest.entry === undefined) {
    throw new Error(`plugin manifest entry not found: ${manifest.pluginId}`)
  }
  const entry = pluginSubprocessManifestEntryFromJson(manifest.entry)
  return createSubprocessPluginActionHost({
    descriptors: entry.actions.map((action) => ({
      pluginId: manifest.pluginId,
      actionId: action.actionId,
      capability: action.capability,
      version: manifest.version,
      ...(action.permissions === undefined
        ? {}
        : { permissions: action.permissions })
    })),
    command: entry.command,
    cwd: options.cwd,
    executionEnvironment: options.executionEnvironment,
    ...(entry.args === undefined ? {} : { args: entry.args }),
    ...(entry.timeoutMs === undefined ? {} : { timeoutMs: entry.timeoutMs }),
    ...(entry.stderrLimitBytes === undefined
      ? {}
      : { stderrLimitBytes: entry.stderrLimitBytes })
  })
}

export function createTrustedSubprocessPluginActionHostFromManifest(options: {
  readonly manifest: PluginManifestRecord
  readonly trust: PluginPackageTrustRecord | JsonValue
  readonly executionEnvironment: SubprocessPluginActionHostOptions["executionEnvironment"]
}): PluginActionHost {
  const trust = isPluginPackageTrustRecord(options.trust)
    ? options.trust
    : pluginPackageTrustRecordFromJson(options.trust)
  assertPluginPackageTrusted(options.manifest, trust)
  if (options.manifest.entry === undefined) {
    throw new Error(`plugin manifest entry not found: ${options.manifest.pluginId}`)
  }
  const entry = pluginSubprocessManifestEntryFromJson(options.manifest.entry)
  return createSubprocessPluginActionHost({
    descriptors: entry.actions.map((action) => ({
      pluginId: options.manifest.pluginId,
      actionId: action.actionId,
      capability: action.capability,
      version: options.manifest.version,
      ...(action.permissions === undefined
        ? {}
        : { permissions: action.permissions })
    })),
    command: resolveTrustedPluginCommand(trust.install.rootDir, entry.command),
    cwd: trust.install.rootDir,
    executionEnvironment: options.executionEnvironment,
    ...(entry.args === undefined ? {} : { args: entry.args }),
    ...(entry.timeoutMs === undefined ? {} : { timeoutMs: entry.timeoutMs }),
    ...(entry.stderrLimitBytes === undefined
      ? {}
      : { stderrLimitBytes: entry.stderrLimitBytes })
  })
}

export function createTrustedSubprocessPluginActionHostFromInstall(options: {
  readonly manifest: PluginManifestRecord
  readonly install: PluginInstallRecord
  readonly executionEnvironment: SubprocessPluginActionHostOptions["executionEnvironment"]
}): PluginActionHost {
  const trust = pluginPackageTrustRecordFromJson(options.install.trust)
  assertPluginInstallExecutable(options.manifest, options.install, trust)
  return createTrustedSubprocessPluginActionHostFromManifest({
    manifest: options.manifest,
    executionEnvironment: options.executionEnvironment,
    trust: {
      ...trust,
      install: {
        rootDir: options.install.installRootDir
      }
    }
  })
}

function pluginActionKey(pluginId: string, version: string, actionId: string): string {
  return `${pluginId}\u0000${version}\u0000${actionId}`
}
