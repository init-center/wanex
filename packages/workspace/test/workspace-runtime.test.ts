import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { sha256Text, type ChangeSet } from "../src/changesets/index.js"
import { createStorageTestStore, type StorageTestStore } from "@wanex/storage/testing"
import {
  FileSystemWorkspaceMutationGate,
  WorkspaceRuntime,
  type WorkspaceMutationGate
} from "../src/index.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)

const tempDirs: string[] = []
const clients: StorageTestStore[] = []

afterEach(async () => {
  while (clients.length > 0) {
    await clients.pop()?.dispose()
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("@wanex/workspace", () => {
  it("applies, persists, undoes, and reapplies a changeset", async () => {
    const { rootDir, runtime } = await createRuntime()
    await mkdir(join(rootDir, "src"), { recursive: true })
    await writeFile(join(rootDir, "src/app.ts"), "one\n", "utf8")
    const changeSet: ChangeSet = {
      id: "cs_workspace_apply",
      title: "Update app",
      changes: [
        {
          path: "src/app.ts",
          kind: "update",
          baseText: "one\n",
          targetText: "two\n"
        }
      ]
    }

    const applied = await runtime.applyChangeSet({ changeSet })
    expect(applied.receipt.status).toBe("applied")
    expect(applied.changeSet.currentState).toBe("applied")
    expect(await readFile(join(rootDir, "src/app.ts"), "utf8")).toBe("two\n")

    const undone = await runtime.undoChangeSet({
      changeSetId: changeSet.id
    })
    expect(undone.receipt.status).toBe("applied")
    expect(undone.changeSet.currentState).toBe("undone")
    expect(await readFile(join(rootDir, "src/app.ts"), "utf8")).toBe("one\n")

    const reapplied = await runtime.applyChangeSet({ changeSet })
    expect(reapplied.receipt.status).toBe("applied")
    expect(reapplied.changeSet.currentState).toBe("applied")
    expect(await readFile(join(rootDir, "src/app.ts"), "utf8")).toBe("two\n")

    const history = await runtime.getHistory(changeSet.id)
    expect(history?.operations.map((operation) => operation.operation)).toEqual([
      "apply",
      "undo",
      "apply"
    ])
  })

  it("persists conflicts without mutating the workspace", async () => {
    const { rootDir, runtime } = await createRuntime()
    await writeFile(join(rootDir, "file.txt"), "current\n", "utf8")
    const changeSet: ChangeSet = {
      id: "cs_workspace_conflict",
      changes: [
        {
          path: "file.txt",
          kind: "update",
          baseText: "base\n",
          targetText: "target\n"
        }
      ]
    }

    const result = await runtime.applyChangeSet({ changeSet })

    expect(result.receipt.status).toBe("conflicted")
    expect(result.changeSet.currentState).toBe("conflicted")
    expect(result.receipt.conflicts[0]).toMatchObject({
      path: "file.txt",
      reason: "merge_conflict"
    })
    expect(await readFile(join(rootDir, "file.txt"), "utf8")).toBe("current\n")
    const history = await runtime.getHistory(changeSet.id)
    expect(history?.operations[0]?.status).toBe("conflicted")
  })

  it("can undo from durable history after recreating the runtime", async () => {
    const env = await createRuntime()
    await writeFile(join(env.rootDir, "file.txt"), "before\n", "utf8")
    const changeSet: ChangeSet = {
      id: "cs_workspace_restart",
      changes: [
        {
          path: "file.txt",
          kind: "update",
          baseText: "before\n",
          targetText: "after\n"
        }
      ]
    }
    await env.runtime.applyChangeSet({ changeSet })
    await env.client.dispose()

    const restartedClient = clientFor(env.storeDir)
    const restartedRuntime = new WorkspaceRuntime({
      storage: restartedClient,
      rootDir: env.rootDir,
      workspaceId: "workspace_test"
    })
    const history = await restartedRuntime.getHistory(changeSet.id)
    expect(history?.changeSet.currentState).toBe("applied")
    expect(history?.operations[0]?.receipt.files[0]).toMatchObject({
      afterSha256: sha256Text("after\n")
    })

    const undone = await restartedRuntime.undoChangeSet({
      changeSetId: changeSet.id
    })

    expect(undone.changeSet.currentState).toBe("undone")
    expect(await readFile(join(env.rootDir, "file.txt"), "utf8")).toBe(
      "before\n"
    )
  })

  it("serializes concurrent workspace mutations through the mutation gate", async () => {
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-workspace-store-"))
    const rootDir = await mkdtemp(join(tmpdir(), "wanex-workspace-root-"))
    tempDirs.push(storeDir, rootDir)
    const clientA = clientFor(storeDir)
    const clientB = clientFor(storeDir)
    const gate = new InstrumentedGate(
      new FileSystemWorkspaceMutationGate({
        rootDir,
        timeoutMs: 2_000,
        retryDelayMs: 5
      })
    )
    const runtimeA = new WorkspaceRuntime({
      storage: clientA,
      rootDir,
      workspaceId: "workspace_test",
      principalId: "agent_a",
      mutationGate: gate
    })
    const runtimeB = new WorkspaceRuntime({
      storage: clientB,
      rootDir,
      workspaceId: "workspace_test",
      principalId: "agent_b",
      mutationGate: gate
    })
    await writeFile(join(rootDir, "a.txt"), "base-a\n", "utf8")
    await writeFile(join(rootDir, "b.txt"), "base-b\n", "utf8")

    const [first, second] = await Promise.all([
      runtimeA.applyChangeSet({
        changeSet: {
          id: "cs_concurrent_a",
          changes: [
            {
              path: "a.txt",
              kind: "update",
              baseText: "base-a\n",
              targetText: "target-a\n"
            }
          ]
        }
      }),
      runtimeB.applyChangeSet({
        changeSet: {
          id: "cs_concurrent_b",
          changes: [
            {
              path: "b.txt",
              kind: "update",
              baseText: "base-b\n",
              targetText: "target-b\n"
            }
          ]
        }
      })
    ])

    expect(first.receipt.status).toBe("applied")
    expect(second.receipt.status).toBe("applied")
    expect(gate.maxActive).toBe(1)
    expect(gate.entries).toBe(2)
    expect(await readFile(join(rootDir, "a.txt"), "utf8")).toBe("target-a\n")
    expect(await readFile(join(rootDir, "b.txt"), "utf8")).toBe("target-b\n")
  })

  it("recovers stale workspace mutation locks with owner metadata", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "wanex-workspace-root-"))
    tempDirs.push(rootDir)
    const lockDir = workspaceMutationLockDir(rootDir)
    await mkdir(lockDir, { recursive: true })
    await writeFile(
      join(lockDir, "owner.json"),
      JSON.stringify({
        ownerToken: "lock_stale",
        createdAt: Date.now() - 10_000,
        pid: 999_999,
        hostname: "stale-host",
        lockName: "workspace-mutation.lock"
      }),
      "utf8"
    )
    const gate = new FileSystemWorkspaceMutationGate({
      rootDir,
      staleMs: 1,
      timeoutMs: 500,
      retryDelayMs: 5
    })

    await expect(gate.runExclusive(async () => "recovered")).resolves.toBe(
      "recovered"
    )
    await expect(readFile(join(lockDir, "owner.json"), "utf8")).rejects.toMatchObject({
      code: "ENOENT"
    })
  })

  it("times out active workspace mutation locks with owner diagnostics", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "wanex-workspace-root-"))
    tempDirs.push(rootDir)
    const lockDir = workspaceMutationLockDir(rootDir)
    await mkdir(lockDir, { recursive: true })
    await writeFile(
      join(lockDir, "owner.json"),
      JSON.stringify({
        ownerToken: "lock_active",
        createdAt: Date.now(),
        pid: 123,
        hostname: "active-host",
        lockName: "workspace-mutation.lock"
      }),
      "utf8"
    )
    const gate = new FileSystemWorkspaceMutationGate({
      rootDir,
      staleMs: 60_000,
      timeoutMs: 25,
      retryDelayMs: 5
    })

    await expect(gate.runExclusive(async () => "blocked")).rejects.toThrow(
      /lock_active/
    )
  })

  it("does not release a lock acquired by a newer owner after stale recovery", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "wanex-workspace-root-"))
    tempDirs.push(rootDir)
    const firstGate = new FileSystemWorkspaceMutationGate({
      rootDir,
      staleMs: 1,
      timeoutMs: 500,
      retryDelayMs: 5
    })
    const secondGate = new FileSystemWorkspaceMutationGate({
      rootDir,
      staleMs: 1,
      timeoutMs: 500,
      retryDelayMs: 5
    })
    let releaseFirst!: () => void
    const firstRun = firstGate.runExclusive(
      async () =>
        await new Promise<string>((resolve) => {
          releaseFirst = () => resolve("first")
        })
    )
    await waitForOwner(rootDir)
    const lockDir = workspaceMutationLockDir(rootDir)
    const firstOwner = JSON.parse(
      await readFile(join(lockDir, "owner.json"), "utf8")
    ) as { readonly ownerToken: string }
    await writeFile(
      join(lockDir, "owner.json"),
      JSON.stringify({
        ownerToken: firstOwner.ownerToken,
        createdAt: Date.now() - 10_000,
        pid: 123,
        hostname: "stale-first",
        lockName: "workspace-mutation.lock"
      }),
      "utf8"
    )

    let releaseSecond!: () => void
    const secondRun = secondGate.runExclusive(
      async () =>
        await new Promise<string>((resolve) => {
          releaseSecond = () => resolve("second")
        })
    )
    await waitForOwner(rootDir, firstOwner.ownerToken)
    releaseFirst()
    await expect(firstRun).resolves.toBe("first")
    const ownerAfterFirstRelease = await readFile(
      join(lockDir, "owner.json"),
      "utf8"
    )
    expect(JSON.parse(ownerAfterFirstRelease).ownerToken).not.toBe(
      firstOwner.ownerToken
    )

    releaseSecond()
    await expect(secondRun).resolves.toBe("second")
    await expect(readFile(join(lockDir, "owner.json"), "utf8")).rejects.toMatchObject({
      code: "ENOENT"
    })
  })
})

