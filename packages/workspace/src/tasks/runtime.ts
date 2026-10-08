import { createHash, randomBytes, randomUUID } from "node:crypto"
import type { ResourceRecord, WorkspaceTaskRunSnapshot } from "@wanex/protocol"
import { WanexResourceRuntime } from "@wanex/runtime/resources"
import {
  assertExecutionEnvironmentBindingEqual,
  type ExecutionScope
} from "@wanex/runtime/execution"
import type {
  WorkspaceIsolationAdapter,
  WorkspaceIsolationLease
} from "../isolation/index.js"
import { ingestWorkspaceTaskArtifacts } from "./artifacts.js"
import { WorkspaceTaskExecutionGuard, assertNotCancelled, combineTaskSignals } from "./execution.js"
import { isolationRequestForTask } from "./isolation.js"
import { assertTaskRuntimeIdentity, freezeTaskRootIdentity, sameTaskRoot, taskIsolationIdentity } from "./identity.js"
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
import { projectionAttentionToJson } from "../git/projection.js"
import { recoverExpiredWorkspaceTasks } from "./recovery-admission.js"
import type { WorkspaceTaskStore } from "./storage.js"
import { WorkspaceTaskAttentionError } from "./types.js"
import type {
  WorkspaceTaskContext,
  WorkspaceTaskError,
  WorkspaceTaskHandlerResult,
  RecoverWorkspaceTaskRequest,
  ResumeWorkspaceTaskRequest,
  WorkspaceTaskReceipt,
  WorkspaceTaskRecoveryAdmissionRequest,
  WorkspaceTaskRecoveryAdmissionResult,
  WorkspaceTaskRequest,
  WorkspaceTaskRuntimeOptions
} from "./types.js"

const DEFAULT_WORKSPACE_ID = "local"
const DEFAULT_PRINCIPAL_ID = "workspace-tasks"
const DEFAULT_LEASE_MS = 60_000
const MAX_SUMMARY_LENGTH = 4_000

export class WorkspaceTaskRuntime {
  private readonly storage: WorkspaceTaskStore
  private readonly directIsolation: WorkspaceIsolationAdapter
  private readonly gitWorktree: WorkspaceTaskRuntimeOptions["gitWorktree"]
  private readonly rootIdentity: WorkspaceTaskRuntimeOptions["rootIdentity"]
  private readonly resourceRuntime: WanexResourceRuntime
  private readonly ownerId: string
  private readonly leaseMs: number
  private readonly defaultWorkspaceId: string
  private readonly defaultPrincipalId: string
  private readonly executionEnvironment: WorkspaceTaskRuntimeOptions["executionEnvironment"]

  constructor(options: WorkspaceTaskRuntimeOptions) {
    this.storage = options.storage
    this.directIsolation = options.directIsolation
    this.gitWorktree = options.gitWorktree === undefined ? undefined : Object.freeze({ ...options.gitWorktree })
    this.rootIdentity = freezeTaskRootIdentity(options.rootIdentity)
    this.resourceRuntime = new WanexResourceRuntime({ storage: options.storage })
    this.ownerId = options.ownerId ?? DEFAULT_PRINCIPAL_ID
    this.leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS
    if (this.leaseMs < 30 || this.leaseMs > 300_000) {
      throw new Error("workspace task leaseMs must be between 30 and 300000")
    }
    this.defaultWorkspaceId = options.workspaceId ?? DEFAULT_WORKSPACE_ID
    this.defaultPrincipalId = options.principalId ?? DEFAULT_PRINCIPAL_ID
    this.executionEnvironment = options.executionEnvironment
  }

