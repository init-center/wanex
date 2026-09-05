import { describe, expect, it, vi } from "vitest"
import type {
  JsonValue,
  SessionTurnExecutionBinding,
  TeamParticipantRecord
} from "@wanex/protocol"
import type { ToolInvocation } from "@wanex/runtime/tools"
import type { SessionTurnAgentContextIdentity } from "@wanex/runtime/execution"
import {
  createTeamDelegateTool,
  TEAM_DELEGATE_TOOL_NAME
} from "../../src/conversation/index.js"

describe("Team delegation Tool", () => {
  it("projects model-owned task intent into stable trusted deferred work", async () => {
    const prepare = vi.fn(async ({ sessionId }) => prepared(sessionId))
    const participants = [participant("research"), participant("review")]
    const inheritedContextIdentity = {} as SessionTurnAgentContextIdentity
    const tool = createTeamDelegateTool({
      conversationId: "conversation_delegate",
      deliveryId: "delivery_delegate",
      leadParticipantId: "participant_lead",
      participants,
      maxSteps: 12,
      priority: 3,
      inheritedContextBinding: binding("lead"),
      inheritedContextIdentity,
      prepareExecutionBinding: prepare
    })

    expect(tool).toMatchObject({
      name: TEAM_DELEGATE_TOOL_NAME,
      risk: "external",
      idempotent: true,
      concurrency: "exclusive",
      resultMode: "deferred"
    })
    expect(tool.inputSchema).not.toHaveProperty("properties.operationId")
    expect(tool.inputSchema).not.toHaveProperty("properties.graphId")
    expect(tool.inputSchema).not.toHaveProperty("properties.sessionId")

    const input = {
      tasks: [
        {
          key: "research",
          targetParticipantId: participants[0]!.id,
          prompt: "Research the current implementation."
        },
        {
          key: "review",
          targetParticipantId: participants[1]!.id,
          prompt: "Review the findings.",
          dependsOn: ["research"]
        }
      ]
    }
    const first = await tool.invoke(invocation(input))
    const replay = await tool.invoke(invocation(input))
    expect(first.outcome).toBe("deferred")
    if (
      first.outcome !== "deferred" ||
      replay.outcome !== "deferred" ||
      first.operation.kind !== "team_delegation"
    ) {
      throw new Error("expected Team delegation operation")
    }
    expect(replay.operation).toEqual(first.operation)
    expect(first.operation).toMatchObject({
      conversationId: "conversation_delegate",
      sourceDeliveryId: "delivery_delegate",
      leadParticipantId: "participant_lead"
    })
    expect(first.operation.operationId).toMatch(/^teamop_[a-f0-9]{64}$/)
    expect(first.operation.graphId).toMatch(/^dgraph_team_[a-f0-9]{64}$/)
    expect(first.operation.tasks).toHaveLength(2)
    expect(first.operation.tasks[1]!.dependsOnTaskIds).toEqual([
      first.operation.tasks[0]!.id
    ])
    expect(first.operation.tasks.map((task) => task.targetSessionId)).toEqual([
      "ses_research",
      "ses_review"
    ])
    expect(first.operation.tasks.every((task) => task.maxSteps === 12)).toBe(true)
    expect(first.operation.tasks.every((task) => task.priority === 3)).toBe(true)
    expect(prepare).toHaveBeenCalledTimes(4)
    expect(prepare.mock.calls[0]![0]).toMatchObject({
      sessionId: "ses_research",
      content: [{
        type: "text",
        text: "Research the current implementation."
      }],
      origin: {
        kind: "agent",
        sourceRef: "delivery_delegate",
        parentRef: first.operation.operationId,
        metadata: {
          teamConversationId: "conversation_delegate",
          teamDelegationOperationId: first.operation.operationId,
          sourceTeamDeliveryId: "delivery_delegate",
          targetParticipantId: participants[0]!.id,
          leadParticipantId: "participant_lead"
        }
      }
    })
    expect(prepare.mock.calls[0]![0].inheritedContextIdentity).toBe(
      inheritedContextIdentity
    )
  })

  it("rejects duplicate targets, unknown dependencies, cycles, and unavailable agents", async () => {
    const participants = [participant("a"), participant("b")]
    const tool = createTeamDelegateTool({
      conversationId: "conversation_reject",
      deliveryId: "delivery_reject",
      leadParticipantId: "participant_lead",
      participants,
      inheritedContextBinding: binding("lead"),
      prepareExecutionBinding: async ({ sessionId }) => prepared(sessionId)
    })
    await expect(tool.invoke(invocation({ tasks: [
      task("a", participants[0]!.id),
      task("b", participants[0]!.id)
    ] }))).rejects.toThrow(/Duplicate.*target/)
    await expect(tool.invoke(invocation({ tasks: [
      { ...task("a", participants[0]!.id), dependsOn: ["missing"] }
    ] }))).rejects.toThrow(/unknown dependency/)
    await expect(tool.invoke(invocation({ tasks: [
      { ...task("a", participants[0]!.id), dependsOn: ["b"] },
      { ...task("b", participants[1]!.id), dependsOn: ["a"] }
    ] }))).rejects.toThrow(/must form a DAG/)
    await expect(tool.invoke(invocation({ tasks: [
      task("a", "participant_missing")
    ] }))).rejects.toThrow(/Unavailable/)
  })

  it("rolls back every completed child preparation when a parallel preparation fails", async () => {
    const participants = [
      participant("research"),
      participant("review"),
      participant("design")
    ]
    const settlements = new Map<string, {
      readonly commit: ReturnType<typeof vi.fn>
      readonly rollback: ReturnType<typeof vi.fn>
    }>()
    const prepare = vi.fn(async ({ sessionId }: { readonly sessionId: string }) => {
      if (sessionId === "ses_review") {
        throw new Error("review preparation failed")
      }
      const settlement = {
        commit: vi.fn(),
        rollback: vi.fn()
      }
      settlements.set(sessionId, settlement)
      return {
        binding: binding(sessionId),
        context: settlement
      }
    })
    const tool = createTeamDelegateTool({
      conversationId: "conversation_prepare_failure",
      deliveryId: "delivery_prepare_failure",
      leadParticipantId: "participant_lead",
      participants,
      inheritedContextBinding: binding("lead"),
      prepareExecutionBinding: prepare
    })

    await expect(tool.invoke(invocation({ tasks: [
      task("research", participants[0]!.id),
      task("review", participants[1]!.id),
      task("design", participants[2]!.id)
    ] }))).rejects.toThrow("review preparation failed")

    expect(prepare).toHaveBeenCalledTimes(3)
    expect(settlements.get("ses_research")?.commit).not.toHaveBeenCalled()
    expect(settlements.get("ses_research")?.rollback).toHaveBeenCalledTimes(1)
    expect(settlements.get("ses_design")?.commit).not.toHaveBeenCalled()
    expect(settlements.get("ses_design")?.rollback).toHaveBeenCalledTimes(1)
  })
})

