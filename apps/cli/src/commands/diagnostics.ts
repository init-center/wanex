import {
  buildAppDiagnosticsSnapshot,
  getMemoryMaintenanceDiagnosticsSnapshot
} from "@wanex/app/diagnostics"
import type { CliDiagnosticsStore } from "../storage.js"

export async function diagnosticsValue(
  storage: CliDiagnosticsStore,
  request: {
    readonly includeConfigReloads?: boolean
    readonly memoryMaintenance?: boolean
    readonly staleAfterMs?: number
    readonly sessionLimit?: number
    readonly jobLimit?: number
    readonly pluginLimit?: number
  }
): Promise<unknown> {
  const now = Date.now()
  const [jobs, manifests, installs, memoryMaintenance] = await Promise.all([
    storage.listJobs({ limit: request.jobLimit ?? 50 }),
    storage.listPluginManifests({ limit: request.pluginLimit ?? 50 }),
    storage.listPluginInstalls({ limit: request.pluginLimit ?? 50 }),
    request.memoryMaintenance !== true
      ? Promise.resolve(undefined)
      : getMemoryMaintenanceDiagnosticsSnapshot({
          storage,
          now,
          ...(request.staleAfterMs === undefined
            ? {}
            : { staleAfterMs: request.staleAfterMs }),
          ...(request.sessionLimit === undefined
            ? {}
            : { sessionLimit: request.sessionLimit }),
          ...(request.jobLimit === undefined ? {} : { jobLimit: request.jobLimit })
        })
  ])
  const snapshot = buildAppDiagnosticsSnapshot({
    now,
    jobs,
    plugin: {
      manifests,
      installs
    },
    ...(memoryMaintenance === undefined
      ? {}
      : {
          memoryMaintenance: {
            diagnostics: memoryMaintenance.diagnostics,
            activity: memoryMaintenance.activity
          }
        })
  })
  return {
    command: "diagnostics",
    generatedAt: snapshot.generatedAt,
    diagnostics: snapshot.diagnostics,
    activity: snapshot.activity
  }
}
