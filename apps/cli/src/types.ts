import type { ProviderProfile } from "@wanex/protocol"
import type { PrepareAgentContextOptions } from "@wanex/runtime/context"

export interface CliEnvironment {
  readonly [name: string]: string | undefined
  readonly HOME?: string
  readonly USERPROFILE?: string
  readonly WANEX_STORE_DIR?: string
  readonly WANEX_STORE_PROFILE?: string
  readonly WANEX_STORE_ROOT?: string
  readonly WANEX_SYSTEM_SERVICE_BIN?: string
}

export interface CliResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

export interface GlobalOptions {
  readonly store:
    | {
        readonly kind: "local-system-service"
        readonly storeDir: string
      }
    | {
        readonly kind: "local-profile"
        readonly rootDir: string
        readonly profileId: string
      }
  readonly serviceBin: string
}

export type ParsedCommand =
  | { readonly name: "help" }
  | { readonly name: "init"; readonly options: GlobalOptions }
  | { readonly name: "doctor"; readonly options: GlobalOptions }
  | {
      readonly name: "events"
      readonly options: GlobalOptions
      readonly sessionId?: string
      readonly limit?: number
    }
  | {
      readonly name: "provider-get"
      readonly options: GlobalOptions
      readonly profileId: string
    }
  | {
      readonly name: "provider-set"
      readonly options: GlobalOptions
      readonly profile: ProviderProfile
    }
  | {
      readonly name: "memory-sweep"
      readonly options: GlobalOptions
      readonly principalId: string
      readonly sessionLimit?: number
      readonly waterlineTokens?: number
      readonly minimumTokenSavings?: number
      readonly policyVersion?: string
      readonly idempotencyKeyPrefix?: string
    }
  | {
      readonly name: "diagnostics"
      readonly options: GlobalOptions
      readonly includeConfigReloads?: boolean
      readonly memoryMaintenance?: boolean
      readonly staleAfterMs?: number
      readonly policyVersion?: string
      readonly sessionLimit?: number
      readonly jobLimit?: number
      readonly pluginLimit?: number
    }
  | {
      readonly name: "support-bundle"
      readonly options: GlobalOptions
      readonly providerProfileIds?: readonly string[]
      readonly sessionId?: string
      readonly eventLimit?: number
      readonly jobLimit?: number
      readonly pluginLimit?: number
      readonly memoryMaintenance?: boolean
      readonly staleAfterMs?: number
      readonly policyVersion?: string
      readonly sessionLimit?: number
    }
  | {
      readonly name: "run"
      readonly options: GlobalOptions
      readonly text: string
      readonly sessionId?: string
      readonly providerId?: string
      readonly timeoutMs?: number
      readonly maxSteps?: number
      readonly context?: CliAgentContextOptions
    }
  | {
      readonly name: "side-query"
      readonly options: GlobalOptions
      readonly text: string
      readonly sessionId?: string
      readonly providerId?: string
      readonly timeoutMs?: number
      readonly maxOutputTokens?: number
    }

export type CliAgentContextOptions = Pick<
  PrepareAgentContextOptions,
  "instructions" | "skills"
>
