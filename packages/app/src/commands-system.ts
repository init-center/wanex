import { buildSupportBundle as buildColdSupportBundle } from "./diagnostics/index.js"
import { resolveRuntimeHostDiagnostics } from "@wanex/runtime/host"
import {
  projectWanexAppRecentSessionsReadModel,
  projectWanexAppSessionInputProvenanceReadModel,
  projectWanexAppSessionTranscriptReadModel
} from "./read-model.js"
import { runWanexAppSafeCommand } from "./result-envelope.js"
import type { WanexAppCommandContext } from "./command-context.js"
import type { WanexAppDiagnosticsCommands } from "./types-diagnostics.js"
import type { WanexAppLifecycleCommands } from "./types-lifecycle.js"
import type { WanexAppReadModelCommands } from "./types-read-model.js"
import type { WanexAppResultEnvelopeCommands } from "./types-result-envelope.js"

export type WanexAppSystemCommandGroup =
  WanexAppDiagnosticsCommands &
    WanexAppReadModelCommands &
    WanexAppResultEnvelopeCommands &
    WanexAppLifecycleCommands

export function createWanexAppSystemCommands(
  context: WanexAppCommandContext,
  isDisposed: () => boolean
): WanexAppSystemCommandGroup {
  return {
    async readDiagnostics(diagnosticsOptions = {}) {
      context.assertActive()
      return await context.runtime.app.getDiagnostics({
        jobLimit: 50,
        pluginLimit: 50,
        ...(diagnosticsOptions.runtimeHost === undefined
          ? {}
          : { runtimeHost: diagnosticsOptions.runtimeHost }),
        ...(diagnosticsOptions.now === undefined
          ? {}
          : { now: diagnosticsOptions.now })
      })
    },
    async buildSupportBundle(bundleOptions = {}) {
      context.assertActive()
      const activeProviderProfileId =
        await context.refreshActiveProviderProfileId()
      const runtimeHostDiagnostics =
        bundleOptions.runtimeHost === undefined
          ? undefined
          : await resolveRuntimeHostDiagnostics(bundleOptions.runtimeHost, {
              ...(bundleOptions.now === undefined
                ? {}
                : { now: bundleOptions.now }),
              jobLimit: bundleOptions.jobLimit ?? 20
            })
      return await buildColdSupportBundle({
        storage: context.runtime.app.storage,
        providerProfileIds: [activeProviderProfileId],
        eventLimit: bundleOptions.eventLimit ?? 20,
        jobLimit: bundleOptions.jobLimit ?? 20,
        pluginLimit: 20,
        ...(runtimeHostDiagnostics === undefined
          ? {}
          : {
              runtimeHost: runtimeHostDiagnostics.summary,
              ...(runtimeHostDiagnostics.health === undefined
                ? {}
                : { runtimeHostHealth: runtimeHostDiagnostics.health })
            }),
        ...(bundleOptions.now === undefined ? {} : { now: bundleOptions.now })
      })
    },
    async readRecentSessions(request = {}) {
      context.assertActive()
      const limit = normalizeRecentSessionLimit(request.limit)
      const sessions = await context.runtime.storage.listSessions({
        ...(request.kind === undefined ? {} : { kind: request.kind }),
        ...(request.status === undefined ? {} : { status: request.status }),
        limit
      })
      return projectWanexAppRecentSessionsReadModel(sessions, limit)
    },
    async readSessionInputProvenance(request) {
      context.assertActive()
      const inputs = await context.runtime.storage.listSessionInputs({
        sessionId: request.sessionId
      })
      return projectWanexAppSessionInputProvenanceReadModel(
        request.sessionId,
        inputs
      )
    },
    async readSessionTranscript(request) {
      context.assertActive()
      const [inputs, messages] = await Promise.all([
        context.runtime.storage.listSessionInputs({
          sessionId: request.sessionId
        }),
        context.runtime.storage.listSessionMessages({
          sessionId: request.sessionId
        })
      ])
      return projectWanexAppSessionTranscriptReadModel(
        request.sessionId,
        {
          inputs,
          messages
        }
      )
    },
    async readExtensionContributions() {
      context.assertActive()
      return context.extensions.readModel()
    },
    async safeCommand(request) {
      return await runWanexAppSafeCommand(request)
    },
    async shutdown() {
      const repeated = isDisposed()
      await context.dispose()
      return {
        disposed: true,
        repeated
      }
    }
  }
}

function normalizeRecentSessionLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return 10
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("recent session limit must be a positive integer")
  }
  return limit
}
