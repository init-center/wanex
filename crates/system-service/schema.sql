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
  parent_turn_id TEXT REFERENCES session_turn(id),
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
  WHERE state IN ('running', 'cancel_requested');

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
  result_json TEXT,
  is_error INTEGER,
  error_json TEXT,
  created_at INTEGER NOT NULL,
  finished_at INTEGER,
  updated_at INTEGER NOT NULL,
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

CREATE TABLE IF NOT EXISTS context_epoch (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES session(id),
  policy_version TEXT NOT NULL,
  state TEXT NOT NULL,
  token_estimate_before INTEGER NOT NULL DEFAULT 0,
  token_estimate_after INTEGER NOT NULL DEFAULT 0,
  token_savings INTEGER NOT NULL DEFAULT 0,
  replacement_count INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT,
  created_at INTEGER NOT NULL,
  activated_at INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_context_epoch_session_policy_state
  ON context_epoch(session_id, policy_version, state, updated_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_context_epoch_active_unique
  ON context_epoch(session_id, policy_version)
  WHERE state = 'active';

CREATE TABLE IF NOT EXISTS context_replacement (
  id TEXT PRIMARY KEY,
  epoch_id TEXT NOT NULL REFERENCES context_epoch(id),
  session_id TEXT NOT NULL REFERENCES session(id),
  policy_version TEXT NOT NULL,
  message_id TEXT,
  part_id TEXT NOT NULL,
  tier TEXT NOT NULL,
  original_token_estimate INTEGER NOT NULL,
  replacement_token_estimate INTEGER NOT NULL,
  replacement_json TEXT NOT NULL,
  metadata_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(epoch_id, part_id)
);

CREATE INDEX IF NOT EXISTS idx_context_replacement_session_policy
  ON context_replacement(session_id, policy_version, epoch_id, part_id);

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
  title TEXT,
  summary TEXT,
  steps_json TEXT NOT NULL,
  references_json TEXT NOT NULL,
  state TEXT NOT NULL,
  metadata_json TEXT,
  idempotency_key TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  closed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_plan_proposal_principal_state
  ON plan_proposal(principal_id, state, updated_at);

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
  actor_id TEXT NOT NULL,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  reason TEXT,
  metadata_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_plan_proposal_operation_proposal
  ON plan_proposal_operation(proposal_id, created_at, id);

CREATE TABLE IF NOT EXISTS objective_run (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  objective TEXT NOT NULL,
  scope TEXT,
  constraints_json TEXT NOT NULL,
  success_criteria_json TEXT NOT NULL,
  stop_policy_json TEXT,
  references_json TEXT NOT NULL,
  state TEXT NOT NULL,
  metadata_json TEXT,
  idempotency_key TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  closed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_objective_run_principal_state
  ON objective_run(principal_id, state, updated_at);

CREATE TABLE IF NOT EXISTS objective_reference (
  objective_id TEXT NOT NULL REFERENCES objective_run(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  role TEXT NOT NULL,
  metadata_json TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(objective_id, kind, reference_id, role)
);

CREATE INDEX IF NOT EXISTS idx_objective_reference_lookup
  ON objective_reference(kind, reference_id, objective_id);

CREATE TABLE IF NOT EXISTS objective_run_operation (
  id TEXT PRIMARY KEY,
  objective_id TEXT NOT NULL REFERENCES objective_run(id),
  operation TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  reason TEXT,
  metadata_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_objective_run_operation_objective
  ON objective_run_operation(objective_id, created_at, id);

CREATE TABLE IF NOT EXISTS objective_attempt (
  id TEXT PRIMARY KEY,
  objective_id TEXT NOT NULL REFERENCES objective_run(id),
  attempt_number INTEGER NOT NULL,
  state TEXT NOT NULL,
  session_id TEXT,
  session_input_id TEXT,
  session_turn_id TEXT,
  scheduler_job_id TEXT,
  delegation_graph_id TEXT,
  plan_proposal_id TEXT,
  workspace_change_proposal_id TEXT,
  summary TEXT,
  result_json TEXT,
  error_json TEXT,
  metadata_json TEXT,
  idempotency_key TEXT UNIQUE,
  started_at INTEGER,
  finished_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(objective_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_objective_attempt_objective
  ON objective_attempt(objective_id, attempt_number, id);

CREATE INDEX IF NOT EXISTS idx_objective_attempt_objective_state
  ON objective_attempt(objective_id, state, updated_at);

CREATE TABLE IF NOT EXISTS objective_verification (
  id TEXT PRIMARY KEY,
  objective_id TEXT NOT NULL REFERENCES objective_run(id),
  attempt_id TEXT REFERENCES objective_attempt(id),
  kind TEXT NOT NULL,
  state TEXT NOT NULL,
  reason TEXT,
  evidence_json TEXT,
  verifier_ref TEXT,
  metadata_json TEXT,
  idempotency_key TEXT UNIQUE,
  created_at INTEGER NOT NULL
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
  state TEXT NOT NULL,
  metadata_json TEXT,
  idempotency_key TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_team_participant_conversation_state
  ON team_participant(conversation_id, state, updated_at);

CREATE TABLE IF NOT EXISTS team_turn (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES team_conversation(id),
  speaker_participant_id TEXT NOT NULL REFERENCES team_participant(id),
  audience_participant_ids_json TEXT,
  kind TEXT NOT NULL,
  content_json TEXT NOT NULL,
  metadata_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_team_turn_conversation_created
  ON team_turn(conversation_id, created_at, id);

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
  state TEXT NOT NULL,
  binding_json TEXT NOT NULL,
  dispatch_attempt INTEGER NOT NULL,
  external_operation_id TEXT,
  provider_checkpoint_json TEXT,
  output_references_json TEXT NOT NULL,
  output_resource_ids_json TEXT NOT NULL,
  progress_json TEXT,
  error_json TEXT,
  cancel_requested_at INTEGER,
  cancel_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  finished_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_media_generation_principal_state
  ON media_generation_operation(principal_id, state, updated_at);

CREATE INDEX IF NOT EXISTS idx_media_generation_state_updated
  ON media_generation_operation(state, updated_at);

INSERT INTO schema_metadata (version, name, applied_at)
  VALUES (1, 'baseline', CAST(strftime('%s', 'now') AS INTEGER) * 1000);
