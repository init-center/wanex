import type { TuiShellReadModel } from "../shell-core/index.js"
import type { TuiShellControllerState } from "./types.js"

export function clampPaletteIndex(
  index: number,
  readModel: TuiShellReadModel
): number {
  if (readModel.palette.length === 0) {
    return 0
  }
  return Math.max(0, Math.min(index, readModel.palette.length - 1))
}

export function currentState(request: {
  readonly readModel: TuiShellReadModel
  readonly selectedPaletteIndex: number
  readonly lastCommandId: string | undefined
}): TuiShellControllerState {
  const entry = request.readModel.palette[request.selectedPaletteIndex]
  return {
    selectedPaletteIndex: request.selectedPaletteIndex,
    ...(entry === undefined ? {} : { selectedPaletteEntryId: entry.id }),
    ...(request.lastCommandId === undefined
      ? {}
      : { lastCommandId: request.lastCommandId }),
    diagnosticCount: request.readModel.diagnostics.length
  }
}
