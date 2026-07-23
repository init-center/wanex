import { createTurnExecutionBinding } from "../src/execution/turn-binding.js"
import { WanexSessionCore } from "../src/sessions/index.js"
import type { MessagePart, ProviderProfile } from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"

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
    readonly recovery: import("@wanex/protocol").SessionTurnRecoveryBinding
  }
}

export async function createStartedTurn(
  storage: CoreStore,
  options: {
    readonly suffix: string
    readonly content?: readonly MessagePart[]
    readonly profile?: ProviderProfile
    readonly maxSteps?: number
    readonly sessionId?: string
    readonly leaseMs?: number
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
      profile: options.profile ?? fakeProfile(suffix),
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
      recovery: started.turn.executionBinding.recovery
    }
  }
}

export function fakeProfile(suffix: string): ProviderProfile {
  return {
    id: "profile_" + suffix,
    kind: "fake",
    capabilities: { input: ["text"], output: ["text"] },
    providerId: "fake",
    modelId: "model_" + suffix
  }
}
