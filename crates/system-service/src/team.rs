use crate::event_store::append_event_tx;
use crate::rows::{
    row_to_team_conversation, row_to_team_delivery, row_to_team_discussion_round,
    row_to_team_message, row_to_team_participant, row_to_team_routing_decision,
};
use crate::{
    AdmissionReceipt, AdmitTeamMessage, CompleteJob, EnqueueJob, EventScope, FailJob,
    FailTeamDeliveryMaterialization, FailTeamDeliveryMaterializationReceipt, ListTeamConversations,
    ListTeamDeliveries, ListTeamDiscussionRounds, ListTeamMessages, ListTeamParticipants,
    ListTeamRoutingDecisions, MaterializeTeamDelivery, MaterializeTeamDeliveryReceipt,
    ProjectTeamDeliveryOutcome, ProjectTeamDeliveryOutcomeReceipt, PutTeamConversation,
    PutTeamParticipant, ReadTeamConversationPage, Result, RetryPolicy, RetryStrategy,
    RouteTeamDelivery, RouteTeamMessage, RouteTeamMessageReceipt, SchedulerJobKind,
    SchedulerJobRecord, SessionMessageRecord, SessionTurnRecord, SetTeamConversationLead,
    SubmitSessionTurn, SystemService, SystemServiceError, TeamConversationPage,
    TeamConversationPageCursor, TeamConversationRecord, TeamDeliveryChildTurnPlan,
    TeamDeliveryMaterializationContext, TeamDeliveryRecord, TeamDiscussionRoundRecord,
    TeamDiscussionRoundResult, TeamMessageRecord, TeamParticipantRecord, TeamRoutingDecisionRecord,
    TeamTarget, ToolExecutionRecord, ToolResultContentPart, UpdateTeamConversationState,
    UpdateTeamParticipantState,
};
use rusqlite::{params, params_from_iter, OptionalExtension, ToSql};
use std::collections::HashSet;
use uuid::Uuid;

mod conversation;
mod delegation;
mod materialization;
mod message;
mod outcome;
mod outcome_projection;
mod page;
mod participant;
mod repository;
mod round;
mod routing;
mod validation;

pub(crate) use delegation::{
    find_waiting_team_delegation_operation_tx, request_team_delegation_cancel_tx,
    settle_team_delegation_child_tx,
};
pub(crate) use materialization::{sync_team_delivery_cancelled_tx, sync_team_delivery_failure_tx};
pub(crate) use message::admit_team_message_tx;
pub(crate) use outcome::{
    enqueue_team_delivery_outcome_tx, sync_team_delivery_outcome_cancelled_tx,
    sync_team_delivery_outcome_failure_tx,
};
use repository::*;
use round::reconcile_team_discussion_round_tx;
use validation::*;

const MAX_TEAM_TARGETS: usize = 64;
const MAX_TEAM_DELIVERIES: usize = 64;
const MAX_ROUTING_REASON_BYTES: usize = 1024;
const MAX_TEAM_MESSAGE_PARTS: usize = 64;
const MAX_TEAM_MESSAGE_CONTENT_BYTES: usize = 256 * 1024;

const CONVERSATION_SELECT: &str = "SELECT
    id, principal_id, title, mode, state, lead_participant_id, metadata_json,
    created_at, updated_at, closed_at
 FROM team_conversation";

const PARTICIPANT_SELECT: &str = "SELECT
    id, conversation_id, principal_id, kind, display_name, role,
    agent_session_id, state, metadata_json, created_at, updated_at
 FROM team_participant";

const MESSAGE_SELECT: &str = "SELECT
    id, conversation_id, author_participant_id, parent_message_id,
    discussion_round_id, kind, state, targets_json, content_json,
    metadata_json, idempotency_key, revision, created_at, updated_at, visible_at
 FROM team_message";

const ROUTING_DECISION_SELECT: &str = "SELECT
    id, conversation_id, message_id, mode, outcome, lead_participant_id,
    actor_principal_id, reason, metadata_json, idempotency_key, created_at
 FROM team_routing_decision";

const DISCUSSION_ROUND_SELECT: &str = "SELECT
    id, conversation_id, source_message_id, routing_decision_id,
    mode, state, expected_delivery_count, outcome, result_json,
    idempotency_key, created_at, updated_at, closed_at
 FROM team_discussion_round";

const DELIVERY_SELECT: &str = "SELECT
    id, conversation_id, message_id, routing_decision_id,
    discussion_round_id, target_participant_id, role, trigger, state,
    target_session_id, dispatch_job_id,
    child_input_id, child_turn_id, child_turn_job_id,
    outcome_job_id, reply_message_id, participation_tool_execution_id,
    budget_grant_id, last_error_json, idempotency_key,
    created_at, updated_at, materialized_at, finished_at
 FROM team_delivery";
