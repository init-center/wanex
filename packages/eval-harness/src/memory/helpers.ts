import { WanexSessionCore } from "@wanex/runtime/sessions"
import { settleEvalTurn, startEvalTurn } from "../durable-turn-fixture.js"

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
  const turn = await startEvalTurn({
    session,
    sessionId: MEMORY_PROJECTION_SESSION_ID,
    principalId: "principal_eval_memory",
    inputId: "inp_eval_memory_projection",
    turnId: "turn_eval_memory_projection",
    jobId: "job_eval_memory_projection_turn",
    workerId: "worker_eval_memory_projection",
    idempotencyKey: "idem_eval_memory_projection",
    content: [
      {
        type: "text",
        id: "user_eval_memory_projection",
        text: "please preserve the original history"
      }
    ]
  })
  await settleEvalTurn(session, turn, [
      {
        type: "text",
        id: "assistant_eval_memory_projection",
        text: "durable context ".repeat(120)
      }
    ])
}

export async function seedReplaySession(
  session: WanexSessionCore
): Promise<void> {
  await session.create({
    id: MEMORY_REPLAY_SESSION_ID,
    kind: "agent"
  })
  const oldTurn = await startEvalTurn({
    session,
    sessionId: MEMORY_REPLAY_SESSION_ID,
    principalId: "principal_eval_memory",
    inputId: "inp_eval_memory_replay_old",
    turnId: "turn_eval_memory_replay_old",
    jobId: "job_eval_memory_replay_old",
    workerId: "worker_eval_memory_replay_old",
    idempotencyKey: "idem_eval_memory_replay_old",
    content: [
      {
        type: "text",
        id: "user_eval_memory_replay_old",
        text: "please preserve replay history"
      }
    ]
  })
  await settleEvalTurn(session, oldTurn, [
      {
        type: "text",
        id: "assistant_eval_memory_replay_old",
        text: "replay durable context ".repeat(80)
      }
    ])
  const recentTurn = await startEvalTurn({
    session,
    sessionId: MEMORY_REPLAY_SESSION_ID,
    principalId: "principal_eval_memory",
    inputId: "inp_eval_memory_replay_recent",
    turnId: "turn_eval_memory_replay_recent",
    jobId: "job_eval_memory_replay_recent",
    workerId: "worker_eval_memory_replay_recent",
    idempotencyKey: "idem_eval_memory_replay_recent",
    content: [
      {
        type: "text",
        id: "user_eval_memory_replay_recent",
        text: "keep the latest turn raw"
      }
    ]
  })
  await settleEvalTurn(session, recentTurn, [
      {
        type: "text",
        id: "assistant_eval_memory_replay_recent",
        text: "latest turn stays raw"
      }
    ])
}

export async function seedSweepSession(session: WanexSessionCore): Promise<void> {
  await session.create({
    id: MEMORY_SWEEP_SESSION_ID,
    kind: "agent"
  })
  const turn = await startEvalTurn({
    session,
    sessionId: MEMORY_SWEEP_SESSION_ID,
    principalId: "principal_eval_memory",
    inputId: "inp_eval_memory_sweep",
    turnId: "turn_eval_memory_sweep",
    jobId: "job_eval_memory_sweep_turn",
    workerId: "worker_eval_memory_sweep",
    idempotencyKey: "idem_eval_memory_sweep",
    content: [
      {
        type: "text",
        id: "user_eval_memory_sweep",
        text: "please maintain this app-facing session"
      }
    ]
  })
  await settleEvalTurn(session, turn, [
      {
        type: "text",
        id: "assistant_eval_memory_sweep",
        text: "sweep product path context ".repeat(90)
      }
    ])
}
