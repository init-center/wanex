import type { WorkspaceChangeSetRecord } from "@wanex/protocol"
import type {
  WorkspaceIsolationAdapter,
  WorkspaceIsolationLease
} from "../isolation/index.js"
import type {
  WorkspaceTaskError,
  WorkspaceTaskReceipt
} from "./types.js"

export async function releaseWorkspaceTaskLease(
  isolation: WorkspaceIsolationAdapter,
  lease: WorkspaceIsolationLease,
  keepLease: boolean
): Promise<{ readonly released: boolean; readonly error?: WorkspaceTaskError }> {
  if (keepLease) {
    return { released: false }
  }
  try {
    await isolation.release(lease)
    return { released: true }
  } catch (error) {
    return {
      released: false,
      error: serializeWorkspaceTaskError(error)
    }
  }
}

export function serializeWorkspaceTaskError(error: unknown): WorkspaceTaskError {
  if (error instanceof Error) {
    return {
      message: error.message,
      ...(error.name.length === 0 ? {} : { name: error.name })
    }
  }
  return {
    message: String(error)
  }
}

export function combineWorkspaceTaskErrors(
  taskError: WorkspaceTaskError,
  releaseError: WorkspaceTaskError
): WorkspaceTaskError {
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
    "changeSet" | "metadata" | "error"
  >,
  optional: {
    readonly changeSet?: WorkspaceChangeSetRecord | undefined
    readonly metadata?: Record<string, unknown> | undefined
    readonly error?: WorkspaceTaskError | undefined
  }
): WorkspaceTaskReceipt {
  return {
    ...receipt,
    ...(optional.changeSet === undefined ? {} : { changeSet: optional.changeSet }),
    ...(optional.metadata === undefined ? {} : { metadata: optional.metadata }),
    ...(optional.error === undefined ? {} : { error: optional.error })
  }
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
