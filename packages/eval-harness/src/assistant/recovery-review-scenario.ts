import { rm } from "node:fs/promises"
import {
  createMemoryStateStore,
  createShell,
  createSurfaceAdapter
} from "@wanex/assistant"
import {
  createInProcessSurfaceClientTransport,
  createSurfaceClient
} from "@wanex/assistant/surface"
import {
  createSurface,
  type Snapshot
} from "@wanex/assistant-ui"
import {
  EnvSecretProvider,
  SecretResolver
} from "@wanex/runtime/secrets"
import {
  AllowAllToolsPolicy,
  createToolRuntimeBinding,
  ToolRegistry
} from "@wanex/runtime/tools"
import { createStorageTestStore } from "@wanex/storage/testing"
import { createEvalScenario } from "../runner.js"
import { assert, evalOpenAICompatibleModelEndpoint } from "../scenario-utils.js"
import { mktemp } from "../assistant-bootstrap/helpers.js"

const SESSION_ID = "ses_eval_assistant_recovery_review"
const ABANDON_SESSION_ID = "ses_eval_assistant_recovery_abandon"
const SECRET_REF = "env://WANEX_EVAL_ASSISTANT_RECOVERY_KEY"
const SECRET_VALUE = "wanex-eval-assistant-recovery-secret"
const PROVIDER_BASE_URL = "https://provider.recovery.example.test/v1"
const TOOL_NAME = "ambiguous_assistant_remote"
const TOOL_CALL_ID = "call_eval_assistant_recovery"
const RAW_TOOL_INPUT = "eval-tool-input-must-not-escape"
const RAW_RECONCILIATION_REF = "remote-eval-operation-1"

