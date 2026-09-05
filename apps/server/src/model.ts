import type {
  LocalModelEndpointsOptions,
  AssistantHost,
  StartAssistantHostOptions
} from "@wanex/assistant-host"
import type { ResolveSystemServiceBinaryOptions } from "@wanex/runtime/bootstrap"
import type {
  SecretResolverPort,
  SecretStorePort
} from "@wanex/runtime/secrets"
import type {
  RemoteAgentHostHttpHandler,
  RemoteHostAuthenticatedSubject,
  RemoteHostRequestLimits
} from "@wanex/runtime/host"
import type { CodingApplicationHost } from "@wanex/coding/host"

export interface WanexServerAuthentication {
  authenticateBearerToken(
    token: string
  ): Promise<RemoteHostAuthenticatedSubject | null>
}

export interface WanexServerTlsCredentials {
  readonly key: string | Buffer
  readonly cert: string | Buffer
}

export type WanexServerState = "open" | "closing" | "closed"

export interface StartWanexServerOptions {
  readonly config: unknown
  readonly artifacts?: ResolveSystemServiceBinaryOptions
  readonly serviceBin?: string
  readonly modelEndpoints?: LocalModelEndpointsOptions
  readonly credentialStore?: SecretStorePort
  readonly secretResolver?: SecretResolverPort
  readonly trustedProviderHost?: StartAssistantHostOptions["trustedProviderHost"]
  readonly authentication: WanexServerAuthentication
  readonly tls: WanexServerTlsCredentials
  readonly remoteLimits?: Partial<RemoteHostRequestLimits>
  readonly drainTimeoutMs?: number
}

export interface WanexServerEndpoint {
  readonly kind: "wanex.server.endpoint"
  readonly transport: "https"
  readonly hostname: string
  readonly port: number
  readonly messageUrl: string
}

export interface WanexServerStatus {
  readonly kind: "wanex.server.status"
  readonly state: WanexServerState
  readonly profileId: string
  readonly assistant: "ready" | "closing" | "closed"
  readonly coding: "disabled" | "ready" | "closing" | "closed"
  readonly listener: "ready" | "closing" | "closed"
  readonly endpoint: WanexServerEndpoint
}

export interface WanexServer {
  readonly state: WanexServerState
  readonly endpoint: WanexServerEndpoint
  readStatus(): WanexServerStatus
  close(): Promise<void>
}

export interface StartedWanexServer extends WanexServer {
  readonly assistantHost: AssistantHost
  readonly codingHost?: CodingApplicationHost
  readonly remoteHandler: RemoteAgentHostHttpHandler
}
