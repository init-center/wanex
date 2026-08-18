import { createTurnExecutionBinding } from "../src/execution/turn-binding.js"
import { WanexSessionCore } from "../src/sessions/index.js"
import type { MessagePart, ModelEndpoint } from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import type { PreparedAgentContext } from "../src/context/index.js"
import { fakeModelEndpoint } from "./model-endpoint-fixture.js"

export interface StartedTurnFixture {
  readonly session: WanexSessionCore
  readonly submitted: Awaited<ReturnType<WanexSessionCore["submitTurn"]>>
  readonly job: NonNullable<Awaited<ReturnType<WanexSessionCore["claimJob"]>>>
  readonly started: Awaited<ReturnType<WanexSessionCore["startTurnAttempt"]>>
  readonly execution: {
    readonly sessionId: string
    readonly turnId: string
    readonly attemptId: string
    readonly inputId: string
    readonly jobId: string
    readonly workerId: string
    readonly leaseToken: string
    readonly principalId: string
    readonly maxSteps: number
    readonly maxOutputTokens: number
    readonly recovery: import("@wanex/protocol").SessionTurnRecoveryBinding
  }
}

export async function createStartedTurn(
  storage: CoreStore,
  options: {
    readonly suffix: string
    readonly content?: readonly MessagePart[]
    readonly modelEndpoint?: ModelEndpoint
    readonly maxSteps?: number
    readonly sessionId?: string
    readonly leaseMs?: number
    readonly agentContext?: PreparedAgentContext
  }
): Promise<StartedTurnFixture> {
  const suffix = options.suffix
  const sessionId = options.sessionId ?? "ses_" + suffix
  const inputId = "inp_" + suffix
  const turnId = "turn_" + suffix
  const jobId = "job_" + suffix
  const workerId = "worker_" + suffix
  const principalId = "principal_" + suffix
  const session = new WanexSessionCore({ storage })
  if ((await session.get(sessionId)) === null) {
    await session.create({ id: sessionId, kind: "agent" })
  }
  const submitted = await session.submitTurn({
    id: inputId,
    turnId,
    sessionId,
    principalId,
    idempotencyKey: "idem_" + suffix,
    content:
      options.content ?? [{
        type: "text",
        id: "part_" + suffix,
        text: "user " + suffix
      }],
    jobId,
    executionBinding: createTurnExecutionBinding({
      modelEndpoint: options.modelEndpoint ?? fakeModelEndpoint(suffix),
      ...(options.agentContext === undefined
        ? {}
        : { agentContext: options.agentContext }),
      createdAt: 1
    }),
    maxSteps: options.maxSteps ?? 4
  })
  const job = await session.claimJob({
    workerId,
    leaseMs: options.leaseMs ?? 60_000,
    kinds: ["session.turn"]
  })
  if (job === null || job.leaseToken === undefined) {
    throw new Error("expected claimed session turn job for " + suffix)
  }
  const started = await session.startTurnAttempt({
    sessionId,
    turnId,
    inputId,
    jobId,
    workerId,
    leaseToken: job.leaseToken
  })
  return {
    session,
    submitted,
    job,
    started,
    execution: {
      sessionId,
      turnId,
      attemptId: started.attempt.id,
      inputId,
      jobId,
      workerId,
      leaseToken: job.leaseToken,
      principalId,
      maxSteps: options.maxSteps ?? 4,
      maxOutputTokens: started.turn.executionBinding.completion.maxOutputTokens,
      recovery: started.turn.executionBinding.recovery
    }
  }
}
