import { createHash } from "node:crypto"
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { spawnNativeWorkspaceTransaction } from "../../src/transaction/native-helper.js"
import type { NativeWorkspaceTransactionExecutor } from "../../src/transaction/types.js"
import type { WorkspaceChangeTransactionFilePlan } from "@wanex/protocol"

const serviceBin = join(
  import.meta.dirname,
  `../../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)

const tempDirs: string[] = []
const executors: NativeWorkspaceTransactionExecutor[] = []

afterEach(async () => {
  while (executors.length > 0) await executors.pop()?.terminate()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) await rm(dir, { recursive: true, force: true })
  }
})

describe("native workspace transaction client", () => {
  it("keeps prepare invisible and acknowledges exact commit progress", async () => {
    const rootDir = await temporaryDirectory("wanex-native-transaction-")
    const destination = join(rootDir, "source file 世界.txt")
    await writeFile(destination, "before\n", "utf8")
    const files: readonly WorkspaceChangeTransactionFilePlan[] = [
      {
        ordinal: 0,
        path: "source file 世界.txt",
        beforeText: "before\n",
        beforeSha256: sha256("before\n"),
        afterText: "after\n",
        afterSha256: sha256("after\n")
      },
      {
        ordinal: 1,
        path: "created.txt",
        afterText: "created\n",
        afterSha256: sha256("created\n")
      }
    ]
    const executor = await createExecutor(rootDir, "wtx_ts_exact_progress")
    const prepared: number[] = []
    await executor.prepare(files, async (progress) => {
      prepared.push(progress.ordinal)
      expect(progress.state).toBe("prepared")
    })
    expect(prepared).toEqual([0, 1])
    await expect(readFile(destination, "utf8")).resolves.toBe("before\n")
    await expect(readFile(join(rootDir, "created.txt"), "utf8")).rejects.toMatchObject({
      code: "ENOENT"
    })
    await expect(executor.inspect(files)).resolves.toEqual([
      { ordinal: 0, current: "before" },
      { ordinal: 1, current: "before" }
    ])

    const committed: number[] = []
    await executor.commit(files, [0, 1], async (progress) => {
      committed.push(progress.ordinal)
      expect(progress.state).toBe("committed")
      if (progress.ordinal === 0) {
        await expect(readFile(destination, "utf8")).resolves.toBe("after\n")
      }
    })
    expect(committed).toEqual([0, 1])
    await expect(executor.inspect(files)).resolves.toEqual([
      { ordinal: 0, current: "after" },
      { ordinal: 1, current: "after" }
    ])
    await executor.cleanup(files)
    executors.pop()
  })

  it("consumes the complete commit response before surfacing an acknowledgment failure", async () => {
    const rootDir = await temporaryDirectory("wanex-native-transaction-ack-")
    const files: readonly WorkspaceChangeTransactionFilePlan[] = [
      {
        ordinal: 0,
        path: "first.txt",
        afterText: "first\n",
        afterSha256: sha256("first\n")
      },
      {
        ordinal: 1,
        path: "second.txt",
        afterText: "second\n",
        afterSha256: sha256("second\n")
      }
    ]
    const executor = await createExecutor(rootDir, "wtx_ts_ack_failure")
    await executor.prepare(files)

    await expect(executor.commit(files, [0, 1], async ({ ordinal }) => {
      throw new Error(`durable acknowledgment failed at ${ordinal}`)
    })).rejects.toThrow("durable acknowledgment failed at 0")
    await expect(executor.inspect(files)).resolves.toEqual([
      { ordinal: 0, current: "after" },
      { ordinal: 1, current: "after" }
    ])
    await executor.cleanup(files)
    executors.pop()
  })

  it("rejects protocol frames with extra fields", async () => {
    const rootDir = await temporaryDirectory("wanex-native-transaction-protocol-")
    const fixture = await fixtureScript(`
      process.stdout.write(JSON.stringify({
        protocol: 1,
        kind: "workspace_transaction_ready",
        extra: true
      }) + "\\n")
      process.stdin.resume()
    `)

    await expect(spawnNativeWorkspaceTransaction({
      rootDir,
      serviceBin: process.execPath,
      serviceArgsPrefix: [fixture],
      transactionId: "wtx_ts_invalid_protocol",
      startupTimeoutMs: 1_000
    })).rejects.toMatchObject({ code: "invalid_protocol" })
  })
})

async function createExecutor(
  rootDir: string,
  transactionId: string
): Promise<NativeWorkspaceTransactionExecutor> {
  const executor = await spawnNativeWorkspaceTransaction({
    rootDir,
    serviceBin,
    transactionId
  })
  executors.push(executor)
  return executor
}

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(directory)
  return directory
}

async function fixtureScript(source: string): Promise<string> {
  const directory = await temporaryDirectory("wanex-transaction-helper-fixture-")
  const path = join(directory, "fixture.mjs")
  await writeFile(path, source, "utf8")
  await chmod(path, 0o644)
  return path
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}
