import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js"
import type {
  ToolExecutionRequest,
  ToolRegistry
} from "@wanex/runtime/tools"

export interface WanexMcpServerExecutionRequest {
  readonly requestId: string | number
  readonly sessionId?: string
  readonly authInfo?: AuthInfo
  readonly toolName: string
  readonly input: ToolExecutionRequest["call"]["input"]
  readonly signal: AbortSignal
}

export type WanexMcpServerExecutionContext = Omit<
  ToolExecutionRequest,
  "call" | "signal"
>

export interface WanexMcpRuntimeServerOptions {
  readonly registry: ToolRegistry
  resolveExecutionContext(
    request: WanexMcpServerExecutionRequest
  ): Promise<WanexMcpServerExecutionContext>
  readonly name?: string
  readonly version?: string
}

export interface WanexMcpHttpServerHostOptions
  extends WanexMcpRuntimeServerOptions {
  readonly hostname?: string
  readonly port?: number
  readonly path?: string
}

export interface WanexMcpServerStatus {
  readonly started: boolean
  readonly disposed: boolean
}
