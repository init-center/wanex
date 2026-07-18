import { runProductAppTuiLineSession } from "./line-session.js"
import { resolvePaletteSelector } from "./line-session-text.js"
import type {
  ProductAppTuiCliCommand,
  ProductAppTuiCliIo
} from "./cli-types.js"
import type {
  ProductAppTuiSurface
} from "./types.js"

export async function runProductAppTuiCliCommand(
  command: ProductAppTuiCliCommand,
  surface: ProductAppTuiSurface,
  io?: ProductAppTuiCliIo
): Promise<unknown> {
  switch (command.name) {
    case "palette":
      return await surface.controller.executePaletteEntry({
        id: resolvePaletteSelector(
          {
            surface,
            input: emptyInput(),
            write: () => undefined
          },
          command.paletteSelector
        ),
        ...(command.input === undefined ? {} : { input: command.input })
      })
    case "preview":
      return await surface.client.previewProductCommandInvocation({
        commandId: command.commandId,
        ...(command.input === undefined ? {} : { input: command.input })
      })
    case "execute":
      return await surface.client.executeProductCommand({
        commandId: command.commandId,
        ...(command.input === undefined ? {} : { input: command.input })
      })
    case "execution":
      return await surface.client.readExecutionReference({
        kind: "job",
        id: command.jobId
      })
    case "interactive":
      if (io === undefined) {
        throw new Error("interactive requires an input/output port")
      }
      return await runProductAppTuiLineSession({
        surface,
        input: io.input,
        write: io.write
      })
    case "overview":
    case "commands":
    case "events":
      throw new Error(`${command.name} is handled before command dispatch`)
  }
}

async function* emptyInput(): AsyncIterable<string> {}
