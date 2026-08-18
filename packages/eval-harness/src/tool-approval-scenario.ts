import { join } from "node:path"
import { createWanexApp } from "@wanex/app"
import { SecretResolver, StaticSecretProvider } from "@wanex/runtime/secrets"
import {
  createToolRuntimeBinding,
  ToolRegistry,
  type ToolDefinition,
  type ToolPermissionDecision,
  type ToolPermissionPolicy
} from "@wanex/runtime/tools"
import { createStorageTestStore } from "@wanex/storage/testing"
import { createEvalScenario } from "./runner.js"
import { assert, evalOpenAICompatibleModelEndpoint } from "./scenario-utils.js"

const SECRET_REF = "static://eval-tool-approval"
const SECRET_VALUE = "eval-tool-approval-provider-secret"
const RAW_TOOL_INPUT = "eval-tool-input-must-remain-trusted"
const TOOL_NAME = "approval_remote"
const APPROVE_SESSION_ID = "ses_eval_tool_approval_approve"
const DENY_SESSION_ID = "ses_eval_tool_approval_deny"
const CANCEL_SESSION_ID = "ses_eval_tool_approval_cancel"

export const durableToolApprovalScenario = createEvalScenario({
  id: "tool-approval.durable-app-contract",
  title: "Durable Tool approval survives restart and resolves exactly once",
  tags: ["app", "runtime", "tool", "approval", "durable", "restart"],
  async run(context) {
    const storeDir = join(context.storeDir, "durable-tool-approval")
    const originalFetch = globalThis.fetch
    let providerCalls = 0
    let toolCalls = 0
    globalThis.fetch = (async () => {
      providerCalls += 1
      return providerCalls % 2 === 1
        ? openAIToolCallResponse(`call_eval_approval_${providerCalls}`)
        : openAIResponse(`approval continuation ${providerCalls / 2}`)
    }) as unknown as typeof globalThis.fetch

    const createTools = () => {
      const tools = new ToolRegistry()
      tools.register({
        name: TOOL_NAME,
        description: "Perform one externally visible action after review.",
        inputSchema: {
          type: "object",
          properties: { secretArgument: { type: "string" } },
          required: ["secretArgument"],
          additionalProperties: false
        },
        risk: "external",
        idempotent: false,
        concurrency: "exclusive",
        resultMode: "immediate",
        annotations: { title: "External approval action" },
        runtimeBinding: createToolRuntimeBinding({
          implementationId: "wanex.eval.tool-approval.remote",
          implementationRevision: "1"
        }),
        async invoke(invocation) {
          toolCalls += 1
          assert(
            JSON.stringify(invocation.input).includes(RAW_TOOL_INPUT),
            "approved Tool must receive its exact trusted input"
          )
          return {
            outcome: "succeeded",
            toolCallId: invocation.toolCallId,
            content: [{ type: "json", value: { accepted: true } }]
          }
        }
      } satisfies ToolDefinition)
      return tools
    }

    const admissionPolicy = new ApprovalRequiredPolicy()
    let app = await createApprovalApp({
      storeDir,
      serviceBin: context.serviceBin,
      tools: createTools(),
      policy: admissionPolicy
    })

    try {
      const approveReceipt = await app.commands.submitConversationOperation({
        sessionId: APPROVE_SESSION_ID,
        principalId: "principal_eval_tool_approval",
        content: [{ type: "text", text: "approve the reviewed action" }]
      })
      const pendingBeforeRestart = await waitForApproval(app, approveReceipt)
      assert(providerCalls === 1, "approval wait must stop Provider replay")
      assert(toolCalls === 0, "approval wait must invoke zero Tool effects")
      assert(admissionPolicy.calls === 1, "permission must be evaluated once")
      assertBoundedApproval(pendingBeforeRestart)

      await app.dispose()
      const restartPolicy = new ApprovalRequiredPolicy()
      app = await createApprovalApp({
        storeDir,
        serviceBin: context.serviceBin,
        tools: createTools(),
        policy: restartPolicy
      })
      const pendingAfterRestart = await waitForApproval(app, approveReceipt)
      assert(
        pendingAfterRestart.executionId === pendingBeforeRestart.executionId &&
          pendingAfterRestart.approvalRevision ===
            pendingBeforeRestart.approvalRevision,
        "App restart must reconstruct the same pending approval"
      )
      assert(
        restartPolicy.calls === 0,
        "restart must not reevaluate persisted Tool permission"
      )

      await assertRejects(
        app.commands.resolveConversationOperationApproval({
          ...approveReceipt,
          executionId: pendingAfterRestart.executionId,
          expectedApprovalRevision: pendingAfterRestart.approvalRevision + 1,
          decision: "approve_once",
          reason: "stale revision probe",
          idempotencyKey: "eval:approval:stale"
        }),
        "stale"
      )
      const approveDecision = {
        ...approveReceipt,
        executionId: pendingAfterRestart.executionId,
        expectedApprovalRevision: pendingAfterRestart.approvalRevision,
        decision: "approve_once" as const,
        reason: "reviewed bounded approval evidence",
        idempotencyKey: "eval:approval:approve"
      }
      const approved = await app.commands.resolveConversationOperationApproval(
        approveDecision
      )
      const duplicateApproved =
        await app.commands.resolveConversationOperationApproval(approveDecision)
      assert(
        JSON.stringify(duplicateApproved) === JSON.stringify(approved),
        "identical approval decisions must be idempotent"
      )
      await assertRejects(
        app.commands.resolveConversationOperationApproval({
          ...approveDecision,
          decision: "deny",
          reason: "conflicting decision probe"
        }),
        "conflicting"
      )
      const approveTerminal = await waitForTerminal(app, approveReceipt)
      assert(
        approveTerminal.operation.state === "succeeded",
        "approved Turn must resume to terminal success"
      )
      assert(Number(providerCalls) === 2, "approved Turn must dispatch Provider twice")
      assert(Number(toolCalls) === 1, "approved Tool must invoke exactly once")
      assert(
        restartPolicy.calls === 0,
        "approved continuation must reuse persisted permission"
      )

      const denyReceipt = await app.commands.submitConversationOperation({
        sessionId: DENY_SESSION_ID,
        principalId: "principal_eval_tool_approval",
        content: [{ type: "text", text: "deny the reviewed action" }]
      })
      const denyApproval = await waitForApproval(app, denyReceipt)
      const denied = await app.commands.resolveConversationOperationApproval({
        ...denyReceipt,
        executionId: denyApproval.executionId,
        expectedApprovalRevision: denyApproval.approvalRevision,
        decision: "deny",
        reason: "reviewer denied the external action",
        idempotencyKey: "eval:approval:deny"
      })
      assert(denied.approvalRevision === 1, "denial must advance approval revision")
      const denyTerminal = await waitForTerminal(app, denyReceipt)
      assert(
        denyTerminal.operation.state === "succeeded",
        "denied Tool result must let the same Turn complete"
      )
      assert(Number(providerCalls) === 4, "denied Turn must continue Provider replay once")
      assert(Number(toolCalls) === 1, "denied Tool must invoke zero effects")

      const cancelReceipt = await app.commands.submitConversationOperation({
        sessionId: CANCEL_SESSION_ID,
        principalId: "principal_eval_tool_approval",
        content: [{ type: "text", text: "cancel the approval wait" }]
      })
      const cancelApproval = await waitForApproval(app, cancelReceipt)
      const cancelled = await app.commands.cancelConversationOperation({
        ...cancelReceipt,
        reason: "reviewer cancelled the waiting Turn"
      })
      assert(
        cancelled.status === "cancel_requested",
        "approval-wait cancellation must be durably requested"
      )
      const cancelTerminal = await waitForTerminal(app, cancelReceipt)
      assert(
        cancelTerminal.operation.state === "cancelled",
        "approval-wait cancellation must settle the Turn"
      )
      await assertRejects(
        app.commands.resolveConversationOperationApproval({
          ...cancelReceipt,
          executionId: cancelApproval.executionId,
          expectedApprovalRevision: cancelApproval.approvalRevision,
          decision: "approve_once",
          reason: "late approval probe",
          idempotencyKey: "eval:approval:late"
        }),
        "stale"
      )
      assert(
        Number(providerCalls) === 5,
        "cancelled approval wait must not replay Provider"
      )
      assert(Number(toolCalls) === 1, "cancelled approval wait must invoke zero effects")

      await app.dispose()
      const evidence = createStorageTestStore({
        kind: "local-system-service",
        mode: "oneshot",
        storeDir,
        serviceBin: context.serviceBin
      })
      try {
        const [approvedExecutions, deniedExecutions, cancelledExecutions] =
          await Promise.all([
            evidence.listToolExecutions({ sessionId: APPROVE_SESSION_ID }),
            evidence.listToolExecutions({ sessionId: DENY_SESSION_ID }),
            evidence.listToolExecutions({ sessionId: CANCEL_SESSION_ID })
          ])
        assertExecution(approvedExecutions, "succeeded", 1)
        assertExecution(deniedExecutions, "denied", 0)
        assertExecution(cancelledExecutions, "cancelled", 0)
        const deniedMessages = await evidence.listSessionMessages({
          sessionId: DENY_SESSION_ID
        })
        const denialResults = deniedMessages.flatMap((message) =>
          message.content.filter((part) => part.type === "tool_result")
        )
        assert(
          denialResults.length === 1 && denialResults[0]?.isError === true,
          "denial must produce one canonical ordered Tool result"
        )
        return {
          approvalRevision: approved.approvalRevision,
          restartReconstructed: true,
          providerCalls,
          toolCalls,
          approvedAttempts: approvedExecutions[0]?.attemptCount ?? -1,
          deniedAttempts: deniedExecutions[0]?.attemptCount ?? -1,
          cancelledAttempts: cancelledExecutions[0]?.attemptCount ?? -1,
          canonicalDenialResults: denialResults.length
        }
      } finally {
        await evidence.dispose()
      }
    } finally {
      await app.dispose()
      globalThis.fetch = originalFetch
    }
  }
})

