import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  ChangeSetApplier,
  LocalWorkspace,
  sha256Text,
  type ChangeSet
} from "../../src/changesets/index.js"

const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("@wanex/workspace/changesets", () => {
  it("applies, undoes, and reapplies a clean update", async () => {
    const { root, applier } = await workspace()
    await mkdir(join(root, "src"), { recursive: true })
    await writeFile(join(root, "src/app.ts"), "one\ntwo\n", "utf8")
    const changeSet: ChangeSet = {
      id: "cs_update",
      changes: [
        {
          path: "src/app.ts",
          kind: "update",
          baseText: "one\ntwo\n",
          targetText: "one\nTWO\n"
        }
      ]
    }

    const applied = await applier.apply(changeSet)
    expect(applied.status).toBe("applied")
    expect(await read(root, "src/app.ts")).toBe("one\nTWO\n")

    const undone = await applier.undo(applied)
    expect(undone.status).toBe("applied")
    expect(await read(root, "src/app.ts")).toBe("one\ntwo\n")

    const reapplied = await applier.apply(changeSet)
    expect(reapplied.status).toBe("applied")
    expect(await read(root, "src/app.ts")).toBe("one\nTWO\n")
  })

  it("treats applying the same target as idempotent", async () => {
    const { root, applier } = await workspace()
    await writeFile(join(root, "file.txt"), "after\n", "utf8")
    const result = await applier.apply({
      id: "cs_already",
      changes: [
        {
          path: "file.txt",
          kind: "update",
          baseText: "before\n",
          targetText: "after\n"
        }
      ]
    })

    expect(result.status).toBe("already_applied")
    expect(await read(root, "file.txt")).toBe("after\n")
  })

  it("merges stale-base non-overlapping line edits", async () => {
    const { root, applier } = await workspace()
    const base = "a\nb\nc\n"
    await writeFile(join(root, "file.txt"), "A\nb\nc\n", "utf8")

    const result = await applier.apply({
      id: "cs_merge",
      changes: [
        {
          path: "file.txt",
          kind: "update",
          baseText: base,
          targetText: "a\nb\nC\n"
        }
      ]
    })

    expect(result.status).toBe("applied")
    expect(result.files[0]?.merged).toBe(true)
    expect(await read(root, "file.txt")).toBe("A\nb\nC\n")
  })

  it("returns a conflict and leaves the file unchanged for overlapping edits", async () => {
    const { root, applier } = await workspace()
    await writeFile(join(root, "file.txt"), "A\nb\n", "utf8")

    const result = await applier.apply({
      id: "cs_conflict",
      changes: [
        {
          path: "file.txt",
          kind: "update",
          baseText: "a\nb\n",
          targetText: "AA\nb\n"
        }
      ]
    })

    expect(result.status).toBe("conflicted")
    expect(result.conflicts).toEqual([
      expect.objectContaining({
        path: "file.txt",
        reason: "merge_conflict"
      })
    ])
    expect(await read(root, "file.txt")).toBe("A\nb\n")
  })

  it("keeps multi-file apply all-or-nothing when any file conflicts", async () => {
    const { root, applier } = await workspace()
    await writeFile(join(root, "ok.txt"), "base\n", "utf8")
    await writeFile(join(root, "bad.txt"), "changed\n", "utf8")

    const result = await applier.apply({
      id: "cs_atomic",
      changes: [
        {
          path: "ok.txt",
          kind: "update",
          baseText: "base\n",
          targetText: "target\n"
        },
        {
          path: "bad.txt",
          kind: "update",
          baseText: "base\n",
          targetText: "target\n"
        }
      ]
    })

    expect(result.status).toBe("conflicted")
    expect(await read(root, "ok.txt")).toBe("base\n")
    expect(await read(root, "bad.txt")).toBe("changed\n")
  })

  it("applies and undoes create and delete changes", async () => {
    const { root, applier } = await workspace()
    await writeFile(join(root, "delete.txt"), "remove me\n", "utf8")

    const applied = await applier.apply({
      id: "cs_create_delete",
      changes: [
        {
          path: "create.txt",
          kind: "create",
          targetText: "created\n"
        },
        {
          path: "delete.txt",
          kind: "delete",
          baseText: "remove me\n"
        }
      ]
    })

    expect(applied.status).toBe("applied")
    expect(await read(root, "create.txt")).toBe("created\n")
    await expect(readFile(join(root, "delete.txt"), "utf8")).rejects.toMatchObject({
      code: "ENOENT"
    })

    const undone = await applier.undo(applied)
    expect(undone.status).toBe("applied")
    await expect(readFile(join(root, "create.txt"), "utf8")).rejects.toMatchObject({
      code: "ENOENT"
    })
    expect(await read(root, "delete.txt")).toBe("remove me\n")
  })

  it("refuses undo when the applied file changed afterwards", async () => {
    const { root, applier } = await workspace()
    await writeFile(join(root, "file.txt"), "base\n", "utf8")
    const applied = await applier.apply({
      id: "cs_undo_conflict",
      changes: [
        {
          path: "file.txt",
          kind: "update",
          baseText: "base\n",
          targetText: "after\n"
        }
      ]
    })
    await writeFile(join(root, "file.txt"), "someone else\n", "utf8")

    const undone = await applier.undo(applied)

    expect(undone.status).toBe("conflicted")
    expect(undone.conflicts[0]).toMatchObject({
      path: "file.txt",
      reason: "undo_target_changed",
      expectedSha256: sha256Text("after\n")
    })
    expect(await read(root, "file.txt")).toBe("someone else\n")
  })

  it("rejects workspace path traversal", async () => {
    const { applier } = await workspace()
    await expect(
      applier.apply({
        id: "cs_escape",
        changes: [
          {
            path: "../escape.txt",
            kind: "create",
            targetText: "nope"
          }
        ]
      })
    ).rejects.toThrow("workspace path escapes root")
  })
})

async function workspace(): Promise<{
  readonly root: string
  readonly applier: ChangeSetApplier
}> {
  const root = await mkdtemp(join(tmpdir(), "wanex-changeset-core-"))
  tempDirs.push(root)
  return {
    root,
    applier: new ChangeSetApplier(new LocalWorkspace(root))
  }
}

async function read(root: string, path: string): Promise<string> {
  return await readFile(join(root, path), "utf8")
}
