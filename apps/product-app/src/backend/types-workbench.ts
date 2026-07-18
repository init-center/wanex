import type {
  ProductAppBackendRunAgentTurnResult
} from "./types-app.js"
import type {
  ProductAppBackendSessionInputProvenanceReadModel,
  ProductAppBackendSessionTranscriptReadModel
} from "./types-read-model.js"

export interface ProductAppBackendWorkbenchCommands {
  readProductWorkbench(
    request: ProductAppBackendReadWorkbenchRequest
  ): Promise<ProductAppBackendWorkbenchReadModel>
  continueProductWorkbenchSession(
    request: ProductAppBackendContinueWorkbenchSessionRequest
  ): Promise<ProductAppBackendContinueWorkbenchSessionResult>
}

export interface ProductAppBackendReadWorkbenchRequest {
  readonly sessionId: string
}

export interface ProductAppBackendContinueWorkbenchSessionRequest {
  readonly sessionId: string
  readonly text: string
  readonly principalId?: string
  readonly inputId?: string
  readonly idempotencyKey?: string
  readonly jobId?: string
  readonly jobIdempotencyKey?: string
}

export interface ProductAppBackendContinueWorkbenchSessionResult {
  readonly kind: "product-app.backend.workbench.continued"
  readonly sessionId: string
  readonly turn: ProductAppBackendRunAgentTurnResult
  readonly workbench: ProductAppBackendWorkbenchReadModel
}

export interface ProductAppBackendWorkbenchReadModel {
  readonly kind: "product-app.backend.workbench"
  readonly sessionId: string
  readonly transcript: ProductAppBackendSessionTranscriptReadModel
  readonly provenance: ProductAppBackendSessionInputProvenanceReadModel
  readonly summary: ProductAppBackendWorkbenchSummary
  readonly actions: ProductAppBackendWorkbenchActions
}

export interface ProductAppBackendWorkbenchSummary {
  readonly rowCount: number
  readonly inputCount: number
  readonly messageCount: number
  readonly visibleTextRows: number
  readonly latestUpdatedAt?: number
  readonly latestAssistantText?: string
  readonly latestUserText?: string
  readonly originKinds: readonly string[]
}

export interface ProductAppBackendWorkbenchActions {
  readonly continueCommandId: "product.workbench.continue"
  readonly transcriptCommandId: "product.transcript.read"
  readonly provenanceCommandId: "product.provenance.read"
}
