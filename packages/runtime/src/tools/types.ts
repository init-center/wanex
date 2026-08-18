import type {
  DeferredToolOperationRequest,
  DeferToolExecutionReceipt,
  JsonValue,
  ModelCapabilityRequirement,
  ModelCapabilityRouteExecutionBinding,
  RequireToolExecutionRecoveryReceipt,
  ResourceKind,
  RuntimeAbortSignal,
  ToolCallMessagePart,
  ToolExecutionApprovalSuspensionReceipt,
  ToolActivityPresentation,
  ToolResultContentPart,
  ToolResultMessagePart
} from "@wanex/protocol"
import type {
  CoreStore,
  SchedulerStore,
  ToolExecutionStore
} from "@wanex/storage"

export type ToolRisk = "read_only" | "mutating" | "external"
export type ToolConcurrency = "parallel_safe" | "exclusive"
export type ToolResultMode = "immediate" | "deferred"

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
  readonly concurrency: ToolConcurrency
  readonly resultMode: ToolResultMode
  readonly requiredCapabilities?: readonly ModelCapabilityRequirement[]
  readonly annotations?: ToolAnnotations
}

export interface ToolRuntimeBinding {
  readonly implementationId: string
  readonly implementationRevision: string
  readonly configurationDigest?: string
}

export interface ToolBindingEvidence {
  readonly descriptor: ToolDescriptor
  readonly runtimeBinding: ToolRuntimeBinding
}

export interface ToolRegistrySnapshot {
  readonly tools: readonly ToolBindingEvidence[]
}

export interface ToolDefinition extends ToolDescriptor {
  readonly runtimeBinding: ToolRuntimeBinding
  presentCall?(input: JsonValue): ToolActivityPresentation
  presentResult?(request: {
    readonly input: JsonValue
    readonly result: ToolExecutionResult
  }): ToolActivityPresentation
  presentFailure?(request: {
    readonly input: JsonValue
    readonly error: unknown
    readonly reason: "exception" | "cancelled" | "timed_out"
  }): ToolActivityPresentation
  invoke(invocation: ToolInvocation): Promise<ToolExecutionResult>
}

export interface ToolInvocationIdentity {
  readonly principalId: string
  readonly sessionId: string
  readonly inputId: string
  readonly turnId: string
  readonly attemptId: string
}

export interface ToolInvocation extends ToolInvocationIdentity {
  readonly toolCallId: string
  readonly toolName: string
  readonly input: JsonValue
  readonly idempotencyKey: string
  readonly capabilityRoutes?: readonly ModelCapabilityRouteExecutionBinding[]
  readonly resources: ToolResourceOutputPort
  readonly signal?: RuntimeAbortSignal
}

export interface ToolOutputResourceRequest {
  readonly content: Uint8Array
  readonly mediaType?: string
  readonly kind?: ResourceKind
  readonly label?: string
  readonly metadata?: JsonValue
  readonly width?: number
  readonly height?: number
  readonly durationMs?: number
  readonly inputResourceIds?: readonly string[]
}

export interface ToolResourceOutputPort {
  publish(request: ToolOutputResourceRequest): Promise<Extract<ToolResultContentPart, { type: "resource" }>>
  reference(resourceId: string): Promise<Extract<ToolResultContentPart, { type: "resource" }>>
}

export type ToolExecutionResult =
  | {
      readonly outcome: "succeeded" | "failed"
      readonly toolCallId: string
      readonly content: readonly ToolResultContentPart[]
    }
  | {
      readonly outcome: "ambiguous"
      readonly toolCallId: string
      readonly message: string
      readonly reconciliationRef?: string
      readonly metadata?: JsonValue
    }
  | {
      readonly outcome: "deferred"
      readonly toolCallId: string
      readonly operation: DeferredToolOperationRequest
    }

export type ToolPermissionDecision =
  | {
      readonly status: "allow"
      readonly reason: string
      readonly authorizationRef?: string
    }
  | {
      readonly status: "deny"
      readonly reason: string
      readonly authorizationRef?: string
    }
  | {
      readonly status: "approval_required"
      readonly reason: string
      readonly presentation: ToolApprovalPresentation
      readonly authorizationRef?: string
    }

export interface ToolApprovalPresentation {
  readonly summary: string
  readonly details?: readonly ToolApprovalPresentationDetail[]
}

export interface ToolApprovalPresentationDetail {
  readonly label: string
  readonly value: string
}

export interface ToolPermissionRequest extends ToolInvocationIdentity {
  readonly call: ToolCallMessagePart
  readonly descriptor: ToolDescriptor
}

export interface ToolPermissionPolicy {
  snapshot(): ToolRuntimeBinding
  authorize(request: ToolPermissionRequest): Promise<ToolPermissionDecision>
}

export interface ToolExecutionRequest extends ToolInvocationIdentity {
  readonly sourceMessageId: string
  readonly jobId: string
  readonly workerId: string
  readonly leaseToken: string
  readonly call: ToolCallMessagePart
  readonly idempotencyKey: string
  readonly permissionPolicy?: ToolPermissionPolicy
  readonly signal?: RuntimeAbortSignal
  readonly timeoutMs?: number
  readonly storage: Pick<
    ToolExecutionStore,
    | "beginToolExecution"
    | "finishToolExecution"
    | "getToolExecutionByCall"
    | "requireToolExecutionRecovery"
    | "deferToolExecution"
  > & Pick<
    CoreStore,
    "getResource" | "ingestResource" | "recordResourceProvenance"
  >
  readonly budget?: {
    readonly grantId: string
    readonly storage: Pick<SchedulerStore, "recordBudgetUsage">
  }
}

interface ToolExecutionOutcomeBase {
  readonly descriptor?: ToolDescriptor
  readonly permission: ToolPermissionDecision
  readonly invoked: boolean
}

export type ToolExecutionOutcome =
  | (ToolExecutionOutcomeBase & {
      readonly state: "completed"
      readonly result: ToolResultMessagePart
    })
  | (ToolExecutionOutcomeBase & {
      readonly state: "recovery_required"
      readonly recovery: RequireToolExecutionRecoveryReceipt
    })
  | (ToolExecutionOutcomeBase & {
      readonly state: "suspended"
      readonly receipt: DeferToolExecutionReceipt
    })
  | (ToolExecutionOutcomeBase & {
      readonly state: "approval_required"
      readonly receipt: ToolExecutionApprovalSuspensionReceipt
    })
