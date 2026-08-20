import { createHash } from "node:crypto"
import { mkdtemp, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type {
  WorkspaceChangeTransactionFilePlan,
  WorkspaceFileChange
} from "@wanex/protocol"
import {
  createStorageTestStore,
  type StorageTestStore
} from "@wanex/storage/testing"
import type { WorkspaceStore } from "@wanex/storage/workspace"
import { spawnNativeWorkspaceTransaction } from "../../src/transaction/native-helper.js"
import {
  WorkspaceChangeTransactionRuntime,
  WorkspaceTransactionRecoveryRequiredError
} from "../../src/transaction/runtime.js"
import { WorkspaceRuntime } from "../../src/runtime.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
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

describe("workspace transaction recovery", () => {
  it("finishes forward from a real partial native commit", async () => {
    const environment = await recoveryEnvironment("partial")
    await writeFile(join(environment.rootDir, "first.txt"), "one\n", "utf8")
    await writeFile(join(environment.rootDir, "second.txt"), "two\n", "utf8")
    const files = [
      filePlan(0, "first.txt", "one\n", "ONE\n"),
      filePlan(1, "second.txt", "two\n", "TWO\n")
    ]
    const transaction = await beginPreparedTransaction(environment, files)
    await environment.storage.beginWorkspaceChangeTransactionCommit(transaction.identity)
    await transaction.helper.commit(files, [0], async () => {})
    await transaction.helper.terminate()
    await expireExecution(environment.storage, transaction.identity)

    await environment.runtime.recoverPending(environment.workspaceId)

    await expect(readFile(join(environment.rootDir, "first.txt"), "utf8")).resolves.toBe("ONE\n")
    await expect(readFile(join(environment.rootDir, "second.txt"), "utf8")).resolves.toBe("TWO\n")
    const snapshot = await environment.storage.getWorkspaceChangeTransaction({
      transactionId: environment.transactionId
    })
    expect(snapshot).toMatchObject({
      transaction: {
        state: "applied",
        recoveryDecision: "finish_forward",
        workspaceOperationId: expect.any(String)
      },
      files: [{ state: "committed" }, { state: "committed" }]
    })
    await expect(environment.storage.listWorkspaceChangeOperations({
      changeSetId: environment.changeSetId
    })).resolves.toMatchObject([{
      operation: "apply",
      status: "applied",
      receipt: { files: [{ path: "first.txt" }, { path: "second.txt" }] }
    }])
  })

  it("recovers after file commit succeeds but durable progress acknowledgement fails", async () => {
    const environment = await recoveryEnvironment("progress-ack")
    await writeFile(join(environment.rootDir, "first.txt"), "one\n", "utf8")
    await writeFile(join(environment.rootDir, "second.txt"), "two\n", "utf8")
    const files = [
      filePlan(0, "first.txt", "one\n", "ONE\n"),
      filePlan(1, "second.txt", "two\n", "TWO\n")
    ]
    await environment.storage.putWorkspaceChangeSet({
      workspaceId: environment.workspaceId,
      principalId: "recovery_test",
      changeSet: {
        id: environment.changeSetId,
        changes: files.map((file) => ({
          path: file.path,
          kind: "update" as const,
          baseText: file.beforeText!,
          targetText: file.afterText!
        }))
      }
    })
    let acknowledgmentFailed = false
    const flakyStorage = new Proxy(environment.storage, {
      get(target, property) {
        if (property === "recordWorkspaceChangeTransactionFileCommitted") {
          return async (request: Parameters<WorkspaceStore["recordWorkspaceChangeTransactionFileCommitted"]>[0]) => {
            const snapshot = await target.recordWorkspaceChangeTransactionFileCommitted(request)
            if (!acknowledgmentFailed) {
              acknowledgmentFailed = true
              throw new Error("injected durable progress acknowledgement failure")
            }
            return snapshot
          }
        }
        const value = Reflect.get(target, property)
        return typeof value === "function" ? value.bind(target) : value
      }
    }) as WorkspaceStore
    const runtime = new WorkspaceChangeTransactionRuntime({
      storage: flakyStorage,
      rootDir: environment.rootDir,
      serviceBin
    })

    await expect(runtime.execute({
      workspaceId: environment.workspaceId,
      changeSetId: environment.changeSetId,
      operation: "apply",
      mutation: {
        sourceKind: "tool",
        sourceId: "tool:progress-ack",
        idempotencyKey: "recovery:progress-ack",
        ownerId: "failing_host"
      },
      plan: async () => ({
        changeSetId: environment.changeSetId,
        status: "applied",
        files: files.map((file) => ({
          path: file.path,
          kind: "update" as const,
          beforeText: file.beforeText!,
          beforeSha256: file.beforeSha256!,
          afterText: file.afterText!,
          afterSha256: file.afterSha256!
        })),
        conflicts: []
      })
    })).rejects.toBeInstanceOf(WorkspaceTransactionRecoveryRequiredError)

    await expect(readFile(join(environment.rootDir, "first.txt"), "utf8")).resolves.toBe("ONE\n")
    await expect(readFile(join(environment.rootDir, "second.txt"), "utf8")).resolves.toBe("TWO\n")
    await environment.runtime.recoverPending(environment.workspaceId)
    await expect(environment.storage.listWorkspaceChangeOperations({
      changeSetId: environment.changeSetId
    })).resolves.toHaveLength(1)
    await expect(environment.storage.getWorkspaceChangeTransaction({
      transactionId: `wtx_${sha256("recovery:progress-ack").slice(0, 40)}`
    })).resolves.toMatchObject({
      transaction: { state: "applied", recoveryDecision: "finalize" },
      files: [{ state: "committed" }, { state: "committed" }]
    })
  })

  it("finalizes after every file committed before durable finalization", async () => {
    const environment = await recoveryEnvironment("all-committed")
    await writeFile(join(environment.rootDir, "file.txt"), "before\n", "utf8")
    const files = [filePlan(0, "file.txt", "before\n", "after\n")]
    const transaction = await beginPreparedTransaction(environment, files)
    await environment.storage.beginWorkspaceChangeTransactionCommit(transaction.identity)
    await transaction.helper.commit(files, [0], async () => {})
    await transaction.helper.terminate()
    await expireExecution(environment.storage, transaction.identity)

    await environment.runtime.recoverPending(environment.workspaceId)

    await expect(readFile(join(environment.rootDir, "file.txt"), "utf8")).resolves.toBe("after\n")
    await expect(environment.storage.getWorkspaceChangeTransaction({
      transactionId: environment.transactionId
    })).resolves.toMatchObject({
      transaction: {
        state: "applied",
        recoveryDecision: "finalize",
        workspaceOperationId: expect.any(String)
      },
      files: [{ state: "committed" }]
    })
    await expect(environment.storage.listWorkspaceChangeOperations({
      changeSetId: environment.changeSetId
    })).resolves.toMatchObject([{
      operation: "apply",
      status: "applied"
    }])
  })

  it("rebuilds the exact durable receipt after finalization recovery", async () => {
    const environment = await recoveryEnvironment("durable-receipt")
    const current = "A\nb\nc\n"
    const target = "A\nb\nC\n"
    await writeFile(join(environment.rootDir, "file.txt"), current, "utf8")
    const files = [filePlan(0, "file.txt", current, target)]
    const transaction = await beginPreparedTransaction(
      environment,
      files,
      `recovery:${environment.transactionId}`,
      {
        changes: [{
          path: "file.txt",
          kind: "update",
          baseText: current,
          targetText: target
        }]
      }
    )
    await environment.storage.beginWorkspaceChangeTransactionCommit(transaction.identity)
    await transaction.helper.commit(files, [0], async () => {})
    await transaction.helper.terminate()
    await expireExecution(environment.storage, transaction.identity)

    await environment.runtime.recoverPending(environment.workspaceId)

    await expect(environment.storage.listWorkspaceChangeOperations({
      changeSetId: environment.changeSetId
    })).resolves.toMatchObject([{
      receipt: {
        files: [{
          path: "file.txt",
          beforeText: current,
          afterText: target,
          beforeSha256: sha256(current),
          afterSha256: sha256(target)
        }]
      }
    }])
  })

  it("finishes and records an undo transaction after a committed crash", async () => {
    const environment = await recoveryEnvironment("undo-finalize")
    await writeFile(join(environment.rootDir, "file.txt"), "before\n", "utf8")
    const workspace = new WorkspaceRuntime({
      storage: environment.storage,
      rootDir: environment.rootDir,
      serviceBin,
      workspaceId: environment.workspaceId,
      principalId: "recovery_test"
    })
    const applied = await workspace.applyChangeSet({
      changeSet: {
        id: environment.changeSetId,
        changes: [{
          path: "file.txt",
          kind: "update",
          baseText: "before\n",
          targetText: "after\n"
        }]
      },
      mutation: {
        sourceKind: "host",
        sourceId: "host:undo-recovery-apply",
        idempotencyKey: "undo-recovery-apply",
        ownerId: "recovery_test"
      }
    })
    const files = [filePlan(0, "file.txt", "after\n", "before\n")]
    const transaction = await beginPreparedTransaction(
      environment,
      files,
      `recovery:${environment.transactionId}`,
      {
        operation: "undo",
        undoSourceOperationId: applied.operation.id,
        skipPutChangeSet: true
      }
    )
    await environment.storage.beginWorkspaceChangeTransactionCommit(transaction.identity)
    await transaction.helper.commit(files, [0], async () => {})
    await transaction.helper.terminate()
    await expireExecution(environment.storage, transaction.identity)

    await environment.runtime.recoverPending(environment.workspaceId)

    await expect(readFile(join(environment.rootDir, "file.txt"), "utf8")).resolves.toBe("before\n")
    await expect(environment.storage.listWorkspaceChangeOperations({
      changeSetId: environment.changeSetId
    })).resolves.toMatchObject([
      { operation: "apply", status: "applied" },
      {
        operation: "undo",
        status: "applied",
        receipt: {
          files: [{ beforeText: "after\n", afterText: "before\n" }]
        }
      }
    ])
    await expect(environment.storage.getWorkspaceChangeSet({
      changeSetId: environment.changeSetId
    })).resolves.toMatchObject({ currentState: "undone" })
  })

  it("cleans terminal delete artifacts before replaying an existing operation", async () => {
    const idempotencyKey = "recovery:terminal-cleanup-replay"
    const environment = await recoveryEnvironment(
      "terminal-cleanup",
      `wtx_${sha256(idempotencyKey).slice(0, 40)}`
    )
    await writeFile(join(environment.rootDir, "file.txt"), "before\n", "utf8")
    const files = [deleteFilePlan(0, "file.txt", "before\n")]
    const transaction = await beginPreparedTransaction(environment, files, idempotencyKey)
    await environment.storage.beginWorkspaceChangeTransactionCommit(transaction.identity)
    await transaction.helper.commit(files, [0], async ({ ordinal }) => {
      await environment.storage.recordWorkspaceChangeTransactionFileCommitted({
        ...transaction.identity,
        ordinal
      })
    })
    await transaction.helper.terminate()
    await environment.storage.finalizeWorkspaceChangeTransaction({
      ...transaction.identity,
      outcome: "applied",
      operationId: `wop_${sha256(environment.transactionId).slice(0, 40)}`,
      receipt: {
        changeSetId: environment.changeSetId,
        status: "applied",
        files: [{
          path: "file.txt",
          kind: "delete",
          beforeText: "before\n",
          beforeSha256: sha256("before\n")
        }],
        conflicts: []
      }
    })
    expect((await readdir(environment.rootDir)).some((name) => name.includes(".wanex-"))).toBe(true)

    const replay = await environment.runtime.execute({
      workspaceId: environment.workspaceId,
      changeSetId: environment.changeSetId,
      operation: "apply",
      mutation: {
        sourceKind: "tool",
        sourceId: `tool:${environment.transactionId}`,
        idempotencyKey,
        ownerId: "replay_host"
      },
      plan: async () => {
        throw new Error("terminal replay must not re-plan")
      }
    })

    expect(replay.operation.status).toBe("applied")
    expect((await readdir(environment.rootDir)).some((name) => name.includes(".wanex-"))).toBe(false)
  })

  it("rolls back a prepared transaction when every target is still before", async () => {
    const environment = await recoveryEnvironment("prepared")
    await writeFile(join(environment.rootDir, "file.txt"), "before\n", "utf8")
    const files = [filePlan(0, "file.txt", "before\n", "after\n")]
    const transaction = await beginPreparedTransaction(environment, files)
    await transaction.helper.terminate()
    await expireExecution(environment.storage, transaction.identity)

    await environment.runtime.recoverPending(environment.workspaceId)

    await expect(readFile(join(environment.rootDir, "file.txt"), "utf8")).resolves.toBe("before\n")
    await expect(environment.storage.getWorkspaceChangeTransaction({
      transactionId: environment.transactionId
    })).resolves.toMatchObject({
      transaction: { state: "rolled_back", recoveryDecision: "rollback_noop" }
    })
    await expect(environment.storage.listWorkspaceChangeOperations({
      changeSetId: environment.changeSetId
    })).resolves.toEqual([])
  })

  it("rolls back a transaction that crashed before its plan was durable", async () => {
    const environment = await recoveryEnvironment("unplanned")
    await environment.storage.putWorkspaceChangeSet({
      workspaceId: environment.workspaceId,
      principalId: "recovery_test",
      changeSet: {
        id: environment.changeSetId,
        changes: [{
          path: "file.txt",
          kind: "update",
          baseText: "before\n",
          targetText: "after\n"
        }]
      }
    })
    const identity = {
      transactionId: environment.transactionId,
      attemptId: `wta_${environment.transactionId}`,
      claimToken: `claim-${"x".repeat(40)}`
    }
    await environment.storage.beginWorkspaceChangeTransaction({
      id: environment.transactionId,
      workspaceId: environment.workspaceId,
      changeSetId: environment.changeSetId,
      operation: "apply",
      sourceKind: "tool",
      sourceId: `tool:${environment.transactionId}`,
      idempotencyKey: `recovery:${environment.transactionId}`,
      rootIdentitySha256: sha256(await realpath(environment.rootDir)),
      attemptId: identity.attemptId,
      ownerId: "crashed_host",
      claimToken: identity.claimToken,
      leaseMs: 60_000
    })
    await expireExecution(environment.storage, identity)

    await environment.runtime.recoverPending(environment.workspaceId)

    await expect(environment.storage.getWorkspaceChangeTransaction({
      transactionId: environment.transactionId
    })).resolves.toMatchObject({
      transaction: { state: "rolled_back" },
      files: []
    })
    await expect(environment.storage.listWorkspaceChangeOperations({
      changeSetId: environment.changeSetId
    })).resolves.toEqual([])
  })

  it("preserves an external edit and marks attention instead of overwriting it", async () => {
    const environment = await recoveryEnvironment("attention")
    await writeFile(join(environment.rootDir, "file.txt"), "before\n", "utf8")
    const files = [filePlan(0, "file.txt", "before\n", "after\n")]
    const transaction = await beginPreparedTransaction(environment, files)
    await transaction.helper.terminate()
    await writeFile(join(environment.rootDir, "file.txt"), "external\n", "utf8")
    await expireExecution(environment.storage, transaction.identity)

    await expect(
      environment.runtime.recoverPending(environment.workspaceId)
    ).rejects.toBeInstanceOf(WorkspaceTransactionRecoveryRequiredError)

    await expect(readFile(join(environment.rootDir, "file.txt"), "utf8")).resolves.toBe("external\n")
    await expect(environment.storage.getWorkspaceChangeTransaction({
      transactionId: environment.transactionId
    })).resolves.toMatchObject({
      transaction: {
        state: "recovery_required",
        recoveryDecision: "attention",
        failure: { type: "workspace.transaction_external_change" }
      }
    })
  })
})

async function recoveryEnvironment(label: string, transactionId?: string) {
  const storeDir = await temporaryDirectory(`wanex-recovery-store-${label}-`)
  const rootDir = await temporaryDirectory(`wanex-recovery-root-${label}-`)
  const storage = createStorageTestStore({
    kind: "local-system-service",
    mode: "persistent",
    storeDir,
    serviceBin
  })
  clients.push(storage)
  const workspaceId = `workspace_recovery_${label}`
  const changeSetId = `cs_recovery_${label}`
  transactionId ??= `wtx_recovery_${label}`
  return {
    rootDir,
    storage,
    workspaceId,
    changeSetId,
    transactionId,
    runtime: new WorkspaceChangeTransactionRuntime({
      storage,
      rootDir,
      serviceBin
    })
  }
}

async function beginPreparedTransaction(
  environment: Awaited<ReturnType<typeof recoveryEnvironment>>,
  files: readonly WorkspaceChangeTransactionFilePlan[],
  idempotencyKey = `recovery:${environment.transactionId}`,
  options: {
    readonly operation?: "apply" | "undo"
    readonly undoSourceOperationId?: string
    readonly changes?: readonly WorkspaceFileChange[]
    readonly skipPutChangeSet?: boolean
  } = {}
) {
  if (options.skipPutChangeSet !== true) {
    await environment.storage.putWorkspaceChangeSet({
      workspaceId: environment.workspaceId,
      principalId: "recovery_test",
      changeSet: {
        id: environment.changeSetId,
        changes: options.changes ?? files.map((file) => ({
          path: file.path,
          kind: file.afterText === undefined
            ? "delete" as const
            : file.beforeText === undefined
              ? "create" as const
              : "update" as const,
          ...(file.beforeText === undefined ? {} : { baseText: file.beforeText }),
          ...(file.afterText === undefined ? {} : { targetText: file.afterText })
        }))
      }
    })
  }
  const identity = {
    transactionId: environment.transactionId,
    attemptId: `wta_${environment.transactionId}`,
    claimToken: `claim-${"x".repeat(40)}`
  }
  await environment.storage.beginWorkspaceChangeTransaction({
    id: environment.transactionId,
    workspaceId: environment.workspaceId,
    changeSetId: environment.changeSetId,
    operation: options.operation ?? "apply",
    ...(options.undoSourceOperationId === undefined
      ? {}
      : { undoSourceOperationId: options.undoSourceOperationId }),
    sourceKind: "tool",
    sourceId: `tool:${environment.transactionId}`,
    idempotencyKey,
    rootIdentitySha256: sha256(await realpath(environment.rootDir)),
    attemptId: identity.attemptId,
    ownerId: "crashed_host",
    claimToken: identity.claimToken,
    leaseMs: 60_000
  })
  await environment.storage.recordWorkspaceChangeTransactionPlan({
    ...identity,
    files
  })
  const helper = await spawnNativeWorkspaceTransaction({
    rootDir: environment.rootDir,
    serviceBin,
    transactionId: environment.transactionId
  })
  await helper.prepare(files)
  await environment.storage.markWorkspaceChangeTransactionPrepared(identity)
  return { identity, helper }
}

function deleteFilePlan(
  ordinal: number,
  path: string,
  beforeText: string
): WorkspaceChangeTransactionFilePlan {
  return {
    ordinal,
    path,
    beforeText,
    beforeSha256: sha256(beforeText)
  }
}

async function expireExecution(
  storage: StorageTestStore,
  identity: {
    readonly transactionId: string
    readonly attemptId: string
    readonly claimToken: string
  }
): Promise<void> {
  await storage.renewWorkspaceChangeTransaction({
    ...identity,
    leaseMs: 10
  })
  await new Promise((resolve) => setTimeout(resolve, 25))
}

function filePlan(
  ordinal: number,
  path: string,
  beforeText: string,
  afterText: string
): WorkspaceChangeTransactionFilePlan {
  return {
    ordinal,
    path,
    beforeText,
    beforeSha256: sha256(beforeText),
    afterText,
    afterSha256: sha256(afterText)
  }
}

async function temporaryDirectory(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}
