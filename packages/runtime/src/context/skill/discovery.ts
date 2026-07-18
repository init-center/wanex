import { join } from "node:path"
import { discoverSkillsInDirectory } from "./discovery-directory.js"
import { unavailable } from "./discovery-diagnostics.js"
import { resolveSkillDiscoveryPolicy } from "./discovery-policy.js"
import { observeProjectSkillRoot } from "./discovery-project.js"
import { nodeSkillFileSystem } from "./fs.js"
import { normalizeAbsolutePath, upwardDirectories } from "./paths.js"
import type {
  SkillDiagnostic,
  SkillDiscoveryOptions,
  SkillSnapshot,
  SkillSource
} from "./types.js"

export async function discoverSkillSnapshot(
  options: SkillDiscoveryOptions
): Promise<SkillSnapshot> {
  const fs = options.fs ?? nodeSkillFileSystem
  const diagnostics: SkillDiagnostic[] = []
  const sources: SkillSource[] = []
  const seenNames = new Set<string>()
  let order = 0

  const policy = resolveSkillDiscoveryPolicy(options)
  if (policy.status === "unavailable") {
    return unavailable(policy.diagnostic, sources, diagnostics)
  }

  for (const directory of options.globalSkillDirs ?? []) {
    const result = await discoverSkillsInDirectory({
      fs,
      directory: normalizeAbsolutePath(directory),
      scope: "global",
      sources,
      diagnostics,
      seenNames,
      order
    })
    if (result.status === "unavailable") {
      return unavailable(result.diagnostic, sources, diagnostics)
    }
    order = result.order
  }

  const projectDirectories = upwardDirectories({
    start: policy.policy.cwd,
    stop: policy.policy.projectRoot
  })
  if (
    projectDirectories.length > 0 &&
    policy.policy.trust.projectSkills !== "trusted"
  ) {
    for (const directory of projectDirectories) {
      for (const projectSkillDir of policy.policy.projectSkillDirs) {
        const skillRoot = join(directory, projectSkillDir)
        const observed = await observeProjectSkillRoot(fs, skillRoot)
        if (observed.status === "unavailable") {
          return unavailable(observed.diagnostic, sources, diagnostics)
        }
        if (observed.exists) {
          diagnostics.push({
            code: "skill.project_untrusted",
            severity: "warning",
            message:
              "Project skill directory was discovered but not loaded because project skills are untrusted.",
            path: skillRoot,
            scope: "project"
          })
        }
      }
    }
    return {
      status: "available",
      sources,
      diagnostics
    }
  }

  for (const directory of projectDirectories) {
    for (const projectSkillDir of policy.policy.projectSkillDirs) {
      const result = await discoverSkillsInDirectory({
        fs,
        directory: join(directory, projectSkillDir),
        scope: "project",
        sources,
        diagnostics,
        seenNames,
        order
      })
      if (result.status === "unavailable") {
        return unavailable(result.diagnostic, sources, diagnostics)
      }
      order = result.order
    }
  }

  return {
    status: "available",
    sources,
    diagnostics
  }
}
