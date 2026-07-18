import type {
  GetObjectiveRunRequest,
  ListObjectiveAttemptsRequest,
  ListObjectiveRunOperationsRequest,
  ListObjectiveRunsRequest,
  ListObjectiveVerificationsRequest,
  ObjectiveAttemptRecord,
  ObjectiveRunOperationRecord,
  ObjectiveRunRecord,
  ObjectiveVerificationRecord,
  PutObjectiveAttemptRequest,
  PutObjectiveRunRequest,
  PutObjectiveVerificationRequest,
  RecordObjectiveRunOperationRequest
} from "@wanex/protocol"

import {
  fromRpcObjectiveAttemptRecord,
  fromRpcObjectiveRunOperationRecord,
  fromRpcObjectiveRunRecord,
  fromRpcObjectiveVerificationRecord,
  toRpcListObjectiveAttemptsRequest,
  toRpcListObjectiveRunOperationsRequest,
  toRpcListObjectiveRunsRequest,
  toRpcListObjectiveVerificationsRequest,
  toRpcPutObjectiveAttemptRequest,
  toRpcPutObjectiveRunRequest,
  toRpcPutObjectiveVerificationRequest,
  toRpcRecordObjectiveRunOperationRequest
} from "./codec-objective.js"
import { assertArray } from "./codec-helpers.js"
import { RpcStoreFacetBase } from "./rpc-store-base.js"
import type { ObjectiveStorageRpcCommand } from "./generated/storage-rpc.js"

export class ObjectiveStoreMethods extends RpcStoreFacetBase {
  async putObjectiveRun(request: PutObjectiveRunRequest): Promise<ObjectiveRunRecord> {
    const value = await this.callObjective({
      command: "put-objective-run",
      request: toRpcPutObjectiveRunRequest(request)
    })
    return fromRpcObjectiveRunRecord(value)
  }

  async getObjectiveRun(
    request: GetObjectiveRunRequest
  ): Promise<ObjectiveRunRecord | null> {
    const value = await this.callObjective({
      command: "get-objective-run",
      objective_id: request.objectiveId
    })
    return value === null ? null : fromRpcObjectiveRunRecord(value)
  }

  async listObjectiveRuns(
    request: ListObjectiveRunsRequest
  ): Promise<ObjectiveRunRecord[]> {
    const value = await this.callObjective({
      command: "list-objective-runs",
      request: toRpcListObjectiveRunsRequest(request)
    })
    assertArray(value, "objective runs")
    return value.map(fromRpcObjectiveRunRecord)
  }

  async recordObjectiveRunOperation(
    request: RecordObjectiveRunOperationRequest
  ): Promise<ObjectiveRunOperationRecord> {
    const value = await this.callObjective({
      command: "record-objective-run-operation",
      request: toRpcRecordObjectiveRunOperationRequest(request)
    })
    return fromRpcObjectiveRunOperationRecord(value)
  }

  async listObjectiveRunOperations(
    request: ListObjectiveRunOperationsRequest
  ): Promise<ObjectiveRunOperationRecord[]> {
    const value = await this.callObjective({
      command: "list-objective-run-operations",
      request: toRpcListObjectiveRunOperationsRequest(request)
    })
    assertArray(value, "objective run operations")
    return value.map(fromRpcObjectiveRunOperationRecord)
  }

  async putObjectiveAttempt(
    request: PutObjectiveAttemptRequest
  ): Promise<ObjectiveAttemptRecord> {
    const value = await this.callObjective({
      command: "put-objective-attempt",
      request: toRpcPutObjectiveAttemptRequest(request)
    })
    return fromRpcObjectiveAttemptRecord(value)
  }

  async listObjectiveAttempts(
    request: ListObjectiveAttemptsRequest
  ): Promise<ObjectiveAttemptRecord[]> {
    const value = await this.callObjective({
      command: "list-objective-attempts",
      request: toRpcListObjectiveAttemptsRequest(request)
    })
    assertArray(value, "objective attempts")
    return value.map(fromRpcObjectiveAttemptRecord)
  }

  async putObjectiveVerification(
    request: PutObjectiveVerificationRequest
  ): Promise<ObjectiveVerificationRecord> {
    const value = await this.callObjective({
      command: "put-objective-verification",
      request: toRpcPutObjectiveVerificationRequest(request)
    })
    return fromRpcObjectiveVerificationRecord(value)
  }

  async listObjectiveVerifications(
    request: ListObjectiveVerificationsRequest
  ): Promise<ObjectiveVerificationRecord[]> {
    const value = await this.callObjective({
      command: "list-objective-verifications",
      request: toRpcListObjectiveVerificationsRequest(request)
    })
    assertArray(value, "objective verifications")
    return value.map(fromRpcObjectiveVerificationRecord)
  }

  private callObjective(request: ObjectiveStorageRpcCommand) {
    return this.call(request)
  }
}
