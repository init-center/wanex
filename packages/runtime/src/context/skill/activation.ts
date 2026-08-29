import type {
  ToolDefinition,
  ToolExecutionResult,
  ToolInvocation
} from "../../tools/index.js"
import { createToolRuntimeBinding } from "../../tools/index.js"
import {
  activateSkill
} from "./activation-core.js"
import {
  formatSkillActivationResult
} from "./activation-format.js"
import {
  SKILL_ACTIVATION_TOOL_NAME
} from "./activation-constants.js"
import {
  parseActivateSkillInput,
  skillActivationToolErrorResult,
  skillActivationToolResultToJson
} from "./activation-tool-projection.js"
import type {
  SkillActivationOptions
} from "./types.js"
import { jsonToolResultContent } from "../../tools/parts.js"

export {
  SKILL_ACTIVATION_TOOL_NAME
} from "./activation-constants.js"
export {
  activateSkill
} from "./activation-core.js"
export {
  formatSkillActivationResult
} from "./activation-format.js"

export class SkillActivationTool implements ToolDefinition {
  readonly name = SKILL_ACTIVATION_TOOL_NAME
  readonly description = "Load one discovered skill and its supporting context."
  readonly inputSchema = {
    type: "object",
    properties: { name: { type: "string", minLength: 1 } },
    required: ["name"],
    additionalProperties: false
  } as const
  readonly risk = "read_only" as const
  readonly idempotent = true
  readonly concurrency = "parallel_safe" as const
  readonly resultMode = "immediate" as const
  readonly annotations = { readOnlyHint: true, idempotentHint: true } as const
  readonly runtimeBinding

  private readonly options: SkillActivationOptions

  constructor(options: SkillActivationOptions) {
    this.options = options
    this.runtimeBinding = createToolRuntimeBinding({
      implementationId: "wanex.runtime.tool.skill-activation",
      implementationRevision: "1",
      configuration: {
        snapshot: {
          complete: options.snapshot.complete,
          sources: options.snapshot.sources.map((source) => ({
            scope: source.scope,
            name: source.name,
            hash: source.hash,
            bodyHash: source.bodyHash
          }))
        },
        maxIndexedFiles: options.maxIndexedFiles ?? null,
        supportingDirectories: options.supportingDirectories ?? []
      }
    })
  }

  async invoke(invocation: ToolInvocation): Promise<ToolExecutionResult> {
    const input = parseActivateSkillInput(invocation.input)
    if (input === null) {
      return skillActivationToolErrorResult(invocation.toolCallId, {
        error: "invalid_input",
        message: "activate_skill input must be an object with a non-empty string name."
      })
    }

    const result = await activateSkill({
      ...this.options,
      name: input.name
    })
    if ("error" in result) {
      return skillActivationToolErrorResult(invocation.toolCallId, result)
    }

    return {
      outcome: "succeeded",
      toolCallId: invocation.toolCallId,
      content: jsonToolResultContent(skillActivationToolResultToJson({
        name: result.name,
        directory: result.directory,
        path: result.path,
        output: formatSkillActivationResult(result),
        provenance: result.provenance,
        supportingFiles: result.supportingFiles
      }))
    }
  }
}
