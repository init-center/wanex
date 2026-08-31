import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import type { JsonValue } from "@wanex/protocol"
import {
  fakeModelDescriptor,
  type PreparedProviderReplayMessage,
  type ProviderAdapter,
  type ProviderEvent,
  type ProviderRequest
} from "@wanex/runtime/provider"
import {
  createToolRuntimeBinding,
  jsonToolResultContent,
  ToolRegistry,
  type ToolPermissionDecision,
  type ToolPermissionPolicy,
  type ToolPermissionRequest
} from "@wanex/runtime/tools"
import { createStorageHandle } from "@wanex/storage"
import type { CoreStore, StorageHandle } from "@wanex/storage"
import {
  createWorkspaceStore,
  type WorkspaceStore
} from "@wanex/storage/workspace"
import { ExactWorkspaceProgramPolicy } from "@wanex/workspace/tools"
import { createCodingHost } from "../src/host/start.js"
import type { CodingExecutionOptions } from "../src/host/types.js"
import type { CodingRepositoryContextPolicy } from "../src/host/types.js"

const execFileAsync = promisify(execFile)

export const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)

export interface TestEnvironment {
  readonly dataDir: string
  readonly storageHandle: StorageHandle
  readonly storage: CoreStore & WorkspaceStore
  start(
    execution?: CodingExecutionOptions,
    context?: CodingRepositoryContextPolicy
  ): ReturnType<typeof createCodingHost>
  dispose(): Promise<void>
}

export class CodingHostTestScope {
  readonly #tempDirs: string[] = []
  readonly #storageHandles = new Set<StorageHandle>()

  async createEnvironment(): Promise<TestEnvironment> {
    const dataDir = await this.tempDir("wanex-coding-data-")
    const storeDir = await this.tempDir("wanex-coding-store-")
    const storageHandle = createStorageHandle({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })
    this.#storageHandles.add(storageHandle)
    const storage = Object.assign(
      {},
      storageHandle.core,
      createWorkspaceStore(storageHandle.transport)
    )
    return {
      dataDir,
      storageHandle,
      storage,
      start: async (execution, context) => await createCodingHost({
        dataDir,
        storage: {
          kind: "injected",
          handle: storageHandle
        },
        artifacts: { explicitPath: serviceBin },
        ...(execution === undefined ? {} : { execution }),
        ...(context === undefined ? {} : { context }),
        recovery: { maxRuns: 8, budgetMs: 5_000 }
      }),
      dispose: async () => {
        this.#storageHandles.delete(storageHandle)
        await storageHandle.dispose()
      }
    }
  }

  async createRepository(parentDir?: string): Promise<string> {
    const repositoryRoot = parentDir === undefined
      ? await this.tempDir("wanex-coding-repository-")
      : join(parentDir, "selected-repository")
    await mkdir(repositoryRoot, { recursive: true })
    await git(repositoryRoot, ["init"])
    await git(repositoryRoot, ["config", "user.email", "wanex@example.local"])
    await git(repositoryRoot, ["config", "user.name", "Wanex Test"])
    await git(repositoryRoot, ["config", "core.autocrlf", "false"])
    await git(repositoryRoot, ["config", "commit.gpgsign", "false"])
    await writeFile(join(repositoryRoot, "README.md"), "base\n", "utf8")
    await git(repositoryRoot, ["add", "README.md"])
    await git(repositoryRoot, ["commit", "-m", "initial"])
    return repositoryRoot
  }

  async tempDir(prefix: string): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), prefix))
    this.#tempDirs.push(directory)
    return directory
  }

  async dispose(): Promise<void> {
    await Promise.allSettled(
      [...this.#storageHandles].map(async (handle) => await handle.dispose())
    )
    this.#storageHandles.clear()
    await Promise.all(
      this.#tempDirs.splice(0).map(async (dir) => {
        await rm(dir, { recursive: true, force: true })
      })
    )
  }
}

