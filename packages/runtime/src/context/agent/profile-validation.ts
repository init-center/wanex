import type { AgentContextProfile } from "./types.js"

export function assertAgentContextProfile(
  profile: AgentContextProfile
): void {
  if (profile.instructions !== undefined) {
    assertNonEmptyString(profile.instructions.cwd, "instructions.cwd")
    assertOptionalNonEmptyString(
      profile.instructions.projectRoot,
      "instructions.projectRoot"
    )
    assertOptionalNonEmptyString(
      profile.instructions.globalConfigDir,
      "instructions.globalConfigDir"
    )
    assertOptionalNonEmptyStrings(
      profile.instructions.targets,
      "instructions.targets"
    )
  }
  if (profile.skills !== undefined) {
    assertNonEmptyString(profile.skills.cwd, "skills.cwd")
    assertOptionalNonEmptyString(profile.skills.projectRoot, "skills.projectRoot")
    assertOptionalNonEmptyStrings(
      profile.skills.globalSkillDirs,
      "skills.globalSkillDirs"
    )
    assertOptionalNonEmptyStrings(
      profile.skills.projectSkillDirs,
      "skills.projectSkillDirs"
    )
    if (profile.skills.activationTool !== undefined) {
      if (
        profile.skills.activationTool.maxIndexedFiles !== undefined &&
        (!Number.isInteger(profile.skills.activationTool.maxIndexedFiles) ||
          profile.skills.activationTool.maxIndexedFiles <= 0)
      ) {
        throw new Error("skills.activationTool.maxIndexedFiles must be a positive integer")
      }
      assertOptionalNonEmptyStrings(
        profile.skills.activationTool.supportingDirectories,
        "skills.activationTool.supportingDirectories"
      )
    }
  }
}

function assertNonEmptyString(value: string, label: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`)
  }
}

function assertOptionalNonEmptyString(
  value: string | undefined,
  label: string
): void {
  if (value !== undefined) {
    assertNonEmptyString(value, label)
  }
}

function assertOptionalNonEmptyStrings(
  value: readonly string[] | undefined,
  label: string
): void {
  if (value === undefined) {
    return
  }
  if (value.length === 0) {
    throw new Error(`${label} must not be empty`)
  }
  for (const item of value) {
    assertNonEmptyString(item, label)
  }
}
