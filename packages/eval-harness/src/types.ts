import type { JsonValue } from "@wanex/protocol"
import type { StorageHandle } from "@wanex/storage"
import type { EvalStore } from "./eval-storage.js"

export type EvalScenarioStatus = "passed" | "failed" | "skipped"

export interface EvalHarnessContext {
  readonly storage: EvalStore
  readonly handle: Pick<StorageHandle, "core" | "transport">
  readonly storeDir: string
  readonly workspaceRootDir: string
  readonly serviceBin: string
  readonly pluginHostFixture: string
}

export interface EvalScenario {
  readonly id: string
  readonly title: string
  readonly tags?: readonly string[]
  run(context: EvalHarnessContext): Promise<JsonValue | void> | JsonValue | void
}

export interface EvalScenarioResult {
  readonly id: string
  readonly title: string
  readonly status: EvalScenarioStatus
  readonly durationMs: number
  readonly tags: readonly string[]
  readonly output?: JsonValue
  readonly error?: EvalScenarioError
}

export interface EvalScenarioError {
  readonly name?: string
  readonly message: string
  readonly stack?: string
}

export interface EvalSuiteResult {
  readonly startedAt: number
  readonly finishedAt: number
  readonly durationMs: number
  readonly totals: {
    readonly passed: number
    readonly failed: number
    readonly skipped: number
  }
  readonly results: readonly EvalScenarioResult[]
}

export interface RunEvalSuiteOptions {
  readonly scenarios: readonly EvalScenario[]
  readonly context: EvalHarnessContext
  readonly only?: readonly string[]
  readonly skip?: readonly string[]
  readonly now?: () => number
}
