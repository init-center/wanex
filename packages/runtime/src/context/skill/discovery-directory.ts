import { join } from "node:path"
import { safeReadDir, safeStat } from "./discovery-fs.js"
import { readSkillSource } from "./discovery-source.js"
import type {
  SkillDiagnostic,
  SkillDiscoveryOptions,
  SkillScope,
  SkillSource
} from "./types.js"

export async function discoverSkillsInDirectory(options: {
  readonly fs: SkillDiscoveryOptions["fs"] & {}
  readonly directory: string
  readonly scope: SkillScope
  readonly sources: SkillSource[]
  readonly diagnostics: SkillDiagnostic[]
  readonly seenNames: Set<string>
  readonly order: number
}): Promise<
  | { readonly status: "available"; readonly order: number }
  | { readonly status: "unavailable"; readonly diagnostic: SkillDiagnostic }
> {
  const directoryStat = await safeStat(options.fs, options.directory, options.scope)
  if (directoryStat.status === "unavailable") {
    return directoryStat
  }
  if (directoryStat.stat?.isDirectory !== true) {
    return { status: "available", order: options.order }
  }

  const entries = await safeReadDir(options.fs, options.directory, options.scope)
  if (entries.status === "unavailable") {
    return entries
  }
  let order = options.order
  for (const entry of [...(entries.entries ?? [])].sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory || entry.name.startsWith(".")) {
      continue
    }
    const result = await readSkillSource({
      fs: options.fs,
      directory: join(options.directory, entry.name),
      directoryName: entry.name,
      scope: options.scope,
      order
    })
    if (result.status === "unavailable") {
      return result
    }
    if (result.diagnostic !== undefined) {
      options.diagnostics.push(result.diagnostic)
    }
    if (result.source === undefined) {
      continue
    }
    if (options.seenNames.has(result.source.name)) {
      options.diagnostics.push({
        code: "skill.duplicate_name",
        severity: "warning",
        message:
          "Skill name is already present in an earlier source; the later skill was skipped.",
        path: result.source.path,
        scope: result.source.scope,
        skillName: result.source.name
      })
      continue
    }
    options.sources.push(result.source)
    options.seenNames.add(result.source.name)
    order += 1
  }
  return { status: "available", order }
}
