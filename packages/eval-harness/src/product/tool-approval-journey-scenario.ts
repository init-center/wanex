import { join } from "node:path";
import {
  createMemoryStateStore,
  createShell,
  createSurfaceAdapter,
} from "@wanex/product";
import {
  createInProcessSurfaceClientTransport,
  createSurfaceClient,
} from "@wanex/product/surface";
import {
  createTuiSurface,
  renderTuiConversationOperation,
  runTuiLineSession,
} from "@wanex/tui";
import {
  createSurface,
  type Snapshot,
} from "@wanex/web";
import { SecretResolver, StaticSecretProvider } from "@wanex/runtime/secrets";
import {
  createToolRuntimeBinding,
  ToolRegistry,
  type ToolPermissionDecision,
  type ToolPermissionPolicy,
} from "@wanex/runtime/tools";
import { createStorageTestStore } from "@wanex/storage/testing";
import { createEvalScenario } from "../runner.js";
import { assert, evalOpenAICompatibleModelEndpoint } from "../scenario-utils.js";

const SECRET_REF = "static://eval-product-tool-approval";
const SECRET_VALUE = "eval-product-tool-approval-secret";
const RAW_TOOL_INPUT = "eval-productroval-raw-input";
const TOOL_NAME = "product_external_publish";
const APPROVE_SESSION_ID = "ses_eval_product_approval_approve";
const DENY_SESSION_ID = "ses_eval_product_approval_deny";
const CANCEL_SESSION_ID = "ses_eval_product_approval_cancel";

