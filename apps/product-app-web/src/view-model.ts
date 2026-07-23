import type {
  ProductAppWebActionDescriptor,
  ProductAppWebDiagnostic,
  ProductAppWebProviderProfileRow,
  ProductAppWebProviderReadinessViewModel,
  ProductAppWebSnapshot,
  ProductAppWebSettingsViewModel,
  ProductAppWebViewModel
} from "./types.js"
import {
  projectProductAppWebProviderRunGate
} from "./provider-run-gate-view.js"
import {
  projectProductAppWebRecentSessions,
  selectedProductAppWebSessionTitle
} from "./session-view.js"
import { projectProductAppWebCommandCatalog } from "./command-catalog-view.js"

const BASE_ACTIONS: readonly ProductAppWebActionDescriptor[] = [
  {
    id: "refresh",
    label: "Refresh",
    mutatesState: false,
    fields: []
  },
  {
    id: "set-layout",
    label: "Set layout",
    mutatesState: true,
    fields: [
      {
        name: "layout",
        label: "Layout",
        required: true,
        kind: "select",
        options: [
          { value: "single", label: "Single" },
          { value: "split", label: "Split" },
          { value: "diagnostics", label: "Diagnostics" }
        ]
      }
    ]
  },
  {
    id: "set-mode",
    label: "Set mode",
    mutatesState: true,
    fields: [
      {
        name: "mode",
        label: "Mode",
        required: true,
        kind: "select",
        options: [
          { value: "chat", label: "Chat" },
          { value: "workbench", label: "Workbench" },
          { value: "diagnostics", label: "Diagnostics" }
        ]
      }
    ]
  },
  {
    id: "update-preferences",
    label: "Update preferences",
    mutatesState: true,
    fields: [
      {
        name: "theme",
        label: "Theme",
        required: false,
        kind: "select",
        options: [
          { value: "system", label: "System" },
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" }
        ]
      },
      {
        name: "density",
        label: "Density",
        required: false,
        kind: "select",
        options: [
          { value: "comfortable", label: "Comfortable" },
          { value: "compact", label: "Compact" }
        ]
      }
    ]
  },
  {
    id: "submit-conversation",
    label: "Send message",
    mutatesState: true,
    fields: [
      {
        name: "text",
        label: "Message",
        required: false,
        kind: "textarea"
      }
    ]
  },
  {
    id: "remove-conversation-attachment",
    label: "Remove attachment",
    mutatesState: true,
    fields: [
      {
        name: "resourceId",
        label: "Resource",
        required: true,
        kind: "text"
      }
    ]
  },
  {
    id: "refresh-conversation",
    label: "Refresh conversation",
    mutatesState: false,
    fields: []
  },
  {
    id: "cancel-conversation",
    label: "Cancel response",
    mutatesState: false,
    fields: []
  },
  {
    id: "regenerate-conversation",
    label: "Regenerate response",
    mutatesState: true,
    fields: []
  },
  {
    id: "open-workbench",
    label: "Open canonical transcript",
    mutatesState: true,
    fields: []
  }
]

export function buildProductAppWebViewModel(
  snapshot: Omit<ProductAppWebSnapshot, "view">
): ProductAppWebViewModel {
  const state = snapshot.status.ok ? snapshot.status.value.state : undefined
  const settings = projectSettings(snapshot, state)
  const recentSessions = projectProductAppWebRecentSessions({
    home: snapshot.home,
    selectedSessionId: state?.selectedSessionId
  })
  const selectedSessionTitle = selectedProductAppWebSessionTitle(recentSessions)
  const commandCatalog = projectProductAppWebCommandCatalog(
    snapshot.commandCatalog
  )
  const providerRunGate = projectProductAppWebProviderRunGate(
    settings.profile.readiness
  )
  return {
    title: "Wanex Product App",
    ready:
      snapshot.descriptor.ok &&
      snapshot.status.ok &&
      snapshot.home.ok &&
      snapshot.settings.ok &&
      snapshot.providerProfiles.ok &&
      snapshot.attachments.ok,
    mode: settings.renderer.mode,
    layout: settings.renderer.layout,
    ...(state?.selectedSessionId === undefined
      ? {}
      : { selectedSessionId: state.selectedSessionId }),
    ...(selectedSessionTitle === undefined ? {} : { selectedSessionTitle }),
    theme: settings.renderer.theme,
    density: settings.renderer.density,
    settings,
    sessionCount: recentSessions.length,
    recentSessions,
    commandCount: snapshot.descriptor.ok ? snapshot.descriptor.value.commandCount : 0,
    productCommandCount: commandCatalog.rows.length,
    eventCount: snapshot.events.ok ? snapshot.events.events.length : 0,
    workbenchState: snapshot.workbench.state,
    workbenchRowCount: snapshot.workbench.summary.rowCount,
    conversationCanSubmit:
      providerRunGate.canSubmitConversation && snapshot.conversation.canSubmit,
    conversationCanCancel: snapshot.conversation.canCancel,
    conversationCanRegenerate: snapshot.conversation.canRegenerate,
    conversationState: snapshot.conversation.state,
    conversationAttachments: snapshot.attachments.ok
      ? snapshot.attachments.value.attachments
      : [],
    ...(snapshot.conversation.transientAssistantText === undefined
      ? {}
      : {
          transientAssistantText:
            snapshot.conversation.transientAssistantText
        }),
    ...(snapshot.workbench.summary.latestAssistantText === undefined
      ? {}
      : { latestAssistantText: snapshot.workbench.summary.latestAssistantText }),
    ...(snapshot.workbench.summary.latestUserText === undefined
      ? {}
      : { latestUserText: snapshot.workbench.summary.latestUserText }),
    operationStatus: snapshot.operationStatus,
    commandPreview: snapshot.commandPreview,
    commandExecution: snapshot.commandExecution,
    executionActivity: snapshot.executionActivity,
    commandCatalog,
    providerRunGate,
    diagnostics: snapshot.diagnostics,
    actions: buildActions({
      recentSessions,
      providerProfiles: settings.profile.profiles,
      commandCatalog
    })
  }
}

