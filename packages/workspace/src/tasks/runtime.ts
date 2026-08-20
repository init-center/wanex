import { createHash, randomBytes, randomUUID } from "node:crypto"
import type { ResourceRecord } from "@wanex/protocol"
import { WanexResourceRuntime } from "@wanex/runtime/resources"
import { NodeExecutionHost } from "@wanex/runtime/execution"
import type {
  WorkspaceIsolationAdapter,
  WorkspaceIsolationLease
} from "../isolation/index.js"
import { ingestWorkspaceTaskArtifacts } from "./artifacts.js"
import { WorkspaceTaskExecutionGuard } from "./execution.js"
import { isolationRequestForTask } from "./isolation.js"
import {
  combineWorkspaceTaskErrors,
  releaseWorkspaceTaskLease,
  serializeWorkspaceTaskError,
  workspaceTaskFailureJson,
  workspaceTaskReceiptFromSnapshot,
  withOptionalReceiptFields
} from "./receipt.js"
import { recoverWorkspaceTask } from "./recovery.js"
import { WorkspaceTaskLeaseRenewal } from "./renewal.js"
import type { WorkspaceTaskStore } from "./storage.js"
import type {
  WorkspaceTaskContext,
  WorkspaceTaskError,
  WorkspaceTaskHandlerResult,
  RecoverWorkspaceTaskRequest,
  WorkspaceTaskReceipt,
  WorkspaceTaskRequest,
  WorkspaceTaskRuntimeOptions
} from "./types.js"

const DEFAULT_WORKSPACE_ID = "local"
const DEFAULT_PRINCIPAL_ID = "workspace-tasks"
const DEFAULT_LEASE_MS = 60_000
const MAX_SUMMARY_LENGTH = 4_000

export class WorkspaceTaskRuntime {
  private readonly storage: WorkspaceTaskStore
  private readonly readOnlyIsolation: WorkspaceIsolationAdapter
  private readonly writableIsolation: WorkspaceIsolationAdapter
  private readonly writableCollection: WorkspaceTaskRuntimeOptions["writableCollection"]
  private readonly resourceRuntime: WanexResourceRuntime
  private readonly repositoryId: string
  private readonly ownerId: string
  private readonly leaseMs: number
  private readonly defaultWorkspaceId: string
  private readonly defaultPrincipalId: string
  private readonly childSupervisor: WorkspaceTaskRuntimeOptions["childSupervisor"]

  constructor(options: WorkspaceTaskRuntimeOptions) {
    this.storage = options.storage
    this.readOnlyIsolation = options.readOnlyIsolation
    this.writableIsolation = options.writableIsolation
    this.writableCollection = options.writableCollection
    this.resourceRuntime = new WanexResourceRuntime({ storage: options.storage })
    this.repositoryId = requireOpaqueId(options.repositoryId, "repositoryId")
    this.ownerId = options.ownerId ?? DEFAULT_PRINCIPAL_ID
    this.leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS
    if (this.leaseMs < 30 || this.leaseMs > 300_000) {
      throw new Error("workspace task leaseMs must be between 30 and 300000")
    }
    this.defaultWorkspaceId = options.workspaceId ?? DEFAULT_WORKSPACE_ID
    this.defaultPrincipalId = options.principalId ?? DEFAULT_PRINCIPAL_ID
    this.childSupervisor = options.childSupervisor
  }

