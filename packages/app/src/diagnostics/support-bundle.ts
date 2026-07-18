import type {
  DoctorReport,
  ProviderProfile,
  RuntimeEvent
} from "@wanex/protocol"
import { providerConfigKey, providerProfileFromJson, redactProfile } from "@wanex/runtime/provider"
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
  readonly providerProfileIds?: readonly string[]
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
  readonly policyVersion?: string
}

export interface SupportBundle {
  readonly generatedAt: number
  readonly doctor: DoctorReport
  readonly diagnostics: AppDiagnosticsSnapshot
  readonly providers: readonly RedactedProviderProfileSummary[]
  readonly events: readonly SupportBundleEventSummary[]
  readonly limits: SupportBundleLimits
}

export interface SupportBundleLimits {
  readonly eventLimit: number
  readonly jobLimit: number
  readonly pluginLimit: number
}

export interface RedactedProviderProfileSummary {
  readonly id: string
  readonly found: boolean
  readonly profile?: ProviderProfile
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
    providers,
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
    readProviderSummaries(options.storage, options.providerProfileIds ?? []),
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
    providers,
    events: events.map(summarizeEvent),
    limits: {
      eventLimit,
      jobLimit,
      pluginLimit
    }
  }
}

async function readProviderSummaries(
  storage: SupportBundleStore,
  profileIds: readonly string[]
): Promise<RedactedProviderProfileSummary[]> {
  return await Promise.all(
    profileIds.map(async (id): Promise<RedactedProviderProfileSummary> => {
      const value = await storage.getConfig(providerConfigKey(id))
      if (value === null) {
        return {
          id,
          found: false
        }
      }
      return {
        id,
        found: true,
        profile: redactProfile(providerProfileFromJson(value))
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