class ApprovalRequiredPolicy implements ToolPermissionPolicy {
  calls = 0

  snapshot() {
    return createToolRuntimeBinding({
      implementationId: "wanex.eval.tool-approval.policy",
      implementationRevision: "1"
    })
  }

  async authorize(): Promise<ToolPermissionDecision> {
    this.calls += 1
    return {
      status: "approval_required",
      reason: "trusted_eval_review_required",
      presentation: {
        summary: "Approve the external eval action?",
        details: [{ label: "Destination", value: "Configured eval service" }]
      },
      authorizationRef: "eval-policy:private-reference"
    }
  }
}

async function createApprovalApp(request: {
  readonly storeDir: string
  readonly serviceBin: string
  readonly tools: ToolRegistry
  readonly policy: ToolPermissionPolicy
}) {
  return await createWanexApp({
    storage: {
      kind: "local-system-service",
      mode: "persistent",
      storeDir: request.storeDir
    },
    artifacts: { explicitPath: request.serviceBin },
    modelEndpoint: evalOpenAICompatibleModelEndpoint({
      id: "eval-tool-approval-provider",
      modelId: "eval-tool-approval-model",
      baseUrl: "https://tool-approval.example.test/v1",
      secretRef: SECRET_REF
    }),
    secretResolver: new SecretResolver([
      new StaticSecretProvider({ values: { [SECRET_REF]: SECRET_VALUE } })
    ]),
    runtimeContext: {
      tools: request.tools,
      toolPermissionPolicy: request.policy
    }
  })
}

