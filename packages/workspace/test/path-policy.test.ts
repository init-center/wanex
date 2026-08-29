import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { WorkspaceFileReader } from "../src/changesets/index.js"
import {
  createWorkspaceTestExecution,
  disposeWorkspaceTestExecution
} from "./execution.js"

const tempDirs: string[] = []

afterEach(async () => {
  await disposeWorkspaceTestExecution()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) await rm(dir, { recursive: true, force: true })
  }
})

describe("Workspace read path confinement", () => {
  it("reads relative paths inside the canonical root", async () => {
    const root = await tempDir("wanex-workspace-path-root-")
    await writeFile(join(root, "app.ts"), "hello\n", "utf8")
    const execution = await createWorkspaceTestExecution({ rootDir: root })
    await expect(new WorkspaceFileReader(root, execution.scope.fileSystem).readText("app.ts")).resolves.toBe("hello\n")
  })

  it.each([
    "../outside.txt", "src/../../outside.txt", "/tmp/outside.txt",
    "C:\\outside.txt", "\\\\server\\share\\outside.txt",
    "src\\..\\outside.txt", "src//outside.txt", "./outside.txt"
  ])("rejects non-confined read path %s", async (path) => {
    const root = await tempDir("wanex-workspace-path-invalid-")
    const execution = await createWorkspaceTestExecution({ rootDir: root })
    const reader = new WorkspaceFileReader(root, execution.scope.fileSystem)
    await expect(reader.readText(path)).rejects.toThrow("workspace path escapes root")
  })

  it("rejects reads through a symlink outside the root", async () => {
    const root = await tempDir("wanex-workspace-path-link-root-")
    const outside = await tempDir("wanex-workspace-path-link-outside-")
    await writeFile(join(outside, "secret.txt"), "outside\n", "utf8")
    await symlink(outside, join(root, "escape"), "dir")
    const execution = await createWorkspaceTestExecution({ rootDir: root })
    await expect(
      new WorkspaceFileReader(root, execution.scope.fileSystem).readText("escape/secret.txt")
    ).rejects.toThrow("workspace path escapes root")
  })

  it("allows read-only traversal through an in-root symlink", async () => {
    const root = await tempDir("wanex-workspace-path-inner-link-")
    await writeFile(join(root, "target.txt"), "inside\n", "utf8")
    await symlink(join(root, "target.txt"), join(root, "link.txt"), "file")
    const execution = await createWorkspaceTestExecution({ rootDir: root })
    await expect(new WorkspaceFileReader(root, execution.scope.fileSystem).readText("link.txt")).resolves.toBe("inside\n")
  })

  it("rejects NUL and root-only paths", async () => {
    const root = await tempDir("wanex-workspace-path-invalid-root-")
    const execution = await createWorkspaceTestExecution({ rootDir: root })
    const reader = new WorkspaceFileReader(root, execution.scope.fileSystem)
    await expect(reader.readText("bad\0path")).rejects.toThrow("invalid workspace path")
    await expect(reader.readText("")).rejects.toThrow("invalid workspace path")
  })
})

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}
