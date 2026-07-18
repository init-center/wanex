import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { LocalWorkspace } from "../src/changesets/index.js"

const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("Workspace path confinement", () => {
  it("reads and mutates relative paths inside the canonical root", async () => {
    const root = await tempDir("wanex-workspace-path-root-")
    const workspace = new LocalWorkspace(root)

    await workspace.writeText("src/app.ts", "hello\n")
    expect(await workspace.readText("src/app.ts")).toBe("hello\n")
    await workspace.delete("src/app.ts")
    expect(await workspace.readText("src/app.ts")).toBeNull()
  })

  it.each([
    "../outside.txt",
    "src/../../outside.txt",
    "/tmp/outside.txt",
    "C:\\outside.txt",
    "\\\\server\\share\\outside.txt",
    "src\\..\\outside.txt",
    "src//outside.txt",
    "./outside.txt"
  ])("rejects non-confined path %s", async (path) => {
    const root = await tempDir("wanex-workspace-path-invalid-")
    const workspace = new LocalWorkspace(root)

    await expect(workspace.writeText(path, "blocked")).rejects.toThrow(
      "workspace path escapes root"
    )
  })

  it("rejects reads and writes through a symlink outside the root", async () => {
    const root = await tempDir("wanex-workspace-path-link-root-")
    const outside = await tempDir("wanex-workspace-path-link-outside-")
    await writeFile(join(outside, "secret.txt"), "outside\n", "utf8")
    await symlink(outside, join(root, "escape"), "dir")
    const workspace = new LocalWorkspace(root)

    await expect(workspace.readText("escape/secret.txt")).rejects.toThrow(
      "workspace path escapes root"
    )
    await expect(workspace.writeText("escape/new.txt", "blocked")).rejects.toThrow(
      "workspace path escapes root"
    )
    await expect(readFile(join(outside, "new.txt"), "utf8")).rejects.toMatchObject({
      code: "ENOENT"
    })
  })

  it("allows read-only traversal through an in-root symlink but rejects mutating it", async () => {
    const root = await tempDir("wanex-workspace-path-inner-link-")
    await writeFile(join(root, "target.txt"), "inside\n", "utf8")
    await symlink(join(root, "target.txt"), join(root, "link.txt"), "file")
    const workspace = new LocalWorkspace(root)

    expect(await workspace.readText("link.txt")).toBe("inside\n")
    await expect(workspace.writeText("link.txt", "blocked\n")).rejects.toThrow(
      "workspace path escapes root"
    )
    await expect(workspace.delete("link.txt")).rejects.toThrow(
      "workspace path escapes root"
    )
    expect(await readFile(join(root, "target.txt"), "utf8")).toBe("inside\n")
  })

  it("rejects NUL and root-only paths", async () => {
    const root = await tempDir("wanex-workspace-path-invalid-root-")
    const workspace = new LocalWorkspace(root)

    await expect(workspace.readText("bad\0path")).rejects.toThrow(
      "invalid workspace path"
    )
    await expect(workspace.readText("")).rejects.toThrow("invalid workspace path")
  })
})

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}
