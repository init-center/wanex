import type {
  ProductAppLocalSnapshot
} from "./types.js"
import type {
  ProductAppLocalCliOptions
} from "./cli-options.js"

export interface ProductAppLocalCliStartupSummaryInput {
  readonly options: ProductAppLocalCliOptions
  readonly snapshot: ProductAppLocalSnapshot
}

export interface ProductAppLocalCliJsonStartupSummary {
  readonly kind: "product-app-local.cli.startup-summary"
  readonly url: string
  readonly open: boolean
  readonly storage: ProductAppLocalCliJsonStorageSummary
  readonly serviceBinary: string
  readonly provider: ProductAppLocalCliJsonProviderSummary
  readonly product: ProductAppLocalCliJsonProductSummary
  readonly web: ProductAppLocalCliJsonWebSummary
  readonly privacy: ProductAppLocalCliJsonPrivacySummary
  readonly pollIntervalMs?: number
}

export type ProductAppLocalCliJsonStorageSummary =
  | {
      readonly kind: "store-dir"
      readonly storeDir: string
    }
  | {
      readonly kind: "profile"
      readonly rootDir: string
      readonly profileId: string
    }

export interface ProductAppLocalCliJsonProviderSummary {
  readonly configuredProfileId: string
  readonly activeProfileId: string
  readonly profileCount: number
  readonly readiness: ProductAppLocalCliJsonProviderReadinessSummary
  readonly profiles: readonly ProductAppLocalCliJsonProviderProfileSummary[]
}

export interface ProductAppLocalCliJsonProviderReadinessSummary {
  readonly status: string
  readonly reason: string
  readonly activeProfileId: string
  readonly profileCount: number
  readonly canRun: boolean
  readonly attentionRequired: boolean
  readonly requiresApiKey: boolean
  readonly hasApiKey: boolean
}

export interface ProductAppLocalCliJsonProviderProfileSummary {
  readonly id: string
  readonly kind: string
  readonly providerId: string
  readonly modelId: string
  readonly active: boolean
  readonly hasApiKey: boolean
  readonly baseUrl?: string
  readonly apiKeyRedacted?: string
}

export interface ProductAppLocalCliJsonProductSummary {
  readonly layout: string
  readonly mode: string
  readonly theme: string
  readonly density: string
  readonly selectedSessionId?: string
}

export interface ProductAppLocalCliJsonWebSummary {
  readonly ready: boolean
  readonly workbenchState: string
  readonly workbenchCanContinue: boolean
  readonly operationStatus: ProductAppLocalSnapshot["web"]["view"]["operationStatus"]
  readonly providerRunGate: ProductAppLocalSnapshot["web"]["view"]["providerRunGate"]
}

export interface ProductAppLocalCliJsonPrivacySummary {
  readonly safe: boolean
  readonly exposesStorePath: false
  readonly exposesServiceBinaryPath: false
  readonly exposesSecrets: false
  readonly exposesRawStorageClient: false
  readonly exposesRendererMutationApi: false
}

export function formatProductAppLocalCliStartupSummary(
  input: ProductAppLocalCliStartupSummaryInput
): readonly string[] {
  const settings = input.snapshot.settings
  return [
    "",
    "Wanex Product App Local running",
    `URL: ${input.snapshot.url}`,
    `Storage: ${formatProductAppLocalCliStorage(input.options)}`,
    `Service binary: ${input.options.serviceBin}`,
    `Configured provider: ${settings.profile.configuredProviderProfileId}`,
    `Active provider: ${settings.profile.activeProviderProfileId}`,
    `Provider profiles: ${input.snapshot.providerProfiles.profiles.length}`,
    `Provider readiness: ${input.snapshot.web.view.settings.profile.readiness.status}`,
    `Provider can run: ${input.snapshot.web.view.settings.profile.readiness.canRun ? "yes" : "no"}`,
    `Provider run gate: ${input.snapshot.web.view.providerRunGate.state}`,
    `Workbench submit: ${input.snapshot.web.view.providerRunGate.canSubmitWorkbench ? "enabled" : "blocked"}`,
    ...formatProductAppLocalCliProviderProfileRows(input.snapshot),
    `Layout: ${settings.state.layout}`,
    `Mode: ${settings.state.mode}`,
    `Theme: ${settings.state.preferences.theme}`,
    `Density: ${settings.state.preferences.density}`,
    `Web ready: ${input.snapshot.web.view.ready ? "yes" : "no"}`,
    `Last operation: ${formatProductAppLocalCliOperationStatus(input.snapshot)}`,
    `Privacy: ${formatProductAppLocalCliPrivacy(input.snapshot)}`,
    `Poll interval: ${formatProductAppLocalCliPollInterval(input.options.pollIntervalMs)}`,
    "Stop: Ctrl+C"
  ]
}

