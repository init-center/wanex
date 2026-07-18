import { describe, expect, it } from "vitest"
import type {
  ContextEpochRecord,
  ContextReplacementRecord,
  MessagePart,
  PutContextReplacementRequest,
  SessionInputRecord,
  SessionMessageRecord
} from "@wanex/protocol"
import type { ContextTokenEstimator } from "../src/context/memory/index.js"
import { DeterministicContextCompiler, estimatePartTokens } from "../src/context/memory/index.js"

describe("../src/context/memory/index.js", () => {
  it("keeps short history unchanged", async () => {
    const compiler = new DeterministicContextCompiler()
    const compiled = await compiler.compile({
      sessionId: "ses_context_short",
      inputs: [input({ id: "inp_short", text: "hello", createdAt: 1 })],
      messages: [
        message({
          id: "msg_short",
          inputId: "inp_short",
          role: "assistant",
          content: [{ type: "text", id: "part_short", text: "world" }],
          createdAt: 2
        })
      ]
    })

    expect(compiled.replacements).toHaveLength(0)
    expect(compiled.messages).toHaveLength(2)
    expect(compiled.stats.tokenEstimateAfter).toBe(
      compiled.stats.tokenEstimateBefore
    )
  })

  it("estimates ui surface tokens from the canonical surface payload", () => {
    const tokens = estimatePartTokens({
      id: "part_surface",
      type: "ui_surface",
      surface: {
        protocol: "a2ui",
        version: "1",
        surfaceKind: "preview",
        payload: {
          title: "Surface payload"
        }
      }
    })

    expect(tokens).toBe(Math.ceil(JSON.stringify({ title: "Surface payload" }).length / 4))
  })

  it("compacts old long assistant text while protecting recent user turns", async () => {
    const compiler = new DeterministicContextCompiler({
      policy: {
        recentUserTurns: 1,
        snipTextOverChars: 20,
        placeholderTextOverChars: 60,
        snipHeadChars: 8,
        snipTailChars: 6
      }
    })
    const compiled = await compiler.compile({
      sessionId: "ses_context_long",
      inputs: [
        input({ id: "inp_old", text: "old user text ".repeat(20), createdAt: 1 }),
        input({ id: "inp_new", text: "new user text ".repeat(20), createdAt: 3 })
      ],
      messages: [
        message({
          id: "msg_old",
          inputId: "inp_old",
          role: "assistant",
          content: [
            {
              type: "text",
              id: "part_old",
              text: "assistant old ".repeat(20)
            }
          ],
          createdAt: 2
        }),
        message({
          id: "msg_new",
          inputId: "inp_new",
          role: "assistant",
          content: [
            {
              type: "text",
              id: "part_new",
              text: "assistant new ".repeat(20)
            }
          ],
          createdAt: 4
        })
      ]
    })

    expect(compiled.replacements.map((item) => item.partId)).toEqual([
      "part_old"
    ])
    expect(compiled.messages[0]?.content[0]).toMatchObject({
      type: "text",
      text: "old user text ".repeat(20)
    })
    expect(compiled.messages[1]?.content[0]).toMatchObject({
      type: "text",
      text: "[compacted 280 chars]"
    })
    expect(compiled.messages[3]?.content[0]).toMatchObject({
      type: "text",
      text: "assistant new ".repeat(20)
    })
    expect(compiled.stats.tokenEstimateAfter).toBeLessThan(
      compiled.stats.tokenEstimateBefore
    )
  })

  it("protects the claimed input when timestamps tie", async () => {
    const compiler = new DeterministicContextCompiler({
      policy: {
        recentUserTurns: 1,
        snipTextOverChars: 20,
        placeholderTextOverChars: 60
      }
    })
    const compiled = await compiler.compile({
      sessionId: "ses_context_tie",
      inputs: [
        input({
          id: "inp_old",
          text: "old user text",
          createdAt: 1,
          status: "completed"
        }),
        input({
          id: "inp_new",
          text: "new user text",
          createdAt: 1,
          status: "claimed"
        })
      ],
      messages: [
        message({
          id: "msg_old",
          inputId: "inp_old",
          role: "assistant",
          content: [
            {
              type: "text",
              id: "part_tie_old",
              text: "assistant old ".repeat(20)
            }
          ],
          createdAt: 1
        })
      ]
    })

    expect(compiled.replacements.map((replacement) => replacement.partId)).toEqual([
      "part_tie_old"
    ])
    expect(
      compiled.messages.some((message) =>
        message.content.some(
          (part) => part.type === "text" && part.text === "new user text"
        )
      )
    ).toBe(true)
  })

  it("compacts tool results and reuses stable replacements", async () => {
    const compiler = new DeterministicContextCompiler({
      policy: {
        recentUserTurns: 0,
        snipTextOverChars: 20,
        placeholderTextOverChars: 2_000
      }
    })
    const request = {
      sessionId: "ses_context_tool",
      inputs: [input({ id: "inp_tool", text: "use tool", createdAt: 1 })],
      messages: [
        message({
          id: "msg_tool",
          inputId: "inp_tool",
          role: "tool",
          content: [
            {
              type: "tool_result",
              id: "part_tool",
              toolCallId: "call_1",
              result: { output: "tool output ".repeat(80) },
              isError: false
            }
          ],
          createdAt: 2
        })
      ]
    } satisfies Parameters<DeterministicContextCompiler["compile"]>[0]

    const first = await compiler.compile(request)
    const second = await compiler.compile(request)

    expect(first.replacements).toHaveLength(1)
    expect(second.replacements).toHaveLength(1)
    expect(second.replacements[0]?.id).toBe(first.replacements[0]?.id)
    expect(second.messages).toEqual(first.messages)
  })

  it("reuses durable replacements across compiler instances", async () => {
    const store = new MemoryReplacementStore()
    const request = {
      sessionId: "ses_context_durable",
      inputs: [input({ id: "inp_old", text: "old request", createdAt: 1 })],
      messages: [
        message({
          id: "msg_old",
          inputId: "inp_old",
          role: "assistant",
          content: [
            {
              type: "text",
              id: "part_durable",
              text: "durable assistant ".repeat(60)
            }
          ],
          createdAt: 2
        })
      ],
      policy: {
        version: "ctxmem-v1",
        recentUserTurns: 0,
        snipTextOverChars: 20,
        placeholderTextOverChars: 60
      }
    } satisfies Parameters<DeterministicContextCompiler["compile"]>[0]
    const firstCompiler = new DeterministicContextCompiler({
      replacementStore: store
    })
    const first = await firstCompiler.compile({
      ...request,
      epochId: "ctxepoch_context_durable"
    })
    store.setActiveEpoch({
      id: "ctxepoch_context_durable",
      sessionId: "ses_context_durable",
      policyVersion: "ctxmem-v1"
    })
    const secondCompiler = new DeterministicContextCompiler({
      replacementStore: store
    })
    const second = await secondCompiler.compile(request)

    expect(store.puts).toBe(1)
    expect(first.epochId).toBe("ctxepoch_context_durable")
    expect(second.epochId).toBe("ctxepoch_context_durable")
    expect(second.replacements[0]?.id).toBe(first.replacements[0]?.id)
    expect(second.messages).toEqual(first.messages)
  })

  it("does not create durable replacements when no active epoch exists", async () => {
    const store = new MemoryReplacementStore()
    const compiler = new DeterministicContextCompiler({
      replacementStore: store
    })
    const compiled = await compiler.compile({
      sessionId: "ses_context_no_active",
      inputs: [input({ id: "inp_no_active", text: "old request", createdAt: 1 })],
      messages: [
        message({
          id: "msg_no_active",
          inputId: "inp_no_active",
          role: "assistant",
          content: [
            {
              type: "text",
              id: "part_no_active",
              text: "no active epoch ".repeat(60)
            }
          ],
          createdAt: 2
        })
      ],
      policy: {
        recentUserTurns: 0,
        snipTextOverChars: 20,
        placeholderTextOverChars: 60
      }
    })

    expect(compiled.epochId).toBeUndefined()
    expect(compiled.replacements).toHaveLength(0)
    expect(compiled.messages[1]?.content[0]).toMatchObject({
      type: "text",
      text: "no active epoch ".repeat(60)
    })
    expect(store.puts).toBe(0)
  })

  it("uses an injected token estimator for compile stats and replacements", async () => {
    const compiler = new DeterministicContextCompiler({
      tokenEstimator: characterTokenEstimator()
    })
    const compiled = await compiler.compile({
      sessionId: "ses_context_estimator",
      inputs: [input({ id: "inp_estimator", text: "user", createdAt: 1 })],
      messages: [
        message({
          id: "msg_estimator",
          inputId: "inp_estimator",
          role: "assistant",
          content: [
            {
              type: "text",
              id: "part_estimator",
              text: "x".repeat(80)
            }
          ],
          createdAt: 2
        })
      ],
      policy: {
        recentUserTurns: 0,
        snipTextOverChars: 20,
        placeholderTextOverChars: 60
      }
    })

    expect(compiled.stats.tokenEstimateBefore).toBe(84)
    expect(compiled.stats.tokenEstimateAfter).toBe(24)
    expect(compiled.replacements[0]).toMatchObject({
      originalTokenEstimate: 80,
      replacementTokenEstimate: 20
    })
  })
})

