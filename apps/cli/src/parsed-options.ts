import type {
  CliAgentContextOptions,
  GlobalOptions
} from "./types.js"

export interface ParsedGlobalOptions {
  readonly options: GlobalOptions
  readonly positionals: readonly string[]
  readonly sessionId?: string
  readonly modelEndpointId?: string
  readonly limit?: number
  readonly timeoutMs?: number
  readonly maxSteps?: number
  readonly maxOutputTokens?: number
  readonly context?: CliAgentContextOptions
  readonly diagnosticsOptions: Readonly<Record<string, string>>
  readonly supportOptions: Readonly<Record<string, string>>
  readonly memoryOptions: Readonly<Record<string, string>>
  readonly modelEndpointOptions: Readonly<Record<string, string>>
}
