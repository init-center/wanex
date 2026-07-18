import { describe, expect, it } from "vitest"
import {
  resolveAppExtensionContributions,
  type AppCommandContribution
} from "@wanex/extension"
import {
  resolveTuiContributions,
  type TuiCommandPaletteContribution,
  type TuiKeybindingContribution,
  type TuiStatusItemContribution
} from "../../src/tui/surface/index.js"
import { buildTuiShellReadModel } from "../../src/tui/shell-core/index.js"
import {
  createTuiShellController,
  type TuiShellCommandInvocation,
  type TuiShellEvent
} from "../../src/tui/shell/index.js"

describe("@wanex/product-app-tui/shell", () => {
  it("executes a palette command through an injected product command port", async () => {
    const calls: TuiShellCommandInvocation[] = []
    const events: TuiShellEvent[] = []
    const controller = createTuiShellController({
      readModel: readModel({
        appCommands: [
          appCommand({
            id: "agent.run",
            title: "Run Agent"
          })
        ],
        tui: [
          palette({
            id: "palette.agent.run",
            commandId: "agent.run",
            title: "Run"
          })
        ]
      }),
      executeCommand: (invocation) => {
        calls.push(invocation)
        return {
          accepted: true
        }
      },
      emit: (event) => {
        events.push(event)
      }
    })

    const result = await controller.executePaletteEntry({
      id: "palette.agent.run",
      input: {
        text: "hello"
      }
    })

    expect(result).toMatchObject({
      status: "completed",
      value: {
        accepted: true
      },
      invocation: {
        commandId: "agent.run",
        handlerRef: "handler.agent.run",
        source: {
          kind: "palette",
          contributionId: "palette.agent.run"
        },
        input: {
          text: "hello"
        }
      }
    })
    expect(calls).toHaveLength(1)
    expect(controller.state()).toMatchObject({
      selectedPaletteIndex: 0,
      selectedPaletteEntryId: "palette.agent.run",
      lastCommandId: "agent.run",
      diagnosticCount: 0
    })
    expect(events.map((event) => event.kind)).toEqual([
      "command_started",
      "command_completed"
    ])
  })

  it("rejects dangling command references without calling the product executor", async () => {
    const calls: TuiShellCommandInvocation[] = []
    const controller = createTuiShellController({
      readModel: readModel({
        appCommands: [],
        tui: [
          palette({
            id: "palette.missing",
            commandId: "missing.command",
            title: "Missing"
          })
        ]
      }),
      executeCommand: (invocation) => {
        calls.push(invocation)
      }
    })

    const result = await controller.executePaletteEntry({
      id: "palette.missing"
    })

    expect(result).toMatchObject({
      status: "rejected",
      reason: "command_not_runnable",
      source: {
        kind: "palette",
        contributionId: "palette.missing"
      },
      command: {
        commandId: "missing.command"
      }
    })
    expect(calls).toEqual([])
  })

  it("dispatches platform-aware keybindings and product-owned when guards", async () => {
    const calls: TuiShellCommandInvocation[] = []
    const controller = createTuiShellController({
      readModel: readModel({
        appCommands: [
          appCommand({
            id: "agent.run",
            title: "Run Agent"
          })
        ],
        tui: [
          keybinding({
            id: "key.agent.run.macos",
            commandId: "agent.run",
            key: "ctrl+r",
            platform: "macos",
            when: "agentReady"
          })
        ]
      }),
      evaluateWhen: ({ expression, context }) =>
        expression === "agentReady" && context.agentReady === true,
      executeCommand: (invocation) => {
        calls.push(invocation)
      }
    })

    await expect(
      controller.executeKeybinding({
        key: "ctrl+r",
        platform: "windows",
        context: {
          agentReady: true
        }
      })
    ).resolves.toMatchObject({
      status: "rejected",
      reason: "keybinding_not_found"
    })
    await expect(
      controller.executeKeybinding({
        key: "ctrl+r",
        platform: "macos",
        context: {
          agentReady: false
        }
      })
    ).resolves.toMatchObject({
      status: "rejected",
      reason: "keybinding_not_found"
    })
    await expect(
      controller.executeKeybinding({
        key: "ctrl+r",
        platform: "macos",
        context: {
          agentReady: true
        }
      })
    ).resolves.toMatchObject({
      status: "completed",
      invocation: {
        commandId: "agent.run",
        source: {
          kind: "keybinding",
          contributionId: "key.agent.run.macos",
          key: "ctrl+r"
        }
      }
    })
    expect(calls).toHaveLength(1)
  })

  it("keeps selection state deterministic across read-model replacement", () => {
    const events: TuiShellEvent[] = []
    const controller = createTuiShellController({
      readModel: readModel({
        appCommands: [
          appCommand({
            id: "first",
            title: "First"
          }),
          appCommand({
            id: "second",
            title: "Second"
          })
        ],
        tui: [
          palette({
            id: "palette.first",
            commandId: "first",
            title: "First"
          }),
          palette({
            id: "palette.second",
            commandId: "second",
            title: "Second"
          })
        ]
      }),
      executeCommand: () => undefined,
      emit: (event) => {
        events.push(event)
      }
    })

    expect(controller.movePaletteSelection(1)).toMatchObject({
      selectedPaletteIndex: 1,
      selectedPaletteEntryId: "palette.second"
    })
    expect(
      controller.replaceReadModel(
        readModel({
          appCommands: [
            appCommand({
              id: "only",
              title: "Only"
            })
          ],
          tui: [
            palette({
              id: "palette.only",
              commandId: "only",
              title: "Only"
            })
          ]
        })
      )
    ).toMatchObject({
      selectedPaletteIndex: 0,
      selectedPaletteEntryId: "palette.only"
    })
    expect(events.map((event) => event.kind)).toEqual([
      "selection_changed",
      "read_model_replaced",
      "selection_changed"
    ])
  })

  it("rejects optional controls that have no command instead of inventing behavior", async () => {
    const controller = createTuiShellController({
      readModel: readModel({
        appCommands: [],
        tui: [
          status({
            id: "status.readonly"
          })
        ]
      }),
      executeCommand: () => {
        throw new Error("must not execute")
      }
    })

    await expect(
      controller.executeStatusItem({
        id: "status.readonly"
      })
    ).resolves.toMatchObject({
      status: "rejected",
      reason: "command_not_found"
    })
  })
})

