import type {
  JsonValue,
  WorkspaceChangeProposalRecord,
  WorkspaceChangeSetRecord,
  WorkspaceTaskRunSnapshot
} from "@wanex/protocol"
import type {
  WorkspaceIsolationAdapter,
  WorkspaceIsolationLease
} from "../isolation/index.js"
import type {
  WorkspaceTaskError,
  WorkspaceTaskReceipt
} from "./types.js"
import type { WorkspaceTaskStore } from "./storage.js"
import {
  GitProjectionError,
  projectionAttentionToJson
} from "../git/projection.js"

export async function workspaceTaskReceiptFromSnapshot(
  storage: WorkspaceTaskStore,
  snapshot: WorkspaceTaskRunSnapshot
): Promise<WorkspaceTaskReceipt> {
  const resources = await Promise.all(
    snapshot.run.resourceIds.map(async (resourceId) => {
      const resource = await storage.getResource({ resourceId })
      if (resource === null) {
        throw new Error(`workspace task resource is missing: ${resourceId}`)
      }
      return resource
    })
  )
  const changeSet =
    snapshot.run.changeSetId === undefined
      ? undefined
      : (await storage.getWorkspaceChangeSet({
          changeSetId: snapshot.run.changeSetId
        })) ?? undefined
  const proposal =
    snapshot.run.proposalId === undefined
      ? undefined
      : (await storage.getWorkspaceChangeProposal({
          proposalId: snapshot.run.proposalId
        })) ?? undefined
  return withOptionalReceiptFields(
    {
      taskId: snapshot.run.id,
      status:
        snapshot.run.state === "released" &&
        !["execution_failed", "cancelled"].includes(snapshot.run.outcome ?? "")
          ? "succeeded"
          : "failed",
      access: snapshot.run.access,
      workspaceId: snapshot.run.workspaceId,
      principalId: snapshot.run.principalId,
      resources
    },
    {
      changeSet,
      proposal,
      summary: snapshot.run.summary,
      error: workspaceTaskErrorFromJson(snapshot.run.failure)
    }
  )
}

export function workspaceTaskFailureJson(
  error: WorkspaceTaskError,
  type = "workspace_task.execution_failed"
): JsonValue {
  return {
    type,
    message: error.message,
    ...(error.name === undefined ? {} : { name: error.name }),
    ...(error.details === undefined ? {} : { details: error.details })
  }
}

function workspaceTaskErrorFromJson(
  value: JsonValue | undefined
): WorkspaceTaskError | undefined {
  if (
    value === undefined ||
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return undefined
  }
  const record = value as Readonly<Record<string, JsonValue>>
  if (typeof record.message !== "string") {
    return undefined
  }
  return {
    message: record.message,
    ...(typeof record.name === "string" ? { name: record.name } : {}),
    ...(record.details === undefined ? {} : { details: record.details })
  }
}

export async function releaseWorkspaceTaskLease(
  isolation: WorkspaceIsolationAdapter,
  lease: WorkspaceIsolationLease
): Promise<{ readonly error?: WorkspaceTaskError }> {
  try {
    await isolation.release(lease)
    return {}
  } catch (error) {
    return {
      error: serializeWorkspaceTaskError(error, [lease.rootDir])
    }
  }
}

export function serializeWorkspaceTaskError(
  error: unknown,
  sensitivePaths: readonly string[] = []
): WorkspaceTaskError {
  if (error instanceof Error) {
    const details = error instanceof GitProjectionError
      ? { attention: projectionAttentionToJson(error.attention) }
      : undefined
    return {
      message: redactSensitivePaths(error.message, sensitivePaths),
      ...(error.name.length === 0 ? {} : { name: error.name }),
      ...(details === undefined ? {} : { details })
    }
  }
  return {
    message: redactSensitivePaths(String(error), sensitivePaths)
  }
}

export function combineWorkspaceTaskErrors(
  taskError: WorkspaceTaskError,
  releaseError: WorkspaceTaskError
): WorkspaceTaskError {
  if (
    taskError.message === releaseError.message &&
    taskError.name === releaseError.name
  ) {
    return taskError
  }
  return withOptionalTaskErrorName(
    {
      message: `${taskError.message}; release failed: ${releaseError.message}`
    },
    taskError.name ?? releaseError.name
  )
}

export function withOptionalReceiptFields(
  receipt: Omit<
    WorkspaceTaskReceipt,
    "changeSet" | "proposal" | "summary" | "error"
  >,
  optional: {
    readonly changeSet?: WorkspaceChangeSetRecord | undefined
    readonly proposal?: WorkspaceChangeProposalRecord | undefined
    readonly summary?: string | undefined
    readonly error?: WorkspaceTaskError | undefined
  }
): WorkspaceTaskReceipt {
  return {
    ...receipt,
    ...(optional.changeSet === undefined ? {} : { changeSet: optional.changeSet }),
    ...(optional.proposal === undefined ? {} : { proposal: optional.proposal }),
    ...(optional.summary === undefined ? {} : { summary: optional.summary }),
    ...(optional.error === undefined ? {} : { error: optional.error })
  }
}

function redactSensitivePaths(
  message: string,
  sensitivePaths: readonly string[]
): string {
  let redacted = message
  for (const path of sensitivePaths) {
    if (path.length === 0) {
      continue
    }
    redacted = redacted.replaceAll(path, "<workspace>")
    const alternate = path.includes("\\")
      ? path.replaceAll("\\", "/")
      : path.replaceAll("/", "\\")
    redacted = redacted.replaceAll(alternate, "<workspace>")
  }
  return redacted
}

function withOptionalTaskErrorName(
  error: Omit<WorkspaceTaskError, "name">,
  name: string | undefined
): WorkspaceTaskError {
  return {
    ...error,
    ...(name === undefined ? {} : { name })
  }
}
