import { describe, expect, it } from "vitest"
import type {
  ObjectiveRecord,
  ObjectiveState
} from "@wanex/protocol"
import type { WanexAppGoalView } from "@wanex/app"
import { createGoalShell } from "../src/goal/service.js"
import { createState } from "../src/state/assistant.js"
import {
  isSurfaceEnvelope,
  isSurfaceEvent
} from "../src/surface/validation.js"
import {
  parseSurfaceCancelGoalRequest,
  SurfaceValidationError
} from "../src/surface/input.js"
import type {
  GoalShellOptions
} from "../src/goal/service.js"
import type { GoalReadModel } from "../src/goal/model.js"
import { assistantTestModelEndpoint } from "./model-endpoint-fixture.js"

describe("@wanex/assistant Goal journey", () => {
  it("requires an active selected Session, criteria, and a runnable Provider", async () => {
    const fixture = createGoalFixture()
    const goal = createGoalShell({
      backend: fixture.backend,
      state: fixture.state
    })

    try {
      delete fixture.state.selection
      await expect(goal.start(goalStartRequest())).rejects.toThrow(
        "select an active Session"
      )

      fixture.state.selection = { kind: "session", sessionId: "ses_goal" }
      fixture.sessionStatus = "archived"
      await expect(goal.start(goalStartRequest())).rejects.toThrow(
        "Goal Session is archived"
      )

      fixture.sessionStatus = "active"
      fixture.credentialConfigured = false
      await expect(goal.start(goalStartRequest())).rejects.toThrow(
        "provider is not ready"
      )

      fixture.credentialConfigured = true
      await expect(
        goal.start({ ...goalStartRequest(), successCriteria: [] })
      ).rejects.toThrow("Goal requires at least one success criterion")
      await expect(
        goal.start({
          ...goalStartRequest(),
          stopPolicy: {
            maxAttempts: 2,
            maxConsecutiveBlockedAttempts: 3
          }
        })
      ).rejects.toThrow(
        "Goal maxConsecutiveBlockedAttempts cannot exceed maxAttempts"
      )

      await expect(goal.start(goalStartRequest())).resolves.toMatchObject({
        kind: "assistant.goal",
        sessionId: "ses_goal",
        objective: "Finish the Assistant Goal journey",
        state: "active"
      })
    } finally {
      await goal.dispose()
    }
  })

  it("selects the live Session Goal and projects bounded public evidence only", async () => {
    const fixture = createGoalFixture()
    fixture.putGoal(goalView({
      id: "goal_terminal_latest",
      state: "succeeded",
      updatedAt: 30,
      closedAt: 30
    }))
    fixture.putGoal(goalView({
      id: "goal_live",
      state: "active",
      updatedAt: 20,
      withEvidence: true
    }))
    fixture.goalOrder = ["goal_terminal_latest", "goal_live"]
    const goal = createGoalShell({
      backend: fixture.backend,
      state: fixture.state
    })

    try {
      const result = await goal.read()
      expect(result).toMatchObject({
        kind: "assistant.goal.found",
        goal: {
          goalId: "goal_live",
          attemptCount: 1,
          attempts: [{
            trigger: "initial",
            review: { disposition: "continue" },
            verifications: [{ result: "failed" }]
          }]
        }
      })
      const serialized = JSON.stringify(result)
      for (const privateValue of [
        "wanex-app-goal",
        "private-binding-digest",
        "private-attempt-idempotency",
        "private-budget-grant",
        "private-verifier-ref",
        "private-evidence-digest"
      ]) {
        expect(serialized).not.toContain(privateValue)
      }

      fixture.goalOrder = ["goal_terminal_latest"]
      await expect(goal.read()).resolves.toMatchObject({
        kind: "assistant.goal.found",
        goal: { goalId: "goal_terminal_latest" }
      })
      expect(Object.keys(fixture.state)).not.toContain("selectedGoalId")
    } finally {
      await goal.dispose()
    }
  })

  it("fails closed for wrong identity, stale revision, and invalid transitions", async () => {
    const fixture = createGoalFixture()
    fixture.putGoal(goalView({ id: "goal_control", state: "active" }))
    const goal = createGoalShell({
      backend: fixture.backend,
      state: fixture.state
    })

    try {
      fixture.state.selection = { kind: "session", sessionId: "ses_other" }
      await expect(goal.read({ goalId: "goal_control" })).rejects.toThrow(
        "Goal does not belong to the selected Session"
      )
      fixture.state.selection = { kind: "session", sessionId: "ses_goal" }

      await expect(goal.pause({
        goalId: "goal_control",
        expectedRevision: 99
      })).rejects.toThrow("Goal revision changed")

      const paused = await goal.pause({
        goalId: "goal_control",
        expectedRevision: 1,
        reason: "Review direction"
      })
      expect(paused).toMatchObject({ state: "paused", revision: 2 })
      await expect(goal.pause({
        goalId: "goal_control",
        expectedRevision: 2
      })).rejects.toThrow("Goal cannot pause from state paused")

      fixture.credentialConfigured = false
      await expect(goal.resume({
        goalId: "goal_control",
        expectedRevision: 2
      })).rejects.toThrow("provider is not ready")
      fixture.credentialConfigured = true
      const resumed = await goal.resume({
        goalId: "goal_control",
        expectedRevision: 2
      })
      expect(resumed).toMatchObject({ state: "active", revision: 3 })

      const cancelled = await goal.cancel({
        goalId: "goal_control",
        expectedRevision: 3,
        reason: "Stop this Goal"
      })
      expect(cancelled).toMatchObject({
        state: "cancel_requested",
        revision: 4,
        canCancel: false
      })
      await expect(goal.cancel({
        goalId: "goal_control",
        expectedRevision: 4,
        reason: "Again"
      })).rejects.toThrow("Goal cannot cancel from state cancel_requested")
    } finally {
      await goal.dispose()
    }
  })

  it("forwards bounded invalidations and stops forwarding after disposal", async () => {
    const fixture = createGoalFixture()
    const goal = createGoalShell({
      backend: fixture.backend,
      state: fixture.state
    })
    const events: unknown[] = []
    goal.events.subscribeGoalEvents((event) => events.push(event))

    fixture.emitGoalEvent({
      kind: "wanex-app.goal.invalidated",
      sequence: 44,
      at: 100,
      objectiveId: "goal_event",
      sessionId: "ses_goal",
      cause: "attempt_reviewed"
    })
    expect(events).toEqual([{
      kind: "assistant.goal.invalidated",
      sequence: 1,
      at: 100,
      goalId: "goal_event",
      sessionId: "ses_goal",
      cause: "attempt_reviewed"
    }])

    await goal.dispose()
    fixture.emitGoalEvent({
      kind: "wanex-app.goal.invalidated",
      sequence: 45,
      at: 101,
      objectiveId: "goal_event",
      sessionId: "ses_goal",
      cause: "cancelled"
    })
    expect(events).toHaveLength(1)
  })

  it("rejects malformed Goal Surface input, values, and event payloads", () => {
    expect(() => parseSurfaceCancelGoalRequest({
      goalId: "goal_surface",
      expectedRevision: 1,
      reason: "   "
    })).toThrow(SurfaceValidationError)

    const model = projectableGoalModel()
    const event = {
      id: "stream:1",
      sequence: 1,
      type: "assistant.surface.command_completed" as const,
      command: "readGoal",
      at: 10
    }
    expect(isSurfaceEnvelope({
      ok: true,
      command: "readGoal",
      value: { kind: "assistant.goal.found", goal: model },
      event
    }, "readGoal")).toBe(true)
    expect(isSurfaceEnvelope({
      ok: true,
      command: "readGoal",
      value: {
        kind: "assistant.goal.found",
        goal: { ...model, state: "invented" }
      },
      event
    }, "readGoal")).toBe(false)

    expect(isSurfaceEvent({
      id: "stream:2",
      sequence: 2,
      type: "assistant.surface.goal.invalidated",
      command: "readGoal",
      at: 11,
      goal: {
        kind: "assistant.goal.invalidated",
        sequence: 1,
        at: 11,
        goalId: "goal_surface",
        sessionId: "ses_goal",
        cause: "paused"
      }
    })).toBe(true)
    expect(isSurfaceEvent({
      id: "stream:3",
      sequence: 3,
      type: "assistant.surface.goal.invalidated",
      command: "readGoal",
      at: 12
    })).toBe(false)
    expect(isSurfaceEvent({
      id: "stream:4",
      sequence: 4,
      type: "assistant.surface.conversation.operation-invalidated",
      command: "readTrackedConversationOperation",
      at: 13,
      conversation: {
        kind: "assistant.conversation.operation-invalidated",
        sequence: 2,
        at: 13,
        operationId: "operation_surface",
        sessionId: "ses_goal",
        cause: "execution_suspended"
      }
    })).toBe(true)
  })
})

