import type { AppDiagnosticsSnapshot } from "./diagnostics/index.js"
import type { WanexAppRunAgentTurnResult } from "./types-agent.js"
import type { WanexAppOptions } from "./types-app.js"
import type { WanexAppShutdownResult } from "./types-lifecycle.js"
import type { WanexAppModelEndpointReadModel } from "./types-model-endpoint.js"
import type { WanexAppSessionInputProvenanceReadModel } from "./types-read-model.js"

export interface WanexAppSmokeRequest
  extends Omit<WanexAppOptions, "modelEndpoint"> {
  readonly modelEndpoint: NonNullable<WanexAppOptions["modelEndpoint"]>
  readonly text?: string
}

export interface WanexAppSmokeResult {
  readonly run: WanexAppRunAgentTurnResult
  readonly diagnostics: AppDiagnosticsSnapshot
  readonly provider: WanexAppModelEndpointReadModel
  readonly provenance: WanexAppSessionInputProvenanceReadModel
  readonly shutdown: WanexAppShutdownResult
}