export const recoveryReviewScenario = createEvalScenario({
  id: "assistant.recovery-review-operational",
  title: "Assistant reviews ambiguous Tool outcomes without replay or identity leakage",
  tags: [
    "assistant",
    "conversation",
    "tool",
    "recovery",
    "web",
    "assistant-path"
  ],
  async run(context) {
    const storeDir = await mktemp("wanex-eval-assistant-recovery-")
    const originalFetch = globalThis.fetch
    let providerCalls = 0
    let toolCalls = 0
    globalThis.fetch = (async () => {
      providerCalls += 1
      return providerCalls === 1 || providerCalls === 3
        ? openAIToolCallResponse(
            TOOL_NAME,
            providerCalls === 1 ? TOOL_CALL_ID : `${TOOL_CALL_ID}_abandon`,
            {
            remoteSecret: RAW_TOOL_INPUT
            }
          )
        : openAIResponse("reconciled Assistant response")
    }) as unknown as typeof globalThis.fetch

    const tools = new ToolRegistry()
    tools.register({
      name: TOOL_NAME,
      description: "Dispatch a remote mutation whose response may be lost.",
      inputSchema: { type: "object", additionalProperties: true },
      risk: "external",
      idempotent: false,
      concurrency: "exclusive",
      resultMode: "immediate",
      annotations: { title: "Ambiguous Assistant remote operation" },
      runtimeBinding: createToolRuntimeBinding({
        implementationId: "wanex.eval.assistant.ambiguous-remote",
        implementationRevision: "1"
      }),
      async invoke(invocation) {
        toolCalls += 1
        assert(
          JSON.stringify(invocation.input).includes(RAW_TOOL_INPUT),
          "Assistant recovery fixture should receive the exact Tool input"
        )
        return {
          outcome: "ambiguous",
          toolCallId: invocation.toolCallId,
          message: "remote response was lost after dispatch",
          reconciliationRef: RAW_RECONCILIATION_REF
        }
      }
    })

    const app = await createShell({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: context.serviceBin },
      modelEndpoint: evalOpenAICompatibleModelEndpoint({
        id: "eval-assistant-recovery-provider",
        modelId: "eval-assistant-recovery-model",
        baseUrl: PROVIDER_BASE_URL,
        secretRef: SECRET_REF
      }),
      secretResolver: new SecretResolver([
        new EnvSecretProvider({
          WANEX_EVAL_ASSISTANT_RECOVERY_KEY: SECRET_VALUE
        })
      ]),
      runtimeContext: {
        tools,
        toolPermissionPolicy: new AllowAllToolsPolicy()
      },
      stateStore: createMemoryStateStore()
    })
    const surface = createSurfaceAdapter(app)
    const client = createSurfaceClient(
      createInProcessSurfaceClientTransport(surface)
    )
    const web = await createSurface({ client })

    try {
      const submitted = await web.dispatchAction({
        type: "submit-conversation",
        input: {
          sessionId: SESSION_ID,
          text: "dispatch and review the remote operation"
        }
      })
      assert(submitted.ok, "Assistant recovery fixture should be admitted")

      const recovery = await waitForRecovery(web)
      const recoveryItem = recovery.conversation.operation?.recovery?.items[0]
      assert(recoveryItem !== undefined, "Assistant should project a recovery item")
      assert(
        recovery.conversation.canSubmit === false &&
          recovery.conversation.canCancel === false &&
          recovery.conversation.canRegenerate === false,
        "recovery should disable submit, cancel, and generic regeneration"
      )
      assert(
        !recoveryItem.availableDecisions.includes("retry"),
        "non-idempotent Tool recovery must not offer retry"
      )
      assert(
        recoveryItem.tool.risk === "external" &&
          recoveryItem.tool.idempotent === false &&
          recoveryItem.attemptCount === 1,
        "Assistant should show bounded Tool risk and attempt evidence"
      )

      const refreshed = await web.refresh()
      assert(
        refreshed.conversation.operation?.recovery?.items[0]?.recoveryId ===
          recoveryItem.recoveryId,
        "refresh should reconstruct the same recovery review from canonical state"
      )

      const competing = await app.submitConversationOperation({
        sessionId: SESSION_ID,
        text: "must not overlap unresolved recovery"
      })
      assert(
        competing.kind === "assistant.conversation-operation.rejected" &&
          competing.reason === "operation_active",
        "unresolved recovery should reject ordinary submission"
      )
      const regeneration = await app.regenerateTrackedConversationOperation({
        sessionId: SESSION_ID
      })
      assert(
        regeneration.kind === "assistant.conversation-operation.rejected" &&
          regeneration.reason === "operation_not_terminal",
        "unresolved recovery should reject generic regeneration"
      )
      const stale = await app.resolveTrackedConversationRecovery({
        sessionId: SESSION_ID,
        recoveryId: recoveryItem.recoveryId,
        expectedRecoveryRevision: recoveryItem.recoveryRevision + 1,
        decision: "confirm_succeeded",
        reason: "stale recovery probe",
        content: [{
          type: "json",
          value: { remoteOperationId: RAW_RECONCILIATION_REF }
        }]
      })
      assert(
        stale.kind === "assistant.conversation-operation.rejected" &&
          stale.reason === "recovery_revision_stale",
        "stale recovery revision should fail closed"
      )

      const trustedBefore = await readTrustedEvidence({
        storeDir,
        serviceBin: context.serviceBin
      })
      const rendererJson = JSON.stringify(recovery)
      const forbidden = [
        storeDir,
        context.serviceBin,
        SECRET_REF,
        SECRET_VALUE,
        RAW_TOOL_INPUT,
        RAW_RECONCILIATION_REF,
        ...trustedBefore.turns.flatMap((turn) => [
          turn.id,
          turn.primaryInputId,
          turn.jobId
        ]),
        ...trustedBefore.attempts.flatMap((attempt) => [
          attempt.id,
          attempt.workerId,
          attempt.leaseToken
        ]),
        ...trustedBefore.executions.map((execution) => execution.id),
        ...trustedBefore.toolAttempts.flatMap((attempt) => [
          attempt.id,
          attempt.workerId,
          attempt.jobId
        ])
      ]
      for (const value of forbidden) {
        assert(
          !rendererJson.includes(value),
          `renderer recovery projection leaked trusted value: ${value}`
        )
      }
      assert(
        rendererJson.includes(PROVIDER_BASE_URL),
        "renderer recovery projection should retain the auditable service location"
      )

      const confirmed = await web.dispatchAction({
        type: "resolve-conversation-recovery",
        input: {
          sessionId: SESSION_ID,
          recoveryId: recoveryItem.recoveryId,
          expectedRecoveryRevision: recoveryItem.recoveryRevision,
          decision: "confirm_succeeded",
          reason: "verified in the remote operation log",
          content: [{
            type: "json",
            value: { remoteOperationId: RAW_RECONCILIATION_REF }
          }]
        }
      })
      assert(confirmed.ok, "Web recovery confirmation should be accepted")
      const completed = await waitForTerminal(web)
      assert(
        completed.conversation.state === "succeeded",
        "confirmed recovery should resume and settle the exact turn"
      )
      assert(providerCalls === 2, "Provider should run once before and once after recovery")
      assert(toolCalls === 1, "confirmed success must not invoke the Tool again")

      const trustedAfter = await readTrustedEvidence({
        storeDir,
        serviceBin: context.serviceBin
      })
      const canonicalToolResults = trustedAfter.messages.flatMap((message) =>
        message.content.filter(
          (part) => part.type === "tool_result" && part.toolCallId === TOOL_CALL_ID
        )
      )
      assert(
        canonicalToolResults.length === 1,
        "confirmed recovery should append exactly one canonical Tool result"
      )

      await web.dispatchAction({ type: "start-new-conversation" })
      const abandonSubmitted = await web.dispatchAction({
        type: "submit-conversation",
        input: {
          sessionId: ABANDON_SESSION_ID,
          text: "dispatch and abandon the second remote operation"
        }
      })
      assert(abandonSubmitted.ok, "abandon fixture should be admitted")
      const abandonRecovery = await waitForRecovery(web)
      const abandonItem =
        abandonRecovery.conversation.operation?.recovery?.items[0]
      assert(abandonItem !== undefined, "abandon fixture should expose recovery")
      const abandoned = await web.dispatchAction({
        type: "resolve-conversation-recovery",
        input: {
          sessionId: ABANDON_SESSION_ID,
          recoveryId: abandonItem.recoveryId,
          expectedRecoveryRevision: abandonItem.recoveryRevision,
          decision: "abandon_turn",
          reason: "remote operation cannot be reconciled"
        }
      })
      assert(abandoned.ok, "Web abandonment should be accepted")
      const abandonedTerminal = await waitForTerminal(web)
      assert(
        abandonedTerminal.conversation.state === "failed",
        "abandoned recovery should settle the turn as failed"
      )
      assert(
        Number(providerCalls) === 3 && Number(toolCalls) === 2,
        "abandonment must not invoke Provider or Tool again"
      )

      return {
        recoveryState: recovery.conversation.state,
        terminalState: completed.conversation.state,
        abandonedState: abandonedTerminal.conversation.state,
        availableDecisions: recoveryItem.availableDecisions,
        providerCalls,
        toolCalls,
        canonicalToolResultCount: canonicalToolResults.length,
        rendererPrivacyChecks: forbidden.length
      }
    } finally {
      await surface.dispose()
      await app.dispose()
      globalThis.fetch = originalFetch
      await rm(storeDir, { recursive: true, force: true })
    }
  }
})

