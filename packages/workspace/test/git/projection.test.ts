import { describe, expect, it } from "vitest"
import { parseDiffNameStatus } from "../../src/git/diff.js"
import { GitProjectionError } from "../../src/git/projection.js"
import { validateLease } from "../../src/git/lease.js"

describe("@wanex/workspace/git projection boundaries", () => {
  it("classifies an invalid diff path as structured attention", () => {
    try {
      parseDiffNameStatus("M\0../escape.txt\0")
      throw new Error("expected invalid path attention")
    } catch (error) {
      expect(error).toBeInstanceOf(GitProjectionError)
      expect((error as GitProjectionError).attention).toMatchObject({
        code: "path_invalid",
        path: "../escape.txt"
      })
    }
  })

  it("rejects a lease whose root is inside the parent but not deterministic", () => {
    expect(
      validateLease(
        {
          id: "wiso_identity",
          kind: "git_worktree",
          repositoryId: "repo",
          rootDir: "/tmp/worktrees/wanex-other",
          baseRevision: "HEAD",
          branchName: "wanex/runtime/other",
          createdAt: Date.now()
        },
        "repo",
        "/tmp/worktrees"
      )
    ).toMatchObject({ code: "identity_drift" })
  })
  it("preserves copy identity for a structured attention decision", () => {
    expect(parseDiffNameStatus("C100\0source.txt\0copy.txt\0")).toEqual([
      {
        status: "C",
        path: "copy.txt",
        previousPath: "source.txt"
      }
    ])
  })
})
