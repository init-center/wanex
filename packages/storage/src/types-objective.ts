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

export interface ObjectiveStore {
  createObjective(request: CreateObjectiveRequest): Promise<ObjectiveRecord>
  getObjective(request: GetObjectiveRequest): Promise<ObjectiveRecord | null>
  listObjectives(request: ListObjectivesRequest): Promise<ObjectiveRecord[]>
  pauseObjective(request: PauseObjectiveRequest): Promise<ObjectiveRecord>
  resumeObjective(request: ResumeObjectiveRequest): Promise<ObjectiveRecord>
  admitObjectiveAttempt(
    request: AdmitObjectiveAttemptRequest
  ): Promise<AdmitObjectiveAttemptReceipt>
  reviewObjectiveAttempt(
    request: ReviewObjectiveAttemptRequest
  ): Promise<ReviewObjectiveAttemptReceipt>
  requestObjectiveCancel(
    request: RequestObjectiveCancelRequest
  ): Promise<RequestObjectiveCancelReceipt>
  reconcileObjectiveCancellation(
    request: ReconcileObjectiveCancellationRequest
  ): Promise<ObjectiveRecord>
  listObjectiveAttempts(
    request: ListObjectiveAttemptsRequest
  ): Promise<ObjectiveAttemptRecord[]>
  listObjectiveAttemptReviews(
    request: ListObjectiveAttemptReviewsRequest
  ): Promise<ObjectiveAttemptReviewRecord[]>
  listObjectiveVerifications(
    request: ListObjectiveVerificationsRequest
  ): Promise<ObjectiveVerificationRecord[]>
}