export function executionOptions(
  provider: ProviderAdapter,
  options: {
    readonly toolPermissionPolicy: ToolPermissionPolicy
    readonly workerCount?: number
  }
): CodingExecutionOptions {
  return {
    provider,
    toolPermissionPolicy: options.toolPermissionPolicy,
    programPolicy: new ExactWorkspaceProgramPolicy({ node: process.execPath }),
    ...(options.workerCount === undefined ? {} : { workerCount: options.workerCount }),
    idleIntervalMs: 10,
    errorIntervalMs: 10
  }
}

export class WorkspaceEditProvider implements ProviderAdapter {
  readonly protocol = { id: "fake" } as const
  readonly providerId = "coding-workspace-edit"
  readonly model = fakeModelDescriptor("coding-workspace-edit")
  calls = 0

  async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    this.calls += 1
    if (hasToolResult(request)) {
      yield { type: "text_delta", partId: "part_done", delta: "done" }
      yield { type: "finish", reason: "stop" }
      return
    }
    const target = requestedTarget(request)
    const toolCallId = `call_${target}`
    yield { type: "tool_call_start", index: 0, toolCallId }
    yield {
      type: "tool_call_delta",
      toolCallId,
      toolNameDelta: "workspace_apply_changeset",
      inputJsonDelta: JSON.stringify({
        title: `Create ${target}`,
        changes: [{
          path: `${target}.txt`,
          kind: "create",
          targetText: `${target}\n`
        }]
      })
    }
    yield { type: "tool_call_end", toolCallId }
    yield { type: "finish", reason: "tool_calls" }
  }

  buildReplayMessages(
    messages: readonly PreparedProviderReplayMessage[]
  ): JsonValue[] {
    return messages as unknown as JsonValue[]
  }
}

export class BlockingProvider implements ProviderAdapter {
  readonly protocol = { id: "fake" } as const
  readonly providerId = "coding-blocking"
  readonly model = fakeModelDescriptor("coding-blocking")
  readonly started: Promise<void>
  readonly #markStarted: () => void

  constructor() {
    let markStarted!: () => void
    this.started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    this.#markStarted = markStarted
  }

  async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    this.#markStarted()
    await waitForAbort(request)
    throw new DOMException("aborted", "AbortError")
  }

  buildReplayMessages(
    messages: readonly PreparedProviderReplayMessage[]
  ): JsonValue[] {
    return messages as unknown as JsonValue[]
  }
}

export class ConcurrentBlockingProvider implements ProviderAdapter {
  readonly protocol = { id: "fake" } as const
  readonly providerId = "coding-concurrent-blocking"
  readonly model = fakeModelDescriptor("coding-concurrent-blocking")
  active = 0
  maxActive = 0
  #startedCount = 0
  readonly #startedWaiters: Array<{
    readonly count: number
    readonly resolve: () => void
  }> = []

  get startedCount(): number {
    return this.#startedCount
  }

  waitForStarted(count: number): Promise<void> {
    if (!Number.isSafeInteger(count) || count <= 0) {
      throw new Error("coding provider started count must be positive")
    }
    if (this.#startedCount >= count) return Promise.resolve()
    return new Promise((resolve) => {
      this.#startedWaiters.push({ count, resolve })
    })
  }

  async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    this.#startedCount += 1
    this.active += 1
    this.maxActive = Math.max(this.maxActive, this.active)
    for (const waiter of [...this.#startedWaiters]) {
      if (this.#startedCount < waiter.count) continue
      this.#startedWaiters.splice(this.#startedWaiters.indexOf(waiter), 1)
      waiter.resolve()
    }
    try {
      await waitForAbort(request)
      throw new DOMException("aborted", "AbortError")
    } finally {
      this.active -= 1
    }
  }

  buildReplayMessages(
    messages: readonly PreparedProviderReplayMessage[]
  ): JsonValue[] {
    return messages as unknown as JsonValue[]
  }
}

export class StreamingTextProvider implements ProviderAdapter {
  readonly protocol = { id: "fake" } as const
  readonly providerId = "coding-streaming-text"
  readonly model = fakeModelDescriptor("coding-streaming-text")
  readonly started: Promise<void>
  readonly #markStarted: () => void
  readonly #released: Promise<void>
  readonly #release: () => void

  constructor() {
    let markStarted!: () => void
    this.started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    this.#markStarted = markStarted
    let release!: () => void
    this.#released = new Promise<void>((resolve) => {
      release = resolve
    })
    this.#release = release
  }

  release(): void {
    this.#release()
  }

  async *stream(_request: ProviderRequest): AsyncIterable<ProviderEvent> {
    this.#markStarted()
    yield { type: "text_delta", partId: "live_text", delta: "streaming answer" }
    await this.#released
    yield { type: "finish", reason: "stop" }
  }

  buildReplayMessages(
    messages: readonly PreparedProviderReplayMessage[]
  ): JsonValue[] {
    return messages as unknown as JsonValue[]
  }
}

