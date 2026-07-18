import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { afterEach, describe, expect, it } from "vitest"
import {
  FixedWorkspaceIsolationAdapter,
  generatedBranchName,
  GitWorktreeIsolationAdapter,
  safePathSegment
} from "../../src/isolation/index.js"

const execFileAsync = promisify(execFile)
const GIT_TEST_TIMEOUT_MS = 10_000
const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("@wanex/workspace/isolation", () => {
  it("returns a stable fixed workspace lease without owning cleanup", async () => {
    const rootDir = await tempDir("wanex-fixed-root-")
    const adapter = new FixedWorkspaceIsolationAdapter({
      rootDir,
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
      agentId: "agent_a",
      releasePolicy: "keep"
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
    const adapter = new GitWorktreeIsolationAdapter({
      repoDir,
      worktreeParentDir
    })

    const lease = await adapter.prepare({
      workspaceId: "repo",
      jobId: "job_one",
      agentId: "agent_a"
    })

    expect(lease.kind).toBe("git_worktree")
    expect(lease.baseRevision).toBe(baseRevision)
    expect(lease.baseRef).toBe("HEAD")
    expect(lease.id).toMatch(/^wlease_[a-f0-9]{32}$/)
    expect(lease.branchName).toBe(
      `wanex/repo/job_one-${lease.id.replace(/^wlease_/, "").slice(0, 8)}`
    )
    expect(lease.releasePolicy).toBe("remove")
    await expect(readFile(join(lease.rootDir, "README.md"), "utf8")).resolves.toBe(
      "base\n"
    )

    await writeFile(join(lease.rootDir, "README.md"), "agent edit\n", "utf8")
    await expect(readFile(join(repoDir, "README.md"), "utf8")).resolves.toBe(
      "base\n"
    )

    await adapter.release(lease)
    await expect(stat(lease.rootDir)).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("keeps a git worktree when release policy requests it", async () => {
    const repoDir = await createRepo()
    const worktreeParentDir = await tempDir("wanex-worktrees-")
    const adapter = new GitWorktreeIsolationAdapter({
      repoDir,
      worktreeParentDir
    })

    const lease = await adapter.prepare({
      jobId: "job_keep",
      releasePolicy: "keep"
    })

    await adapter.release(lease)
    await expect(readFile(join(lease.rootDir, "README.md"), "utf8")).resolves.toBe(
      "base\n"
    )
    await git(repoDir, ["worktree", "remove", "--force", lease.rootDir])
  })

  it("sanitizes generated branch names and path segments", () => {
    expect(safePathSegment(" Job:One / Agent A ")).toBe("job-one-agent-a")
    expect(
      generatedBranchName("wanex", {
        workspaceId: "Repo One",
        jobId: "Job/One",
        leaseId: "wlease_abcdef1234567890"
      })
    ).toBe("wanex/repo-one/job-one-abcdef12")
  })
})

async function createRepo(): Promise<string> {
  const repoDir = await tempDir("wanex-git-repo-")
  await git(repoDir, ["init"])
  await git(repoDir, ["config", "user.email", "wanex@example.local"])
  await git(repoDir, ["config", "user.name", "Wanex Test"])
  await writeFile(join(repoDir, "README.md"), "base\n", "utf8")
  await git(repoDir, ["add", "README.md"])
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
