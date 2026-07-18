import { describe, expect, it } from "vitest"
import type {
  AppCommandContribution,
  AppExtensionSource,
  AppInstructionContribution,
  AppToolContribution
} from "@wanex/extension"
import {
  createStaticExtensionHost,
  resolveExtensionHostSnapshot
} from "../../src/host/index.js"

describe("@wanex/extension/host", () => {
  it("collects explicit sources and resolves contributions deterministically", async () => {
    const host = createStaticExtensionHost({
      sources: [
        {
          source: source("plugin", "user", "plugin-a"),
          trust: "user_enabled",
          order: 20,
          contributions: [
            command({
              id: "chat.open",
              title: "Plugin Chat",
              source: source("plugin", "user", "plugin-a"),
              trust: "user_enabled",
              priority: 10
            })
          ]
        },
        {
          source: source("builtin", "builtin", "builtin"),
          trust: "trusted",
          order: 0,
          contributions: [
            command({
              id: "chat.open",
              title: "Built-in Chat",
              source: source("builtin", "builtin", "builtin"),
              trust: "trusted"
            })
          ]
        }
      ]
    })

    const snapshot = await host.resolve()

    expect(snapshot.sources.map((entry) => [entry.source.id, entry.status])).toEqual([
      ["builtin", "loaded"],
      ["plugin-a", "loaded"]
    ])
    expect(snapshot.contributions).toHaveLength(2)
    expect(snapshot.resolved.byDomain.command.byId.get("chat.open")).toMatchObject({
      value: {
        title: "Plugin Chat"
      },
      provenance: {
        source: {
          id: "plugin-a"
        }
      }
    })
    expect(
      snapshot.diagnostics.map((diagnostic) => diagnostic.code)
    ).toContain("extension.duplicate_replaced")
  })

  it("does not collect disabled or blocked sources", async () => {
    const snapshot = await resolveExtensionHostSnapshot({
      sources: [
        {
          source: source("plugin", "user", "disabled"),
          trust: "user_enabled",
          enabled: false,
          contributions: [
            instruction({
              id: "disabled",
              text: "should not load",
              source: source("plugin", "user", "disabled"),
              trust: "user_enabled"
            })
          ]
        },
        {
          source: source("marketplace", "user", "blocked"),
          trust: "blocked",
          contributions: [
            instruction({
              id: "blocked",
              text: "should not load",
              source: source("marketplace", "user", "blocked"),
              trust: "blocked"
            })
          ]
        }
      ]
    })

    expect(snapshot.contributions).toEqual([])
    expect(snapshot.resolved.contributions).toEqual([])
    expect(snapshot.sources.map((entry) => entry.status)).toEqual([
      "blocked",
      "blocked"
    ])
    expect(snapshot.diagnostics).toEqual([
      expect.objectContaining({
        code: "extension.blocked_source",
        sourceId: "disabled"
      }),
      expect.objectContaining({
        code: "extension.blocked_source",
        sourceId: "blocked"
      })
    ])
  })

  it("supports async source loaders without giving them app-shell or storage", async () => {
    const snapshot = await resolveExtensionHostSnapshot({
      sources: [
        {
          source: source("config", "user", "user-config"),
          trust: "trusted",
          contributions: async (context) => [
            instruction({
              id: "config-rule",
              text: `loaded from ${context.source.id}`,
              source: context.source,
              trust: context.trust
            })
          ]
        }
      ]
    })

    expect(snapshot.sources).toEqual([
      expect.objectContaining({
        status: "loaded",
        contributionCount: 1,
        diagnosticCodes: []
      })
    ])
    expect(snapshot.resolved.byDomain.instruction.all[0]).toMatchObject({
      value: {
        text: "loaded from user-config"
      }
    })
  })

  it("surfaces source load failures as diagnostics and keeps resolving others", async () => {
    const snapshot = await resolveExtensionHostSnapshot({
      sources: [
        {
          source: source("plugin", "user", "bad-plugin"),
          trust: "user_enabled",
          contributions: () => {
            throw new Error("boom")
          }
        },
        {
          source: source("policy", "enterprise", "policy"),
          trust: "trusted",
          contributions: [
            instruction({
              id: "policy-rule",
              text: "policy still loads",
              source: source("policy", "enterprise", "policy"),
              trust: "trusted"
            })
          ]
        }
      ]
    })

    expect(snapshot.sources.map((entry) => [entry.source.id, entry.status])).toEqual([
      ["policy", "loaded"],
      ["bad-plugin", "failed"]
    ])
    expect(snapshot.resolved.byDomain.instruction.all).toHaveLength(1)
    expect(snapshot.diagnostics).toEqual([
      expect.objectContaining({
        code: "extension.blocked_source",
        severity: "error",
        sourceId: "bad-plugin",
        message: expect.stringContaining("boom")
      })
    ])
  })

  it("keeps privileged untrusted rejection in the resolver", async () => {
    const snapshot = await resolveExtensionHostSnapshot({
      sources: [
        {
          source: source("plugin", "user", "untrusted-plugin"),
          trust: "untrusted",
          contributions: [
            tool({
              id: "fs.write",
              source: source("plugin", "user", "untrusted-plugin"),
              trust: "untrusted",
              privileged: true
            })
          ]
        }
      ]
    })

    expect(snapshot.contributions).toHaveLength(1)
    expect(snapshot.resolved.contributions).toEqual([])
    expect(snapshot.diagnostics).toEqual([
      expect.objectContaining({
        code: "extension.privileged_untrusted",
        contributionId: "fs.write"
      })
    ])
  })
})

function source(
  kind: AppExtensionSource["kind"],
  scope: AppExtensionSource["scope"],
  id: string
): AppExtensionSource {
  return {
    kind,
    scope,
    id,
    label: id
  }
}

function command(options: {
  id: string
  title: string
  source: AppExtensionSource
  trust: AppCommandContribution["provenance"]["trust"]
  priority?: number
}): AppCommandContribution {
  return {
    id: options.id,
    domain: "command",
    value: {
      name: options.id,
      title: options.title,
      handlerRef: `handler.${options.id}`
    },
    provenance: {
      source: options.source,
      trust: options.trust
    },
    conflictPolicy: "replace",
    ...(options.priority === undefined ? {} : { priority: options.priority })
  }
}

function instruction(options: {
  id: string
  text: string
  source: AppExtensionSource
  trust: AppInstructionContribution["provenance"]["trust"]
}): AppInstructionContribution {
  return {
    id: options.id,
    domain: "instruction",
    value: {
      text: options.text
    },
    provenance: {
      source: options.source,
      trust: options.trust
    },
    conflictPolicy: "append"
  }
}

function tool(options: {
  id: string
  source: AppExtensionSource
  trust: AppToolContribution["provenance"]["trust"]
  privileged: boolean
}): AppToolContribution {
  return {
    id: options.id,
    domain: "tool",
    value: {
      name: options.id,
      handlerRef: `handler.${options.id}`,
      permission: "write"
    },
    provenance: {
      source: options.source,
      trust: options.trust
    },
    privileged: options.privileged
  }
}
