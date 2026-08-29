import { execFile } from "node:child_process"
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { afterEach, describe, expect, it } from "vitest"
import { createStorageTestStore, type StorageTestStore } from "@wanex/storage/testing"
import { GitWorktreeIsolationAdapter } from "../../src/isolation/index.js"
import { LocalRepositoryLocator } from "../../src/index.js"
import { WorkspaceGitRuntime } from "../../src/git/index.js"
import { ProcessWorkspaceSnapshotClient } from "../../src/snapshot/index.js"
import {
  createWorkspaceTestExecution,
  disposeWorkspaceTestExecution
} from "../execution.js"

const execFileAsync = promisify(execFile)
const serviceBin = join(
  import.meta.dirname,
  `../../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)

const tempDirs: string[] = []
const clients: StorageTestStore[] = []

afterEach(async () => {
  await disposeWorkspaceTestExecution()
  while (clients.length > 0) {
    await clients.pop()?.dispose()
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("@wanex/workspace/git", () => {
  it("collects an immutable changeset from text worktree changes", async () => {
    const { repoDir, worktreeParentDir, locator, executionScope } = await createEnvironment()
    const isolation = new GitWorktreeIsolationAdapter({
      repositoryId: "repo_git_runtime",
      locator,
      snapshot: new ProcessWorkspaceSnapshotClient(),
      executionScope
    })
    const lease = await isolation.prepare({
      workspaceId: "workspace_git_runtime",
      jobId: "job_git_runtime",
      isolationId: "wiso_git_runtime"
    })
    await writeFile(join(lease.rootDir, "README.md"), "updated\n", "utf8")
    await writeFile(join(lease.rootDir, "new.txt"), "new\n", "utf8")
    await rm(join(lease.rootDir, "delete.txt"))

    const runtime = new WorkspaceGitRuntime({
      repositoryId: "repo_git_runtime",
      worktreeParent: worktreeParentDir
    })

    const result = await runtime.collectWorktree({
      lease,
      executionScope,
      changeSetId: "cs_git_runtime",
      title: "Git runtime changes"
    })

    expect(result.diff).toEqual([
      { status: "M", path: "README.md" },
      { status: "D", path: "delete.txt" },
      { status: "A", path: "new.txt" }
    ])
    expect(result.status).toBe("changes")
    if (result.status !== "changes") {
      throw new Error("expected worktree changes")
    }
    expect(result.changeSet).toMatchObject({
      id: "cs_git_runtime",
      title: "Git runtime changes",
      baseRevision: lease.baseRevision,
      changes: [
          {
            path: "README.md",
            kind: "update",
            baseText: "base\n",
            targetText: "updated\n"
          },
          {
            path: "delete.txt",
            kind: "delete",
            baseText: "delete me\n"
          },
          {
            path: "new.txt",
            kind: "create",
            targetText: "new\n"
          }
      ]
    })
    await expect(
      readFile(join(repoDir, "README.md"), "utf8")
    ).resolves.toBe("base\n")
  })

  it("returns binary attention before persisting a changeset", async () => {
    const { repoDir, worktreeParentDir, storage, locator, executionScope } = await createEnvironment()
    const isolation = new GitWorktreeIsolationAdapter({
      repositoryId: "repo_git_runtime",
      locator,
      snapshot: new ProcessWorkspaceSnapshotClient(),
      executionScope
    })
    const lease = await isolation.prepare({
      workspaceId: "workspace_git_runtime",
      jobId: "job_git_binary",
      isolationId: "wiso_git_binary"
    })
    await writeFile(join(lease.rootDir, "image.bin"), Buffer.from([0, 1, 2, 3]))

    const runtime = new WorkspaceGitRuntime({
      repositoryId: "repo_git_runtime",
      worktreeParent: worktreeParentDir
    })

    await expect(
      runtime.collectWorktree({
        lease,
        executionScope,
        changeSetId: "cs_git_binary"
      })
    ).resolves.toMatchObject({
      status: "attention",
      attention: [{ code: "binary", path: "image.bin" }]
    })
    await expect(
      storage.getWorkspaceChangeSet({ changeSetId: "cs_git_binary" })
    ).resolves.toBeNull()
  })

  it("returns binary attention for invalid UTF-8 without a NUL byte", async () => {
    const { locator, executionScope, worktreeParentDir } = await createEnvironment()
    const isolation = new GitWorktreeIsolationAdapter({
      repositoryId: "repo_git_runtime",
      locator,
      snapshot: new ProcessWorkspaceSnapshotClient(),
      executionScope
    })
    const lease = await isolation.prepare({
      workspaceId: "workspace_git_runtime",
      jobId: "job_git_invalid_utf8",
      isolationId: "wiso_git_invalid_utf8"
    })
    await writeFile(join(lease.rootDir, "invalid.txt"), Buffer.from([0xc3, 0x28]))

    const runtime = new WorkspaceGitRuntime({
      repositoryId: "repo_git_runtime",
      worktreeParent: worktreeParentDir
    })

    await expect(
      runtime.collectWorktree({
        lease,
        executionScope,
        changeSetId: "cs_git_invalid_utf8"
      })
    ).resolves.toMatchObject({
      status: "attention",
      attention: [
        {
          code: "binary",
          path: "invalid.txt",
          detail: "file is not valid UTF-8 text"
        }
      ]
    })
  })

  it("returns rename attention before persisting a changeset", async () => {
    const { repoDir, worktreeParentDir, storage, locator, executionScope } = await createEnvironment()
    const isolation = new GitWorktreeIsolationAdapter({
      repositoryId: "repo_git_runtime",
      locator,
      snapshot: new ProcessWorkspaceSnapshotClient(),
      executionScope
    })
    const lease = await isolation.prepare({
      workspaceId: "workspace_git_runtime",
      jobId: "job_git_rename",
      isolationId: "wiso_git_rename"
    })
    await git(lease.rootDir, ["mv", "README.md", "RENAMED.md"])

    const runtime = new WorkspaceGitRuntime({
      repositoryId: "repo_git_runtime",
      worktreeParent: worktreeParentDir
    })

    await expect(
      runtime.collectWorktree({
        lease,
        executionScope,
        changeSetId: "cs_git_rename"
      })
    ).resolves.toMatchObject({
      status: "attention",
      attention: [
        {
          code: "rename",
          path: "RENAMED.md",
          previousPath: "README.md"
        }
      ]
    })
    await expect(
      storage.getWorkspaceChangeSet({ changeSetId: "cs_git_rename" })
    ).resolves.toBeNull()
  })

  it("returns file size attention before reading an oversized untracked file", async () => {
    const { locator, executionScope, worktreeParentDir } = await createEnvironment()
    const isolation = new GitWorktreeIsolationAdapter({
      repositoryId: "repo_git_runtime",
      locator,
      snapshot: new ProcessWorkspaceSnapshotClient(),
      executionScope
    })
    const lease = await isolation.prepare({
      workspaceId: "workspace_git_runtime",
      jobId: "job_git_limit",
      isolationId: "wiso_git_limit"
    })
    await writeFile(
      join(lease.rootDir, "large.bin"),
      Buffer.alloc(16 * 1024 * 1024 + 1)
    )

    const runtime = new WorkspaceGitRuntime({
      repositoryId: "repo_git_runtime",
      worktreeParent: worktreeParentDir
    })

    await expect(
      runtime.collectWorktree({
        lease,
        executionScope,
        changeSetId: "cs_git_limit"
      })
    ).resolves.toMatchObject({
      status: "attention",
      attention: [{ code: "limit_exceeded", path: "large.bin" }]
    })
  })

  it.skipIf(process.platform === "win32")(
    "returns mode attention for a mode-only edit",
    async () => {
      const { locator, executionScope, worktreeParentDir } = await createEnvironment()
      const isolation = new GitWorktreeIsolationAdapter({
        repositoryId: "repo_git_runtime",
        locator,
        snapshot: new ProcessWorkspaceSnapshotClient(),
        executionScope
      })
      const lease = await isolation.prepare({
        workspaceId: "workspace_git_runtime",
        jobId: "job_git_mode",
        isolationId: "wiso_git_mode"
      })
      await chmod(join(lease.rootDir, "README.md"), 0o755)

      const runtime = new WorkspaceGitRuntime({
        repositoryId: "repo_git_runtime",
        worktreeParent: worktreeParentDir
      })

      await expect(
        runtime.collectWorktree({
          lease,
          executionScope,
          changeSetId: "cs_git_mode"
        })
      ).resolves.toMatchObject({
        status: "attention",
        attention: [{ code: "mode_only", path: "README.md" }]
      })
    }
  )

  it.skipIf(process.platform === "win32")(
    "returns symlink attention instead of reading through a link",
    async () => {
      const { locator, executionScope, worktreeParentDir } = await createEnvironment()
      const isolation = new GitWorktreeIsolationAdapter({
        repositoryId: "repo_git_runtime",
        locator,
        snapshot: new ProcessWorkspaceSnapshotClient(),
        executionScope
      })
      const lease = await isolation.prepare({
        workspaceId: "workspace_git_runtime",
        jobId: "job_git_link",
        isolationId: "wiso_git_link"
      })
      await symlink("README.md", join(lease.rootDir, "link.md"), "file")

      const runtime = new WorkspaceGitRuntime({
        repositoryId: "repo_git_runtime",
        worktreeParent: worktreeParentDir
      })

      await expect(
        runtime.collectWorktree({
          lease,
          executionScope,
          changeSetId: "cs_git_link"
        })
      ).resolves.toMatchObject({
        status: "attention",
        attention: [{ code: "link_or_reparse", path: "link.md" }]
      })
    }
  )

  it("returns gitlink attention from the staged index mode", async () => {
    const { locator, executionScope, worktreeParentDir } = await createEnvironment()
    const isolation = new GitWorktreeIsolationAdapter({
      repositoryId: "repo_git_runtime",
      locator,
      snapshot: new ProcessWorkspaceSnapshotClient(),
      executionScope
    })
    const lease = await isolation.prepare({
      workspaceId: "workspace_git_runtime",
      jobId: "job_git_gitlink",
      isolationId: "wiso_git_gitlink"
    })
    const dependencyDir = join(lease.rootDir, "dependency")
    await mkdir(dependencyDir)
    await git(dependencyDir, ["init"])
    await git(dependencyDir, ["config", "user.email", "wanex@example.local"])
    await git(dependencyDir, ["config", "user.name", "Wanex Test"])
    await writeFile(join(dependencyDir, "README.md"), "dependency\n")
    await git(dependencyDir, ["add", "README.md"])
    await git(dependencyDir, ["commit", "-m", "dependency"])
    const revision = await git(dependencyDir, ["rev-parse", "HEAD"])
    await git(lease.rootDir, [
      "update-index",
      "--add",
      "--cacheinfo",
      `160000,${revision},dependency`
    ])

    const runtime = new WorkspaceGitRuntime({
      repositoryId: "repo_git_runtime",
      worktreeParent: worktreeParentDir
    })

    await expect(
      runtime.collectWorktree({
        lease,
        executionScope,
        changeSetId: "cs_git_gitlink"
      })
    ).resolves.toMatchObject({
      status: "attention",
      attention: [{ code: "gitlink", path: "dependency" }]
    })
  })

  it("returns identity attention for a forged worktree lease", async () => {
    const { executionScope, worktreeParentDir } = await createEnvironment()
    const runtime = new WorkspaceGitRuntime({
      repositoryId: "repo_git_runtime",
      worktreeParent: worktreeParentDir
    })

    await expect(
      runtime.collectWorktree({
        lease: {
          id: "wiso_forged",
          kind: "git_worktree",
          repositoryId: "repo_git_runtime",
          rootDir: join(worktreeParentDir, "wanex-forged"),
          baseRevision: "HEAD",
          branchName: "wanex/runtime/forged",
          createdAt: Date.now()
        },
        executionScope,
        changeSetId: "cs_git_forged"
      })
    ).resolves.toMatchObject({
      status: "attention",
      attention: [{ code: "identity_drift" }]
    })
  })
})

async function createEnvironment(): Promise<{
  readonly repoDir: string
  readonly worktreeParentDir: string
  readonly storage: StorageTestStore
  readonly locator: LocalRepositoryLocator
  readonly executionScope: import("@wanex/runtime/execution").ExecutionScope
}> {
  const repoDir = await createRepo()
  const worktreeParentDir = await tempDir("wanex-git-runtime-worktrees-")
  const storeDir = await tempDir("wanex-git-runtime-store-")
  const storage = createStorageTestStore({ kind: "local-system-service", mode: "persistent",
    storeDir,
    serviceBin
  })
  clients.push(storage)
  const execution = await createWorkspaceTestExecution({
    rootDir: repoDir,
    additionalRootDirs: [worktreeParentDir],
    managedProcess: true
  })
  const locator = new LocalRepositoryLocator({
    repositories: [{
      repositoryId: "repo_git_runtime",
      repositoryRoot: repoDir,
      worktreeParent: worktreeParentDir,
      serviceBin,
      fileSystem: execution.scope.fileSystem
    }]
  })
  const repository = await locator.locate("repo_git_runtime")
  return {
    repoDir,
    worktreeParentDir: repository.worktreeParent,
    storage,
    locator,
    executionScope: execution.scope
  }
}

async function createRepo(): Promise<string> {
  const repoDir = await tempDir("wanex-git-runtime-repo-")
  await git(repoDir, ["init"])
  await git(repoDir, ["config", "user.email", "wanex@example.local"])
  await git(repoDir, ["config", "user.name", "Wanex Test"])
  await writeFile(join(repoDir, "README.md"), "base\n", "utf8")
  await writeFile(join(repoDir, "delete.txt"), "delete me\n", "utf8")
  await writeFile(join(repoDir, "image.bin"), Buffer.from([0, 1, 2]))
  await git(repoDir, ["add", "README.md", "delete.txt", "image.bin"])
  await git(repoDir, ["commit", "-m", "initial"])
  return repoDir
}

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

async function git(repoDir: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", repoDir, ...args], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  })
  return stdout.trim()
}
