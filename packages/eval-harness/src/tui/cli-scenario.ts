import { rm } from "node:fs/promises"
import { main as runTuiCli } from "@wanex/tui"
import {
  entryByName,
  runJsonAudit,
  type FootprintReport
} from "../distribution-audit.js"
import { createEvalScenario } from "../runner.js"
import { assert } from "../scenario-utils.js"
import { mktemp } from "../assistant-bootstrap/helpers.js"
import { lines, parseOkJsonValue } from "./helpers.js"

export const tuiCliScenario = createEvalScenario({
  id: "assistant.app-tui-cli-contract",
  title: "TUI CLI owns Assistant Host lifecycle for the TUI surface",
  tags: ["assistant", "tui", "cli", "upper-app", "assistant-path"],
  async run(context) {
    const storeDir = await mktemp("wanex-eval-tui-cli-")
    try {
      const env = {
        WANEX_STORE_DIR: storeDir,
        WANEX_SYSTEM_SERVICE_BIN: context.serviceBin,
        WANEX_MODEL_ENDPOINT_ID: "eval-tui-cli",
        WANEX_PROVIDER_PROTOCOL: "fake",
        WANEX_PROVIDER_ID: "fake",
        WANEX_PROVIDER_MODEL_ID: "eval-tui-cli-model"
      }
      const overviewText = await runTuiCli(["overview"], env)
      const overviewJson = await runTuiCli(["overview", "--json"], env)
      const commandCatalogText = await runTuiCli(["commands"], env)
      const commandCatalogJson = await runTuiCli(
        ["commands", "--json"],
        env
      )
      const preview = await runTuiCli(
        ["preview", "assistant.agent.submit", "{\"text\":\"eval application tui cli preview\"}"],
        env
      )
      const chunks: string[] = []
      const interactive = await runTuiCli(
        ["interactive"],
        env,
        {
          input: lines([
            "ask eval TUI CLI",
            "events 6",
            "quit"
          ]),
          write(chunk) {
            chunks.push(chunk)
          }
        }
      )
      const eventText = await runTuiCli(["events"], env)
      const output = chunks.join("")
      const overviewValue = parseOkJsonValue<{
        readonly kind: string
        readonly ready: boolean
        readonly statusCount: number
      }>(overviewJson.stdout)
      const commandCatalogValue = parseOkJsonValue<{
        readonly kind: string
        readonly ok: boolean
        readonly commandCount: number
        readonly commands: readonly { readonly id: string }[]
      }>(commandCatalogJson.stdout)
      const previewValue = parseOkJsonValue<{
        readonly ok: boolean
        readonly command: string
        readonly value?: {
          readonly kind?: string
          readonly commandId?: string
        }
      }>(preview.stdout)
      const footprint = await runJsonAudit<FootprintReport>(
        "audit-distribution-footprint.mjs",
        ["--json"]
      )
      const assistantPackage = entryByName(footprint, "@wanex/assistant")
      const tui = entryByName(footprint, "@wanex/tui")

      assert(
        overviewText.exitCode === 0 &&
          overviewText.stderr.length === 0 &&
          overviewText.stdout.includes("Workbench") &&
          overviewText.stdout.includes("mode:chat"),
        "TUI CLI overview should render text"
      )
      assert(
        overviewValue.kind === "tui.frame" &&
          overviewValue.ready &&
          overviewValue.statusCount === 8,
        "TUI CLI overview JSON should expose the rendered frame"
      )
      assert(
        commandCatalogText.exitCode === 0 &&
          commandCatalogText.stdout.includes("Commands") &&
          commandCatalogText.stdout.includes("assistant.agent.submit - Submit Agent Turn") &&
          commandCatalogValue.kind === "tui.command-catalog" &&
          commandCatalogValue.ok &&
          commandCatalogValue.commandCount === 14 &&
          commandCatalogValue.commands.some(
            (command) => command.id === "assistant.agent.submit"
          ),
        "TUI CLI commands should render the typed command catalog"
      )
      assert(
        preview.exitCode === 0 &&
          previewValue.ok &&
          previewValue.command === "previewAssistantCommandInvocation" &&
          previewValue.value?.kind === "runnable" &&
          previewValue.value.commandId === "assistant.agent.submit",
        "TUI CLI preview command should read command invocation policy without execution"
      )
      assert(
        interactive.exitCode === 0 &&
          interactive.stderr.length === 0 &&
          output.includes("Conversation") &&
          output.includes("Events") &&
          output.includes("bye"),
        "TUI CLI interactive command should run through injected IO"
      )
      assert(
        eventText.exitCode === 0 &&
          eventText.stdout.includes("Events"),
        "TUI CLI events command should render a surface events view"
      )
      assert(
        !assistantPackage.contains.pluginRuntime &&
          !assistantPackage.contains.connectorRuntime &&
          assistantPackage.contains.concreteAdapters.length === 0 &&
          assistantPackage.contains.forbiddenPackages.length === 0,
        "assistant default closure should stay slim with TUI CLI host present"
      )
      assert(
        !tui.contains.pluginRuntime &&
          !tui.contains.connectorRuntime &&
          tui.contains.concreteAdapters.length === 0 &&
          tui.contains.forbiddenPackages.length === 0,
        "TUI CLI closure should stay free of plugin/connector runtime"
      )

      return {
        overviewRendered: overviewText.stdout.includes("Workbench"),
        overviewKind: overviewValue.kind,
        overviewReady: overviewValue.ready,
        commandCatalogCount: commandCatalogValue.commandCount,
        commandCatalogHasSubmit: commandCatalogValue.commands.some(
          (command) => command.id === "assistant.agent.submit"
        ),
        previewCommand: previewValue.command,
        previewKind: previewValue.value?.kind,
        previewCommandId: previewValue.value?.commandId,
        interactiveExitCode: interactive.exitCode,
        interactiveRenderedConversation: output.includes(
          "Conversation"
        ),
        interactiveRenderedEvents: output.includes(
          "Events"
        ),
        eventsRendered: eventText.stdout.includes(
          "Events"
        ),
        pluginRuntime: assistantPackage.contains.pluginRuntime,
        tuiPluginRuntime: tui.contains.pluginRuntime,
        tuiConnectorRuntime: tui.contains.connectorRuntime
      }
    } finally {
      await rm(storeDir, { recursive: true, force: true })
    }
  }
})
