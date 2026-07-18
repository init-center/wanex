use crate::{Result, SystemService, CURRENT_SCHEMA_VERSION, INITIAL_MIGRATION};
use rusqlite::{params, Connection};
use std::time::Duration;

const SQLITE_BUSY_TIMEOUT: Duration = Duration::from_secs(5);

impl SystemService {
    pub(crate) fn migrate(&self) -> Result<()> {
        let conn = self.connect()?;
        apply_initial_migration(&conn)?;
        apply_v2_resource_and_job_result(&conn)?;
        apply_v3_context_epoch(&conn)?;
        apply_v4_run_control(&conn)?;
        apply_v5_plan_proposal(&conn)?;
        apply_v6_objective_run(&conn)?;
        apply_v7_tool_execution(&conn)?;
        apply_v8_budget_usage_ledger(&conn)?;
        assert_current_schema_version(&conn)?;
        Ok(())
    }

    pub(crate) fn connect(&self) -> Result<Connection> {
        let conn = Connection::open(&self.db_path)?;
        conn.busy_timeout(SQLITE_BUSY_TIMEOUT)?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        Ok(conn)
    }
}

fn apply_initial_migration(conn: &Connection) -> Result<()> {
    if has_table(conn, "schema_migration")? && has_migration(conn, 1)? {
        return Ok(());
    }
    conn.execute_batch(INITIAL_MIGRATION)?;
    record_migration(conn, 1, "initial")?;
    Ok(())
}

fn apply_v2_resource_and_job_result(conn: &Connection) -> Result<()> {
    if has_migration(conn, 2)? {
        return Ok(());
    }

    let tx = conn.unchecked_transaction()?;
    add_column_if_missing(
        &tx,
        "scheduler_job",
        "result_json",
        "ALTER TABLE scheduler_job ADD COLUMN result_json TEXT",
    )?;
    add_column_if_missing(
        &tx,
        "resource",
        "kind",
        "ALTER TABLE resource ADD COLUMN kind TEXT NOT NULL DEFAULT 'file'",
    )?;
    add_column_if_missing(
        &tx,
        "resource",
        "origin",
        "ALTER TABLE resource ADD COLUMN origin TEXT NOT NULL DEFAULT 'system'",
    )?;
    add_column_if_missing(
        &tx,
        "resource",
        "label",
        "ALTER TABLE resource ADD COLUMN label TEXT",
    )?;
    add_column_if_missing(
        &tx,
        "resource",
        "source_provider",
        "ALTER TABLE resource ADD COLUMN source_provider TEXT",
    )?;
    add_column_if_missing(
        &tx,
        "resource",
        "provider_file_id",
        "ALTER TABLE resource ADD COLUMN provider_file_id TEXT",
    )?;
    add_column_if_missing(
        &tx,
        "resource",
        "provider_operation_id",
        "ALTER TABLE resource ADD COLUMN provider_operation_id TEXT",
    )?;
    add_column_if_missing(
        &tx,
        "resource",
        "source_url",
        "ALTER TABLE resource ADD COLUMN source_url TEXT",
    )?;
    add_column_if_missing(
        &tx,
        "resource",
        "source_expires_at",
        "ALTER TABLE resource ADD COLUMN source_expires_at INTEGER",
    )?;
    add_column_if_missing(
        &tx,
        "resource",
        "metadata_json",
        "ALTER TABLE resource ADD COLUMN metadata_json TEXT",
    )?;
    add_column_if_missing(
        &tx,
        "resource",
        "width",
        "ALTER TABLE resource ADD COLUMN width INTEGER",
    )?;
    add_column_if_missing(
        &tx,
        "resource",
        "height",
        "ALTER TABLE resource ADD COLUMN height INTEGER",
    )?;
    add_column_if_missing(
        &tx,
        "resource",
        "duration_ms",
        "ALTER TABLE resource ADD COLUMN duration_ms INTEGER",
    )?;
    tx.execute(
        "CREATE INDEX IF NOT EXISTS idx_resource_kind_state
           ON resource(kind, state, updated_at)",
        [],
    )?;
    tx.execute(
        "CREATE INDEX IF NOT EXISTS idx_resource_origin_state
           ON resource(origin, state, updated_at)",
        [],
    )?;
    record_migration(&tx, 2, "resource_and_job_result_compat")?;
    tx.commit()?;
    Ok(())
}

