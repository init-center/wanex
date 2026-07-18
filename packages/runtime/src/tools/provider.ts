import type { ProviderToolDefinition } from "../provider/index.js"
import type { ToolRegistry } from "./registry.js"

export function providerToolDefinitions(
  registry: ToolRegistry
): ProviderToolDefinition[] {
  return registry.list().map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema
  }))
}
