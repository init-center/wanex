import type {
  TuiLineSessionOptions
} from "../model.js"
import type { Terminal } from "@earendil-works/pi-tui"
import type { SecretStorePort } from "@wanex/runtime/secrets"

export interface TuiCliEnvironment {
  readonly [name: string]: string | undefined
  readonly WANEX_STORE_DIR?: string
  readonly WANEX_SYSTEM_SERVICE_BIN?: string
  readonly WANEX_MODEL_ENDPOINT_ID?: string
  readonly WANEX_PROVIDER_CONNECTION_ID?: string
  readonly WANEX_PROVIDER_PROTOCOL?: string
  readonly WANEX_PROVIDER_PROTOCOL_VERSION?: string
  readonly WANEX_PROVIDER_ID?: string
  readonly WANEX_PROVIDER_BASE_URL?: string
  readonly WANEX_PROVIDER_SECRET_REF?: string
  readonly WANEX_PROVIDER_MODEL_ID?: string
  readonly WANEX_MODEL_OPERATIONS?: string
  readonly WANEX_MODEL_INPUT_MODALITIES?: string
  readonly WANEX_MODEL_OUTPUT_MODALITIES?: string
  readonly WANEX_MODEL_FEATURES?: string
  readonly WANEX_MODEL_REASONING_REPLAY?: string
}

export interface TuiCliResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

export interface TuiCliIo {
  readonly input?: AsyncIterable<string>
  readonly write?: TuiLineSessionOptions["write"]
  readonly signal?: AbortSignal
  readonly fullScreenTerminal?: Terminal
  readonly credentialStore?: SecretStorePort
}

export type TuiCliCommand =
  | {
      readonly name: "overview"
      readonly output: "text" | "json"
    }
  | {
      readonly name: "events"
      readonly output: "text" | "json"
      readonly limit?: number
    }
  | {
      readonly name: "commands"
      readonly output: "text" | "json"
    }
  | {
      readonly name: "preview"
      readonly commandId: string
      readonly input?: unknown
    }
  | {
      readonly name: "execute"
      readonly commandId: string
      readonly input?: unknown
    }
  | {
      readonly name: "execution"
      readonly jobId: string
    }
  | {
      readonly name: "interactive"
    }
  | {
      readonly name: "fullscreen"
    }
