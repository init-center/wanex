import type { TuiShellCommandRef } from "../shell-core/index.js"
import type {
  TuiShellCommandCompletedResult,
  TuiShellCommandFailedResult,
  TuiShellCommandRejectedResult,
  TuiShellCommandRejectionReason,
  TuiShellCommandResult,
  TuiShellCommandSource,
  TuiShellContext,
  TuiShellControllerOptions
} from "./types.js"

export async function executeCommand(request: {
  readonly command: TuiShellCommandRef
  readonly source: TuiShellCommandSource
  readonly input?: unknown
  readonly context?: TuiShellContext | undefined
  readonly options: TuiShellControllerOptions
  readonly setLastCommandId: (commandId: string) => void
}): Promise<TuiShellCommandResult> {
  if (
    request.command.contribution === undefined ||
    request.command.handlerRef === undefined
  ) {
    return rejectCommand({
      options: request.options,
      source: request.source,
      reason: "command_not_runnable",
      message: `command ${request.command.commandId} is not runnable`,
      command: request.command
    })
  }

  const invocation = {
    commandId: request.command.commandId,
    handlerRef: request.command.handlerRef,
    command: request.command,
    source: request.source,
    ...(request.input === undefined ? {} : { input: request.input }),
    ...(request.context === undefined ? {} : { context: request.context })
  }
  request.options.emit?.({
    kind: "command_started",
    invocation
  })

  try {
    const value = await request.options.executeCommand(invocation)
    request.setLastCommandId(invocation.commandId)
    const result: TuiShellCommandCompletedResult = {
      status: "completed",
      invocation,
      ...(value === undefined ? {} : { value })
    }
    request.options.emit?.({
      kind: "command_completed",
      result
    })
    return result
  } catch {
    const result: TuiShellCommandFailedResult = {
      status: "failed",
      invocation,
      reason: "executor_failed",
      message: "command executor failed"
    }
    request.options.emit?.({
      kind: "command_failed",
      result
    })
    return result
  }
}

export function rejectCommand(request: {
  readonly options: Pick<TuiShellControllerOptions, "emit">
  readonly source: TuiShellCommandSource
  readonly reason: TuiShellCommandRejectionReason
  readonly message: string
  readonly command?: TuiShellCommandRef | undefined
}): TuiShellCommandRejectedResult {
  const result = {
    status: "rejected",
    reason: request.reason,
    source: request.source,
    message: request.message,
    ...(request.command === undefined ? {} : { command: request.command })
  } as const
  request.options.emit?.({
    kind: "command_rejected",
    result
  })
  return result
}
