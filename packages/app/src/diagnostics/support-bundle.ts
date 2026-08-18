import type {
  DoctorReport,
  RuntimeEvent
} from "@wanex/protocol"
import {
  modelEndpointConfigKey,
  modelEndpointFromJson,
  summarizeModelEndpoint,
  type ModelEndpointSummary
} from "@wanex/runtime/provider"
import type { CoreStore } from "@wanex/storage"
import type { PluginStore } from "@wanex/storage/plugin"
import {
  buildAppDiagnosticsSnapshot
} from "./diagnostics.js"
import type {
  AppDiagnosticsSnapshot,
  BuildAppDiagnosticsSnapshotInput
} from "./diagnostics-types.js"
import { getMemoryMaintenanceDiagnosticsSnapshot } from "./memory-diagnostics.js"

type SupportBundleStore = CoreStore & PluginStore

export interface SupportBundleOptions
  extends Pick<
    BuildAppDiagnosticsSnapshotInput,
    "now" | "runtimeHost" | "runtimeHostHealth"
  > {
  readonly storage: SupportBundleStore
  readonly modelEndpointIds?: readonly string[]
  readonly eventLimit?: number
  readonly jobLimit?: number
  readonly pluginLimit?: number
  readonly sessionId?: string
  readonly memoryMaintenance?: boolean | SupportBundleMemoryOptions
}

export interface SupportBundleMemoryOptions {
  readonly sessionLimit?: number
  readonly jobLimit?: number
  readonly staleAfterMs?: number
}

export interface SupportBundle {
  readonly generatedAt: number
  readonly doctor: DoctorReport
  readonly diagnostics: AppDiagnosticsSnapshot
  readonly modelEndpoints: readonly SupportBundleModelEndpointSummary[]
  readonly events: readonly SupportBundleEventSummary[]
  readonly limits: SupportBundleLimits
}

export interface SupportBundleLimits {
  readonly eventLimit: number
  readonly jobLimit: number
  readonly pluginLimit: number
}

export interface SupportBundleModelEndpointSummary {
  readonly id: string
  readonly found: boolean
  readonly endpoint?: ModelEndpointSummary
}

export interface SupportBundleEventSummary {
  readonly id: string
  readonly type: string
  readonly occurredAt: number
  readonly scope: RuntimeEvent["scope"]
}

const defaultEventLimit = 50
const defaultJobLimit = 50
const defaultPluginLimit = 50

export async function buildSupportBundle(
  options: SupportBundleOptions
): Promise<SupportBundle> {
  const generatedAt = options.now ?? Date.now()
  const eventLimit = options.eventLimit ?? defaultEventLimit
  const jobLimit = options.jobLimit ?? defaultJobLimit
  const pluginLimit = options.pluginLimit ?? defaultPluginLimit
  const memoryOptions =
    options.memoryMaintenance === true
      ? {}
      : options.memoryMaintenance === false
        ? undefined
        : options.memoryMaintenance

  const [
    doctor,
    jobs,
    manifests,
    installs,
    events,
    modelEndpoints,
    memoryMaintenance
  ] = await Promise.all([
    options.storage.doctor(),
    options.storage.listJobs({ limit: jobLimit }),
    options.storage.listPluginManifests({ limit: pluginLimit }),
    options.storage.listPluginInstalls({ limit: pluginLimit }),
    options.storage.queryEvents({
      ...(options.sessionId === undefined
        ? {}
        : { scope: { sessionId: options.sessionId } }),
      limit: eventLimit
    }),
    readModelEndpointSummaries(options.storage, options.modelEndpointIds ?? []),
    memoryOptions === undefined
      ? Promise.resolve(undefined)
      : getMemoryMaintenanceDiagnosticsSnapshot({
          storage: options.storage,
          ...memoryOptions,
          now: generatedAt
        })
  ])

  const diagnostics = buildAppDiagnosticsSnapshot({
    now: generatedAt,
    jobs,
    plugin: {
      manifests,
      installs
    },
    ...(options.runtimeHost === undefined
      ? {}
      : { runtimeHost: options.runtimeHost }),
    ...(options.runtimeHostHealth === undefined
      ? {}
      : { runtimeHostHealth: options.runtimeHostHealth }),
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
    generatedAt,
    doctor,
    diagnostics,
    modelEndpoints,
    events: events.map(summarizeEvent),
    limits: {
      eventLimit,
      jobLimit,
      pluginLimit
    }
  }
}

async function readModelEndpointSummaries(
  storage: SupportBundleStore,
  endpointIds: readonly string[]
): Promise<SupportBundleModelEndpointSummary[]> {
  return await Promise.all(
    endpointIds.map(async (id): Promise<SupportBundleModelEndpointSummary> => {
      const value = await storage.getConfig(modelEndpointConfigKey(id))
      if (value === null) {
        return {
          id,
          found: false
        }
      }
      return {
        id,
        found: true,
        endpoint: summarizeModelEndpoint(modelEndpointFromJson(value))
      }
    })
  )
}

function summarizeEvent(event: RuntimeEvent): SupportBundleEventSummary {
  return {
    id: event.id,
    type: event.type,
    occurredAt: event.occurredAt,
    scope: event.scope
  }
}
