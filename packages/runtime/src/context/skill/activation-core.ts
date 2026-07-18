import { parseSkillMarkdown, SkillFrontmatterError } from "./frontmatter.js"
import { nodeSkillFileSystem } from "./fs.js"
import { stableSkillHash } from "./hash.js"
import {
  DEFAULT_MAX_INDEXED_FILES,
  DEFAULT_SUPPORTING_DIRECTORIES
} from "./activation-constants.js"
import {
  listSkillSupportingFiles
} from "./activation-supporting-files.js"
import type {
  SkillActivationOptions,
  SkillActivationResult,
  SkillActivationToolError,
  SkillSnapshot,
  SkillSource
} from "./types.js"

export async function activateSkill(
  options: SkillActivationOptions & { readonly name: string }
): Promise<SkillActivationResult | SkillActivationToolError> {
  const source = findSkill(options.snapshot, options.name)
  if (source === undefined) {
    return {
      error: "skill_not_found",
      message: `Skill not found: ${options.name}`,
      skillName: options.name
    }
  }
  const fs = options.fs ?? nodeSkillFileSystem
  const validation = await validateSkillActivationSource({ fs, source })
  if ("error" in validation) {
    return validation
  }

  return {
    name: source.name,
    description: source.description,
    directory: source.directory,
    path: source.path,
    content: validation.content,
    provenance: {
      scope: source.scope,
      hash: source.hash,
      bodyHash: source.bodyHash,
      ...(source.mtimeMs === undefined ? {} : { mtimeMs: source.mtimeMs })
    },
    supportingFiles: await listSkillSupportingFiles({
      fs,
      source,
      supportingDirectories:
        options.supportingDirectories ?? DEFAULT_SUPPORTING_DIRECTORIES,
      maxIndexedFiles: options.maxIndexedFiles ?? DEFAULT_MAX_INDEXED_FILES
    })
  }
}

async function validateSkillActivationSource(options: {
  readonly fs: NonNullable<SkillActivationOptions["fs"]>
  readonly source: SkillSource
}): Promise<
  | {
      readonly content: string
    }
  | SkillActivationToolError
> {
  let content: string | undefined
  try {
    content = await options.fs.readFile(options.source.path)
  } catch (error) {
    return {
      error: "skill_source_unavailable",
      message: `Skill source is unavailable: ${error instanceof Error ? error.message : String(error)}`,
      skillName: options.source.name
    }
  }
  if (content === undefined) {
    return {
      error: "skill_source_missing",
      message: "Skill source disappeared before it could be activated.",
      skillName: options.source.name
    }
  }

  try {
    const parsed = parseSkillMarkdown({
      content,
      path: options.source.path,
      directoryName: options.source.name
    })
    if (parsed.name !== options.source.name) {
      return {
        error: "skill_source_invalid",
        message: "Skill source name no longer matches the discovered catalog entry.",
        skillName: options.source.name
      }
    }
    const contentHash = stableSkillHash(content)
    const bodyHash = stableSkillHash(parsed.body)
    if (contentHash !== options.source.hash || bodyHash !== options.source.bodyHash) {
      return {
        error: "skill_source_changed",
        message:
          "Skill source changed after discovery; refresh the skill catalog before activation.",
        skillName: options.source.name
      }
    }
  } catch (error) {
    if (error instanceof SkillFrontmatterError) {
      return {
        error: "skill_source_invalid",
        message: error.message,
        skillName: options.source.name
      }
    }
    throw error
  }

  return { content }
}

function findSkill(snapshot: SkillSnapshot, name: string): SkillSource | undefined {
  return snapshot.sources.find((source) => source.name === name)
}
