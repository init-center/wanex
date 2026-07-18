import type {
  JsonValue,
  RuntimeAbortSignal,
  ToolCallMessagePart,
  ToolExecutionRecord,
  ToolResultMessagePart
} from "@wanex/protocol"
import type { SchedulerStore, ToolExecutionStore } from "@wanex/storage"

export type ToolRisk = "read_only" | "mutating" | "external"

export interface ToolInputSchema extends Readonly<Record<string, JsonValue>> {
  readonly type: "object"
}

export interface ToolAnnotations {
  readonly title?: string
  readonly readOnlyHint?: boolean
  readonly destructiveHint?: boolean
  readonly idempotentHint?: boolean
  readonly openWorldHint?: boolean
}

export interface ToolDescriptor {
  readonly name: string
  readonly description: string
  readonly inputSchema: ToolInputSchema
  readonly risk: ToolRisk
  readonly idempotent: boolean
  readonly annotations?: ToolAnnotations
}

export interface ToolDefinition extends ToolDescriptor {
  readonly drainsCancellation?: true
  invoke(invocation: ToolInvocation): Promise<ToolExecutionResult>
}

export interface ToolInvocationIdentity {
  readonly principalId: string
  readonly sessionId: string
  readonly inputId: string
  readonly runId: string
}

export interface ToolInvocation extends ToolInvocationIdentity {
  readonly toolCallId: string
  readonly toolName: string
  readonly input: JsonValue
  readonly idempotencyKey: string
  readonly signal?: RuntimeAbortSignal
}

export interface ToolExecutionResult {
  readonly toolCallId: string
  readonly result: JsonValue
  readonly isError: boolean
}

export type ToolPermissionDecision =
  | {
      readonly status: "allow"
      readonly reason: string
      readonly authorizationRef?: string
    }
  | {
      readonly status: "deny" | "approval_required"
      readonly reason: string
      readonly authorizationRef?: string
    }

export interface ToolPermissionRequest extends ToolInvocationIdentity {
  readonly call: ToolCallMessagePart
  readonly descriptor: ToolDescriptor
}

export interface ToolPermissionPolicy {
  authorize(request: ToolPermissionRequest): Promise<ToolPermissionDecision>
}

export interface ToolRecoveryPolicy {
  readonly maxAttempts: number
  retryIdempotent(request: {
    readonly execution: ToolExecutionRecord
    readonly descriptor: ToolDescriptor
  }): Promise<boolean>
}

export interface ToolExecutionRequest extends ToolInvocationIdentity {
  readonly call: ToolCallMessagePart
  readonly idempotencyKey: string
  readonly permissionPolicy?: ToolPermissionPolicy
  readonly recoveryPolicy?: ToolRecoveryPolicy
  readonly signal?: RuntimeAbortSignal
  readonly timeoutMs?: number
  readonly storage: ToolExecutionStore
  readonly budget?: {
    readonly grantId: string
    readonly storage: Pick<SchedulerStore, "recordBudgetUsage">
  }
}

export interface ToolExecutionOutcome {
  readonly descriptor?: ToolDescriptor
  readonly permission: ToolPermissionDecision
  readonly result: ToolResultMessagePart
  readonly invoked: boolean
}
