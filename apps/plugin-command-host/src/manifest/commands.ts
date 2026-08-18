import {
  parseAppCommandInputSchema,
  type AppCommandContribution,
  type AppCommandInputSchema
} from "@wanex/extension"
import {
  pluginPackageLayoutFromJson,
  type PluginPackageCommandContribution,
  type PluginPackageLayout
} from "@wanex/plugin"
import type { JsonValue } from "@wanex/protocol"
import { pluginActionHandlerRef } from "../plugin-action/index.js"

export function projectPluginPackageCommandContributions(
  layout: PluginPackageLayout | JsonValue
): readonly AppCommandContribution[] {
  const parsed = pluginPackageLayoutFromJson(layout as JsonValue)
  const actions = new Map(
    parsed.entry.actions.map((action) => [action.actionId, action] as const)
  )
  return (parsed.contributes?.commands ?? []).map((command) => {
    const action = actions.get(command.actionId)
    if (action === undefined) {
      throw new Error(
        `plugin package command action not found: ${parsed.pluginId}@${parsed.version}/${command.actionId}`
      )
    }
    const inputSchema = parseCommandInputSchema(parsed, command)
    return {
      id: command.id,
      domain: "command",
      value: {
        name: command.name,
        title: command.title,
        paletteVisibility: command.paletteVisibility,
        handlerRef: pluginActionHandlerRef({
          kind: "plugin_action",
          pluginId: parsed.pluginId,
          version: parsed.version,
          actionId: action.actionId,
          requiredCapability: action.capability
        }),
        ...(command.description === undefined
          ? {}
          : { description: command.description }),
        ...(command.aliases === undefined
          ? {}
          : { aliases: [...command.aliases] }),
        ...(command.category === undefined
          ? {}
          : { category: command.category }),
        ...(inputSchema === undefined ? {} : { inputSchema })
      },
      provenance: {
        source: {
          kind: "plugin",
          scope: "user",
          id: parsed.pluginId,
          version: parsed.version,
          ...(parsed.name === undefined ? {} : { label: parsed.name }),
          ...(parsed.packageName === undefined
            ? {}
            : { packageName: parsed.packageName })
        },
        trust: "user_enabled"
      },
      privileged: true
    }
  })
}

function parseCommandInputSchema(
  layout: PluginPackageLayout,
  command: PluginPackageCommandContribution
): AppCommandInputSchema | undefined {
  if (command.inputSchema === undefined) {
    return undefined
  }
  const parsed = parseAppCommandInputSchema(command.inputSchema)
  if (!parsed.ok) {
    throw new Error(
      `plugin package command input schema is invalid: ${layout.pluginId}@${layout.version}/${command.id} ${parsed.error.path} ${parsed.error.message}`
    )
  }
  return parsed.value
}
