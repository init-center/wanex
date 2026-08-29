import type {
  OpenWorkbenchResult
} from "@wanex/assistant/surface"
import type {
  WorkbenchSourceResult,
  WorkbenchSummary,
  WorkbenchTranscriptRow,
  WorkbenchViewModel
} from "../model.js"

type OpenedWorkbenchResult = Extract<
  OpenWorkbenchResult,
  { readonly kind: "assistant.workbench.opened" }
>
type WorkbenchReadModel = OpenedWorkbenchResult["workbench"]
type WorkbenchTranscriptSourceRow =
  WorkbenchReadModel["transcript"]["rows"][number]

export function idleWorkbench(
  selectedSessionId: string | undefined
): WorkbenchViewModel {
  return baseWorkbench({
    state: "idle",
    ...(selectedSessionId === undefined ? {} : { sessionId: selectedSessionId }),
    canOpen: selectedSessionId !== undefined
  })
}

export function normalizeWorkbenchForSelectedSession(
  workbench: WorkbenchViewModel,
  selectedSessionId: string | undefined
): WorkbenchViewModel {
  if (selectedSessionId === undefined) {
    if (workbench.state === "idle") {
      return idleWorkbench(undefined)
    }
    if (workbench.state === "failed") {
      return workbench
    }
    return baseWorkbench({
      state: "no-session",
      message: "select a session before opening the workbench",
      canOpen: false
    })
  }
  if (workbench.sessionId !== undefined && workbench.sessionId !== selectedSessionId) {
    return idleWorkbench(selectedSessionId)
  }
  if (workbench.state === "no-session") {
    return idleWorkbench(selectedSessionId)
  }
  return {
    ...workbench,
    sessionId: workbench.sessionId ?? selectedSessionId,
    canOpen: true
  }
}

export function projectWorkbenchFromResult(
  result: WorkbenchSourceResult
): WorkbenchViewModel {
  switch (result.kind) {
    case "assistant.workbench.opened":
      return readyWorkbench({
        sessionId: result.sessionId,
        workbench: result.workbench
      })
    case "assistant.workbench.no-session":
      return baseWorkbench({
        state: "no-session",
        message: result.message,
        canOpen: false
      })
    case "assistant.workbench.failed":
      return baseWorkbench({
        state: "failed",
        ...(result.sessionId === undefined ? {} : { sessionId: result.sessionId }),
        message: result.error.message,
        error: {
          code: result.error.code,
          category: result.error.category,
          message: result.error.message
        },
        canOpen: true
      })
  }
}

function readyWorkbench(request: {
  readonly sessionId: string
  readonly workbench: WorkbenchReadModel
}): WorkbenchViewModel {
  const summary = request.workbench.summary
  const provenanceOriginKinds = Array.from(
    new Set(request.workbench.provenance.rows.map((row) => row.kind))
  ).sort()

  return {
    kind: "web.workbench",
    state: "ready",
    sessionId: request.sessionId,
    summary: {
      rowCount: summary.rowCount,
      inputCount: summary.inputCount,
      messageCount: summary.messageCount,
      visibleTextRows: summary.visibleTextRows,
      ...(summary.latestUpdatedAt === undefined
        ? {}
        : { latestUpdatedAt: summary.latestUpdatedAt }),
      ...(summary.latestAssistantText === undefined
        ? {}
        : { latestAssistantText: summary.latestAssistantText }),
      ...(summary.latestUserText === undefined
        ? {}
        : { latestUserText: summary.latestUserText }),
      originKinds: [...summary.originKinds]
    },
    provenance: {
      rowCount: request.workbench.provenance.rows.length,
      hasClientField: request.workbench.provenance.hasClientField,
      originKinds: provenanceOriginKinds
    },
    rows: request.workbench.transcript.rows.map(projectTranscriptRow),
    canOpen: true
  }
}

function projectTranscriptRow(
  row: WorkbenchTranscriptSourceRow
): WorkbenchTranscriptRow {
  return {
    id: row.id,
    kind: row.kind,
    role: row.role,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    text: row.text,
    partCount: row.parts.length,
    ...(row.inputId === undefined ? {} : { inputId: row.inputId }),
    ...(row.turnId === undefined ? {} : { turnId: row.turnId }),
    ...(row.attemptId === undefined ? {} : { attemptId: row.attemptId })
  }
}

function baseWorkbench(request: {
  readonly state: WorkbenchViewModel["state"]
  readonly sessionId?: string
  readonly message?: string
  readonly error?: WorkbenchViewModel["error"]
  readonly canOpen: boolean
}): WorkbenchViewModel {
  return {
    kind: "web.workbench",
    state: request.state,
    ...(request.sessionId === undefined ? {} : { sessionId: request.sessionId }),
    ...(request.message === undefined ? {} : { message: request.message }),
    ...(request.error === undefined ? {} : { error: request.error }),
    summary: emptySummary(),
    provenance: {
      rowCount: 0,
      hasClientField: false,
      originKinds: []
    },
    rows: [],
    canOpen: request.canOpen
  }
}

function emptySummary(): WorkbenchSummary {
  return {
    rowCount: 0,
    inputCount: 0,
    messageCount: 0,
    visibleTextRows: 0,
    originKinds: []
  }
}
