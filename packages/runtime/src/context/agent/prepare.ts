import {
  discoverInstructionSnapshot,
  InstructionContextCompiler
} from "../instruction/index.js"
import {
  discoverSkillSnapshot,
  SkillActivationTool,
  SkillContextCompiler
} from "../skill/index.js"
import { RiskBoundToolPolicy, ToolRegistry } from "../../tools/index.js"
import { EmptyContextCompiler } from "./empty-context.js"
import type {
  PreparedAgentContext,
  PrepareAgentContextOptions
} from "./types.js"

export async function prepareAgentContext(
  options: PrepareAgentContextOptions
): Promise<PreparedAgentContext> {
  let compiler = options.downstream
  let tools = options.tools
  let toolPermissionPolicy = options.toolPermissionPolicy
  let instructionSnapshot: PreparedAgentContext["instructionSnapshot"]
  let skillSnapshot: PreparedAgentContext["skillSnapshot"]

  if (options.instructions !== undefined) {
    instructionSnapshot = await discoverInstructionSnapshot(options.instructions)
    compiler = new InstructionContextCompiler({
      snapshot: instructionSnapshot,
      ...(compiler === undefined ? {} : { downstream: compiler })
    })
  }

  if (options.skills !== undefined) {
    skillSnapshot = await discoverSkillSnapshot(options.skills)
    compiler = new SkillContextCompiler({
      snapshot: skillSnapshot,
      ...(compiler === undefined ? {} : { downstream: compiler })
    })
    if (options.skills.registerActivationTool === true) {
      tools ??= new ToolRegistry()
      tools.register(
        new SkillActivationTool({
          snapshot: skillSnapshot,
          ...(options.skills.fs === undefined ? {} : { fs: options.skills.fs }),
          ...(options.skills.activationTool?.maxIndexedFiles === undefined
            ? {}
            : { maxIndexedFiles: options.skills.activationTool.maxIndexedFiles }),
          ...(options.skills.activationTool?.supportingDirectories === undefined
            ? {}
            : {
                supportingDirectories:
                  options.skills.activationTool.supportingDirectories
              })
        })
      )
      toolPermissionPolicy ??= new RiskBoundToolPolicy(["read_only"])
    }
  }

  if (compiler === undefined && options.includeEmptyCompiler === true) {
    compiler = new EmptyContextCompiler()
  }

  return {
    ...(compiler === undefined ? {} : { contextCompiler: compiler }),
    ...(instructionSnapshot === undefined ? {} : { instructionSnapshot }),
    ...(skillSnapshot === undefined ? {} : { skillSnapshot }),
    ...(tools === undefined ? {} : { tools }),
    ...(toolPermissionPolicy === undefined ? {} : { toolPermissionPolicy })
  }
}
