import type {
  ProductAppHomeReadModel,
  ProductAppHomeOptions,
  ProductAppCancelTrackedConversationOperationResult,
  ProductAppCommandCatalogReadModel,
  ProductAppConversationOperationReadModel,
  ProductAppOpenWorkbenchResult,
  ProductAppReadTrackedConversationOperationResult,
  ProductAppRegenerateTrackedConversationOperationResult,
  ProductAppSettingsReadModel,
  ProductAppShellStatus,
  ProductAppSubmitConversationOperationResult,
  ProductAppSurfaceClient,
  ProductAppSurfaceClientCommandEnvelope,
  ProductAppSurfaceClientDescriptorResult,
  ProductAppSurfaceClientEventsResult
} from "@wanex/product-app/surface-client"
import type {
  TuiShellCommandInvocation,
  TuiShellController,
  TuiShellEvent,
  TuiShellWhenEvaluator
} from "./tui/shell/index.js"
import type { TuiShellReadModel } from "./tui/shell-core/index.js"
import type { TuiContribution } from "./tui/surface/index.js"
import type {
  PRODUCT_APP_TUI_COMMANDS
} from "./commands.js"

export type ProductAppTuiCommandId =
  (typeof PRODUCT_APP_TUI_COMMANDS)[keyof typeof PRODUCT_APP_TUI_COMMANDS]

export interface CreateProductAppTuiSurfaceOptions {
  readonly client: ProductAppSurfaceClient
  readonly homeOptions?: ProductAppHomeOptions
  readonly eventLimit?: number
  readonly includeSourceDiagnostics?: boolean
  readonly evaluateWhen?: TuiShellWhenEvaluator
  readonly emit?: (event: TuiShellEvent) => void
  readonly now?: () => number
}

export interface ProductAppTuiSurface {
  readonly client: ProductAppSurfaceClient
  readonly controller: TuiShellController
  snapshot(): ProductAppTuiSurfaceSnapshot
  readModel(): TuiShellReadModel
  refresh(options?: ProductAppHomeOptions): Promise<ProductAppTuiSurfaceSnapshot>
}

export interface ProductAppTuiSurfaceSnapshot {
  readonly kind: "product-app-tui.snapshot"
  readonly generatedAt: number
  readonly descriptor: ProductAppSurfaceClientDescriptorResult
  readonly status: ProductAppSurfaceClientCommandEnvelope<ProductAppShellStatus>
  readonly home: ProductAppSurfaceClientCommandEnvelope<ProductAppHomeReadModel>
  readonly settings: ProductAppSurfaceClientCommandEnvelope<ProductAppSettingsReadModel>
  readonly commandCatalog: ProductAppSurfaceClientCommandEnvelope<ProductAppCommandCatalogReadModel>
  readonly conversation: ProductAppSurfaceClientCommandEnvelope<ProductAppReadTrackedConversationOperationResult>
  readonly events: ProductAppSurfaceClientEventsResult
  readonly diagnostics: readonly ProductAppTuiDiagnostic[]
  readonly readModel: TuiShellReadModel
  readonly contributions: readonly TuiContribution[]
}

export interface ProductAppTuiDiagnostic {
  readonly code: ProductAppTuiDiagnosticCode
  readonly severity: "info" | "warning" | "error"
  readonly message: string
  readonly command?: string
}

export type ProductAppTuiDiagnosticCode =
  | "product-app-tui.descriptor_failed"
  | "product-app-tui.status_failed"
  | "product-app-tui.home_failed"
  | "product-app-tui.settings_failed"
  | "product-app-tui.command_catalog_failed"
  | "product-app-tui.conversation_failed"
  | "product-app-tui.events_failed"
  | "product-app-tui.invalid_input"
  | "product-app-tui.unknown_command"

export interface ProductAppTuiCommandRow {
  readonly id: ProductAppTuiCommandId
  readonly title: string
  readonly description?: string
  readonly category: string
  readonly handlerRef: string
  readonly mutatesState: boolean
}

export interface ExecuteProductAppTuiCommandRequest {
  readonly client: ProductAppSurfaceClient
  readonly invocation: TuiShellCommandInvocation
}

export type ProductAppTuiCommandResult =
  | ProductAppTuiCommandCompletedResult
  | ProductAppTuiCommandRejectedResult

export interface ProductAppTuiCommandCompletedResult {
  readonly kind: "product-app-tui.command.completed"
  readonly commandId: ProductAppTuiCommandId
  readonly value: unknown
  readonly mutatesState: boolean
}

export interface ProductAppTuiCommandRejectedResult {
  readonly kind: "product-app-tui.command.rejected"
  readonly commandId: string
  readonly reason: "unknown_command" | "invalid_input"
  readonly message: string
}

export interface RenderProductAppTuiFrameOptions {
  readonly maxPaletteEntries?: number
}

