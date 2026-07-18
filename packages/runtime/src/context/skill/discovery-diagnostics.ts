import type {
  SkillDiagnostic,
  SkillScope,
  SkillSnapshot,
  SkillSource
} from "./types.js"

export function unavailable(
  diagnostic: SkillDiagnostic,
  sources: readonly SkillSource[],
  diagnostics: readonly SkillDiagnostic[]
): SkillSnapshot {
  return {
    status: "unavailable",
    sources,
    diagnostics: [...diagnostics, diagnostic]
  }
}

export function unavailableDiagnostic(
  path: string,
  scope: SkillScope,
  error: unknown
): SkillDiagnostic {
  return {
    code: "skill.source_unavailable",
    severity: "error",
    message: `Skill source is unavailable: ${error instanceof Error ? error.message : String(error)}`,
    path,
    scope
  }
}
