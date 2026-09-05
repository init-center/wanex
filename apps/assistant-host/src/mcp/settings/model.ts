import type {
  LocalMcpManagementResultBase,
  LocalMcpRemoveServerResult,
  LocalMcpSaveServerResult,
  LocalMcpServersReadModel,
  LocalMcpSetEnabledResult,
} from "../management.js"

export type LocalMcpSettingsTransportKind = "stdio" | "streamable_http"

export interface LocalMcpSettingsValueInput {
  readonly kind: "credential"
  readonly setupId: string
}

export interface LocalMcpSettingsNamedValueInput {
  readonly name: string
  readonly source: LocalMcpSettingsValueInput
}

export type LocalMcpSettingsTransportInput =
  | {
      readonly kind: "stdio"
      readonly command: string
      readonly args: readonly string[]
      readonly cwd: string
      readonly environment: readonly LocalMcpSettingsNamedValueInput[]
      readonly maxBufferBytes?: number
    }
  | {
      readonly kind: "streamable_http"
      readonly url: string
      readonly headers: readonly LocalMcpSettingsNamedValueInput[]
    }

export interface LocalMcpSettingsSaveServerRequest {
  readonly serverId: string
  readonly expectedRevision: number | null
  readonly label: string
  readonly enabled: boolean
  readonly connectTimeoutMs: number
  readonly requestTimeoutMs: number
  readonly transport: LocalMcpSettingsTransportInput
}

export interface LocalMcpSettingsUpdateServerRequest {
  readonly serverId: string
  readonly expectedRevision: number
  readonly label: string
}

export interface LocalMcpCredentialSetupRequest {
  readonly serverId: string
  readonly transport: LocalMcpSettingsTransportKind
  readonly name: string
  readonly value: string
}

export interface LocalMcpCredentialSetupResult {
  readonly kind: "assistant-host.mcp-credential-setup"
  readonly setupId: string
  readonly expiresAt: number
}

export type LocalMcpSettingsSaveServerResult = LocalMcpSaveServerResult & {
  readonly credentialCleanupPending: boolean
}

export type LocalMcpSettingsUpdateServerResult = LocalMcpSaveServerResult & {
  readonly credentialCleanupPending: boolean
}

export type LocalMcpSettingsRemoveServerResult = LocalMcpRemoveServerResult & {
  readonly credentialCleanupPending: boolean
}

export interface LocalMcpSettingsPort {
  readServers(): Promise<LocalMcpServersReadModel>
  stageCredential(
    request: LocalMcpCredentialSetupRequest
  ): Promise<LocalMcpCredentialSetupResult>
  saveServer(
    request: LocalMcpSettingsSaveServerRequest
  ): Promise<LocalMcpSettingsSaveServerResult>
  updateServer(
    request: LocalMcpSettingsUpdateServerRequest
  ): Promise<LocalMcpSettingsUpdateServerResult>
  setServerEnabled(request: {
    readonly serverId: string
    readonly enabled: boolean
    readonly expectedRevision: number
  }): Promise<LocalMcpSetEnabledResult>
  removeServer(request: {
    readonly serverId: string
    readonly expectedRevision: number
  }): Promise<LocalMcpSettingsRemoveServerResult>
  reloadServers(options?: {
    readonly force?: boolean
  }): Promise<LocalMcpManagementResultBase>
  reconcileCredentials(): Promise<{
    readonly credentialCleanupPending: boolean
  }>
}
