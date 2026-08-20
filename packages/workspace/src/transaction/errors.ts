import type { WorkspaceChangeTransactionFinalization } from "@wanex/protocol"

export class WorkspaceTransactionRecoveryRequiredError extends Error {
  readonly transactionId: string
  readonly finalization: WorkspaceChangeTransactionFinalization | undefined

  constructor(
    transactionId: string,
    cause: unknown,
    finalization?: WorkspaceChangeTransactionFinalization
  ) {
    super("workspace transaction requires recovery", { cause })
    this.name = "WorkspaceTransactionRecoveryRequiredError"
    this.transactionId = transactionId
    this.finalization = finalization
  }
}

export class WorkspaceTransactionCleanupRequiredError extends Error {
  readonly transactionId: string

  constructor(transactionId: string, cause: unknown) {
    super("workspace transaction artifact cleanup requires retry", { cause })
    this.name = "WorkspaceTransactionCleanupRequiredError"
    this.transactionId = transactionId
  }
}
