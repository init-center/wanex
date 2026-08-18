import type {
  ModelEndpointRow,
  ProviderReadinessViewModel,
  SettingsViewModel,
  Snapshot
} from "../model.js"
import { projectPluginSettings } from "../plugins/projection.js"

export function projectSettings(
  snapshot: Omit<Snapshot, "view">,
  state:
    | {
        readonly layout: string
        readonly mode: string
        readonly preferences: {
          readonly theme: string
          readonly density: string
        }
      }
    | undefined
): SettingsViewModel {
  if (snapshot.settings.ok) {
    const settings = snapshot.settings.value
    return {
      profile: {
        ...(settings.profile.activeModelEndpointId === undefined
          ? {}
          : {
              activeModelEndpointId: settings.profile.activeModelEndpointId
            }),
        agentContextConfigured: settings.profile.agentContextConfigured,
        agentContextRevision: settings.profile.agentContextRevision,
        readiness: projectProviderReadiness(snapshot),
        endpointCount: snapshot.modelEndpoints.ok
          ? snapshot.modelEndpoints.value.endpoints.length
          : 0,
        endpoints: snapshot.modelEndpoints.ok
          ? snapshot.modelEndpoints.value.endpoints.map(
              projectModelEndpointRow
            )
          : []
      },
      renderer: {
        layout: settings.renderer.layout,
        mode: settings.renderer.mode,
        theme: settings.renderer.preferences.theme,
        density: settings.renderer.preferences.density,
        availableLayouts: settings.renderer.availableLayouts,
        availableModes: settings.renderer.availableModes,
        availableThemes: settings.renderer.availableThemes,
        availableDensities: settings.renderer.availableDensities
      },
      privacy: {
        exposesStorePath: settings.privacy.exposesStorePath,
        exposesServiceBinaryPath: settings.privacy.exposesServiceBinaryPath,
        exposesSecrets: settings.privacy.exposesSecrets
      },
      integration: {
        rendererCalls: settings.integration.rendererCalls,
        rendererMayOpenStorage: settings.integration.rendererMayOpenStorage,
        rendererMayReceiveStorePath:
          settings.integration.rendererMayReceiveStorePath,
        rendererMayReceiveServiceBinaryPath:
          settings.integration.rendererMayReceiveServiceBinaryPath
      },
      plugins: projectPluginSettings(snapshot.pluginManagement)
    }
  }
  return {
    profile: {
      agentContextConfigured: false,
      agentContextRevision: 0,
      readiness: fallbackProviderReadiness(),
      endpointCount: 0,
      endpoints: []
    },
    renderer: {
      layout: state?.layout ?? "unknown",
      mode: state?.mode ?? "unknown",
      theme: state?.preferences.theme ?? "system",
      density: state?.preferences.density ?? "comfortable",
      availableLayouts: [],
      availableModes: [],
      availableThemes: [],
      availableDensities: []
    },
    privacy: {
      exposesStorePath: false,
      exposesServiceBinaryPath: false,
      exposesSecrets: false
    },
    integration: {
      rendererCalls: "unknown",
      rendererMayOpenStorage: false,
      rendererMayReceiveStorePath: false,
      rendererMayReceiveServiceBinaryPath: false
    },
    plugins: projectPluginSettings(snapshot.pluginManagement)
  }
}

function projectProviderReadiness(
  snapshot: Omit<Snapshot, "view">
): ProviderReadinessViewModel {
  if (!snapshot.home.ok) {
    return fallbackProviderReadiness()
  }
  const readiness = snapshot.home.value.providerReadiness
  return {
    status: readiness.status,
    reason: readiness.reason,
    ...(readiness.activeEndpointId === undefined
      ? {}
      : { activeEndpointId: readiness.activeEndpointId }),
    endpointCount: readiness.endpointCount,
    canRun: readiness.canRun,
    attentionRequired: readiness.attentionRequired,
    requiresCredential: readiness.requiresCredential,
    credentialConfigured: readiness.credentialConfigured
  }
}

function fallbackProviderReadiness(): ProviderReadinessViewModel {
  return {
    status: "unknown",
    reason: "home_unavailable",
    endpointCount: 0,
    canRun: false,
    attentionRequired: true,
    requiresCredential: false,
    credentialConfigured: false
  }
}

function projectModelEndpointRow(
  endpoint: ModelEndpointRow
): ModelEndpointRow {
  return {
    id: endpoint.id,
    connection: { ...endpoint.connection },
    protocol: { ...endpoint.protocol },
    model: {
      ...endpoint.model,
      operations: [...endpoint.model.operations],
      inputModalities: [...endpoint.model.inputModalities],
      outputModalities: [...endpoint.model.outputModalities],
      features: [...endpoint.model.features],
      ...(endpoint.model.limits === undefined
        ? {}
        : { limits: { ...endpoint.model.limits } }),
      ...(endpoint.model.behavior === undefined
        ? {}
        : { behavior: { ...endpoint.model.behavior } }),
      catalog: { ...endpoint.model.catalog }
    },
    credentialConfigured: endpoint.credentialConfigured,
    active: endpoint.active
  }
}

export function projectAttachmentInput(settings: SettingsViewModel): {
  readonly canUpload: boolean
  readonly accept: string
  readonly message: string
} {
  const activeEndpointId = settings.profile.activeModelEndpointId
  const active = settings.profile.endpoints.find(
    (endpoint) => endpoint.id === activeEndpointId && endpoint.active
  )
  if (!settings.profile.readiness.canRun || active === undefined) {
    return {
      canUpload: false,
      accept: "",
      message: "Attachments unavailable until a compatible provider is ready"
    }
  }
  const accepted: string[] = []
  if (active.model.inputModalities.includes("image")) accepted.push("image/*")
  if (active.model.inputModalities.includes("audio")) accepted.push("audio/*")
  if (active.model.inputModalities.includes("video")) accepted.push("video/*")
  if (active.model.inputModalities.includes("document")) {
    accepted.push(
      ".pdf",
      ".txt",
      ".md",
      ".csv",
      ".json",
      ".doc",
      ".docx",
      ".xls",
      ".xlsx",
      ".ppt",
      ".pptx"
    )
  }
  return accepted.length === 0
    ? {
        canUpload: false,
        accept: "",
        message: "The active provider accepts text input only"
      }
    : {
        canUpload: true,
        accept: accepted.join(","),
        message: "Attachments ready"
      }
}
