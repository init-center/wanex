import type {
  ToolDefinition,
  ToolExecutionResult,
  ToolInvocation
} from "./types.js"

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

  async invoke(invocation: ToolInvocation): Promise<ToolExecutionResult> {
    return {
      toolCallId: invocation.toolCallId,
      result: { echo: invocation.input },
      isError: false
    }
  }
}