function readModel(options: {
  appCommands: readonly AppCommandContribution[]
  tui: readonly (
    | TuiCommandPaletteContribution
    | TuiKeybindingContribution
    | TuiStatusItemContribution
  )[]
}) {
  return buildTuiShellReadModel({
    app: resolveAppExtensionContributions(options.appCommands),
    tui: resolveTuiContributions(options.tui)
  })
}

function appCommand(options: {
  id: string
  title: string
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
      source: {
        kind: "builtin",
        scope: "builtin",
        id: "builtin"
      },
      trust: "trusted"
    }
  }
}

function palette(options: {
  id: string
  commandId: string
  title: string
}): TuiCommandPaletteContribution {
  return {
    id: options.id,
    domain: "command_palette",
    value: {
      commandId: options.commandId,
      title: options.title
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

function keybinding(options: {
  id: string
  commandId: string
  key: string
  platform?: TuiKeybindingContribution["value"]["platform"]
  when?: string
}): TuiKeybindingContribution {
  return {
    id: options.id,
    domain: "keybinding",
    value: {
      commandId: options.commandId,
      key: options.key,
      ...(options.platform === undefined ? {} : { platform: options.platform }),
      ...(options.when === undefined ? {} : { when: options.when })
    },
    provenance: {
      source: {
        kind: "project_config",
        scope: "project",
        id: "project"
      },
      trust: "user_enabled"
    }
  }
}

function status(options: {
  id: string
  commandId?: string
}): TuiStatusItemContribution {
  return {
    id: options.id,
    domain: "status_item",
    value: {
      itemId: options.id,
      label: options.id,
      alignment: "left",
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
