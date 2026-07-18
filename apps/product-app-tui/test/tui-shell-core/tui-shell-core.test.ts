import { describe, expect, it } from "vitest"
import {
  resolveAppExtensionContributions,
  type AppCommandContribution
} from "@wanex/extension"
import {
  resolveTuiContributions,
  type TuiCommandPaletteContribution,
  type TuiKeybindingContribution,
  type TuiNotificationContribution,
  type TuiPanelContribution,
  type TuiStatusItemContribution,
  type TuiThemeContribution
} from "../../src/tui/surface/index.js"
import { buildTuiShellReadModel } from "../../src/tui/shell-core/index.js"

describe("@wanex/product-app-tui/shell-core", () => {
  it("composes app commands with TUI palette and keybinding read models", () => {
    const app = resolveAppExtensionContributions([
      appCommand({
        id: "agent.run",
        title: "Run Agent",
        description: "Start a run",
        category: "Agent"
      })
    ])
    const tui = resolveTuiContributions([
      palette({
        id: "palette.agent.run",
        commandId: "agent.run",
        title: "Run Agent From Palette",
        aliases: ["run"]
      }),
      keybinding({
        id: "key.agent.run",
        commandId: "agent.run",
        key: "ctrl+r"
      })
    ])

    const model = buildTuiShellReadModel({ app, tui })

    expect(model.palette).toEqual([
      expect.objectContaining({
        id: "palette.agent.run",
        title: "Run Agent From Palette",
        aliases: ["run"],
        command: expect.objectContaining({
          commandId: "agent.run",
          title: "Run Agent",
          handlerRef: "handler.agent.run"
        })
      })
    ])
    expect(model.keybindings).toEqual([
      expect.objectContaining({
        id: "key.agent.run",
        key: "ctrl+r",
        command: expect.objectContaining({
          commandId: "agent.run"
        })
      })
    ])
    expect(model.diagnostics).toEqual([])
  })

  it("reports dangling command references without executing anything", () => {
    const app = resolveAppExtensionContributions([])
    const tui = resolveTuiContributions([
      palette({
        id: "palette.missing",
        commandId: "missing.command",
        title: "Missing"
      }),
      status({
        id: "status.missing",
        commandId: "missing.status"
      })
    ])

    const model = buildTuiShellReadModel({ app, tui })

    expect(model.palette[0]?.command).toEqual({
      commandId: "missing.command"
    })
    expect(model.statusItems[0]?.command).toEqual({
      commandId: "missing.status"
    })
    expect(model.diagnostics).toEqual([
      expect.objectContaining({
        code: "tui-shell.dangling_command",
        contributionId: "palette.missing",
        commandId: "missing.command"
      }),
      expect.objectContaining({
        code: "tui-shell.dangling_command",
        contributionId: "status.missing",
        commandId: "missing.status"
      })
    ])
  })

  it("projects panels, status items, prompt-free themes, and notifications deterministically", () => {
    const app = resolveAppExtensionContributions([
      appCommand({
        id: "diagnostics.open",
        title: "Open Diagnostics"
      })
    ])
    const tui = resolveTuiContributions([
      status({
        id: "status.right",
        alignment: "right",
        priority: 10
      }),
      status({
        id: "status.left",
        alignment: "left",
        priority: 5,
        commandId: "diagnostics.open"
      }),
      panel(),
      theme(),
      notification({
        commandId: "diagnostics.open"
      })
    ])

    const model = buildTuiShellReadModel({ app, tui })

    expect(model.panels).toEqual([
      expect.objectContaining({
        panelId: "diagnostics",
        placement: "right",
        componentRef: "panel.diagnostics"
      })
    ])
    expect(model.statusItems.map((item) => item.id)).toEqual([
      "status.left",
      "status.right"
    ])
    expect(model.statusItems[0]?.command?.handlerRef).toBe(
      "handler.diagnostics.open"
    )
    expect(model.themes).toEqual([
      expect.objectContaining({
        themeId: "default",
        colors: {
          foreground: "#ffffff"
        }
      })
    ])
    expect(model.notifications[0]?.command?.commandId).toBe("diagnostics.open")
  })

  it("can include source diagnostics from resolved app and TUI snapshots", () => {
    const app = resolveAppExtensionContributions([
      appCommand({
        id: "blocked.app",
        title: "Blocked",
        trust: "blocked"
      })
    ])
    const tui = resolveTuiContributions([
      palette({
        id: "blocked.tui",
        commandId: "blocked.app",
        title: "Blocked",
        trust: "blocked"
      })
    ])

    const model = buildTuiShellReadModel({
      app,
      tui,
      includeSourceDiagnostics: true
    })

    expect(model.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "tui-shell.app_diagnostic",
      "tui-shell.tui_diagnostic"
    ])
  })
})

