import { describe, expect, it } from "vitest"
import {
  DEFAULT_TUI_CONTRIBUTION_SOURCE_ORDER,
  isTuiContributionDomain,
  resolveTuiContributions,
  TUI_CONTRIBUTION_DOMAINS,
  type TuiCommandPaletteContribution,
  type TuiContribution,
  type TuiContributionSourceKind,
  type TuiKeybindingContribution,
  type TuiPanelContribution,
  type TuiThemeContribution
} from "../../src/tui/surface/index.js"

describe("@wanex/product-app-tui/contributions", () => {
  it("exports the frozen TUI contribution domains and default source order", () => {
    expect(TUI_CONTRIBUTION_DOMAINS).toEqual([
      "command_palette",
      "keybinding",
      "panel",
      "status_item",
      "prompt_decoration",
      "theme",
      "notification"
    ])
    expect(DEFAULT_TUI_CONTRIBUTION_SOURCE_ORDER).toEqual([
      "builtin",
      "policy",
      "global_config",
      "project_config",
      "plugin",
      "marketplace",
      "connector",
      "runtime_override"
    ])
    expect(isTuiContributionDomain("keybinding")).toBe(true)
    expect(isTuiContributionDomain("app_command")).toBe(false)
  })

  it("resolves duplicate palette entries deterministically", () => {
    const builtIn = command({
      id: "palette.run",
      sourceKind: "builtin",
      title: "Run",
      priority: 100
    })
    const plugin = command({
      id: "palette.run",
      sourceKind: "plugin",
      sourceId: "plugin-runner",
      title: "Run Plugin Command",
      priority: 1
    })
    const override = command({
      id: "palette.run",
      sourceKind: "runtime_override",
      sourceId: "runtime",
      title: "Run Override",
      priority: 0
    })

    const snapshot = resolveTuiContributions([plugin, override, builtIn])

    expect(snapshot.byDomain.command_palette.byId.get("palette.run"))
      .toMatchObject({
        value: {
          title: "Run Override"
        },
        provenance: {
          source: {
            id: "runtime"
          }
        }
      })
    expect(
      snapshot.diagnostics.filter(
        (diagnostic) => diagnostic.code === "tui.duplicate_replaced"
      )
    ).toHaveLength(2)
  })

  it("keeps append conflicts for keybinding alternatives", () => {
    const primary = keybinding({
      id: "key.run",
      key: "ctrl+r",
      order: 1,
      conflictPolicy: "append"
    })
    const secondary = keybinding({
      id: "key.run",
      key: "cmd+r",
      order: 2,
      conflictPolicy: "append"
    })

    const snapshot = resolveTuiContributions([secondary, primary])

    expect(
      snapshot.byDomain.keybinding.all.map(
        (contribution) => contribution.value.key
      )
    ).toEqual(["ctrl+r", "cmd+r"])
    expect(snapshot.diagnostics.map((diagnostic) => diagnostic.code))
      .toContain("tui.appended")
  })

  it("merges duplicate object values when requested", () => {
    const base = theme({
      id: "theme.default",
      colors: {
        foreground: "#ffffff",
        background: "#000000"
      },
      conflictPolicy: "merge"
    })
    const override = theme({
      id: "theme.default",
      sourceKind: "runtime_override",
      displayName: "Runtime Theme",
      colors: {
        accent: "#00ff99"
      },
      conflictPolicy: "merge",
      metadata: {
        owner: "runtime"
      }
    })

    const snapshot = resolveTuiContributions([override, base])

    expect(snapshot.byDomain.theme.byId.get("theme.default")).toMatchObject({
      value: {
        displayName: "Runtime Theme",
        colors: {
          accent: "#00ff99"
        }
      },
      metadata: {
        owner: "runtime"
      }
    })
    expect(snapshot.diagnostics.map((diagnostic) => diagnostic.code))
      .toContain("tui.merged")
  })

  it("fails closed for unknown domains, blocked sources, and untrusted privileged entries", () => {
    const unsupported = {
      ...command({
        id: "bad.domain",
        sourceKind: "plugin",
        title: "Bad"
      }),
      domain: "app_command"
    } as unknown as TuiContribution
    const blocked = command({
      id: "blocked.command",
      sourceKind: "plugin",
      title: "Blocked",
      trust: "blocked"
    })
    const privileged = panel({
      id: "panel.secrets",
      sourceKind: "project_config",
      trust: "untrusted",
      privileged: true
    })

    const snapshot = resolveTuiContributions([unsupported, blocked, privileged])

    expect(snapshot.contributions).toEqual([])
    expect(snapshot.diagnostics.map((diagnostic) => diagnostic.code).sort())
      .toEqual([
        "tui.blocked_source",
        "tui.invalid_domain",
        "tui.privileged_untrusted"
      ])
  })

  it("supports product-owned source order overrides", () => {
    const project = command({
      id: "palette.inspect",
      sourceKind: "project_config",
      title: "Project Inspect"
    })
    const policy = command({
      id: "palette.inspect",
      sourceKind: "policy",
      title: "Policy Inspect"
    })

    const snapshot = resolveTuiContributions([project, policy], {
      sourceOrder: ["builtin", "project_config", "policy"]
    })

    expect(
      snapshot.byDomain.command_palette.byId.get("palette.inspect")?.value.title
    ).toBe("Policy Inspect")
  })
})