fn apply_v3_context_epoch(conn: &Connection) -> Result<()> {
    if has_migration(conn, 3)? {
        return Ok(());
    }

    let tx = conn.unchecked_transaction()?;
    create_context_epoch_table(&tx)?;
    if !has_table(&tx, "context_replacement")? {
        create_context_replacement_v3_table(&tx)?;
        record_migration(&tx, 3, "context_epoch")?;
        tx.commit()?;
        return Ok(());
    }

    if has_column(&tx, "context_replacement", "epoch_id")? {
        create_context_replacement_v3_indexes(&tx)?;
        record_migration(&tx, 3, "context_epoch")?;
        tx.commit()?;
        return Ok(());
    }

    tx.execute(
        "ALTER TABLE context_replacement RENAME TO context_replacement_v2",
        [],
    )?;
    create_context_replacement_v3_table(&tx)?;
    let now = crate::util::now_ms();
    tx.execute(
        "INSERT OR IGNORE INTO context_epoch (
            id, session_id, policy_version, state,
            token_estimate_before, token_estimate_after, token_savings, replacement_count,
            metadata_json, created_at, activated_at, updated_at
         )
         SELECT
            'ctxepoch_legacy_' || lower(hex(session_id || ':' || policy_version)),
            session_id,
            policy_version,
            'active',
            COALESCE(SUM(original_token_estimate), 0),
            COALESCE(SUM(replacement_token_estimate), 0),
            COALESCE(SUM(original_token_estimate - replacement_token_estimate), 0),
            COUNT(*),
            '{\"migration\":\"v3_context_epoch\"}',
            MIN(created_at),
            ?,
            ?
         FROM context_replacement_v2
         GROUP BY session_id, policy_version",
        params![now, now],
    )?;
    tx.execute(
        "INSERT INTO context_replacement (
            id, epoch_id, session_id, policy_version, message_id, part_id, tier,
            original_token_estimate, replacement_token_estimate,
            replacement_json, metadata_json, created_at, updated_at
         )
         SELECT
            id,
            'ctxepoch_legacy_' || lower(hex(session_id || ':' || policy_version)),
            session_id,
            policy_version,
            message_id,
            part_id,
            tier,
            original_token_estimate,
            replacement_token_estimate,
            replacement_json,
            metadata_json,
            created_at,
            updated_at
         FROM context_replacement_v2",
        [],
    )?;
    tx.execute("DROP TABLE context_replacement_v2", [])?;
    record_migration(&tx, 3, "context_epoch")?;
    tx.commit()?;
    Ok(())
}

fn create_context_epoch_table(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
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
        ",
    )?;
    Ok(())
}

fn create_context_replacement_v3_table(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
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
        ",
    )?;
    create_context_replacement_v3_indexes(conn)
}

fn create_context_replacement_v3_indexes(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_context_replacement_session_policy
           ON context_replacement(session_id, policy_version, epoch_id, part_id)",
        [],
    )?;
    Ok(())
}

fn apply_v4_run_control(conn: &Connection) -> Result<()> {
    if has_migration(conn, 4)? {
        return Ok(());
    }

    let tx = conn.unchecked_transaction()?;
    create_run_control_base_tables(&tx)?;
    add_column_if_missing(
        &tx,
        "session_input",
        "origin_json",
        "ALTER TABLE session_input ADD COLUMN origin_json TEXT",
    )?;
    add_column_if_missing(
        &tx,
        "session_input",
        "intent",
        "ALTER TABLE session_input ADD COLUMN intent TEXT NOT NULL DEFAULT 'normal'",
    )?;
    add_column_if_missing(
        &tx,
        "session_input",
        "run_control_policy",
        "ALTER TABLE session_input ADD COLUMN run_control_policy TEXT",
    )?;
    add_column_if_missing(
        &tx,
        "session_input",
        "expected_run_id",
        "ALTER TABLE session_input ADD COLUMN expected_run_id TEXT",
    )?;
    tx.execute(
        "CREATE INDEX IF NOT EXISTS idx_session_input_intent
           ON session_input(session_id, intent, status, created_at)",
        [],
    )?;
    create_session_run_control_table(&tx)?;
    record_migration(&tx, 4, "run_control")?;
    tx.commit()?;
    Ok(())
}

