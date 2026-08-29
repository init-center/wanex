import type {
  AssistantHostSnapshot
} from "../model.js"
import type {
  LocalCliOptions
} from "./options.js"

export interface LocalCliStartupSummaryInput {
  readonly options: LocalCliOptions
  readonly snapshot: AssistantHostSnapshot
}

export interface LocalCliJsonStartupSummary {
  readonly kind: "assistant-host.cli.startup-summary"
  readonly url: string
  readonly open: boolean
  readonly storage: LocalCliJsonStorageSummary
  readonly serviceBinary: string
  readonly provider: LocalCliJsonProviderSummary
  readonly assistant: LocalCliJsonAssistantSummary
  readonly web: LocalCliJsonWebSummary
  readonly privacy: LocalCliJsonPrivacySummary
}

export type LocalCliJsonStorageSummary =
  | {
      readonly kind: "store-dir"
      readonly storeDir: string
    }
  | {
      readonly kind: "profile"
      readonly rootDir: string
      readonly profileId: string
    }

export interface LocalCliJsonProviderSummary {
  readonly activeEndpointId?: string
  readonly endpointCount: number
  readonly readiness: LocalCliJsonProviderReadinessSummary
  readonly endpoints: readonly LocalCliJsonModelEndpointSummary[]
}

export interface LocalCliJsonProviderReadinessSummary {
  readonly status: string
  readonly reason: string
  readonly activeEndpointId?: string
  readonly endpointCount: number
  readonly canRun: boolean
  readonly attentionRequired: boolean
  readonly requiresCredential: boolean
  readonly credentialConfigured: boolean
}

export interface LocalCliJsonModelEndpointSummary {
  readonly id: string
  readonly connection: AssistantHostSnapshot["modelEndpoints"]["endpoints"][number]["connection"]
  readonly protocol: AssistantHostSnapshot["modelEndpoints"]["endpoints"][number]["protocol"]
  readonly model: AssistantHostSnapshot["modelEndpoints"]["endpoints"][number]["model"]
  readonly active: boolean
  readonly credentialConfigured: boolean
}

export interface LocalCliJsonAssistantSummary {
  readonly layout: string
  readonly mode: string
  readonly theme: string
  readonly density: string
  readonly selectedSessionId?: string
}

export interface LocalCliJsonWebSummary {
  readonly ready: boolean
  readonly workbenchState: string
  readonly conversationState: string
  readonly conversationCanSubmit: boolean
  readonly conversationCanCancel: boolean
  readonly conversationCanRegenerate: boolean
  readonly operationStatus: AssistantHostSnapshot["web"]["view"]["operationStatus"]
  readonly providerRunGate: AssistantHostSnapshot["web"]["view"]["providerRunGate"]
}

export interface LocalCliJsonPrivacySummary {
  readonly safe: boolean
  readonly exposesStorePath: false
  readonly exposesServiceBinaryPath: false
  readonly exposesSecrets: false
  readonly exposesRawStorageClient: false
  readonly exposesRendererMutationApi: false
}

export function formatLocalCliStartupSummary(
  input: LocalCliStartupSummaryInput
): readonly string[] {
  const settings = input.snapshot.settings
  return [
    "",
    "Wanex Assistant Host running",
    `URL: ${input.snapshot.url}`,
    `Storage: ${formatLocalCliStorage(input.options)}`,
    `Service binary: ${input.options.serviceBin}`,
    `Active provider: ${settings.profile.activeModelEndpointId ?? "not configured"}`,
    `Model endpoints: ${input.snapshot.modelEndpoints.endpoints.length}`,
    `Provider readiness: ${input.snapshot.web.view.settings.profile.readiness.status}`,
    `Provider can run: ${input.snapshot.web.view.settings.profile.readiness.canRun ? "yes" : "no"}`,
    `Provider run gate: ${input.snapshot.web.view.providerRunGate.state}`,
    `Conversation submit: ${input.snapshot.web.view.providerRunGate.canSubmitConversation ? "enabled" : "blocked"}`,
    ...formatLocalCliModelEndpointRows(input.snapshot),
    `Layout: ${settings.state.layout}`,
    `Mode: ${settings.state.mode}`,
    `Theme: ${settings.state.preferences.theme}`,
    `Density: ${settings.state.preferences.density}`,
    `Web ready: ${input.snapshot.web.view.ready ? "yes" : "no"}`,
    `Last operation: ${formatLocalCliOperationStatus(input.snapshot)}`,
    `Privacy: ${formatLocalCliPrivacy(input.snapshot)}`,
    "Stop: Ctrl+C"
  ]
}

export function formatLocalCliStartupSummaryJson(
  input: LocalCliStartupSummaryInput
): string {
  return JSON.stringify(projectLocalCliStartupSummary(input))
}

