import type {
  BudgetGrantRecord,
  BudgetScopeRecord,
  CommitBudgetRequest,
  RecordBudgetUsageRequest,
  RecordBudgetUsageReceipt,
  ReserveBudgetRequest
} from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"

export class BudgetCommands {
  constructor(private readonly storage: CoreStore) {}

  async reserveBudget(
    request: ReserveBudgetRequest
  ): Promise<BudgetGrantRecord> {
    return await this.storage.reserveBudget(request)
  }

  async commitBudget(
    request: CommitBudgetRequest
  ): Promise<BudgetGrantRecord | null> {
    return await this.storage.commitBudget(request)
  }

  async recordBudgetUsage(
    request: RecordBudgetUsageRequest
  ): Promise<RecordBudgetUsageReceipt> {
    return await this.storage.recordBudgetUsage(request)
  }

  async releaseBudget(grantId: string): Promise<BudgetGrantRecord | null> {
    return await this.storage.releaseBudget({ grantId })
  }

  async getBudgetScope(scopeId: string): Promise<BudgetScopeRecord | null> {
    return await this.storage.getBudgetScope(scopeId)
  }

  async listBudgetGrants(scopeId: string): Promise<BudgetGrantRecord[]> {
    return await this.storage.listBudgetGrants(scopeId)
  }
}
