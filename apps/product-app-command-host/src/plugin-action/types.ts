import type {
  JsonValue,
  PluginActionSubmission,
  PluginCapability,
  PrincipalId,
  RetryPolicy
} from "@wanex/protocol"
import type { SubmitPluginActionRequest } from "@wanex/plugin"

export interface PluginActionHandlerRef {
  readonly kind: "plugin_action"
  readonly pluginId: string
  readonly actionId: string
  readonly version?: string
  readonly requiredCapability?: PluginCapability
}

export interface SubmitPluginActionPort {
  submitAction(
    request: SubmitPluginActionRequest
  ): Promise<PluginActionSubmission> | PluginActionSubmission
}

export interface InvokePluginActionHandlerRequest {
  readonly handlerRef: string
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
