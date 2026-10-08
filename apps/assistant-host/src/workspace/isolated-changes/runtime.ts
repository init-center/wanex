import { randomUUID } from "node:crypto"
import { LocalRepositoryLocator } from "@wanex/workspace/locator"
import { probeWorkspaceGitCapability, WorkspaceGitRuntime } from "@wanex/workspace/git"
import { FixedWorkspaceIsolationAdapter, GitWorktreeIsolationAdapter } from "@wanex/workspace/isolation"
import { ProcessWorkspaceSnapshotClient } from "@wanex/workspace/snapshot"
import { WorkspaceTaskRuntime } from "@wanex/workspace/tasks"
import type { RootIdentity, WorkspaceToolFactoryOptions } from "../model.js"
import { digest } from "../store.js"
import { prepareIsolationDirectory } from "./directory.js"

export async function openIsolatedTask(options: WorkspaceToolFactoryOptions, root: RootIdentity, principalId: string) {
  await options.assertAuthority()
  const worktreeParent = await prepareIsolationDirectory(options.generation)
  const scope = await options.environment.bind({
    scopeId: `workspace_isolation_${randomUUID()}`,
    policy: {
      revision: 1,
      filesystem: {
        roots: [{ id: "repository", effects: ["read"] }, { id: "isolation", effects: ["read", "write", "create", "remove"] }],
        maxReadBytes: 50 * 1024 * 1024, maxDirectoryEntries: 100_000
      },
      process: { oneShot: true, managed: true, cleanup: options.environment.capabilities.process.cleanup, environmentVariables: [] },
      isolation: "none", network: "unrestricted", pty: false
    },
    fileSystemRoots: [{ id: "repository", path: root.path }, { id: "isolation", path: worktreeParent }]
  })
  try {
    const capability = await probeWorkspaceGitCapability({ rootDir: root.path, fileSystem: scope.fileSystem, executionProcess: scope.process })
    if (capability.status !== "available") throw new Error(`workspace Git capability unavailable: ${capability.status}`)
    await options.assertAuthority()
    const rootIdentity = { hostId: options.generation.hostId, generationKey: options.generationKey, rootId: root.id, device: root.device, inode: root.inode }
    const repositoryId = `repo_${digest(rootIdentity)}`
    const locator = new LocalRepositoryLocator({ repositories: [{ repositoryId, repositoryRoot: root.path, worktreeParent, serviceBin: options.serviceBin, fileSystem: scope.fileSystem }] })
    const storage = Object.assign({}, options.coreStore, options.workspaceStore)
    const workspaceId = `${options.generationKey}:${root.id}`
    const tasks = new WorkspaceTaskRuntime({
      storage, rootIdentity, workspaceId, principalId, ownerId: principalId,
      executionEnvironment: options.environment,
      directIsolation: new FixedWorkspaceIsolationAdapter({ rootDir: root.path, fileSystem: scope.fileSystem }),
      gitWorktree: {
        repositoryId,
        isolation: new GitWorktreeIsolationAdapter({ rootIdentity, repositoryId, locator, snapshot: new ProcessWorkspaceSnapshotClient(), executionScope: scope }),
        collection: new WorkspaceGitRuntime({ repositoryId, worktreeParent, executionScope: scope })
      }
    })
    return { tasks, workspaceId, close: () => scope.close() }
  } catch (error) {
    await scope.close()
    throw error
  }
}
