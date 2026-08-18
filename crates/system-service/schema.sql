PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_metadata (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS event_log (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  scope_session_id TEXT,
  scope_turn_id TEXT,
  scope_attempt_id TEXT,
  scope_input_id TEXT,
  scope_message_id TEXT,
  scope_resource_id TEXT,
  scope_plan_proposal_id TEXT,
  scope_objective_id TEXT,
  payload_json TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_event_log_occurred_at
  ON event_log(occurred_at, id);

CREATE INDEX IF NOT EXISTS idx_event_log_session
  ON event_log(scope_session_id, occurred_at, id);

CREATE INDEX IF NOT EXISTS idx_event_log_plan_proposal
  ON event_log(scope_plan_proposal_id, occurred_at, id);

CREATE INDEX IF NOT EXISTS idx_event_log_objective
  ON event_log(scope_objective_id, occurred_at, id);

CREATE TABLE IF NOT EXISTS config_entry (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS resource (
  id TEXT PRIMARY KEY,
  logical_path TEXT NOT NULL UNIQUE,
  absolute_path TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'file',
  origin TEXT NOT NULL DEFAULT 'system',
  media_type TEXT,
  label TEXT,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  state TEXT NOT NULL,
  source_provider TEXT,
  provider_file_id TEXT,
  provider_operation_id TEXT,
  source_url TEXT,
  source_expires_at INTEGER,
  metadata_json TEXT,
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_resource_kind_state
  ON resource(kind, state, updated_at);

CREATE INDEX IF NOT EXISTS idx_resource_origin_state
  ON resource(origin, state, updated_at);

CREATE TABLE IF NOT EXISTS resource_provenance (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL REFERENCES resource(id),
  resource_sha256 TEXT NOT NULL,
  resource_size_bytes INTEGER NOT NULL,
  resource_kind TEXT NOT NULL,
  resource_media_type TEXT,
  cause_kind TEXT NOT NULL,
  cause_id TEXT NOT NULL,
  cause_json TEXT NOT NULL,
  input_resources_json TEXT NOT NULL,
  digest TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_resource_provenance_resource
  ON resource_provenance(resource_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_resource_provenance_cause
  ON resource_provenance(cause_kind, cause_id, created_at, id);

CREATE TABLE IF NOT EXISTS resource_ticket (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  resource_id TEXT NOT NULL REFERENCES resource(id),
  capability TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_resource_ticket_resource
  ON resource_ticket(resource_id, expires_at);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  title TEXT,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  revision INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  archived_at INTEGER
);

CREATE TABLE IF NOT EXISTS session_input (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES session(id),
  principal_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  input_type TEXT NOT NULL,
  content_json TEXT NOT NULL,
  origin_json TEXT,
  intent TEXT NOT NULL DEFAULT 'normal',
  run_control_policy TEXT,
  expected_turn_id TEXT,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(session_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_session_input_status
  ON session_input(session_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_session_input_intent
  ON session_input(session_id, intent, status, created_at);

CREATE TABLE IF NOT EXISTS session_turn (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES session(id),
  primary_input_id TEXT NOT NULL UNIQUE REFERENCES session_input(id),
  job_id TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL,
  execution_binding_json TEXT NOT NULL,
  execution_binding_digest TEXT NOT NULL,
  max_steps INTEGER NOT NULL,
  current_attempt_id TEXT,
  regenerates_turn_id TEXT REFERENCES session_turn(id),
  cancel_requested_at INTEGER,
  cancel_reason TEXT,
  result_json TEXT,
  error_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  finished_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_session_turn_session_state
  ON session_turn(session_id, state, created_at, id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_session_turn_active_head
  ON session_turn(session_id)
  WHERE state IN ('running', 'waiting', 'cancel_requested');

CREATE TABLE IF NOT EXISTS session_attempt (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES session(id),
  turn_id TEXT NOT NULL REFERENCES session_turn(id),
  input_id TEXT NOT NULL REFERENCES session_input(id),
  job_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  worker_id TEXT NOT NULL,
  lease_token TEXT NOT NULL,
  state TEXT NOT NULL,
  error_json TEXT,
  started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  finished_at INTEGER,
  UNIQUE(turn_id, attempt_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_session_attempt_running
  ON session_attempt(turn_id)
  WHERE state = 'running';

CREATE INDEX IF NOT EXISTS idx_session_attempt_turn
  ON session_attempt(turn_id, attempt_number, id);

CREATE TABLE IF NOT EXISTS session_turn_control (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES session(id),
  turn_id TEXT NOT NULL REFERENCES session_turn(id),
  attempt_id TEXT NOT NULL REFERENCES session_attempt(id),
  input_id TEXT REFERENCES session_input(id),
  principal_id TEXT,
  idempotency_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  content_json TEXT,
  reason TEXT,
  origin_json TEXT,
  metadata_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  applied_at INTEGER,
  UNIQUE(session_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_session_turn_control_pending
  ON session_turn_control(session_id, turn_id, attempt_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_session_turn_control_kind
  ON session_turn_control(session_id, kind, status, created_at);

CREATE TABLE IF NOT EXISTS session_message (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES session(id),
  sequence INTEGER NOT NULL,
  turn_id TEXT NOT NULL REFERENCES session_turn(id),
  attempt_id TEXT REFERENCES session_attempt(id),
  input_id TEXT,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  content_json TEXT NOT NULL,
  provider_state_json TEXT,
  execution_binding_digest TEXT NOT NULL,
  idempotency_key TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_message_session_created
  ON session_message(session_id, sequence);

CREATE UNIQUE INDEX IF NOT EXISTS idx_session_message_session_sequence
  ON session_message(session_id, sequence);

CREATE UNIQUE INDEX IF NOT EXISTS idx_session_message_idempotency
  ON session_message(session_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS provider_invocation (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES session(id),
  turn_id TEXT NOT NULL REFERENCES session_turn(id),
  attempt_id TEXT NOT NULL REFERENCES session_attempt(id),
  input_id TEXT NOT NULL REFERENCES session_input(id),
  job_id TEXT NOT NULL,
  step INTEGER NOT NULL,
  invocation_number INTEGER NOT NULL,
  execution_binding_digest TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  state TEXT NOT NULL,
  output_observed INTEGER NOT NULL,
  provider_request_id TEXT,
  assistant_message_id TEXT REFERENCES session_message(id),
  error_json TEXT,
  started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  finished_at INTEGER,
  UNIQUE(turn_id, step, invocation_number)
);

CREATE INDEX IF NOT EXISTS idx_provider_invocation_turn
  ON provider_invocation(turn_id, step, invocation_number, id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_invocation_active_attempt
  ON provider_invocation(attempt_id)
  WHERE state IN ('dispatched', 'output_observed');

CREATE TABLE IF NOT EXISTS tool_execution (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES session(id),
  turn_id TEXT NOT NULL REFERENCES session_turn(id),
  input_id TEXT NOT NULL,
  source_message_id TEXT NOT NULL REFERENCES session_message(id),
  principal_id TEXT NOT NULL,
  tool_call_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  input_json TEXT NOT NULL,
  descriptor_json TEXT NOT NULL,
  permission_json TEXT NOT NULL,
  state TEXT NOT NULL,
  current_invocation_attempt_id TEXT,
  attempt_count INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  approval_revision INTEGER NOT NULL,
  recovery_revision INTEGER NOT NULL,
  recovery_json TEXT,
  content_json TEXT,
  content_digest TEXT,
  is_error INTEGER,
  error_json TEXT,
  created_at INTEGER NOT NULL,
  finished_at INTEGER,
  updated_at INTEGER NOT NULL,
  activity_json TEXT,
  UNIQUE(source_message_id, tool_call_id)
);

CREATE INDEX IF NOT EXISTS idx_tool_execution_session_state
  ON tool_execution(session_id, state, updated_at, id);

CREATE INDEX IF NOT EXISTS idx_tool_execution_turn
  ON tool_execution(turn_id, updated_at, id);

CREATE TABLE IF NOT EXISTS tool_execution_attempt (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL REFERENCES tool_execution(id),
  session_attempt_id TEXT NOT NULL REFERENCES session_attempt(id),
  job_id TEXT NOT NULL,
  worker_id TEXT NOT NULL,
  lease_token TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  state TEXT NOT NULL,
  error_json TEXT,
  started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  finished_at INTEGER,
  UNIQUE(execution_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_tool_execution_attempt_execution
  ON tool_execution_attempt(execution_id, attempt_number, id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tool_execution_attempt_running
  ON tool_execution_attempt(execution_id)
  WHERE state = 'running';

CREATE TABLE IF NOT EXISTS tool_execution_recovery_decision (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL REFERENCES tool_execution(id),
  recovery_revision INTEGER NOT NULL,
  decision TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  content_json TEXT,
  content_digest TEXT,
  error_json TEXT,
  action TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(execution_id, recovery_revision)
);

CREATE INDEX IF NOT EXISTS idx_tool_recovery_decision_execution
  ON tool_execution_recovery_decision(execution_id, recovery_revision, id);

CREATE TABLE IF NOT EXISTS tool_execution_approval_decision (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL REFERENCES tool_execution(id),
  approval_revision INTEGER NOT NULL,
  decision TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  action TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(execution_id, approval_revision)
);

CREATE INDEX IF NOT EXISTS idx_tool_approval_decision_execution
  ON tool_execution_approval_decision(execution_id, approval_revision, id);

CREATE TABLE IF NOT EXISTS context_epoch (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES session(id),
  job_id TEXT NOT NULL UNIQUE REFERENCES scheduler_job(id),
  state TEXT NOT NULL,
  generation_state TEXT NOT NULL,
  generation_attempt INTEGER NOT NULL DEFAULT 0,
  max_provider_attempts INTEGER NOT NULL,
  previous_epoch_id TEXT,
  previous_summary_digest TEXT,
  source_head_sequence INTEGER NOT NULL,
  source_head_message_id TEXT NOT NULL,
  cut_sequence INTEGER NOT NULL,
  cut_message_id TEXT NOT NULL,
  retained_from_sequence INTEGER NOT NULL,
  retained_from_message_id TEXT NOT NULL,
  source_digest TEXT NOT NULL,
  policy_json TEXT NOT NULL,
  policy_digest TEXT NOT NULL,
  model_endpoint_json TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  summary TEXT,
  summary_digest TEXT,
  usage_json TEXT,
  error_json TEXT,
  token_estimate_before INTEGER NOT NULL DEFAULT 0,
  token_estimate_after INTEGER NOT NULL DEFAULT 0,
  token_savings INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  activated_at INTEGER,
  finished_at INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_context_epoch_session_state
  ON context_epoch(session_id, state, updated_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_context_epoch_active_unique
  ON context_epoch(session_id)
  WHERE state = 'active';

CREATE TABLE IF NOT EXISTS workspace_changeset (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  title TEXT,
  base_revision TEXT,
  changeset_json TEXT NOT NULL,
  current_state TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspace_changeset_workspace_state
  ON workspace_changeset(workspace_id, current_state, updated_at);

CREATE TABLE IF NOT EXISTS workspace_change_operation (
  id TEXT PRIMARY KEY,
  changeset_id TEXT NOT NULL REFERENCES workspace_changeset(id),
  operation TEXT NOT NULL,
  status TEXT NOT NULL,
  receipt_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspace_change_operation_changeset
  ON workspace_change_operation(changeset_id, created_at, id);

CREATE TABLE IF NOT EXISTS workspace_change_proposal (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  changeset_id TEXT NOT NULL REFERENCES workspace_changeset(id),
  principal_id TEXT NOT NULL,
  title TEXT,
  summary TEXT,
  state TEXT NOT NULL,
  metadata_json TEXT,
  idempotency_key TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  closed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_workspace_change_proposal_workspace_state
  ON workspace_change_proposal(workspace_id, state, updated_at);

CREATE INDEX IF NOT EXISTS idx_workspace_change_proposal_changeset
  ON workspace_change_proposal(changeset_id, updated_at);

CREATE TABLE IF NOT EXISTS workspace_change_proposal_operation (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES workspace_change_proposal(id),
  operation TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  reason TEXT,
  metadata_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspace_change_proposal_operation_proposal
  ON workspace_change_proposal_operation(proposal_id, created_at, id);

CREATE TABLE IF NOT EXISTS plan_proposal (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  source_session_id TEXT NOT NULL REFERENCES session(id),
  source_head_sequence INTEGER NOT NULL,
  source_head_message_id TEXT REFERENCES session_message(id),
  source_head_turn_id TEXT REFERENCES session_turn(id),
  analysis_input_digest TEXT NOT NULL,
  planning_request_json TEXT NOT NULL,
  generation_endpoint_id TEXT NOT NULL,
  generation_endpoint_digest TEXT NOT NULL,
  generation_protocol_id TEXT NOT NULL,
  generation_provider_id TEXT NOT NULL,
  generation_model_id TEXT NOT NULL,
  generated_at INTEGER NOT NULL,
  generation_output_digest TEXT NOT NULL,
  generation_output_json TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  steps_json TEXT NOT NULL,
  references_json TEXT NOT NULL,
  state TEXT NOT NULL,
  idempotency_key TEXT UNIQUE,
  execution_input_id TEXT REFERENCES session_input(id),
  execution_turn_id TEXT REFERENCES session_turn(id),
  execution_job_id TEXT REFERENCES scheduler_job(id),
  execution_binding_digest TEXT,
  execution_digest TEXT,
  execution_idempotency_key TEXT UNIQUE,
  execution_bound_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  decided_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_plan_proposal_principal_state
  ON plan_proposal(principal_id, state, updated_at);

CREATE INDEX IF NOT EXISTS idx_plan_proposal_source_session
  ON plan_proposal(source_session_id, updated_at);

CREATE TABLE IF NOT EXISTS plan_proposal_reference (
  proposal_id TEXT NOT NULL REFERENCES plan_proposal(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  role TEXT NOT NULL,
  metadata_json TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(proposal_id, kind, reference_id, role)
);

CREATE INDEX IF NOT EXISTS idx_plan_proposal_reference_lookup
  ON plan_proposal_reference(kind, reference_id, proposal_id);

CREATE TABLE IF NOT EXISTS plan_proposal_operation (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES plan_proposal(id),
  operation TEXT NOT NULL,
  actor_kind TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  from_revision INTEGER NOT NULL,
  to_revision INTEGER NOT NULL,
  content_json TEXT,
  reason TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_plan_proposal_operation_proposal
  ON plan_proposal_operation(proposal_id, created_at, id);

CREATE TABLE IF NOT EXISTS objective (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES session(id),
  principal_id TEXT NOT NULL,
  objective TEXT NOT NULL,
  boundaries_json TEXT NOT NULL,
  constraints_json TEXT NOT NULL,
  success_criteria_json TEXT NOT NULL,
  verification_policy_json TEXT NOT NULL,
  stop_policy_json TEXT NOT NULL,
  revision INTEGER NOT NULL,
  state TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  reason_detail TEXT,
  active_attempt_id TEXT,
  create_request_digest TEXT NOT NULL,
  create_idempotency_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  closed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_objective_principal_state
  ON objective(principal_id, state, updated_at);

CREATE INDEX IF NOT EXISTS idx_objective_session_state
  ON objective(session_id, state, updated_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_objective_one_live_per_session
  ON objective(session_id)
  WHERE state IN ('active', 'paused', 'blocked', 'cancel_requested');

CREATE TABLE IF NOT EXISTS objective_state_command (
  idempotency_key TEXT PRIMARY KEY,
  objective_id TEXT NOT NULL REFERENCES objective(id),
  command TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  from_revision INTEGER NOT NULL,
  to_revision INTEGER NOT NULL,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_objective_state_command_objective
  ON objective_state_command(objective_id, to_revision, created_at);

CREATE TABLE IF NOT EXISTS objective_attempt (
  id TEXT PRIMARY KEY,
  objective_id TEXT NOT NULL REFERENCES objective(id),
  attempt_number INTEGER NOT NULL,
  input_id TEXT NOT NULL UNIQUE REFERENCES session_input(id),
  turn_id TEXT NOT NULL UNIQUE REFERENCES session_turn(id),
  job_id TEXT NOT NULL UNIQUE,
  execution_binding_digest TEXT NOT NULL,
  trigger TEXT NOT NULL,
  budget_grant_id TEXT,
  request_digest TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  bound_at INTEGER NOT NULL,
  UNIQUE(objective_id, attempt_number),
  UNIQUE(id, objective_id)
);

CREATE INDEX IF NOT EXISTS idx_objective_attempt_objective
  ON objective_attempt(objective_id, attempt_number, id);

CREATE TABLE IF NOT EXISTS objective_attempt_review (
  id TEXT PRIMARY KEY,
  objective_id TEXT NOT NULL REFERENCES objective(id),
  attempt_id TEXT NOT NULL UNIQUE REFERENCES objective_attempt(id),
  disposition TEXT NOT NULL,
  reason TEXT,
  request_digest TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_objective_attempt_review_objective
  ON objective_attempt_review(objective_id, created_at, id);

CREATE TABLE IF NOT EXISTS objective_verification (
  id TEXT PRIMARY KEY,
  objective_id TEXT NOT NULL REFERENCES objective(id),
  attempt_id TEXT NOT NULL REFERENCES objective_attempt(id),
  review_id TEXT NOT NULL REFERENCES objective_attempt_review(id),
  requirement_id TEXT NOT NULL,
  verifier_kind TEXT NOT NULL,
  verifier_ref TEXT NOT NULL,
  result TEXT NOT NULL,
  reason TEXT,
  evidence_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(review_id, requirement_id)
);

CREATE INDEX IF NOT EXISTS idx_objective_verification_objective
  ON objective_verification(objective_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_objective_verification_attempt
  ON objective_verification(attempt_id, created_at, id);

CREATE TABLE IF NOT EXISTS delegation_graph (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  title TEXT,
  state TEXT NOT NULL,
  metadata_json TEXT,
  idempotency_key TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  closed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_delegation_graph_principal_state
  ON delegation_graph(principal_id, state, updated_at);

CREATE TABLE IF NOT EXISTS delegation_graph_node (
  id TEXT PRIMARY KEY,
  graph_id TEXT NOT NULL REFERENCES delegation_graph(id),
  kind TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  state TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  scheduler_job_id TEXT,
  metadata_json TEXT,
  idempotency_key TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_delegation_graph_node_graph_state
  ON delegation_graph_node(graph_id, state, updated_at);

CREATE INDEX IF NOT EXISTS idx_delegation_graph_node_scheduler_job
  ON delegation_graph_node(scheduler_job_id);

CREATE TABLE IF NOT EXISTS delegation_graph_dependency (
  id TEXT PRIMARY KEY,
  graph_id TEXT NOT NULL REFERENCES delegation_graph(id),
  from_node_id TEXT NOT NULL REFERENCES delegation_graph_node(id),
  to_node_id TEXT NOT NULL REFERENCES delegation_graph_node(id),
  kind TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(graph_id, from_node_id, to_node_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_delegation_graph_dependency_to_node
  ON delegation_graph_dependency(graph_id, to_node_id);

CREATE INDEX IF NOT EXISTS idx_delegation_graph_dependency_from_node
  ON delegation_graph_dependency(graph_id, from_node_id);

CREATE TABLE IF NOT EXISTS team_conversation (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  title TEXT,
  mode TEXT NOT NULL,
  state TEXT NOT NULL,
  lead_participant_id TEXT REFERENCES team_participant(id),
  metadata_json TEXT,
  idempotency_key TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  closed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_team_conversation_principal_state
  ON team_conversation(principal_id, state, updated_at);

CREATE TABLE IF NOT EXISTS team_participant (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES team_conversation(id),
  principal_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  display_name TEXT,
  role TEXT,
  agent_session_id TEXT UNIQUE REFERENCES session(id),
  state TEXT NOT NULL,
  metadata_json TEXT,
  idempotency_key TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_team_participant_conversation_state
  ON team_participant(conversation_id, state, updated_at);

CREATE TABLE IF NOT EXISTS team_message (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES team_conversation(id),
  author_participant_id TEXT NOT NULL REFERENCES team_participant(id),
  parent_message_id TEXT REFERENCES team_message(id),
  discussion_round_id TEXT REFERENCES team_discussion_round(id),
  kind TEXT NOT NULL,
  state TEXT NOT NULL,
  targets_json TEXT NOT NULL,
  content_json TEXT NOT NULL,
  metadata_json TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  revision INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  visible_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_team_message_conversation_created
  ON team_message(conversation_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_team_message_conversation_state
  ON team_message(conversation_id, state, updated_at);

CREATE TABLE IF NOT EXISTS team_routing_decision (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES team_conversation(id),
  message_id TEXT NOT NULL UNIQUE REFERENCES team_message(id),
  mode TEXT NOT NULL,
  outcome TEXT NOT NULL,
  lead_participant_id TEXT REFERENCES team_participant(id),
  actor_principal_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  metadata_json TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_team_routing_decision_conversation_created
  ON team_routing_decision(conversation_id, created_at, id);

CREATE TABLE IF NOT EXISTS team_discussion_round (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES team_conversation(id),
  source_message_id TEXT NOT NULL UNIQUE REFERENCES team_message(id),
  routing_decision_id TEXT NOT NULL UNIQUE REFERENCES team_routing_decision(id),
  mode TEXT NOT NULL,
  state TEXT NOT NULL,
  expected_delivery_count INTEGER NOT NULL,
  outcome TEXT,
  result_json TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  closed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_team_discussion_round_conversation_state
  ON team_discussion_round(conversation_id, state, created_at, id);

CREATE TABLE IF NOT EXISTS team_delivery (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES team_conversation(id),
  message_id TEXT NOT NULL REFERENCES team_message(id),
  routing_decision_id TEXT NOT NULL REFERENCES team_routing_decision(id),
  discussion_round_id TEXT NOT NULL REFERENCES team_discussion_round(id),
  target_participant_id TEXT NOT NULL REFERENCES team_participant(id),
  role TEXT NOT NULL,
  trigger TEXT NOT NULL,
  state TEXT NOT NULL,
  target_session_id TEXT NOT NULL REFERENCES session(id),
  dispatch_job_id TEXT NOT NULL UNIQUE REFERENCES scheduler_job(id),
  child_input_id TEXT UNIQUE REFERENCES session_input(id),
  child_turn_id TEXT UNIQUE REFERENCES session_turn(id),
  child_turn_job_id TEXT UNIQUE REFERENCES scheduler_job(id),
  outcome_job_id TEXT UNIQUE REFERENCES scheduler_job(id),
  reply_message_id TEXT UNIQUE REFERENCES team_message(id),
  participation_tool_execution_id TEXT UNIQUE REFERENCES tool_execution(id),
  budget_grant_id TEXT,
  last_error_json TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  materialized_at INTEGER,
  finished_at INTEGER,
  UNIQUE(discussion_round_id, target_participant_id)
);

CREATE INDEX IF NOT EXISTS idx_team_delivery_conversation_state
  ON team_delivery(conversation_id, state, updated_at);

CREATE INDEX IF NOT EXISTS idx_team_delivery_message
  ON team_delivery(message_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_team_delivery_dispatch_job
  ON team_delivery(dispatch_job_id);

CREATE INDEX IF NOT EXISTS idx_team_delivery_outcome_job
  ON team_delivery(outcome_job_id);

CREATE TABLE IF NOT EXISTS team_delegation_operation (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES team_conversation(id),
  source_delivery_id TEXT NOT NULL REFERENCES team_delivery(id),
  source_routing_decision_id TEXT NOT NULL REFERENCES team_routing_decision(id),
  source_discussion_round_id TEXT NOT NULL REFERENCES team_discussion_round(id),
  lead_participant_id TEXT NOT NULL REFERENCES team_participant(id),
  parent_session_id TEXT NOT NULL REFERENCES session(id),
  parent_input_id TEXT NOT NULL REFERENCES session_input(id),
  parent_turn_id TEXT NOT NULL REFERENCES session_turn(id),
  parent_session_attempt_id TEXT NOT NULL REFERENCES session_attempt(id),
  parent_session_job_id TEXT NOT NULL REFERENCES scheduler_job(id),
  parent_tool_execution_id TEXT NOT NULL UNIQUE REFERENCES tool_execution(id),
  parent_tool_invocation_attempt_id TEXT NOT NULL REFERENCES tool_execution_attempt(id),
  parent_tool_call_id TEXT NOT NULL,
  delegation_graph_id TEXT NOT NULL UNIQUE REFERENCES delegation_graph(id),
  state TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  finished_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_team_delegation_operation_conversation_state
  ON team_delegation_operation(conversation_id, state, updated_at);

CREATE INDEX IF NOT EXISTS idx_team_delegation_operation_source_delivery
  ON team_delegation_operation(source_delivery_id, created_at, id);

CREATE TABLE IF NOT EXISTS team_delegation_task (
  id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL REFERENCES team_delegation_operation(id),
  graph_node_id TEXT NOT NULL UNIQUE REFERENCES delegation_graph_node(id),
  target_participant_id TEXT NOT NULL REFERENCES team_participant(id),
  target_session_id TEXT NOT NULL REFERENCES session(id),
  prompt TEXT NOT NULL,
  child_input_id TEXT NOT NULL UNIQUE,
  child_turn_id TEXT NOT NULL UNIQUE,
  child_job_id TEXT NOT NULL UNIQUE,
  input_idempotency_key TEXT NOT NULL UNIQUE,
  job_idempotency_key TEXT NOT NULL UNIQUE,
  execution_binding_json TEXT NOT NULL,
  execution_binding_digest TEXT NOT NULL,
  max_steps INTEGER,
  priority INTEGER,
  materialized_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(operation_id, target_participant_id)
);

CREATE INDEX IF NOT EXISTS idx_team_delegation_task_operation
  ON team_delegation_task(operation_id, created_at, id);

CREATE TABLE IF NOT EXISTS plugin_manifest (
  id TEXT PRIMARY KEY,
  plugin_id TEXT NOT NULL,
  version TEXT NOT NULL,
  name TEXT,
  entry_json TEXT,
  capabilities_json TEXT NOT NULL,
  state TEXT NOT NULL,
  metadata_json TEXT,
  idempotency_key TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  disabled_at INTEGER,
  UNIQUE(plugin_id, version)
);

CREATE INDEX IF NOT EXISTS idx_plugin_manifest_state
  ON plugin_manifest(state, updated_at);

CREATE TABLE IF NOT EXISTS plugin_install (
  id TEXT PRIMARY KEY,
  plugin_id TEXT NOT NULL,
  plugin_version TEXT NOT NULL,
  state TEXT NOT NULL,
  layout_json TEXT NOT NULL,
  trust_json TEXT NOT NULL,
  install_root_dir TEXT NOT NULL,
  metadata_json TEXT,
  idempotency_key TEXT UNIQUE,
  installed_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  disabled_at INTEGER,
  removed_at INTEGER,
  UNIQUE(plugin_id, plugin_version),
  FOREIGN KEY(plugin_id, plugin_version) REFERENCES plugin_manifest(plugin_id, version)
);

CREATE INDEX IF NOT EXISTS idx_plugin_install_state
  ON plugin_install(state, updated_at);

CREATE TABLE IF NOT EXISTS connector_registration (
  id TEXT PRIMARY KEY,
  connector_id TEXT NOT NULL UNIQUE,
  plugin_id TEXT NOT NULL,
  plugin_version TEXT NOT NULL,
  state TEXT NOT NULL,
  metadata_json TEXT,
  idempotency_key TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  disabled_at INTEGER,
  FOREIGN KEY(plugin_id, plugin_version) REFERENCES plugin_manifest(plugin_id, version)
);

CREATE INDEX IF NOT EXISTS idx_connector_registration_plugin_state
  ON connector_registration(plugin_id, plugin_version, state, updated_at);

CREATE TABLE IF NOT EXISTS connector_credential (
  id TEXT PRIMARY KEY,
  connector_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  secret_ref TEXT NOT NULL,
  state TEXT NOT NULL,
  metadata_json TEXT,
  idempotency_key TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  revoked_at INTEGER,
  UNIQUE(connector_id, kind, secret_ref),
  FOREIGN KEY(connector_id) REFERENCES connector_registration(connector_id)
);

CREATE INDEX IF NOT EXISTS idx_connector_credential_connector_state
  ON connector_credential(connector_id, state, updated_at);

CREATE TABLE IF NOT EXISTS connector_session (
  id TEXT PRIMARY KEY,
  connector_id TEXT NOT NULL,
  credential_id TEXT NOT NULL,
  state TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  lease_token TEXT NOT NULL,
  lease_expires_at INTEGER NOT NULL,
  metadata_json TEXT,
  last_error_json TEXT,
  idempotency_key TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  finished_at INTEGER,
  FOREIGN KEY(connector_id) REFERENCES connector_registration(connector_id),
  FOREIGN KEY(credential_id) REFERENCES connector_credential(id)
);

CREATE INDEX IF NOT EXISTS idx_connector_session_connector_state
  ON connector_session(connector_id, state, updated_at);

CREATE INDEX IF NOT EXISTS idx_connector_session_lease
  ON connector_session(state, lease_expires_at, owner_id);

CREATE TABLE IF NOT EXISTS channel_binding (
  id TEXT PRIMARY KEY,
  connector_id TEXT NOT NULL,
  channel_kind TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  external_identity_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  display_name TEXT,
  state TEXT NOT NULL,
  metadata_json TEXT,
  idempotency_key TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  revoked_at INTEGER,
  UNIQUE(connector_id, channel_id, external_identity_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_binding_principal_state
  ON channel_binding(principal_id, state, updated_at);

CREATE INDEX IF NOT EXISTS idx_channel_binding_external
  ON channel_binding(connector_id, channel_id, external_identity_id, state);

CREATE TABLE IF NOT EXISTS channel_inbound_event (
  id TEXT PRIMARY KEY,
  connector_id TEXT NOT NULL,
  channel_kind TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  external_event_id TEXT NOT NULL,
  external_thread_id TEXT,
  sender_external_identity_id TEXT NOT NULL,
  principal_id TEXT,
  payload_json TEXT NOT NULL,
  state TEXT NOT NULL,
  metadata_json TEXT,
  idempotency_key TEXT UNIQUE,
  received_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(connector_id, channel_id, external_event_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_inbound_event_channel_state
  ON channel_inbound_event(connector_id, channel_id, state, received_at);

CREATE TABLE IF NOT EXISTS channel_delivery (
  id TEXT PRIMARY KEY,
  connector_id TEXT NOT NULL,
  channel_kind TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  target_external_identity_id TEXT,
  external_thread_id TEXT,
  principal_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  state TEXT NOT NULL,
  metadata_json TEXT,
  scheduler_job_id TEXT,
  idempotency_key TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  finished_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_channel_delivery_channel_state
  ON channel_delivery(connector_id, channel_id, state, updated_at);

CREATE INDEX IF NOT EXISTS idx_channel_delivery_scheduler_job
  ON channel_delivery(scheduler_job_id);

CREATE TABLE IF NOT EXISTS channel_projection (
  id TEXT PRIMARY KEY,
  inbound_event_id TEXT NOT NULL REFERENCES channel_inbound_event(id),
  target_kind TEXT NOT NULL,
  target_id TEXT,
  target_job_id TEXT,
  state TEXT NOT NULL,
  target_json TEXT NOT NULL,
  metadata_json TEXT,
  idempotency_key TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(inbound_event_id, target_kind)
);

CREATE INDEX IF NOT EXISTS idx_channel_projection_inbound
  ON channel_projection(inbound_event_id, target_kind);

CREATE INDEX IF NOT EXISTS idx_channel_projection_target
  ON channel_projection(target_kind, target_id);

CREATE TABLE IF NOT EXISTS budget_scope (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  limit_json TEXT NOT NULL,
  usage_json TEXT NOT NULL,
  window_kind TEXT NOT NULL,
  state TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(kind, owner_id, window_kind)
);

CREATE TABLE IF NOT EXISTS budget_grant (
  id TEXT PRIMARY KEY,
  scope_id TEXT NOT NULL REFERENCES budget_scope(id),
  principal_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  requested_json TEXT NOT NULL,
  committed_json TEXT,
  state TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(scope_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_budget_grant_scope_state
  ON budget_grant(scope_id, state, updated_at);

CREATE TABLE IF NOT EXISTS budget_usage_entry (
  id TEXT PRIMARY KEY,
  grant_id TEXT NOT NULL REFERENCES budget_grant(id) ON DELETE CASCADE,
  usage_json TEXT NOT NULL,
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(grant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_budget_usage_entry_grant
  ON budget_usage_entry(grant_id, created_at, id);

CREATE TABLE IF NOT EXISTS scheduler_job (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  state TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  scheduled_at INTEGER NOT NULL,
  not_before INTEGER,
  priority INTEGER NOT NULL,
  concurrency_key TEXT,
  attempt INTEGER NOT NULL,
  max_attempts INTEGER NOT NULL,
  retry_policy_json TEXT NOT NULL,
  idempotency_key TEXT UNIQUE,
  budget_grant_id TEXT,
  lease_owner TEXT,
  lease_token TEXT,
  lease_expires_at INTEGER,
  result_json TEXT,
  last_error_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  finished_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_scheduler_job_ready
  ON scheduler_job(state, not_before, priority, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_scheduler_job_kind_state
  ON scheduler_job(kind, state, updated_at);

CREATE INDEX IF NOT EXISTS idx_scheduler_job_concurrency
  ON scheduler_job(concurrency_key, state, scheduled_at, id);

CREATE TABLE IF NOT EXISTS media_generation_operation (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE REFERENCES scheduler_job(id),
  principal_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  session_id TEXT REFERENCES session(id),
  turn_id TEXT REFERENCES session_turn(id),
  source_message_id TEXT REFERENCES session_message(id),
  tool_execution_id TEXT UNIQUE REFERENCES tool_execution(id),
  tool_call_id TEXT,
  state TEXT NOT NULL,
  binding_json TEXT NOT NULL,
  dispatch_attempt INTEGER NOT NULL,
  external_operation_id TEXT,
  provider_checkpoint_json TEXT,
  poll_count INTEGER NOT NULL,
  consecutive_poll_failures INTEGER NOT NULL,
  next_poll_at INTEGER,
  last_poll_error_json TEXT,
  output_references_json TEXT NOT NULL,
  output_resource_ids_json TEXT NOT NULL,
  progress_json TEXT,
  error_json TEXT,
  cancel_requested_at INTEGER,
  cancel_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  finished_at INTEGER,
  CHECK (
    (session_id IS NULL AND turn_id IS NULL AND source_message_id IS NULL
      AND tool_execution_id IS NULL AND tool_call_id IS NULL)
    OR
    (session_id IS NOT NULL AND turn_id IS NOT NULL AND source_message_id IS NOT NULL
      AND tool_execution_id IS NOT NULL AND tool_call_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_media_generation_principal_state
  ON media_generation_operation(principal_id, state, updated_at);

CREATE INDEX IF NOT EXISTS idx_media_generation_state_updated
  ON media_generation_operation(state, updated_at);

INSERT INTO schema_metadata (version, name, applied_at)
  VALUES (15, 'baseline', CAST(strftime('%s', 'now') AS INTEGER) * 1000);
