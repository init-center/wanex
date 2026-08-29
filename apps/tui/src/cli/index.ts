import { startAssistantHost } from "@wanex/assistant-host/application"
import { createTuiCliComposition } from "./composition.js"
import { parseTuiCliCommand } from "./parser.js"
import { runTuiCliCommand } from "./dispatch.js"
import { fail, okEmpty, okJson, okRenderedText } from "./result.js"
import { renderTuiCommandCatalog } from "../presentation/command-catalog.js"
import { renderTuiEvents } from "../presentation/events.js"
import { renderTuiExecutionActivity } from "../presentation/execution.js"
import { createTuiHostSurfaceClient } from "../host/surface-client.js"
import { createTuiAttachmentHost } from "../host/attachment.js"
import { renderTuiFrame } from "../presentation/frame.js"
import { createTuiSurface } from "../application/surface.js"
import { createTuiFullScreen } from "../full-screen/index.js"
import type {
  TuiCliEnvironment,
  TuiCliIo,
  TuiCliResult
} from "./model.js"
import { ProcessTerminal } from "@earendil-works/pi-tui"

export type {
  TuiCliCommand,
  TuiCliEnvironment,
  TuiCliIo,
  TuiCliResult
} from "./model.js"
export { parseTuiCliCommand } from "./parser.js"
export { createTuiCliComposition } from "./composition.js"

export async function main(
  argv: readonly string[],
  env: TuiCliEnvironment,
  io?: TuiCliIo
): Promise<TuiCliResult> {
  try {
    const command = parseTuiCliCommand(argv)
    const fullScreenTerminal = command.name === "fullscreen"
      ? io?.fullScreenTerminal ?? new ProcessTerminal()
      : undefined
    const composition = createTuiCliComposition(
      env,
      fullScreenTerminal === undefined
        ? undefined
        : {
            providerTerminal: fullScreenTerminal,
            ...(io?.signal === undefined ? {} : { signal: io.signal }),
            ...(io?.credentialStore === undefined
              ? {}
              : { credentialStore: io.credentialStore })
          }
    )
    const assistant = await startAssistantHost(composition.hostOptions)
    const app = assistant.shell
    try {
      const client = createTuiHostSurfaceClient({ surface: assistant.surface })
      const surface = await createTuiSurface({ client })
      const attachmentHost = createTuiAttachmentHost(app)
      switch (command.name) {
        case "overview": {
          const value = renderTuiFrame(surface.snapshot())
          return command.output === "text"
            ? okRenderedText(value)
            : okJson(value)
        }
        case "events": {
          const value = renderTuiEvents({
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
          const value = renderTuiCommandCatalog(
            surface.snapshot().commandCatalog
          )
          return command.output === "text"
            ? okRenderedText(value)
            : okJson(value)
        }
        case "preview": {
          const value = await runTuiCliCommand(command, surface, io)
          return okJson(value)
        }
        case "execute": {
          const result = await runTuiCliCommand(command, surface, io)
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
          const result = await runTuiCliCommand(command, surface, io)
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
            renderTuiExecutionActivity(
              result.value as Parameters<typeof renderTuiExecutionActivity>[0]
            )
          )
        }
        case "interactive":
          await runTuiCliCommand(
            command,
            surface,
            io,
            attachmentHost
          )
          return okEmpty()
        case "fullscreen": {
          while (true) {
            const fullScreen = createTuiFullScreen({
              client,
              attachmentHost,
              ...(fullScreenTerminal === undefined
                ? {}
                : { terminal: fullScreenTerminal })
            })
            const abort = () => {
              void fullScreen.stop()
            }
            io?.signal?.addEventListener("abort", abort, { once: true })
            let reason: Awaited<ReturnType<typeof fullScreen.waitUntilStopped>>
            try {
              await fullScreen.start()
              if (io?.signal?.aborted === true) {
                await fullScreen.stop()
              }
              reason = await fullScreen.waitUntilStopped()
            } finally {
              io?.signal?.removeEventListener("abort", abort)
            }
            if (reason !== "provider-management") break
            if (composition.trustedProviderHost === undefined) {
              throw new Error("trusted Provider host is unavailable")
            }
            await composition.trustedProviderHost.manage({
              listModelEndpoints: () => app.modelEndpoints.listModelEndpoints()
            })
            if (io?.signal?.aborted === true) break
          }
          return okEmpty()
        }
      }
      const unreachable: never = command
      return fail(new Error(`unsupported TUI command: ${String(unreachable)}`))
    } finally {
      await assistant.close()
    }
  } catch (error) {
    return fail(error)
  }
}
