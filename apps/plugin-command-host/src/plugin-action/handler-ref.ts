import type { PluginCapability } from "@wanex/protocol"
import type { PluginActionHandlerRef } from "./types.js"

const HANDLER_REF_PREFIX = "wanex.plugin-action:"

export function pluginActionHandlerRef(
  target: PluginActionHandlerRef
): string {
  validateHandlerRefPart(target.pluginId, "pluginId")
  validateHandlerRefPart(target.actionId, "actionId")
  validateHandlerRefPart(target.version, "version")
  const params = new URLSearchParams()
  params.set("version", target.version)
  if (target.requiredCapability !== undefined) {
    validateHandlerRefPart(target.requiredCapability, "requiredCapability")
    params.set("capability", target.requiredCapability)
  }
  const suffix = params.size === 0 ? "" : `?${params.toString()}`
  return `${HANDLER_REF_PREFIX}${target.pluginId}/${target.actionId}${suffix}`
}

export function parsePluginActionHandlerRef(
  handlerRef: string
): PluginActionHandlerRef | undefined {
  if (!handlerRef.startsWith(HANDLER_REF_PREFIX)) {
    return undefined
  }
  const rest = handlerRef.slice(HANDLER_REF_PREFIX.length)
  const [path = "", query = ""] = rest.split("?", 2)
  const [pluginId, actionId, extra] = path.split("/")
  if (
    pluginId === undefined ||
    actionId === undefined ||
    extra !== undefined ||
    !isValidHandlerRefPart(pluginId) ||
    !isValidHandlerRefPart(actionId)
  ) {
    throw new Error("invalid plugin action handlerRef")
  }
  const params = new URLSearchParams(query)
  const version = params.get("version") ?? undefined
  const requiredCapability = params.get("capability") ?? undefined
  if (version === undefined) {
    throw new Error("plugin action handlerRef requires version")
  }
  validateHandlerRefPart(version, "version")
  if (requiredCapability !== undefined) {
    validateHandlerRefPart(requiredCapability, "requiredCapability")
  }
  return {
    kind: "plugin_action",
    pluginId,
    actionId,
    version,
    ...(requiredCapability === undefined
      ? {}
      : { requiredCapability: requiredCapability as PluginCapability })
  }
}

export function requirePluginActionHandlerRef(
  handlerRef: string
): PluginActionHandlerRef {
  const parsed = parsePluginActionHandlerRef(handlerRef)
  if (parsed === undefined) {
    throw new Error("handlerRef is not a plugin action")
  }
  return parsed
}

function validateHandlerRefPart(value: string, label: string): void {
  if (!isValidHandlerRefPart(value)) {
    throw new Error(`invalid plugin action handlerRef ${label}`)
  }
}

function isValidHandlerRefPart(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 128 &&
    !value.includes("/") &&
    !value.includes("?") &&
    !value.includes("#") &&
    !value.includes("\0")
  )
}
