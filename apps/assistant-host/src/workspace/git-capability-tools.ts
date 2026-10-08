import type { JsonValue } from "@wanex/protocol"
import {
  probeWorkspaceGitCapability,
  resolveWorkspaceStrategy
} from "@wanex/workspace/git"
import {
  createToolRuntimeBinding,
  jsonToolResultContent,
  type ToolDefinition
} from "@wanex/runtime/tools"
import { readOnlyPolicy, type WorkspaceControllerDependencies } from "./model.js"
import { requiredWorkspaceString, workspaceInput } from "./input.js"

export const WORKSPACE_GIT_CAPABILITY_IMPLEMENTATION =
  "wanex.assistant.workspace.git-capability"

export const createWorkspaceGitCapabilityTools: NonNullable<
  WorkspaceControllerDependencies["createCapabilityTools"]
> = (options) => [{
  name: "workspace_git_capability",
  description: "Inspect whether an authorized workspace root can use the optional Git worktree strategy. This is read-only and never initializes a repository or creates a worktree.",
  inputSchema: {
    type: "object",
    properties: { rootId: { type: "string", minLength: 1, maxLength: 128 } },
    required: ["rootId"],
    additionalProperties: false
  },
  runtimeBinding: createToolRuntimeBinding({
    implementationId: WORKSPACE_GIT_CAPABILITY_IMPLEMENTATION,
    implementationRevision: "1",
    configuration: { generationKey: options.generationKey }
  }),
  risk: "read_only",
  idempotent: true,
  concurrency: "parallel_safe",
  resultMode: "immediate",
  async invoke(invocation) {
    if (invocation.signal?.aborted) throw new Error("workspace operation cancelled")
    await options.assertAuthority()
    const input = workspaceInput(invocation.input)
    const rootId = requiredWorkspaceString(input, "rootId")
    const entry = options.generation.roots.find(({ root }) => root.id === rootId)
    if (entry === undefined) throw new Error("workspace root is not authorized")
    const basePolicy = readOnlyPolicy([entry.root])
    const scope = await options.environment.bind({
      scopeId: `workspace_git_capability_${options.generationKey}`,
      policy: {
        ...basePolicy,
        process: {
          oneShot: true,
          managed: false,
          cleanup: "runtime_process_tree",
          environmentVariables: []
        }
      },
      fileSystemRoots: [entry.root]
    })
    try {
      const capability = await probeWorkspaceGitCapability({
        rootDir: entry.root.path,
        fileSystem: scope.fileSystem,
        executionProcess: scope.process
      })
      await options.assertAuthority()
      const projection = {
        capability,
        strategies: {
          direct: resolveWorkspaceStrategy({ requested: "direct" }),
          gitWorktree: resolveWorkspaceStrategy({
            requested: "git_worktree",
            gitCapability: capability
          })
        }
      }
      return {
        outcome: "succeeded",
        toolCallId: invocation.toolCallId,
        content: jsonToolResultContent(
          JSON.parse(JSON.stringify(projection)) as JsonValue
        )
      }
    } finally {
      await scope.close()
    }
  }
}]
