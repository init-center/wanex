import { execFile } from "node:child_process"
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { afterEach, describe, expect, it } from "vitest"
import { WanexSessionCore } from "@wanex/runtime/sessions"
import { WanexWorker } from "@wanex/runtime/jobs"
import {
  NativeChildSupervisor,
  type ChildSupervisor,
  type ChildTerminalEvidence,
  type ExecutionResult
} from "@wanex/runtime/execution"
import { createStorageTestStore, type StorageTestStore } from "@wanex/storage/testing"
import { WorkspaceGitRuntime } from "../../src/git/index.js"
import { LocalRepositoryLocator } from "../../src/index.js"
import {
  FixedWorkspaceIsolationAdapter,
  GitWorktreeIsolationAdapter,
  type WorkspaceIsolationAdapter,
  type WorkspaceIsolationDurableIdentity,
  type WorkspaceIsolationLease,
  type WorkspaceIsolationRequest
} from "../../src/isolation/index.js"
import {
  registerWorkspaceTaskJobHandler,
  submitWorkspaceTaskJob,
  WorkspaceTaskRuntime
} from "../../src/tasks/index.js"

const execFileAsync = promisify(execFile)
const serviceBin = join(
  import.meta.dirname,
  `../../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)
const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("@wanex/workspace/tasks", () => {
  it("projects writable task edits into one proposal without exposing its lease", async () => {
    const environment = await createRuntime()
    let executionRoot = ""
    const receipt = await environment.runtime.runTask({
      id: "wtsk_success",
      access: "writable",
      input: { prompt: "create src/app.ts" },
      jobId: "job_success",
      agentId: "agent_success",
      handler: async (context) => {
        executionRoot = context.rootDir
        expect(context.access).toBe("writable")
        expect(context.input).toEqual({ prompt: "create src/app.ts" })
        await mkdir(join(context.rootDir, "src"), { recursive: true })
        await writeFile(join(context.rootDir, "src/app.ts"), "after\n", "utf8")
        return {
          artifacts: [
            {
              kindOfOutput: "inline_bytes",
              bytes: new TextEncoder().encode("task log\n"),
              mediaType: "text/plain",
              kind: "log",
              origin: "tool_output",
              label: "task log"
            }
          ],
          summary: "  created app  "
        }
      }
    })

    expect(receipt).toMatchObject({
      taskId: "wtsk_success",
      status: "succeeded",
      access: "writable",
      workspaceId: "workspace_task_test",
      principalId: "principal_task_test",
      summary: "created app",
      changeSet: { currentState: "submitted" },
      proposal: { state: "open", summary: "created app" }
    })
    expect(receipt.proposal?.changeSetId).toBe(receipt.changeSet?.id)
    expect(receipt).not.toHaveProperty("lease")
    expect(receipt).not.toHaveProperty("released")
    expect(JSON.stringify(receipt)).not.toContain(executionRoot)
    expect(receipt.resources).toHaveLength(1)
    await expect(
      readFile(
        join(
          environment.storage.storeDir,
          "files",
          receipt.resources[0]!.logicalPath
        ),
        "utf8"
      )
    ).resolves.toBe("task log\n")
    expect(environment.writableIsolation.releasedIds).toHaveLength(1)
    await expect(stat(executionRoot)).rejects.toMatchObject({ code: "ENOENT" })
    await expect(
      environment.storage.getWorkspaceChangeSet({
        changeSetId: receipt.changeSet!.id
      })
    ).resolves.toMatchObject({ currentState: "submitted" })
    await expect(
      environment.storage.getWorkspaceChangeProposal({
        proposalId: receipt.proposal!.id
      })
    ).resolves.toMatchObject({ state: "open" })
  })

  it("releases read-only isolation when its handler fails", async () => {
    const environment = await createRuntime()
    const receipt = await environment.runtime.runTask({
      id: "wtsk_failure",
      access: "read_only",
      input: null,
      handler: () => {
        throw new Error("handler failed")
      }
    })

    expect(receipt).toMatchObject({
      status: "failed",
      access: "read_only",
      resources: [],
      error: { message: "handler failed", name: "Error" }
    })
    expect(environment.readOnlyIsolation.releasedIds).toHaveLength(1)
    expect(receipt).not.toHaveProperty("lease")
  })

  it("binds supervised child execution to the exact durable task attempt", async () => {
    const environment = await createRuntime({
      childSupervisor: new NativeChildSupervisor({ serviceBin })
    })
    let executionResult: ExecutionResult | undefined
    const receipt = await environment.runtime.runTask({
      id: "wtsk_supervised_child",
      access: "read_only",
      input: null,
      handler: async (context) => {
        expect(context.executionHost).toBeDefined()
        executionResult = await context.executionHost!.execute({
          program: process.execPath,
          args: ["-e", "process.stdout.write('supervised')"],
          cwd: context.rootDir,
          output: { stdoutBytes: 64 }
        })
        return {}
      }
    })

    expect(receipt.status).toBe("succeeded")
    expect(executionResult).toMatchObject({
      termination: "exited",
      cleanup: "completed",
      stdout: { text: "supervised" }
    })
    const attempts = await environment.storage.listWorkspaceTaskAttempts({
      runId: "wtsk_supervised_child"
    })
    expect(attempts).toHaveLength(1)
    expect(JSON.stringify(attempts)).not.toContain("claimToken")
  })

  it("moves a writable task to attention when child cleanup is ambiguous", async () => {
    const environment = await createRuntime({
      childSupervisor: ambiguousChildSupervisor()
    })
    let executionRoot = ""
    const receipt = await environment.runtime.runTask({
      id: "wtsk_ambiguous_cleanup",
      access: "writable",
      input: null,
      handler: async (context) => {
        executionRoot = context.rootDir
        try {
          await context.executionHost!.execute({
            program: process.execPath,
            args: ["-e", "process.exit(0)"],
            cwd: context.rootDir
          })
        } catch {
          // A handler cannot downgrade an unproven process-tree cleanup.
        }
        await writeFile(join(context.rootDir, "must-not-collect.txt"), "unsafe\n")
        return { summary: "must not settle" }
      }
    })

    expect(receipt).toMatchObject({
      status: "failed",
      error: { message: "execution process tree cleanup could not be proven" }
    })
    expect(receipt.changeSet).toBeUndefined()
    expect(receipt.proposal).toBeUndefined()
    expect(environment.writableIsolation.releasedIds).toHaveLength(0)
    await expect(stat(executionRoot)).resolves.toBeDefined()
    const snapshot = await environment.storage.getWorkspaceTaskRun({
      runId: "wtsk_ambiguous_cleanup"
    })
    expect(snapshot).toMatchObject({ run: { state: "attention" } })
    expect(snapshot?.activeAttempt).toBeUndefined()
  })

  it("does not rerun an expired active task and requires attention", async () => {
    const environment = await createRuntime({ leaseMs: 30 })
    await environment.storage.beginWorkspaceTaskRun({
      id: "wtsk_expired_active",
      workspaceId: "workspace_task_test",
      principalId: "principal_task_test",
      access: "read_only",
      repositoryId: "repo_task_test",
      isolationId: "wiso_expired_active",
      attemptId: "wtat_expired_active",
      ownerId: "owner_expired_active",
      claimToken: "expired-active-token-abcdefghijklmnopqrstuvwxyz",
      leaseMs: 30
    })
    await environment.storage.markWorkspaceTaskActive({
      runId: "wtsk_expired_active",
      attemptId: "wtat_expired_active",
      claimToken: "expired-active-token-abcdefghijklmnopqrstuvwxyz"
    })
    await wait(60)

    let handlerCalls = 0
    const recovered = await environment.runtime.recoverTask({
      runId: "wtsk_expired_active"
    })

    expect(recovered).toMatchObject({
      status: "failed",
      error: {
        message:
          "workspace task owner was lost before execution settlement could be proven"
      }
    })
    expect(handlerCalls).toBe(0)
    const snapshot = await environment.storage.getWorkspaceTaskRun({
      runId: "wtsk_expired_active"
    })
    expect(snapshot).toMatchObject({ run: { state: "attention" } })
    expect(snapshot?.activeAttempt).toBeUndefined()
    expect(environment.readOnlyIsolation.releasedIds).toHaveLength(0)
  })

  it("recovers only durable release after a proposal has settled", async () => {
    const environment = await createRuntime({
      leaseMs: 1_000,
      writableReleaseError: true
    })
    let handlerCalls = 0
    const first = await environment.runtime.runTask({
      id: "wtsk_release_recovery",
      access: "writable",
      input: null,
      handler: async (context) => {
        handlerCalls += 1
        await writeFile(join(context.rootDir, "recovery.txt"), "durable\n")
        return { summary: "recover release" }
      }
    })

    expect(first.status).toBe("failed")
    expect(first.proposal).toBeDefined()
    const beforeRecovery = await environment.storage.getWorkspaceTaskRun({
      runId: "wtsk_release_recovery"
    })
    expect(beforeRecovery).toMatchObject({
      run: { state: "releasing", outcome: "proposed" },
      activeAttempt: { state: "active" }
    })
    await wait(1_100)

    const recovered = await environment.runtime.recoverTask({
      runId: "wtsk_release_recovery"
    })

    expect(recovered.status).toBe("succeeded")
    expect(handlerCalls).toBe(1)
    expect(environment.writableIsolation.durableReleasedIds).toHaveLength(1)
    expect(environment.writableIsolation.durableReleasedIds[0]).toMatch(
      /^wiso_[A-Za-z0-9_.:-]+$/
    )
    const afterRecovery = await environment.storage.getWorkspaceTaskRun({
      runId: "wtsk_release_recovery"
    })
    expect(afterRecovery).toMatchObject({
      run: { state: "released", outcome: "proposed" }
    })
    expect(afterRecovery?.activeAttempt).toBeUndefined()
  })

  it("rejects a writable task before execution when Host policy is not a worktree", async () => {
    const environment = await createRuntime()
    let called = false
    const runtime = new WorkspaceTaskRuntime({
      storage: environment.storage,
      readOnlyIsolation: environment.readOnlyIsolation,
      writableIsolation: environment.readOnlyIsolation,
      writableCollection: environment.projection,
      repositoryId: "repo_task_test"
    })
    const receipt = await runtime.runTask({
      id: "wtsk_fixed_write",
      access: "writable",
      input: {},
      handler: () => {
        called = true
        return {}
      }
    })

    expect(called).toBe(false)
    expect(receipt.status).toBe("failed")
    expect(receipt.error?.message).toContain(
      "requires runtime-owned git_worktree isolation"
    )
    expect(environment.readOnlyIsolation.releasedIds).toHaveLength(1)
  })

  it("redacts the isolation path from cleanup failures", async () => {
    const environment = await createRuntime({ readOnlyReleaseError: true })
    const receipt = await environment.runtime.runTask({
      id: "wtsk_release_failure",
      access: "read_only",
      input: {},
      handler: () => ({})
    })

    expect(receipt.status).toBe("failed")
    expect(receipt.error).toMatchObject({
      message: "cleanup failed at <workspace>",
      name: "Error"
    })
    expect(JSON.stringify(receipt)).not.toContain(environment.readOnlyRoot)
    await expect(
      environment.storage.getWorkspaceTaskRun({ runId: "wtsk_release_failure" })
    ).resolves.toMatchObject({
      run: { state: "releasing", outcome: "read_only_completed" },
      activeAttempt: { state: "active" }
    })
  })

  it("stores only opaque references for a durable writable task", async () => {
    const environment = await createRuntime()
    const session = new WanexSessionCore({ storage: environment.storage })
    let executionRoot = ""
    await submitWorkspaceTaskJob(environment.storage, {
      id: "job_workspace_task_success",
      handlerId: "create-file",
      principalId: "principal_task_test",
      access: "writable",
      input: { prompt: "create src/job.ts" },
      taskId: "wtsk_job_success",
      workspaceId: "workspace_task_test",
      agentId: "agent_job"
    })
    const worker = new WanexWorker({
      session,
      workerId: "worker_workspace_task_success",
      leaseMs: 60_000,
      kinds: ["workspace.task"]
    })
    registerWorkspaceTaskJobHandler(worker, {
      runtime: environment.runtime,
      handlers: {
        "create-file": async (context) => {
          executionRoot = context.rootDir
          expect(context.input).toEqual({ prompt: "create src/job.ts" })
          await mkdir(join(context.rootDir, "src"), { recursive: true })
          await writeFile(join(context.rootDir, "src/job.ts"), "job\n", "utf8")
          return {
            artifacts: [
              {
                kindOfOutput: "inline_bytes",
                bytes: new TextEncoder().encode("durable task log\n"),
                mediaType: "text/plain",
                kind: "log",
                origin: "tool_output",
                label: "durable task log"
              }
            ],
            summary: "durable handler completed"
          }
        }
      }
    })

    const result = await worker.runOnce()

    expect(result.status).toBe("completed")
    if (result.status !== "completed") {
      throw new Error("expected completed workspace.task job")
    }
    expect(result.job.result).toMatchObject({
      taskId: "wtsk_job_success",
      status: "succeeded",
      access: "writable",
      workspaceId: "workspace_task_test",
      principalId: "principal_task_test",
      summary: "durable handler completed"
    })
    expect(result.job.result).not.toHaveProperty("lease")
    expect(result.job.result).not.toHaveProperty("released")
    expect(result.job.result).not.toHaveProperty("metadata")
    expect(JSON.stringify(result.job.result)).not.toContain(executionRoot)
    const jobResult = result.job.result as {
      readonly resourceIds: readonly string[]
      readonly changeSetId: string
      readonly proposalId: string
    }
    expect(jobResult.resourceIds).toHaveLength(1)
    await expect(
      environment.storage.getWorkspaceChangeSet({
        changeSetId: jobResult.changeSetId
      })
    ).resolves.toMatchObject({ currentState: "submitted" })
    await expect(
      environment.storage.getWorkspaceChangeProposal({
        proposalId: jobResult.proposalId
      })
    ).resolves.toMatchObject({ changeSetId: jobResult.changeSetId })
    await expect(stat(executionRoot)).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("fails a durable read-only task with a compact error result", async () => {
    const environment = await createRuntime()
    const session = new WanexSessionCore({ storage: environment.storage })
    await submitWorkspaceTaskJob(environment.storage, {
      id: "job_workspace_task_failure",
      handlerId: "fail-task",
      principalId: "principal_task_test",
      access: "read_only",
      input: { prompt: "inspect" },
      taskId: "wtsk_job_failure"
    })
    const worker = new WanexWorker({
      session,
      workerId: "worker_workspace_task_failure",
      leaseMs: 60_000,
      kinds: ["workspace.task"]
    })
    registerWorkspaceTaskJobHandler(worker, {
      runtime: environment.runtime,
      handlers: {
        "fail-task": () => {
          throw new Error("durable handler failed")
        }
      }
    })

    const result = await worker.runOnce()

    expect(result.status).toBe("failed")
    if (result.status !== "failed") {
      throw new Error("expected failed workspace.task job")
    }
    expect(result.job?.lastError).toMatchObject({
      name: "WorkspaceTaskJobFailedError",
      result: {
        taskId: "wtsk_job_failure",
        status: "failed",
        access: "read_only",
        resourceIds: [],
        error: { message: "durable handler failed", name: "Error" }
      }
    })
    expect(result.job?.lastError).not.toHaveProperty("result.lease")
    expect(environment.readOnlyIsolation.releasedIds).toHaveLength(1)
  })

  it("fails a durable task when no handler is registered", async () => {
    const environment = await createRuntime()
    const session = new WanexSessionCore({ storage: environment.storage })
    await submitWorkspaceTaskJob(environment.storage, {
      id: "job_workspace_task_missing_handler",
      handlerId: "missing",
      principalId: "principal_task_test",
      access: "read_only",
      input: null
    })
    const worker = new WanexWorker({
      session,
      workerId: "worker_workspace_task_missing_handler",
      leaseMs: 60_000,
      kinds: ["workspace.task"]
    })
    registerWorkspaceTaskJobHandler(worker, {
      runtime: environment.runtime,
      handlers: {}
    })

    const result = await worker.runOnce()

    expect(result.status).toBe("failed")
    if (result.status !== "failed") {
      throw new Error("expected failed workspace.task job")
    }
    expect(result.job?.lastError).toMatchObject({
      message: "workspace.task handler not registered: missing"
    })
  })

  it("rejects incomplete and legacy durable payloads", async () => {
    const environment = await createRuntime()
    const session = new WanexSessionCore({ storage: environment.storage })
    const worker = new WanexWorker({
      session,
      workerId: "worker_workspace_task_invalid_payload",
      leaseMs: 60_000,
      kinds: ["workspace.task"]
    })
    registerWorkspaceTaskJobHandler(worker, {
      runtime: environment.runtime,
      handlers: { unused: () => ({}) }
    })
    await environment.storage.enqueueJob({
      id: "job_workspace_task_invalid_payload",
      kind: "workspace.task",
      principalId: "principal_task_test",
      payload: { taskId: "wtsk_invalid_payload" }
    })

    const incomplete = await worker.runOnce()
    expect(incomplete.status).toBe("failed")
    if (incomplete.status !== "failed") {
      throw new Error("expected invalid workspace.task payload to fail")
    }
    expect(incomplete.job?.lastError).toMatchObject({
      message: "workspace.task.handlerId must be a string"
    })

    await environment.storage.enqueueJob({
      id: "job_workspace_task_legacy_payload",
      kind: "workspace.task",
      principalId: "principal_task_test",
      payload: {
        handlerId: "unused",
        access: "read_only",
        input: null,
        keepLease: true
      }
    })
    const legacy = await worker.runOnce()
    expect(legacy.status).toBe("failed")
    if (legacy.status !== "failed") {
      throw new Error("expected legacy workspace.task payload to fail")
    }
    expect(legacy.job?.lastError).toMatchObject({
      message: "workspace.task payload contains unsupported field: keepLease"
    })
  })

  it("does not create an empty proposal when a writable task changes nothing", async () => {
    const environment = await createRuntime()
    const receipt = await environment.runtime.runTask({
      id: "wtsk_no_changes",
      access: "writable",
      input: {},
      handler: () => ({ summary: "inspected repository" })
    })

    expect(receipt).toMatchObject({
      status: "succeeded",
      access: "writable",
      summary: "inspected repository"
    })
    expect(receipt.changeSet).toBeUndefined()
    expect(receipt.proposal).toBeUndefined()
    expect(environment.writableIsolation.releasedIds).toHaveLength(1)
  })

  it("preserves classifiable partial edits when writable execution fails", async () => {
    const environment = await createRuntime()
    const receipt = await environment.runtime.runTask({
      id: "wtsk_partial_failure",
      access: "writable",
      input: { prompt: "edit then fail" },
      handler: async (context) => {
        await writeFile(join(context.rootDir, "README.md"), "partial\n", "utf8")
        throw new Error("execution stopped")
      }
    })

    expect(receipt).toMatchObject({
      status: "failed",
      error: { message: "execution stopped" },
      changeSet: { currentState: "submitted" },
      proposal: {
        state: "open",
        metadata: { executionOutcome: "failed", incomplete: true }
      }
    })
    const snapshot = await environment.storage.getWorkspaceTaskRun({
      runId: "wtsk_partial_failure"
    })
    expect(snapshot).toMatchObject({
      run: {
        state: "released",
        executionOutcome: "failed",
        outcome: "proposed"
      }
    })
  })
})

async function createRuntime(options: {
  readonly readOnlyReleaseError?: boolean
  readonly writableReleaseError?: boolean
  readonly leaseMs?: number
  readonly childSupervisor?: ChildSupervisor
} = {}): Promise<{
  readonly storage: StorageTestStore
  readonly runtime: WorkspaceTaskRuntime
  readonly projection: WorkspaceGitRuntime
  readonly readOnlyRoot: string
  readonly readOnlyIsolation: RecordingIsolationAdapter
  readonly writableIsolation: RecordingIsolationAdapter
}> {
  const storeDir = await tempDir("wanex-workspace-task-store-")
  const repoDir = await createRepo()
  const worktreeParentDir = await tempDir("wanex-workspace-task-worktrees-")
  const readOnlyRoot = await tempDir("wanex-workspace-task-read-only-")
  const storage = createStorageTestStore({
    kind: "local-system-service",
    mode: "oneshot",
    storeDir,
    serviceBin
  })
  const readOnlyIsolation = new RecordingIsolationAdapter(
    new FixedWorkspaceIsolationAdapter({ rootDir: readOnlyRoot }),
    options.readOnlyReleaseError === true
  )
  const locator = new LocalRepositoryLocator({
    repositories: [{
      repositoryId: "repo_task_test",
      repositoryRoot: repoDir,
      worktreeParent: worktreeParentDir,
      serviceBin
    }]
  })
  const writableIsolation = new RecordingIsolationAdapter(
    new GitWorktreeIsolationAdapter({
      repositoryId: "repo_task_test",
      locator
    }),
    options.writableReleaseError === true
  )
  const projection = new WorkspaceGitRuntime({
    repositoryId: "repo_task_test",
    locator
  })
  const runtime = new WorkspaceTaskRuntime({
    storage,
    readOnlyIsolation,
    writableIsolation,
    writableCollection: projection,
    repositoryId: "repo_task_test",
    workspaceId: "workspace_task_test",
    principalId: "principal_task_test",
    ...(options.leaseMs === undefined ? {} : { leaseMs: options.leaseMs }),
    ...(options.childSupervisor === undefined
      ? {}
      : { childSupervisor: options.childSupervisor })
  })
  return {
    storage,
    runtime,
    projection,
    readOnlyRoot,
    readOnlyIsolation,
    writableIsolation
  }
}

class RecordingIsolationAdapter implements WorkspaceIsolationAdapter {
  readonly releasedIds: string[] = []
  readonly durableReleasedIds: string[] = []
  private releaseFailurePending: boolean

  constructor(
    private readonly delegate: WorkspaceIsolationAdapter,
    private readonly failRelease = false
  ) {
    this.releaseFailurePending = failRelease
  }

  async prepare(request: WorkspaceIsolationRequest = {}): Promise<WorkspaceIsolationLease> {
    return await this.delegate.prepare(request)
  }

  async release(lease: WorkspaceIsolationLease): Promise<void> {
    this.releasedIds.push(lease.id)
    if (this.releaseFailurePending) {
      this.releaseFailurePending = false
      throw new Error(`cleanup failed at ${lease.rootDir}`)
    }
    await this.delegate.release(lease)
  }

  async releaseDurable(identity: WorkspaceIsolationDurableIdentity): Promise<void> {
    this.durableReleasedIds.push(identity.id)
    await this.delegate.releaseDurable(identity)
  }
}

function ambiguousChildSupervisor(): ChildSupervisor {
  return {
    async start(): Promise<{
      readonly wait: () => Promise<ChildTerminalEvidence>
      readonly terminate: () => Promise<void>
    }> {
      return {
        async wait() {
          return {
            exitCode: 0,
            signal: null,
            termination: "exited",
            cleanup: "ambiguous",
            cleanupError: "test-only ambiguous cleanup",
            stdout: emptyOutput(),
            stderr: emptyOutput()
          }
        },
        async terminate() {}
      }
    }
  }
}

function emptyOutput() {
  return {
    bytes: new Uint8Array(),
    text: "",
    observedBytes: 0,
    retainedBytes: 0,
    truncated: false
  }
}

async function createRepo(): Promise<string> {
  const repoDir = await tempDir("wanex-workspace-task-repo-")
  await git(repoDir, ["init"])
  await git(repoDir, ["config", "user.email", "wanex@example.local"])
  await git(repoDir, ["config", "user.name", "Wanex Test"])
  await git(repoDir, ["config", "core.autocrlf", "false"])
  await writeFile(join(repoDir, "README.md"), "base\n", "utf8")
  await git(repoDir, ["add", "README.md"])
  await git(repoDir, ["commit", "-m", "initial"])
  return repoDir
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

async function git(repoDir: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", repoDir, ...args], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  })
  return stdout.trim()
}

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}
