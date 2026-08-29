import type {
  ExecutionFileSystem,
  ExecutionProcess
} from "@wanex/runtime/execution"
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
  readonly scopeId: string
  readonly rootDir: string
  readonly fileSystem: ExecutionFileSystem
  readonly runtime: WorkspaceRuntime
  readonly executionProcess: ExecutionProcess
  readonly programPolicy: WorkspaceProgramPolicy
}

export function registerWorkspaceCodingTools(
  registry: ToolRegistry,
  options: RegisterWorkspaceCodingToolsOptions
): void {
  registry.register(new WorkspaceReadTextTool({
    scopeId: options.scopeId,
    rootDir: options.rootDir,
    fileSystem: options.fileSystem
  }))
  registry.register(new WorkspaceApplyChangeSetTool({
    scopeId: options.scopeId,
    runtime: options.runtime
  }))
  registry.register(new WorkspaceExecTool({
    scopeId: options.scopeId,
    rootDir: options.rootDir,
    fileSystem: options.fileSystem,
    executionProcess: options.executionProcess,
    programPolicy: options.programPolicy
  }))
}
