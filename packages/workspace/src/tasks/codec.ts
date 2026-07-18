import type { JsonValue } from "@wanex/protocol"
import type { WorkspaceIsolationLease, WorkspaceIsolationRequest } from "../isolation/index.js"
import type {
  WorkspaceTaskError,
  WorkspaceTaskJobPayload,
  WorkspaceTaskJobResult,
  WorkspaceTaskReceipt
} from "./types.js"

export function workspaceTaskJobResultToJson(
  result: WorkspaceTaskJobResult
): JsonValue {
  return withOptionalJsonFields(
    {
      taskId: result.taskId,
      status: result.status,
      workspaceId: result.workspaceId,
      principalId: result.principalId,
      released: result.released,
      lease: result.lease,
      resourceIds: [...result.resourceIds]
    },
    {
      changeSetId: result.changeSetId,
      metadata: result.metadata,
      error: result.error === undefined ? undefined : taskErrorToJson(result.error)
    }
  )
}

export function workspaceTaskJobResultFromReceipt(
  receipt: WorkspaceTaskReceipt
): WorkspaceTaskJobResult {
  return withOptionalJobResultFields(
    {
      taskId: receipt.taskId,
      status: receipt.status,
      workspaceId: receipt.workspaceId,
      principalId: receipt.principalId,
      released: receipt.released,
      lease: leaseSummaryToJson(receipt.lease),
      resourceIds: receipt.resources.map((resource) => resource.id)
    },
    {
      changeSetId: receipt.changeSet?.id,
      metadata: recordToJsonValue(receipt.metadata),
      error: receipt.error
    }
  )
}

export function workspaceTaskJobPayloadToJson(payload: WorkspaceTaskJobPayload): JsonValue {
  return withOptionalJsonFields(
    {
      handlerId: payload.handlerId
    },
    {
      taskId: payload.taskId,
      workspaceId: payload.workspaceId,
      principalId: payload.principalId,
      jobId: payload.jobId,
      agentId: payload.agentId,
      keepLease: payload.keepLease,
      isolation:
        payload.isolation === undefined
          ? undefined
          : (payload.isolation as unknown as JsonValue),
      metadata: recordToJsonValue(payload.metadata)
    }
  )
}

export function workspaceTaskJobPayloadFromJson(payload: JsonValue): WorkspaceTaskJobPayload {
  if (!isJsonRecord(payload)) {
    throw new Error("workspace.task payload must be an object")
  }
  const handlerId = expectString(payload.handlerId, "workspace.task.handlerId")
  if (handlerId.length === 0) {
    throw new Error("workspace.task.handlerId must not be empty")
  }
  return {
    handlerId,
    ...(payload.taskId === undefined
      ? {}
      : { taskId: expectString(payload.taskId, "workspace.task.taskId") }),
    ...(payload.workspaceId === undefined
      ? {}
      : {
          workspaceId: expectString(
            payload.workspaceId,
            "workspace.task.workspaceId"
          )
        }),
    ...(payload.principalId === undefined
      ? {}
      : {
          principalId: expectString(
            payload.principalId,
            "workspace.task.principalId"
          )
        }),
    ...(payload.jobId === undefined
      ? {}
      : { jobId: expectString(payload.jobId, "workspace.task.jobId") }),
    ...(payload.agentId === undefined
      ? {}
      : { agentId: expectString(payload.agentId, "workspace.task.agentId") }),
    ...(payload.keepLease === undefined
      ? {}
      : {
          keepLease: expectBoolean(
            payload.keepLease,
            "workspace.task.keepLease"
          )
        }),
    ...(payload.isolation === undefined
      ? {}
      : {
          isolation: expectRecord(
            payload.isolation,
            "workspace.task.isolation"
          ) as unknown as WorkspaceIsolationRequest
        }),
    ...(payload.metadata === undefined
      ? {}
      : {
          metadata: expectRecord(
            payload.metadata,
            "workspace.task.metadata"
          ) as Record<string, JsonValue>
        })
  }
}

function leaseSummaryToJson(lease: WorkspaceIsolationLease): JsonValue {
  return withOptionalJsonFields(
    {
      id: lease.id,
      kind: lease.kind,
      rootDir: lease.rootDir,
      createdAt: lease.createdAt,
      releasePolicy: lease.releasePolicy
    },
    {
      workspaceId: lease.workspaceId,
      jobId: lease.jobId,
      agentId: lease.agentId,
      baseRef: lease.baseRef,
      baseRevision: lease.baseRevision,
      branchName: lease.branchName,
      metadata: recordToJsonValue(lease.metadata)
    }
  )
}

function withOptionalJobResultFields(
  result: Omit<WorkspaceTaskJobResult, "changeSetId" | "metadata" | "error">,
  optional: {
    readonly changeSetId?: string | undefined
    readonly metadata?: JsonValue | undefined
    readonly error?: WorkspaceTaskError | undefined
  }
): WorkspaceTaskJobResult {
  return {
    ...result,
    ...(optional.changeSetId === undefined
      ? {}
      : { changeSetId: optional.changeSetId }),
    ...(optional.metadata === undefined ? {} : { metadata: optional.metadata }),
    ...(optional.error === undefined ? {} : { error: optional.error })
  }
}

function taskErrorToJson(error: WorkspaceTaskError): JsonValue {
  return withOptionalJsonFields(
    { message: error.message },
    { name: error.name }
  )
}

export function withOptionalJsonFields(
  base: Record<string, JsonValue>,
  optional: Record<string, JsonValue | undefined>
): JsonValue {
  return {
    ...base,
    ...Object.fromEntries(
      Object.entries(optional).filter((entry): entry is [string, JsonValue] => {
        return entry[1] !== undefined
      })
    )
  }
}

export function recordToJsonValue(
  value: Record<string, unknown> | undefined
): JsonValue | undefined {
  return value === undefined ? undefined : (value as JsonValue)
}

function isJsonRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function expectRecord(value: JsonValue, name: string): Record<string, JsonValue> {
  if (!isJsonRecord(value)) {
    throw new Error(`${name} must be an object`)
  }
  return value
}

function expectString(value: JsonValue | undefined, name: string): string {
  if (typeof value !== "string") {
    throw new Error(`${name} must be a string`)
  }
  return value
}

function expectBoolean(value: JsonValue | undefined, name: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${name} must be a boolean`)
  }
  return value
}
