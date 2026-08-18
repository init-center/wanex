import { randomUUID } from "node:crypto"
import type { SessionInputRecord } from "@wanex/protocol"
import type { WanexAppConversationOperationController } from "./conversation-operation.js"
import type { BootstrappedWanexAppRuntime } from "./runtime.js"
import type {
  WanexAppQueueGuidedFollowUpRequest,
  WanexAppQueueGuidedFollowUpResult
} from "./types-workflow.js"
import { defaultPrincipalId, normalizeOptionalRef } from "./workflow-shared.js"

const defaultGuidedFollowUpSourceRef = "guided-follow-up"

export async function queueWanexAppGuidedFollowUp(
  runtime: BootstrappedWanexAppRuntime,
  conversationOperations: WanexAppConversationOperationController,
  options: {
    readonly request: WanexAppQueueGuidedFollowUpRequest
    readonly modelEndpointId: string
  }
): Promise<WanexAppQueueGuidedFollowUpResult> {
  const text = options.request.text.trim()
  if (text.length === 0) {
    throw new Error("guided follow-up text must not be empty")
  }
  const activeTurnId = options.request.activeTurnId.trim()
  if (activeTurnId.length === 0) {
    throw new Error("guided follow-up activeTurnId must not be empty")
  }
  if ((await runtime.storage.getSession(options.request.sessionId)) === null) {
    throw new Error(`guided follow-up session not found: ${options.request.sessionId}`)
  }
  const inputId = options.request.inputId ?? `inp_${randomUUID()}`
  const sourceRef =
    normalizeOptionalRef(options.request.sourceRef) ??
    defaultGuidedFollowUpSourceRef
  const receipt = await conversationOperations.submit({
    request: {
      content: [{ type: "text", text }],
      sessionId: options.request.sessionId,
      principalId: options.request.principalId ?? defaultPrincipalId,
      inputId,
      ...(options.request.turnId === undefined
        ? {}
        : { turnId: options.request.turnId }),
      idempotencyKey:
        options.request.idempotencyKey ??
        `wanex-app-guided:${options.request.sessionId}:${inputId}`,
      ...(options.request.jobId === undefined ? {} : { jobId: options.request.jobId }),
      ...(options.request.jobIdempotencyKey === undefined
        ? {}
        : { jobIdempotencyKey: options.request.jobIdempotencyKey }),
      origin: {
        kind: "interactive",
        sourceRef,
        parentRef: activeTurnId
      },
      intent: "follow_up",
      runControlPolicy: "queue_after_current",
      expectedTurnId: activeTurnId
    },
    modelEndpointId: options.modelEndpointId
  })
  const [inputs, turns, job] = await Promise.all([
    runtime.storage.listSessionInputs({ sessionId: options.request.sessionId }),
    runtime.storage.listSessionTurns({ sessionId: options.request.sessionId }),
    runtime.storage.getJob({ jobId: receipt.jobId })
  ])
  const input = inputs.find((candidate) => candidate.id === receipt.inputId)
  const turn = turns.find((candidate) => candidate.id === receipt.turnId)
  if (input === undefined || turn === undefined || job === null) {
    throw new Error("guided follow-up durable records were not found")
  }
  return {
    sessionId: options.request.sessionId,
    activeTurnId,
    modelEndpointId: turn.executionBinding.modelEndpoint.endpointId,
    input: projectQueuedInput(input),
    job: {
      jobId: job.id,
      kind: "session.turn",
      state: job.state,
      modelEndpointId: turn.executionBinding.modelEndpoint.endpointId
    },
    receipt
  }
}

function projectQueuedInput(
  input: SessionInputRecord
): WanexAppQueueGuidedFollowUpResult["input"] {
  if (
    input.origin?.kind !== "interactive" ||
    input.origin.sourceRef === undefined ||
    input.origin.parentRef === undefined ||
    input.intent !== "follow_up" ||
    input.runControlPolicy !== "queue_after_current" ||
    input.expectedTurnId === undefined
  ) {
    throw new Error("guided follow-up input did not persist required provenance")
  }
  return {
    inputId: input.id,
    status: "admitted",
    intent: "follow_up",
    originKind: "interactive",
    sourceRef: input.origin.sourceRef,
    parentRef: input.origin.parentRef,
    runControlPolicy: "queue_after_current",
    expectedTurnId: input.expectedTurnId
  }
}
