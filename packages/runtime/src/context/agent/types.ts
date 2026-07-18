import type { ContextCompiler } from "../memory/index.js"
import type {
  InstructionDiscoveryOptions,
  InstructionSnapshot
} from "../instruction/index.js"
import type { SkillDiscoveryOptions, SkillSnapshot } from "../skill/index.js"
import type { ToolPermissionPolicy, ToolRegistry } from "../../tools/index.js"

export interface PrepareAgentContextOptions {
  readonly instructions?: InstructionDiscoveryOptions
  readonly skills?: SkillAgentContextOptions
  readonly downstream?: ContextCompiler
  readonly tools?: ToolRegistry
  readonly toolPermissionPolicy?: ToolPermissionPolicy
  readonly includeEmptyCompiler?: boolean
}

export interface SkillAgentContextOptions extends SkillDiscoveryOptions {
  readonly registerActivationTool?: boolean
  readonly activationTool?: {
    readonly maxIndexedFiles?: number
    readonly supportingDirectories?: readonly string[]
  }
}

export interface PreparedAgentContext {
  readonly contextCompiler?: ContextCompiler
  readonly instructionSnapshot?: InstructionSnapshot
  readonly skillSnapshot?: SkillSnapshot
  readonly tools?: ToolRegistry
  readonly toolPermissionPolicy?: ToolPermissionPolicy
}

export interface AgentContextProfile {
  readonly instructions?: AgentInstructionContextProfile
  readonly skills?: AgentSkillContextProfile
}

export interface AgentInstructionContextProfile {
  readonly cwd: string
  readonly projectRoot?: string
  readonly globalConfigDir?: string
  readonly targets?: readonly string[]
  readonly trustProject?: boolean
}

export interface AgentSkillContextProfile {
  readonly cwd: string
  readonly projectRoot?: string
  readonly globalSkillDirs?: readonly string[]
  readonly projectSkillDirs?: readonly string[]
  readonly trustProject?: boolean
  readonly registerActivationTool?: boolean
  readonly activationTool?: {
    readonly maxIndexedFiles?: number
    readonly supportingDirectories?: readonly string[]
  }
}
