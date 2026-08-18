import type {
  ModelEndpoint,
  SubmitSessionTurnRequest,
  SubmitSessionTurnReceipt
} from "@wanex/protocol"
import {
  createTestTurnExecutionBinding,
  type StorageTestStore
} from "@wanex/storage/testing"
import { appTestModelEndpoint } from "./model-endpoint-fixture.js"

type TestTurnRequest = Omit<SubmitSessionTurnRequest, "executionBinding"> & {
  readonly modelEndpoint?: ModelEndpoint
}

export async function submitTestTurn(
  storage: StorageTestStore,
  request: TestTurnRequest
): Promise<SubmitSessionTurnReceipt> {
  const modelEndpoint = request.modelEndpoint ?? appTestModelEndpoint()
  const { modelEndpoint: _modelEndpoint, ...submission } = request
  return await storage.submitSessionTurn({
    ...submission,
    executionBinding: createTestTurnExecutionBinding(modelEndpoint)
  })
}

export async function startTestTurn(
  storage: StorageTestStore,
  submitted: SubmitSessionTurnReceipt,
  workerId: string
) {
  const job = await storage.claimJob({
    workerId,
    leaseMs: 60_000,
    kinds: ["session.turn"]
  })
  if (job === null || job.id !== submitted.job.id || job.leaseToken === undefined) {
    throw new Error("expected exact claimed session.turn job")
  }
  const started = await storage.startSessionTurnAttempt({
    sessionId: submitted.turn.sessionId,
    turnId: submitted.turn.id,
    inputId: submitted.admission.inputId,
    jobId: submitted.job.id,
    workerId,
    leaseToken: job.leaseToken
  })
  return { submitted, job, started, workerId, leaseToken: job.leaseToken }
}
