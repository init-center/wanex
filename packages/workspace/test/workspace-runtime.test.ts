import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { sha256Text, type ChangeSet } from "../src/changesets/index.js"
import { createStorageTestStore, type StorageTestStore } from "@wanex/storage/testing"
import { WorkspaceRuntime, type WorkspaceMutationIdentity } from "../src/index.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)

const tempDirs: string[] = []
const clients: StorageTestStore[] = []

afterEach(async () => {
  while (clients.length > 0) await clients.pop()?.dispose()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) await rm(dir, { recursive: true, force: true })
  }
})

describe("@wanex/workspace transaction runtime", () => {
  it("applies, persists, undoes, and reapplies through durable transactions", async () => {
    const { rootDir, runtime } = await createRuntime()
    await mkdir(join(rootDir, "src"), { recursive: true })
    await writeFile(join(rootDir, "src/app.ts"), "one\n", "utf8")
    const changeSet: ChangeSet = {
      id: "cs_workspace_apply",
      changes: [{
        path: "src/app.ts",
        kind: "update",
        baseText: "one\n",
        targetText: "two\n"
      }]
    }

    const applied = await runtime.applyChangeSet({
      changeSet,
      mutation: mutation("apply-first")
    })
    expect(applied).toMatchObject({
      receipt: { status: "applied" },
      changeSet: { currentState: "applied" },
      transaction: { snapshot: { transaction: { state: "applied" } } }
    })
    await expect(readFile(join(rootDir, "src/app.ts"), "utf8")).resolves.toBe("two\n")

    const undone = await runtime.undoChangeSet({
      changeSetId: changeSet.id,
      mutation: mutation("undo")
    })
    expect(undone.changeSet.currentState).toBe("undone")
    await expect(readFile(join(rootDir, "src/app.ts"), "utf8")).resolves.toBe("one\n")

    await runtime.applyChangeSet({
      changeSet,
      mutation: mutation("apply-second")
    })
    const history = await runtime.getHistory(changeSet.id)
    expect(history?.operations.map((operation) => operation.operation)).toEqual([
      "apply", "undo", "apply"
    ])
  })

  it("atomically records conflicts without mutating files", async () => {
    const { rootDir, runtime } = await createRuntime()
    await writeFile(join(rootDir, "file.txt"), "current\n", "utf8")
    const result = await runtime.applyChangeSet({
      changeSet: {
        id: "cs_workspace_conflict",
        changes: [{
          path: "file.txt",
          kind: "update",
          baseText: "base\n",
          targetText: "target\n"
        }]
      },
      mutation: mutation("conflict")
    })
    expect(result).toMatchObject({
      receipt: { status: "conflicted", conflicts: [{ reason: "merge_conflict" }] },
      changeSet: { currentState: "conflicted" },
      transaction: { snapshot: { transaction: { state: "rolled_back" } } }
    })
    await expect(readFile(join(rootDir, "file.txt"), "utf8")).resolves.toBe("current\n")
  })

  it("records a proven already-applied operation without a mutation plan", async () => {
    const { rootDir, runtime } = await createRuntime()
    await writeFile(join(rootDir, "file.txt"), "after\n", "utf8")
    const result = await runtime.applyChangeSet({
      changeSet: {
        id: "cs_workspace_noop",
        changes: [{
          path: "file.txt",
          kind: "update",
          baseText: "before\n",
          targetText: "after\n"
        }]
      },
      mutation: mutation("noop")
    })
    expect(result).toMatchObject({
      receipt: { status: "already_applied" },
      operation: { status: "already_applied" },
      transaction: { snapshot: { files: [], transaction: { state: "applied" } } }
    })
  })

  it("replays the same idempotency identity without creating another operation", async () => {
    const { rootDir, runtime } = await createRuntime()
    await writeFile(join(rootDir, "file.txt"), "before\n", "utf8")
    const request = {
      changeSet: {
        id: "cs_workspace_replay",
        changes: [{
          path: "file.txt",
          kind: "update" as const,
          baseText: "before\n",
          targetText: "after\n"
        }]
      },
      mutation: mutation("replay")
    }
    const first = await runtime.applyChangeSet(request)
    const second = await runtime.applyChangeSet(request)
    expect(second.operation.id).toBe(first.operation.id)
    expect((await runtime.getHistory("cs_workspace_replay"))?.operations).toHaveLength(1)
  })

  it("can undo from durable history after recreating the runtime", async () => {
    const environment = await createRuntime()
    await writeFile(join(environment.rootDir, "file.txt"), "before\n", "utf8")
    const changeSet: ChangeSet = {
      id: "cs_workspace_restart",
      changes: [{
        path: "file.txt",
        kind: "update",
        baseText: "before\n",
        targetText: "after\n"
      }]
    }
    await environment.runtime.applyChangeSet({
      changeSet,
      mutation: mutation("restart-apply")
    })
    await environment.client.dispose()

    const restarted = new WorkspaceRuntime({
      storage: clientFor(environment.storeDir),
      rootDir: environment.rootDir,
      serviceBin,
      workspaceId: "workspace_test"
    })
    expect((await restarted.getHistory(changeSet.id))?.operations[0]?.receipt.files[0]).toMatchObject({
      afterSha256: sha256Text("after\n")
    })
    await restarted.undoChangeSet({
      changeSetId: changeSet.id,
      mutation: mutation("restart-undo")
    })
    await expect(readFile(join(environment.rootDir, "file.txt"), "utf8")).resolves.toBe("before\n")
  })

  it("serializes independent concurrent mutations with native workspace ownership", async () => {
    const storeDir = await temporaryDirectory("wanex-workspace-store-")
    const rootDir = await temporaryDirectory("wanex-workspace-root-")
    const runtimeA = new WorkspaceRuntime({
      storage: clientFor(storeDir), rootDir, serviceBin,
      workspaceId: "workspace_test", principalId: "agent_a"
    })
    const runtimeB = new WorkspaceRuntime({
      storage: clientFor(storeDir), rootDir, serviceBin,
      workspaceId: "workspace_test", principalId: "agent_b"
    })
    await writeFile(join(rootDir, "a.txt"), "base-a\n", "utf8")
    await writeFile(join(rootDir, "b.txt"), "base-b\n", "utf8")

    const [first, second] = await Promise.all([
      runtimeA.applyChangeSet({
        changeSet: { id: "cs_concurrent_a", changes: [{
          path: "a.txt", kind: "update", baseText: "base-a\n", targetText: "target-a\n"
        }] },
        mutation: mutation("concurrent-a", "agent_a")
      }),
      runtimeB.applyChangeSet({
        changeSet: { id: "cs_concurrent_b", changes: [{
          path: "b.txt", kind: "update", baseText: "base-b\n", targetText: "target-b\n"
        }] },
        mutation: mutation("concurrent-b", "agent_b")
      })
    ])
    expect([first.receipt.status, second.receipt.status]).toEqual(["applied", "applied"])
    await expect(readFile(join(rootDir, "a.txt"), "utf8")).resolves.toBe("target-a\n")
    await expect(readFile(join(rootDir, "b.txt"), "utf8")).resolves.toBe("target-b\n")
  })
})

async function createRuntime() {
  const storeDir = await temporaryDirectory("wanex-workspace-store-")
  const rootDir = await temporaryDirectory("wanex-workspace-root-")
  const client = clientFor(storeDir)
  const runtime = new WorkspaceRuntime({
    storage: client,
    rootDir,
    serviceBin,
    workspaceId: "workspace_test",
    principalId: "agent_test"
  })
  return { storeDir, rootDir, client, runtime }
}

function clientFor(storeDir: string): StorageTestStore {
  const client = createStorageTestStore({
    kind: "local-system-service",
    mode: "persistent",
    storeDir,
    serviceBin
  })
  clients.push(client)
  return client
}

async function temporaryDirectory(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

function mutation(label: string, ownerId = "agent_test"): WorkspaceMutationIdentity {
  return {
    sourceKind: "host",
    sourceId: `host:${label}`,
    idempotencyKey: `workspace-test:${label}`,
    ownerId
  }
}
