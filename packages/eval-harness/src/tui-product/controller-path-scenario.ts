import { resolveAppExtensionContributions } from "@wanex/extension"
import { createTuiShellController } from "@wanex/product-app-tui/shell"
import { buildTuiShellReadModel } from "@wanex/product-app-tui/shell-core"
import { resolveTuiContributions } from "@wanex/product-app-tui/contributions"
import { createEvalScenario } from "../runner.js"
import { assert } from "../scenario-utils.js"
import {
  commandContribution,
  keybindingContribution,
  paletteContribution,
  statusContribution
} from "./helpers.js"

export const tuiProductControllerPathScenario = createEvalScenario({
  id: "tui.product-controller-path",
  title: "TUI shell dispatches resolved controls through a product command port",
  tags: ["tui", "extension", "product-path"],
  async run() {
    const app = resolveAppExtensionContributions([
      commandContribution({
        id: "agent.run",
        title: "Run Agent",
        handlerRef: "product.command.agent.run"
      }),
      commandContribution({
        id: "diagnostics.open",
        title: "Open Diagnostics",
        handlerRef: "product.command.diagnostics.open"
      }),
      commandContribution({
        id: "blocked.command",
        title: "Blocked Command",
        handlerRef: "product.command.blocked",
        trust: "blocked"
      })
    ])
    const tui = resolveTuiContributions([
      paletteContribution({
        id: "palette.agent.run",
        commandId: "agent.run",
        title: "Run Agent"
      }),
      keybindingContribution({
        id: "key.agent.run",
        commandId: "agent.run",
        key: "ctrl+r",
        platform: "macos",
        when: "agentReady"
      }),
      statusContribution({
        id: "status.diagnostics",
        commandId: "diagnostics.open"
      }),
      paletteContribution({
        id: "palette.missing",
        commandId: "missing.command",
        title: "Missing Command"
      })
    ])
    const readModel = buildTuiShellReadModel({
      app,
      tui,
      includeSourceDiagnostics: true
    })

    assert(
      readModel.palette.length === 2,
      "TUI read model should include runnable and dangling palette entries"
    )
    assert(
      readModel.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "tui-shell.app_diagnostic" &&
          diagnostic.contributionId === "blocked.command"
      ),
      "source diagnostics should include blocked app contribution"
    )
    assert(
      readModel.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "tui-shell.dangling_command" &&
          diagnostic.commandId === "missing.command"
      ),
      "read model should diagnose dangling TUI command references"
    )

    const invocations: string[] = []
    const controller = createTuiShellController({
      readModel,
      evaluateWhen: ({ expression, context }) =>
        expression === "agentReady" && context.agentReady === true,
      executeCommand: (invocation) => {
        invocations.push(
          `${invocation.source.kind}:${invocation.commandId}:${invocation.handlerRef}`
        )
        return {
          accepted: true,
          commandId: invocation.commandId
        }
      }
    })

    const palette = await controller.executePaletteEntry({
      id: "palette.agent.run"
    })
    const keybindingBlocked = await controller.executeKeybinding({
      key: "ctrl+r",
      platform: "macos",
      context: {
        agentReady: false
      }
    })
    const keybinding = await controller.executeKeybinding({
      key: "ctrl+r",
      platform: "macos",
      context: {
        agentReady: true
      }
    })
    const status = await controller.executeStatusItem({
      id: "status.diagnostics"
    })
    const missing = await controller.executePaletteEntry({
      id: "palette.missing"
    })

    assert(palette.status === "completed", "palette command should complete")
    assert(
      keybindingBlocked.status === "rejected" &&
        keybindingBlocked.reason === "keybinding_not_found",
      "disabled keybinding should fail closed before executor"
    )
    assert(
      keybinding.status === "completed",
      "enabled keybinding command should complete"
    )
    assert(status.status === "completed", "status command should complete")
    assert(
      missing.status === "rejected" &&
        missing.reason === "command_not_runnable",
      "dangling command ref should fail closed"
    )
    assert(
      invocations.length === 3,
      "product command executor should only receive runnable controls"
    )

    return {
      paletteStatus: palette.status,
      keybindingBlockedStatus: keybindingBlocked.status,
      keybindingStatus: keybinding.status,
      statusItemStatus: status.status,
      missingReason: missing.reason,
      invocationCount: invocations.length,
      invocations,
      diagnosticCodes: readModel.diagnostics.map(
        (diagnostic) => diagnostic.code
      ),
      closure: [
        "@wanex/extension",
        "@wanex/product-app-tui/contributions",
        "@wanex/product-app-tui/shell-core",
        "@wanex/product-app-tui/shell"
      ]
    }
  }
})