export class EditThenBlockProvider implements ProviderAdapter {
  readonly protocol = { id: "fake" } as const
  readonly providerId = "coding-edit-then-block"
  readonly model = fakeModelDescriptor("coding-edit-then-block")
  readonly blocked: Promise<void>
  readonly #markBlocked: () => void

  constructor() {
    let markBlocked!: () => void
    this.blocked = new Promise<void>((resolve) => {
      markBlocked = resolve
    })
    this.#markBlocked = markBlocked
  }

  async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    if (!hasToolResult(request)) {
      yield { type: "tool_call_start", index: 0, toolCallId: "call_change" }
      yield {
        type: "tool_call_delta",
        toolCallId: "call_change",
        toolNameDelta: "workspace_apply_changeset",
        inputJsonDelta: JSON.stringify({
          changes: [{
            path: "change.txt",
            kind: "create",
            targetText: "changed before cancellation\n"
          }]
        })
      }
      yield { type: "tool_call_end", toolCallId: "call_change" }
      yield { type: "finish", reason: "tool_calls" }
      return
    }
    this.#markBlocked()
    await waitForAbort(request)
    throw new DOMException("aborted", "AbortError")
  }

  buildReplayMessages(
    messages: readonly PreparedProviderReplayMessage[]
  ): JsonValue[] {
    return messages as unknown as JsonValue[]
  }
}

export class AmbiguousToolProvider implements ProviderAdapter {
  readonly protocol = { id: "fake" } as const
  readonly providerId = "coding-ambiguous-tool"
  readonly model = fakeModelDescriptor("coding-ambiguous-tool")
  calls = 0
  toolCalls = 0

  constructor(readonly toolCount = 1) {
    if (!Number.isSafeInteger(toolCount) || toolCount < 1 || toolCount > 8) {
      throw new Error("ambiguous tool provider toolCount is invalid")
    }
  }

  async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    this.calls += 1
    if (hasToolResult(request)) {
      yield { type: "text_delta", partId: "part_done", delta: "recovered" }
      yield { type: "finish", reason: "stop" }
      return
    }
    for (let index = 0; index < this.toolCount; index += 1) {
      const suffix = this.toolCount === 1 ? "" : `_${index + 1}`
      const toolCallId = `call_remote${suffix}`
      yield { type: "tool_call_start", index, toolCallId }
      yield {
        type: "tool_call_delta",
        toolCallId,
        toolNameDelta: `ambiguous_remote${suffix}`,
        inputJsonDelta: JSON.stringify({ operation: `remote-${index + 1}` })
      }
      yield { type: "tool_call_end", toolCallId }
    }
    yield { type: "finish", reason: "tool_calls" }
  }

  buildReplayMessages(
    messages: readonly PreparedProviderReplayMessage[]
  ): JsonValue[] {
    return messages as unknown as JsonValue[]
  }
}