function createGoalFixture() {
  const state = createState(undefined, {
    selection: { kind: "session", sessionId: "ses_goal" }
  })
  const goals = new Map<string, WanexAppGoalView>()
  const listeners = new Set<
    Parameters<GoalShellOptions["backend"]["events"]["subscribeGoalEvents"]>[0]
  >()
  const fixture = {
    state,
    sessionStatus: "active" as "active" | "archived",
    credentialConfigured: true,
    goalOrder: [] as string[],
    putGoal(view: WanexAppGoalView) {
      goals.set(view.objective.id, view)
    },
    emitGoalEvent(
      event: Parameters<
        Parameters<
          GoalShellOptions["backend"]["events"]["subscribeGoalEvents"]
        >[0]
      >[0]
    ) {
      for (const listener of listeners) listener(event)
    },
    backend: undefined as unknown as GoalShellOptions["backend"]
  }
  const endpoint = assistantTestModelEndpoint({
    endpointId: "goal-provider",
    modelId: "goal-model",
    protocolId: "openai-chat-completions",
    providerId: "openai-compatible",
    baseUrl: "https://goal-provider.example.test/v1",
    secretRef: "static://goal-provider"
  })
  fixture.backend = {
    commands: {
      async startGoal(request) {
        const view = goalView({
          id: "goal_started",
          sessionId: request.sessionId,
          state: "active",
          objective: request.objective,
          successCriteria: request.successCriteria,
          ...(request.stopPolicy === undefined
            ? {}
            : { stopPolicy: request.stopPolicy })
        })
        goals.set(view.objective.id, view)
        fixture.goalOrder = [view.objective.id, ...fixture.goalOrder]
        return view
      },
      async readGoal(request) {
        return goals.get(request.objectiveId) ?? null
      },
      async listGoals(request = {}) {
        return fixture.goalOrder
          .map((id) => goals.get(id)?.objective)
          .filter((goal): goal is ObjectiveRecord =>
            goal !== undefined &&
            (request.sessionId === undefined || goal.sessionId === request.sessionId)
          )
          .slice(0, request.limit)
      },
      async pauseGoal(request) {
        return transitionGoal(goals, request.objectiveId, request.expectedRevision, "paused")
      },
      async resumeGoal(request) {
        return transitionGoal(goals, request.objectiveId, request.expectedRevision, "active")
      },
      async cancelGoal(request) {
        return transitionGoal(
          goals,
          request.objectiveId,
          request.expectedRevision,
          "cancel_requested"
        )
      },
      async readSession(request) {
        return {
          kind: "wanex-app.session.found" as const,
          session: {
            sessionId: request.sessionId,
            title: "Goal Session",
            kind: "agent" as const,
            status: fixture.sessionStatus,
            revision: 1,
            createdAt: 1,
            updatedAt: 1
          }
        }
      },
      async listModelEndpoints() {
        return {
          activeEndpointId: endpoint.id,
          endpoints: [{
            id: endpoint.id,
            connection: {
              id: endpoint.connection.id,
              providerId: endpoint.connection.providerId,
              baseUrl: endpoint.connection.baseUrl!
            },
            protocol: endpoint.protocol,
            model: endpoint.model,
            credentialConfigured: fixture.credentialConfigured,
            active: true
          }]
        }
      }
    },
    events: {
      subscribeConversationEvents() {
        return () => {}
      },
      subscribeGoalEvents(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      }
    }
  }
  return fixture
}