function appCommand(options: {
  id: string
  title: string
  description?: string
  category?: string
  trust?: AppCommandContribution["provenance"]["trust"]
}): AppCommandContribution {
  return {
    id: options.id,
    domain: "command",
    value: {
      name: options.id,
      title: options.title,
      handlerRef: `handler.${options.id}`,
      ...(options.description === undefined
        ? {}
        : { description: options.description }),
      ...(options.category === undefined ? {} : { category: options.category })
    },
    provenance: {
      source: {
        kind: "builtin",
        scope: "builtin",
        id: "builtin"
      },
      trust: options.trust ?? "trusted"
    }
  }
}

function palette(options: {
  id: string
  commandId: string
  title: string
  aliases?: readonly string[]
  trust?: TuiCommandPaletteContribution["provenance"]["trust"]
}): TuiCommandPaletteContribution {
  return {
    id: options.id,
    domain: "command_palette",
    value: {
      commandId: options.commandId,
      title: options.title,
      ...(options.aliases === undefined ? {} : { aliases: options.aliases })
    },
    provenance: {
      source: {
        kind: "builtin",
        scope: "builtin",
        id: "builtin"
      },
      trust: options.trust ?? "trusted"
    }
  }
}

function keybinding(options: {
  id: string
  commandId: string
  key: string
}): TuiKeybindingContribution {
  return {
    id: options.id,
    domain: "keybinding",
    value: {
      key: options.key,
      commandId: options.commandId
    },
    provenance: {
      source: {
        kind: "global_config",
        scope: "global",
        id: "global"
      },
      trust: "user_enabled"
    }
  }
}

function panel(): TuiPanelContribution {
  return {
    id: "panel.diagnostics",
    domain: "panel",
    value: {
      panelId: "diagnostics",
      title: "Diagnostics",
      placement: "right",
      componentRef: "panel.diagnostics"
    },
    provenance: {
      source: {
        kind: "builtin",
        scope: "builtin",
        id: "builtin"
      },
      trust: "trusted"
    }
  }
}

function status(options: {
  id: string
  alignment?: "left" | "right"
  priority?: number
  commandId?: string
}): TuiStatusItemContribution {
  return {
    id: options.id,
    domain: "status_item",
    value: {
      itemId: options.id,
      label: options.id,
      alignment: options.alignment ?? "left",
      ...(options.priority === undefined ? {} : { priority: options.priority }),
      ...(options.commandId === undefined ? {} : { commandId: options.commandId })
    },
    provenance: {
      source: {
        kind: "builtin",
        scope: "builtin",
        id: "builtin"
      },
      trust: "trusted"
    }
  }
}

function theme(): TuiThemeContribution {
  return {
    id: "theme.default",
    domain: "theme",
    value: {
      themeId: "default",
      displayName: "Default",
      colors: {
        foreground: "#ffffff"
      }
    },
    provenance: {
      source: {
        kind: "builtin",
        scope: "builtin",
        id: "builtin"
      },
      trust: "trusted"
    }
  }
}

function notification(options: {
  commandId?: string
}): TuiNotificationContribution {
  return {
    id: "notification.diagnostics",
    domain: "notification",
    value: {
      notificationId: "diagnostics",
      level: "info",
      title: "Diagnostics ready",
      ...(options.commandId === undefined ? {} : { commandId: options.commandId })
    },
    provenance: {
      source: {
        kind: "builtin",
        scope: "builtin",
        id: "builtin"
      },
      trust: "trusted"
    }
  }
}