async function waitForApproval(
  app: Awaited<ReturnType<typeof createWanexApp>>,
  receipt: Awaited<ReturnType<
    Awaited<ReturnType<typeof createWanexApp>>["commands"]["submitConversationOperation"]
  >>
) {
  return await eventually(async () => {
    const read = await app.commands.readConversationOperation(receipt)
    assert(
      read.kind === "found" &&
        read.operation.state === "waiting" &&
        read.operation.approvals?.items.length === 1,
      "conversation must reach one bounded approval wait"
    )
    return read.operation.approvals.items[0]!
  })
}

async function waitForTerminal(
  app: Awaited<ReturnType<typeof createWanexApp>>,
  receipt: Awaited<ReturnType<
    Awaited<ReturnType<typeof createWanexApp>>["commands"]["submitConversationOperation"]
  >>
) {
  return await eventually(async () => {
    const read = await app.commands.readConversationOperation(receipt)
    assert(
      read.kind === "found" &&
        ["succeeded", "failed", "cancelled", "interrupted", "recovery_required"]
          .includes(read.operation.state),
      "conversation has not reached a terminal state"
    )
    return read
  })
}

function assertBoundedApproval(approval: {
  readonly tool: { readonly name: string; readonly risk: string; readonly idempotent: boolean }
  readonly presentation: { readonly summary: string }
}) {
  const serialized = JSON.stringify(approval)
  assert(approval.tool.name === TOOL_NAME, "approval must identify the Tool")
  assert(approval.tool.risk === "external", "approval must expose bounded risk")
  assert(approval.tool.idempotent === false, "approval must expose idempotence")
  assert(approval.presentation.summary.length > 0, "approval summary must be present")
  for (const forbidden of [
    RAW_TOOL_INPUT,
    SECRET_REF,
    SECRET_VALUE,
    "inputSchema",
    "eval-policy:private-reference",
    "leaseToken"
  ]) {
    assert(!serialized.includes(forbidden), `approval projection leaked ${forbidden}`)
  }
}

function assertExecution(
  executions: readonly { readonly state: string; readonly attemptCount: number }[],
  state: string,
  attemptCount: number
) {
  assert(executions.length === 1, `expected one ${state} Tool execution`)
  assert(executions[0]?.state === state, `Tool execution must be ${state}`)
  assert(
    executions[0]?.attemptCount === attemptCount,
    `${state} Tool execution must have ${attemptCount} attempts`
  )
}

async function assertRejects(promise: Promise<unknown>, expected: string) {
  try {
    await promise
  } catch (error) {
    assert(
      error instanceof Error && error.message.includes(expected),
      `expected rejection containing ${expected}`
    )
    return
  }
  throw new Error(`expected rejection containing ${expected}`)
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

function openAIResponse(text: string) {
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
  }
}

function openAIToolCallResponse(toolCallId: string) {
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
                name: TOOL_NAME,
                arguments: JSON.stringify({ secretArgument: RAW_TOOL_INPUT })
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
  }
}