function buildActions(request: {
  readonly recentSessions: readonly ProductAppWebViewModel["recentSessions"][number][]
  readonly providerProfiles: readonly ProductAppWebProviderProfileRow[]
  readonly commandCatalog: ProductAppWebViewModel["commandCatalog"]
}): readonly ProductAppWebActionDescriptor[] {
  return [
    BASE_ACTIONS[0] as ProductAppWebActionDescriptor,
    sessionSelectAction(request.recentSessions),
    providerProfileSelectAction(request.providerProfiles),
    commandPreviewAction(request.commandCatalog),
    commandExecutionAction(request.commandCatalog),
    ...BASE_ACTIONS.slice(1)
  ]
}

function commandPreviewAction(
  catalog: ProductAppWebViewModel["commandCatalog"]
): ProductAppWebActionDescriptor {
  return {
    id: "preview-command",
    label: "Preview command",
    mutatesState: false,
    fields: commandInvocationFields(catalog.rows),
    commandInput: {
      catalogState: catalog.state,
      commands: catalog.rows
    }
  }
}

function commandExecutionAction(
  catalog: ProductAppWebViewModel["commandCatalog"]
): ProductAppWebActionDescriptor {
  return {
    id: "execute-command",
    label: "Execute command",
    mutatesState: true,
    fields: commandInvocationFields(catalog.rows),
    commandInput: {
      catalogState: catalog.state,
      commands: catalog.rows
    }
  }
}

function commandInvocationFields(
  commands: readonly ProductAppWebViewModel["commandCatalog"]["rows"][number][]
): readonly ProductAppWebActionDescriptor["fields"][number][] {
  return [
    {
      name: "commandId",
      label: "Command",
      required: true,
      kind: commands.length === 0 ? "text" : "select",
      ...(commands.length === 0
        ? {}
        : {
            options: commands.map((command) => ({
              value: command.id,
              label: `${command.title} (${command.id})`
            }))
          })
    }
  ]
}

function sessionSelectAction(
  recentSessions: readonly ProductAppWebViewModel["recentSessions"][number][]
): ProductAppWebActionDescriptor {
  const options = recentSessions.map((session) => ({
    value: session.sessionId,
    label: session.label
  }))
  return {
    id: "select-session",
    label: "Select session",
    mutatesState: true,
    fields: [
      {
        name: "sessionId",
        label: "Session",
        required: true,
        kind: options.length === 0 ? "text" : "select",
        ...(options.length === 0 ? {} : { options })
      }
    ]
  }
}

function providerProfileSelectAction(
  profiles: readonly ProductAppWebProviderProfileRow[]
): ProductAppWebActionDescriptor {
  return {
    id: "set-active-provider-profile",
    label: "Set active provider",
    mutatesState: true,
    fields: [
      {
        name: "profileId",
        label: "Provider",
        required: true,
        kind: profiles.length === 0 ? "text" : "select",
        ...(profiles.length === 0
          ? {}
          : {
              options: profiles.map((profile) => ({
                value: profile.id,
                label: providerProfileLabel(profile)
              }))
            })
      }
    ]
  }
}