export const toolApprovalJourneyScenario = createEvalScenario({
  id: "product.tool-approval-journey",
  title: "Product Web and TUI resolve bounded Tool approvals through App authority",
  tags: ["product", "web", "tui", "tool", "approval", "product-path"],
  async run(context) {
    const storeDir = join(context.storeDir, "product-tool-approval-journey");
    const originalFetch = globalThis.fetch;
    let providerCalls = 0;
    let toolCalls = 0;
    globalThis.fetch = (async () => {
      providerCalls += 1;
      return providerCalls % 2 === 1
        ? openAIToolCallResponse(`call_product_approval_${providerCalls}`)
        : openAIResponse(`applicationroval continuation ${providerCalls / 2}`);
    }) as unknown as typeof globalThis.fetch;

    const tools = new ToolRegistry();
    tools.register({
      name: TOOL_NAME,
      description: "Publish one reviewed artifact to an external service.",
      inputSchema: {
        type: "object",
        properties: { privatePayload: { type: "string" } },
        required: ["privatePayload"],
        additionalProperties: false,
      },
      risk: "external",
      idempotent: false,
      concurrency: "exclusive",
      resultMode: "immediate",
      annotations: { title: "Publish external artifact" },
      runtimeBinding: createToolRuntimeBinding({
        implementationId: "wanex.eval.product.tool-approval",
        implementationRevision: "1",
      }),
      async invoke(invocation) {
        toolCalls += 1;
        assert(
          JSON.stringify(invocation.input).includes(RAW_TOOL_INPUT),
          "approved Product Tool must receive exact trusted input",
        );
        return {
          outcome: "succeeded",
          toolCallId: invocation.toolCallId,
          content: [{ type: "json", value: { published: true } }],
        };
      },
    });

    const app = await createShell({
      storage: { kind: "local-system-service", mode: "persistent", storeDir },
      artifacts: { explicitPath: context.serviceBin },
      modelEndpoint: evalOpenAICompatibleModelEndpoint({
        id: "eval-productroval-provider",
        modelId: "eval-productroval-model",
        baseUrl: "https://productroval.example.test/v1",
        secretRef: SECRET_REF,
      }),
      secretResolver: new SecretResolver([
        new StaticSecretProvider({ values: { [SECRET_REF]: SECRET_VALUE } }),
      ]),
      runtimeContext: {
        tools,
        toolPermissionPolicy: new rovalRequiredPolicy(),
      },
      stateStore: createMemoryStateStore(),
    });
    const surface = createSurfaceAdapter(app);
    const client = createSurfaceClient(
      createInProcessSurfaceClientTransport(surface),
    );
    const web = await createSurface({ client });
    const tui = await createTuiSurface({ client });

    try {
      const submitted = await web.dispatchAction({
        type: "submit-conversation",
        input: {
          sessionId: APPROVE_SESSION_ID,
          text: "publish the reviewed artifact",
        },
      });
      assert(submitted.ok, "Product approval fixture must be admitted");
      const approvalSnapshot = await waitForApproval(web);
      const approval = approvalSnapshot.conversation.operation?.approvals?.items[0];
      assert(approval !== undefined, "Product must expose one pending approval");
      assert(
        approvalSnapshot.conversation.canCancel &&
          !approvalSnapshot.conversation.canRegenerate,
        "approval wait must remain cancellable and non-regeneratable",
      );

      const trustedExecutionId = await readOnlyExecutionId({
        storeDir,
        serviceBin: context.serviceBin,
        sessionId: APPROVE_SESSION_ID,
      });
      const rendererJson = JSON.stringify(approvalSnapshot);
      const tuiText = renderTuiConversationOperation({
        kind: "product.conversation-operation.found",
        operation: approvalSnapshot.conversation.operation!,
      }).text;
      assert(
        approval.approvalId !== trustedExecutionId,
        "Product approval identity must be opaque",
      );
      for (const forbidden of [
        trustedExecutionId,
        RAW_TOOL_INPUT,
        SECRET_REF,
        SECRET_VALUE,
        "productroval:private-authorization",
        "inputSchema",
        "leaseToken",
      ]) {
        assert(
          !rendererJson.includes(forbidden) &&
            !tuiText.includes(forbidden),
          `Product approval projection leaked ${forbidden}`,
        );
      }
      assert(
        approvalSnapshot.conversation.operation?.approvals?.items.some(
          (item) => item.approvalId === approval.approvalId,
        ) === true &&
          tuiText.includes(`approval:${approval.approvalId}`),
        "Web snapshot and TUI must project the same bounded Product approval",
      );

      const stale = await app.resolveTrackedConversationApproval({
        sessionId: APPROVE_SESSION_ID,
        approvalId: approval.approvalId,
        expectedApprovalRevision: approval.approvalRevision + 1,
        decision: "approve_once",
        reason: "stale Product decision probe",
      });
      assert(
        stale.kind === "product.conversation-operation.rejected" &&
          stale.reason === "approval_revision_stale",
        "stale Product approval revision must fail closed",
      );
      const unknown = await app.resolveTrackedConversationApproval({
        sessionId: APPROVE_SESSION_ID,
        approvalId: "product_conversation_approval_unknown",
        expectedApprovalRevision: approval.approvalRevision,
        decision: "approve_once",
        reason: "unknown Product approval probe",
      });
      assert(
        unknown.kind === "product.conversation-operation.rejected" &&
          unknown.reason === "approval_not_found",
        "unknown Product approval identity must fail closed",
      );

      const approved = await web.dispatchAction({
        type: "resolve-conversation-approval",
        input: {
          sessionId: APPROVE_SESSION_ID,
          approvalId: approval.approvalId,
          expectedApprovalRevision: approval.approvalRevision,
          decision: "approve_once",
          reason: "reviewed destination and payload",
        },
      });
      assert(
        approved.ok,
        `Web approve-once decision must be accepted: ${
          approved.ok ? "unexpected failure" : approved.message
        }`,
      );
      const approveTerminal = await waitForTerminal(web);
      assert(
        approveTerminal.conversation.state === "succeeded" && toolCalls === 1,
        "approved Product Turn must invoke the Tool exactly once and succeed",
      );

      await web.dispatchAction({ type: "start-new-conversation" });
      const denySubmitted = await web.dispatchAction({
        type: "submit-conversation",
        input: { sessionId: DENY_SESSION_ID, text: "deny external publishing" },
      });
      assert(denySubmitted.ok, "Product denial fixture must be admitted");
      const denySnapshot = await waitForApproval(web);
      const denyApproval = denySnapshot.conversation.operation?.approvals?.items[0];
      assert(denyApproval !== undefined, "denial fixture must expose approval");
      await tui.refresh();
      const tuiOutput: string[] = [];
      const tuiResult = await runTuiLineSession({
        surface: tui,
        input: lines([
          `approval-deny ${denyApproval.approvalId} reviewer rejected destination`,
          "quit",
        ]),
        write(chunk) {
          tuiOutput.push(chunk);
        },
      });
      assert(
        tuiResult.approvalCommandCount === 1 && tuiResult.errorCount === 0,
        "TUI must resolve denial through the shared Product Surface command",
      );
      const denyTerminal = await waitForTerminal(web);
      assert(
        denyTerminal.conversation.state === "succeeded" && toolCalls === 1,
        "denied Product Tool must invoke zero effects and continue canonically",
      );

      await web.dispatchAction({ type: "start-new-conversation" });
      const cancelSubmitted = await web.dispatchAction({
        type: "submit-conversation",
        input: { sessionId: CANCEL_SESSION_ID, text: "cancel approval waiting" },
      });
      assert(cancelSubmitted.ok, "Product cancellation fixture must be admitted");
      const cancelSnapshot = await waitForApproval(web);
      const cancelApproval =
        cancelSnapshot.conversation.operation?.approvals?.items[0];
      assert(cancelApproval !== undefined, "cancellation fixture must expose approval");
      const cancelled = await web.dispatchAction({
        type: "cancel-conversation",
        input: {
          sessionId: CANCEL_SESSION_ID,
          reason: "reviewer cancelled approval wait",
        },
      });
      assert(cancelled.ok, "Product cancellation must be accepted");
      const cancelTerminal = await waitForTerminal(web);
      assert(
        cancelTerminal.conversation.state === "cancelled",
        "approval-wait cancellation must settle canonically",
      );
      const late = await app.resolveTrackedConversationApproval({
        sessionId: CANCEL_SESSION_ID,
        approvalId: cancelApproval.approvalId,
        expectedApprovalRevision: cancelApproval.approvalRevision,
        decision: "approve_once",
        reason: "late Product approval probe",
      });
      assert(
        late.kind === "product.conversation-operation.rejected" &&
          late.reason === "approval_not_found",
        "cancelled approval must reject a late Product decision",
      );

      const evidence = createStorageTestStore({
        kind: "local-system-service",
        mode: "oneshot",
        storeDir,
        serviceBin: context.serviceBin,
      });
      try {
        const [approvedExecutions, deniedExecutions, cancelledExecutions] =
          await Promise.all([
            evidence.listToolExecutions({ sessionId: APPROVE_SESSION_ID }),
            evidence.listToolExecutions({ sessionId: DENY_SESSION_ID }),
            evidence.listToolExecutions({ sessionId: CANCEL_SESSION_ID }),
          ]);
        const deniedMessages = await evidence.listSessionMessages({
          sessionId: DENY_SESSION_ID,
        });
        const denialResults = deniedMessages.flatMap((message) =>
          message.content.filter((part) => part.type === "tool_result"),
        );
        assert(
          approvedExecutions[0]?.state === "succeeded" &&
            approvedExecutions[0].attemptCount === 1,
          "approved Product execution must have one physical attempt",
        );
        assert(
          deniedExecutions[0]?.state === "denied" &&
            deniedExecutions[0].attemptCount === 0 &&
            denialResults.length === 1,
          "denied Product execution must have zero attempts and one canonical result",
        );
        assert(
          cancelledExecutions[0]?.state === "cancelled" &&
            cancelledExecutions[0].attemptCount === 0,
          "cancelled Product execution must have zero attempts",
        );
        assert(
          providerCalls === 5 && toolCalls === 1,
          "Product approval journey must preserve exact Provider and Tool calls",
        );
        return {
          approvalOpaque: approval.approvalId !== trustedExecutionId,
          webProjected: approvalSnapshot.conversation.operation?.approvals?.items.some(
            (item) => item.approvalId === approval.approvalId,
          ) === true,
          tuiRendered: tuiText.includes(`approval:${approval.approvalId}`),
          tuiApprovalCommands: tuiResult.approvalCommandCount,
          approveState: approveTerminal.conversation.state,
          denyState: denyTerminal.conversation.state,
          cancelState: cancelTerminal.conversation.state,
          providerCalls,
          toolCalls,
          canonicalDenialResults: denialResults.length,
          tuiOutputLines: tuiOutput.join("").split("\n").filter(Boolean).length,
        };
      } finally {
        await evidence.dispose();
      }
    } finally {
      await surface.dispose();
      await app.dispose();
      globalThis.fetch = originalFetch;
    }
  },
});

