import { WanexRuntimeHost } from "./host.js"
import type { RuntimeHostJobSummary } from "./job-summary.js"
import type {
  RuntimeHostHealthSnapshot,
  RuntimeHostJobSummaryRequest
} from "./types.js"

export type RuntimeHostDiagnosticsInput =
  | WanexRuntimeHost
  | RuntimeHostJobSummary

export interface RuntimeHostDiagnosticsSnapshot {
  readonly summary: RuntimeHostJobSummary
  readonly health?: RuntimeHostHealthSnapshot
}

export async function resolveRuntimeHostDiagnostics(
  runtimeHost: RuntimeHostDiagnosticsInput,
  request: RuntimeHostJobSummaryRequest = {}
): Promise<RuntimeHostDiagnosticsSnapshot> {
  if (runtimeHost instanceof WanexRuntimeHost) {
    const [summary, health] = await Promise.all([
      runtimeHost.getJobSummary(request),
      Promise.resolve(
        runtimeHost.getHealthSnapshot(
          request.now === undefined ? {} : { now: request.now }
        )
      )
    ])
    return { summary, health }
  }
  return { summary: runtimeHost }
}
