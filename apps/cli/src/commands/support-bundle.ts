import { buildSupportBundle } from "@wanex/app/diagnostics"
import type { CliDiagnosticsStore } from "../storage.js"

export async function supportBundleValue(
  storage: CliDiagnosticsStore,
  request: {
    readonly providerProfileIds?: readonly string[]
    readonly sessionId?: string
    readonly eventLimit?: number
    readonly jobLimit?: number
    readonly pluginLimit?: number
    readonly memoryMaintenance?: boolean
    readonly staleAfterMs?: number
    readonly policyVersion?: string
    readonly sessionLimit?: number
  }
): Promise<unknown> {
  const bundle = await buildSupportBundle({
    storage,
    ...(request.providerProfileIds === undefined
      ? {}
      : { providerProfileIds: request.providerProfileIds }),
    ...(request.sessionId === undefined ? {} : { sessionId: request.sessionId }),
    ...(request.eventLimit === undefined ? {} : { eventLimit: request.eventLimit }),
    ...(request.jobLimit === undefined ? {} : { jobLimit: request.jobLimit }),
    ...(request.pluginLimit === undefined
      ? {}
      : { pluginLimit: request.pluginLimit }),
    ...(request.memoryMaintenance !== true
      ? {}
      : {
          memoryMaintenance: {
            ...(request.staleAfterMs === undefined
              ? {}
              : { staleAfterMs: request.staleAfterMs }),
            ...(request.policyVersion === undefined
              ? {}
              : { policyVersion: request.policyVersion }),
            ...(request.sessionLimit === undefined
              ? {}
              : { sessionLimit: request.sessionLimit }),
            ...(request.jobLimit === undefined ? {} : { jobLimit: request.jobLimit })
          }
        })
  })
  return {
    command: "support-bundle",
    ...bundle
  }
}
