import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  LocalWorkspaceReader,
  planChangeSetApply,
  planChangeSetUndo,
  sha256Text
} from "../../src/changesets/index.js"

const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) await rm(dir, { recursive: true, force: true })
  }
})

describe("@wanex/workspace/changesets planning", () => {
  it("plans a clean update without mutating the workspace", async () => {
    const { root, reader } = await workspace()
    await writeFile(join(root, "app.ts"), "one\ntwo\n", "utf8")
    const receipt = await planChangeSetApply(reader, {
      id: "cs_update",
      changes: [{
        path: "app.ts",
        kind: "update",
        baseText: "one\ntwo\n",
        targetText: "one\nTWO\n"
      }]
    })
    expect(receipt).toMatchObject({
      status: "applied",
      files: [{ beforeText: "one\ntwo\n", afterText: "one\nTWO\n" }]
    })
    await expect(reader.readText("app.ts")).resolves.toBe("one\ntwo\n")
  })

  it("classifies an existing target as already applied", async () => {
    const { root, reader } = await workspace()
    await writeFile(join(root, "file.txt"), "after\n", "utf8")
    await expect(planChangeSetApply(reader, {
      id: "cs_already",
      changes: [{
        path: "file.txt",
        kind: "update",
        baseText: "before\n",
        targetText: "after\n"
      }]
    })).resolves.toMatchObject({ status: "already_applied" })
  })

  it("plans a non-overlapping merge and reports overlapping conflicts", async () => {
    const { root, reader } = await workspace()
    await writeFile(join(root, "merge.txt"), "A\nb\nc\n", "utf8")
    await writeFile(join(root, "conflict.txt"), "A\nb\n", "utf8")
    await expect(planChangeSetApply(reader, {
      id: "cs_merge",
      changes: [{
        path: "merge.txt",
        kind: "update",
        baseText: "a\nb\nc\n",
        targetText: "a\nb\nC\n"
      }]
    })).resolves.toMatchObject({
      status: "applied",
      files: [{ merged: true, afterText: "A\nb\nC\n" }]
    })
    await expect(planChangeSetApply(reader, {
      id: "cs_conflict",
      changes: [{
        path: "conflict.txt",
        kind: "update",
        baseText: "a\nb\n",
        targetText: "AA\nb\n"
      }]
    })).resolves.toMatchObject({
      status: "conflicted",
      files: [],
      conflicts: [{ path: "conflict.txt", reason: "merge_conflict" }]
    })
  })

  it("returns no file plan when any member conflicts", async () => {
    const { root, reader } = await workspace()
    await writeFile(join(root, "ok.txt"), "base\n", "utf8")
    await writeFile(join(root, "bad.txt"), "changed\n", "utf8")
    await expect(planChangeSetApply(reader, {
      id: "cs_atomic",
      changes: [
        { path: "ok.txt", kind: "update", baseText: "base\n", targetText: "target\n" },
        { path: "bad.txt", kind: "update", baseText: "base\n", targetText: "target\n" }
      ]
    })).resolves.toMatchObject({ status: "conflicted", files: [] })
  })

  it("plans create/delete and their inverse undo", async () => {
    const { root, reader } = await workspace()
    await writeFile(join(root, "delete.txt"), "remove me\n", "utf8")
    const applied = await planChangeSetApply(reader, {
      id: "cs_create_delete",
      changes: [
        { path: "create.txt", kind: "create", targetText: "created\n" },
        { path: "delete.txt", kind: "delete", baseText: "remove me\n" }
      ]
    })
    await writeFile(join(root, "create.txt"), "created\n", "utf8")
    await rm(join(root, "delete.txt"))
    await expect(planChangeSetUndo(reader, applied)).resolves.toMatchObject({
      status: "applied",
      files: [
        { path: "create.txt", beforeText: "created\n" },
        { path: "delete.txt", afterText: "remove me\n" }
      ]
    })
  })

  it("refuses undo when current content no longer matches the receipt", async () => {
    const { root, reader } = await workspace()
    await writeFile(join(root, "file.txt"), "someone else\n", "utf8")
    const result = await planChangeSetUndo(reader, {
      changeSetId: "cs_undo_conflict",
      status: "applied",
      files: [{
        path: "file.txt",
        kind: "update",
        beforeText: "base\n",
        afterText: "after\n",
        beforeSha256: sha256Text("base\n"),
        afterSha256: sha256Text("after\n"),
        merged: false
      }],
      conflicts: []
    })
    expect(result).toMatchObject({
      status: "conflicted",
      conflicts: [{
        reason: "undo_target_changed",
        expectedSha256: sha256Text("after\n")
      }]
    })
  })

  it("rejects workspace path traversal during planning", async () => {
    const { reader } = await workspace()
    await expect(planChangeSetApply(reader, {
      id: "cs_escape",
      changes: [{ path: "../escape.txt", kind: "create", targetText: "nope" }]
    })).rejects.toThrow("workspace path escapes root")
  })
})

async function workspace(): Promise<{
  readonly root: string
  readonly reader: LocalWorkspaceReader
}> {
  const root = await mkdtemp(join(tmpdir(), "wanex-changeset-core-"))
  tempDirs.push(root)
  return { root, reader: new LocalWorkspaceReader(root) }
}
