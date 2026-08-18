import type {
  CompiledContext,
  ContextCompiler
} from "../memory/index.js"
import type { SessionInputRecord } from "@wanex/protocol"
import { skillSnapshotToSystemPart } from "./render.js"
import type {
  SkillContextCompileInput,
  SkillContextCompilerOptions,
  SkillSnapshot
} from "./types.js"

export class SkillContextCompiler implements ContextCompiler {
  private readonly snapshot: SkillSnapshot
  private readonly downstream: ContextCompiler | undefined

  constructor(options: SkillContextCompilerOptions) {
    this.snapshot = options.snapshot
    this.downstream = options.downstream
  }

  async compile(input: SkillContextCompileInput): Promise<CompiledContext> {
    const systemPart = skillSnapshotToSystemPart(this.snapshot)
    const nextInput =
      systemPart === null
        ? input
        : {
            ...input,
            inputs: [skillInput(input.sessionId, systemPart), ...input.inputs]
          }

    if (this.downstream !== undefined) {
      return await this.downstream.compile(nextInput)
    }

    return {
      sessionId: input.sessionId,
      ...(input.epochId === undefined ? {} : { epochId: input.epochId }),
      messages: replayMessages(nextInput),
      stats: {
        tokenEstimateBefore: 0,
        tokenEstimateAfter: 0
      }
    }
  }
}

function skillInput(
  sessionId: string,
  part: SessionInputRecord["content"][number]
): SessionInputRecord {
  return {
    id: part.id,
    sessionId,
    principalId: "wanex-skill-runtime",
    idempotencyKey: `skill-runtime:${sessionId}:${part.id}`,
    inputType: "system",
    content: [part],
    status: "completed",
    createdAt: 0,
    updatedAt: 0
  }
}

function replayMessages(input: SkillContextCompileInput): CompiledContext["messages"] {
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
