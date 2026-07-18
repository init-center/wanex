import type {
  ToolDescriptor,
  ToolPermissionDecision,
  ToolPermissionPolicy,
  ToolPermissionRequest,
  ToolRecoveryPolicy,
  ToolRisk
} from "./types.js"
import type { ToolExecutionRecord } from "@wanex/protocol"

export class AllowAllToolsPolicy implements ToolPermissionPolicy {
  async authorize(): Promise<ToolPermissionDecision> {
    return { status: "allow", reason: "explicit_allow_all_policy" }
  }
}

export class RiskBoundToolPolicy implements ToolPermissionPolicy {
  private readonly allowedRisks: ReadonlySet<ToolRisk>

  constructor(allowedRisks: readonly ToolRisk[]) {
    this.allowedRisks = new Set(allowedRisks)
  }

  async authorize(
    request: ToolPermissionRequest
  ): Promise<ToolPermissionDecision> {
    return this.allowedRisks.has(request.descriptor.risk)
      ? { status: "allow", reason: `risk_allowed:${request.descriptor.risk}` }
      : { status: "deny", reason: `risk_denied:${request.descriptor.risk}` }
  }
}

export class BoundedIdempotentRecoveryPolicy implements ToolRecoveryPolicy {
  readonly maxAttempts: number

  constructor(maxAttempts: number) {
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      throw new Error("tool recovery maxAttempts must be a positive integer")
    }
    this.maxAttempts = maxAttempts
  }

  async retryIdempotent(request: {
    readonly execution: ToolExecutionRecord
    readonly descriptor: ToolDescriptor
  }): Promise<boolean> {
    return request.descriptor.idempotent && request.execution.attempt < this.maxAttempts
  }
}