export interface ProductAppTuiRenderedFrame {
  readonly kind: "product-app-tui.frame"
  readonly generatedAt: number
  readonly title: string
  readonly ready: boolean
  readonly mode: string
  readonly layout: string
  readonly selectedSessionId?: string
  readonly commandCount: number
  readonly productCommandCount: number
  readonly paletteCount: number
  readonly renderedPaletteCount: number
  readonly omittedPaletteCount: number
  readonly statusItemCount: number
  readonly diagnosticCount: number
  readonly eventCount: number
  readonly lines: readonly string[]
  readonly text: string
}

export interface ProductAppTuiLineSessionOptions {
  readonly surface: ProductAppTuiSurface
  readonly input: AsyncIterable<string>
  readonly write: (chunk: string) => void | Promise<void>
  readonly renderOptions?: RenderProductAppTuiFrameOptions
  readonly attachmentHost?: ProductAppTuiAttachmentHost
}

export interface ProductAppTuiAttachmentHost {
  attachPath(request: {
    readonly path: string
    readonly sessionId?: string
  }): Promise<{
    readonly resourceId: string
    readonly label?: string
  }>
}

export interface ProductAppTuiLineSessionResult {
  readonly kind: "product-app-tui.line-session"
  readonly handledLineCount: number
  readonly commandCount: number
  readonly askCommandCount: number
  readonly attachCommandCount: number
  readonly selectCommandCount: number
  readonly workbenchCommandCount: number
  readonly operationCommandCount: number
  readonly cancelCommandCount: number
  readonly regenerateCommandCount: number
  readonly paletteCommandCount: number
  readonly catalogCommandCount: number
  readonly previewCommandCount: number
  readonly executeCommandCount: number
  readonly executionCommandCount: number
  readonly eventsCommandCount: number
  readonly blockedCommandCount: number
  readonly errorCount: number
  readonly quit: boolean
  readonly activeSessionId?: string
}

export type ProductAppTuiWorkbench = ProductAppOpenWorkbenchResult

export interface ProductAppTuiRenderedWorkbench {
  readonly kind: "product-app-tui.workbench"
  readonly sourceKind: ProductAppTuiWorkbench["kind"]
  readonly sessionId?: string
  readonly rowCount: number
  readonly inputCount: number
  readonly messageCount: number
  readonly visibleTextRows: number
  readonly originKinds: readonly string[]
  readonly latestUpdatedAt?: number
  readonly latestUserText?: string
  readonly latestAssistantText?: string
  readonly lines: readonly string[]
  readonly text: string
}

export type ProductAppTuiConversationOperation =
  | ProductAppSubmitConversationOperationResult
  | ProductAppReadTrackedConversationOperationResult
  | ProductAppCancelTrackedConversationOperationResult
  | ProductAppRegenerateTrackedConversationOperationResult

export interface ProductAppTuiRenderedConversationOperation {
  readonly kind: "product-app-tui.conversation-operation"
  readonly sourceKind: ProductAppTuiConversationOperation["kind"]
  readonly state: string
  readonly sessionId?: string
  readonly operationId?: string
  readonly rowCount: number
  readonly cancellable: boolean
  readonly regeneratable: boolean
  readonly terminal: boolean
  readonly lines: readonly string[]
  readonly text: string
}

export type ProductAppTuiConversationOperationReadModel =
  ProductAppConversationOperationReadModel

export interface ProductAppTuiRenderedEvents {
  readonly kind: "product-app-tui.events"
  readonly ok: boolean
  readonly eventCount: number
  readonly limit?: number
  readonly lines: readonly string[]
  readonly text: string
}

export interface ProductAppTuiRenderedCommandCatalog {
  readonly kind: "product-app-tui.command-catalog"
  readonly ok: boolean
  readonly commandCount: number
  readonly diagnosticCount: number
  readonly commands: ProductAppCommandCatalogReadModel["commands"]
  readonly diagnostics: ProductAppCommandCatalogReadModel["diagnostics"]
  readonly lines: readonly string[]
  readonly text: string
}

export interface ProductAppTuiRenderedCommandExecution {
  readonly kind: "product-app-tui.command-execution"
  readonly state: "completed" | "rejected"
  readonly commandId: string
  readonly referenceCount: number
  readonly lines: readonly string[]
  readonly text: string
}

export interface ProductAppTuiRenderedExecutionActivity {
  readonly kind: "product-app-tui.execution-activity"
  readonly state:
    | "submitted"
    | "running"
    | "retrying"
    | "succeeded"
    | "failed"
    | "cancelled"
    | "missing"
    | "unsupported"
  readonly referenceId: string
  readonly schedulerState?: string
  readonly jobKind?: string
  readonly attempt?: number
  readonly maxAttempts?: number
  readonly lines: readonly string[]
  readonly text: string
}
