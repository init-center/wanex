import { randomUUID } from "node:crypto"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { hostname } from "node:os"
import { dirname, join } from "node:path"
import type {
  FileSystemWorkspaceMutationGateOptions,
  WorkspaceLockMetadata,
  WorkspaceMutationGate
} from "./types.js"

const DEFAULT_GATE_TIMEOUT_MS = 10_000
const DEFAULT_GATE_RETRY_DELAY_MS = 25
const DEFAULT_GATE_STALE_MS = 60_000

export class FileSystemWorkspaceMutationGate implements WorkspaceMutationGate {
  private readonly lockDir: string
  private readonly ownerPath: string
  private readonly lockName: string
  private readonly timeoutMs: number
  private readonly retryDelayMs: number
  private readonly staleMs: number

  constructor(options: FileSystemWorkspaceMutationGateOptions) {
    this.lockName = options.lockName ?? "workspace-mutation.lock"
    this.lockDir = join(options.rootDir, ".wanex", "locks", this.lockName)
    this.ownerPath = join(this.lockDir, "owner.json")
    this.timeoutMs = options.timeoutMs ?? DEFAULT_GATE_TIMEOUT_MS
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_GATE_RETRY_DELAY_MS
    this.staleMs = options.staleMs ?? DEFAULT_GATE_STALE_MS
  }

  async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const ownerToken = await this.acquire()
    try {
      return await operation()
    } finally {
      await this.release(ownerToken)
    }
  }

  private async acquire(): Promise<string> {
    await mkdir(dirname(this.lockDir), { recursive: true })
    const startedAt = Date.now()
    while (true) {
      try {
        await mkdir(this.lockDir, { recursive: false })
        const ownerToken = `lock_${randomUUID()}`
        await this.writeOwner(ownerToken)
        return ownerToken
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
          throw error
        }
        await this.recoverStaleLock(Date.now())
        if (Date.now() - startedAt >= this.timeoutMs) {
          const owner = await this.readOwner()
          throw new Error(
            `workspace mutation gate timed out after ${this.timeoutMs}ms${formatOwnerDiagnostic(owner)}`
          )
        }
        await sleep(this.retryDelayMs)
      }
    }
  }

  private async release(ownerToken: string): Promise<void> {
    const owner = await this.readOwner()
    if (owner?.ownerToken !== ownerToken) {
      return
    }
    await rm(this.lockDir, { recursive: true, force: true })
  }

  private async recoverStaleLock(now: number): Promise<void> {
    const owner = await this.readOwner()
    if (owner === null || now - owner.createdAt < this.staleMs) {
      return
    }
    await rm(this.lockDir, { recursive: true, force: true })
  }

  private async writeOwner(ownerToken: string): Promise<void> {
    const metadata = {
      ownerToken,
      createdAt: Date.now(),
      pid: process.pid,
      hostname: hostname(),
      lockName: this.lockName
    } satisfies WorkspaceLockMetadata
    await writeFile(this.ownerPath, `${JSON.stringify(metadata)}\n`, "utf8")
  }

  private async readOwner(): Promise<WorkspaceLockMetadata | null> {
    try {
      const raw = await readFile(this.ownerPath, "utf8")
      const value = JSON.parse(raw) as Partial<WorkspaceLockMetadata>
      if (
        typeof value.ownerToken !== "string" ||
        typeof value.createdAt !== "number" ||
        typeof value.lockName !== "string"
      ) {
        return null
      }
      return {
        ownerToken: value.ownerToken,
        createdAt: value.createdAt,
        lockName: value.lockName,
        ...(typeof value.pid === "number" ? { pid: value.pid } : {}),
        ...(typeof value.hostname === "string" ? { hostname: value.hostname } : {})
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null
      }
      return null
    }
  }
}

export class NoopWorkspaceMutationGate implements WorkspaceMutationGate {
  async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    return await operation()
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function formatOwnerDiagnostic(owner: WorkspaceLockMetadata | null): string {
  if (owner === null) {
    return ""
  }
  return `; current owner token=${owner.ownerToken} createdAt=${owner.createdAt}`
}
