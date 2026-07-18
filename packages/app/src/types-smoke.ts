import type { AppDiagnosticsSnapshot } from "@wanex/app/diagnostics"
import type { WanexAppShellRunAgentTurnResult } from "./types-agent.js"
import type { WanexAppShellOptions } from "./types-app.js"
import type { WanexAppShellShutdownResult } from "./types-lifecycle.js"
import type { WanexAppShellProviderProfileReadModel } from "./types-provider-profile.js"
import type { WanexAppShellSessionInputProvenanceReadModel } from "./types-read-model.js"

export interface WanexAppShellSmokeRequest extends WanexAppShellOptions {
  readonly text?: string
}

export interface WanexAppShellSmokeResult {
  readonly run: WanexAppShellRunAgentTurnResult
  readonly diagnostics: AppDiagnosticsSnapshot
  readonly provider: WanexAppShellProviderProfileReadModel
  readonly provenance: WanexAppShellSessionInputProvenanceReadModel
  readonly shutdown: WanexAppShellShutdownResult
}