async function waitForRecovery(
  web: Awaited<ReturnType<typeof createSurface>>
): Promise<Snapshot> {
  return await eventually(async () => {
    const snapshot = await web.reconcileEvents({ limit: 50 })
    assert(
      snapshot.conversation.state === "recovery_required" &&
        snapshot.conversation.operation?.recovery !== undefined,
      "Assistant conversation has not reached recovery review"
    )
    return snapshot
  })
}

async function waitForTerminal(
  web: Awaited<ReturnType<typeof createSurface>>
): Promise<Snapshot> {
  return await eventually(async () => {
    const snapshot = await web.reconcileEvents({ limit: 50 })
    assert(
      snapshot.conversation.operation?.capabilities.terminal === true,
      "Assistant conversation has not reached a terminal state"
    )
    return snapshot
  })
}

async function eventually<T>(run: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      return await run()
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }
  throw lastError
}

async function readTrustedEvidence(request: {
  readonly storeDir: string
  readonly serviceBin: string
}) {
  const storage = createStorageTestStore({
    kind: "local-system-service",
    mode: "oneshot",
    storeDir: request.storeDir,
    serviceBin: request.serviceBin
  })
  try {
    const turns = await storage.listSessionTurns({ sessionId: SESSION_ID })
    const attempts = (
      await Promise.all(
        turns.map(async (turn) =>
          await storage.listSessionAttempts({ turnId: turn.id })
        )
      )
    ).flat()
    const executions = await storage.listToolExecutions({ sessionId: SESSION_ID })
    const toolAttempts = (
      await Promise.all(
        executions.map(async (execution) =>
          await storage.listToolExecutionAttempts({ executionId: execution.id })
        )
      )
    ).flat()
    const messages = await storage.listSessionMessages({ sessionId: SESSION_ID })
    return { turns, attempts, executions, toolAttempts, messages }
  } finally {
    await storage.dispose()
  }
}

function openAIResponse(text: string): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    body: (async function* () {
      yield `data: ${JSON.stringify({
        choices: [{ delta: { content: text }, finish_reason: "stop" }]
      })}\n\n`
      yield "data: [DONE]\n\n"
    })(),
    async text() {
      return ""
    }
  } as unknown as Response
}

function openAIToolCallResponse(
  toolName: string,
  toolCallId: string,
  input: Readonly<Record<string, unknown>>
): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    body: (async function* () {
      yield `data: ${JSON.stringify({
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              id: toolCallId,
              function: {
                name: toolName,
                arguments: JSON.stringify(input)
              }
            }]
          },
          finish_reason: "tool_calls"
        }]
      })}\n\n`
      yield "data: [DONE]\n\n"
    })(),
    async text() {
      return ""
    }
  } as unknown as Response
}
