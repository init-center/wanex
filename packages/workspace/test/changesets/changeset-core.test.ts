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

  it.each([
    ["separate edits", "A\nb\nc\n", "a\nb\nC\n"],
    ["insertions", "a\nexternal\nb\n", "a\ntarget\nb\n"],
    ["deletions", "a\nc\n", "a\nb\n"],
    ["repeated lines", "same\nexternal\nsame\n", "same\ntarget\nsame\n"],
    ["adjacent edits", "external\nb\nc\n", "a\ntarget\nc\n"],
    ["EOF newline changes", "a\nb", "a\nB\n"]
  ])("fails closed for %s instead of guessing a text merge", async (
    _scenario,
    current,
    target
  ) => {
    const { root, reader } = await workspace()
    await writeFile(join(root, "file.txt"), current, "utf8")
    await expect(planChangeSetApply(reader, {
      id: "cs_conservative_conflict",
      changes: [{
        path: "file.txt",
        kind: "update",
        baseText: "a\nb\nc\n",
        targetText: target
      }]
    })).resolves.toMatchObject({
      status: "conflicted",
      files: [],
      conflicts: [{ path: "file.txt", reason: "base_hash_mismatch" }]
    })
  })

  it("classifies an absent delete target as already applied", async () => {
    const { reader } = await workspace()
    await expect(planChangeSetApply(reader, {
      id: "cs_delete_already_applied",
      changes: [{ path: "gone.txt", kind: "delete", baseText: "before\n" }]
    })).resolves.toMatchObject({
      status: "already_applied",
      files: [{ path: "gone.txt", kind: "delete" }]
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
        afterSha256: sha256Text("after\n")
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
