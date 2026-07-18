import type { JsonValue } from "@wanex/protocol"
import type { AgentContextProfile } from "./types.js"
import {
  expectBoolean,
  expectPositiveInteger,
  expectRecord,
  expectString,
  expectStringArray
} from "./profile-json-helpers.js"
import { assertAgentContextProfile } from "./profile-validation.js"

export function agentContextProfileFromJson(
  value: JsonValue,
  label = "agent context profile"
): AgentContextProfile {
  const record = expectRecord(value, label)
  const profile: AgentContextProfile = {
    ...(record.instructions === undefined
      ? {}
      : {
          instructions: parseInstructionProfile(
            record.instructions,
            `${label}.instructions`
          )
        }),
    ...(record.skills === undefined
      ? {}
      : { skills: parseSkillProfile(record.skills, `${label}.skills`) })
  }
  assertAgentContextProfile(profile)
  return profile
}

export function agentContextProfileToJson(
  profile: AgentContextProfile
): JsonValue {
  assertAgentContextProfile(profile)
  return {
    ...(profile.instructions === undefined
      ? {}
      : {
          instructions: {
            cwd: profile.instructions.cwd,
            ...(profile.instructions.projectRoot === undefined
              ? {}
              : { projectRoot: profile.instructions.projectRoot }),
            ...(profile.instructions.globalConfigDir === undefined
              ? {}
              : { globalConfigDir: profile.instructions.globalConfigDir }),
            ...(profile.instructions.targets === undefined
              ? {}
              : { targets: [...profile.instructions.targets] }),
            ...(profile.instructions.trustProject === undefined
              ? {}
              : { trustProject: profile.instructions.trustProject })
          }
        }),
    ...(profile.skills === undefined
      ? {}
      : {
          skills: {
            cwd: profile.skills.cwd,
            ...(profile.skills.projectRoot === undefined
              ? {}
              : { projectRoot: profile.skills.projectRoot }),
            ...(profile.skills.globalSkillDirs === undefined
              ? {}
              : { globalSkillDirs: [...profile.skills.globalSkillDirs] }),
            ...(profile.skills.projectSkillDirs === undefined
              ? {}
              : { projectSkillDirs: [...profile.skills.projectSkillDirs] }),
            ...(profile.skills.trustProject === undefined
              ? {}
              : { trustProject: profile.skills.trustProject }),
            ...(profile.skills.registerActivationTool === undefined
              ? {}
              : { registerActivationTool: profile.skills.registerActivationTool }),
            ...(profile.skills.activationTool === undefined
              ? {}
              : {
                  activationTool: {
                    ...(profile.skills.activationTool.maxIndexedFiles === undefined
                      ? {}
                      : {
                          maxIndexedFiles:
                            profile.skills.activationTool.maxIndexedFiles
                        }),
                    ...(profile.skills.activationTool.supportingDirectories === undefined
                      ? {}
                      : {
                          supportingDirectories: [
                            ...profile.skills.activationTool.supportingDirectories
                          ]
                        })
                  }
                })
          }
        })
  }
}

function parseInstructionProfile(
  value: JsonValue,
  label: string
): NonNullable<AgentContextProfile["instructions"]> {
  const record = expectRecord(value, label)
  return {
    cwd: expectString(record.cwd, `${label}.cwd`),
    ...(record.projectRoot === undefined
      ? {}
      : { projectRoot: expectString(record.projectRoot, `${label}.projectRoot`) }),
    ...(record.globalConfigDir === undefined
      ? {}
      : {
          globalConfigDir: expectString(
            record.globalConfigDir,
            `${label}.globalConfigDir`
          )
        }),
    ...(record.targets === undefined
      ? {}
      : { targets: expectStringArray(record.targets, `${label}.targets`) }),
    ...(record.trustProject === undefined
      ? {}
      : {
          trustProject: expectBoolean(
            record.trustProject,
            `${label}.trustProject`
          )
        })
  }
}

function parseSkillProfile(
  value: JsonValue,
  label: string
): NonNullable<AgentContextProfile["skills"]> {
  const record = expectRecord(value, label)
  return {
    cwd: expectString(record.cwd, `${label}.cwd`),
    ...(record.projectRoot === undefined
      ? {}
      : { projectRoot: expectString(record.projectRoot, `${label}.projectRoot`) }),
    ...(record.globalSkillDirs === undefined
      ? {}
      : {
          globalSkillDirs: expectStringArray(
            record.globalSkillDirs,
            `${label}.globalSkillDirs`
          )
        }),
    ...(record.projectSkillDirs === undefined
      ? {}
      : {
          projectSkillDirs: expectStringArray(
            record.projectSkillDirs,
            `${label}.projectSkillDirs`
          )
        }),
    ...(record.trustProject === undefined
      ? {}
      : {
          trustProject: expectBoolean(
            record.trustProject,
            `${label}.trustProject`
          )
        }),
    ...(record.registerActivationTool === undefined
      ? {}
      : {
          registerActivationTool: expectBoolean(
            record.registerActivationTool,
            `${label}.registerActivationTool`
          )
        }),
    ...(record.activationTool === undefined
      ? {}
      : {
          activationTool: parseActivationToolProfile(
            record.activationTool,
            `${label}.activationTool`
          )
        })
  }
}

function parseActivationToolProfile(
  value: JsonValue,
  label: string
): NonNullable<NonNullable<AgentContextProfile["skills"]>["activationTool"]> {
  const record = expectRecord(value, label)
  return {
    ...(record.maxIndexedFiles === undefined
      ? {}
      : {
          maxIndexedFiles: expectPositiveInteger(
            record.maxIndexedFiles,
            `${label}.maxIndexedFiles`
          )
        }),
    ...(record.supportingDirectories === undefined
      ? {}
      : {
          supportingDirectories: expectStringArray(
            record.supportingDirectories,
            `${label}.supportingDirectories`
          )
        })
  }
}
