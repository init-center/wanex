import { describe, expect, it } from "vitest"
import {
  pluginPackageLayoutFromJson,
  registerPluginManifestRequestFromPackageLayout
} from "../src/index.js"

describe("plugin package command contributions", () => {
  it("parses bounded declarative commands and keeps headless packages valid", () => {
    const parsed = pluginPackageLayoutFromJson(layout())

    expect(parsed.contributes?.commands).toEqual([
      {
        id: "plugin.example.echo",
        name: "example.echo",
        title: "Echo",
        description: "Echo a message through the example action.",
        aliases: ["echo"],
        category: "example",
        paletteVisibility: "visible",
        actionId: "echo",
        inputSchema: {
          type: "object",
          properties: { text: { type: "string" } },
          required: ["text"],
          additionalProperties: false
        }
      }
    ])

    const { contributes: _contributes, ...headless } = layout()
    expect(pluginPackageLayoutFromJson(headless).contributes).toBeUndefined()
  })

  it("rejects duplicate ids, invocation names, and dangling actions", () => {
    const command = layout().contributes.commands[0]
    expect(() =>
      pluginPackageLayoutFromJson({
        ...layout(),
        contributes: {
          commands: [command, { ...command, name: "example.other" }]
        }
      })
    ).toThrow(/duplicate plugin package command id/)

    expect(() =>
      pluginPackageLayoutFromJson({
        ...layout(),
        contributes: {
          commands: [
            command,
            {
              ...command,
              id: "plugin.example.other",
              name: "example.other",
              aliases: ["echo"]
            }
          ]
        }
      })
    ).toThrow(/duplicate plugin package command invocation name/)

    expect(() =>
      pluginPackageLayoutFromJson({
        ...layout(),
        contributes: {
          commands: [{ ...command, actionId: "missing" }]
        }
      })
    ).toThrow(/command action does not exist/)
  })

  it("rejects forbidden command authority and enforces declaration bounds", () => {
    const command = layout().contributes.commands[0]
    for (const [field, value] of [
      ["handlerRef", "unsafe.handler"],
      ["provenance", { source: "package" }],
      ["source", { kind: "plugin" }],
      ["trust", "trusted"],
      ["executable", "run-command"]
    ] as const) {
      expect(() =>
        pluginPackageLayoutFromJson({
          ...layout(),
          contributes: {
            commands: [{ ...command, [field]: value }]
          }
        })
      ).toThrow(new RegExp(`unsupported field: ${field}`))
    }

    expect(() =>
      pluginPackageLayoutFromJson({
        ...layout(),
        contributes: {
          commands: Array.from({ length: 129 }, (_, index) => ({
            ...command,
            id: `plugin.example.command-${index}`,
            name: `example.command-${index}`,
            aliases: []
          }))
        }
      })
    ).toThrow(/exceeds 128 entries/)
  })

  it("always validates typed-looking layouts before manifest registration", () => {
    expect(() =>
      registerPluginManifestRequestFromPackageLayout({
        ...layout(),
        contributes: {
          commands: [
            {
              ...layout().contributes.commands[0],
              paletteVisibility: "sometimes"
            }
          ]
        }
      } as never)
    ).toThrow(/paletteVisibility must be visible or hidden/)
  })
})

function layout() {
  return {
    kind: "wanex.plugin.package.layout.v1",
    pluginId: "plugin.example",
    version: "1.0.0",
    name: "Example Plugin",
    packageName: "@example/wanex-plugin",
    entry: {
      kind: "wanex.plugin.host.subprocess.v1",
      command: "bin/plugin.mjs",
      actions: [{ actionId: "echo", capability: "config.read" }]
    },
    capabilities: ["config.read"],
    contributes: {
      commands: [
        {
          id: "plugin.example.echo",
          name: "example.echo",
          title: "Echo",
          description: "Echo a message through the example action.",
          aliases: ["echo"],
          category: "example",
          paletteVisibility: "visible",
          actionId: "echo",
          inputSchema: {
            type: "object",
            properties: { text: { type: "string" } },
            required: ["text"],
            additionalProperties: false
          }
        }
      ]
    }
  } as const
}