  async runTask(request: WorkspaceTaskRequest): Promise<WorkspaceTaskReceipt> {
    const taskId = request.id ?? `wtsk_${randomUUID().replaceAll("-", "")}`
    const workspaceId = request.workspaceId ?? this.defaultWorkspaceId
    const principalId = request.principalId ?? this.defaultPrincipalId
    const isolationId = isolationIdFor(this.repositoryId, taskId)
    const attemptId = `wtat_${randomUUID().replaceAll("-", "")}`
    const claimToken = randomBytes(32).toString("hex")
    const identity = { runId: taskId, attemptId, claimToken }
    const claim = await this.storage.beginWorkspaceTaskRun({
      id: taskId,
      workspaceId,
      principalId,
      access: request.access,
      repositoryId: this.repositoryId,
      isolationId,
      attemptId,
      ownerId: this.ownerId,
      claimToken,
      leaseMs: this.leaseMs
    })
    if (claim.status === "already_terminal") {
      return await workspaceTaskReceiptFromSnapshot(this.storage, claim.snapshot)
    }
    if (claim.status !== "claimed") {
      return failedReceipt({
        taskId,
        access: request.access,
        workspaceId,
        principalId,
        error: { message: "workspace task is already active" }
      })
    }

    const renewal = new WorkspaceTaskLeaseRenewal({
      storage: this.storage,
      identity,
      leaseMs: this.leaseMs
    })
    renewal.start()
    const isolation =
      request.access === "writable"
        ? this.writableIsolation
        : this.readOnlyIsolation
    let lease: WorkspaceIsolationLease
    try {
      lease = await isolation.prepare(
        isolationRequestForTask(request, {
          taskId,
          isolationId,
          workspaceId,
          principalId
        })
      )
      if (lease.id !== isolationId) {
        throw new Error("workspace isolation adapter changed the durable isolation identity")
      }
      if (request.access === "writable" && lease.kind !== "git_worktree") {
        await isolation.release(lease)
        throw new Error(
          `writable workspace task requires runtime-owned git_worktree isolation: ${lease.kind}`
        )
      }
      renewal.assertHealthy()
      await this.storage.markWorkspaceTaskActive({
        ...identity,
        ...(lease.baseRevision === undefined
          ? {}
          : { baseRevision: lease.baseRevision }),
        ...(lease.branchName === undefined ? {} : { runtimeRef: lease.branchName })
      })
    } catch (error) {
      const taskError = serializeWorkspaceTaskError(error)
      await markAttentionBestEffort(this.storage, identity, taskError)
      renewal.stop()
      return failedReceipt({
        taskId,
        access: request.access,
        workspaceId,
        principalId,
        error: taskError
      })
    }

    const executionGuard =
      this.childSupervisor === undefined
        ? undefined
        : new WorkspaceTaskExecutionGuard(
            new NodeExecutionHost({
              childSupervisor: this.childSupervisor,
              supervisorClaim: identity
            })
          )
    const context: WorkspaceTaskContext = {
      taskId,
      workspaceId,
      principalId,
      access: request.access,
      input: request.input,
      rootDir: lease.rootDir,
      ...(executionGuard === undefined ? {} : { executionHost: executionGuard })
    }
    let handlerResult: WorkspaceTaskHandlerResult = {}
    let handlerError: WorkspaceTaskError | undefined
    let resources: readonly ResourceRecord[] = []
    try {
      handlerResult = await request.handler(context)
      executionGuard?.assertCleanupProven()
      resources = await ingestWorkspaceTaskArtifacts(
        this.resourceRuntime,
        handlerResult.artifacts ?? []
      )
      renewal.assertHealthy()
    } catch (error) {
      handlerError = serializeWorkspaceTaskError(error, [lease.rootDir])
    }

    try {
      executionGuard?.assertCleanupProven()
    } catch (error) {
      const cleanupError = serializeWorkspaceTaskError(error, [lease.rootDir])
      await markAttentionBestEffort(this.storage, identity, cleanupError)
      renewal.stop()
      return failedReceipt({
        taskId,
        access: request.access,
        workspaceId,
        principalId,
        error: cleanupError
      })
    }

    let summary: string | undefined
    try {
      summary = normalizeSummary(handlerResult.summary)
      await this.storage.beginWorkspaceTaskCollection({
        ...identity,
        executionOutcome: handlerError === undefined ? "completed" : "failed",
        ...(summary === undefined ? {} : { summary }),
        resourceIds: resources.map((resource) => resource.id),
        ...(handlerError === undefined
          ? {}
          : { failure: workspaceTaskFailureJson(handlerError) })
      })
      if (request.access === "writable") {
        const ids = projectionIds(workspaceId, taskId)
        const collection = await this.writableCollection.collectWorktree({
          lease,
          changeSetId: ids.changeSetId
        })
        if (collection.status === "changes") {
          await this.storage.finalizeWorkspaceTaskCollection({
            ...identity,
            outcome: "proposed",
            changeSet: collection.changeSet,
            proposalId: ids.proposalId,
            ...(summary === undefined ? {} : { title: summary }),
            ...(handlerError === undefined
              ? {}
              : {
                  proposalMetadata: {
                    executionOutcome: "failed",
                    incomplete: true
                  }
                })
          })
          await this.storage.beginWorkspaceTaskRelease(identity)
        } else {
          await this.storage.finalizeWorkspaceTaskCollection({
            ...identity,
            outcome: handlerError === undefined ? "no_changes" : "execution_failed"
          })
        }
      } else {
        await this.storage.finalizeWorkspaceTaskCollection({
          ...identity,
          outcome:
            handlerError === undefined
              ? "read_only_completed"
              : "execution_failed"
        })
      }
      renewal.assertHealthy()
    } catch (error) {
      const collectionError = serializeWorkspaceTaskError(error, [lease.rootDir])
      await markAttentionBestEffort(this.storage, identity, collectionError)
      renewal.stop()
      return withOptionalReceiptFields(
        {
          taskId,
          status: "failed",
          access: request.access,
          workspaceId,
          principalId,
          resources
        },
        {
          summary,
          error:
            handlerError === undefined
              ? collectionError
              : combineWorkspaceTaskErrors(handlerError, collectionError)
        }
      )
    }

    const release = await releaseWorkspaceTaskLease(isolation, lease)
    let releaseError = release.error
    if (releaseError === undefined) {
      try {
        renewal.assertHealthy()
        await this.storage.finalizeWorkspaceTaskRelease(identity)
      } catch (error) {
        releaseError = serializeWorkspaceTaskError(error, [lease.rootDir])
      }
    }
    renewal.stop()
    const snapshot = await this.storage.getWorkspaceTaskRun({ runId: taskId })
    if (snapshot === null) {
      throw new Error(`workspace task run disappeared: ${taskId}`)
    }
    const records = await this.linkedRecords(snapshot)
    const error =
      handlerError === undefined
        ? releaseError
        : releaseError === undefined
          ? handlerError
          : combineWorkspaceTaskErrors(handlerError, releaseError)
    return withOptionalReceiptFields(
      {
        taskId,
        status: error === undefined ? "succeeded" : "failed",
        access: request.access,
        workspaceId,
        principalId,
        resources
      },
      { ...records, summary, error }
    )
  }

