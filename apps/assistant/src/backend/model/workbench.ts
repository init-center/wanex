import type {
  BackendSessionInputProvenanceReadModel,
  BackendSessionTranscriptReadModel
} from "./read-model.js"

export interface BackendWorkbenchCommands {
  readAssistantWorkbench(
    request: BackendReadWorkbenchRequest
  ): Promise<BackendWorkbenchReadModel>
}

export interface BackendReadWorkbenchRequest {
  readonly sessionId: string
}

export interface BackendWorkbenchReadModel {
  readonly kind: "assistant.backend.workbench"
  readonly sessionId: string
  readonly transcript: BackendSessionTranscriptReadModel
  readonly provenance: BackendSessionInputProvenanceReadModel
  readonly summary: BackendWorkbenchSummary
  readonly actions: BackendWorkbenchActions
}

export interface BackendWorkbenchSummary {
  readonly rowCount: number
  readonly inputCount: number
  readonly messageCount: number
  readonly visibleTextRows: number
  readonly latestUpdatedAt?: number
  readonly latestAssistantText?: string
  readonly latestUserText?: string
  readonly originKinds: readonly string[]
}

export interface BackendWorkbenchActions {
  readonly submitCommandId: "assistant.agent.submit"
  readonly transcriptCommandId: "assistant.transcript.read"
  readonly provenanceCommandId: "assistant.provenance.read"
}