function command(options: {
  id: string
  sourceKind: TuiContributionSourceKind
  title: string
  sourceId?: string
  priority?: number
  order?: number
  conflictPolicy?: TuiCommandPaletteContribution["conflictPolicy"]
  metadata?: TuiCommandPaletteContribution["metadata"]
  trust?: TuiCommandPaletteContribution["provenance"]["trust"]
}): TuiCommandPaletteContribution {
  return {
    id: options.id,
    domain: "command_palette",
    value: {
      commandId: `app.${options.id}`,
      title: options.title,
      handlerRef: `handler.${options.id}`
    },
    provenance: {
      source: {
        kind: options.sourceKind,
        scope: options.sourceKind === "builtin" ? "builtin" : "user",
        id: options.sourceId ?? options.sourceKind
      },
      trust: options.trust ?? "trusted"
    },
    conflictPolicy: options.conflictPolicy ?? "replace",
    ...(options.priority === undefined ? {} : { priority: options.priority }),
    ...(options.order === undefined ? {} : { order: options.order }),
    ...(options.metadata === undefined ? {} : { metadata: options.metadata })
  }
}

function keybinding(options: {
  id: string
  key: string
  order?: number
  conflictPolicy?: TuiKeybindingContribution["conflictPolicy"]
}): TuiKeybindingContribution {
  return {
    id: options.id,
    domain: "keybinding",
    value: {
      key: options.key,
      commandId: "app.run"
    },
    provenance: {
      source: {
        kind: "global_config",
        scope: "global",
        id: "global-config"
      },
      trust: "user_enabled"
    },
    conflictPolicy: options.conflictPolicy ?? "replace",
    ...(options.order === undefined ? {} : { order: options.order })
  }
}

function panel(options: {
  id: string
  sourceKind: TuiContributionSourceKind
  trust: TuiPanelContribution["provenance"]["trust"]
  privileged: boolean
}): TuiPanelContribution {
  return {
    id: options.id,
    domain: "panel",
    value: {
      panelId: options.id,
      title: "Secrets",
      placement: "right",
      componentRef: "panel.secrets"
    },
    provenance: {
      source: {
        kind: options.sourceKind,
        scope: "project",
        id: "project-config"
      },
      trust: options.trust
    },
    privileged: options.privileged
  }
}

function theme(options: {
  id: string
  colors: Readonly<Record<string, string>>
  sourceKind?: TuiContributionSourceKind
  displayName?: string
  conflictPolicy?: TuiThemeContribution["conflictPolicy"]
  metadata?: TuiThemeContribution["metadata"]
}): TuiThemeContribution {
  return {
    id: options.id,
    domain: "theme",
    value: {
      themeId: options.id,
      displayName: options.displayName ?? "Default Theme",
      colors: options.colors
    },
    provenance: {
      source: {
        kind: options.sourceKind ?? "builtin",
        scope: options.sourceKind === "runtime_override" ? "runtime" : "builtin",
        id: options.sourceKind ?? "builtin"
      },
      trust: "trusted"
    },
    conflictPolicy: options.conflictPolicy ?? "replace",
    ...(options.metadata === undefined ? {} : { metadata: options.metadata })
  }
}