function providerProfileLabel(profile: ProductAppWebProviderProfileRow): string {
  return `${profile.id} (${profile.modelId})${profile.active ? " active" : ""}`
}

export function productAppWebDiagnostics(
  snapshot: Pick<
    ProductAppWebSnapshot,
    | "descriptor"
    | "status"
    | "home"
    | "settings"
    | "providerProfiles"
    | "commandCatalog"
    | "attachments"
    | "events"
  >
): readonly ProductAppWebDiagnostic[] {
  return [
    ...resultDiagnostic(
      snapshot.descriptor,
      "product-app-web.descriptor_failed",
      "descriptor"
    ),
    ...resultDiagnostic(
      snapshot.status,
      "product-app-web.status_failed",
      "status"
    ),
    ...resultDiagnostic(snapshot.home, "product-app-web.home_failed", "home"),
    ...resultDiagnostic(
      snapshot.settings,
      "product-app-web.settings_failed",
      "settings"
    ),
    ...resultDiagnostic(
      snapshot.providerProfiles,
      "product-app-web.provider_profiles_failed",
      "provider profiles"
    ),
    ...resultDiagnostic(
      snapshot.commandCatalog,
      "product-app-web.command_catalog_failed",
      "command catalog"
    ),
    ...resultDiagnostic(
      snapshot.attachments,
      "product-app-web.attachments_failed",
      "conversation attachments"
    ),
    ...resultDiagnostic(
      snapshot.events,
      "product-app-web.events_failed",
      "events"
    )
  ]
}

function projectSettings(
  snapshot: Omit<ProductAppWebSnapshot, "view">,
  state: {
    readonly layout: string
    readonly mode: string
    readonly preferences: {
      readonly theme: string
      readonly density: string
    }
  } | undefined
): ProductAppWebSettingsViewModel {
  if (snapshot.settings.ok) {
    const settings = snapshot.settings.value
    return {
      profile: {
        configuredProviderProfileId:
          settings.profile.configuredProviderProfileId,
        activeProviderProfileId: settings.profile.activeProviderProfileId,
        agentContextConfigured: settings.profile.agentContextConfigured,
        agentContextRevision: settings.profile.agentContextRevision,
        readiness: projectProviderReadiness(snapshot),
        profileCount: snapshot.providerProfiles.ok
          ? snapshot.providerProfiles.value.profiles.length
          : 0,
        profiles: snapshot.providerProfiles.ok
          ? snapshot.providerProfiles.value.profiles.map(projectProviderProfileRow)
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
      }
    }
  }
  return {
    profile: {
      configuredProviderProfileId: "unknown",
      activeProviderProfileId: "unknown",
      agentContextConfigured: false,
      agentContextRevision: 0,
      readiness: fallbackProviderReadiness(),
      profileCount: 0,
      profiles: []
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
    }
  }
}

function projectProviderReadiness(
  snapshot: Omit<ProductAppWebSnapshot, "view">
): ProductAppWebProviderReadinessViewModel {
  if (!snapshot.home.ok) {
    return fallbackProviderReadiness()
  }
  const readiness = snapshot.home.value.providerReadiness
  return {
    status: readiness.status,
    reason: readiness.reason,
    activeProfileId: readiness.activeProfileId,
    profileCount: readiness.profileCount,
    canRun: readiness.canRun,
    attentionRequired: readiness.attentionRequired,
    requiresCredential: readiness.requiresCredential,
    credentialConfigured: readiness.credentialConfigured
  }
}

function fallbackProviderReadiness(): ProductAppWebProviderReadinessViewModel {
  return {
    status: "unknown",
    reason: "home_unavailable",
    activeProfileId: "unknown",
    profileCount: 0,
    canRun: false,
    attentionRequired: true,
    requiresCredential: false,
    credentialConfigured: false
  }
}

function projectProviderProfileRow(
  profile: ProductAppWebProviderProfileRow
): ProductAppWebProviderProfileRow {
  return {
    id: profile.id,
    kind: profile.kind,
    providerId: profile.providerId,
    modelId: profile.modelId,
    credentialConfigured: profile.credentialConfigured,
    active: profile.active
  }
}

function resultDiagnostic(
  result: { readonly ok: boolean; readonly error?: { readonly message: string } },
  code: ProductAppWebDiagnostic["code"],
  label: string
): readonly ProductAppWebDiagnostic[] {
  if (result.ok) {
    return []
  }
  return [
    {
      code,
      severity: label === "events" ? "warning" : "error",
      message: `${label} failed: ${result.error?.message ?? "unknown error"}`
    }
  ]
}