export function ambiguousToolRegistry(
  provider: AmbiguousToolProvider,
  options: {
    readonly idempotent?: boolean
    readonly succeedOnRetry?: boolean
    readonly parallelSafe?: boolean
  } = {}
): ToolRegistry {
  const tools = new ToolRegistry()
  for (let index = 0; index < provider.toolCount; index += 1) {
    const suffix = provider.toolCount === 1 ? "" : `_${index + 1}`
    tools.register({
      name: `ambiguous_remote${suffix}`,
      description: "Dispatch an operation whose result may be lost.",
      inputSchema: {
        type: "object",
        required: ["operation"],
        properties: { operation: { type: "string" } }
      },
      risk: "external",
      idempotent: options.idempotent === true,
      concurrency: options.parallelSafe === true ? "parallel_safe" : "exclusive",
      resultMode: "immediate",
      runtimeBinding: createToolRuntimeBinding({
        implementationId: "wanex.coding.test.ambiguous-remote",
        implementationRevision: "1"
      }),
      async invoke(invocation) {
        provider.toolCalls += 1
        if (options.succeedOnRetry === true && provider.toolCalls > 1) {
          return {
            outcome: "succeeded",
            toolCallId: invocation.toolCallId,
            content: jsonToolResultContent({ retried: true })
          }
        }
        return {
          outcome: "ambiguous",
          toolCallId: invocation.toolCallId,
          message: "remote operation result was lost",
          reconciliationRef: `remote-${index + 1}`
        }
      }
    })
  }
  return tools
}

export class ApprovalRequiredWorkspacePolicy implements ToolPermissionPolicy {
  calls = 0
  readonly requested: Promise<void>
  readonly #markRequested: () => void

  constructor() {
    let markRequested!: () => void
    this.requested = new Promise<void>((resolve) => {
      markRequested = resolve
    })
    this.#markRequested = markRequested
  }

  snapshot() {
    return createToolRuntimeBinding({
      implementationId: "wanex.coding.test.approval-policy",
      implementationRevision: "1"
    })
  }

  async authorize(request: ToolPermissionRequest): Promise<ToolPermissionDecision> {
    if (request.descriptor.name !== "workspace_apply_changeset") {
      return { status: "allow", reason: "coding_test_read" }
    }
    this.calls += 1
    this.#markRequested()
    return {
      status: "approval_required",
      reason: "coding_change_review",
      presentation: { summary: "Review Coding changes" }
    }
  }
}

export async function waitForApproval(
  storage: CoreStore,
  turnId: string
): Promise<Awaited<ReturnType<CoreStore["listToolExecutions"]>>[number]> {
  const deadline = Date.now() + 5_000
  for (;;) {
    const approval = (await storage.listToolExecutions({})).find(
      (execution) =>
        execution.turnId === turnId && execution.state === "approval_required"
    )
    if (approval !== undefined) return approval
    if (Date.now() >= deadline) throw new Error("Coding approval was not persisted")
    await new Promise<void>((resolve) => setTimeout(resolve, 5))
  }
}

export async function waitForLeaseExpiry(
  storage: CoreStore & WorkspaceStore,
  runId: string
): Promise<void> {
  const snapshot = await storage.getWorkspaceTaskRun({ runId })
  const leaseExpiresAt = snapshot?.activeAttempt?.leaseExpiresAt
  if (leaseExpiresAt === undefined) {
    throw new Error("coding host recovery fixture has no active lease")
  }
  while (Date.now() <= leaseExpiresAt) {
    await new Promise<void>((resolve) =>
      setTimeout(resolve, leaseExpiresAt - Date.now() + 1)
    )
  }
}

export async function git(
  repositoryRoot: string,
  args: readonly string[]
): Promise<string> {
  const { stdout } = await execFileAsync(
    "git",
    ["-C", repositoryRoot, ...args],
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
  )
  return stdout.trim()
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function hasToolResult(request: ProviderRequest): boolean {
  return request.messages.some((message) =>
    message.content.some((part) => part.type === "tool_result")
  )
}

function requestedTarget(request: ProviderRequest): string {
  const text = request.messages.flatMap((message) => message.content)
    .filter((part): part is Extract<typeof part, { readonly type: "text" }> =>
      part.type === "text"
    )
    .map((part) => part.text)
    .join(" ")
  if (text.includes("alpha")) return "alpha"
  if (text.includes("beta")) return "beta"
  if (text.includes("approved")) return "approved"
  return "change"
}

async function waitForAbort(request: ProviderRequest): Promise<void> {
  await new Promise<void>((resolve) => {
    if (request.signal?.aborted === true) {
      resolve()
      return
    }
    request.signal?.addEventListener("abort", resolve, { once: true })
  })
}
