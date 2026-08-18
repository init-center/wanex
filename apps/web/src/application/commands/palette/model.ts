import type {
  CommandInputViewModel
} from "../input/model.js"

export interface CommandPaletteViewModel {
  readonly kind: "web.command-palette"
  readonly state: "ready" | "unavailable"
  readonly message: string
  readonly rows: readonly CommandPaletteItem[]
  readonly diagnostics: readonly CommandPaletteDiagnostic[]
}

export interface CommandPaletteItem {
  readonly id: string
  readonly name: string
  readonly title: string
  readonly handlerRef: string
  readonly sourceKind: string
  readonly sourceId: string
  readonly trust: string
  readonly category?: string
  readonly input: CommandInputViewModel
}

export interface CommandPaletteDiagnostic {
  readonly code: string
  readonly severity: string
  readonly message: string
  readonly contributionId?: string
  readonly sourceId?: string
}
