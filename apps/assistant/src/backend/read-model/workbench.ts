import type {
  BackendReadWorkbenchRequest,
  BackendSessionInputProvenanceReadModel,
  BackendSessionTranscriptReadModel,
  BackendWorkbenchReadModel,
  BackendWorkbenchSummary
} from "../model/index.js"

export interface BackendWorkbenchHost {
  readSessionTranscript(
    request: BackendReadWorkbenchRequest
  ): Promise<BackendSessionTranscriptReadModel>
  readSessionInputProvenance(
    request: BackendReadWorkbenchRequest
  ): Promise<BackendSessionInputProvenanceReadModel>
}

export async function readBackendWorkbench(
  host: BackendWorkbenchHost,
  request: BackendReadWorkbenchRequest
): Promise<BackendWorkbenchReadModel> {
  const [transcript, provenance] = await Promise.all([
    host.readSessionTranscript({ sessionId: request.sessionId }),
    host.readSessionInputProvenance({ sessionId: request.sessionId })
  ])
  return projectBackendWorkbench({
    sessionId: request.sessionId,
    transcript,
    provenance
  })
}

function projectBackendWorkbench(options: {
  readonly sessionId: string
  readonly transcript: BackendSessionTranscriptReadModel
  readonly provenance: BackendSessionInputProvenanceReadModel
}): BackendWorkbenchReadModel {
  return {
    kind: "assistant.backend.workbench",
    sessionId: options.sessionId,
    transcript: options.transcript,
    provenance: options.provenance,
    summary: summarizeWorkbench(options.transcript, options.provenance),
    actions: {
      submitCommandId: "assistant.agent.submit",
      transcriptCommandId: "assistant.transcript.read",
      provenanceCommandId: "assistant.provenance.read"
    }
  }
}

function summarizeWorkbench(
  transcript: BackendSessionTranscriptReadModel,
  provenance: BackendSessionInputProvenanceReadModel
): BackendWorkbenchSummary {
  const inputRows = transcript.rows.filter(
    (row) => row.kind === "input" || (row.kind === "message" && row.role === "user")
  )
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
      (row) =>
        row.role === "user" && (row.kind === "input" || row.kind === "message")
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
  rows: readonly BackendSessionTranscriptReadModel["rows"][number][]
): string | undefined {
  return [...rows].reverse().find((row) => row.text.trim().length > 0)?.text
}
