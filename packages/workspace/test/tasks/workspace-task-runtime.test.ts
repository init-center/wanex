import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { WanexSessionCore } from "@wanex/runtime/sessions"
import { createStorageTestStore, type StorageTestStore } from "@wanex/storage/testing"
import { WanexWorker } from "@wanex/runtime/jobs"
import {
  type WorkspaceIsolationAdapter,
  type WorkspaceIsolationLease,
  type WorkspaceIsolationRequest
} from "../../src/isolation/index.js"
import {
  registerWorkspaceTaskJobHandler,
  submitWorkspaceTaskJob,
  WorkspaceTaskRuntime
} from "../../src/tasks/index.js"

const serviceBin = join(
  import.meta.dirname,
  "../../../../target/debug/wanex-system-service"
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
  it("runs a task, ingests artifacts, persists a proposed changeset, and releases the lease", async () => {
    const { runtime, storage, isolation } = await createRuntime()
    const receipt = await runtime.runTask({
      id: "wtsk_success",
      jobId: "job_success",
      agentId: "agent_success",
      handler: async (context) => {
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
          changeSet: {
            id: "cs_task_proposal",
            title: "Task proposal",
            changes: [
              {
                path: "src/app.ts",
                kind: "create",
                targetText: "after\n"
              }
            ]
          },
          metadata: {
            summary: "created app"
          }
        }
      }
    })

    expect(receipt).toMatchObject({
      taskId: "wtsk_success",
      status: "succeeded",
      workspaceId: "workspace_task_test",
      principalId: "principal_task_test",
      released: true,
      metadata: {
        summary: "created app"
      }
    })
    expect(receipt.lease.jobId).toBe("job_success")
    expect(receipt.lease.agentId).toBe("agent_success")
    expect(receipt.resources).toHaveLength(1)
    expect(receipt.resources[0]).toMatchObject({
      kind: "log",
      origin: "tool_output",
      mediaType: "text/plain",
      label: "task log"
    })
    await expect(
      readFile(
        join(storage.storeDir, "files", receipt.resources[0]!.logicalPath),
        "utf8"
      )
    ).resolves.toBe("task log\n")
    expect(receipt.changeSet).toMatchObject({
      id: "cs_task_proposal",
      workspaceId: "workspace_task_test",
      principalId: "principal_task_test",
      currentState: "submitted"
    })
    await expect(storage.getWorkspaceChangeSet({
      changeSetId: "cs_task_proposal"
    })).resolves.toMatchObject({
      id: "cs_task_proposal",
      currentState: "submitted"
    })
    expect(isolation.releasedIds).toEqual([receipt.lease.id])
    await expect(stat(receipt.lease.rootDir)).rejects.toMatchObject({
      code: "ENOENT"
    })
  })

  it("releases the lease when the handler fails", async () => {
    const { runtime, isolation } = await createRuntime()

    const receipt = await runtime.runTask({
      id: "wtsk_failure",
      handler: () => {
        throw new Error("handler failed")
      }
    })

    expect(receipt.status).toBe("failed")
    expect(receipt.error).toMatchObject({
      message: "handler failed",
      name: "Error"
    })
    expect(receipt.released).toBe(true)
    expect(receipt.resources).toHaveLength(0)
    expect(isolation.releasedIds).toEqual([receipt.lease.id])
  })

  it("keeps the lease when requested", async () => {
    const { runtime, isolation } = await createRuntime()

    const receipt = await runtime.runTask({
      id: "wtsk_keep",
      keepLease: true,
      handler: async (context) => {
        await writeFile(join(context.rootDir, "kept.txt"), "kept\n", "utf8")
        return {}
      }
    })

    expect(receipt.status).toBe("succeeded")
    expect(receipt.released).toBe(false)
    expect(isolation.releasedIds).toEqual([])
    await expect(readFile(join(receipt.lease.rootDir, "kept.txt"), "utf8"))
      .resolves.toBe("kept\n")
  })

  it("reports release failures instead of hiding cleanup errors", async () => {
    const { runtime } = await createRuntime({
      releaseError: new Error("cleanup failed")
    })

    const receipt = await runtime.runTask({
      id: "wtsk_release_failure",
      handler: () => ({})
    })

    expect(receipt.status).toBe("failed")
    expect(receipt.released).toBe(false)
    expect(receipt.error).toMatchObject({
      message: "cleanup failed",
      name: "Error"
    })
  })

  it("executes a durable workspace.task job and stores compact references", async () => {
    const { runtime, storage, isolation } = await createRuntime()
    const session = new WanexSessionCore({ storage })
    await submitWorkspaceTaskJob(storage, {
      id: "job_workspace_task_success",
      handlerId: "create-file",
      principalId: "principal_task_test",
      taskId: "wtsk_job_success",
      workspaceId: "workspace_task_test",
      agentId: "agent_job",
      metadata: {
        request: "durable"
      }
    })
    const worker = new WanexWorker({
      session,
      workerId: "worker_workspace_task_success",
      leaseMs: 60_000,
      kinds: ["workspace.task"]
    })
    registerWorkspaceTaskJobHandler(worker, {
      runtime,
      handlers: {
        "create-file": async (context) => {
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
            changeSet: {
              id: "cs_workspace_task_job",
              title: "Workspace task job proposal",
              changes: [
                {
                  path: "src/job.ts",
                  kind: "create",
                  targetText: "job\n"
                }
              ]
            },
            metadata: {
              summary: "durable handler completed"
            }
          }
        }
      }
    })

    const result = await worker.runOnce()

    expect(result.status).toBe("completed")
    if (result.status !== "completed") {
      throw new Error("expected completed workspace.task job")
    }
    expect(result.job.kind).toBe("workspace.task")
    expect(result.job.state).toBe("succeeded")
    expect(result.job.lastError).toBeUndefined()
    expect(result.job.result).toMatchObject({
      taskId: "wtsk_job_success",
      status: "succeeded",
      workspaceId: "workspace_task_test",
      principalId: "principal_task_test",
      released: true,
      changeSetId: "cs_workspace_task_job",
      metadata: {
        summary: "durable handler completed"
      }
    })
    const jobResult = result.job.result as {
      readonly resourceIds: readonly string[]
      readonly lease: { readonly id: string; readonly rootDir: string }
    }
    expect(jobResult.resourceIds).toHaveLength(1)
    expect(isolation.releasedIds).toEqual([jobResult.lease.id])
    await expect(storage.getWorkspaceChangeSet({
      changeSetId: "cs_workspace_task_job"
    })).resolves.toMatchObject({
      id: "cs_workspace_task_job",
      currentState: "submitted"
    })
    await expect(stat(jobResult.lease.rootDir)).rejects.toMatchObject({
      code: "ENOENT"
    })
  })

  it("fails a durable workspace.task job when the registered handler fails", async () => {
    const { runtime, storage, isolation } = await createRuntime()
    const session = new WanexSessionCore({ storage })
    await submitWorkspaceTaskJob(storage, {
      id: "job_workspace_task_failure",
      handlerId: "fail-task",
      principalId: "principal_task_test",
      taskId: "wtsk_job_failure"
    })
    const worker = new WanexWorker({
      session,
      workerId: "worker_workspace_task_failure",
      leaseMs: 60_000,
      kinds: ["workspace.task"]
    })
    registerWorkspaceTaskJobHandler(worker, {
      runtime,
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
    expect(result.job?.state).toBe("failed")
    expect(result.job?.lastError).toMatchObject({
      name: "WorkspaceTaskJobFailedError",
      result: {
        taskId: "wtsk_job_failure",
        status: "failed",
        released: true,
        resourceIds: [],
        error: {
          message: "durable handler failed",
          name: "Error"
        }
      }
    })
    const taskResult = result.job?.lastError as {
      readonly result?: { readonly lease?: { readonly id?: string } }
    }
    expect(isolation.releasedIds).toEqual([taskResult.result?.lease?.id])
  })

  it("fails a durable workspace.task job when no handler is registered", async () => {
    const { runtime, storage } = await createRuntime()
    const session = new WanexSessionCore({ storage })
    await submitWorkspaceTaskJob(storage, {
      id: "job_workspace_task_missing_handler",
      handlerId: "missing",
      principalId: "principal_task_test"
    })
    const worker = new WanexWorker({
      session,
      workerId: "worker_workspace_task_missing_handler",
      leaseMs: 60_000,
      kinds: ["workspace.task"]
    })
    registerWorkspaceTaskJobHandler(worker, {
      runtime,
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

  it("fails a durable workspace.task job with invalid payload", async () => {
    const { runtime, storage } = await createRuntime()
    const session = new WanexSessionCore({ storage })
    await storage.enqueueJob({
      id: "job_workspace_task_invalid_payload",
      kind: "workspace.task",
      principalId: "principal_task_test",
      payload: {
        taskId: "wtsk_invalid_payload"
      }
    })
    const worker = new WanexWorker({
      session,
      workerId: "worker_workspace_task_invalid_payload",
      leaseMs: 60_000,
      kinds: ["workspace.task"]
    })
    registerWorkspaceTaskJobHandler(worker, {
      runtime,
      handlers: {
        unused: () => ({})
      }
    })

    const result = await worker.runOnce()

    expect(result.status).toBe("failed")
    if (result.status !== "failed") {
      throw new Error("expected failed workspace.task job")
    }
    expect(result.job?.state).toBe("failed")
    expect(result.job?.lastError).toMatchObject({
      message: "workspace.task.handlerId must be a string"
    })
  })

  it("keeps the lease for a durable workspace.task job when requested", async () => {
    const { runtime, storage, isolation } = await createRuntime()
    const session = new WanexSessionCore({ storage })
    await submitWorkspaceTaskJob(storage, {
      id: "job_workspace_task_keep",
      handlerId: "keep-task",
      principalId: "principal_task_test",
      taskId: "wtsk_job_keep",
      keepLease: true
    })
    const worker = new WanexWorker({
      session,
      workerId: "worker_workspace_task_keep",
      leaseMs: 60_000,
      kinds: ["workspace.task"]
    })
    registerWorkspaceTaskJobHandler(worker, {
      runtime,
      handlers: {
        "keep-task": async (context) => {
          await writeFile(join(context.rootDir, "kept-job.txt"), "kept\n", "utf8")
          return {}
        }
      }
    })

    const result = await worker.runOnce()

    expect(result.status).toBe("completed")
    if (result.status !== "completed") {
      throw new Error("expected completed workspace.task job")
    }
    expect(result.job.result).toMatchObject({
      taskId: "wtsk_job_keep",
      status: "succeeded",
      released: false
    })
    const jobResult = result.job.result as {
      readonly lease: { readonly rootDir: string }
    }
    expect(isolation.releasedIds).toEqual([])
    await expect(readFile(join(jobResult.lease.rootDir, "kept-job.txt"), "utf8"))
      .resolves.toBe("kept\n")
  })
})

async function createRuntime(options: {
  readonly releaseError?: Error
} = {}): Promise<{
  readonly storage: StorageTestStore
  readonly isolation: TrackingIsolationAdapter
  readonly runtime: WorkspaceTaskRuntime
}> {
  const storeDir = await tempDir("wanex-workspace-task-store-")
  const rootParent = await tempDir("wanex-workspace-task-root-")
  const storage = createStorageTestStore({ kind: "local-system-service", mode: "oneshot",
    storeDir,
    serviceBin
  })
  const isolation = new TrackingIsolationAdapter(rootParent, options.releaseError)
  const runtime = new WorkspaceTaskRuntime({
    storage,
    isolation,
    workspaceId: "workspace_task_test",
    principalId: "principal_task_test"
  })
  return { storage, isolation, runtime }
}

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

class TrackingIsolationAdapter implements WorkspaceIsolationAdapter {
  readonly releasedIds: string[] = []
  private next = 0

  constructor(
    private readonly rootParent: string,
    private readonly releaseError?: Error
  ) {}

  async prepare(
    request: WorkspaceIsolationRequest = {}
  ): Promise<WorkspaceIsolationLease> {
    this.next += 1
    const id = `lease_${this.next}`
    const rootDir = join(this.rootParent, id)
    await mkdir(rootDir, { recursive: true })
    return {
      id,
      kind: "fixed",
      rootDir,
      createdAt: Date.now(),
      releasePolicy: request.releasePolicy ?? "remove",
      ...(request.workspaceId === undefined
        ? {}
        : { workspaceId: request.workspaceId }),
      ...(request.jobId === undefined ? {} : { jobId: request.jobId }),
      ...(request.agentId === undefined ? {} : { agentId: request.agentId }),
      ...(request.metadata === undefined ? {} : { metadata: request.metadata })
    }
  }

  async release(lease: WorkspaceIsolationLease): Promise<void> {
    if (this.releaseError !== undefined) {
      throw this.releaseError
    }
    this.releasedIds.push(lease.id)
    await rm(lease.rootDir, { recursive: true, force: true })
  }
}
