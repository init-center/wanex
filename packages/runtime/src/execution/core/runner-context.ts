import { createHash } from "node:crypto"
import type {
  PreparedProviderReplayMessage,
  ProviderAdapter,
  ProviderEvent,
  ProviderRequest
} from "../../provider/index.js"
import { ProviderStreamError } from "../../provider/index.js"
import type {
  JsonValue,
  RuntimeAbortSignal,
  ToolResultMessagePart
} from "@wanex/protocol"
import type { WanexSessionCore } from "../../sessions/index.js"
import {
  providerToolDefinitions,
  type ToolPermissionPolicy,
  type ToolRegistry
} from "../../tools/index.js"
import { runProviderCompletion } from "./completion.js"
import { drainTurnControls } from "./run-control.js"
import { buildSessionReplayMessages } from "./session-replay.js"
import { runToolBatch } from "./tool-execution.js"
import { prepareProviderReplayResources } from "../../resources/index.js"
import type { ActiveTurnAttempt, WanexAgentRunnerOptions } from "./types.js"

export type RunnerReplayMessages = readonly PreparedProviderReplayMessage[]

export class RecoveryEvidenceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RecoveryEvidenceError"
  }
}

export class AgentRunnerExecutionContext {
  readonly session: WanexSessionCore
  readonly provider: ProviderAdapter
  readonly tools: ToolRegistry | undefined
  readonly timeoutMs: number | undefined
  readonly toolPermissionPolicy: ToolPermissionPolicy | undefined
  readonly toolMaxConcurrency: number
  private readonly observeProviderEvent: WanexAgentRunnerOptions["observeProviderEvent"]
  private readonly contextCompiler: WanexAgentRunnerOptions["contextCompiler"]

  constructor(options: WanexAgentRunnerOptions) {
    this.session = options.session
    this.provider = options.provider
    this.tools = options.tools
    this.contextCompiler = options.contextCompiler
    this.timeoutMs = options.timeoutMs
    this.toolPermissionPolicy = options.toolPermissionPolicy
    this.toolMaxConcurrency = options.toolMaxConcurrency ?? 4
    this.observeProviderEvent = options.observeProviderEvent
  }

  async buildReplayMessages(sessionId: string): Promise<RunnerReplayMessages> {
    const messages = await buildSessionReplayMessages({
      session: this.session,
      sessionId,
      ...(this.contextCompiler === undefined
        ? {}
        : { contextCompiler: this.contextCompiler })
    })
    return await prepareProviderReplayResources(
      this.session,
      this.provider.capabilities,
      messages
    )
  }

  async drainTurnControls(
    execution: ActiveTurnAttempt,
    applySteer: boolean
  ) {
    return await drainTurnControls(this.session, {
      execution,
      applySteer
    })
  }

  async runProviderCompletion(
    messages: RunnerReplayMessages,
    signal: RuntimeAbortSignal | undefined,
    execution: ActiveTurnAttempt,
    step: number
  ) {
    const providerRequest = {
      messages,
      signal,
      timeoutMs: this.timeoutMs,
      ...(this.tools === undefined || this.tools.list().length === 0
        ? {}
        : {
            tools: providerToolDefinitions(this.tools),
            toolChoice: "auto" as const,
            parallelToolCalls: this.toolMaxConcurrency > 1
          }),
      ...(this.observeProviderEvent === undefined
        ? {}
        : {
            observe: (event: ProviderEvent) => this.observeProviderEvent?.({
              sessionId: execution.sessionId,
              inputId: execution.inputId,
              turnId: execution.turnId,
              jobId: execution.jobId,
              attemptId: execution.attemptId,
              providerId: this.provider.providerId,
              modelId: this.provider.modelId,
              event
            })
          })
    } satisfies Parameters<typeof runProviderCompletion>[1]
    const requestDigest = providerRequestDigest(providerRequest)
    const previous = await this.session.listProviderInvocations({
      turnId: execution.turnId
    })
    const latestForStep = previous
      .filter((invocation) => invocation.step === step)
      .at(-1)
    if (
      latestForStep?.state === "failed_before_output" &&
      latestForStep.requestDigest !== requestDigest
    ) {
      throw new RecoveryEvidenceError(
        "provider retry request does not match its durable request digest"
      )
    }
    let invocationNumber = previous
      .filter((invocation) => invocation.step === step)
      .reduce((maximum, invocation) => Math.max(maximum, invocation.invocationNumber), 0) + 1
    while (invocationNumber <= execution.recovery.providerMaxAttempts) {
      const invocation = await this.session.beginProviderInvocation({
        ...executionIdentity(execution),
        step,
        invocationNumber,
        requestDigest
      })
      let outputMarked = invocation.outputObserved
      try {
        const response = await runProviderCompletion(this.provider, {
          ...providerRequest,
          checkpoint: async (event) => {
            if (outputMarked || !isProviderOutput(event)) return
            const marked = await this.session.markProviderInvocationOutput({
              ...executionIdentity(execution),
              invocationId: invocation.id
            })
            if (marked === null) {
              throw new Error("turn lost its lease while journaling provider output")
            }
            outputMarked = true
          }
        })
        await this.recordProviderUsage(response, execution, invocation.id)
        return { invocationId: invocation.id, response }
      } catch (error) {
        if (!(error instanceof ProviderStreamError)) throw error
        const finished = await this.session.finishProviderInvocation({
          ...executionIdentity(execution),
          invocationId: invocation.id,
          outcome: error.detail.outputObserved ? "ambiguous" : "failed_before_output",
          error: error.detail as unknown as JsonValue
        })
        if (finished === null) {
          throw new Error("turn lost its lease while journaling provider failure")
        }
        if (
          !error.detail.outputObserved &&
          error.detail.retryable &&
          invocationNumber < execution.recovery.providerMaxAttempts
        ) {
          invocationNumber += 1
          continue
        }
        throw error
      }
    }
    throw new RecoveryEvidenceError("provider recovery attempt bound is exhausted")
  }

