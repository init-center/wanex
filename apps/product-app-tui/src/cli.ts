import {
  createProductAppShell,
  createProductAppSurfaceAdapter,
  type ProductAppSurfaceAdapter
} from "@wanex/product-app"
import { productAppTuiCliAppOptions } from "./cli-app-options.js"
import { parseProductAppTuiCliCommand } from "./cli-command-parser.js"
import { runProductAppTuiCliCommand } from "./cli-command-dispatch.js"
import { fail, okEmpty, okJson, okRenderedText } from "./cli-result.js"
import { renderProductAppTuiCommandCatalog } from "./command-catalog-presenter.js"
import { renderProductAppTuiEvents } from "./events-presenter.js"
import { renderProductAppTuiExecutionActivity } from "./execution-activity-presenter.js"
import { createProductAppTuiHostSurfaceClient } from "./host-surface-client.js"
import { createProductAppTuiAttachmentHost } from "./attachment-host.js"
import { renderProductAppTuiFrame } from "./presenter.js"
import { createProductAppTuiSurface } from "./surface.js"
import type {
  ProductAppTuiCliEnvironment,
  ProductAppTuiCliIo,
  ProductAppTuiCliResult
} from "./cli-types.js"

export type {
  ProductAppTuiCliCommand,
  ProductAppTuiCliEnvironment,
  ProductAppTuiCliIo,
  ProductAppTuiCliResult
} from "./cli-types.js"
export { parseProductAppTuiCliCommand } from "./cli-command-parser.js"
export { productAppTuiCliAppOptions } from "./cli-app-options.js"

export async function main(
  argv: readonly string[],
  env: ProductAppTuiCliEnvironment = process.env,
  io?: ProductAppTuiCliIo
): Promise<ProductAppTuiCliResult> {
  try {
    const command = parseProductAppTuiCliCommand(argv)
    const app = await createProductAppShell(productAppTuiCliAppOptions(env))
    let adapter: ProductAppSurfaceAdapter | undefined
    try {
      adapter = createProductAppSurfaceAdapter(app)
      const client = createProductAppTuiHostSurfaceClient({ surface: adapter })
      const surface = await createProductAppTuiSurface({ client })
      const attachmentHost = createProductAppTuiAttachmentHost(app)
      switch (command.name) {
        case "overview": {
          const value = renderProductAppTuiFrame(surface.snapshot())
          return command.output === "text"
            ? okRenderedText(value)
            : okJson(value)
        }
        case "events": {
          const value = renderProductAppTuiEvents({
            result: await client.readSurfaceEvents(
              command.limit === undefined ? undefined : { limit: command.limit }
            ),
            ...(command.limit === undefined ? {} : { limit: command.limit })
          })
          return command.output === "text"
            ? okRenderedText(value)
            : okJson(value)
        }
        case "commands": {
          const value = renderProductAppTuiCommandCatalog(
            surface.snapshot().commandCatalog
          )
          return command.output === "text"
            ? okRenderedText(value)
            : okJson(value)
        }
        case "palette": {
          const value = await runProductAppTuiCliCommand(command, surface, io)
          return okJson(value)
        }
        case "preview": {
          const value = await runProductAppTuiCliCommand(command, surface, io)
          return okJson(value)
        }
        case "execute": {
          const result = await runProductAppTuiCliCommand(command, surface, io)
          if (
            typeof result !== "object" ||
            result === null ||
            !("ok" in result) ||
            result.ok !== true ||
            !("value" in result)
          ) {
            return okJson(result)
          }
          return okJson(result.value)
        }
        case "execution": {
          const result = await runProductAppTuiCliCommand(command, surface, io)
          if (
            typeof result !== "object" ||
            result === null ||
            !("ok" in result) ||
            result.ok !== true ||
            !("value" in result)
          ) {
            return okJson(result)
          }
          return okRenderedText(
            renderProductAppTuiExecutionActivity(
              result.value as Parameters<typeof renderProductAppTuiExecutionActivity>[0]
            )
          )
        }
        case "interactive":
          await runProductAppTuiCliCommand(
            command,
            surface,
            io,
            attachmentHost
          )
          return okEmpty()
      }
      const unreachable: never = command
      return fail(new Error(`unsupported Product App TUI command: ${String(unreachable)}`))
    } finally {
      await adapter?.dispose()
      await app.dispose()
    }
  } catch (error) {
    return fail(error)
  }
}
