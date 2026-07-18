import type {
  ProductAppBackendContinueWorkbenchSessionRequest,
  ProductAppBackendContinueWorkbenchSessionResult,
  ProductAppBackendReadWorkbenchRequest,
  ProductAppBackendRunAgentTurnRequest,
  ProductAppBackendSessionInputProvenanceReadModel,
  ProductAppBackendSessionTranscriptReadModel,
  ProductAppBackendWorkbenchReadModel,
  ProductAppBackendWorkbenchSummary
} from "./types.js"

export interface ProductAppBackendWorkbenchHost {
  runAgentTurn(
    request: ProductAppBackendRunAgentTurnRequest
  ): Promise<ProductAppBackendContinueWorkbenchSessionResult["turn"]>
  readSessionTranscript(
    request: ProductAppBackendReadWorkbenchRequest
  ): Promise<ProductAppBackendSessionTranscriptReadModel>
  readSessionInputProvenance(
    request: ProductAppBackendReadWorkbenchRequest
  ): Promise<ProductAppBackendSessionInputProvenanceReadModel>
}

export async function readProductAppBackendWorkbench(
  host: ProductAppBackendWorkbenchHost,
  request: ProductAppBackendReadWorkbenchRequest
): Promise<ProductAppBackendWorkbenchReadModel> {
  const [transcript, provenance] = await Promise.all([
    host.readSessionTranscript({ sessionId: request.sessionId }),
    host.readSessionInputProvenance({ sessionId: request.sessionId })
  ])
  return projectProductAppBackendWorkbench({
    sessionId: request.sessionId,
    transcript,
    provenance
  })
}

export async function continueProductAppBackendWorkbenchSession(
  host: ProductAppBackendWorkbenchHost,
  request: ProductAppBackendContinueWorkbenchSessionRequest
): Promise<ProductAppBackendContinueWorkbenchSessionResult> {
  const turn = await host.runAgentTurn({
    text: request.text,
    sessionId: request.sessionId,
    ...(request.principalId === undefined ? {} : { principalId: request.principalId }),
    ...(request.inputId === undefined ? {} : { inputId: request.inputId }),
    ...(request.idempotencyKey === undefined
      ? {}
      : { idempotencyKey: request.idempotencyKey }),
    ...(request.jobId === undefined ? {} : { jobId: request.jobId }),
    ...(request.jobIdempotencyKey === undefined
      ? {}
      : { jobIdempotencyKey: request.jobIdempotencyKey })
  })
  return {
    kind: "product-app.backend.workbench.continued",
    sessionId: request.sessionId,
    turn,
    workbench: await readProductAppBackendWorkbench(host, {
      sessionId: request.sessionId
    })
  }
}

function projectProductAppBackendWorkbench(options: {
  readonly sessionId: string
  readonly transcript: ProductAppBackendSessionTranscriptReadModel
  readonly provenance: ProductAppBackendSessionInputProvenanceReadModel
}): ProductAppBackendWorkbenchReadModel {
  return {
    kind: "product-app.backend.workbench",
    sessionId: options.sessionId,
    transcript: options.transcript,
    provenance: options.provenance,
    summary: summarizeWorkbench(options.transcript, options.provenance),
    actions: {
      continueCommandId: "product.workbench.continue",
      transcriptCommandId: "product.transcript.read",
      provenanceCommandId: "product.provenance.read"
    }
  }
}

function summarizeWorkbench(
  transcript: ProductAppBackendSessionTranscriptReadModel,
  provenance: ProductAppBackendSessionInputProvenanceReadModel
): ProductAppBackendWorkbenchSummary {
  const inputRows = transcript.rows.filter((row) => row.kind === "input")
  const messageRows = transcript.rows.filter((row) => row.kind === "message")
  const visibleTextRows = transcript.rows.filter(
    (row) => row.text.trim().length > 0
  )
  const latestAssistantText = lastText(
    transcript.rows.filter(
      (row) => row.kind === "message" && row.role === "assistant"
    )
  )
  const latestUserText = lastText(
    transcript.rows.filter(
      (row) => row.kind === "input" && row.role === "user"
    )
  )
  const updatedAt = transcript.rows.map((row) => row.updatedAt)
  const latestUpdatedAt = updatedAt.length === 0
    ? undefined
    : Math.max(...updatedAt)

  return {
    rowCount: transcript.rows.length,
    inputCount: inputRows.length,
    messageCount: messageRows.length,
    visibleTextRows: visibleTextRows.length,
    ...(latestUpdatedAt === undefined ? {} : { latestUpdatedAt }),
    ...(latestAssistantText === undefined ? {} : { latestAssistantText }),
    ...(latestUserText === undefined ? {} : { latestUserText }),
    originKinds: [...new Set(provenance.rows.map((row) => row.kind))].sort()
  }
}

function lastText(
  rows: readonly ProductAppBackendSessionTranscriptReadModel["rows"][number][]
): string | undefined {
  return [...rows].reverse().find((row) => row.text.trim().length > 0)?.text
}
