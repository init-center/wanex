import { rm } from "node:fs/promises"
import {
  PRODUCT_APP_TUI_COMMANDS,
  main as runProductAppTuiCli
} from "@wanex/product-app-tui"
import {
  entryByName,
  runJsonAudit,
  type FootprintReport
} from "../distribution-audit.js"
import { createEvalScenario } from "../runner.js"
import { assert } from "../scenario-utils.js"
import { mktemp } from "../product-bootstrap/helpers.js"
import { lines, parseOkJsonValue } from "./helpers.js"

export const productAppTuiCliScenario = createEvalScenario({
  id: "product.app-tui-cli-contract",
  title: "Product App TUI CLI owns local host lifecycle for the TUI surface",
  tags: ["product-app", "tui", "cli", "upper-app", "product-path"],
  async run(context) {
    const storeDir = await mktemp("wanex-eval-product-app-tui-cli-")
    try {
      const env = {
        WANEX_STORE_DIR: storeDir,
        WANEX_SYSTEM_SERVICE_BIN: context.serviceBin,
        WANEX_PROVIDER_PROFILE_ID: "eval-product-app-tui-cli",
        WANEX_PROVIDER_MODEL_ID: "eval-product-app-tui-cli-model"
      }
      const overviewText = await runProductAppTuiCli(["overview"], env)
      const overviewJson = await runProductAppTuiCli(["overview", "--json"], env)
      const commandCatalogText = await runProductAppTuiCli(["commands"], env)
      const commandCatalogJson = await runProductAppTuiCli(
        ["commands", "--json"],
        env
      )
      const palette = await runProductAppTuiCli(
        ["palette", "product-app.status"],
        env
      )
      const preview = await runProductAppTuiCli(
        ["preview", "product.agent.submit", "{\"text\":\"eval product app tui cli preview\"}"],
        env
      )
      const chunks: string[] = []
      const interactive = await runProductAppTuiCli(
        ["interactive"],
        env,
        {
          input: lines([
            "ask eval Product App TUI CLI",
            "events 6",
            "quit"
          ]),
          write(chunk) {
            chunks.push(chunk)
          }
        }
      )
      const eventText = await runProductAppTuiCli(["events"], env)
      const output = chunks.join("")
      const overviewValue = parseOkJsonValue<{
        readonly kind: string
        readonly ready: boolean
        readonly paletteCount: number
      }>(overviewJson.stdout)
      const commandCatalogValue = parseOkJsonValue<{
        readonly kind: string
        readonly ok: boolean
        readonly commandCount: number
        readonly commands: readonly { readonly id: string }[]
      }>(commandCatalogJson.stdout)
      const paletteValue = parseOkJsonValue<{
        readonly status: string
        readonly value?: {
          readonly kind?: string
          readonly commandId?: string
        }
      }>(palette.stdout)
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
      const productApp = entryByName(footprint, "@wanex/product-app")
      const productAppTui = entryByName(footprint, "@wanex/product-app-tui")

      assert(
        overviewText.exitCode === 0 &&
          overviewText.stderr.length === 0 &&
          overviewText.stdout.includes("Wanex Product App TUI") &&
          overviewText.stdout.includes("mode:chat"),
        "Product App TUI CLI overview should render text"
      )
      assert(
        overviewValue.kind === "product-app-tui.frame" &&
          overviewValue.ready &&
          overviewValue.paletteCount === 9,
        "Product App TUI CLI overview JSON should expose the rendered frame"
      )
      assert(
        commandCatalogText.exitCode === 0 &&
          commandCatalogText.stdout.includes("Wanex Product App Commands") &&
          commandCatalogText.stdout.includes("product.agent.submit - Submit Agent Turn") &&
          commandCatalogValue.kind === "product-app-tui.command-catalog" &&
          commandCatalogValue.ok &&
          commandCatalogValue.commandCount === 14 &&
          commandCatalogValue.commands.some(
            (command) => command.id === "product.agent.submit"
          ),
        "Product App TUI CLI commands should render the typed command catalog"
      )
      assert(
        palette.exitCode === 0 &&
          paletteValue.status === "completed" &&
          paletteValue.value?.kind === "product-app-tui.command.completed" &&
          paletteValue.value.commandId === PRODUCT_APP_TUI_COMMANDS.status,
        "Product App TUI CLI palette command should dispatch through TUI controller"
      )
      assert(
        preview.exitCode === 0 &&
          previewValue.ok &&
          previewValue.command === "previewProductCommandInvocation" &&
          previewValue.value?.kind === "runnable" &&
          previewValue.value.commandId === "product.agent.submit",
        "Product App TUI CLI preview command should read command invocation policy without execution"
      )
      assert(
        interactive.exitCode === 0 &&
          interactive.stderr.length === 0 &&
          output.includes("Wanex Product App Conversation") &&
          output.includes("Wanex Product App Surface Events") &&
          output.includes("bye"),
        "Product App TUI CLI interactive command should run through injected IO"
      )
      assert(
        eventText.exitCode === 0 &&
          eventText.stdout.includes("Wanex Product App Surface Events"),
        "Product App TUI CLI events command should render a surface events view"
      )
      assert(
        !productApp.contains.pluginRuntime &&
          !productApp.contains.connectorRuntime &&
          productApp.contains.concreteAdapters.length === 0 &&
          productApp.contains.forbiddenPackages.length === 0,
        "Product App default closure should stay slim with TUI CLI host present"
      )
      assert(
        !productAppTui.contains.pluginRuntime &&
          !productAppTui.contains.connectorRuntime &&
          productAppTui.contains.concreteAdapters.length === 0 &&
          productAppTui.contains.forbiddenPackages.length === 0,
        "Product App TUI CLI closure should stay free of plugin/connector runtime"
      )

      return {
        overviewRendered: overviewText.stdout.includes("Wanex Product App TUI"),
        overviewKind: overviewValue.kind,
        overviewReady: overviewValue.ready,
        commandCatalogCount: commandCatalogValue.commandCount,
        commandCatalogHasSubmit: commandCatalogValue.commands.some(
          (command) => command.id === "product.agent.submit"
        ),
        paletteStatus: paletteValue.status,
        paletteCommandKind: paletteValue.value?.kind,
        paletteCommandId: paletteValue.value?.commandId,
        previewCommand: previewValue.command,
        previewKind: previewValue.value?.kind,
        previewCommandId: previewValue.value?.commandId,
        interactiveExitCode: interactive.exitCode,
        interactiveRenderedConversation: output.includes(
          "Wanex Product App Conversation"
        ),
        interactiveRenderedEvents: output.includes(
          "Wanex Product App Surface Events"
        ),
        eventsRendered: eventText.stdout.includes(
          "Wanex Product App Surface Events"
        ),
        productAppPluginRuntime: productApp.contains.pluginRuntime,
        productAppTuiPluginRuntime: productAppTui.contains.pluginRuntime,
        productAppTuiConnectorRuntime: productAppTui.contains.connectorRuntime
      }
    } finally {
      await rm(storeDir, { recursive: true, force: true })
    }
  }
})
