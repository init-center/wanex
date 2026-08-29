import { describe, expect, it } from "vitest"
import {
  projectPluginPackageCommandContributions,
  requirePluginActionHandlerRef
} from "../../src/index.js"

describe("Plugin package command projection", () => {
  it("derives exact handler identity, provenance, trust, and schema", () => {
    const [command] = projectPluginPackageCommandContributions(layout())

    expect(command).toMatchObject({
      id: "plugin.example.echo",
      domain: "command",
      value: {
        name: "example.echo",
        title: "Echo",
        description: "Echo a message.",
        aliases: ["echo"],
        category: "example",
        paletteVisibility: "visible",
        inputSchema: {
          type: "object",
          properties: { text: { type: "string", minLength: 1 } },
          required: ["text"],
          additionalProperties: false
        }
      },
      provenance: {
        source: {
          kind: "plugin",
          scope: "user",
          id: "plugin.example",
          label: "Example Plugin",
          packageName: "@example/wanex-plugin",
          version: "2.0.0"
        },
        trust: "user_enabled"
      },
      privileged: true
    })
    expect(requirePluginActionHandlerRef(command!.value.handlerRef)).toEqual({
      kind: "plugin_action",
      pluginId: "plugin.example",
      version: "2.0.0",
      actionId: "echo",
      requiredCapability: "config.read"
    })
  })

  it("supports headless packages without inventing Assistant commands", () => {
    const { contributes: _contributes, ...headless } = layout()
    expect(projectPluginPackageCommandContributions(headless)).toEqual([])
  })

  it("fails the whole projection when any command schema is malformed", () => {
    const fixture = layout()
    expect(() =>
      projectPluginPackageCommandContributions({
        ...fixture,
        contributes: {
          commands: [
            fixture.contributes.commands[0],
            {
              ...fixture.contributes.commands[0],
              id: "plugin.example.invalid",
              name: "example.invalid",
              aliases: ["invalid"],
              inputSchema: {
                type: "object",
                properties: {
                  text: { type: "string", unsupportedKeyword: true }
                }
              }
            }
          ]
        }
      })
    ).toThrow(/plugin package command input schema is invalid/)
  })
})

function layout() {
  return {
    kind: "wanex.plugin.package.layout.v1",
    pluginId: "plugin.example",
    version: "2.0.0",
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
          description: "Echo a message.",
          aliases: ["echo"],
          category: "example",
          paletteVisibility: "visible",
          actionId: "echo",
          inputSchema: {
            type: "object",
            properties: {
              text: { type: "string", minLength: 1 }
            },
            required: ["text"],
            additionalProperties: false
          }
        }
      ]
    }
  } as const
}
