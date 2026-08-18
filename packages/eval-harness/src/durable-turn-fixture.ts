import type {
  MessagePart,
  ModelEndpoint,
  SessionTurnExecutionBinding,
  StartSessionTurnAttemptReceipt,
  SubmitSessionTurnReceipt
} from "@wanex/protocol"
import type { WanexSessionCore } from "@wanex/runtime/sessions"
import {
  modelEndpointToJson,
  normalizeModelEndpoint
} from "@wanex/runtime/provider"
import { evalFakeModelEndpoint } from "./scenario-utils.js"

const evalModelEndpoint = evalFakeModelEndpoint(
  "eval-durable-turn",
  "eval-durable-turn-model",
  "eval"
)

export interface StartEvalTurnRequest {
  readonly session: WanexSessionCore
  readonly sessionId: string
  readonly principalId: string
  readonly inputId: string
  readonly turnId: string
  readonly jobId: string
  readonly workerId: string
  readonly idempotencyKey: string
  readonly content: readonly MessagePart[]
  readonly modelEndpoint?: ModelEndpoint
  readonly maxSteps?: number
}

export interface StartedEvalTurn {
  readonly submitted: SubmitSessionTurnReceipt
  readonly started: StartSessionTurnAttemptReceipt
  readonly identity: {
    readonly sessionId: string
    readonly turnId: string
    readonly attemptId: string
    readonly inputId: string
    readonly jobId: string
    readonly workerId: string
    readonly leaseToken: string
  }
}

export async function startEvalTurn(
  request: StartEvalTurnRequest
): Promise<StartedEvalTurn> {
  const submitted = await request.session.submitTurn({
    id: request.inputId,
    turnId: request.turnId,
    sessionId: request.sessionId,
    principalId: request.principalId,
    idempotencyKey: request.idempotencyKey,
    content: request.content,
    jobId: request.jobId,
    jobIdempotencyKey: request.idempotencyKey + ":job",
    executionBinding: createEvalTurnBinding(request.modelEndpoint),
    maxSteps: request.maxSteps ?? 1
  })
  const job = await request.session.claimJob({
    workerId: request.workerId,
    leaseMs: 60_000,
    kinds: ["session.turn"]
  })
  if (job === null || job.id !== submitted.job.id) {
    throw new Error("expected exact session turn job " + submitted.job.id)
  }
  if (job.leaseToken === undefined) {
    throw new Error("claimed session turn job has no lease token: " + job.id)
  }
  const started = await request.session.startTurnAttempt({
    sessionId: request.sessionId,
    turnId: submitted.turn.id,
    inputId: submitted.admission.inputId,
    jobId: job.id,
    workerId: request.workerId,
    leaseToken: job.leaseToken
  })
  return {
    submitted,
    started,
    identity: {
      sessionId: request.sessionId,
      turnId: submitted.turn.id,
      attemptId: started.attempt.id,
      inputId: submitted.admission.inputId,
      jobId: job.id,
      workerId: request.workerId,
      leaseToken: job.leaseToken
    }
  }
}

export async function settleEvalTurn(
  session: WanexSessionCore,
  turn: StartedEvalTurn,
  assistantMessage: readonly MessagePart[]
): Promise<void> {
  const invocation = await session.beginProviderInvocation({
    ...turn.identity,
    step: 1,
    invocationNumber: 1,
    requestDigest: `eval:${turn.identity.turnId}:final`
  })
  await session.settleTurn({
    ...turn.identity,
    outcome: "succeeded",
    providerInvocationId: invocation.id,
    assistantMessage
  })
}

function createEvalTurnBinding(
  modelEndpoint: ModelEndpoint = evalModelEndpoint
): SessionTurnExecutionBinding {
  const endpoint = normalizeModelEndpoint(modelEndpoint)
  const binding = {
    createdAt: Date.now(),
    modelEndpoint: {
      endpointId: endpoint.id,
      endpointDigest: digestJson(modelEndpointToJson(endpoint)),
      connection: endpoint.connection,
      protocol: endpoint.protocol,
      model: endpoint.model
    },
    completion: { maxOutputTokens: 4_096 },
    capabilityRoutes: [],
    resources: [],
    recovery: {
      providerMaxAttempts: 2,
      idempotentToolMaxAttempts: 2
    }
  }
  return { digest: digestJson(binding), ...binding }
}

function digestJson(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex")
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value))
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson)
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJson(item)])
    )
  }
  return value
}
import { createHash } from "node:crypto"
