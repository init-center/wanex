import type {
  TuiShellCommandRef,
  TuiShellKeybinding,
  TuiShellPaletteEntry,
  TuiShellReadModel
} from "../shell-core/index.js"

export type TuiShellContext = Readonly<Record<string, unknown>>

export type TuiShellCommandSourceKind =
  | "palette"
  | "keybinding"
  | "status_item"
  | "prompt_decoration"
  | "notification"
  | "direct"

export interface TuiShellCommandSource {
  readonly kind: TuiShellCommandSourceKind
  readonly contributionId?: string
  readonly key?: string
}

export interface TuiShellCommandInvocation {
  readonly commandId: string
  readonly handlerRef: string
  readonly command: TuiShellCommandRef
  readonly source: TuiShellCommandSource
  readonly input?: unknown
  readonly context?: TuiShellContext
}

export type TuiShellCommandRejectionReason =
  | "command_not_found"
  | "command_not_runnable"
  | "control_disabled"
  | "keybinding_not_found"
  | "palette_entry_not_found"
  | "prompt_decoration_not_found"
  | "status_item_not_found"
  | "notification_not_found"

export interface TuiShellCommandCompletedResult {
  readonly status: "completed"
  readonly invocation: TuiShellCommandInvocation
  readonly value?: unknown
}

export interface TuiShellCommandFailedResult {
  readonly status: "failed"
  readonly invocation: TuiShellCommandInvocation
  readonly reason: "executor_failed"
  readonly message: string
}

export interface TuiShellCommandRejectedResult {
  readonly status: "rejected"
  readonly reason: TuiShellCommandRejectionReason
  readonly source: TuiShellCommandSource
  readonly message: string
  readonly command?: TuiShellCommandRef
}

export type TuiShellCommandResult =
  | TuiShellCommandCompletedResult
  | TuiShellCommandFailedResult
  | TuiShellCommandRejectedResult

export type TuiShellCommandExecutor = (
  invocation: TuiShellCommandInvocation
) => Promise<unknown> | unknown

export interface TuiShellWhenEvaluationRequest {
  readonly expression: string
  readonly context: TuiShellContext
}

export type TuiShellWhenEvaluator = (
  request: TuiShellWhenEvaluationRequest
) => boolean

export type TuiShellEvent =
  | {
      readonly kind: "command_started"
      readonly invocation: TuiShellCommandInvocation
    }
  | {
      readonly kind: "command_completed"
      readonly result: TuiShellCommandCompletedResult
    }
  | {
      readonly kind: "command_failed"
      readonly result: TuiShellCommandFailedResult
    }
  | {
      readonly kind: "command_rejected"
      readonly result: TuiShellCommandRejectedResult
    }
  | {
      readonly kind: "selection_changed"
      readonly selectedPaletteIndex: number
      readonly selectedPaletteEntryId?: string
    }
  | {
      readonly kind: "read_model_replaced"
      readonly diagnosticCount: number
    }

export interface TuiShellControllerOptions {
  readonly readModel: TuiShellReadModel
  readonly executeCommand: TuiShellCommandExecutor
  readonly evaluateWhen?: TuiShellWhenEvaluator
  readonly emit?: (event: TuiShellEvent) => void
}

export interface TuiShellControllerState {
  readonly selectedPaletteIndex: number
  readonly selectedPaletteEntryId?: string
  readonly lastCommandId?: string
  readonly diagnosticCount: number
}

export interface TuiShellExecutePaletteEntryRequest {
  readonly id: string
  readonly input?: unknown
  readonly context?: TuiShellContext
}

export interface TuiShellExecuteKeybindingRequest {
  readonly key: string
  readonly platform?: TuiShellKeybinding["platform"]
  readonly input?: unknown
  readonly context?: TuiShellContext
}

export interface TuiShellExecuteControlRequest {
  readonly id: string
  readonly input?: unknown
  readonly context?: TuiShellContext
}

export interface TuiShellExecuteSelectedPaletteRequest {
  readonly input?: unknown
  readonly context?: TuiShellContext
}

export interface TuiShellController {
  readonly readModel: () => TuiShellReadModel
  readonly state: () => TuiShellControllerState
  readonly replaceReadModel: (readModel: TuiShellReadModel) => TuiShellControllerState
  readonly palette: (context?: TuiShellContext) => readonly TuiShellPaletteEntry[]
  readonly selectPaletteIndex: (
    index: number,
    context?: TuiShellContext
  ) => TuiShellControllerState
  readonly movePaletteSelection: (
    delta: number,
    context?: TuiShellContext
  ) => TuiShellControllerState
  readonly executeSelectedPaletteEntry: (
    request?: TuiShellExecuteSelectedPaletteRequest
  ) => Promise<TuiShellCommandResult>
  readonly executePaletteEntry: (
    request: TuiShellExecutePaletteEntryRequest
  ) => Promise<TuiShellCommandResult>
  readonly executeKeybinding: (
    request: TuiShellExecuteKeybindingRequest
  ) => Promise<TuiShellCommandResult>
  readonly executeStatusItem: (
    request: TuiShellExecuteControlRequest
  ) => Promise<TuiShellCommandResult>
  readonly executePromptDecoration: (
    request: TuiShellExecuteControlRequest
  ) => Promise<TuiShellCommandResult>
  readonly executeNotification: (
    request: TuiShellExecuteControlRequest
  ) => Promise<TuiShellCommandResult>
}