function transitionGoal(
  goals: Map<string, WanexAppGoalView>,
  goalId: string,
  expectedRevision: number,
  state: ObjectiveState
): WanexAppGoalView {
  const current = goals.get(goalId)
  if (current === undefined) throw new Error(`Goal does not exist: ${goalId}`)
  if (current.objective.revision !== expectedRevision) {
    throw new Error("Goal revision changed")
  }
  const next: WanexAppGoalView = {
    ...current,
    objective: {
      ...current.objective,
      state,
      revision: current.objective.revision + 1,
      updatedAt: current.objective.updatedAt + 1,
      reason: {
        code:
          state === "paused"
            ? "user_paused"
            : state === "active"
              ? "user_resumed"
              : "cancel_requested"
      }
    }
  }
  goals.set(goalId, next)
  return next
}

function goalStartRequest() {
  return {
    objective: "  Finish the Assistant Goal journey  ",
    successCriteria: ["Journey is verified"],
    stopPolicy: {
      maxAttempts: 3,
      maxConsecutiveBlockedAttempts: 2
    }
  }
}

function goalView(options: {
  readonly id: string
  readonly sessionId?: string
  readonly state: ObjectiveState
  readonly objective?: string
  readonly successCriteria?: readonly string[]
  readonly stopPolicy?: {
    readonly maxAttempts?: number
    readonly maxConsecutiveBlockedAttempts?: number
  }
  readonly updatedAt?: number
  readonly closedAt?: number
  readonly withEvidence?: boolean
}): WanexAppGoalView {
  const updatedAt = options.updatedAt ?? 10
  const attemptId = `attempt_${options.id}`
  return {
    objective: {
      id: options.id,
      sessionId: options.sessionId ?? "ses_goal",
      principalId: "wanex-app-goal",
      objective: options.objective ?? "Canonical Goal",
      boundaries: ["Remain bounded"],
      constraints: ["Use canonical state"],
      successCriteria: (options.successCriteria ?? ["Goal is verified"]).map(
        (description, index) => ({
          id: `criterion_${index + 1}`,
          description
        })
      ),
      verificationPolicy: {
        requirements: [{
          id: "verification_requirement",
          criterionIds: ["criterion_1"],
          verifierKind: "model",
          verifierRef: "private-verifier-ref"
        }]
      },
      stopPolicy: {
        maxAttempts: options.stopPolicy?.maxAttempts ?? 3,
        maxConsecutiveBlockedAttempts:
          options.stopPolicy?.maxConsecutiveBlockedAttempts ?? 2
      },
      revision: 1,
      state: options.state,
      reason: { code: options.state === "succeeded" ? "verification_succeeded" : "created" },
      createdAt: 1,
      updatedAt,
      ...(options.closedAt === undefined ? {} : { closedAt: options.closedAt })
    },
    attempts: options.withEvidence === true
      ? [{
          id: attemptId,
          objectiveId: options.id,
          attemptNumber: 1,
          inputId: "input_goal",
          turnId: "turn_goal",
          jobId: "job_goal",
          executionBindingDigest: "private-binding-digest",
          trigger: "initial",
          budgetGrantId: "private-budget-grant",
          idempotencyKey: "private-attempt-idempotency",
          boundAt: 2
        }]
      : [],
    reviews: options.withEvidence === true
      ? [{
          id: "review_goal",
          objectiveId: options.id,
          attemptId,
          disposition: "continue",
          reason: "Continue safely",
          createdAt: 3
        }]
      : [],
    verifications: options.withEvidence === true
      ? [{
          id: "verification_goal",
          objectiveId: options.id,
          attemptId,
          requirementId: "verification_requirement",
          verifierKind: "model",
          verifierRef: "private-verifier-ref",
          result: "failed",
          reason: "More work remains",
          evidence: [{
            kind: "provider_output",
            referenceId: "private-provider-output",
            digest: "private-evidence-digest"
          }],
          createdAt: 3
        }]
      : []
  }
}

function projectableGoalModel(): GoalReadModel {
  return {
    kind: "assistant.goal",
    goalId: "goal_surface",
    sessionId: "ses_goal",
    revision: 1,
    state: "active",
    objective: "Validate Surface",
    boundaries: [],
    constraints: [],
    successCriteria: [{ id: "criterion", description: "Surface is valid" }],
    stopPolicy: {
      maxAttempts: 3,
      maxConsecutiveBlockedAttempts: 2
    },
    reason: { code: "created" },
    attemptCount: 0,
    attempts: [],
    canPause: true,
    canResume: false,
    canCancel: true,
    createdAt: 1,
    updatedAt: 1
  }
}