function participant(id: string): TeamParticipantRecord {
  return {
    id: `participant_${id}`,
    conversationId: "conversation_delegate",
    principalId: `principal_${id}`,
    kind: "agent",
    displayName: id,
    agentSessionId: `ses_${id}`,
    state: "active",
    createdAt: 1,
    updatedAt: 1
  }
}

function task(
  key: string,
  targetParticipantId: string
): Readonly<Record<string, JsonValue>> {
  return { key, targetParticipantId, prompt: `${key} prompt` }
}

function binding(label: string): SessionTurnExecutionBinding {
  return { digest: `binding_${label}` } as unknown as SessionTurnExecutionBinding
}

function prepared(label: string) {
  return {
    binding: binding(label),
    context: { commit() {}, rollback() {} }
  }
}

function invocation(input: JsonValue): ToolInvocation {
  return {
    principalId: "principal_lead",
    sessionId: "ses_lead",
    inputId: "inp_lead",
    turnId: "turn_lead",
    attemptId: "attempt_lead",
    toolCallId: "call_team_delegate",
    toolName: TEAM_DELEGATE_TOOL_NAME,
    input,
    idempotencyKey: "tool-team-delegate",
    resources: {
      async publish() {
        throw new Error("Team delegation does not publish resources")
      },
      async reference() {
        throw new Error("Team delegation does not reference resources")
      }
    }
  }
}
