import type {
  TuiShellPaletteEntry,
  TuiShellReadModel
} from "../shell-core/index.js"
import {
  executeCommand,
  rejectCommand
} from "./controller-command-execution.js"
import { isEnabled, platformMatches } from "./controller-guards.js"
import type {
  TuiShellCommandResult,
  TuiShellContext,
  TuiShellControllerOptions,
  TuiShellExecuteKeybindingRequest,
  TuiShellExecutePaletteEntryRequest,
  TuiShellExecuteSelectedPaletteRequest
} from "./types.js"

export function availablePalette(
  readModel: TuiShellReadModel,
  options: Pick<TuiShellControllerOptions, "evaluateWhen">,
  context?: TuiShellContext
): readonly TuiShellPaletteEntry[] {
  return readModel.palette.filter((entry) =>
    isEnabled(entry.when, options, context)
  )
}

export async function executeSelectedPaletteEntry(request: {
  readonly request: TuiShellExecuteSelectedPaletteRequest
  readonly readModel: TuiShellReadModel
  readonly selectedPaletteIndex: number
  readonly options: TuiShellControllerOptions
  readonly setLastCommandId: (commandId: string) => void
}): Promise<TuiShellCommandResult> {
  const entry = availablePalette(
    request.readModel,
    request.options,
    request.request.context
  )[request.selectedPaletteIndex]
  if (entry === undefined) {
    return rejectCommand({
      options: request.options,
      source: { kind: "palette" },
      reason: "palette_entry_not_found",
      message: "no selected palette entry is available"
    })
  }
  return executeCommand({
    command: entry.command,
    source: {
      kind: "palette",
      contributionId: entry.id
    },
    input: request.request.input,
    context: request.request.context,
    options: request.options,
    setLastCommandId: request.setLastCommandId
  })
}

export async function executePaletteEntry(request: {
  readonly request: TuiShellExecutePaletteEntryRequest
  readonly readModel: TuiShellReadModel
  readonly options: TuiShellControllerOptions
  readonly setLastCommandId: (commandId: string) => void
}): Promise<TuiShellCommandResult> {
  const entry = request.readModel.palette.find(
    (candidate) => candidate.id === request.request.id
  )
  const source = {
    kind: "palette",
    contributionId: request.request.id
  } as const
  if (entry === undefined) {
    return rejectCommand({
      options: request.options,
      source,
      reason: "palette_entry_not_found",
      message: `palette entry ${request.request.id} was not found`
    })
  }
  if (!isEnabled(entry.when, request.options, request.request.context)) {
    return rejectCommand({
      options: request.options,
      source,
      reason: "control_disabled",
      message: `palette entry ${request.request.id} is disabled`,
      command: entry.command
    })
  }
  return executeCommand({
    command: entry.command,
    source,
    input: request.request.input,
    context: request.request.context,
    options: request.options,
    setLastCommandId: request.setLastCommandId
  })
}

export async function executeKeybinding(request: {
  readonly request: TuiShellExecuteKeybindingRequest
  readonly readModel: TuiShellReadModel
  readonly options: TuiShellControllerOptions
  readonly setLastCommandId: (commandId: string) => void
}): Promise<TuiShellCommandResult> {
  const keybinding = request.readModel.keybindings.find(
    (candidate) =>
      candidate.key === request.request.key &&
      platformMatches(candidate, request.request.platform) &&
      isEnabled(candidate.when, request.options, request.request.context)
  )
  const source = {
    kind: "keybinding",
    key: request.request.key
  } as const
  if (keybinding === undefined) {
    return rejectCommand({
      options: request.options,
      source,
      reason: "keybinding_not_found",
      message: `keybinding ${request.request.key} was not found`
    })
  }
  return executeCommand({
    command: keybinding.command,
    source: {
      kind: "keybinding",
      contributionId: keybinding.id,
      key: keybinding.key
    },
    input: request.request.input,
    context: request.request.context,
    options: request.options,
    setLastCommandId: request.setLastCommandId
  })
}