class rovalRequiredPolicy implements ToolPermissionPolicy {
  snapshot() {
    return createToolRuntimeBinding({
      implementationId: "wanex.eval.product.tool-approval-policy",
      implementationRevision: "1",
    });
  }

  async authorize(): Promise<ToolPermissionDecision> {
    return {
      status: "approval_required",
      reason: "trusted_product_review_required",
      presentation: {
        summary: "Publish the reviewed artifact externally?",
        details: [{ label: "Destination", value: "Configured release service" }],
      },
      authorizationRef: "productroval:private-authorization",
    };
  }
}

async function waitForApproval(
  web: Awaited<ReturnType<typeof createSurface>>,
): Promise<Snapshot> {
  return await eventually(async () => {
    const snapshot = await web.reconcileEvents({ limit: 50 });
    assert(
      snapshot.conversation.state === "waiting" &&
        snapshot.conversation.operation?.approvals?.items.length === 1,
      "Product conversation has not reached approval wait",
    );
    return snapshot;
  });
}

async function waitForTerminal(
  web: Awaited<ReturnType<typeof createSurface>>,
): Promise<Snapshot> {
  return await eventually(async () => {
    const snapshot = await web.reconcileEvents({ limit: 50 });
    assert(
      snapshot.conversation.operation?.capabilities.terminal === true,
      "Product conversation has not reached a terminal state",
    );
    return snapshot;
  });
}

