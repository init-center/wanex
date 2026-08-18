import { describe, expect, it } from "vitest"
import type { JsonValue } from "@wanex/protocol"
import {
  createToolRuntimeBinding,
  type ToolInvocation
} from "@wanex/runtime/tools"
import {
  createTeamPassTool,
  TEAM_PASS_TOOL_IMPLEMENTATION_ID,
  TEAM_PASS_TOOL_IMPLEMENTATION_REVISION,
  TEAM_PASS_TOOL_NAME
} from "../../src/conversation/index.js"

describe("Team pass Tool", () => {
  it("binds schema, runtime evidence, input, and result to one delivery", async () => {
    const tool = createTeamPassTool({ deliveryId: "team_delivery_pass" })
    expect(tool).toMatchObject({
      name: TEAM_PASS_TOOL_NAME,
      risk: "read_only",
      idempotent: true,
      concurrency: "parallel_safe",
      resultMode: "immediate",
      inputSchema: {
        additionalProperties: false,
        properties: {
          deliveryId: { const: "team_delivery_pass" }
        }
      }
    })
    expect(tool.runtimeBinding).toEqual(createToolRuntimeBinding({
      implementationId: TEAM_PASS_TOOL_IMPLEMENTATION_ID,
      implementationRevision: TEAM_PASS_TOOL_IMPLEMENTATION_REVISION,
      configuration: { deliveryId: "team_delivery_pass" }
    }))
    await expect(tool.invoke(invocation({
      deliveryId: "team_delivery_pass",
      reason: "No additional review is needed."
    }))).resolves.toEqual({
      outcome: "succeeded",
      toolCallId: "call_team_pass",
      content: [{
        type: "json",
        value: {
          kind: "team.pass",
          deliveryId: "team_delivery_pass",
          reason: "No additional review is needed."
        }
      }]
    })
  })

  it("rejects changed identities and malformed direct invocations", async () => {
    expect(() => createTeamPassTool({ deliveryId: "" })).toThrow(/1 to 512/)
    const tool = createTeamPassTool({ deliveryId: "team_delivery_exact" })
    await expect(tool.invoke(invocation({
      deliveryId: "team_delivery_other"
    }))).rejects.toThrow(/exact binding/)
    await expect(tool.invoke(invocation({
      deliveryId: "team_delivery_exact",
      extra: true
    }))).rejects.toThrow(/unsupported fields/)
    await expect(tool.invoke(invocation({
      deliveryId: "team_delivery_exact",
      reason: ""
    }))).rejects.toThrow(/bounded non-empty/)
  })
})

function invocation(input: JsonValue): ToolInvocation {
  return {
    principalId: "agent_pass",
    sessionId: "ses_pass",
    inputId: "inp_pass",
    turnId: "turn_pass",
    attemptId: "attempt_pass",
    toolCallId: "call_team_pass",
    toolName: TEAM_PASS_TOOL_NAME,
    input,
    idempotencyKey: "tool-pass",
    resources: {
      async publish() {
        throw new Error("Team pass Tool does not publish resources")
      },
      async reference() {
        throw new Error("Team pass Tool does not reference resources")
      }
    }
  }
}
