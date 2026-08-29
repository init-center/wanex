import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { afterEach, describe, expect, it } from "vitest"
import {
  FixedWorkspaceIsolationAdapter,
  GitWorktreeIsolationAdapter
} from "../../src/isolation/index.js"
import { LocalRepositoryLocator } from "../../src/index.js"
import { ProcessWorkspaceSnapshotClient } from "../../src/snapshot/index.js"
import {
  createWorkspaceTestExecution,
  disposeWorkspaceTestExecution
} from "../execution.js"

const execFileAsync = promisify(execFile)
const GIT_TEST_TIMEOUT_MS = 10_000
const serviceBin = join(
  import.meta.dirname,
  `../../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)
const tempDirs: string[] = []

afterEach(async () => {
  await disposeWorkspaceTestExecution()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("@wanex/workspace/isolation", () => {
  it("resolves only registered opaque repositories and rejects unsafe parents", async () => {
    const repoDir = await createRepo()
    const worktreeParentDir = await tempDir("wanex-worktrees-")
    const { locator, executionScope } = await createLocator(repoDir, worktreeParentDir)

    await expect(locator.locate("unknown_repository")).rejects.toThrow(
      "not registered"
    )
    await expect(locator.locate("../repository")).rejects.toThrow(
      "opaque identifier"
    )
    await expect(
      new LocalRepositoryLocator({
        repositories: [{
          repositoryId: "nested_repository",
          repositoryRoot: repoDir,
          worktreeParent: join(repoDir, ".wanex-worktrees"),
          serviceBin,
          fileSystem: executionScope.fileSystem
        }]
      }).locate("nested_repository")
    ).rejects.toThrow("outside the repository")
  })

  it("returns a stable fixed workspace lease without owning cleanup", async () => {
    const rootDir = await tempDir("wanex-fixed-root-")
    const execution = await createWorkspaceTestExecution({ rootDir })
    const adapter = new FixedWorkspaceIsolationAdapter({
      rootDir,
      fileSystem: execution.scope.fileSystem,
      workspaceId: "main"
    })

    const lease = await adapter.prepare({
      jobId: "job_fixed",
      agentId: "agent_a"
    })

    expect(lease.id).toMatch(/^wlease_[a-f0-9]{32}$/)
    expect(lease).toMatchObject({
      kind: "fixed",
      rootDir,
      workspaceId: "main",
      jobId: "job_fixed",
      agentId: "agent_a"
    })
    await writeFile(join(rootDir, "file.txt"), "owned by caller\n", "utf8")
    await adapter.release(lease)
    await expect(readFile(join(rootDir, "file.txt"), "utf8")).resolves.toBe(
      "owned by caller\n"
    )
  })

  it("creates an isolated git worktree and removes it on release", async () => {
    const repoDir = await createRepo()
    const worktreeParentDir = await tempDir("wanex-worktrees-")
    const baseRevision = await git(repoDir, ["rev-parse", "HEAD"])
    const { locator, executionScope } = await createLocator(repoDir, worktreeParentDir)
    const adapter = new GitWorktreeIsolationAdapter({
      repositoryId: "repo_isolation_test",
      locator,
      snapshot: new ProcessWorkspaceSnapshotClient(),
      executionScope
    })

    const lease = await adapter.prepare({
      isolationId: "wiso_isolation_test",
      workspaceId: "repo",
      jobId: "job_one",
      agentId: "agent_a"
    })

    expect(lease.kind).toBe("git_worktree")
    expect(lease.baseRevision).not.toBe(baseRevision)
    expect(lease.baseRevision).toMatch(/^[a-f0-9]{40}$/)
    expect(lease.id).toBe("wiso_isolation_test")
    expect(lease.branchName).toMatch(/^wanex\/runtime\/[a-f0-9]{32}$/)
    await expect(readFile(join(lease.rootDir, "README.md"), "utf8")).resolves.toBe(
      "base\n"
    )

    await writeFile(join(lease.rootDir, "README.md"), "agent edit\n", "utf8")
    await expect(readFile(join(repoDir, "README.md"), "utf8")).resolves.toBe(
      "base\n"
    )

    await adapter.release(lease)
    await expect(stat(lease.rootDir)).rejects.toMatchObject({ code: "ENOENT" })
    await expect(git(repoDir, ["branch", "--list", lease.branchName!])).resolves.toBe("")
  })

  it("captures dirty checkout state through a temporary index without changing the checkout", async () => {
    const repoDir = await createRepo()
    const worktreeParentDir = await tempDir("wanex-worktrees-")
    const { locator, executionScope } = await createLocator(repoDir, worktreeParentDir)
    const adapter = new GitWorktreeIsolationAdapter({
      repositoryId: "repo_isolation_test",
      locator,
      snapshot: new ProcessWorkspaceSnapshotClient(),
      executionScope
    })
    const head = await git(repoDir, ["rev-parse", "HEAD"])
    const branch = await git(repoDir, ["symbolic-ref", "--short", "HEAD"])
    const stashBefore = await git(repoDir, ["stash", "list"])
    const configBefore = await git(repoDir, ["config", "--local", "--list"])

    await writeFile(join(repoDir, "README.md"), "staged\n", "utf8")
    await git(repoDir, ["add", "README.md"])
    const indexBefore = await git(repoDir, ["rev-parse", ":README.md"])
    await writeFile(join(repoDir, "README.md"), "unstaged\n", "utf8")
    await rm(join(repoDir, "delete.txt"))
    await writeFile(join(repoDir, "untracked.txt"), "untracked\n", "utf8")
    await writeFile(join(repoDir, "ignored.log"), "ignored\n", "utf8")

    const lease = await adapter.prepare({ isolationId: "wiso_dirty_snapshot" })
    expect(await git(repoDir, ["show", `${lease.baseRevision}:README.md`])).toBe("unstaged")
    await expect(git(repoDir, ["show", `${lease.baseRevision}:delete.txt`])).rejects.toThrow()
    expect(await git(repoDir, ["show", `${lease.baseRevision}:untracked.txt`])).toBe("untracked")
    await expect(git(repoDir, ["show", `${lease.baseRevision}:ignored.log`])).rejects.toThrow()

    expect(await git(repoDir, ["rev-parse", "HEAD"])).toBe(head)
    expect(await git(repoDir, ["symbolic-ref", "--short", "HEAD"])).toBe(branch)
    expect(await git(repoDir, ["rev-parse", ":README.md"])).toBe(indexBefore)
    expect(await git(repoDir, ["status", "--porcelain=v1"])).toBe(
      "MM README.md\n D delete.txt\n?? untracked.txt"
    )
    expect(await git(repoDir, ["stash", "list"])).toBe(stashBefore)
    expect(await git(repoDir, ["config", "--local", "--list"])).toBe(configBefore)

    await adapter.release(lease)
    await expect(stat(lease.rootDir)).rejects.toMatchObject({ code: "ENOENT" })
    await expect(git(repoDir, ["show-ref", "--verify", "--quiet", `refs/heads/${lease.branchName}`])).rejects.toThrow()
  })

  it("locates and releases the same runtime resource after a host restart", async () => {
    const repoDir = await createRepo()
    const worktreeParentDir = await tempDir("wanex-worktrees-")
    const first = await createLocator(repoDir, worktreeParentDir)
    const lease = await new GitWorktreeIsolationAdapter({
      repositoryId: "repo_isolation_test",
      locator: first.locator,
      snapshot: new ProcessWorkspaceSnapshotClient(),
      executionScope: first.executionScope
    }).prepare({ isolationId: "wiso_restart" })
    const second = await createLocator(repoDir, worktreeParentDir)
    const restarted = new GitWorktreeIsolationAdapter({
      repositoryId: "repo_isolation_test",
      locator: second.locator,
      snapshot: new ProcessWorkspaceSnapshotClient(),
      executionScope: second.executionScope
    })
    await restarted.release(lease)
    await expect(stat(lease.rootDir)).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("makes runtime-owned git worktree release idempotent", async () => {
    const repoDir = await createRepo()
    const worktreeParentDir = await tempDir("wanex-worktrees-")
    const environment = await createLocator(repoDir, worktreeParentDir)
    const adapter = new GitWorktreeIsolationAdapter({
      repositoryId: "repo_isolation_test",
      locator: environment.locator,
      snapshot: new ProcessWorkspaceSnapshotClient(),
      executionScope: environment.executionScope
    })

    const lease = await adapter.prepare({
      isolationId: "wiso_release_twice",
      jobId: "job_release_twice"
    })

    await adapter.release(lease)
    await adapter.release(lease)
    await expect(stat(lease.rootDir)).rejects.toMatchObject({ code: "ENOENT" })
    await expect(git(repoDir, ["branch", "--list", lease.branchName!])).resolves.toBe("")
  })

  it("rejects a forged worktree lease without deleting the owned branch", async () => {
    const repoDir = await createRepo()
    const worktreeParentDir = await tempDir("wanex-worktrees-")
    const environment = await createLocator(repoDir, worktreeParentDir)
    const adapter = new GitWorktreeIsolationAdapter({
      repositoryId: "repo_isolation_test",
      locator: environment.locator,
      snapshot: new ProcessWorkspaceSnapshotClient(),
      executionScope: environment.executionScope
    })
    const lease = await adapter.prepare({
      isolationId: "wiso_forged_release",
      jobId: "job_forged_release"
    })

    await expect(
      adapter.release({ ...lease, rootDir: join(worktreeParentDir, "forged") })
    ).rejects.toThrow("lease is not owned by this runtime")
    await expect(readFile(join(lease.rootDir, "README.md"), "utf8")).resolves.toBe(
      "base\n"
    )
    await expect(git(repoDir, ["branch", "--list", lease.branchName!]))
      .resolves.toContain(lease.branchName)

    await adapter.release(lease)
  })

})

async function createRepo(): Promise<string> {
  const repoDir = await tempDir("wanex-git-repo-")
  await git(repoDir, ["init"])
  await git(repoDir, ["config", "user.email", "wanex@example.local"])
  await git(repoDir, ["config", "user.name", "Wanex Test"])
  await git(repoDir, ["config", "core.autocrlf", "false"])
  await git(repoDir, ["config", "core.eol", "lf"])
  await writeFile(join(repoDir, "README.md"), "base\n", "utf8")
  await writeFile(join(repoDir, "delete.txt"), "delete me\n", "utf8")
  await writeFile(join(repoDir, ".gitignore"), "ignored.log\n", "utf8")
  await git(repoDir, ["add", "README.md", "delete.txt", ".gitignore"])
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
    maxBuffer: 10 * 1024 * 1024,
    timeout: GIT_TEST_TIMEOUT_MS
  })
  return stdout.trim()
}

async function createLocator(repoDir: string, worktreeParentDir: string): Promise<{
  readonly locator: LocalRepositoryLocator
  readonly executionScope: import("@wanex/runtime/execution").ExecutionScope
}> {
  const execution = await createWorkspaceTestExecution({
    rootDir: repoDir,
    additionalRootDirs: [worktreeParentDir],
    managedProcess: true
  })
  return {
    locator: new LocalRepositoryLocator({
      repositories: [{
        repositoryId: "repo_isolation_test",
        repositoryRoot: repoDir,
        worktreeParent: worktreeParentDir,
        serviceBin,
        fileSystem: execution.scope.fileSystem
      }]
    }),
    executionScope: execution.scope
  }
}