async function readOnlyExecutionId(request: {
  readonly storeDir: string;
  readonly serviceBin: string;
  readonly sessionId: string;
}): Promise<string> {
  const storage = createStorageTestStore({
    kind: "local-system-service",
    mode: "oneshot",
    storeDir: request.storeDir,
    serviceBin: request.serviceBin,
  });
  try {
    const executions = await storage.listToolExecutions({
      sessionId: request.sessionId,
    });
    assert(executions.length === 1, "expected one trusted Tool execution");
    return executions[0]!.id;
  } finally {
    await storage.dispose();
  }
}

async function eventually<T>(run: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 250; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}

async function* lines(values: readonly string[]): AsyncIterable<string> {
  for (const value of values) yield value;
}

function openAIResponse(text: string): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    body: (async function* () {
      yield `data: ${JSON.stringify({
        choices: [{ delta: { content: text }, finish_reason: "stop" }],
      })}\n\n`;
      yield "data: [DONE]\n\n";
    })(),
    async text() {
      return "";
    },
  } as unknown as Response;
}

function openAIToolCallResponse(toolCallId: string): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    body: (async function* () {
      yield `data: ${JSON.stringify({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: toolCallId,
                  function: {
                    name: TOOL_NAME,
                    arguments: JSON.stringify({ privatePayload: RAW_TOOL_INPUT }),
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      })}\n\n`;
      yield "data: [DONE]\n\n";
    })(),
    async text() {
      return "";
    },
  } as unknown as Response;
}
