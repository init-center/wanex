import type { JsonValue, WorkspaceTaskAccess } from "@wanex/protocol"
import type {
  WorkspaceTaskError,
  WorkspaceTaskJobPayload,
  WorkspaceTaskJobResult,
  WorkspaceTaskReceipt
} from "./types.js"

const PAYLOAD_FIELDS = new Set([
  "handlerId",
  "access",
  "input",
  "taskId",
  "workspaceId",
  "principalId",
  "jobId",
  "agentId"
])

export function workspaceTaskJobResultToJson(
  result: WorkspaceTaskJobResult
): JsonValue {
  return withOptionalJsonFields(
    {
      taskId: result.taskId,
      status: result.status,
      access: result.access,
      workspaceId: result.workspaceId,
      principalId: result.principalId,
      resourceIds: [...result.resourceIds]
    },
    {
      changeSetId: result.changeSetId,
      proposalId: result.proposalId,
      summary: result.summary,
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
      access: receipt.access,
      workspaceId: receipt.workspaceId,
      principalId: receipt.principalId,
      resourceIds: receipt.resources.map((resource) => resource.id)
    },
    {
      changeSetId: receipt.changeSet?.id,
      proposalId: receipt.proposal?.id,
      summary: receipt.summary,
      error: receipt.error
    }
  )
}

export function workspaceTaskJobPayloadToJson(payload: WorkspaceTaskJobPayload): JsonValue {
  return withOptionalJsonFields(
    {
      handlerId: payload.handlerId,
      access: payload.access,
      input: payload.input
    },
    {
      taskId: payload.taskId,
      workspaceId: payload.workspaceId,
      principalId: payload.principalId,
      jobId: payload.jobId,
      agentId: payload.agentId
    }
  )
}

export function workspaceTaskJobPayloadFromJson(payload: JsonValue): WorkspaceTaskJobPayload {
  if (!isJsonRecord(payload)) {
    throw new Error("workspace.task payload must be an object")
  }
  assertOnlyPayloadFields(payload)
  const handlerId = expectString(payload.handlerId, "workspace.task.handlerId")
  if (handlerId.length === 0) {
    throw new Error("workspace.task.handlerId must not be empty")
  }
  if (!("input" in payload)) {
    throw new Error("workspace.task.input is required")
  }
  return {
    handlerId,
    access: expectAccess(payload.access),
    input: payload.input,
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
      : { agentId: expectString(payload.agentId, "workspace.task.agentId") })
  }
}

function withOptionalJobResultFields(
  result: Omit<
    WorkspaceTaskJobResult,
    "changeSetId" | "proposalId" | "summary" | "error"
  >,
  optional: {
    readonly changeSetId?: string | undefined
    readonly proposalId?: string | undefined
    readonly summary?: string | undefined
    readonly error?: WorkspaceTaskError | undefined
  }
): WorkspaceTaskJobResult {
  return {
    ...result,
    ...(optional.changeSetId === undefined
      ? {}
      : { changeSetId: optional.changeSetId }),
    ...(optional.proposalId === undefined
      ? {}
      : { proposalId: optional.proposalId }),
    ...(optional.summary === undefined ? {} : { summary: optional.summary }),
    ...(optional.error === undefined ? {} : { error: optional.error })
  }
}

function taskErrorToJson(error: WorkspaceTaskError): JsonValue {
  return withOptionalJsonFields(
    { message: error.message },
    { name: error.name }
  )
}

function withOptionalJsonFields(
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

function assertOnlyPayloadFields(payload: Record<string, JsonValue>): void {
  for (const field of Object.keys(payload)) {
    if (!PAYLOAD_FIELDS.has(field)) {
      throw new Error(`workspace.task payload contains unsupported field: ${field}`)
    }
  }
}

function isJsonRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function expectAccess(value: JsonValue | undefined): WorkspaceTaskAccess {
  if (value !== "read_only" && value !== "writable") {
    throw new Error("workspace.task.access must be read_only or writable")
  }
  return value
}

function expectString(value: JsonValue | undefined, name: string): string {
  if (typeof value !== "string") {
    throw new Error(`${name} must be a string`)
  }
  return value
}
