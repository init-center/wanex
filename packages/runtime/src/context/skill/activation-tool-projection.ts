import type {
  ToolExecutionResult
} from "../../tools/index.js"
import { jsonToolResultContent } from "../../tools/parts.js"
import type {
  ActivateSkillInput,
  SkillActivationToolError,
  SkillActivationToolResult
} from "./types.js"

export function parseActivateSkillInput(input: unknown): ActivateSkillInput | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null
  }
  const name = (input as { readonly name?: unknown }).name
  if (typeof name !== "string" || name.trim().length === 0) {
    return null
  }
  return { name: name.trim() }
}

export function skillActivationToolErrorResult(
  toolCallId: string,
  error: SkillActivationToolError
): ToolExecutionResult {
  return {
    outcome: "failed",
    toolCallId,
    content: jsonToolResultContent(skillActivationToolErrorToJson(error))
  }
}

export function skillActivationToolResultToJson(
  result: SkillActivationToolResult
) {
  return {
    name: result.name,
    directory: result.directory,
    path: result.path,
    output: result.output,
    provenance: {
      scope: result.provenance.scope,
      hash: result.provenance.hash,
      bodyHash: result.provenance.bodyHash,
      ...(result.provenance.mtimeMs === undefined
        ? {}
        : { mtimeMs: result.provenance.mtimeMs })
    },
    supportingFiles: result.supportingFiles.map((file) => ({
      path: file.path,
      relativePath: file.relativePath
    }))
  }
}

function skillActivationToolErrorToJson(error: SkillActivationToolError) {
  return {
    error: error.error,
    message: error.message,
    ...(error.skillName === undefined ? {} : { skillName: error.skillName })
  }
}
