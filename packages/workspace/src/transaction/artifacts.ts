import type {
  WorkspaceChangeTransactionFileRecord,
  WorkspaceChangeTransactionFilePlan
} from "@wanex/protocol"
import { WorkspaceTransactionCleanupRequiredError } from "./errors.js"
import { spawnWorkspaceTransaction } from "./process-executor.js"
import type { BorrowedExecutionScope } from "@wanex/runtime/execution"

export async function cleanupCommittedArtifacts(input: {
  readonly canonicalRoot: string
  readonly serviceBin: string
  readonly executionScope: BorrowedExecutionScope
  readonly transactionId: string
  readonly files: readonly WorkspaceChangeTransactionFilePlan[]
  readonly helper: Awaited<ReturnType<typeof spawnWorkspaceTransaction>>
}): Promise<void> {
  try {
    await input.helper.cleanup(input.files)
    return
  } catch (firstError) {
    await input.helper.terminate()
    try {
      const retry = await spawnWorkspaceTransaction({
        rootDir: input.canonicalRoot,
        serviceBin: input.serviceBin,
        transactionId: input.transactionId,
        executionScope: input.executionScope
      })
      try {
        await retry.cleanup(input.files)
      } finally {
        await retry.terminate()
      }
    } catch (retryError) {
      throw new AggregateError(
        [firstError, retryError],
        "workspace transaction artifact cleanup failed after retry"
      )
    }
  }
}

export async function cleanupTerminalArtifacts(input: {
  readonly canonicalRoot: string
  readonly serviceBin: string
  readonly executionScope: BorrowedExecutionScope
  readonly transactionId: string
  readonly files: readonly WorkspaceChangeTransactionFileRecord[]
}): Promise<void> {
  if (input.files.length === 0) return
  const helper = await spawnWorkspaceTransaction({
    rootDir: input.canonicalRoot,
    serviceBin: input.serviceBin,
    transactionId: input.transactionId,
    executionScope: input.executionScope
  })
  try {
    await cleanupCommittedArtifacts({
      ...input,
      files: transactionFilePlans(input.files),
      helper
    })
  } catch (error) {
    throw new WorkspaceTransactionCleanupRequiredError(
      input.transactionId,
      error
    )
  } finally {
    await helper.terminate()
  }
}

export function transactionFilePlans(
  files: readonly WorkspaceChangeTransactionFileRecord[]
): readonly WorkspaceChangeTransactionFilePlan[] {
  return files.map((file) => ({
    ordinal: file.ordinal,
    path: file.path,
    ...(file.beforeText === undefined ? {} : { beforeText: file.beforeText }),
    ...(file.beforeSha256 === undefined ? {} : { beforeSha256: file.beforeSha256 }),
    ...(file.afterText === undefined ? {} : { afterText: file.afterText }),
    ...(file.afterSha256 === undefined ? {} : { afterSha256: file.afterSha256 })
  }))
}
