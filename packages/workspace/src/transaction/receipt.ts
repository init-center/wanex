import type {
  WorkspaceChangeOperationRecord,
  WorkspaceChangeTransactionFilePlan,
  WorkspaceChangeTransactionFinalization,
  WorkspaceChangeTransactionSnapshot
} from "@wanex/protocol"
import type { WorkspaceStore } from "@wanex/storage/workspace"
import type {
  ChangeSetReceipt,
  LocalWorkspaceReader
} from "../changesets/index.js"
import { appliedFileRecord } from "../changesets/records.js"
import { sha256 } from "./common.js"

export interface WorkspaceTransactionResult {
  readonly operation: WorkspaceChangeOperationRecord
  readonly receipt: ChangeSetReceipt
  readonly finalization: WorkspaceChangeTransactionFinalization
}

export function transactionFiles(
  receipt: ChangeSetReceipt
): readonly WorkspaceChangeTransactionFilePlan[] {
  return receipt.files
    .filter((file) => file.beforeText !== file.afterText)
    .map((file, ordinal) => ({
      ordinal,
      path: file.path,
      ...(file.beforeText === undefined ? {} : { beforeText: file.beforeText }),
      ...(file.beforeSha256 === undefined
        ? {}
        : { beforeSha256: file.beforeSha256 }),
      ...(file.afterText === undefined ? {} : { afterText: file.afterText }),
      ...(file.afterSha256 === undefined
        ? {}
        : { afterSha256: file.afterSha256 })
    }))
}

export function finalizationResult(
  finalization: WorkspaceChangeTransactionFinalization,
  receipt: ChangeSetReceipt
): WorkspaceTransactionResult {
  if (finalization.operation === undefined) {
    throw new Error("workspace transaction finalization has no operation")
  }
  return {
    operation: finalization.operation,
    receipt,
    finalization
  }
}

export async function replayTerminalTransaction(input: {
  readonly storage: WorkspaceStore
  readonly changeSetId: string
  readonly snapshot: WorkspaceChangeTransactionFinalization["snapshot"]
  readonly workspaceOperationId: string | undefined
}): Promise<WorkspaceTransactionResult> {
  if (input.workspaceOperationId === undefined) {
    throw new Error("terminal workspace transaction has no operation")
  }
  const operation = (await input.storage.listWorkspaceChangeOperations({
    changeSetId: input.changeSetId
  })).find((candidate) => candidate.id === input.workspaceOperationId)
  if (operation === undefined) {
    throw new Error(
      `terminal workspace transaction operation does not exist: ${input.workspaceOperationId}`
    )
  }
  return {
    operation,
    receipt: operation.receipt,
    finalization: { snapshot: input.snapshot, operation }
  }
}

export async function rebuildTransactionReceipt(input: {
  readonly storage: WorkspaceStore
  readonly reader: LocalWorkspaceReader
  readonly snapshot: WorkspaceChangeTransactionSnapshot
}): Promise<ChangeSetReceipt> {
  const transaction = input.snapshot.transaction
  if (transaction.operation === "undo") {
    const operations = await input.storage.listWorkspaceChangeOperations({
      changeSetId: transaction.changeSetId
    })
    const source = operations.find(
      (operation) => operation.id === transaction.undoSourceOperationId
    )
    if (source === undefined) {
      throw new Error("workspace recovery lost its undo source operation")
    }
    return {
      changeSetId: transaction.changeSetId,
      status: "applied",
      files: source.receipt.files.map((file) => appliedFileRecord(
        { path: file.path, kind: file.kind, merged: false },
        {
          beforeText: file.afterText,
          afterText: file.beforeText,
          beforeSha256: file.afterSha256,
          afterSha256: file.beforeSha256
        }
      )),
      conflicts: []
    }
  }

  const changeSet = await input.storage.getWorkspaceChangeSet({
    changeSetId: transaction.changeSetId
  })
  if (changeSet === null) {
    throw new Error("workspace recovery lost its changeset")
  }
  const fileByPath = new Map(input.snapshot.files.map((file) => [file.path, file]))
  const files = []
  for (const change of changeSet.changeSet.changes) {
    const durable = fileByPath.get(change.path)
    if (durable !== undefined) {
      files.push(appliedFileRecord(
        {
          path: change.path,
          kind: change.kind,
          merged: change.kind === "update" &&
            durable.afterText !== change.targetText
        },
        {
          beforeText: durable.beforeText,
          afterText: durable.afterText,
          beforeSha256: durable.beforeSha256,
          afterSha256: durable.afterSha256
        }
      ))
      continue
    }
    const current = await input.reader.readText(change.path)
    const currentSha256 = current === null ? undefined : sha256(current)
    files.push(appliedFileRecord(
      { path: change.path, kind: change.kind, merged: false },
      {
        beforeText: current ?? undefined,
        afterText: current ?? undefined,
        beforeSha256: currentSha256,
        afterSha256: currentSha256
      }
    ))
  }
  return {
    changeSetId: transaction.changeSetId,
    status: "applied",
    files,
    conflicts: []
  }
}
