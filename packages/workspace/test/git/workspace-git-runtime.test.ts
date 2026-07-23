import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { afterEach, describe, expect, it } from "vitest"
import { createStorageTestStore, type StorageTestStore } from "@wanex/storage/testing"
import { GitWorktreeIsolationAdapter } from "../../src/isolation/index.js"
import { WorkspaceGitRuntime } from "../../src/git/index.js"

const execFileAsync = promisify(execFile)
const serviceBin = join(
  import.meta.dirname,
  `../../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)

const tempDirs: string[] = []
const clients: StorageTestStore[] = []

afterEach(async () => {
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
  it("creates a durable changeset and proposal from text worktree changes", async () => {
    const { repoDir, worktreeParentDir, storage } = await createEnvironment()
    const isolation = new GitWorktreeIsolationAdapter({
      repoDir,
      worktreeParentDir,
      releasePolicy: "keep"
    })
    const lease = await isolation.prepare({
      workspaceId: "workspace_git_runtime",
      jobId: "job_git_runtime"
    })
    await writeFile(join(lease.rootDir, "README.md"), "updated\n", "utf8")
    await writeFile(join(lease.rootDir, "new.txt"), "new\n", "utf8")
    await rm(join(lease.rootDir, "delete.txt"))

    const runtime = new WorkspaceGitRuntime({
      storage,
      repoDir,
      workspaceId: "workspace_git_runtime",
      principalId: "agent_git_runtime"
    })

    const result = await runtime.createChangeSetFromWorktree({
      lease,
      id: "cs_git_runtime",
      title: "Git runtime changes",
      createProposal: {
        id: "wcp_git_runtime",
        summary: "Review git runtime output",
        metadata: { source: "git-runtime-test" }
      }
    })

    expect(result.diff).toEqual([
      { status: "M", path: "README.md" },
      { status: "D", path: "delete.txt" },
      { status: "A", path: "new.txt" }
    ])
    expect(result.changeSet).toMatchObject({
      id: "cs_git_runtime",
      workspaceId: "workspace_git_runtime",
      principalId: "agent_git_runtime",
      currentState: "submitted",
      changeSet: {
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
      }
    })
    expect(result.proposal).toMatchObject({
      id: "wcp_git_runtime",
      state: "open",
      changeSetId: "cs_git_runtime",
      metadata: { source: "git-runtime-test" }
    })
    await expect(
      readFile(join(repoDir, "README.md"), "utf8")
    ).resolves.toBe("base\n")
  })

  it("rejects binary worktree changes before persisting a changeset", async () => {
    const { repoDir, worktreeParentDir, storage } = await createEnvironment()
    const isolation = new GitWorktreeIsolationAdapter({
      repoDir,
      worktreeParentDir,
      releasePolicy: "keep"
    })
    const lease = await isolation.prepare({
      workspaceId: "workspace_git_runtime",
      jobId: "job_git_binary"
    })
    await writeFile(join(lease.rootDir, "image.bin"), Buffer.from([0, 1, 2, 3]))

    const runtime = new WorkspaceGitRuntime({
      storage,
      repoDir,
      workspaceId: "workspace_git_runtime",
      principalId: "agent_git_runtime"
    })

    await expect(
      runtime.createChangeSetFromWorktree({
        lease,
        id: "cs_git_binary"
      })
    ).rejects.toThrow(/binary git worktree change is not supported/)
    await expect(
      storage.getWorkspaceChangeSet({ changeSetId: "cs_git_binary" })
    ).resolves.toBeNull()
  })

  it("rejects unsupported rename status before persisting a changeset", async () => {
    const { repoDir, worktreeParentDir, storage } = await createEnvironment()
    const isolation = new GitWorktreeIsolationAdapter({
      repoDir,
      worktreeParentDir,
      releasePolicy: "keep"
    })
    const lease = await isolation.prepare({
      workspaceId: "workspace_git_runtime",
      jobId: "job_git_rename"
    })
    await git(lease.rootDir, ["mv", "README.md", "RENAMED.md"])

    const runtime = new WorkspaceGitRuntime({
      storage,
      repoDir,
      workspaceId: "workspace_git_runtime",
      principalId: "agent_git_runtime"
    })

    await expect(
      runtime.createChangeSetFromWorktree({
        lease,
        id: "cs_git_rename"
      })
    ).rejects.toThrow(/unsupported git diff status: R/)
    await expect(
      storage.getWorkspaceChangeSet({ changeSetId: "cs_git_rename" })
    ).resolves.toBeNull()
  })
})

async function createEnvironment(): Promise<{
  readonly repoDir: string
  readonly worktreeParentDir: string
  readonly storage: StorageTestStore
}> {
  const repoDir = await createRepo()
  const worktreeParentDir = await tempDir("wanex-git-runtime-worktrees-")
  const storeDir = await tempDir("wanex-git-runtime-store-")
  const storage = createStorageTestStore({ kind: "local-system-service", mode: "persistent",
    storeDir,
    serviceBin
  })
  clients.push(storage)
  return { repoDir, worktreeParentDir, storage }
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
