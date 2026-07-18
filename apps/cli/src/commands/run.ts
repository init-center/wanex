import { randomUUID } from "node:crypto"
import {
  prepareAgentContext,
  type PreparedAgentContext
} from "@wanex/runtime/context"
import { WanexAgentRuntime } from "@wanex/runtime/host"
import type { TextMessagePart } from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import type { CliAgentContextOptions } from "../types.js"

const DEFAULT_LEASE_MS = 60_000

export async function runValue(
  storage: CoreStore,
  request: {
    readonly text: string
    readonly sessionId?: string
    readonly providerId?: string
    readonly timeoutMs?: number
    readonly mode?: "once" | "to_completion"
    readonly maxSteps?: number
    readonly context?: CliAgentContextOptions
  }
): Promise<unknown> {
  const preparedContext = await prepareAgentContext({
    ...(request.context === undefined ? {} : request.context)
  })
  const runtime = new WanexAgentRuntime({
    storage,
    workerId: `cli_agent_worker_${randomUUID()}`,
    runnerId: `cli_agent_runner_${randomUUID()}`,
    leaseMs: DEFAULT_LEASE_MS,
    ...(request.providerId === undefined
      ? { fakeResponseText: `Fake response: ${request.text}` }
      : { providerProfileId: request.providerId }),
    ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
    ...(preparedContext.contextCompiler === undefined
      ? {}
      : { contextCompiler: preparedContext.contextCompiler }),
    ...(preparedContext.tools === undefined ? {} : { tools: preparedContext.tools }),
    ...(preparedContext.toolPermissionPolicy === undefined
      ? {}
      : { toolPermissionPolicy: preparedContext.toolPermissionPolicy })
  })
  const inputId = `inp_${randomUUID()}`
  const result = await runtime.submitAndRunUserText({
    text: request.text,
    ...(request.sessionId === undefined ? {} : { sessionId: request.sessionId }),
    principalId: "cli-user",
    inputId,
    ...(request.mode === undefined ? {} : { mode: request.mode }),
    ...(request.maxSteps === undefined ? {} : { maxSteps: request.maxSteps })
  })
  const messages = result.messages
  const assistantText = messages
    .flatMap((message) => message.content)
    .filter((part): part is TextMessagePart => part.type === "text")
    .map((part) => part.text)
    .join("\n")

  return {
    command: "run",
    sessionId: result.session.id,
    inputId,
    jobId: result.receipt.job.id,
    status:
      result.run.worker.status === "completed"
        ? "completed"
        : result.run.worker.status === "idle"
          ? "idle"
          : "failed",
    providerId: request.providerId ?? "fake",
    assistantText,
    messages,
    ...(request.context === undefined
      ? {}
      : { context: contextSummary(preparedContext, request.context) })
  }
}

function contextSummary(
  prepared: PreparedAgentContext,
  request: CliAgentContextOptions
): unknown {
  return {
    ...(prepared.instructionSnapshot === undefined
      ? {}
      : {
          instructions: {
            status: prepared.instructionSnapshot.status,
            sources: prepared.instructionSnapshot.sources.map((source) => ({
              scope: source.scope,
              path: source.path,
              target: source.target,
              byteLength: source.byteLength,
              hash: source.hash
            })),
            diagnostics: prepared.instructionSnapshot.diagnostics
          }
        }),
    ...(prepared.skillSnapshot === undefined
      ? {}
      : {
          skills: {
            status: prepared.skillSnapshot.status,
            sources: prepared.skillSnapshot.sources.map((source) => ({
              scope: source.scope,
              name: source.name,
              description: source.description,
              directory: source.directory,
              path: source.path,
              byteLength: source.byteLength,
              hash: source.hash,
              bodyHash: source.bodyHash
            })),
            diagnostics: prepared.skillSnapshot.diagnostics,
            activationToolRegistered:
              request.skills?.registerActivationTool === true
          }
        })
  }
}
