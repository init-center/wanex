import type {
  ExecutionFileSystem,
  ExecutionProcess,
  ExecutionResult
} from "@wanex/runtime/execution"
import { describe, expect, it } from "vitest"
import {
  probeWorkspaceGitCapability,
  resolveWorkspaceStrategy,
  type WorkspaceGitCapability
} from "../../src/git/index.js"

function result(input: Partial<ExecutionResult> = {}): ExecutionResult {
  return {
    program: "git",
    args: [],
    cwd: "/workspace/project",
    exitCode: 0,
    signal: null,
    termination: "exited",
    cleanup: "not_required",
    durationMs: 1,
    stdout: {
      bytes: new Uint8Array(),
      text: "",
      observedBytes: 0,
      retainedBytes: 0,
      truncated: false
    },
    stderr: {
      bytes: new Uint8Array(),
      text: "",
      observedBytes: 0,
      retainedBytes: 0,
      truncated: false
    },
    ...input
  }
}

function processFor(
  steps: readonly (ExecutionResult | Error)[]
): ExecutionProcess & {
  readonly requests: readonly { program: string; args: readonly string[] }[]
} {
  const requests: { program: string; args: readonly string[] }[] = []
  let index = 0
  return {
    requests,
    async execute(request) {
      requests.push({ program: request.program, args: request.args ?? [] })
      const step = steps[index++]
      if (step === undefined) throw new Error("unexpected probe process call")
      if (step instanceof Error) throw step
      return step
    },
    async start() {
      throw new Error("start is not part of the capability probe")
    }
  }
}

const repositoryOutput = "/workspace/project\ntrue\nfalse\n"
const fileSystem = {
  async canonicalize(path: string) { return path },
  async metadata() {
    return { kind: "directory", size: 0, modifiedAt: 0, device: "1", inode: "2" } as const
  },
  async read() { throw new Error("read is not part of the capability probe") },
  async readRange() { throw new Error("readRange is not part of the capability probe") },
  async list() { throw new Error("list is not part of the capability probe") },
  async createDirectory() { throw new Error("createDirectory is not part of the capability probe") },
  async remove() { throw new Error("remove is not part of the capability probe") }
} satisfies ExecutionFileSystem

describe("workspace Git capability", () => {
  it("probes Git and repository metadata without mutating the root", async () => {
    const process = processFor([
      result({ stdout: { ...result().stdout, text: "git version 2.49.0\n" } }),
      result({ stdout: { ...result().stdout, text: repositoryOutput } })
    ])

    const capability = await probeWorkspaceGitCapability({
      rootDir: "/workspace/project",
      fileSystem,
      executionProcess: process
    })

    expect(capability).toEqual({
      status: "available",
      rootDir: "/workspace/project",
      gitBin: "git",
      repositoryRoot: "/workspace/project"
    })
    expect(process.requests).toEqual([
      { program: "git", args: ["--version"] },
      {
        program: "git",
        args: [
          "-C",
          "/workspace/project",
          "rev-parse",
          "--show-toplevel",
          "--is-inside-work-tree",
          "--is-bare-repository"
        ]
      }
    ])
  })

  it("reports missing Git without attempting repository mutation", async () => {
    const process = processFor([new Error("ENOENT")])
    await expect(
      probeWorkspaceGitCapability({
        rootDir: "/workspace/project",
        fileSystem,
        executionProcess: process,
        gitBin: "/missing/git"
      })
    ).resolves.toMatchObject({ status: "git_unavailable", gitBin: "/missing/git" })
    expect(process.requests).toHaveLength(1)
  })

  it("distinguishes a non-repository from an unavailable executable", async () => {
    const process = processFor([
      result({ stdout: { ...result().stdout, text: "git version 2.49.0\n" } }),
      result({ exitCode: 128, stderr: { ...result().stderr, text: "not a repository" } })
    ])
    await expect(
      probeWorkspaceGitCapability({
        rootDir: "/workspace/project",
        fileSystem,
        executionProcess: process
      })
    ).resolves.toMatchObject({ status: "not_repository" })
  })

  it("does not treat a repository subdirectory as a repository root", async () => {
    const process = processFor([
      result({ stdout: { ...result().stdout, text: "git version 2.49.0\n" } }),
      result({ stdout: { ...result().stdout, text: "/workspace/project\ntrue\nfalse\n" } })
    ])
    const capability = await probeWorkspaceGitCapability({
      rootDir: "/workspace/project/packages/app",
      fileSystem,
      executionProcess: process
    })
    expect(capability).toMatchObject({ status: "root_not_repository_root" })
    expect(capability).not.toHaveProperty("repositoryRoot")
  })

  it("keeps direct editing independent of Git and requires an explicit probe for worktree", () => {
    expect(resolveWorkspaceStrategy()).toEqual({
      status: "accepted",
      strategy: "direct"
    })
    expect(resolveWorkspaceStrategy({ requested: "direct" })).toEqual({
      status: "accepted",
      strategy: "direct"
    })
    expect(resolveWorkspaceStrategy({ requested: "git_worktree" })).toMatchObject({
      status: "rejected",
      strategy: "git_worktree",
      code: "git_capability_required"
    })
  })

  it("rejects explicit worktree selection when the capability is unavailable", () => {
    const capability: WorkspaceGitCapability = {
      status: "not_repository",
      rootDir: "/workspace/project",
      gitBin: "git",
      reason: "Workspace root is not a Git worktree"
    }
    expect(
      resolveWorkspaceStrategy({ requested: "git_worktree", gitCapability: capability })
    ).toEqual({
      status: "rejected",
      strategy: "git_worktree",
      code: "not_repository",
      reason: "Workspace root is not a Git worktree"
    })
  })

  it("accepts worktree selection only after a successful capability probe", () => {
    expect(
      resolveWorkspaceStrategy({
        requested: "git_worktree",
        gitCapability: {
          status: "available",
          rootDir: "/workspace/project",
          gitBin: "git",
          repositoryRoot: "/workspace/project"
        }
      })
    ).toEqual({ status: "accepted", strategy: "git_worktree" })
  })
})
