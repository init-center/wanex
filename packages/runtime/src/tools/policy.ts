import type {
  ToolDescriptor,
  ToolPermissionDecision,
  ToolPermissionPolicy,
  ToolPermissionRequest,
  ToolRisk
} from "./types.js"
import { createToolRuntimeBinding } from "./evidence.js"

export class AllowAllToolsPolicy implements ToolPermissionPolicy {
  snapshot() {
    return createToolRuntimeBinding({
      implementationId: "wanex.runtime.tool-policy.allow-all",
      implementationRevision: "1"
    })
  }

  async authorize(): Promise<ToolPermissionDecision> {
    return { status: "allow", reason: "explicit_allow_all_policy" }
  }
}

export class RiskBoundToolPolicy implements ToolPermissionPolicy {
  private readonly allowedRisks: ReadonlySet<ToolRisk>

  constructor(allowedRisks: readonly ToolRisk[]) {
    this.allowedRisks = new Set(allowedRisks)
  }

  snapshot() {
    return createToolRuntimeBinding({
      implementationId: "wanex.runtime.tool-policy.risk-bound",
      implementationRevision: "1",
      configuration: {
        allowedRisks: [...this.allowedRisks].sort()
      }
    })
  }

  async authorize(
    request: ToolPermissionRequest
  ): Promise<ToolPermissionDecision> {
    return this.allowedRisks.has(request.descriptor.risk)
      ? { status: "allow", reason: `risk_allowed:${request.descriptor.risk}` }
      : { status: "deny", reason: `risk_denied:${request.descriptor.risk}` }
  }
}