function input(request: {
  readonly id: string
  readonly text: string
  readonly createdAt: number
  readonly status?: SessionInputRecord["status"]
}): SessionInputRecord {
  return {
    id: request.id,
    sessionId: "ses_context",
    principalId: "user",
    idempotencyKey: `idem_${request.id}`,
    inputType: "user",
    content: [{ type: "text", id: `part_${request.id}`, text: request.text }],
    status: request.status ?? "completed",
    createdAt: request.createdAt,
    updatedAt: request.createdAt
  }
}

function message(request: {
  readonly id: string
  readonly inputId: string
  readonly role: SessionMessageRecord["role"]
  readonly content: readonly MessagePart[]
  readonly createdAt: number
}): SessionMessageRecord {
  return {
    id: request.id,
    sessionId: "ses_context",
    inputId: request.inputId,
    runId: `run_${request.id}`,
    role: request.role,
    status: "completed",
    content: request.content,
    createdAt: request.createdAt,
    updatedAt: request.createdAt
  }
}

class MemoryReplacementStore {
  puts = 0
  private activeEpoch: ContextEpochRecord | null = null
  private readonly records = new Map<string, ContextReplacementRecord>()

  setActiveEpoch(request: {
    readonly id: string
    readonly sessionId: string
    readonly policyVersion: string
  }): void {
    this.activeEpoch = {
      id: request.id,
      sessionId: request.sessionId,
      policyVersion: request.policyVersion,
      state: "active",
      tokenEstimateBefore: 0,
      tokenEstimateAfter: 0,
      tokenSavings: 0,
      replacementCount: 0,
      createdAt: 1,
      activatedAt: 1,
      updatedAt: 1
    }
  }

