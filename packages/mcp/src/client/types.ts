import type { BorrowedExecutionScope } from "@wanex/runtime/execution"

export type WanexMcpClientTransportConfig =
  | WanexMcpStdioClientTransportConfig
  | WanexMcpHttpClientTransportConfig

export interface WanexMcpStdioClientTransportConfig {
  readonly kind: "stdio"
  readonly command: string
  readonly args?: readonly string[]
  readonly cwd: string
  readonly env?: Readonly<Record<string, string>>
  readonly execution: Pick<BorrowedExecutionScope, "binding" | "process">
  readonly maxBufferSize?: number
}

export interface WanexMcpHttpClientTransportConfig {
  readonly kind: "streamable_http"
  readonly url: string
  readonly headers?: Readonly<Record<string, string>>
}

export interface WanexMcpRuntimeClientOptions {
  readonly id: string
  readonly capabilityRevision: string
  readonly transport: WanexMcpClientTransportConfig
  readonly namePrefix?: string
  readonly connectTimeoutMs: number
  readonly requestTimeoutMs: number
}

export interface WanexMcpClientStatus {
  readonly started: boolean
  readonly disposed: boolean
}