  private async recordProviderUsage(
    response: Awaited<ReturnType<typeof runProviderCompletion>>,
    execution: ActiveTurnAttempt,
    invocationId: string
  ): Promise<void> {
    if (execution.budgetGrantId !== undefined) {
      const tokens = providerTokenUsage(response.usage)
      if (tokens !== undefined) {
        await this.session.recordBudgetUsage({
          grantId: execution.budgetGrantId,
          usage: { tokens },
          source: "provider",
          sourceId: invocationId,
          idempotencyKey: `provider:${invocationId}`
        })
      }
    }
  }

  async runToolBatch(
    tools: ToolRegistry,
    calls: Parameters<typeof runToolBatch>[1]["calls"],
    execution: ActiveTurnAttempt,
    sourceMessageId: string,
    signal: RuntimeAbortSignal | undefined
  ): Promise<ToolResultMessagePart[]> {
    return await runToolBatch(tools, {
      calls,
      principalId: execution.principalId,
      sessionId: execution.sessionId,
      inputId: execution.inputId,
      turnId: execution.turnId,
      attemptId: execution.attemptId,
      sourceMessageId,
      jobId: execution.jobId,
      workerId: execution.workerId,
      leaseToken: execution.leaseToken,
      permissionPolicy: this.toolPermissionPolicy,
      storage: this.session,
      signal,
      timeoutMs: this.timeoutMs,
      maxConcurrency: this.toolMaxConcurrency,
      budgetGrantId: execution.budgetGrantId
    })
  }
}

function executionIdentity(execution: ActiveTurnAttempt) {
  return {
    sessionId: execution.sessionId,
    turnId: execution.turnId,
    attemptId: execution.attemptId,
    inputId: execution.inputId,
    jobId: execution.jobId,
    workerId: execution.workerId,
    leaseToken: execution.leaseToken
  }
}

function providerRequestDigest(
  request: Omit<ProviderRequest, "signal"> & {
    readonly signal?: unknown
    readonly timeoutMs?: number | undefined
    readonly observe?: unknown
    readonly checkpoint?: unknown
  }
): string {
  const {
    signal: _signal,
    timeoutMs: _timeoutMs,
    observe: _observe,
    checkpoint: _checkpoint,
    ...durableRequest
  } = request
  return createHash("sha256")
    .update(stableJson(durableRequest))
    .digest("hex")
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined && typeof item !== "function")
      .sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`
  }
  return JSON.stringify(value)
}

function isProviderOutput(event: ProviderEvent): boolean {
  return event.type === "text_delta" ||
    event.type === "reasoning_delta" ||
    event.type === "tool_call_start"
}

function providerTokenUsage(
  usage: Awaited<ReturnType<typeof runProviderCompletion>>["usage"]
): number | undefined {
  if (usage?.inputTokens === undefined && usage?.outputTokens === undefined) {
    return undefined
  }
  return (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0)
}
