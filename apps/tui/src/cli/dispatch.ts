import { runTuiLineSession } from "../line-session/session.js"
import type {
  TuiCliCommand,
  TuiCliIo
} from "./model.js"
import type {
  TuiSurface
} from "../model.js"

export async function runTuiCliCommand(
  command: TuiCliCommand,
  surface: TuiSurface,
  io?: TuiCliIo,
  attachmentHost?: import("../model.js").TuiAttachmentHost
): Promise<unknown> {
  switch (command.name) {
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
      if (io?.input === undefined || io.write === undefined) {
        throw new Error("interactive requires an input/output port")
      }
      return await runTuiLineSession({
        surface,
        input: io.input,
        write: io.write,
        ...(attachmentHost === undefined ? {} : { attachmentHost })
      })
    case "fullscreen":
      throw new Error("fullscreen is handled by the trusted CLI lifecycle")
    case "overview":
    case "commands":
    case "events":
      throw new Error(`${command.name} is handled before command dispatch`)
  }
}
