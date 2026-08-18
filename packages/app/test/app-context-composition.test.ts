import { describe, expect, it } from "vitest"
import {
  AllowAllToolsPolicy,
  createToolRuntimeBinding,
  jsonToolResultContent,
  ToolRegistry,
  type ToolDefinition
} from "@wanex/runtime/tools"
import { composeWanexAppAgentContext } from "../src/agent-context-composition.js"

describe("@wanex/app agent context composition", () => {
  it("keeps discovered and trusted runtime tools in one registry", () => {
    const discovered = registryWith(tool("activate_skill"))
    const runtime = registryWith(tool("remote_lookup"))
    const policy = new AllowAllToolsPolicy()

    const composed = composeWanexAppAgentContext({
      discovered: { tools: discovered },
      runtime: { tools: runtime, toolPermissionPolicy: policy }
    })

    expect(composed?.tools?.list().map((item) => item.name)).toEqual([
      "activate_skill",
      "remote_lookup"
    ])
    expect(composed?.toolPermissionPolicy).toBe(policy)
    expect(discovered.list().map((item) => item.name)).toEqual([
      "activate_skill"
    ])
    expect(runtime.list().map((item) => item.name)).toEqual(["remote_lookup"])
  })

  it("fails closed when discovered and runtime tools claim the same name", () => {
    expect(() =>
      composeWanexAppAgentContext({
        discovered: { tools: registryWith(tool("duplicate")) },
        runtime: { tools: registryWith(tool("duplicate")) }
      })
    ).toThrow("tool already registered: duplicate")
  })
})

function registryWith(definition: ToolDefinition): ToolRegistry {
  const registry = new ToolRegistry()
  registry.register(definition)
  return registry
}

function tool(name: string): ToolDefinition {
  return {
    name,
    description: `${name} test tool`,
    inputSchema: { type: "object", additionalProperties: true },
    risk: "read_only",
    idempotent: true,
    concurrency: "parallel_safe",
    resultMode: "immediate",
    runtimeBinding: createToolRuntimeBinding({
      implementationId: `wanex.test.context.${name}`,
      implementationRevision: "1"
    }),
    async invoke(invocation) {
      return {
        outcome: "succeeded",
        toolCallId: invocation.toolCallId,
        content: jsonToolResultContent({ ok: true })
      }
    }
  }
}
