import { describe, expect, it } from "vitest"
import {
  APP_EXTENSION_DOMAINS,
  DEFAULT_APP_EXTENSION_SOURCE_ORDER,
  isAppExtensionContributionDomain,
  resolveAppExtensionContributions
} from "../src/index.js"
import type {
  AppCommandContribution,
  AppExtensionContribution,
  AppExtensionSourceKind,
  AppInstructionContribution,
  AppToolContribution
} from "../src/index.js"

describe("@wanex/extension", () => {
  it("fails closed when a command omits explicit palette visibility", () => {
    const malformed = command({
      id: "command.missing-visibility",
      sourceKind: "plugin",
      title: "Missing visibility"
    })
    delete (malformed.value as { paletteVisibility?: unknown }).paletteVisibility

    const snapshot = resolveAppExtensionContributions([malformed])

    expect(snapshot.byDomain.command.all).toEqual([])
    expect(snapshot.diagnostics).toEqual([
      expect.objectContaining({
        code: "extension.command_palette_visibility_invalid",
        severity: "error",
        contributionId: "command.missing-visibility"
      })
    ])
  })

  it("exports the frozen app contribution domains and default source order", () => {
    expect(APP_EXTENSION_DOMAINS).toEqual([
      "instruction",
      "skill",
      "command",
      "agent",
      "tool",
      "provider_catalog",
      "lifecycle_hook"
    ])
    expect(DEFAULT_APP_EXTENSION_SOURCE_ORDER).toEqual([
      "builtin",
      "policy",
      "global_file",
      "project_file",
      "config",
      "plugin",
      "marketplace",
      "connector",
      "runtime_override"
    ])
    expect(isAppExtensionContributionDomain("command")).toBe(true)
    expect(isAppExtensionContributionDomain("plugin")).toBe(false)
  })

  it("resolves duplicate ids deterministically by source order, priority, and order", () => {
    const builtIn = command({
      id: "chat.open",
      sourceKind: "builtin",
      title: "Open Chat",
      priority: 100,
      order: 100
    })
    const project = command({
      id: "chat.open",
      sourceKind: "project_file",
      title: "Project Chat",
      priority: 0,
      order: 0
    })
    const pluginEarly = command({
      id: "chat.open",
      sourceKind: "plugin",
      sourceId: "plugin-a",
      title: "Plugin Chat A",
      priority: 1,
      order: 10
    })
    const pluginLate = command({
      id: "chat.open",
      sourceKind: "plugin",
      sourceId: "plugin-b",
      title: "Plugin Chat B",
      priority: 2,
      order: 0
    })

    const snapshot = resolveAppExtensionContributions([
      pluginEarly,
      builtIn,
      pluginLate,
      project
    ])

    expect(snapshot.byDomain.command.byId.get("chat.open")).toMatchObject({
      value: {
        title: "Plugin Chat B"
      },
      provenance: {
        source: {
          id: "plugin-b"
        }
      }
    })
    expect(
      snapshot.diagnostics.filter(
        (diagnostic) => diagnostic.code === "extension.duplicate_replaced"
      )
    ).toHaveLength(3)
    expect(snapshot.contributions.map((contribution) => contribution.id)).toEqual([
      "chat.open"
    ])
  })

  it("keeps append conflicts as multiple ordered contributions", () => {
    const first = instruction({
      id: "agents.project",
      text: "first",
      sourceKind: "project_file",
      order: 1,
      conflictPolicy: "append"
    })
    const second = instruction({
      id: "agents.project",
      text: "second",
      sourceKind: "project_file",
      order: 2,
      conflictPolicy: "append"
    })

    const snapshot = resolveAppExtensionContributions([second, first])

    expect(
      snapshot.byDomain.instruction.all.map(
        (contribution) => contribution.value.text
      )
    ).toEqual(["first", "second"])
    expect(snapshot.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "extension.appended"
    )
  })

  it("merges duplicate object values when requested", () => {
    const base = command({
      id: "workspace.inspect",
      sourceKind: "builtin",
      title: "Inspect",
      conflictPolicy: "merge",
      metadata: {
        owner: "builtin"
      }
    })
    const override = command({
      id: "workspace.inspect",
      sourceKind: "runtime_override",
      title: "Inspect Workspace",
      aliases: ["inspect"],
      conflictPolicy: "merge",
      metadata: {
        owner: "runtime",
        visible: true
      }
    })

    const snapshot = resolveAppExtensionContributions([override, base])

    expect(snapshot.byDomain.command.byId.get("workspace.inspect")).toMatchObject({
      value: {
        name: "workspace.inspect",
        title: "Inspect Workspace",
        aliases: ["inspect"],
        handlerRef: "handler.workspace.inspect"
      },
      metadata: {
        owner: "runtime",
        visible: true
      }
    })
    expect(snapshot.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "extension.merged"
    )
  })

  it("fails closed for unknown domains and blocked sources", () => {
    const unsupported = {
      ...command({
        id: "bad.domain",
        sourceKind: "plugin",
        title: "Bad Domain"
      }),
      domain: "plugin_action"
    } as unknown as AppExtensionContribution
    const blocked = command({
      id: "blocked.command",
      sourceKind: "plugin",
      title: "Blocked",
      trust: "blocked"
    })

    const snapshot = resolveAppExtensionContributions([unsupported, blocked])

    expect(snapshot.contributions).toEqual([])
    expect(snapshot.diagnostics.map((diagnostic) => diagnostic.code).sort()).toEqual([
      "extension.blocked_source",
      "extension.invalid_domain"
    ])
  })

  it("rejects privileged contributions from untrusted sources by default", () => {
    const tool = toolContribution({
      id: "fs.write",
      sourceKind: "project_file",
      trust: "untrusted",
      permission: "write",
      privileged: true
    })

    const rejected = resolveAppExtensionContributions([tool])
    const allowed = resolveAppExtensionContributions([tool], {
      allowUntrustedPrivileged: true
    })

    expect(rejected.contributions).toEqual([])
    expect(rejected.diagnostics).toMatchObject([
      {
        code: "extension.privileged_untrusted",
        severity: "error",
        contributionId: "fs.write"
      }
    ])
    expect(allowed.byDomain.tool.byId.get("fs.write")).toMatchObject({
      value: {
        permission: "write"
      }
    })
  })

  it("supports explicit source order overrides for product policy", () => {
    const project = command({
      id: "agent.run",
      sourceKind: "project_file",
      title: "Project Run"
    })
    const policy = command({
      id: "agent.run",
      sourceKind: "policy",
      title: "Policy Run"
    })

    const snapshot = resolveAppExtensionContributions([project, policy], {
      sourceOrder: ["builtin", "project_file", "policy"]
    })

    expect(snapshot.byDomain.command.byId.get("agent.run")?.value.title).toBe(
      "Policy Run"
    )
  })
})

