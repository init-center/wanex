import {
  createShell,
  createSurfaceAdapter
} from "@wanex/assistant"
import {
  createInProcessSurfaceClientTransport,
  createSurfaceClient
} from "@wanex/assistant/surface"
import {
  createSurface
} from "@wanex/assistant-ui"
import type { ModelEndpoint, SessionMessageRecord } from "@wanex/protocol"
import { createEvalScenario } from "../runner.js"
import { assert, evalFakeModelEndpoint } from "../scenario-utils.js"
import {
  createConversationSettlementFixture,
  assistantConversationRowText
} from "./conversation-helpers.js"

const SMALL_ENDPOINT_ID = "eval-long-session-small"
const LARGE_ENDPOINT_ID = "eval-long-session-large"
const CONTINUITY_SESSION_ID = "ses_eval_long_session_continuity"
const RECOVERY_SESSION_ID = "ses_eval_long_session_recovery"

export const longSessionContinuityScenario = createEvalScenario({
  id: "assistant.long-session-continuity-operational",
  title: "Started Assistant Host compacts long context and exposes capacity recovery",
  tags: [
    "assistant",
    "context",
    "memory",
    "capacity",
    "recovery",
    "assistant-path"
  ],
  async run(context) {
    const fixture = await createConversationSettlementFixture({
      serviceBin: context.serviceBin,
      prefix: "wanex-eval-assistant-long-session-"
    })
    const smallEndpoint = boundedEndpoint(SMALL_ENDPOINT_ID, 800, 100)
    const largeEndpoint = boundedEndpoint(LARGE_ENDPOINT_ID, 20_000, 500)
    const app = await createShell({
      storage: fixture.storage,
      modelEndpoint: smallEndpoint
    })
    const assistantSurface = createSurfaceAdapter(app)
    const client = createSurfaceClient(
      createInProcessSurfaceClientTransport(assistantSurface)
    )
    const web = await createSurface({ client })

    try {
      await app.modelEndpoints.upsertModelEndpoint({
        modelEndpoint: largeEndpoint,
        makeActive: false
      })
      await web.refresh()

      const oldInput = `retain old context ${"x".repeat(1_800)}`
      const firstSettlement = fixture.settlements.waitForNext({
        sessionId: CONTINUITY_SESSION_ID
      })
      const first = await web.dispatchAction({
        type: "submit-conversation",
        input: { text: oldInput, sessionId: CONTINUITY_SESSION_ID }
      })
      assert(first.ok, "first bounded Assistant Turn should be admitted")
      assert(
        (await firstSettlement).turn.state === "succeeded",
        "first bounded Assistant Turn should succeed"
      )
      const canonicalBefore = await fixture.settlements.storage.listSessionMessages({
        sessionId: CONTINUITY_SESSION_ID
      })
      assert(
        canonicalBefore.length === 2 && messageText(canonicalBefore[0]) === oldInput,
        "first Assistant Turn should persist its exact canonical input and response"
      )

      const currentInput = `continue with current context ${"y".repeat(1_100)}`
      const secondSettlement = fixture.settlements.waitForNext({
        sessionId: CONTINUITY_SESSION_ID
      })
      const second = await web.dispatchAction({
        type: "submit-conversation",
        input: { text: currentInput, sessionId: CONTINUITY_SESSION_ID }
      })
      assert(second.ok, "boundary-crossing Assistant Turn should be admitted")
      const secondReceipt = await secondSettlement
      assert(
        secondReceipt.turn.state === "succeeded",
        "boundary-crossing Assistant Turn should complete after inline compaction"
      )
      const [activeEpoch, canonicalAfter, continuityTurns, transcript] =
        await Promise.all([
          fixture.settlements.storage.getActiveContextEpoch({
            sessionId: CONTINUITY_SESSION_ID
          }),
          fixture.settlements.storage.listSessionMessages({
            sessionId: CONTINUITY_SESSION_ID
          }),
          fixture.settlements.storage.listSessionTurns({
            sessionId: CONTINUITY_SESSION_ID
          }),
          app.readSessionTranscript({ sessionId: CONTINUITY_SESSION_ID })
        ])
      assert(
        activeEpoch !== null &&
          activeEpoch.state === "active" &&
          activeEpoch.jobId === secondReceipt.job.id,
        "the later session.turn Job should own exactly one active Context Epoch"
      )
      assert(
        JSON.stringify(canonicalAfter.slice(0, canonicalBefore.length)) ===
          JSON.stringify(canonicalBefore),
        "inline compaction must not mutate prior canonical messages"
      )
      assert(
        canonicalAfter.length === 4 &&
          messageText(canonicalAfter[2]) === currentInput &&
          continuityTurns.length === 2 &&
          continuityTurns.every((turn) => turn.state === "succeeded"),
        "long-session continuation should preserve both complete Turns"
      )
      assert(
        transcript.kind === "assistant.session-transcript.found" &&
          transcript.transcript.rows.some(
            (row) => assistantConversationRowText(row) === oldInput
          ) &&
          transcript.transcript.rows.some(
            (row) => assistantConversationRowText(row) === currentInput
          ),
        "Assistant transcript should keep both canonical user messages visible"
      )

      const oversizedInput = `oversized current request ${"z".repeat(4_000)}`
      const failureSettlement = fixture.settlements.waitForNext({
        sessionId: RECOVERY_SESSION_ID
      })
      const failedSubmission = await web.dispatchAction({
        type: "submit-conversation",
        input: { text: oversizedInput, sessionId: RECOVERY_SESSION_ID }
      })
      assert(failedSubmission.ok, "oversized Assistant Turn should remain durably admitted")
      const failedReceipt = await failureSettlement
      assert(
        failedReceipt.turn.state === "failed",
        "oversized current Turn should fail before Provider dispatch"
      )
      const failedSnapshot = await web.refresh()
      const failedOperation = failedSnapshot.conversation.operation
      const failedInvocations =
        await fixture.settlements.storage.listProviderInvocations({
          turnId: failedReceipt.turn.id
        })
      assert(
        failedInvocations.length === 0,
        "an unfit current Turn must not open an ordinary Provider invocation"
      )
      assert(
        failedOperation?.error?.code ===
          "conversation_context_capacity_exceeded" &&
          failedOperation.error.category === "capacity" &&
          failedOperation.transcript.rows.some(
            (row) =>
              row.role === "user" &&
              assistantConversationRowText(row) === oversizedInput
          ),
        "Assistant should expose bounded capacity evidence and the canonical input"
      )

      const selected = await web.dispatchAction({
        type: "set-active-model-endpoint",
        input: { endpointId: LARGE_ENDPOINT_ID }
      })
      assert(
        selected.ok &&
          selected.snapshot.view.settings.profile.activeModelEndpointId ===
            LARGE_ENDPOINT_ID,
        "Assistant should explicitly select the larger configured endpoint"
      )
      const regenerationSettlement = fixture.settlements.waitForNext({
        sessionId: RECOVERY_SESSION_ID
      })
      const regenerated = await web.dispatchAction({
        type: "regenerate-conversation",
        input: { sessionId: RECOVERY_SESSION_ID }
      })
      assert(regenerated.ok, "capacity failure should remain regeneratable")
      const regeneratedReceipt = await regenerationSettlement
      assert(
        regeneratedReceipt.turn.state === "succeeded",
        "regeneration should succeed with the newly selected larger endpoint"
      )
      const recoveryTurns =
        await fixture.settlements.storage.listSessionTurns({
          sessionId: RECOVERY_SESSION_ID
        })
      const sourceTurn = recoveryTurns.find(
        (turn) => turn.id === failedReceipt.turn.id
      )
      const regeneratedTurn = recoveryTurns.find(
        (turn) => turn.regeneratesTurnId === failedReceipt.turn.id
      )
      assert(
        sourceTurn?.state === "failed" &&
          regeneratedTurn?.state === "succeeded" &&
          regeneratedTurn.primaryInputId !== sourceTurn.primaryInputId &&
          regeneratedTurn.jobId !== sourceTurn.jobId &&
          regeneratedTurn.executionBinding.modelEndpoint.endpointId ===
            LARGE_ENDPOINT_ID,
        "recovery should preserve the failed Turn and freeze fresh linked identities"
      )

      return {
        continuitySessionId: CONTINUITY_SESSION_ID,
        continuityTurnCount: continuityTurns.length,
        canonicalMessageCount: canonicalAfter.length,
        contextEpochId: activeEpoch.id,
        contextEpochJobId: activeEpoch.jobId,
        capacityErrorCode: failedOperation?.error?.code,
        failedProviderInvocationCount: failedInvocations.length,
        recoveryTurnStates: recoveryTurns.map((turn) => turn.state),
        regeneratedModelEndpointId:
          regeneratedTurn.executionBinding.modelEndpoint.endpointId
      }
    } finally {
      await assistantSurface.dispose()
      await app.dispose()
      await fixture.dispose()
    }
  }
})

function boundedEndpoint(
  endpointId: string,
  contextWindowTokens: number,
  maxOutputTokens: number
): ModelEndpoint {
  const endpoint = evalFakeModelEndpoint(endpointId, `${endpointId}-model`)
  return {
    ...endpoint,
    model: {
      ...endpoint.model,
      limits: {
        contextWindowTokens,
        maxInputTokens: contextWindowTokens - 50,
        maxOutputTokens
      }
    }
  }
}

function messageText(message: SessionMessageRecord | undefined): string {
  return (
    message?.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("") ?? ""
  )
}