  async recoverTask(
    request: RecoverWorkspaceTaskRequest
  ): Promise<WorkspaceTaskReceipt> {
    return await recoverWorkspaceTask(
      {
        storage: this.storage,
        readOnlyIsolation: this.readOnlyIsolation,
        writableIsolation: this.writableIsolation,
        repositoryId: this.repositoryId,
        ownerId: this.ownerId,
        leaseMs: this.leaseMs
      },
      request
    )
  }

  private async linkedRecords(snapshot: import("@wanex/protocol").WorkspaceTaskRunSnapshot) {
    const changeSet =
      snapshot.run.changeSetId === undefined
        ? undefined
        : (await this.storage.getWorkspaceChangeSet({
            changeSetId: snapshot.run.changeSetId
          })) ?? undefined
    const proposal =
      snapshot.run.proposalId === undefined
        ? undefined
        : (await this.storage.getWorkspaceChangeProposal({
            proposalId: snapshot.run.proposalId
          })) ?? undefined
    return { changeSet, proposal }
  }
}

function projectionIds(
  workspaceId: string,
  taskId: string
): { readonly changeSetId: string; readonly proposalId: string } {
  const digest = createHash("sha256")
    .update(workspaceId)
    .update("\0")
    .update(taskId)
    .digest("hex")
    .slice(0, 32)
  return {
    changeSetId: `wcs_task_${digest}`,
    proposalId: `wcp_task_${digest}`
  }
}

function isolationIdFor(repositoryId: string, taskId: string): string {
  return `wiso_${createHash("sha256")
    .update(repositoryId)
    .update("\0")
    .update(taskId)
    .digest("hex")
    .slice(0, 32)}`
}

function normalizeSummary(summary: string | undefined): string | undefined {
  if (summary === undefined) {
    return undefined
  }
  const normalized = summary.trim()
  if (normalized.length === 0) {
    return undefined
  }
  if (normalized.length > MAX_SUMMARY_LENGTH) {
    throw new Error(
      `workspace task summary exceeds ${MAX_SUMMARY_LENGTH} characters`
    )
  }
  return normalized
}

async function markAttentionBestEffort(
  storage: WorkspaceTaskStore,
  identity: {
    readonly runId: string
    readonly attemptId: string
    readonly claimToken: string
  },
  error: WorkspaceTaskError
): Promise<void> {
  try {
    await storage.markWorkspaceTaskAttention({
      ...identity,
      failure: workspaceTaskFailureJson(
        error,
        "workspace_task.recovery_required"
      )
    })
  } catch {
    // Ownership may already have moved; a fenced worker must not retry writes.
  }
}

function failedReceipt(input: {
  readonly taskId: string
  readonly access: WorkspaceTaskRequest["access"]
  readonly workspaceId: string
  readonly principalId: string
  readonly error: WorkspaceTaskError
}): WorkspaceTaskReceipt {
  return { ...input, status: "failed", resources: [] }
}

function requireOpaqueId(value: string, label: string): string {
  if (!/^[A-Za-z0-9_.:-]{1,256}$/.test(value)) {
    throw new Error(`${label} must be an opaque identifier`)
  }
  return value
}
