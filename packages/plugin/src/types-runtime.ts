import type {
  JsonValue,
  PluginActionSubmission,
  PluginCapability,
  PluginInstallRecord,
  PluginManifestRecord,
  PluginManifestState,
  PrincipalId,
  RetryPolicy
} from "@wanex/protocol"
import type { PluginRuntimeStore } from "./storage.js"
import type { PluginInstallPlan, PluginPackageTrustRecord } from "./types-package.js"

export interface PluginRuntimeOptions {
  readonly storage: PluginRuntimeStore
}

export interface RegisterPluginManifestRequest {
  readonly id?: string
  readonly pluginId: string
  readonly version: string
  readonly name?: string
  readonly entry?: JsonValue
  readonly capabilities: readonly PluginCapability[]
  readonly metadata?: JsonValue
  readonly idempotencyKey?: string
}

export interface SubmitPluginActionRequest {
  readonly pluginId: string
  readonly version?: string
  readonly actionId: string
  readonly principalId: PrincipalId
  readonly payload: JsonValue
  readonly requiredCapability?: PluginCapability
  readonly jobId?: string
  readonly jobIdempotencyKey?: string
  readonly scheduledAt?: number
  readonly notBefore?: number
  readonly priority?: number
  readonly maxAttempts?: number
  readonly retryPolicy?: RetryPolicy
  readonly budgetGrantId?: string
}

export interface RegisterPluginInstallPlanRequest {
  readonly plan: PluginInstallPlan | JsonValue
  readonly manifestId?: string
  readonly manifestIdempotencyKey?: string
  readonly installId?: string
  readonly installIdempotencyKey?: string
}

export interface RegisterPluginInstallPlanResult {
  readonly manifest: PluginManifestRecord
  readonly install: PluginInstallRecord
  readonly trust: PluginPackageTrustRecord
}

export type {
  PluginActionSubmission,
  PluginInstallRecord,
  PluginManifestRecord,
  PluginManifestState
}