fn create_run_control_base_tables(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS event_log (
          id TEXT PRIMARY KEY,
          event_type TEXT NOT NULL,
          scope_session_id TEXT,
          scope_run_id TEXT,
          scope_input_id TEXT,
          scope_message_id TEXT,
          scope_resource_id TEXT,
          payload_json TEXT NOT NULL,
          occurred_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_event_log_occurred_at
          ON event_log(occurred_at, id);

        CREATE INDEX IF NOT EXISTS idx_event_log_session
          ON event_log(scope_session_id, occurred_at, id);

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
          expected_run_id TEXT,
          status TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          UNIQUE(session_id, idempotency_key)
        );

        CREATE INDEX IF NOT EXISTS idx_session_input_status
          ON session_input(session_id, status, created_at);

        CREATE TABLE IF NOT EXISTS session_run (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES session(id),
          input_id TEXT NOT NULL REFERENCES session_input(id),
          runner_id TEXT NOT NULL,
          status TEXT NOT NULL,
          lease_token TEXT NOT NULL,
          lease_expires_at INTEGER NOT NULL,
          started_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          finished_at INTEGER,
          error_json TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_session_run_session_status
          ON session_run(session_id, status, updated_at);

        CREATE TABLE IF NOT EXISTS session_runner_lease (
          session_id TEXT PRIMARY KEY REFERENCES session(id),
          runner_id TEXT NOT NULL,
          run_id TEXT NOT NULL REFERENCES session_run(id),
          input_id TEXT NOT NULL REFERENCES session_input(id),
          lease_token TEXT NOT NULL,
          claimed_at INTEGER NOT NULL,
          heartbeat_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS session_message (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES session(id),
          run_id TEXT,
          input_id TEXT,
          role TEXT NOT NULL,
          status TEXT NOT NULL,
          content_json TEXT NOT NULL,
          provider_state_json TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_session_message_session_created
          ON session_message(session_id, created_at, id);
        ",
    )?;
    Ok(())
}

fn create_session_run_control_table(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS session_run_control (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES session(id),
          run_id TEXT NOT NULL REFERENCES session_run(id),
          input_id TEXT REFERENCES session_input(id),
          principal_id TEXT,
          idempotency_key TEXT NOT NULL,
          kind TEXT NOT NULL,
          status TEXT NOT NULL,
          content_json TEXT,
          reason TEXT,
          origin_json TEXT,
          provider_profile_id TEXT,
          metadata_json TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          applied_at INTEGER,
          UNIQUE(session_id, idempotency_key)
        );

        CREATE INDEX IF NOT EXISTS idx_session_run_control_pending
          ON session_run_control(session_id, run_id, status, created_at);

        CREATE INDEX IF NOT EXISTS idx_session_run_control_kind
          ON session_run_control(session_id, kind, status, created_at);
        ",
    )?;
    Ok(())
}

fn apply_v5_plan_proposal(conn: &Connection) -> Result<()> {
    if has_migration(conn, 5)? {
        return Ok(());
    }

    let tx = conn.unchecked_transaction()?;
    add_column_if_missing(
        &tx,
        "event_log",
        "scope_plan_proposal_id",
        "ALTER TABLE event_log ADD COLUMN scope_plan_proposal_id TEXT",
    )?;
    tx.execute(
        "CREATE INDEX IF NOT EXISTS idx_event_log_plan_proposal
           ON event_log(scope_plan_proposal_id, occurred_at, id)",
        [],
    )?;
    create_plan_proposal_tables(&tx)?;
    record_migration(&tx, 5, "plan_proposal")?;
    tx.commit()?;
    Ok(())
}

fn create_plan_proposal_tables(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
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
        ",
    )?;
    Ok(())
}