async function createRuntime(): Promise<{
  readonly storeDir: string
  readonly rootDir: string
  readonly client: StorageTestStore
  readonly runtime: WorkspaceRuntime
}> {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-workspace-store-"))
  const rootDir = await mkdtemp(join(tmpdir(), "wanex-workspace-root-"))
  tempDirs.push(storeDir, rootDir)
  const client = clientFor(storeDir)
  const runtime = new WorkspaceRuntime({
    storage: client,
    rootDir,
    workspaceId: "workspace_test",
    principalId: "agent_test"
  })
  return { storeDir, rootDir, client, runtime }
}

function clientFor(storeDir: string): StorageTestStore {
  const client = createStorageTestStore({ kind: "local-system-service", mode: "persistent",
    storeDir,
    serviceBin
  })
  clients.push(client)
  return client
}

class InstrumentedGate implements WorkspaceMutationGate {
  active = 0
  maxActive = 0
  entries = 0

  constructor(private readonly inner: WorkspaceMutationGate) {}

  async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    return await this.inner.runExclusive(async () => {
      this.active += 1
      this.entries += 1
      this.maxActive = Math.max(this.maxActive, this.active)
      await new Promise((resolve) => setTimeout(resolve, 30))
      try {
        return await operation()
      } finally {
        this.active -= 1
      }
    })
  }
}

function workspaceMutationLockDir(rootDir: string): string {
  return join(rootDir, ".wanex", "locks", "workspace-mutation.lock")
}

async function waitForOwner(
  rootDir: string,
  previousOwnerToken?: string
): Promise<void> {
  const ownerPath = join(workspaceMutationLockDir(rootDir), "owner.json")
  const startedAt = Date.now()
  while (Date.now() - startedAt < 1_000) {
    try {
      const owner = JSON.parse(await readFile(ownerPath, "utf8")) as {
        readonly ownerToken?: string
      }
      if (
        typeof owner.ownerToken === "string" &&
        owner.ownerToken !== previousOwnerToken
      ) {
        return
      }
    } catch {
      // Retry until owner metadata appears.
    }
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error("timed out waiting for workspace lock owner metadata")
}
