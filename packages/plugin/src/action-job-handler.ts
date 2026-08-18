import type { JsonValue } from "@wanex/protocol"
import type {
  WanexWorker,
  WorkerHandler,
  WorkerHandlerContext
} from "@wanex/runtime/jobs"
import {
  defaultPluginSandboxPolicy,
  requireExecutablePluginManifest
} from "./action-manifest.js"
import { pluginActionJobPayloadFromJson } from "./action-payload.js"
import { resolvePluginActionHost } from "./action-host-in-process.js"
import { expectJsonValue } from "./internal-validation.js"
import {
  createPluginSandboxGuard,
  validatePluginSandboxAccessRequest
} from "./sandbox.js"
import type { PluginActionJobHandlerOptions } from "./types.js"

export function createPluginActionJobHandler(
  options: PluginActionJobHandlerOptions
): WorkerHandler {
  const host = resolvePluginActionHost(options)
  return async (context: WorkerHandlerContext): Promise<JsonValue> => {
    if (context.signal.aborted) {
      throw new Error(`plugin.action job aborted before start: ${context.job.id}`)
    }
    const payload = pluginActionJobPayloadFromJson(context.job.payload)
    const descriptor = await host.resolve({
      pluginId: payload.pluginId,
      actionId: payload.actionId,
      version: payload.version
    })
    if (descriptor === undefined) {
      throw new Error(
        `plugin action handler not registered: ${payload.pluginId}/${payload.actionId}`
      )
    }
    if (descriptor.version !== payload.version) {
      throw new Error(
        `plugin action handler version mismatch: ${payload.pluginId}/${payload.actionId}`
      )
    }
    if (
      payload.requiredCapability !== undefined &&
      payload.requiredCapability !== descriptor.capability
    ) {
      throw new Error(
        `plugin action required capability mismatch: ${payload.requiredCapability} != ${descriptor.capability}`
      )
    }

    const manifest = await requireExecutablePluginManifest(options.storage, {
      pluginId: payload.pluginId,
      version: payload.version,
      capability: descriptor.capability,
    })
    if (descriptor.sandbox !== undefined) {
      validatePluginSandboxAccessRequest(descriptor.sandbox)
    }
    const defaultPolicy = defaultPluginSandboxPolicy(manifest)
    const sandboxDecision = (
      options.sandbox ?? createPluginSandboxGuard(defaultPolicy)
    ).authorize({
      policy: defaultPolicy,
      plugin: manifest,
      actionId: payload.actionId,
      actionCapability: descriptor.capability,
      payload: payload.payload,
      ...(descriptor.sandbox === undefined ? {} : { request: descriptor.sandbox })
    })
    if (sandboxDecision.status === "denied") {
      throw new Error(
        `plugin sandbox denied: ${manifest.pluginId}/${payload.actionId}`
      )
    }
    const result = await host.execute({
      job: context.job,
      manifest,
      actionId: payload.actionId,
      capability: descriptor.capability,
      payload: payload.payload,
      storage: options.storage,
      signal: context.signal,
      heartbeat: context.heartbeat
    })
    return result === undefined ? null : expectJsonValue(result, "plugin action result")
  }
}

export function registerPluginActionJobHandler(
  worker: WanexWorker,
  options: PluginActionJobHandlerOptions
): void {
  worker.register("plugin.action", createPluginActionJobHandler(options))
}
