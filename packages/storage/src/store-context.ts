import type {
  ActivateContextEpochRequest,
  BeginContextEpochRequest,
  ContextEpochPruneReceipt,
  ContextEpochRecord,
  FinishContextEpochGenerationRequest,
  GetActiveContextEpochRequest,
  ListContextEpochsRequest,
  MarkContextEpochDispatchedRequest,
  MarkContextEpochOutputObservedRequest,
  PruneContextEpochsRequest
} from "@wanex/protocol"

import {
  assertArray,
  fromRpcContextEpochPruneReceipt,
  fromRpcContextEpochRecord,
  toRpcActivateContextEpochRequest,
  toRpcBeginContextEpochRequest,
  toRpcFinishContextEpochGenerationRequest,
  toRpcGetActiveContextEpochRequest,
  toRpcListContextEpochsRequest,
  toRpcMarkContextEpochDispatchedRequest,
  toRpcMarkContextEpochOutputObservedRequest,
  toRpcPruneContextEpochsRequest
} from "./codec.js"
import { RpcStoreFacetBase } from "./rpc-store-base.js"
import type { ContextStorageRpcCommand } from "./generated/storage-rpc.js"

export class ContextStoreMethods extends RpcStoreFacetBase {
  async beginContextEpoch(
    request: BeginContextEpochRequest
  ): Promise<ContextEpochRecord> {
    return fromRpcContextEpochRecord(await this.callContext({
      command: "begin-context-epoch",
      request: toRpcBeginContextEpochRequest(request)
    }))
  }

  async markContextEpochDispatched(
    request: MarkContextEpochDispatchedRequest
  ): Promise<ContextEpochRecord> {
    return fromRpcContextEpochRecord(await this.callContext({
      command: "mark-context-epoch-dispatched",
      request: toRpcMarkContextEpochDispatchedRequest(request)
    }))
  }

  async markContextEpochOutputObserved(
    request: MarkContextEpochOutputObservedRequest
  ): Promise<ContextEpochRecord> {
    return fromRpcContextEpochRecord(await this.callContext({
      command: "mark-context-epoch-output-observed",
      request: toRpcMarkContextEpochOutputObservedRequest(request)
    }))
  }

  async finishContextEpochGeneration(
    request: FinishContextEpochGenerationRequest
  ): Promise<ContextEpochRecord> {
    return fromRpcContextEpochRecord(await this.callContext({
      command: "finish-context-epoch-generation",
      request: toRpcFinishContextEpochGenerationRequest(request)
    }))
  }

  async activateContextEpoch(
    request: ActivateContextEpochRequest
  ): Promise<ContextEpochRecord> {
    return fromRpcContextEpochRecord(await this.callContext({
      command: "activate-context-epoch",
      request: toRpcActivateContextEpochRequest(request)
    }))
  }

  async pruneContextEpochs(
    request: PruneContextEpochsRequest
  ): Promise<ContextEpochPruneReceipt> {
    return fromRpcContextEpochPruneReceipt(await this.callContext({
      command: "prune-context-epochs",
      request: toRpcPruneContextEpochsRequest(request)
    }))
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

  private callContext(request: ContextStorageRpcCommand) {
    return this.call(request)
  }
}
