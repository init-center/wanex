import type {
  CompiledContext,
  ContextCompiler
} from "../memory/index.js"

export class EmptyContextCompiler implements ContextCompiler {
  async compile(input: Parameters<ContextCompiler["compile"]>[0]): Promise<CompiledContext> {
    return {
      sessionId: input.sessionId,
      ...(input.epochId === undefined ? {} : { epochId: input.epochId }),
      policy: {
        version: "agent-context-runtime-empty",
        maxInputTokens: 0,
        recentUserTurns: 0,
        snipTextOverChars: 0,
        placeholderTextOverChars: 0,
        snipHeadChars: 0,
        snipTailChars: 0
      },
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
      replacements: [],
      stats: {
        tokenEstimateBefore: 0,
        tokenEstimateAfter: 0,
        replacementCount: 0
      }
    }
  }
}
