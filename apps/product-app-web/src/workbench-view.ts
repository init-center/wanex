import type {
  ProductAppOpenWorkbenchResult
} from "@wanex/product-app/surface-client"
import type {
  ProductAppWebWorkbenchSourceResult,
  ProductAppWebWorkbenchSummary,
  ProductAppWebWorkbenchTranscriptRow,
  ProductAppWebWorkbenchViewModel
} from "./types.js"

type ProductAppOpenedWorkbenchResult = Extract<
  ProductAppOpenWorkbenchResult,
  { readonly kind: "product-app.workbench.opened" }
>
type ProductAppWorkbenchReadModel = ProductAppOpenedWorkbenchResult["workbench"]
type ProductAppWorkbenchTranscriptSourceRow =
  ProductAppWorkbenchReadModel["transcript"]["rows"][number]

export function idleProductAppWebWorkbench(
  selectedSessionId: string | undefined
): ProductAppWebWorkbenchViewModel {
  return baseWorkbench({
    state: "idle",
    ...(selectedSessionId === undefined ? {} : { sessionId: selectedSessionId }),
    canOpen: selectedSessionId !== undefined,
    canContinue: false
  })
}

export function normalizeProductAppWebWorkbenchForSelectedSession(
  workbench: ProductAppWebWorkbenchViewModel,
  selectedSessionId: string | undefined
): ProductAppWebWorkbenchViewModel {
  if (selectedSessionId === undefined) {
    if (workbench.state === "idle") {
      return idleProductAppWebWorkbench(undefined)
    }
    if (workbench.state === "failed") {
      return workbench
    }
    return baseWorkbench({
      state: "no-session",
      message: "select a session before opening the workbench",
      canOpen: false,
      canContinue: false
    })
  }
  if (workbench.sessionId !== undefined && workbench.sessionId !== selectedSessionId) {
    return idleProductAppWebWorkbench(selectedSessionId)
  }
  if (workbench.state === "no-session") {
    return idleProductAppWebWorkbench(selectedSessionId)
  }
  return {
    ...workbench,
    sessionId: workbench.sessionId ?? selectedSessionId,
    canOpen: true,
    canContinue: workbench.state === "ready"
  }
}

export function productAppWebWorkbenchFromResult(
  result: ProductAppWebWorkbenchSourceResult
): ProductAppWebWorkbenchViewModel {
  switch (result.kind) {
    case "product-app.workbench.opened":
      return readyWorkbench({
        sessionId: result.sessionId,
        workbench: result.workbench
      })
    case "product-app.workbench.started":
      return readyWorkbench({
        sessionId: result.sessionId,
        workbench: result.workbench
      })
    case "product-app.workbench.continued":
      return readyWorkbench({
        sessionId: result.sessionId,
        workbench: result.result.workbench
      })
    case "product-app.workbench.no-session":
      return baseWorkbench({
        state: "no-session",
        message: result.message,
        canOpen: false,
        canContinue: false
      })
    case "product-app.workbench.failed":
      return baseWorkbench({
        state: "failed",
        ...(result.sessionId === undefined ? {} : { sessionId: result.sessionId }),
        message: result.error.message,
        error: {
          code: result.error.code,
          category: result.error.category,
          message: result.error.message
        },
        canOpen: true,
        canContinue: false
      })
  }
}

function readyWorkbench(request: {
  readonly sessionId: string
  readonly workbench: ProductAppWorkbenchReadModel
}): ProductAppWebWorkbenchViewModel {
  const summary = request.workbench.summary
  const provenanceOriginKinds = Array.from(
    new Set(request.workbench.provenance.rows.map((row) => row.kind))
  ).sort()

  return {
    kind: "product-app-web.workbench",
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
      hasProductClientField: request.workbench.provenance.hasProductClientField,
      originKinds: provenanceOriginKinds
    },
    rows: request.workbench.transcript.rows.map(projectTranscriptRow),
    canOpen: true,
    canContinue: true
  }
}

function projectTranscriptRow(
  row: ProductAppWorkbenchTranscriptSourceRow
): ProductAppWebWorkbenchTranscriptRow {
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
    ...(row.runId === undefined ? {} : { runId: row.runId })
  }
}

function baseWorkbench(request: {
  readonly state: ProductAppWebWorkbenchViewModel["state"]
  readonly sessionId?: string
  readonly message?: string
  readonly error?: ProductAppWebWorkbenchViewModel["error"]
  readonly canOpen: boolean
  readonly canContinue: boolean
}): ProductAppWebWorkbenchViewModel {
  return {
    kind: "product-app-web.workbench",
    state: request.state,
    ...(request.sessionId === undefined ? {} : { sessionId: request.sessionId }),
    ...(request.message === undefined ? {} : { message: request.message }),
    ...(request.error === undefined ? {} : { error: request.error }),
    summary: emptySummary(),
    provenance: {
      rowCount: 0,
      hasProductClientField: false,
      originKinds: []
    },
    rows: [],
    canOpen: request.canOpen,
    canContinue: request.canContinue
  }
}

function emptySummary(): ProductAppWebWorkbenchSummary {
  return {
    rowCount: 0,
    inputCount: 0,
    messageCount: 0,
    visibleTextRows: 0,
    originKinds: []
  }
}
