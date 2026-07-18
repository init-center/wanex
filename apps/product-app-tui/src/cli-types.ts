import type {
  ProductAppTuiLineSessionOptions
} from "./types.js"

export interface ProductAppTuiCliEnvironment {
  readonly WANEX_STORE_DIR?: string
  readonly WANEX_SYSTEM_SERVICE_BIN?: string
  readonly WANEX_PROVIDER_PROFILE_ID?: string
  readonly WANEX_PROVIDER_MODEL_ID?: string
}

export interface ProductAppTuiCliResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

export interface ProductAppTuiCliIo {
  readonly input: AsyncIterable<string>
  readonly write: ProductAppTuiLineSessionOptions["write"]
}

export type ProductAppTuiCliCommand =
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
      readonly name: "palette"
      readonly paletteSelector: string
      readonly input?: unknown
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
