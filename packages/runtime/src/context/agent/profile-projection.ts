import type { ContextCompiler } from "../memory/index.js"
import type { ToolPermissionPolicy, ToolRegistry } from "../../tools/index.js"
import type {
  AgentContextProfile,
  PrepareAgentContextOptions
} from "./types.js"
import { assertAgentContextProfile } from "./profile-validation.js"

export function agentContextProfileToPrepareOptions(
  profile: AgentContextProfile,
  options: {
    readonly downstream?: ContextCompiler
    readonly tools?: ToolRegistry
    readonly toolPermissionPolicy?: ToolPermissionPolicy
    readonly includeEmptyCompiler?: boolean
  } = {}
): PrepareAgentContextOptions {
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
              : { targets: profile.instructions.targets }),
            ...(profile.instructions.trustProject === true
              ? { trust: { projectInstructions: "trusted" as const } }
              : {})
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
              : { globalSkillDirs: profile.skills.globalSkillDirs }),
            ...(profile.skills.projectSkillDirs === undefined
              ? {}
              : { projectSkillDirs: profile.skills.projectSkillDirs }),
            ...(profile.skills.trustProject === true
              ? { trust: { projectSkills: "trusted" as const } }
              : {}),
            ...(profile.skills.registerActivationTool === true
              ? { registerActivationTool: true }
              : {}),
            ...(profile.skills.activationTool === undefined
              ? {}
              : { activationTool: profile.skills.activationTool })
          }
        }),
    ...(options.downstream === undefined ? {} : { downstream: options.downstream }),
    ...(options.tools === undefined ? {} : { tools: options.tools }),
    ...(options.toolPermissionPolicy === undefined
      ? {}
      : { toolPermissionPolicy: options.toolPermissionPolicy }),
    ...(options.includeEmptyCompiler === undefined
      ? {}
      : { includeEmptyCompiler: options.includeEmptyCompiler })
  }
}
