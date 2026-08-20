import { describe, expect, it } from "vitest"
import {
  createRuntimeEvent,
  type DelegationGraphState,
  type GetJobRequest,
  type ObjectiveAttemptReviewRecord,
  type ObjectiveAttemptRecord,
  type ObjectiveRecord,
  type ObjectiveState,
  type ObjectiveStopPolicy,
  type ObjectiveVerificationRecord,
  type ObjectiveVerificationResult,
  type MaterializeReadyDelegationGraphNodeRequest,
  type ChannelDeliveryAcknowledgement,
  type ChannelBindingRecord,
  type ConnectorRegistrationRecord,
  type ConnectorRegistrationState,
  type ChannelProjectionReceipt,
  type ChannelDeliverySubmission,
  type DelegationNodeKind,
  eventFamily,
  isKnownRuntimeEventType,
  type PluginCapability,
  type SchedulerJobKind,
  type TeamConversationMode,
  type TeamMessageKind,
  type WorkspaceChangeProposalOperationKind,
  type WorkspaceChangeProposalState,
  type EphemeralQueryRequest,
  type ApplySessionTurnControlRequest,
  type ApplySessionTurnControlReceipt,
  type InterruptSessionTurnRequest,
  type ListSessionTurnControlsRequest,
  type PlanProposalOperationKind,
  type PlanProposalRecord,
  type PlanProposalState,
  type RunControlPolicy,
  type RuntimeEventScope,
  type SessionInputIntent,
  type SessionInputOrigin,
  type SessionTurnControlRecord,
  type SteerSessionTurnRequest,
  isTerminalSessionInputState,
  normalizeToolActivityPresentation,
  SESSION_TURN_CONTEXT_CAPACITY_ERROR_KIND,
  type SessionTurnContextCapacityError,
  WANEX_PROTOCOL_VERSION
} from "../src/index.js"

