import {
  isInsideOrSame,
  isSafeRelativeDirectory,
  normalizeAbsolutePath
} from "./paths.js"
import type {
  SkillDiagnostic,
  SkillDiscoveryOptions,
  SkillTrustPolicy
} from "./types.js"

export const DEFAULT_PROJECT_SKILL_DIRS = [
  ".agents/skills",
  ".wanex/skills"
] as const

const DEFAULT_TRUST: SkillTrustPolicy = {
  projectSkills: "untrusted"
}

export interface ResolvedSkillDiscoveryPolicy {
  readonly projectSkillDirs: readonly string[]
  readonly trust: SkillTrustPolicy
  readonly cwd: string
  readonly projectRoot: string
}

export function resolveSkillDiscoveryPolicy(
  options: SkillDiscoveryOptions
):
  | { readonly status: "available"; readonly policy: ResolvedSkillDiscoveryPolicy }
  | { readonly status: "unavailable"; readonly diagnostic: SkillDiagnostic } {
  const projectSkillDirs = options.projectSkillDirs ?? DEFAULT_PROJECT_SKILL_DIRS
  if (
    projectSkillDirs.length === 0 ||
    projectSkillDirs.some((dir) => !isSafeRelativeDirectory(dir))
  ) {
    return {
      status: "unavailable",
      diagnostic: {
        code: "skill.invalid_options",
        severity: "error",
        message:
          "Project skill directories must be non-empty safe relative directory paths."
      }
    }
  }

  const cwd = normalizeAbsolutePath(options.cwd)
  const projectRoot = normalizeAbsolutePath(options.projectRoot ?? cwd)
  if (!isInsideOrSame(projectRoot, cwd)) {
    return {
      status: "unavailable",
      diagnostic: {
        code: "skill.invalid_options",
        severity: "error",
        message: "Skill discovery cwd must be inside projectRoot."
      }
    }
  }

  return {
    status: "available",
    policy: {
      projectSkillDirs,
      cwd,
      projectRoot,
      trust: {
        ...DEFAULT_TRUST,
        ...options.trust
      }
    }
  }
}
