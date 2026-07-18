import type {
  WorkspaceChangeOperationRecord,
  WorkspaceChangeSetState
} from "@wanex/protocol"

export function latestApplicableApplyOperation(
  operations: readonly WorkspaceChangeOperationRecord[]
): WorkspaceChangeOperationRecord | undefined {
  for (const operation of [...operations].reverse()) {
    if (operation.operation === "undo" && operation.status === "applied") {
      return undefined
    }
    if (
      operation.operation === "apply" &&
      (operation.status === "applied" || operation.status === "already_applied")
    ) {
      return operation
    }
  }
  return undefined
}

export function isTerminalWorkspaceChangeSetState(
  state: WorkspaceChangeSetState
): boolean {
  return (
    state === "applied" ||
    state === "already_applied" ||
    state === "conflicted" ||
    state === "undone" ||
    state === "undo_conflicted"
  )
}
