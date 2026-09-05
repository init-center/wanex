import type { ToolRegistry } from "@wanex/runtime/tools"

export type LocalMcpValueSource =
  | { readonly kind: "literal"; readonly value: string }
  | { readonly kind: "credential"; readonly ref: string }

export interface LocalMcpNamedValue {
  readonly name: string
  readonly source: LocalMcpValueSource
}

export type LocalMcpTransportDefinition =
  | {
      readonly kind: "stdio"
      readonly command: string
      readonly args: readonly string[]
      readonly cwd: string
      readonly environment: readonly LocalMcpNamedValue[]
      readonly maxBufferBytes?: number
    }
  | {
      readonly kind: "streamable_http"
      readonly url: string
      readonly headers: readonly LocalMcpNamedValue[]
    }

export interface LocalMcpServerDefinition {
  readonly kind: "assistant-host.mcp-server"
  readonly serverId: string
  readonly label: string
  readonly enabled: boolean
  readonly capabilityRevision: string
  readonly connectTimeoutMs: number
  readonly requestTimeoutMs: number
  readonly transport: LocalMcpTransportDefinition
}

export type LocalMcpServerState = "ready" | "failed" | "stopped"

export type LocalMcpFailureCategory =
  | "invalid_definition"
  | "server_limit_exceeded"
  | "credential_unavailable"
  | "execution_unavailable"
  | "connect_failed"
  | "discovery_failed"
  | "tool_collision"

export interface LocalMcpServerStatus {
  readonly serverId?: string
  readonly label?: string
  readonly state: LocalMcpServerState
  readonly transport?: LocalMcpTransportDefinition["kind"]
  readonly toolCount: number
  readonly failure?: LocalMcpFailureCategory
}

export interface LocalMcpComposition {
  readonly fingerprint: string
  readonly tools?: ToolRegistry
  status(): readonly LocalMcpServerStatus[]
  dispose(): Promise<void>
}