describe("@wanex/protocol", () => {
  it("exposes the frozen protocol version", () => {
    expect(WANEX_PROTOCOL_VERSION).toBe(1)
  })

  it("normalizes bounded UI-neutral Tool activity evidence", () => {
    expect(normalizeToolActivityPresentation({
      summary: "Workspace file read",
      details: [{ label: "Path", value: "src/main.ts" }]
    })).toEqual({
      summary: "Workspace file read",
      details: [{ label: "Path", value: "src/main.ts" }]
    })
    expect(() => normalizeToolActivityPresentation({
      summary: "图".repeat(171)
    })).toThrow("1 to 512 UTF-8 bytes")
    expect(() => normalizeToolActivityPresentation({
      summary: "Unsafe\nsummary"
    })).toThrow("without control characters")
    expect(() => normalizeToolActivityPresentation({
      summary: "Too many details",
      details: Array.from({ length: 17 }, (_, index) => ({
        label: "Row",
        value: String(index)
      }))
    })).toThrow("exceeds 16 details")
  })

  it("creates runtime events with a stable shape", () => {
    const event = createRuntimeEvent({
      id: "evt_1",
      type: "session.input.admitted",
      scope: { sessionId: "ses_1", inputId: "inp_1" },
      payload: { ok: true },
      occurredAt: 1
    })

    expect(event).toEqual({
      id: "evt_1",
      type: "session.input.admitted",
      scope: { sessionId: "ses_1", inputId: "inp_1" },
      payload: { ok: true },
      occurredAt: 1,
      protocolVersion: 1
    })
  })

  it("classifies terminal input states", () => {
    expect(isTerminalSessionInputState("completed")).toBe(true)
    expect(isTerminalSessionInputState("failed")).toBe(true)
    expect(isTerminalSessionInputState("cancelled")).toBe(true)
    expect(isTerminalSessionInputState("control_pending")).toBe(false)
    expect(isTerminalSessionInputState("promoted")).toBe(false)
  })

  it("exposes the durable Session Turn context-capacity failure", () => {
    const error: SessionTurnContextCapacityError = {
      kind: SESSION_TURN_CONTEXT_CAPACITY_ERROR_KIND,
      message: "request exceeds the selected model capacity",
      capacity: {
        reasons: ["input_tokens_exceeded"],
        inputTokens: 900,
        inputTokenCeiling: 700,
        inputResources: 0,
        requestedOutputTokens: 100,
        compactionAttempted: true
      }
    }

    expect(error.kind).toBe("session_turn.context_capacity_exceeded")
    expect(error.capacity.inputTokenCeiling).toBe(700)
  })

  it("classifies known runtime event families", () => {
    expect(eventFamily("session.turn.succeeded")).toBe("session")
    expect(eventFamily("scheduler.job.succeeded")).toBe("scheduler")
    expect(eventFamily("budget.grant.reserved")).toBe("budget")
    expect(eventFamily("resource.ticket.cleanup")).toBe("resource")
    expect(eventFamily("config.updated")).toBe("config")
    expect(eventFamily("context.compaction.applied")).toBe("context")
    expect(eventFamily("context.epoch.activated")).toBe("context")
    expect(eventFamily("session.turn.interrupt_requested")).toBe("session")
    expect(eventFamily("session.turn.steer_accepted")).toBe("session")
    expect(eventFamily("session.turn.control_applied")).toBe("session")
    expect(eventFamily("session.ephemeral_query.completed")).toBe("session")
    expect(eventFamily("plan.proposal.created")).toBe("plan")
    expect(eventFamily("objective.created")).toBe("objective")
    expect(eventFamily("objective.attempt.admitted")).toBe("objective")
    expect(eventFamily("custom.future.event")).toBe("unknown")
    expect(isKnownRuntimeEventType("scheduler.job.failed")).toBe(true)
    expect(isKnownRuntimeEventType("config.updated")).toBe(true)
    expect(isKnownRuntimeEventType("context.compaction.skipped")).toBe(true)
    expect(isKnownRuntimeEventType("context.epoch.activated")).toBe(true)
    expect(isKnownRuntimeEventType("session.turn.interrupted")).toBe(true)
    expect(isKnownRuntimeEventType("session.turn.recovery_required")).toBe(true)
    expect(isKnownRuntimeEventType("plan.proposal.operation_recorded")).toBe(
      true
    )
    expect(isKnownRuntimeEventType("plan.proposal.execution_bound")).toBe(true)
    expect(isKnownRuntimeEventType("objective.verification.recorded")).toBe(true)
    expect(isKnownRuntimeEventType("custom.future.event")).toBe(false)
  })

  it("exposes app-neutral input origin and intent contracts", () => {
    const origin: SessionInputOrigin = {
      kind: "connector",
      sourceRef: "channel:primary",
      parentRef: "delivery:abc",
      metadata: {
        productClient: "desktop"
      }
    }
    const intent: SessionInputIntent = "follow_up"
    const policy: RunControlPolicy = "queue_after_current"

    expect(origin.kind).toBe("connector")
    expect(origin.metadata?.productClient).toBe("desktop")
    expect(intent).toBe("follow_up")
    expect(policy).toBe("queue_after_current")
  })

  it("exposes dedicated steer and interrupt request contracts", () => {
    const steer: SteerSessionTurnRequest = {
      sessionId: "ses_1",
      principalId: "user_1",
      expectedTurnId: "turn_active",
      expectedAttemptId: "attempt_active",
      idempotencyKey: "steer_1",
      content: [{ id: "part_1", type: "text", text: "Please narrow scope." }],
      origin: { kind: "interactive" }
    }
    const interrupt: InterruptSessionTurnRequest = {
      sessionId: steer.sessionId,
      turnId: steer.expectedTurnId,
      attemptId: steer.expectedAttemptId,
      reason: "user changed direction",
      principalId: steer.principalId,
      origin: { kind: "interactive" }
    }

    expect(steer.expectedTurnId).toBe("turn_active")
    expect(interrupt.turnId).toBe("turn_active")
    expect(interrupt.origin?.kind).toBe("interactive")
  })

  it("exposes durable run-control record contracts", () => {
    const record: SessionTurnControlRecord = {
      id: "rctl_1",
      sessionId: "ses_1",
      turnId: "turn_1",
      attemptId: "attempt_1",
      inputId: "inp_steer",
      principalId: "user_1",
      idempotencyKey: "idem_steer",
      kind: "steer",
      status: "pending",
      content: [{ id: "part_1", type: "text", text: "focus on tests" }],
      origin: { kind: "interactive" },
      metadata: { ui: "sidebar" },
      createdAt: 1,
      updatedAt: 1
    }
    const list: ListSessionTurnControlsRequest = {
      sessionId: record.sessionId,
      turnId: record.turnId,
      attemptId: record.attemptId,
      kind: "steer",
      status: "pending"
    }
    const apply: ApplySessionTurnControlRequest = {
      sessionId: record.sessionId,
      turnId: record.turnId,
      attemptId: record.attemptId,
      controlId: record.id,
      jobId: "job_1",
      workerId: "worker_1",
      leaseToken: "lease_1"
    }
    const receipt: ApplySessionTurnControlReceipt = {
      control: {
        ...record,
        status: "applied",
        appliedAt: 2
      },
      effect: "steer_promoted_input"
    }

    expect(record.kind).toBe("steer")
    expect(record.content?.[0]?.type).toBe("text")
    expect(list.status).toBe("pending")
    expect(apply.controlId).toBe(record.id)
    expect(receipt.effect).toBe("steer_promoted_input")
  })

  it("models ephemeral side queries outside normal session input", () => {
    const query: EphemeralQueryRequest = {
      sessionId: "ses_1",
      principalId: "user_1",
      contextSnapshotId: "ctxsnap_1",
      question: [{ id: "part_1", type: "text", text: "Quick aside?" }],
      toolPolicy: "none",
      memoryPolicy: "exclude",
      persistence: "none",
      origin: { kind: "interactive" }
    }

    expect(query.toolPolicy).toBe("none")
    expect(query.memoryPolicy).toBe("exclude")
    expect(query.persistence).toBe("none")
    expect(query.contextSnapshotId).toBe("ctxsnap_1")
  })

  it("includes workspace.task as a scheduler job kind", () => {
    const kind: SchedulerJobKind = "workspace.task"
    expect(kind).toBe("workspace.task")
  })

  it("exposes precise scheduler job lookup requests", () => {
    const request: GetJobRequest = { jobId: "job_protocol" }
    expect(request.jobId).toBe("job_protocol")
  })

  it("exposes workspace change proposal review states", () => {
    const state: WorkspaceChangeProposalState = "applying"
    const operation: WorkspaceChangeProposalOperationKind = "request_apply"

    expect(state).toBe("applying")
    expect(operation).toBe("request_apply")
  })

  it("exposes durable plan proposal contracts", () => {
    const state: PlanProposalState = "approved"
    const operation: PlanProposalOperationKind = "approve"
    const scope: RuntimeEventScope = {
      planProposalId: "planp_protocol"
    }
    const proposal: PlanProposalRecord = {
      id: "planp_protocol",
      principalId: "agent_protocol",
      revision: 2,
      title: "Protocol plan",
      summary: "Durable plan proposal",
      steps: [
        { id: "step_1", title: "Inspect" },
        { id: "step_2", title: "Implement" }
      ],
      references: [
        {
          kind: "workspace_change_proposal",
          id: "wcp_protocol",
          role: "related"
        }
      ],
      source: {
        sessionId: "ses_protocol",
        headSequence: 0,
        analysisInputDigest: "a".repeat(64),
        planningRequest: [
          { id: "part_plan_request", type: "text", text: "Plan the work" }
        ]
      },
      generation: {
        endpointId: "profile_protocol",
        endpointDigest: "b".repeat(64),
        protocolId: "fake",
        providerId: "fake",
        modelId: "fake-plan",
        generatedAt: 1,
        outputDigest: "c".repeat(64),
        output: [{ id: "part_plan_output", type: "text", text: "{}" }]
      },
      state,
      createdAt: 1,
      updatedAt: 2
    }

    expect(proposal.state).toBe("approved")
    expect(proposal.source.sessionId).toBe("ses_protocol")
    expect(operation).toBe("approve")
    expect(scope.planProposalId).toBe(proposal.id)
  })

  it("exposes session-bound objective policy without duplicating execution state", () => {
    const state: ObjectiveState = "active"
    const verificationResult: ObjectiveVerificationResult = "passed"
    const stopPolicy: ObjectiveStopPolicy = {
      maxAttempts: 5,
      deadlineAt: 3_600_000,
      maxConsecutiveBlockedAttempts: 3,
      budget: { tokens: 10_000 }
    }
    const scope: RuntimeEventScope = {
      objectiveId: "objective_protocol"
    }
    const objective: ObjectiveRecord = {
      id: "objective_protocol",
      sessionId: "ses_objective_protocol",
      principalId: "agent_protocol",
      objective: "Make the release gate pass",
      boundaries: ["packages/protocol"],
      constraints: ["do not add CLI behavior"],
      successCriteria: [
        { id: "protocol-tests", description: "protocol tests pass" }
      ],
      verificationPolicy: {
        requirements: [
          {
            id: "verify-protocol-tests",
            criterionIds: ["protocol-tests"],
            verifierKind: "runtime",
            verifierRef: "wanex.protocol-test-verifier"
          }
        ]
      },
      stopPolicy,
      revision: 1,
      state,
      reason: { code: "created" },
      activeAttemptId: "objectiveatt_protocol",
      createdAt: 1,
      updatedAt: 2
    }
    const attempt: ObjectiveAttemptRecord = {
      id: "objectiveatt_protocol",
      objectiveId: objective.id,
      attemptNumber: 1,
      inputId: "input_objective_protocol",
      turnId: "turn_objective_protocol",
      jobId: "job_objective_protocol",
      executionBindingDigest: "a".repeat(64),
      trigger: "initial",
      idempotencyKey: "objective-attempt:protocol",
      boundAt: 3
    }
    const verification: ObjectiveVerificationRecord = {
      id: "objectivever_protocol",
      objectiveId: objective.id,
      attemptId: attempt.id,
      requirementId: "verify-protocol-tests",
      verifierKind: "runtime",
      verifierRef: "wanex.protocol-test-verifier",
      result: verificationResult,
      evidence: [
        {
          kind: "runtime_projection",
          referenceId: "protocol:test",
          digest: "b".repeat(64)
        }
      ],
      createdAt: 5
    }
    const review: ObjectiveAttemptReviewRecord = {
      id: "objectivereview_protocol",
      objectiveId: objective.id,
      attemptId: attempt.id,
      disposition: "succeeded",
      createdAt: 5
    }

    expect(objective.state).toBe("active")
    expect(objective.stopPolicy.maxAttempts).toBe(5)
    expect(objective.verificationPolicy.requirements).toHaveLength(1)
    expect(attempt.jobId).toBe("job_objective_protocol")
    expect(verification.result).toBe("passed")
    expect(review.disposition).toBe("succeeded")
    expect(scope.objectiveId).toBe(objective.id)
  })

  it("exposes delegation graph states and node kinds", () => {
    const state: DelegationGraphState = "running"
    const kind: DelegationNodeKind = "agent_task"
    const materialize: MaterializeReadyDelegationGraphNodeRequest = {
      graphId: "graph",
      workerId: "orchestrator",
      jobKind: "session.turn"
    }

    expect(state).toBe("running")
    expect(kind).toBe("agent_task")
    expect(materialize.jobKind).toBe("session.turn")
  })

  it("exposes team conversation modes and turn kinds", () => {
    const modes: TeamConversationMode[] = [
      "orchestrated",
      "peer",
      "hybrid"
    ]
    const message: TeamMessageKind = "message"

    expect(modes).toEqual(["orchestrated", "peer", "hybrid"])
    expect(message).toBe("message")
  })

  it("exposes plugin capabilities for connector-style adapters", () => {
    const capability: PluginCapability = "channel.deliver"
    const state: ConnectorRegistrationState = "active"
    const kind: SchedulerJobKind = "plugin.action"

    expect(capability).toBe("channel.deliver")
    expect(state).toBe("active")
    expect(kind).toBe("plugin.action")
  })

  it("exposes channel connector contracts", () => {
    const binding: ChannelBindingRecord = {
      id: "bind_1",
      connectorId: "connector.telegram",
      channelKind: "telegram",
      channelId: "bot-main",
      externalIdentityId: "tg_user_1",
      principalId: "user_1",
      state: "active",
      createdAt: 1,
      updatedAt: 1
    }
    const registration: ConnectorRegistrationRecord = {
      id: "connreg_1",
      connectorId: "connector.telegram",
      pluginId: "plugin.connector.telegram",
      pluginVersion: "1.0.0",
      state: "active",
      createdAt: 1,
      updatedAt: 1
    }
    const kind: SchedulerJobKind = "channel.delivery"
    const submission: Pick<ChannelDeliverySubmission, "delivery"> = {
      delivery: {
        id: "del_1",
        connectorId: binding.connectorId,
        channelKind: binding.channelKind,
        channelId: binding.channelId,
        principalId: binding.principalId,
        payload: { text: "hello" },
        state: "pending",
        createdAt: 1,
        updatedAt: 1
      }
    }
    const acknowledgement: Pick<ChannelDeliveryAcknowledgement, "delivery"> = {
      delivery: {
        ...submission.delivery,
        state: "sent",
        schedulerJobId: "job_delivery",
        finishedAt: 2
      }
    }
    const projection: Pick<ChannelProjectionReceipt, "projection"> = {
      projection: {
        id: "chproj_1",
        inboundEventId: "chin_1",
        targetKind: "session.turn",
        targetId: "turn_1",
        targetJobId: "job_1",
        state: "projected",
        target: { kind: "session.turn", sessionId: "ses_1" },
        createdAt: 1,
        updatedAt: 1
      }
    }

    expect(kind).toBe("channel.delivery")
    expect(registration.pluginVersion).toBe("1.0.0")
    expect(submission.delivery.connectorId).toBe("connector.telegram")
    expect(acknowledgement.delivery.state).toBe("sent")
    expect(projection.projection.targetKind).toBe("session.turn")
  })
})
