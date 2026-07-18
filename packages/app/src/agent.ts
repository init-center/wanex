import { randomUUID } from "node:crypto"
import type { PreparedAgentContext } from "@wanex/runtime/context"
import type {
  SessionMessageRecord,
  SessionRecord,
  TextMessagePart
} from "@wanex/protocol"
import type { BootstrappedWanexAppShellRuntime } from "./runtime.js"
import type {
  WanexAppShellRunAgentTurnRequest,
  WanexAppShellRunAgentTurnResult
} from "./types-agent.js"
import type { WanexAppShellAgentContextSummary } from "./types-context.js"

export async function runWanexAppShellAgentTurn(
  runtime: BootstrappedWanexAppShellRuntime,
  options: {
    readonly request: WanexAppShellRunAgentTurnRequest
    readonly providerProfileId: string
    readonly preparedAgentContext?: PreparedAgentContext
  }
): Promise<WanexAppShellRunAgentTurnResult> {
  const text = options.request.text.trim()
  if (text.length === 0) {
    throw new Error("app shell agent text must not be empty")
  }
  const session = await ensureAgentSession(runtime, {
    ...options.request,
    text
  })
  const inputId = options.request.inputId ?? `inp_${randomUUID()}`
  const providerProfileId = options.providerProfileId
  const host =
    options.preparedAgentContext?.contextCompiler === undefined
      ? runtime.app.createRuntimeHost({
          workerCount: 1,
          providerProfileId
        })
      : runtime.app.createRuntimeHostWithAgentContext({
          context: {
            contextCompiler: options.preparedAgentContext.contextCompiler,
            ...(options.preparedAgentContext.tools === undefined
              ? {}
              : { tools: options.preparedAgentContext.tools }),
            ...(options.preparedAgentContext.toolPermissionPolicy === undefined
              ? {}
              : {
                  toolPermissionPolicy:
                    options.preparedAgentContext.toolPermissionPolicy
                })
          },
          host: {
            workerCount: 1,
            providerProfileId
          }
        })

  try {
    await runtime.storage.submitSessionRun({
      id: inputId,
      sessionId: session.id,
      principalId: options.request.principalId ?? "app-shell-user",
      idempotencyKey:
        options.request.idempotencyKey ?? `app-shell:${session.id}:${inputId}`,
      content: [
        {
          type: "text",
          id: "user_text",
          text
        }
      ],
      providerProfileId,
      mode: "once",
      maxSteps: 1,
      ...(options.request.origin === undefined
        ? {}
        : { origin: options.request.origin }),
      ...(options.request.intent === undefined
        ? {}
        : { intent: options.request.intent }),
      ...(options.request.runControlPolicy === undefined
        ? {}
        : { runControlPolicy: options.request.runControlPolicy }),
      ...(options.request.expectedRunId === undefined
        ? {}
        : { expectedRunId: options.request.expectedRunId }),
      ...(options.request.jobId === undefined
        ? {}
        : { jobId: options.request.jobId }),
      ...(options.request.jobIdempotencyKey === undefined
        ? {}
        : { jobIdempotencyKey: options.request.jobIdempotencyKey })
    })
    const run = await host.runOnce()
    const messages = await runtime.storage.listSessionMessages({
      sessionId: session.id
    })
    return {
      sessionId: session.id,
      assistantText: assistantText(messages),
      messageCount: messages.length,
      jobStatuses: run.results.flatMap((item) =>
        item.job === undefined ? [] : [item.job.state]
      ),
      ...(options.preparedAgentContext === undefined
        ? {}
        : { context: agentContextSummary(options.preparedAgentContext) })
    }
  } finally {
    await host.stop()
  }
}

async function ensureAgentSession(
  runtime: BootstrappedWanexAppShellRuntime,
  request: WanexAppShellRunAgentTurnRequest
): Promise<SessionRecord> {
  if (request.sessionId === undefined) {
    return await runtime.storage.createSession({
      id: `ses_${randomUUID()}`,
      title: request.text,
      kind: "agent"
    })
  }
  const existing = await runtime.storage.getSession(request.sessionId)
  if (existing !== null) {
    return existing
  }
  return await runtime.storage.createSession({
    id: request.sessionId,
    title: request.text,
    kind: "agent"
  })
}

function assistantText(messages: readonly SessionMessageRecord[]): string {
  return messages
    .flatMap((message) => message.content)
    .filter((part): part is TextMessagePart => part.type === "text")
    .map((part) => part.text)
    .join("\n")
}

function agentContextSummary(
  prepared: PreparedAgentContext
): WanexAppShellAgentContextSummary {
  return {
    instructionSources: prepared.instructionSnapshot?.sources.length ?? 0,
    skillNames:
      prepared.skillSnapshot?.sources.map((source) => source.name) ?? [],
    diagnostics: [
      ...(prepared.instructionSnapshot?.diagnostics.map(
        (diagnostic) => diagnostic.code
      ) ?? []),
      ...(prepared.skillSnapshot?.diagnostics.map(
        (diagnostic) => diagnostic.code
      ) ?? [])
    ],
    activationToolRegistered: prepared.tools !== undefined
  }
}
