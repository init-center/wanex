import {
  type BudgetGrantRecord,
  type BudgetScopeRecord,
  type CommitBudgetRequest,
  type RecordBudgetUsageRequest,
  type RecordBudgetUsageReceipt,
  type ReserveBudgetRequest
} from "@wanex/protocol"

import {
  assertArray,
  fromRpcBudgetGrantRecord,
  fromRpcBudgetScopeRecord,
  fromRpcRecordBudgetUsageReceipt,
  toRpcCommitBudgetRequest,
  toRpcRecordBudgetUsageRequest,
  toRpcReserveBudgetRequest
} from "./codec.js"
import { RpcStoreFacetBase } from "./rpc-store-base.js"
import type { SchedulerStorageRpcCommand } from "./generated/storage-rpc.js"

export class BudgetStoreMethods extends RpcStoreFacetBase {
  async reserveBudget(
    request: ReserveBudgetRequest
  ): Promise<BudgetGrantRecord> {
    const value = await this.callScheduler({
      command: "reserve-budget",
      request: toRpcReserveBudgetRequest(request)
    })
    return fromRpcBudgetGrantRecord(value)
  }

  async commitBudget(
    request: CommitBudgetRequest
  ): Promise<BudgetGrantRecord | null> {
    const value = await this.callScheduler({
      command: "commit-budget",
      request: toRpcCommitBudgetRequest(request)
    })
    return value === null ? null : fromRpcBudgetGrantRecord(value)
  }

  async recordBudgetUsage(
    request: RecordBudgetUsageRequest
  ): Promise<RecordBudgetUsageReceipt> {
    return fromRpcRecordBudgetUsageReceipt(await this.callScheduler({
      command: "record-budget-usage",
      request: toRpcRecordBudgetUsageRequest(request)
    }))
  }

  async releaseBudget(request: {
    readonly grantId: string
  }): Promise<BudgetGrantRecord | null> {
    const value = await this.callScheduler({
      command: "release-budget",
      grant_id: request.grantId
    })
    return value === null ? null : fromRpcBudgetGrantRecord(value)
  }

  async getBudgetScope(scopeId: string): Promise<BudgetScopeRecord | null> {
    const value = await this.callScheduler({
      command: "get-budget-scope",
      scope_id: scopeId
    })
    return value === null ? null : fromRpcBudgetScopeRecord(value)
  }

  async listBudgetGrants(scopeId: string): Promise<BudgetGrantRecord[]> {
    const value = await this.callScheduler({
      command: "list-budget-grants",
      scope_id: scopeId
    })
    assertArray(value, "budget grants")
    return value.map(fromRpcBudgetGrantRecord)
  }

  private callScheduler(request: SchedulerStorageRpcCommand) {
    return this.call(request)
  }
}
