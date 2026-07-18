export type WanexMcpClientTransportConfig =
  | WanexMcpStdioClientTransportConfig
  | WanexMcpHttpClientTransportConfig

export interface WanexMcpStdioClientTransportConfig {
  readonly kind: "stdio"
  readonly command: string
  readonly args?: readonly string[]
  readonly cwd?: string
  readonly env?: Readonly<Record<string, string>>
  readonly stderr?: "inherit" | "pipe" | "ignore"
}

export interface WanexMcpHttpClientTransportConfig {
  readonly kind: "streamable_http"
  readonly url: string
  readonly headers?: Readonly<Record<string, string>>
}

export interface WanexMcpRuntimeClientOptions {
  readonly id: string
  readonly transport: WanexMcpClientTransportConfig
  readonly namePrefix?: string
  readonly requestTimeoutMs?: number
}

export interface WanexMcpClientStatus {
  readonly started: boolean
  readonly disposed: boolean
}
