import type {
  ActivateContextEpochRequest,
  CloneContextEpochRequest,
  ContextEpochPruneReceipt,
  ContextEpochRecord,
  ContextReplacementRecord,
  GetActiveContextEpochRequest,
  ListContextEpochsRequest,
  ListContextReplacementsRequest,
  PruneContextEpochsRequest,
  PutContextEpochRequest,
  PutContextReplacementRequest
} from "@wanex/protocol"

import {
  assertArray,
  fromRpcContextEpochPruneReceipt,
  fromRpcContextEpochRecord,
  fromRpcContextReplacementRecord,
  toRpcActivateContextEpochRequest,
  toRpcCloneContextEpochRequest,
  toRpcGetActiveContextEpochRequest,
  toRpcListContextEpochsRequest,
  toRpcListContextReplacementsRequest,
  toRpcPruneContextEpochsRequest,
  toRpcPutContextEpochRequest,
  toRpcPutContextReplacementRequest
} from "./codec.js"
import { RpcStoreFacetBase } from "./rpc-store-base.js"
import type { ContextStorageRpcCommand } from "./generated/storage-rpc.js"

export class ContextStoreMethods extends RpcStoreFacetBase {
  async putContextEpoch(
    request: PutContextEpochRequest
  ): Promise<ContextEpochRecord> {
    const value = await this.callContext({
      command: "put-context-epoch",
      request: toRpcPutContextEpochRequest(request)
    })
    return fromRpcContextEpochRecord(value)
  }

  async activateContextEpoch(
    request: ActivateContextEpochRequest
  ): Promise<ContextEpochRecord> {
    const value = await this.callContext({
      command: "activate-context-epoch",
      request: toRpcActivateContextEpochRequest(request)
    })
    return fromRpcContextEpochRecord(value)
  }

  async cloneContextEpoch(
    request: CloneContextEpochRequest
  ): Promise<ContextEpochRecord> {
    const value = await this.callContext({
      command: "clone-context-epoch",
      request: toRpcCloneContextEpochRequest(request)
    })
    return fromRpcContextEpochRecord(value)
  }

  async pruneContextEpochs(
    request: PruneContextEpochsRequest
  ): Promise<ContextEpochPruneReceipt> {
    const value = await this.callContext({
      command: "prune-context-epochs",
      request: toRpcPruneContextEpochsRequest(request)
    })
    return fromRpcContextEpochPruneReceipt(value)
  }

  async listContextEpochs(
    request: ListContextEpochsRequest
  ): Promise<ContextEpochRecord[]> {
    const value = await this.callContext({
      command: "list-context-epochs",
      request: toRpcListContextEpochsRequest(request)
    })
    assertArray(value, "context epochs")
    return value.map(fromRpcContextEpochRecord)
  }

  async getActiveContextEpoch(
    request: GetActiveContextEpochRequest
  ): Promise<ContextEpochRecord | null> {
    const value = await this.callContext({
      command: "get-active-context-epoch",
      request: toRpcGetActiveContextEpochRequest(request)
    })
    return value === null ? null : fromRpcContextEpochRecord(value)
  }

  async putContextReplacement(
    request: PutContextReplacementRequest
  ): Promise<ContextReplacementRecord> {
    const value = await this.callContext({
      command: "put-context-replacement",
      request: toRpcPutContextReplacementRequest(request)
    })
    return fromRpcContextReplacementRecord(value)
  }

  async listContextReplacements(
    request: ListContextReplacementsRequest
  ): Promise<ContextReplacementRecord[]> {
    const value = await this.callContext({
      command: "list-context-replacements",
      request: toRpcListContextReplacementsRequest(request)
    })
    assertArray(value, "context replacements")
    return value.map(fromRpcContextReplacementRecord)
  }

  private callContext(request: ContextStorageRpcCommand) {
    return this.call(request)
  }
}
