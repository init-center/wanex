import type {
  CompiledContext,
  ContextCompiler
} from "../memory/index.js"
import type { SessionInputRecord } from "@wanex/protocol"
import { instructionSnapshotToSystemPart } from "./render.js"
import type {
  InstructionContextCompileInput,
  InstructionContextCompilerOptions,
  InstructionSnapshot
} from "./types.js"

export class InstructionContextCompiler implements ContextCompiler {
  private readonly snapshot: InstructionSnapshot
  private readonly downstream: ContextCompiler | undefined

  constructor(options: InstructionContextCompilerOptions) {
    this.snapshot = options.snapshot
    this.downstream = options.downstream
  }

  async compile(input: InstructionContextCompileInput): Promise<CompiledContext> {
    const systemPart = instructionSnapshotToSystemPart(this.snapshot)
    const nextInput =
      systemPart === null
        ? input
        : {
            ...input,
            inputs: [instructionInput(input.sessionId, systemPart), ...input.inputs]
          }

    if (this.downstream !== undefined) {
      return await this.downstream.compile(nextInput)
    }

    return {
      sessionId: input.sessionId,
      ...(input.epochId === undefined ? {} : { epochId: input.epochId }),
      policy: {
        version: "instruction-runtime-only",
        maxInputTokens: 0,
        recentUserTurns: 0,
        snipTextOverChars: 0,
        placeholderTextOverChars: 0,
        snipHeadChars: 0,
        snipTailChars: 0
      },
      messages: replayMessages(nextInput),
      replacements: [],
      stats: {
        tokenEstimateBefore: 0,
        tokenEstimateAfter: 0,
        replacementCount: 0
      }
    }
  }
}

function instructionInput(
  sessionId: string,
  part: SessionInputRecord["content"][number]
): SessionInputRecord {
  return {
    id: part.id,
    sessionId,
    principalId: "wanex-instruction-runtime",
    idempotencyKey: `instruction-runtime:${sessionId}:${part.id}`,
    inputType: "system",
    content: [part],
    status: "completed",
    createdAt: 0,
    updatedAt: 0
  }
}

function replayMessages(input: InstructionContextCompileInput): CompiledContext["messages"] {
  return [
    ...input.inputs.map((record): CompiledContext["messages"][number] => ({
      role: record.inputType === "system" ? "system" : "user",
      content: record.content
    })),
    ...input.messages.map((record): CompiledContext["messages"][number] => ({
      role: record.role,
      content: record.content
    }))
  ]
}
