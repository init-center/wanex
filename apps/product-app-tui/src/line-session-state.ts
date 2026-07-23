import type {
  ProductAppTuiLineSessionResult,
  ProductAppTuiSurface
} from "./types.js"

export interface ProductAppTuiLineSessionState {
  handledLineCount: number
  commandCount: number
  askCommandCount: number
  attachCommandCount: number
  selectCommandCount: number
  workbenchCommandCount: number
  operationCommandCount: number
  cancelCommandCount: number
  regenerateCommandCount: number
  paletteCommandCount: number
  catalogCommandCount: number
  previewCommandCount: number
  executeCommandCount: number
  executionCommandCount: number
  eventsCommandCount: number
  blockedCommandCount: number
  errorCount: number
  quit: boolean
  activeSessionId: string | undefined
}

export function createProductAppTuiLineSessionState(
  surface: ProductAppTuiSurface
): ProductAppTuiLineSessionState {
  return {
    handledLineCount: 0,
    commandCount: 0,
    askCommandCount: 0,
    attachCommandCount: 0,
    selectCommandCount: 0,
    workbenchCommandCount: 0,
    operationCommandCount: 0,
    cancelCommandCount: 0,
    regenerateCommandCount: 0,
    paletteCommandCount: 0,
    catalogCommandCount: 0,
    previewCommandCount: 0,
    executeCommandCount: 0,
    executionCommandCount: 0,
    eventsCommandCount: 0,
    blockedCommandCount: 0,
    errorCount: 0,
    quit: false,
    activeSessionId: selectedSessionId(surface)
  }
}

export function productAppTuiLineSessionResult(
  state: ProductAppTuiLineSessionState
): ProductAppTuiLineSessionResult {
  return {
    kind: "product-app-tui.line-session",
    handledLineCount: state.handledLineCount,
    commandCount: state.commandCount,
    askCommandCount: state.askCommandCount,
    attachCommandCount: state.attachCommandCount,
    selectCommandCount: state.selectCommandCount,
    workbenchCommandCount: state.workbenchCommandCount,
    operationCommandCount: state.operationCommandCount,
    cancelCommandCount: state.cancelCommandCount,
    regenerateCommandCount: state.regenerateCommandCount,
    paletteCommandCount: state.paletteCommandCount,
    catalogCommandCount: state.catalogCommandCount,
    previewCommandCount: state.previewCommandCount,
    executeCommandCount: state.executeCommandCount,
    executionCommandCount: state.executionCommandCount,
    eventsCommandCount: state.eventsCommandCount,
    blockedCommandCount: state.blockedCommandCount,
    errorCount: state.errorCount,
    quit: state.quit,
    ...(state.activeSessionId === undefined
      ? {}
      : { activeSessionId: state.activeSessionId })
  }
}

function selectedSessionId(surface: ProductAppTuiSurface): string | undefined {
  const status = surface.snapshot().status
  if (!status.ok) {
    return undefined
  }
  return status.value.state.selectedSessionId
}