fn apply_v6_objective_run(conn: &Connection) -> Result<()> {
    if has_migration(conn, 6)? {
        return Ok(());
    }

    let tx = conn.unchecked_transaction()?;
    add_column_if_missing(
        &tx,
        "event_log",
        "scope_objective_id",
        "ALTER TABLE event_log ADD COLUMN scope_objective_id TEXT",
    )?;
    tx.execute(
        "CREATE INDEX IF NOT EXISTS idx_event_log_objective
           ON event_log(scope_objective_id, occurred_at, id)",
        [],
    )?;
    create_objective_run_tables(&tx)?;
    record_migration(&tx, 6, "objective_run")?;
    tx.commit()?;
    Ok(())
}

fn create_objective_run_tables(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
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
          session_run_id TEXT,
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
        ",
    )?;
    Ok(())
}

fn apply_v7_tool_execution(conn: &Connection) -> Result<()> {
    if has_migration(conn, 7)? {
        return Ok(());
    }
    let tx = conn.unchecked_transaction()?;
    add_column_if_missing(
        &tx,
        "session_message",
        "idempotency_key",
        "ALTER TABLE session_message ADD COLUMN idempotency_key TEXT",
    )?;
    tx.execute_batch(
        "
        CREATE UNIQUE INDEX IF NOT EXISTS idx_session_message_idempotency
          ON session_message(session_id, idempotency_key)
          WHERE idempotency_key IS NOT NULL;

        CREATE TABLE IF NOT EXISTS tool_execution (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES session(id),
          run_id TEXT NOT NULL,
          input_id TEXT NOT NULL,
          principal_id TEXT NOT NULL,
          tool_call_id TEXT NOT NULL,
          tool_name TEXT NOT NULL,
          input_json TEXT NOT NULL,
          descriptor_json TEXT NOT NULL,
          permission_json TEXT NOT NULL,
          state TEXT NOT NULL,
          attempt INTEGER NOT NULL,
          idempotency_key TEXT NOT NULL UNIQUE,
          result_json TEXT,
          is_error INTEGER,
          error_json TEXT,
          created_at INTEGER NOT NULL,
          started_at INTEGER,
          finished_at INTEGER,
          updated_at INTEGER NOT NULL,
          UNIQUE(run_id, tool_call_id)
        );

        CREATE INDEX IF NOT EXISTS idx_tool_execution_session_state
          ON tool_execution(session_id, state, updated_at, id);
        CREATE INDEX IF NOT EXISTS idx_tool_execution_run
          ON tool_execution(run_id, updated_at, id);
        ",
    )?;
    record_migration(&tx, 7, "tool_execution")?;
    tx.commit()?;
    Ok(())
}

fn apply_v8_budget_usage_ledger(conn: &Connection) -> Result<()> {
    if has_migration(conn, 8)? {
        return Ok(());
    }
    let tx = conn.unchecked_transaction()?;
    tx.execute_batch(
        "
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
        ",
    )?;
    record_migration(&tx, 8, "budget_usage_ledger")?;
    tx.commit()?;
    Ok(())
}

fn assert_current_schema_version(conn: &Connection) -> Result<()> {
    let version = crate::util::current_schema_version(conn)?;
    if version != CURRENT_SCHEMA_VERSION {
        return Err(crate::SystemServiceError::Invariant(format!(
            "unexpected schema version after migration: {version}, expected {CURRENT_SCHEMA_VERSION}"
        )));
    }
    Ok(())
}

fn has_migration(conn: &Connection, version: i64) -> Result<bool> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM schema_migration WHERE version = ?",
        params![version],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

fn has_table(conn: &Connection, table: &str) -> Result<bool> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?",
        params![table],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

fn record_migration(conn: &Connection, version: i64, name: &str) -> Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO schema_migration (version, name, applied_at)
         VALUES (?, ?, ?)",
        params![version, name, crate::util::now_ms()],
    )?;
    Ok(())
}

fn add_column_if_missing(
    conn: &Connection,
    table: &str,
    column: &str,
    statement: &str,
) -> Result<()> {
    if has_column(conn, table, column)? {
        return Ok(());
    }
    conn.execute(statement, [])?;
    Ok(())
}

fn has_column(conn: &Connection, table: &str, column: &str) -> Result<bool> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
    for row in rows {
        if row? == column {
            return Ok(true);
        }
    }
    Ok(false)
}