export function projectLocalCliStartupSummary(
  input: LocalCliStartupSummaryInput
): LocalCliJsonStartupSummary {
  const settings = input.snapshot.settings
  const privacy = input.snapshot.privacy
  const selectedSessionId = settings.state.selection?.kind === "session"
    ? settings.state.selection.sessionId
    : undefined
  return {
    kind: "assistant-host.cli.startup-summary",
    url: input.snapshot.url,
    open: input.options.open,
    storage: projectLocalCliStorage(input.options),
    serviceBinary: input.options.serviceBin,
    provider: {
      ...(settings.profile.activeModelEndpointId === undefined
        ? {}
        : { activeEndpointId: settings.profile.activeModelEndpointId }),
      endpointCount: input.snapshot.modelEndpoints.endpoints.length,
      readiness: projectLocalCliProviderReadiness(input.snapshot),
      endpoints: input.snapshot.modelEndpoints.endpoints.map(
        projectLocalCliModelEndpoint
      )
    },
    assistant: {
      ...(selectedSessionId === undefined
        ? {}
        : { selectedSessionId }),
      layout: settings.state.layout,
      mode: settings.state.mode,
      theme: settings.state.preferences.theme,
      density: settings.state.preferences.density
    },
    web: {
      ready: input.snapshot.web.view.ready,
      workbenchState: input.snapshot.web.view.workbenchState,
      conversationState: input.snapshot.web.view.conversationState,
      conversationCanSubmit: input.snapshot.web.view.conversationCanSubmit,
      conversationCanCancel: input.snapshot.web.view.conversationCanCancel,
      conversationCanRegenerate:
        input.snapshot.web.view.conversationCanRegenerate,
      operationStatus: input.snapshot.web.view.operationStatus,
      providerRunGate: input.snapshot.web.view.providerRunGate
    },
    privacy: {
      safe:
        !privacy.exposesStorePath &&
        !privacy.exposesServiceBinaryPath &&
        !privacy.exposesSecrets &&
        !privacy.exposesRawStorageClient &&
        !privacy.exposesRendererMutationApi,
      exposesStorePath: privacy.exposesStorePath,
      exposesServiceBinaryPath: privacy.exposesServiceBinaryPath,
      exposesSecrets: privacy.exposesSecrets,
      exposesRawStorageClient: privacy.exposesRawStorageClient,
      exposesRendererMutationApi: privacy.exposesRendererMutationApi
    }
  }
}

function projectLocalCliProviderReadiness(
  snapshot: AssistantHostSnapshot
): LocalCliJsonProviderReadinessSummary {
  const readiness = snapshot.web.view.settings.profile.readiness
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

function projectLocalCliModelEndpoint(
  endpoint: AssistantHostSnapshot["modelEndpoints"]["endpoints"][number]
): LocalCliJsonModelEndpointSummary {
  return {
    id: endpoint.id,
    connection: endpoint.connection,
    protocol: endpoint.protocol,
    model: endpoint.model,
    active: endpoint.active,
    credentialConfigured: endpoint.credentialConfigured
  }
}

function formatLocalCliModelEndpointRows(
  snapshot: AssistantHostSnapshot
): readonly string[] {
  return snapshot.modelEndpoints.endpoints.map((endpoint) => {
    const status = endpoint.active ? "active" : "available"
    const credential = endpoint.credentialConfigured
      ? " credential=configured"
      : " credential=none"
    return `  - ${status} ${endpoint.id} protocol=${endpoint.protocol.id} provider=${endpoint.connection.providerId} model=${endpoint.model.id}${credential}`
  })
}

function formatLocalCliOperationStatus(
  snapshot: AssistantHostSnapshot
): string {
  const operation = snapshot.web.view.operationStatus
  const action =
    operation.action === undefined ? "" : ` action=${operation.action}`
  return `${operation.state}${action}`
}

export function formatLocalCliStorage(
  options: LocalCliOptions
): string {
  if (options.storage.kind === "store-dir") {
    return `store-dir ${options.storage.storeDir}`
  }
  return `profile ${options.storage.rootDir}#${options.storage.profileId ?? "default"}`
}

function projectLocalCliStorage(
  options: LocalCliOptions
): LocalCliJsonStorageSummary {
  if (options.storage.kind === "store-dir") {
    return {
      kind: "store-dir",
      storeDir: options.storage.storeDir
    }
  }
  return {
    kind: "profile",
    rootDir: options.storage.rootDir,
    profileId: options.storage.profileId ?? "default"
  }
}

function formatLocalCliPrivacy(
  snapshot: AssistantHostSnapshot
): string {
  const privacy = snapshot.privacy
  return privacy.exposesStorePath ||
    privacy.exposesServiceBinaryPath ||
    privacy.exposesSecrets ||
    privacy.exposesRawStorageClient ||
    privacy.exposesRendererMutationApi
    ? "review required"
    : "host-only details hidden from assistant snapshot"
}
