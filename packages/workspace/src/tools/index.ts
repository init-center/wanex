import type { ExecutionHost } from "@wanex/runtime/execution"
import type { ToolRegistry } from "@wanex/runtime/tools"
import type { WorkspaceRuntime } from "../runtime.js"
import { WorkspaceApplyChangeSetTool } from "./apply-tool.js"
import { WorkspaceExecTool } from "./exec-tool.js"
import type { WorkspaceProgramPolicy } from "./program-policy.js"
import { WorkspaceReadTextTool } from "./read-tool.js"

export { WorkspaceApplyChangeSetTool } from "./apply-tool.js"
export { WorkspaceExecTool } from "./exec-tool.js"
export {
  ExactWorkspaceProgramPolicy,
  type WorkspaceProgramDecision,
  type WorkspaceProgramPolicy
} from "./program-policy.js"
export { WorkspaceReadTextTool } from "./read-tool.js"

export interface RegisterWorkspaceCodingToolsOptions {
  readonly rootDir: string
  readonly runtime: WorkspaceRuntime
  readonly executionHost: ExecutionHost
  readonly programPolicy: WorkspaceProgramPolicy
}

export function registerWorkspaceCodingTools(
  registry: ToolRegistry,
  options: RegisterWorkspaceCodingToolsOptions
): void {
  registry.register(new WorkspaceReadTextTool({ rootDir: options.rootDir }))
  registry.register(new WorkspaceApplyChangeSetTool({ runtime: options.runtime }))
  registry.register(new WorkspaceExecTool({
    rootDir: options.rootDir,
    executionHost: options.executionHost,
    programPolicy: options.programPolicy
  }))
}
