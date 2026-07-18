import type { AppCommandContribution } from "@wanex/extension"
import type {
  TuiShellCommandRef,
  TuiShellDiagnostic
} from "./types.js"

export type RequiredCommandResolver = (
  commandId: string,
  contributionId: string
) => TuiShellCommandRef

export type OptionalCommandResolver = (
  commandId: string | undefined,
  contributionId: string
) => TuiShellCommandRef | undefined

export interface TuiShellCommandResolvers {
  readonly resolveRequiredCommand: RequiredCommandResolver
  readonly resolveOptionalCommand: OptionalCommandResolver
}

export function createTuiShellCommandResolvers(options: {
  readonly commands: ReadonlyMap<string, AppCommandContribution>
  readonly diagnostics: TuiShellDiagnostic[]
}): TuiShellCommandResolvers {
  const resolveRequiredCommand: RequiredCommandResolver = (
    commandId,
    contributionId
  ) => {
    const command = options.commands.get(commandId)
    if (command === undefined) {
      options.diagnostics.push(
        danglingCommandDiagnostic(commandId, contributionId)
      )
      return { commandId }
    }
    return commandRef(command)
  }

  return {
    resolveRequiredCommand,
    resolveOptionalCommand(commandId, contributionId) {
      if (commandId === undefined) {
        return undefined
      }
      return resolveRequiredCommand(commandId, contributionId)
    }
  }
}

function commandRef(command: AppCommandContribution): TuiShellCommandRef {
  return {
    commandId: command.id,
    title: command.value.title,
    ...(command.value.description === undefined
      ? {}
      : { description: command.value.description }),
    ...(command.value.category === undefined
      ? {}
      : { category: command.value.category }),
    handlerRef: command.value.handlerRef,
    contribution: command
  }
}

function danglingCommandDiagnostic(
  commandId: string,
  contributionId: string
): TuiShellDiagnostic {
  return {
    code: "tui-shell.dangling_command",
    severity: "error",
    message: `TUI contribution ${contributionId} references missing app command ${commandId}`,
    contributionId,
    commandId
  }
}
