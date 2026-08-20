import type {
  WorkspaceChangeTransactionFileRecord,
  WorkspaceChangeTransactionFilePlan
} from "@wanex/protocol"
import { WorkspaceTransactionCleanupRequiredError } from "./errors.js"
import { spawnNativeWorkspaceTransaction } from "./native-helper.js"

export async function cleanupCommittedArtifacts(input: {
  readonly canonicalRoot: string
  readonly serviceBin: string
  readonly transactionId: string
  readonly files: readonly WorkspaceChangeTransactionFilePlan[]
  readonly helper: Awaited<ReturnType<typeof spawnNativeWorkspaceTransaction>>
}): Promise<void> {
  try {
    await input.helper.cleanup(input.files)
    return
  } catch (firstError) {
    await input.helper.terminate()
    try {
      const retry = await spawnNativeWorkspaceTransaction({
        rootDir: input.canonicalRoot,
        serviceBin: input.serviceBin,
        transactionId: input.transactionId
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
  readonly transactionId: string
  readonly files: readonly WorkspaceChangeTransactionFileRecord[]
}): Promise<void> {
  if (input.files.length === 0) return
  const helper = await spawnNativeWorkspaceTransaction({
    rootDir: input.canonicalRoot,
    serviceBin: input.serviceBin,
    transactionId: input.transactionId
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