function command(options: {
  id: string
  sourceKind: AppExtensionSourceKind
  title: string
  sourceId?: string
  priority?: number
  order?: number
  aliases?: readonly string[]
  conflictPolicy?: AppCommandContribution["conflictPolicy"]
  metadata?: AppCommandContribution["metadata"]
  trust?: AppCommandContribution["provenance"]["trust"]
}): AppCommandContribution {
  return {
    id: options.id,
    domain: "command",
    value: {
      name: options.id,
      title: options.title,
      ...(options.aliases === undefined ? {} : { aliases: options.aliases }),
      paletteVisibility: "visible",
      handlerRef: `handler.${options.id}`
    },
    provenance: provenance({
      kind: options.sourceKind,
      id: options.sourceId ?? options.sourceKind,
      ...(options.trust === undefined ? {} : { trust: options.trust })
    }),
    ...(options.priority === undefined ? {} : { priority: options.priority }),
    ...(options.order === undefined ? {} : { order: options.order }),
    ...(options.conflictPolicy === undefined
      ? {}
      : { conflictPolicy: options.conflictPolicy }),
    ...(options.metadata === undefined ? {} : { metadata: options.metadata })
  }
}

function instruction(options: {
  id: string
  sourceKind: AppExtensionSourceKind
  text: string
  order?: number
  conflictPolicy?: AppInstructionContribution["conflictPolicy"]
}): AppInstructionContribution {
  return {
    id: options.id,
    domain: "instruction",
    value: {
      text: options.text
    },
    provenance: provenance({
      kind: options.sourceKind,
      id: options.sourceKind
    }),
    ...(options.order === undefined ? {} : { order: options.order }),
    ...(options.conflictPolicy === undefined
      ? {}
      : { conflictPolicy: options.conflictPolicy })
  }
}

function toolContribution(options: {
  id: string
  sourceKind: AppExtensionSourceKind
  trust: AppToolContribution["provenance"]["trust"]
  permission: AppToolContribution["value"]["permission"]
  privileged: boolean
}): AppToolContribution {
  return {
    id: options.id,
    domain: "tool",
    value: {
      name: options.id,
      handlerRef: `handler.${options.id}`,
      ...(options.permission === undefined
        ? {}
        : { permission: options.permission })
    },
    provenance: provenance({
      kind: options.sourceKind,
      id: options.sourceKind,
      trust: options.trust
    }),
    privileged: options.privileged
  }
}

function provenance(options: {
  kind: AppExtensionSourceKind
  id: string
  trust?: AppCommandContribution["provenance"]["trust"]
}): AppCommandContribution["provenance"] {
  return {
    source: {
      kind: options.kind,
      scope: sourceScope(options.kind),
      id: options.id
    },
    trust: options.trust ?? "trusted"
  }
}

function sourceScope(
  kind: AppExtensionSourceKind
): AppCommandContribution["provenance"]["source"]["scope"] {
  switch (kind) {
    case "builtin":
      return "builtin"
    case "policy":
      return "enterprise"
    case "global_file":
      return "global"
    case "project_file":
      return "project"
    case "runtime_override":
      return "runtime"
    default:
      return "user"
  }
}
