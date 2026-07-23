import type {
  ToolDefinition,
  ToolExecutionResult,
  ToolInvocation
} from "./types.js"
import { createToolRuntimeBinding } from "./evidence.js"

export class EchoTool implements ToolDefinition {
  readonly name = "echo"
  readonly description = "Return the provided input unchanged."
  readonly inputSchema = {
    type: "object",
    additionalProperties: true
  } as const
  readonly risk = "read_only" as const
  readonly idempotent = true
  readonly annotations = { readOnlyHint: true, idempotentHint: true } as const
  readonly runtimeBinding = createToolRuntimeBinding({
    implementationId: "wanex.runtime.tool.echo",
    implementationRevision: "1"
  })

  async invoke(invocation: ToolInvocation): Promise<ToolExecutionResult> {
    return {
      toolCallId: invocation.toolCallId,
      result: { echo: invocation.input },
      isError: false
    }
  }
}
