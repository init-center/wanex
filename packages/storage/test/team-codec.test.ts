import { describe, expect, it } from "vitest"
import {
  fromRpcTeamConversationRecord,
  fromRpcTeamDeliveryRecord,
  fromRpcTeamRoutingDecisionRecord,
  toRpcRouteTeamMessageRequest,
  toRpcSetTeamConversationLeadRequest
} from "../src/codec-team.js"
import { fromRpcTeamDiscussionRoundRecord } from "../src/codec-team-round.js"
import { fromRpcTeamConversationPage } from "../src/codec-team-page.js"

describe("Team storage codec", () => {
  it("maps optional lead authority to explicit wire nulls", () => {
    expect(toRpcSetTeamConversationLeadRequest({
      conversationId: "team_lead_codec"
    })).toEqual({
      conversation_id: "team_lead_codec",
      expected_lead_participant_id: null,
      lead_participant_id: null
    })
    expect(toRpcSetTeamConversationLeadRequest({
      conversationId: "team_lead_codec",
      expectedLeadParticipantId: "team_agent_a",
      leadParticipantId: "team_agent_b"
    })).toEqual({
      conversation_id: "team_lead_codec",
      expected_lead_participant_id: "team_agent_a",
      lead_participant_id: "team_agent_b"
    })

    const base = {
      id: "team_lead_codec",
      principal_id: "team_owner",
      title: null,
      mode: "orchestrated",
      state: "open",
      metadata: null,
      created_at: 1,
      updated_at: 2,
      closed_at: null
    }
    expect(fromRpcTeamConversationRecord({
      ...base,
      lead_participant_id: null
    })).not.toHaveProperty("leadParticipantId")
    expect(fromRpcTeamConversationRecord({
      ...base,
      lead_participant_id: "team_agent_b"
    })).toMatchObject({ leadParticipantId: "team_agent_b" })
  })

  it("preserves the orchestrated route lead fence and decision evidence", () => {
    expect(toRpcRouteTeamMessageRequest({
      messageId: "team_message_orchestrated",
      expectedRevision: 1,
      expectedLeadParticipantId: "team_agent_lead",
      mode: "orchestrated",
      outcome: "deliver",
      actorPrincipalId: "team_user",
      reason: "Orchestrated lead route",
      idempotencyKey: "team-route-orchestrated",
      deliveries: [{
        targetParticipantId: "team_agent_lead",
        role: "speaker",
        trigger: "lead"
      }]
    })).toMatchObject({
      expected_lead_participant_id: "team_agent_lead",
      deliveries: [{
        target_participant_id: "team_agent_lead",
        role: "speaker",
        trigger: "lead"
      }]
    })
    expect(fromRpcTeamRoutingDecisionRecord({
      id: "team_route_orchestrated",
      conversation_id: "team_orchestrated",
      message_id: "team_message_orchestrated",
      mode: "orchestrated",
      outcome: "deliver",
      lead_participant_id: "team_agent_lead",
      actor_principal_id: "team_user",
      reason: "Orchestrated lead route",
      metadata: null,
      idempotency_key: "team-route-orchestrated",
      created_at: 1
    })).toMatchObject({ leadParticipantId: "team_agent_lead" })
  })

  it("decodes explicit pass provenance", () => {
    const delivery = fromRpcTeamDeliveryRecord({
      id: "team_delivery_passed",
      conversation_id: "team_passed",
      message_id: "team_message_passed",
      routing_decision_id: "team_route_passed",
      discussion_round_id: "team_round_passed",
      target_participant_id: "team_agent_passed",
      role: "speaker",
      trigger: "direct",
      state: "passed",
      target_session_id: "ses_team_passed",
      dispatch_job_id: "job_team_delivery_passed",
      child_input_id: "inp_team_passed",
      child_turn_id: "turn_team_passed",
      child_turn_job_id: "job_team_turn_passed",
      outcome_job_id: "job_team_outcome_passed",
      reply_message_id: null,
      participation_tool_execution_id: "tool_execution_team_passed",
      budget_grant_id: null,
      last_error: null,
      idempotency_key: "team-delivery:passed",
      created_at: 1,
      updated_at: 2,
      materialized_at: 1,
      finished_at: 2
    })
    expect(delivery).toMatchObject({
      state: "passed",
      outcomeJobId: "job_team_outcome_passed",
      participationToolExecutionId: "tool_execution_team_passed"
    })
    expect(delivery).not.toHaveProperty("replyMessageId")
  })

  it("rejects unknown delivery states", () => {
    expect(() => fromRpcTeamDeliveryRecord({
      id: "team_delivery_unknown",
      conversation_id: "team_unknown",
      message_id: "team_message_unknown",
      routing_decision_id: "team_route_unknown",
      discussion_round_id: "team_round_unknown",
      target_participant_id: "team_agent_unknown",
      role: "speaker",
      trigger: "direct",
      state: "silently_skipped",
      target_session_id: "ses_team_unknown",
      dispatch_job_id: "job_team_delivery_unknown",
      child_input_id: null,
      child_turn_id: null,
      child_turn_job_id: null,
      outcome_job_id: null,
      reply_message_id: null,
      participation_tool_execution_id: null,
      budget_grant_id: null,
      last_error: null,
      idempotency_key: "team-delivery:unknown",
      created_at: 1,
      updated_at: 1,
      materialized_at: null,
      finished_at: null
    })).toThrow(/invalid team delivery state/)
  })

  it("decodes a closed discussion round with typed terminal counts", () => {
    expect(fromRpcTeamDiscussionRoundRecord({
      id: "team_round_closed",
      conversation_id: "team_conversation_closed",
      source_message_id: "team_message_closed",
      routing_decision_id: "team_route_closed",
      mode: "hybrid",
      state: "closed",
      expected_delivery_count: 3,
      outcome: "partial",
      result: {
        expected: 3,
        responded: 1,
        passed: 1,
        failed: 0,
        cancelled: 1
      },
      idempotency_key: "team-round:closed",
      created_at: 1,
      updated_at: 2,
      closed_at: 2
    })).toMatchObject({
      state: "closed",
      outcome: "partial",
      result: { responded: 1, passed: 1, cancelled: 1 }
    })
  })

  it("rejects inconsistent discussion round terminal evidence", () => {
    expect(() => fromRpcTeamDiscussionRoundRecord({
      id: "team_round_invalid",
      conversation_id: "team_conversation_invalid",
      source_message_id: "team_message_invalid",
      routing_decision_id: "team_route_invalid",
      mode: "peer",
      state: "closed",
      expected_delivery_count: 2,
      outcome: "completed",
      result: {
        expected: 2,
        responded: 1,
        passed: 0,
        failed: 0,
        cancelled: 0
      },
      idempotency_key: "team-round:invalid",
      created_at: 1,
      updated_at: 2,
      closed_at: 2
    })).toThrow(/counts do not sum/)
  })

  it("decodes a bounded conversation page cursor", () => {
    expect(fromRpcTeamConversationPage({
      conversation: {
        id: "team_page",
        principal_id: "team_owner",
        title: null,
        mode: "peer",
        state: "open",
        metadata: null,
        created_at: 1,
        updated_at: 1,
        closed_at: null
      },
      participants: [],
      messages: [],
      routing_decisions: [],
      rounds: [],
      deliveries: [],
      observed_at: 3,
      next_cursor: { created_at: 2, message_id: "team_message_2" }
    })).toMatchObject({
      conversation: { id: "team_page" },
      observedAt: 3,
      nextCursor: { createdAt: 2, messageId: "team_message_2" }
    })
  })
})
