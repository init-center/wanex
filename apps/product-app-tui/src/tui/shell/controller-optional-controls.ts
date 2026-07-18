import type { TuiShellCommandRef } from "../shell-core/index.js"
import {
  executeCommand,
  rejectCommand
} from "./controller-command-execution.js"
import { isEnabled } from "./controller-guards.js"
import type {
  TuiShellCommandResult,
  TuiShellCommandSourceKind,
  TuiShellControllerOptions,
  TuiShellExecuteControlRequest
} from "./types.js"

export async function executeOptionalCommandControl<
  Control extends { readonly id: string }
>(request: {
  readonly request: TuiShellExecuteControlRequest
  readonly controls: readonly Control[]
  readonly kind: Exclude<TuiShellCommandSourceKind, "palette" | "keybinding" | "direct">
  readonly notFoundReason:
    | "status_item_not_found"
    | "prompt_decoration_not_found"
    | "notification_not_found"
  readonly commandOf: (control: Control) => TuiShellCommandRef | undefined
  readonly whenOf: (control: Control) => string | undefined
  readonly options: TuiShellControllerOptions
  readonly setLastCommandId: (commandId: string) => void
}): Promise<TuiShellCommandResult> {
  const control = request.controls.find(
    (candidate) => candidate.id === request.request.id
  )
  const source = {
    kind: request.kind,
    contributionId: request.request.id
  }
  if (control === undefined) {
    return rejectCommand({
      options: request.options,
      source,
      reason: request.notFoundReason,
      message: `${request.kind} ${request.request.id} was not found`
    })
  }
  if (!isEnabled(request.whenOf(control), request.options, request.request.context)) {
    return rejectCommand({
      options: request.options,
      source,
      reason: "control_disabled",
      message: `${request.kind} ${request.request.id} is disabled`,
      command: request.commandOf(control)
    })
  }
  const command = request.commandOf(control)
  if (command === undefined) {
    return rejectCommand({
      options: request.options,
      source,
      reason: "command_not_found",
      message: `${request.kind} ${request.request.id} has no command`
    })
  }
  return executeCommand({
    command,
    source,
    input: request.request.input,
    context: request.request.context,
    options: request.options,
    setLastCommandId: request.setLastCommandId
  })
}
