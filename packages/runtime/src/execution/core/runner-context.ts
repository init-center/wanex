import type {
  ProviderAdapter,
  ProviderEvent
} from "../../provider/index.js"
import type {
  RuntimeAbortSignal,
  SessionId,
  ToolResultMessagePart
} from "@wanex/protocol"
import type { WanexSessionCore } from "../../sessions/index.js"
import {
  providerToolDefinitions,
  type ToolPermissionPolicy,
  type ToolRecoveryPolicy,
  type ToolRegistry
} from "../../tools/index.js"
import { ensureClaimStillActive } from "./claim.js"
import { runProviderCompletion } from "./completion.js"
import { drainRunControls } from "./run-control.js"
import { buildSessionReplayMessages } from "./session-replay.js"
import { runToolBatch } from "./tool-execution.js"
import type { ClaimedRun, WanexAgentRunnerOptions } from "./types.js"

export type RunnerReplayMessages = Awaited<
  ReturnType<typeof buildSessionReplayMessages>
>

export class AgentRunnerExecutionContext {
  readonly session: WanexSessionCore
  readonly provider: ProviderAdapter
  readonly tools: ToolRegistry | undefined
  readonly runnerId: string
  readonly leaseMs: number
  readonly timeoutMs: number | undefined
  readonly toolPermissionPolicy: ToolPermissionPolicy | undefined
  readonly toolRecoveryPolicy: ToolRecoveryPolicy | undefined
  readonly toolMaxConcurrency: number
  private readonly observeProviderEvent: WanexAgentRunnerOptions["observeProviderEvent"]
  private readonly contextCompiler: WanexAgentRunnerOptions["contextCompiler"]

  constructor(options: WanexAgentRunnerOptions) {
    this.session = options.session
    this.provider = options.provider
    this.tools = options.tools
    this.contextCompiler = options.contextCompiler
    this.runnerId = options.runnerId
    this.leaseMs = options.leaseMs
    this.timeoutMs = options.timeoutMs
    this.toolPermissionPolicy = options.toolPermissionPolicy
    this.toolRecoveryPolicy = options.toolRecoveryPolicy
    this.toolMaxConcurrency = options.toolMaxConcurrency ?? 4
    this.observeProviderEvent = options.observeProviderEvent
  }

  async buildReplayMessages(sessionId: SessionId): Promise<RunnerReplayMessages> {
    return await buildSessionReplayMessages({
      session: this.session,
      sessionId,
      ...(this.contextCompiler === undefined
        ? {}
        : { contextCompiler: this.contextCompiler })
    })
  }

  async ensureClaimStillActive(
    sessionId: SessionId,
    claim: ClaimedRun
  ): Promise<void> {
    await ensureClaimStillActive(this.session, {
      sessionId,
      claim,
      leaseMs: this.leaseMs
    })
  }

  async drainRunControls(
    sessionId: SessionId,
    claim: ClaimedRun,
    options: { readonly applySteer: boolean }
  ) {
    return await drainRunControls(this.session, {
      sessionId,
      claim,
      applySteer: options.applySteer
    })
  }

  async runProviderCompletion(
    messages: RunnerReplayMessages,
    signal: RuntimeAbortSignal | undefined,
    claim: ClaimedRun,
    sessionId: SessionId,
    budgetGrantId: string | undefined,
    step: number
  ) {
    const response = await runProviderCompletion(this.provider, {
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
            observe: (event: ProviderEvent) =>
              this.observeProviderEvent?.({
                sessionId,
                inputId: claim.inputId,
                runId: claim.runId,
                providerId: this.provider.providerId,
                modelId: this.provider.modelId,
                event
              })
          })
    })
    if (budgetGrantId !== undefined) {
      const tokens = providerTokenUsage(response.usage)
      if (tokens !== undefined) {
        await this.session.recordBudgetUsage({
          grantId: budgetGrantId,
          usage: { tokens },
          source: "provider",
          sourceId: `${claim.runId}:${step}`,
          idempotencyKey: `provider:${claim.runId}:step:${step}`
        })
      }
    }
    return response
  }

  async principalId(sessionId: SessionId, inputId: string): Promise<string> {
    const input = (await this.session.listInputs({ sessionId })).find(
      (item) => item.id === inputId
    )
    if (input === undefined) {
      throw new Error(`claimed session input not found: ${inputId}`)
    }
    return input.principalId
  }

  async runToolBatch(
    tools: ToolRegistry,
    calls: Parameters<typeof runToolBatch>[1]["calls"],
    identity: {
      readonly sessionId: SessionId
      readonly inputId: string
      readonly runId: string
      readonly principalId: string
    },
    signal: RuntimeAbortSignal | undefined,
    budgetGrantId: string | undefined
  ): Promise<ToolResultMessagePart[]> {
    return await runToolBatch(tools, {
      calls,
      ...identity,
      permissionPolicy: this.toolPermissionPolicy,
      recoveryPolicy: this.toolRecoveryPolicy,
      storage: this.session,
      signal,
      timeoutMs: this.timeoutMs,
      maxConcurrency: this.toolMaxConcurrency,
      budgetGrantId
    })
  }
}

function providerTokenUsage(
  usage: Awaited<ReturnType<typeof runProviderCompletion>>["usage"]
): number | undefined {
  if (usage?.inputTokens === undefined && usage?.outputTokens === undefined) {
    return undefined
  }
  return (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0)
}
