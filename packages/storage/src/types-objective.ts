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

export interface ObjectiveStore {
  putObjectiveRun(request: PutObjectiveRunRequest): Promise<ObjectiveRunRecord>
  getObjectiveRun(
    request: GetObjectiveRunRequest
  ): Promise<ObjectiveRunRecord | null>
  listObjectiveRuns(
    request: ListObjectiveRunsRequest
  ): Promise<ObjectiveRunRecord[]>
  recordObjectiveRunOperation(
    request: RecordObjectiveRunOperationRequest
  ): Promise<ObjectiveRunOperationRecord>
  listObjectiveRunOperations(
    request: ListObjectiveRunOperationsRequest
  ): Promise<ObjectiveRunOperationRecord[]>
  putObjectiveAttempt(
    request: PutObjectiveAttemptRequest
  ): Promise<ObjectiveAttemptRecord>
  listObjectiveAttempts(
    request: ListObjectiveAttemptsRequest
  ): Promise<ObjectiveAttemptRecord[]>
  putObjectiveVerification(
    request: PutObjectiveVerificationRequest
  ): Promise<ObjectiveVerificationRecord>
  listObjectiveVerifications(
    request: ListObjectiveVerificationsRequest
  ): Promise<ObjectiveVerificationRecord[]>
}
