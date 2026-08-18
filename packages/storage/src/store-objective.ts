import type {
  AdmitObjectiveAttemptReceipt,
  AdmitObjectiveAttemptRequest,
  CreateObjectiveRequest,
  GetObjectiveRequest,
  ListObjectiveAttemptReviewsRequest,
  ListObjectiveAttemptsRequest,
  ListObjectivesRequest,
  ListObjectiveVerificationsRequest,
  ObjectiveAttemptRecord,
  ObjectiveAttemptReviewRecord,
  ObjectiveRecord,
  ObjectiveVerificationRecord,
  PauseObjectiveRequest,
  ReconcileObjectiveCancellationRequest,
  RequestObjectiveCancelReceipt,
  RequestObjectiveCancelRequest,
  ResumeObjectiveRequest,
  ReviewObjectiveAttemptReceipt,
  ReviewObjectiveAttemptRequest
} from "@wanex/protocol"

import {
  fromRpcAdmitObjectiveAttemptReceipt,
  fromRpcObjectiveAttemptRecord,
  fromRpcObjectiveAttemptReviewRecord,
  fromRpcObjectiveRecord,
  fromRpcObjectiveVerificationRecord,
  fromRpcRequestObjectiveCancelReceipt,
  fromRpcReviewObjectiveAttemptReceipt,
  toRpcAdmitObjectiveAttemptRequest,
  toRpcChangeObjectiveStateRequest,
  toRpcCreateObjectiveRequest,
  toRpcListObjectiveAttemptReviewsRequest,
  toRpcListObjectiveAttemptsRequest,
  toRpcListObjectivesRequest,
  toRpcListObjectiveVerificationsRequest,
  toRpcReconcileObjectiveCancellationRequest,
  toRpcRequestObjectiveCancelRequest,
  toRpcReviewObjectiveAttemptRequest
} from "./codec-objective.js"
import { assertArray } from "./codec-helpers.js"
import type { ObjectiveStorageRpcCommand } from "./generated/storage-rpc.js"
import { RpcStoreFacetBase } from "./rpc-store-base.js"

export class ObjectiveStoreMethods extends RpcStoreFacetBase {
  async createObjective(request: CreateObjectiveRequest): Promise<ObjectiveRecord> {
    return fromRpcObjectiveRecord(await this.callObjective({
      command: "create-objective",
      request: toRpcCreateObjectiveRequest(request)
    }))
  }

  async getObjective(request: GetObjectiveRequest): Promise<ObjectiveRecord | null> {
    const value = await this.callObjective({
      command: "get-objective",
      objective_id: request.objectiveId
    })
    return value === null ? null : fromRpcObjectiveRecord(value)
  }

  async listObjectives(request: ListObjectivesRequest): Promise<ObjectiveRecord[]> {
    const value = await this.callObjective({
      command: "list-objectives",
      request: toRpcListObjectivesRequest(request)
    })
    assertArray(value, "objectives")
    return value.map(fromRpcObjectiveRecord)
  }

  async pauseObjective(request: PauseObjectiveRequest): Promise<ObjectiveRecord> {
    return fromRpcObjectiveRecord(await this.callObjective({
      command: "pause-objective",
      request: toRpcChangeObjectiveStateRequest(request)
    }))
  }

  async resumeObjective(request: ResumeObjectiveRequest): Promise<ObjectiveRecord> {
    return fromRpcObjectiveRecord(await this.callObjective({
      command: "resume-objective",
      request: toRpcChangeObjectiveStateRequest(request)
    }))
  }

  async admitObjectiveAttempt(
    request: AdmitObjectiveAttemptRequest
  ): Promise<AdmitObjectiveAttemptReceipt> {
    return fromRpcAdmitObjectiveAttemptReceipt(await this.callObjective({
      command: "admit-objective-attempt",
      request: toRpcAdmitObjectiveAttemptRequest(request)
    }))
  }

  async reviewObjectiveAttempt(
    request: ReviewObjectiveAttemptRequest
  ): Promise<ReviewObjectiveAttemptReceipt> {
    return fromRpcReviewObjectiveAttemptReceipt(await this.callObjective({
      command: "review-objective-attempt",
      request: toRpcReviewObjectiveAttemptRequest(request)
    }))
  }

  async requestObjectiveCancel(
    request: RequestObjectiveCancelRequest
  ): Promise<RequestObjectiveCancelReceipt> {
    return fromRpcRequestObjectiveCancelReceipt(await this.callObjective({
      command: "request-objective-cancel",
      request: toRpcRequestObjectiveCancelRequest(request)
    }))
  }

  async reconcileObjectiveCancellation(
    request: ReconcileObjectiveCancellationRequest
  ): Promise<ObjectiveRecord> {
    return fromRpcObjectiveRecord(await this.callObjective({
      command: "reconcile-objective-cancellation",
      request: toRpcReconcileObjectiveCancellationRequest(request)
    }))
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

  async listObjectiveAttemptReviews(
    request: ListObjectiveAttemptReviewsRequest
  ): Promise<ObjectiveAttemptReviewRecord[]> {
    const value = await this.callObjective({
      command: "list-objective-attempt-reviews",
      request: toRpcListObjectiveAttemptReviewsRequest(request)
    })
    assertArray(value, "objective attempt reviews")
    return value.map(fromRpcObjectiveAttemptReviewRecord)
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
