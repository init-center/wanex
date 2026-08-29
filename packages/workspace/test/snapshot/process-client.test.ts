import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { ProcessWorkspaceSnapshotClient } from "../../src/snapshot/index.js"
import {
  createWorkspaceTestExecution,
  disposeWorkspaceTestExecution
} from "../execution.js"

const tempDirs: string[] = []

afterEach(async () => {
  await disposeWorkspaceTestExecution()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("ProcessWorkspaceSnapshotClient", () => {
  it("preserves bounded helper stderr in a non-zero exit diagnostic", async () => {
    const root = await tempDir("wanex-snapshot-helper-root-")
    const worktreeParent = await tempDir("wanex-snapshot-helper-parent-")

    await expect(
      new ProcessWorkspaceSnapshotClient().create({
        repositoryRoot: root,
        worktreeParent,
        isolationId: "wiso_snapshot_diagnostic",
        serviceBin: process.execPath,
        executionProcess: (await createWorkspaceTestExecution({
          rootDir: root,
          additionalRootDirs: [worktreeParent]
        })).scope.process
      })
    ).rejects.toMatchObject({
      code: "helper_failed",
      message: expect.stringContaining("stderr=")
    })
  })
})

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}
