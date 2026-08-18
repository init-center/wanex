import type {
  HomeReadModel,
  HomeOptions,
  CancelTrackedConversationOperationResult,
  CommandCatalogReadModel,
  ConversationOperationReadModel,
  OpenWorkbenchResult,
  ReadTrackedConversationOperationResult,
  ReadGoalResult,
  RegenerateTrackedConversationOperationResult,
  SettingsReadModel,
  SideQueryReadModel,
  ShellStatus,
  SubmitConversationOperationResult,
  SteerTrackedConversationOperationResult,
  SurfaceClient,
  SurfaceClientCommandEnvelope,
  SurfaceClientDescriptorResult,
  SurfaceClientEventsResult
} from "@wanex/product/surface"
export interface CreateTuiSurfaceOptions {
  readonly client: SurfaceClient
  readonly homeOptions?: HomeOptions
  readonly eventLimit?: number
  readonly now?: () => number
}

export interface TuiSurface {
  readonly client: SurfaceClient
  snapshot(): TuiSurfaceSnapshot
  refresh(
    options?: HomeOptions
  ): Promise<TuiSurfaceSnapshot>
}

export interface TuiSurfaceSnapshot {
  readonly kind: "tui.snapshot"
  readonly generatedAt: number
  readonly descriptor: SurfaceClientDescriptorResult
  readonly status: SurfaceClientCommandEnvelope<ShellStatus>
  readonly home: SurfaceClientCommandEnvelope<HomeReadModel>
  readonly settings: SurfaceClientCommandEnvelope<SettingsReadModel>
  readonly commandCatalog: SurfaceClientCommandEnvelope<CommandCatalogReadModel>
  readonly conversation: SurfaceClientCommandEnvelope<ReadTrackedConversationOperationResult>
  readonly goal: SurfaceClientCommandEnvelope<ReadGoalResult>
  readonly events: SurfaceClientEventsResult
  readonly diagnostics: readonly TuiDiagnostic[]
}

export interface TuiDiagnostic {
  readonly code: TuiDiagnosticCode
  readonly severity: "info" | "warning" | "error"
  readonly message: string
  readonly command?: string
}

export type TuiDiagnosticCode =
  | "tui.descriptor_failed"
  | "tui.status_failed"
  | "tui.home_failed"
  | "tui.settings_failed"
  | "tui.command_catalog_failed"
  | "tui.conversation_failed"
  | "tui.goal_failed"
  | "tui.events_failed"
  | "tui.invalid_input"
  | "tui.unknown_command"

export interface TuiRenderedFrame {
  readonly kind: "tui.frame"
  readonly generatedAt: number
  readonly title: string
  readonly ready: boolean
  readonly mode: string
  readonly layout: string
  readonly selectedSessionId?: string
  readonly commandCount: number
  readonly productCommandCount: number
  readonly statusCount: number
  readonly diagnosticCount: number
  readonly eventCount: number
  readonly lines: readonly string[]
  readonly text: string
}

export interface TuiLineSessionOptions {
  readonly surface: TuiSurface
  readonly input: AsyncIterable<string>
  readonly write: (chunk: string) => void | Promise<void>
  readonly attachmentHost?: TuiAttachmentHost
}

export interface TuiAttachmentHost {
  attachPath(request: {
    readonly path: string
    readonly sessionId?: string
  }): Promise<{
    readonly resourceId: string
    readonly label?: string
  }>
}

export interface TuiLineSessionResult {
  readonly kind: "tui.line-session"
  readonly handledLineCount: number
  readonly commandCount: number
  readonly askCommandCount: number
  readonly steerCommandCount: number
  readonly attachCommandCount: number
  readonly selectCommandCount: number
  readonly workbenchCommandCount: number
  readonly operationCommandCount: number
  readonly cancelCommandCount: number
  readonly regenerateCommandCount: number
  readonly approvalCommandCount: number
  readonly catalogCommandCount: number
  readonly previewCommandCount: number
  readonly executeCommandCount: number
  readonly executionCommandCount: number
  readonly eventsCommandCount: number
  readonly sideQueryCommandCount: number
  readonly goalCommandCount: number
  readonly blockedCommandCount: number
  readonly errorCount: number
  readonly quit: boolean
  readonly activeSessionId?: string
}

export type TuiWorkbench = OpenWorkbenchResult

export interface TuiRenderedWorkbench {
  readonly kind: "tui.workbench"
  readonly sourceKind: TuiWorkbench["kind"]
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

export type TuiConversationOperation =
  | SubmitConversationOperationResult
  | SteerTrackedConversationOperationResult
  | ReadTrackedConversationOperationResult
  | CancelTrackedConversationOperationResult
  | RegenerateTrackedConversationOperationResult

export interface TuiRenderedConversationOperation {
  readonly kind: "tui.conversation-operation"
  readonly sourceKind: TuiConversationOperation["kind"]
  readonly state: string
  readonly sessionId?: string
  readonly operationId?: string
  readonly rowCount: number
  readonly cancellable: boolean
  readonly steerable: boolean
  readonly regeneratable: boolean
  readonly terminal: boolean
  readonly lines: readonly string[]
  readonly text: string
}

export type TuiConversationOperationReadModel =
  ConversationOperationReadModel

export interface TuiRenderedSideQuery {
  readonly kind: "tui.side-query"
  readonly state: SideQueryReadModel["state"]
  readonly queryId: string
  readonly sessionId: string
  readonly lines: readonly string[]
  readonly text: string
}

export interface TuiRenderedEvents {
  readonly kind: "tui.events"
  readonly ok: boolean
  readonly eventCount: number
  readonly limit?: number
  readonly lines: readonly string[]
  readonly text: string
}

export interface TuiRenderedCommandCatalog {
  readonly kind: "tui.command-catalog"
  readonly ok: boolean
  readonly commandCount: number
  readonly diagnosticCount: number
  readonly commands: CommandCatalogReadModel["commands"]
  readonly diagnostics: CommandCatalogReadModel["diagnostics"]
  readonly lines: readonly string[]
  readonly text: string
}

export interface TuiRenderedCommandExecution {
  readonly kind: "tui.command-execution"
  readonly state: "completed" | "rejected"
  readonly commandId: string
  readonly referenceCount: number
  readonly lines: readonly string[]
  readonly text: string
}

export interface TuiRenderedExecutionActivity {
  readonly kind: "tui.execution-activity"
  readonly state:
    | "submitted"
    | "running"
    | "waiting"
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
