import { Buffer } from "node:buffer"
import { basename, join } from "node:path"
import { parseSkillMarkdown, SkillFrontmatterError } from "./frontmatter.js"
import { stableSkillHash } from "./hash.js"
import { unavailableDiagnostic } from "./discovery-diagnostics.js"
import { safeStat } from "./discovery-fs.js"
import type {
  SkillDiagnostic,
  SkillDiscoveryOptions,
  SkillScope,
  SkillSource
} from "./types.js"

export async function readSkillSource(options: {
  readonly fs: SkillDiscoveryOptions["fs"] & {}
  readonly directory: string
  readonly directoryName: string
  readonly scope: SkillScope
  readonly order: number
}): Promise<
  | {
      readonly status: "available"
      readonly source?: SkillSource
      readonly diagnostic?: SkillDiagnostic
    }
  | { readonly status: "unavailable"; readonly diagnostic: SkillDiagnostic }
> {
  const path = join(options.directory, "SKILL.md")
  const stat = await safeStat(options.fs, path, options.scope)
  if (stat.status === "unavailable") {
    return stat
  }
  if (stat.stat?.isFile !== true) {
    return { status: "available" }
  }

  let content: string | undefined
  try {
    content = await options.fs.readFile(path)
  } catch (error) {
    return {
      status: "unavailable",
      diagnostic: unavailableDiagnostic(path, options.scope, error)
    }
  }
  if (content === undefined) {
    return {
      status: "unavailable",
      diagnostic: {
        code: "skill.source_missing",
        severity: "warning",
        message: "Skill source disappeared before it could be read.",
        path,
        scope: options.scope
      }
    }
  }

  try {
    const parsed = parseSkillMarkdown({
      content,
      path,
      directoryName: options.directoryName
    })
    return {
      status: "available",
      source: {
        id: `${options.scope}:${stableSkillHash(path)}`,
        scope: options.scope,
        name: parsed.name,
        description: parsed.description,
        directory: options.directory,
        path,
        order: options.order,
        byteLength: Buffer.byteLength(content, "utf8"),
        hash: stableSkillHash(content),
        bodyHash: stableSkillHash(parsed.body),
        ...(parsed.allowedTools === undefined
          ? {}
          : { allowedTools: parsed.allowedTools }),
        ...(parsed.metadata === undefined ? {} : { metadata: parsed.metadata }),
        ...(stat.stat.mtimeMs === undefined ? {} : { mtimeMs: stat.stat.mtimeMs })
      }
    }
  } catch (error) {
    if (error instanceof SkillFrontmatterError) {
      return {
        status: "available",
        diagnostic: {
          code: "skill.invalid_frontmatter",
          severity: "warning",
          message: error.message,
          path,
          scope: options.scope,
          skillName: basename(options.directory)
        }
      }
    }
    throw error
  }
}
