import { randomUUID } from "node:crypto"
import type { PrincipalId } from "@wanex/protocol"
import { WanexResourceRuntime } from "@wanex/runtime/resources"
import type { WorkspaceTaskStore } from "./storage.js"
import type { WorkspaceIsolationAdapter } from "../isolation/index.js"
import {
  ingestWorkspaceTaskArtifacts,
  persistWorkspaceTaskChangeSet
} from "./artifacts.js"
import { isolationRequestForTask } from "./isolation.js"
import {
  combineWorkspaceTaskErrors,
  releaseWorkspaceTaskLease,
  serializeWorkspaceTaskError,
  withOptionalReceiptFields
} from "./receipt.js"
import type {
  WorkspaceTaskContext,
  WorkspaceTaskReceipt,
  WorkspaceTaskRequest,
  WorkspaceTaskRuntimeOptions
} from "./types.js"

const DEFAULT_WORKSPACE_ID = "local"
const DEFAULT_PRINCIPAL_ID = "workspace-tasks"

export class WorkspaceTaskRuntime {
  private readonly storage: WorkspaceTaskStore
  private readonly isolation: WorkspaceIsolationAdapter
  private readonly resourceRuntime: WanexResourceRuntime
  private readonly defaultWorkspaceId: string
  private readonly defaultPrincipalId: PrincipalId

  constructor(options: WorkspaceTaskRuntimeOptions) {
    this.storage = options.storage
    this.isolation = options.isolation
    this.resourceRuntime = new WanexResourceRuntime({ storage: options.storage })
    this.defaultWorkspaceId = options.workspaceId ?? DEFAULT_WORKSPACE_ID
    this.defaultPrincipalId = options.principalId ?? DEFAULT_PRINCIPAL_ID
  }

  async runTask(request: WorkspaceTaskRequest): Promise<WorkspaceTaskReceipt> {
    const taskId = request.id ?? `wtsk_${randomUUID().replaceAll("-", "")}`
    const workspaceId = request.workspaceId ?? this.defaultWorkspaceId
    const principalId = request.principalId ?? this.defaultPrincipalId
    const lease = await this.isolation.prepare(
      isolationRequestForTask(request, {
        taskId,
        workspaceId,
        principalId
      })
    )
    const context: WorkspaceTaskContext = {
      taskId,
      workspaceId,
      principalId,
      lease,
      rootDir: lease.rootDir,
      storage: this.storage
    }
    let released = false

    try {
      const result = await request.handler(context)
      const resources = await ingestWorkspaceTaskArtifacts(
        this.resourceRuntime,
        result.artifacts ?? []
      )
      const changeSet = await persistWorkspaceTaskChangeSet(this.storage, {
        workspaceId,
        principalId,
        result
      })
      const release = await releaseWorkspaceTaskLease(
        this.isolation,
        lease,
        request.keepLease === true
      )
      released = release.released
      return withOptionalReceiptFields(
        {
          taskId,
          status: release.error === undefined ? "succeeded" : "failed",
          workspaceId,
          principalId,
          lease,
          released,
          resources
        },
        {
          changeSet,
          metadata: result.metadata,
          error: release.error
        }
      )
    } catch (error) {
      const release = await releaseWorkspaceTaskLease(
        this.isolation,
        lease,
        request.keepLease === true
      )
      released = release.released
      const taskError = serializeWorkspaceTaskError(error)
      return withOptionalReceiptFields(
        {
          taskId,
          status: "failed",
          workspaceId,
          principalId,
          lease,
          released,
          resources: []
        },
        {
          error:
            release.error === undefined
              ? taskError
              : combineWorkspaceTaskErrors(taskError, release.error)
        }
      )
    }
  }
}