  async getActiveContextEpoch(request: {
    readonly sessionId: string
    readonly policyVersion: string
  }): Promise<ContextEpochRecord | null> {
    if (
      this.activeEpoch?.sessionId === request.sessionId &&
      this.activeEpoch.policyVersion === request.policyVersion
    ) {
      return this.activeEpoch
    }
    return null
  }

  async listContextReplacements(request: {
    readonly sessionId: string
    readonly policyVersion?: string
    readonly epochId?: string
  }): Promise<ContextReplacementRecord[]> {
    return [...this.records.values()].filter(
      (record) =>
        record.sessionId === request.sessionId &&
        (request.policyVersion === undefined ||
          record.policyVersion === request.policyVersion) &&
        (request.epochId === undefined || record.epochId === request.epochId)
    )
  }

  async putContextReplacement(
    request: PutContextReplacementRequest
  ): Promise<ContextReplacementRecord> {
    this.puts += 1
    const key = `${request.epochId}:${request.partId}`
    const existing = this.records.get(key)
    const now = this.puts
    const record: ContextReplacementRecord = {
      id: existing?.id ?? request.id ?? `ctxrep_${this.puts}`,
      epochId: request.epochId,
      sessionId: request.sessionId,
      policyVersion: request.policyVersion,
      ...(request.messageId === undefined ? {} : { messageId: request.messageId }),
      partId: request.partId,
      tier: request.tier,
      originalTokenEstimate: request.originalTokenEstimate,
      replacementTokenEstimate: request.replacementTokenEstimate,
      replacement: request.replacement,
      ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    }
    this.records.set(key, record)
    return record
  }
}

function characterTokenEstimator(): ContextTokenEstimator {
  return {
    estimatePartTokens(part) {
      return part.type === "text" || part.type === "reasoning"
        ? (part.text?.length ?? 0)
        : 8
    },
    estimatePartsTokens(parts) {
      return parts.reduce(
        (sum, part) => sum + this.estimatePartTokens(part),
        0
      )
    }
  }
}