  async runTask(request: WorkspaceTaskRequest): Promise<WorkspaceTaskReceipt> {
    assertNotCancelled(request.signal)
    const taskId = request.id ?? `wtsk_${randomUUID().replaceAll("-", "")}`
    const workspaceId = request.workspaceId ?? this.defaultWorkspaceId
    const principalId = request.principalId ?? this.defaultPrincipalId
    const isolationIdentity = taskIsolationIdentity(this.rootIdentity, taskId, request.strategy, request.access, this.gitWorktree)
    const isolationId = isolationIdentity.id
    const policy = createWorkspaceTaskExecutionPolicy(
      request.access,
      this.executionEnvironment.capabilities.process.cleanup,
      this.executionEnvironment.capabilities.isolation.enforcement
    )
    const executionEnvironment = this.executionEnvironment.resolveBinding({ policy })
    const current = request.id === undefined
      ? null
      : await this.storage.getWorkspaceTaskRun({ runId: taskId })
    if (current !== null) {
      assertWorkspaceTaskRunIdentity(current, {
        workspaceId,
        principalId,
        access: request.access,
        strategy: request.strategy,
        rootIdentity: this.rootIdentity,
        isolationIdentity,
        ...(request.jobId === undefined ? {} : { jobId: request.jobId }),
        ...(request.agentId === undefined ? {} : { agentId: request.agentId })
      })
      assertExecutionEnvironmentBindingEqual(
        current.run.executionEnvironment,
        executionEnvironment,
        "workspace task execution environment"
      )
      if (current.run.state === "released" || current.run.state === "attention") {
        return await workspaceTaskReceiptFromSnapshot(this.storage, current)
      }
    }
    const attemptId = `wtat_${randomUUID().replaceAll("-", "")}`
    const claimToken = randomBytes(32).toString("hex")
    const identity = { runId: taskId, attemptId, claimToken }
    const claim = await this.storage.beginWorkspaceTaskRun({
      id: taskId,
      workspaceId,
      principalId,
      access: request.access,
      strategy: request.strategy,
      rootIdentity: this.rootIdentity,
      isolationIdentity,
      executionEnvironment,
      ...(request.jobId === undefined ? {} : { jobId: request.jobId }),
      ...(request.agentId === undefined ? {} : { agentId: request.agentId }),
      attemptId,
      ownerId: this.ownerId,
      claimToken,
      leaseMs: this.leaseMs
    })
    assertExecutionEnvironmentBindingEqual(
      claim.snapshot.run.executionEnvironment,
      executionEnvironment,
      "workspace task execution environment"
    )
    if (claim.status === "already_terminal") {
      return await workspaceTaskReceiptFromSnapshot(this.storage, claim.snapshot)
    }
    if (
      claim.snapshot.run.state === "released" ||
      claim.snapshot.run.state === "attention"
    ) {
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

    return await this.executeClaimedTask(request, {
      taskId,
      workspaceId,
      principalId,
      isolationId,
      identity,
      policy,
      environment: this.executionEnvironment,
      executionBinding: executionEnvironment
    })
  }

  async resumeTask(
    request: ResumeWorkspaceTaskRequest
  ): Promise<WorkspaceTaskReceipt> {
    assertNotCancelled(request.signal)
    const taskId = requireOpaqueId(request.runId, "runId")
    const current = await this.storage.getWorkspaceTaskRun({ runId: taskId })
    if (current === null) {
      throw new Error(`workspace task run does not exist: ${taskId}`)
    }
    assertTaskRuntimeIdentity(current.run, this.rootIdentity, this.gitWorktree)
    if (current.run.state === "released") {
      return await workspaceTaskReceiptFromSnapshot(this.storage, current)
    }
    if (current.run.state !== "attention") {
      return failedReceipt({
        taskId,
        access: current.run.access as WorkspaceTaskRequest["access"],
        workspaceId: current.run.workspaceId,
        principalId: current.run.principalId,
        error: { message: "workspace task is not waiting for continuation" }
      })
    }
    if (current.run.access !== "read_only" && current.run.access !== "writable") {
      throw new Error(`workspace task access is invalid: ${current.run.access}`)
    }
    const access = current.run.access
    const policy = createWorkspaceTaskExecutionPolicy(
      access,
      this.executionEnvironment.capabilities.process.cleanup,
      this.executionEnvironment.capabilities.isolation.enforcement
    )
    const executionEnvironment = this.executionEnvironment.resolveBinding({ policy })
    const attemptId = `wtat_${randomUUID().replaceAll("-", "")}`
    const claimToken = randomBytes(32).toString("hex")
    const identity = { runId: taskId, attemptId, claimToken }
    const claim = await this.storage.claimWorkspaceTaskContinuation({
      ...identity,
      ownerId: this.ownerId,
      leaseMs: this.leaseMs,
      executionEnvironment
    })
    assertExecutionEnvironmentBindingEqual(
      claim.snapshot.run.executionEnvironment,
      executionEnvironment,
      "workspace task continuation execution environment"
    )
    if (claim.status === "already_terminal") {
      return await workspaceTaskReceiptFromSnapshot(this.storage, claim.snapshot)
    }
    if (claim.status !== "claimed") {
      return failedReceipt({
        taskId,
        access,
        workspaceId: current.run.workspaceId,
        principalId: current.run.principalId,
        error: { message: "workspace task continuation is already active" }
      })
    }

    const stored = claim.snapshot.run
    const resumedRequest: WorkspaceTaskRequest = {
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      id: stored.id,
      workspaceId: stored.workspaceId,
      principalId: stored.principalId,
      access,
      strategy: stored.strategy,
      input: request.input,
      ...(stored.jobId === undefined ? {} : { jobId: stored.jobId }),
      ...(stored.agentId === undefined ? {} : { agentId: stored.agentId }),
      handler: request.handler
    }
    return await this.executeClaimedTask(resumedRequest, {
      taskId,
      workspaceId: stored.workspaceId,
      principalId: stored.principalId,
      isolationId: stored.isolationIdentity.id,
      identity,
      policy,
      environment: this.executionEnvironment,
      executionBinding: executionEnvironment,
      expectedLease: {
        ...(stored.isolationIdentity.baseRevision === undefined
          ? {}
          : { baseRevision: stored.isolationIdentity.baseRevision }),
        ...(stored.isolationIdentity.runtimeRef === undefined
          ? {}
          : { branchName: stored.isolationIdentity.runtimeRef })
      }
    })
  }

  private async executeClaimedTask(
    request: WorkspaceTaskRequest,
    options: {
      readonly taskId: string
      readonly workspaceId: string
      readonly principalId: string
      readonly isolationId: string
      readonly identity: {
        readonly runId: string
        readonly attemptId: string
        readonly claimToken: string
      }
      readonly policy: ReturnType<typeof createWorkspaceTaskExecutionPolicy>
      readonly environment: WorkspaceTaskRuntimeOptions["executionEnvironment"]
      readonly executionBinding: import("@wanex/runtime/execution").ExecutionEnvironmentBinding
      readonly expectedLease?: {
        readonly baseRevision?: string
        readonly branchName?: string
      }
    }
  ): Promise<WorkspaceTaskReceipt> {
    const {
      taskId,
      workspaceId,
      principalId,
      isolationId,
      identity,
      policy,
      environment,
      executionBinding,
      expectedLease
    } = options

    const renewal = new WorkspaceTaskLeaseRenewal({
      storage: this.storage,
      identity,
      leaseMs: this.leaseMs
    })
    renewal.start()
    const isolation =
      request.strategy === "git_worktree"
        ? this.gitWorktree!.isolation
        : this.directIsolation
    let lease: WorkspaceIsolationLease
    try {
      lease = await isolation.prepare(
        { ...isolationRequestForTask(request, {
          taskId,
          isolationId,
          workspaceId,
          principalId
        }), rootIdentity: this.rootIdentity,
        ...(expectedLease?.baseRevision === undefined ? {} : { expectedBaseRevision: expectedLease.baseRevision }) }
      )
      if (lease.id !== isolationId) {
        throw new Error("workspace isolation adapter changed the durable isolation identity")
      }
      const expectedKind = request.strategy === "git_worktree" ? "git_worktree" : "fixed"
      if (lease.kind !== expectedKind || lease.repositoryId !==
          (request.strategy === "git_worktree" ? this.gitWorktree!.repositoryId : undefined)) {
        throw new Error(
          `workspace task isolation does not match its explicit strategy: ${lease.kind}`
        )
      }
      if (
        expectedLease !== undefined &&
        (expectedLease.baseRevision !== undefined &&
          lease.baseRevision !== expectedLease.baseRevision ||
          expectedLease.branchName !== undefined &&
          lease.branchName !== expectedLease.branchName)
      ) {
        throw new Error("workspace continuation changed the durable isolation identity")
      }
      renewal.assertHealthy()
      if (request.strategy === "git_worktree" && (!lease.baseRevision || !lease.branchName)) {
        throw new Error("prepared worktree must provide its base revision and runtime ref")
      }
      await this.storage.markWorkspaceTaskActive({
        ...identity,
        ...(request.strategy === "direct" ? {} : {
          preparedIsolation: {
            baseRevision: lease.baseRevision!,
            runtimeRef: lease.branchName!
          }
        })
      })
    } catch (error) {
      const taskError = serializeWorkspaceTaskError(error)
      await markAttentionBestEffort(this.storage, identity, taskError)
      await renewal.stop()
      return failedReceipt({
        taskId,
        access: request.access,
        workspaceId,
        principalId,
        error: taskError
      })
    }

    let executionScope: ExecutionScope | undefined
    try {
      executionScope = await environment.bind({
        scopeId: identity.attemptId,
        policy,
        fileSystemRoots: [{ id: "workspace", path: lease.rootDir }],
        ...(environment.capabilities.process.cleanup ===
        "durable_supervisor"
          ? { supervisorClaim: identity }
          : {})
      })
      assertExecutionEnvironmentBindingEqual(
        executionScope.binding,
        executionBinding,
        "workspace task bound execution environment"
      )
    } catch (error) {
      await executionScope?.close().catch(() => {})
      const taskError = serializeWorkspaceTaskError(error, [lease.rootDir])
      await markAttentionBestEffort(this.storage, identity, taskError)
      if (request.strategy === "direct") {
        await releaseWorkspaceTaskLease(isolation, lease)
      }
      await renewal.stop()
      return failedReceipt({
        taskId,
        access: request.access,
        workspaceId,
        principalId,
        error: taskError
      })
    }
    if (executionScope === undefined) {
      throw new Error("workspace task execution Scope was not bound")
    }
    const cancellation = combineTaskSignals(request.signal, renewal.signal)
    const executionGuard = new WorkspaceTaskExecutionGuard(executionScope.process, cancellation.signal)
    let executionScopeClosed = false
    const closeExecutionScope = async (): Promise<void> => {
      if (executionScopeClosed) return
      executionScopeClosed = true
      try { await executionScope.close() } finally { cancellation.dispose() }
    }
    const context: WorkspaceTaskContext = {
      signal: cancellation.signal,
      taskId,
      workspaceId,
      principalId,
      access: request.access,
      strategy: request.strategy,
      input: request.input,
      rootDir: lease.rootDir,
      executionScope: {
        binding: executionScope.binding,
        fileSystem: executionScope.fileSystem,
        process: executionGuard
      }
    }
    let handlerResult: WorkspaceTaskHandlerResult = {}
    let handlerError: WorkspaceTaskError | undefined
    let resources: readonly ResourceRecord[] = []
    try {
      assertNotCancelled(cancellation.signal)
      handlerResult = await request.handler(context)
      assertNotCancelled(cancellation.signal)
      executionGuard.assertCleanupProven()
      resources = await ingestWorkspaceTaskArtifacts(
        this.resourceRuntime,
        handlerResult.artifacts ?? []
      )
      renewal.assertHealthy()
    } catch (error) {
      if (error instanceof WorkspaceTaskAttentionError) {
        let attentionError = error.failure
        try {
          await closeExecutionScope()
          executionGuard.assertCleanupProven()
        } catch (closeError) {
          attentionError = combineWorkspaceTaskErrors(
            attentionError,
            serializeWorkspaceTaskError(closeError, [lease.rootDir])
          )
        }
        await markAttentionBestEffort(this.storage, identity, attentionError)
        await renewal.stop()
        return withOptionalReceiptFields(
          {
            taskId,
            status: "failed",
            access: request.access,
            workspaceId,
            principalId,
            resources: []
          },
          { error: attentionError }
        )
      }
      handlerError = serializeWorkspaceTaskError(error, [lease.rootDir])
    }

    const cancelled = request.signal?.aborted === true
    let summary: string | undefined
    try {
      summary = normalizeSummary(handlerResult.summary)
      await this.storage.beginWorkspaceTaskCollection({
        ...identity,
        executionOutcome: handlerError === undefined ? "completed" : cancelled ? "cancelled" : "failed",
        ...(summary === undefined ? {} : { summary }),
        resourceIds: resources.map((resource) => resource.id),
        ...(handlerError === undefined
          ? {}
          : { failure: workspaceTaskFailureJson(handlerError) })
      })
      if (request.strategy === "git_worktree") {
        const ids = projectionIds(workspaceId, taskId)
        // Projection is a host-owned read after the agent scope is closed.
        // The Git runtime carries the broader repository scope it needs for
        // linked-worktree metadata and never reuses the agent scope here.
        await closeExecutionScope()
        executionGuard.assertCleanupProven()
        const collection = await this.gitWorktree!.collection.collectWorktree({
          lease,
          changeSetId: ids.changeSetId
        })
        if (collection.status === "attention") {
          const projectionError: WorkspaceTaskError = {
            message: "workspace Git projection requires attention",
            name: "WorkspaceProjectionAttention",
            details: {
              attention: collection.attention.map(projectionAttentionToJson)
            }
          }
          await markAttentionBestEffort(this.storage, identity, projectionError)
          await renewal.stop()
          return withOptionalReceiptFields(
            {
              taskId,
              status: "failed",
              access: request.access,
              workspaceId,
              principalId,
              resources
            },
            { summary, error: projectionError }
          )
        }
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
                    executionOutcome: cancelled ? "cancelled" : "failed",
                    incomplete: true
                  }
                })
          })
          await this.storage.beginWorkspaceTaskRelease(identity)
        } else {
          await this.storage.finalizeWorkspaceTaskCollection({
            ...identity,
            outcome: handlerError === undefined ? "no_changes" : cancelled ? "cancelled" : "execution_failed"
          })
        }
      } else {
        await closeExecutionScope()
        executionGuard.assertCleanupProven()
        await this.storage.finalizeWorkspaceTaskCollection({
          ...identity,
          outcome:
            handlerError === undefined
              ? "read_only_completed"
              : cancelled ? "cancelled" : "execution_failed"
        })
      }
      renewal.assertHealthy()
    } catch (error) {
      const collectionError = serializeWorkspaceTaskError(error, [lease.rootDir])
      let finalError = collectionError
      try {
        await closeExecutionScope()
      } catch (closeError) {
        finalError = combineWorkspaceTaskErrors(
          finalError,
          serializeWorkspaceTaskError(closeError, [lease.rootDir])
        )
      }
      await markAttentionBestEffort(this.storage, identity, finalError)
      await renewal.stop()
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
              ? finalError
              : combineWorkspaceTaskErrors(handlerError, finalError)
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
    await renewal.stop()
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
        directIsolation: this.directIsolation,
        gitWorktree: this.gitWorktree,
        rootIdentity: this.rootIdentity,
        ownerId: this.ownerId,
        leaseMs: this.leaseMs,
        executionEnvironment: this.executionEnvironment
      },
      request
    )
  }

  async recoverExpiredTasks(
    request: WorkspaceTaskRecoveryAdmissionRequest = {}
  ): Promise<WorkspaceTaskRecoveryAdmissionResult> {
    return await recoverExpiredWorkspaceTasks(
      {
        storage: this.storage,
        directIsolation: this.directIsolation,
        gitWorktree: this.gitWorktree,
        rootIdentity: this.rootIdentity,
        ownerId: this.ownerId,
        leaseMs: this.leaseMs,
        defaultWorkspaceId: this.defaultWorkspaceId,
        executionEnvironment: this.executionEnvironment
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

export function createWorkspaceTaskExecutionPolicy(
  access: WorkspaceTaskRequest["access"],
  cleanup: import("@wanex/runtime/execution").ExecutionPolicySnapshot["process"]["cleanup"],
  isolation: import("@wanex/runtime/execution").ExecutionPolicySnapshot["isolation"]
): import("@wanex/runtime/execution").ExecutionPolicySnapshot {
  return {
    revision: 1,
    filesystem: {
      roots: [{
        id: "workspace",
        effects: access === "writable"
          ? ["read", "write", "create", "remove"]
          : ["read"]
      }],
      maxReadBytes: 50 * 1024 * 1024,
      maxDirectoryEntries: 100_000
    },
    process: {
      oneShot: true,
      managed: cleanup === "durable_supervisor",
      cleanup,
      environmentVariables: []
    },
    network: "unrestricted",
    isolation,
    pty: false
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

function assertWorkspaceTaskRunIdentity(
  snapshot: WorkspaceTaskRunSnapshot,
  identity: {
    readonly workspaceId: string
    readonly principalId: string
    readonly access: WorkspaceTaskRequest["access"]
    readonly strategy: WorkspaceTaskRequest["strategy"]
    readonly rootIdentity: WorkspaceTaskRuntimeOptions["rootIdentity"]
    readonly isolationIdentity: import("@wanex/protocol").WorkspaceTaskIsolationIdentity
    readonly jobId?: string
    readonly agentId?: string
  }
): void {
  const run = snapshot.run
  if (
    run.workspaceId !== identity.workspaceId ||
    run.principalId !== identity.principalId ||
    run.access !== identity.access ||
    run.strategy !== identity.strategy ||
    !sameTaskRoot(run.rootIdentity, identity.rootIdentity) ||
    run.isolationIdentity.id !== identity.isolationIdentity.id ||
    run.isolationIdentity.kind !== identity.isolationIdentity.kind ||
    run.isolationIdentity.repositoryId !== identity.isolationIdentity.repositoryId ||
    run.jobId !== identity.jobId ||
    run.agentId !== identity.agentId
  ) {
    throw new Error(`workspace task run id already exists with different identity: ${run.id}`)
  }
}
