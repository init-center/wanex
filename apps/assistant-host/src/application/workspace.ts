import type { AssistantHost, StartAssistantHostOptions } from "../model.js"
import { resolve } from "node:path"
import { resolveLocalStore } from "@wanex/storage"
import { createWorkspaceStore } from "@wanex/storage/workspace"
import { createWorkspaceController } from "../workspace/controller.js"
import { createIsolatedChangeTools } from "../workspace/isolated-changes/tools.js"
import { createWorkspaceGitCapabilityTools } from "../workspace/git-capability-tools.js"
import { createWorkspaceMutationTools } from "../workspace/mutation-tools.js"
import {
  createAssistantHostHandle,
  startAssistantHostInternal,
  type StartedAssistantHost,
} from "./assistant.js"

/** Trusted application composition for a Host that owns a Workspace. */
export async function startWorkspaceAssistantHost(
  options: StartAssistantHostOptions,
): Promise<AssistantHost> {
  return createAssistantHostHandle(await startWorkspaceAssistantHostInternal(options))
}

export async function startWorkspaceAssistantHostInternal(
  options: StartAssistantHostOptions,
): Promise<StartedAssistantHost> {
  if (options.workspace === undefined) {
    throw new Error("Workspace Assistant Host requires a configured workspace")
  }
  return await startAssistantHostInternal({
    ...options,
    workspace: {
      ...options.workspace,
      ...(options.workspace.worktreeDirectory !== undefined ? {} : defaultIsolationDirectory(options))
    },
  }, {
    create: async ({ runtime, workspace, serviceBin }) =>
      await createWorkspaceController(runtime.storage, workspace, {
        serviceBin,
        workspaceStore: createWorkspaceStore(runtime.transport),
        createCapabilityTools: createWorkspaceGitCapabilityTools,
        createMutationTools: (context) => [
          ...createWorkspaceMutationTools(context),
          ...(context.generation.roots.some(({ root }) =>
            root.effects.some((effect) => effect !== "read")
          )
            ? createIsolatedChangeTools(context)
            : []),
        ],
      }),
  })
}

function defaultIsolationDirectory(options: StartAssistantHostOptions): { worktreeDirectory?: string } {
  if (options.storage.kind === "injected") return {}
  const storeDir = options.storage.kind === "store-dir"
    ? options.storage.storeDir
    : resolveLocalStore(options.storage).storeDir
  return { worktreeDirectory: resolve(storeDir, "workspace-worktrees") }
}
