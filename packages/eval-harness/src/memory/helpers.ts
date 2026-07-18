import { WanexSessionCore } from "@wanex/runtime/sessions"
import { assert } from "../scenario-utils.js"

export const MEMORY_PROJECTION_SESSION_ID = "ses_eval_memory_projection"
export const MEMORY_REPLAY_SESSION_ID = "ses_eval_memory_replay"
export const MEMORY_SWEEP_SESSION_ID = "ses_eval_memory_sweep"

export function contextCompactionEventTypes(types: readonly string[]): string[] {
  return [
    "context.compaction.planned",
    "context.compaction.applied",
    "context.compaction.skipped"
  ].filter((type) => types.includes(type))
}

export function replayPolicy() {
  return {
    version: "eval-memory-replay-v1",
    recentUserTurns: 1,
    snipTextOverChars: 20,
    placeholderTextOverChars: 60
  }
}

export function sweepPolicy() {
  return {
    version: "eval-memory-sweep-v1",
    recentUserTurns: 0,
    snipTextOverChars: 20,
    placeholderTextOverChars: 60
  }
}

export async function seedCompletedMemoryTurn(
  session: WanexSessionCore
): Promise<void> {
  await session.create({
    id: MEMORY_PROJECTION_SESSION_ID,
    kind: "agent"
  })
  await session.admit({
    id: "inp_eval_memory_projection",
    sessionId: MEMORY_PROJECTION_SESSION_ID,
    principalId: "principal_eval_memory",
    idempotencyKey: "idem_eval_memory_projection",
    content: [
      {
        type: "text",
        id: "user_eval_memory_projection",
        text: "please preserve the original history"
      }
    ]
  })
  const claim = await session.claimRunner({
    sessionId: MEMORY_PROJECTION_SESSION_ID,
    runnerId: "runner_eval_memory_projection",
    leaseMs: 60_000
  })
  assert(claim !== null, "seed memory turn should claim the admitted input")
  await session.completeRun({
    sessionId: MEMORY_PROJECTION_SESSION_ID,
    runId: claim.runId,
    inputId: claim.inputId,
    runnerId: claim.runnerId,
    leaseToken: claim.leaseToken,
    assistantMessage: [
      {
        type: "text",
        id: "assistant_eval_memory_projection",
        text: "durable context ".repeat(120)
      }
    ]
  })
}

export async function seedReplaySession(
  session: WanexSessionCore
): Promise<void> {
  await session.create({
    id: MEMORY_REPLAY_SESSION_ID,
    kind: "agent"
  })
  await session.admit({
    id: "inp_eval_memory_replay_old",
    sessionId: MEMORY_REPLAY_SESSION_ID,
    principalId: "principal_eval_memory",
    idempotencyKey: "idem_eval_memory_replay_old",
    content: [
      {
        type: "text",
        id: "user_eval_memory_replay_old",
        text: "please preserve replay history"
      }
    ]
  })
  const oldClaim = await session.claimRunner({
    sessionId: MEMORY_REPLAY_SESSION_ID,
    runnerId: "runner_eval_memory_replay_seed",
    leaseMs: 60_000
  })
  assert(oldClaim !== null, "seed replay turn should claim the admitted input")
  await session.completeRun({
    sessionId: MEMORY_REPLAY_SESSION_ID,
    runId: oldClaim.runId,
    inputId: oldClaim.inputId,
    runnerId: oldClaim.runnerId,
    leaseToken: oldClaim.leaseToken,
    assistantMessage: [
      {
        type: "text",
        id: "assistant_eval_memory_replay_old",
        text: "replay durable context ".repeat(80)
      }
    ]
  })
  await session.admit({
    id: "inp_eval_memory_replay_recent",
    sessionId: MEMORY_REPLAY_SESSION_ID,
    principalId: "principal_eval_memory",
    idempotencyKey: "idem_eval_memory_replay_recent",
    content: [
      {
        type: "text",
        id: "user_eval_memory_replay_recent",
        text: "keep the latest turn raw"
      }
    ]
  })
  const recentClaim = await session.claimRunner({
    sessionId: MEMORY_REPLAY_SESSION_ID,
    runnerId: "runner_eval_memory_replay_recent",
    leaseMs: 60_000
  })
  assert(
    recentClaim !== null,
    "seed replay recent turn should claim the admitted input"
  )
  await session.completeRun({
    sessionId: MEMORY_REPLAY_SESSION_ID,
    runId: recentClaim.runId,
    inputId: recentClaim.inputId,
    runnerId: recentClaim.runnerId,
    leaseToken: recentClaim.leaseToken,
    assistantMessage: [
      {
        type: "text",
        id: "assistant_eval_memory_replay_recent",
        text: "latest turn stays raw"
      }
    ]
  })
}

export async function seedSweepSession(session: WanexSessionCore): Promise<void> {
  await session.create({
    id: MEMORY_SWEEP_SESSION_ID,
    kind: "agent"
  })
  await session.admit({
    id: "inp_eval_memory_sweep",
    sessionId: MEMORY_SWEEP_SESSION_ID,
    principalId: "principal_eval_memory",
    idempotencyKey: "idem_eval_memory_sweep",
    content: [
      {
        type: "text",
        id: "user_eval_memory_sweep",
        text: "please maintain this app-facing session"
      }
    ]
  })
  const claim = await session.claimRunner({
    sessionId: MEMORY_SWEEP_SESSION_ID,
    runnerId: "runner_eval_memory_sweep",
    leaseMs: 60_000
  })
  assert(claim !== null, "seed sweep turn should claim the admitted input")
  await session.completeRun({
    sessionId: MEMORY_SWEEP_SESSION_ID,
    runId: claim.runId,
    inputId: claim.inputId,
    runnerId: claim.runnerId,
    leaseToken: claim.leaseToken,
    assistantMessage: [
      {
        type: "text",
        id: "assistant_eval_memory_sweep",
        text: "sweep product path context ".repeat(90)
      }
    ]
  })
}
