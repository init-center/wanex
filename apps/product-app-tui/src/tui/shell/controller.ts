import {
  availablePalette,
  executeKeybinding,
  executePaletteEntry,
  executeSelectedPaletteEntry
} from "./controller-palette.js"
import { executeOptionalCommandControl } from "./controller-optional-controls.js"
import { clampPaletteIndex, currentState } from "./controller-state.js"
import type {
  TuiShellContext,
  TuiShellController,
  TuiShellControllerOptions
} from "./types.js"

export function createTuiShellController(
  options: TuiShellControllerOptions
): TuiShellController {
  let readModel = options.readModel
  let selectedPaletteIndex = 0
  let lastCommandId: string | undefined

  const emit = options.emit ?? (() => undefined)

  const controller: TuiShellController = {
    readModel: () => readModel,
    state: () =>
      currentState({ readModel, selectedPaletteIndex, lastCommandId }),
    replaceReadModel: (nextReadModel) => {
      readModel = nextReadModel
      selectedPaletteIndex = clampPaletteIndex(selectedPaletteIndex, readModel)
      emit({
        kind: "read_model_replaced",
        diagnosticCount: readModel.diagnostics.length
      })
      emitSelection()
      return controller.state()
    },
    palette: (context) => availablePalette(readModel, options, context),
    selectPaletteIndex: (index, context) => {
      const entries = availablePalette(readModel, options, context)
      selectedPaletteIndex =
        entries.length === 0 ? 0 : Math.max(0, Math.min(index, entries.length - 1))
      emitSelection(context)
      return controller.state()
    },
    movePaletteSelection: (delta, context) => {
      const entries = availablePalette(readModel, options, context)
      if (entries.length === 0) {
        selectedPaletteIndex = 0
      } else {
        selectedPaletteIndex =
          (selectedPaletteIndex + delta + entries.length) % entries.length
      }
      emitSelection(context)
      return controller.state()
    },
    executeSelectedPaletteEntry: (request = {}) =>
      executeSelectedPaletteEntry({
        request,
        readModel,
        selectedPaletteIndex,
        options,
        setLastCommandId: (commandId) => {
          lastCommandId = commandId
        }
      }),
    executePaletteEntry: (request) =>
      executePaletteEntry({
        request,
        readModel,
        options,
        setLastCommandId: (commandId) => {
          lastCommandId = commandId
        }
      }),
    executeKeybinding: (request) =>
      executeKeybinding({
        request,
        readModel,
        options,
        setLastCommandId: (commandId) => {
          lastCommandId = commandId
        }
      }),
    executeStatusItem: (request) =>
      executeOptionalCommandControl({
        request,
        controls: readModel.statusItems,
        kind: "status_item",
        notFoundReason: "status_item_not_found",
        commandOf: (control) => control.command,
        whenOf: (control) => control.when,
        options,
        setLastCommandId: (commandId) => {
          lastCommandId = commandId
        }
      }),
    executePromptDecoration: (request) =>
      executeOptionalCommandControl({
        request,
        controls: readModel.promptDecorations,
        kind: "prompt_decoration",
        notFoundReason: "prompt_decoration_not_found",
        commandOf: (control) => control.command,
        whenOf: (control) => control.when,
        options,
        setLastCommandId: (commandId) => {
          lastCommandId = commandId
        }
      }),
    executeNotification: (request) =>
      executeOptionalCommandControl({
        request,
        controls: readModel.notifications,
        kind: "notification",
        notFoundReason: "notification_not_found",
        commandOf: (control) => control.command,
        whenOf: (control) => control.when,
        options,
        setLastCommandId: (commandId) => {
          lastCommandId = commandId
        }
      })
  }

  function emitSelection(context?: TuiShellContext): void {
    const entry = availablePalette(readModel, options, context)[selectedPaletteIndex]
    emit({
      kind: "selection_changed",
      selectedPaletteIndex,
      ...(entry === undefined ? {} : { selectedPaletteEntryId: entry.id })
    })
  }

  selectedPaletteIndex = clampPaletteIndex(selectedPaletteIndex, readModel)
  return controller
}
