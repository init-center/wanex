import type {
  CompiledContext,
  ContextCompiler
} from "../memory/index.js"

export class EmptyContextCompiler implements ContextCompiler {
  async compile(input: Parameters<ContextCompiler["compile"]>[0]): Promise<CompiledContext> {
    return {
      sessionId: input.sessionId,
      ...(input.epochId === undefined ? {} : { epochId: input.epochId }),
      messages: [
        ...input.inputs.map((record) => ({
          role: record.inputType === "system" ? "system" as const : "user" as const,
          content: record.content
        })),
        ...input.messages.map((record) => ({
          role: record.role,
          content: record.content
        }))
      ],
      stats: {
        tokenEstimateBefore: 0,
        tokenEstimateAfter: 0
      }
    }
  }
}