export function formatProductAppLocalCliStartupSummaryJson(
  input: ProductAppLocalCliStartupSummaryInput
): string {
  return JSON.stringify(projectProductAppLocalCliStartupSummary(input))
}

export function projectProductAppLocalCliStartupSummary(
  input: ProductAppLocalCliStartupSummaryInput
): ProductAppLocalCliJsonStartupSummary {
  const settings = input.snapshot.settings
  const privacy = input.snapshot.privacy
  return {
    kind: "product-app-local.cli.startup-summary",
    url: input.snapshot.url,
    open: input.options.open,
    storage: projectProductAppLocalCliStorage(input.options),
    serviceBinary: input.options.serviceBin,
    provider: {
      configuredProfileId: settings.profile.configuredProviderProfileId,
      activeProfileId: settings.profile.activeProviderProfileId,
      profileCount: input.snapshot.providerProfiles.profiles.length,
      readiness: projectProductAppLocalCliProviderReadiness(input.snapshot),
      profiles: input.snapshot.providerProfiles.profiles.map(
        projectProductAppLocalCliProviderProfile
      )
    },
    product: {
      ...(settings.state.selectedSessionId === undefined
        ? {}
        : { selectedSessionId: settings.state.selectedSessionId }),
      layout: settings.state.layout,
      mode: settings.state.mode,
      theme: settings.state.preferences.theme,
      density: settings.state.preferences.density
    },
    web: {
      ready: input.snapshot.web.view.ready,
      workbenchState: input.snapshot.web.view.workbenchState,
      workbenchCanContinue: input.snapshot.web.view.workbenchCanContinue,
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
    },
    ...(input.options.pollIntervalMs === undefined
      ? {}
      : { pollIntervalMs: input.options.pollIntervalMs })
  }
}

function projectProductAppLocalCliProviderReadiness(
  snapshot: ProductAppLocalSnapshot
): ProductAppLocalCliJsonProviderReadinessSummary {
  const readiness = snapshot.web.view.settings.profile.readiness
  return {
    status: readiness.status,
    reason: readiness.reason,
    activeProfileId: readiness.activeProfileId,
    profileCount: readiness.profileCount,
    canRun: readiness.canRun,
    attentionRequired: readiness.attentionRequired,
    requiresApiKey: readiness.requiresApiKey,
    hasApiKey: readiness.hasApiKey
  }
}

function projectProductAppLocalCliProviderProfile(
  profile: ProductAppLocalSnapshot["providerProfiles"]["profiles"][number]
): ProductAppLocalCliJsonProviderProfileSummary {
  return {
    id: profile.id,
    kind: profile.kind,
    providerId: profile.providerId,
    modelId: profile.modelId,
    active: profile.active,
    hasApiKey: profile.hasApiKey,
    ...(profile.baseUrl === undefined ? {} : { baseUrl: profile.baseUrl }),
    ...(profile.apiKeyRedacted === undefined
      ? {}
      : { apiKeyRedacted: profile.apiKeyRedacted })
  }
}

function formatProductAppLocalCliProviderProfileRows(
  snapshot: ProductAppLocalSnapshot
): readonly string[] {
  return snapshot.providerProfiles.profiles.map((profile) => {
    const status = profile.active ? "active" : "available"
    const baseUrl =
      profile.baseUrl === undefined ? "" : ` baseUrl=${profile.baseUrl}`
    const key = profile.hasApiKey ? " key=redacted" : " key=none"
    return `  - ${status} ${profile.id} ${profile.kind}/${profile.providerId} model=${profile.modelId}${baseUrl}${key}`
  })
}

function formatProductAppLocalCliOperationStatus(
  snapshot: ProductAppLocalSnapshot
): string {
  const operation = snapshot.web.view.operationStatus
  const action =
    operation.action === undefined ? "" : ` action=${operation.action}`
  return `${operation.state}${action}`
}

export function formatProductAppLocalCliStorage(
  options: ProductAppLocalCliOptions
): string {
  if (options.storage.kind === "store-dir") {
    return `store-dir ${options.storage.storeDir}`
  }
  return `profile ${options.storage.rootDir}#${options.storage.profileId ?? "default"}`
}

function projectProductAppLocalCliStorage(
  options: ProductAppLocalCliOptions
): ProductAppLocalCliJsonStorageSummary {
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

export function formatProductAppLocalCliPollInterval(
  value: number | undefined
): string {
  if (value === undefined) {
    return "default"
  }
  if (value === 0) {
    return "disabled"
  }
  return `${value}ms`
}

function formatProductAppLocalCliPrivacy(
  snapshot: ProductAppLocalSnapshot
): string {
  const privacy = snapshot.privacy
  return privacy.exposesStorePath ||
    privacy.exposesServiceBinaryPath ||
    privacy.exposesSecrets ||
    privacy.exposesRawStorageClient ||
    privacy.exposesRendererMutationApi
    ? "review required"
    : "host-only details hidden from product snapshot"
}
