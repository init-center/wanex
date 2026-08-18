import type { PreparedAgentContext } from "@wanex/runtime/context"
import { ToolRegistry } from "@wanex/runtime/tools"

export function composeWanexAppAgentContext(options: {
  readonly discovered?: PreparedAgentContext
  readonly runtime?: Pick<
    PreparedAgentContext,
    "tools" | "toolPermissionPolicy"
  >
}): PreparedAgentContext | undefined {
  if (options.runtime === undefined) return options.discovered
  const tools = mergeToolRegistries(
    options.discovered?.tools,
    options.runtime.tools
  )
  return {
    ...(options.discovered ?? {}),
    ...(tools === undefined ? {} : { tools }),
    ...(options.runtime.toolPermissionPolicy === undefined
      ? {}
      : { toolPermissionPolicy: options.runtime.toolPermissionPolicy })
  }
}

function mergeToolRegistries(
  discovered: ToolRegistry | undefined,
  runtime: ToolRegistry | undefined
): ToolRegistry | undefined {
  if (discovered === undefined) return runtime
  if (runtime === undefined || runtime === discovered) return discovered

  const merged = new ToolRegistry()
  for (const registry of [discovered, runtime]) {
    for (const descriptor of registry.list()) {
      const definition = registry.get(descriptor.name)
      if (definition === undefined) {
        throw new Error(`tool registry changed during composition: ${descriptor.name}`)
      }
      merged.register(definition)
    }
  }
  return merged
}
