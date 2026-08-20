use crate::{Result, SystemService, SystemServiceError, BASELINE_SCHEMA, CURRENT_SCHEMA_VERSION};
use rusqlite::{Connection, ErrorCode, Transaction, TransactionBehavior};
use std::time::Duration;

const SQLITE_BUSY_TIMEOUT: Duration = Duration::from_secs(5);
const CURRENT_SCHEMA_NAME: &str = "baseline";

impl SystemService {
    pub(crate) fn initialize_schema(&self) -> Result<()> {
        let conn = self.connect()?;
        if application_table_count(&conn)? != 0 {
            return validate_schema_marker(&conn);
        }

        conn.execute_batch("BEGIN IMMEDIATE")?;
        let initialize = (|| {
            if application_table_count(&conn)? == 0 {
                conn.execute_batch(BASELINE_SCHEMA)?;
            }
            Ok::<(), crate::SystemServiceError>(())
        })();
        match initialize {
            Ok(()) => conn.execute_batch("COMMIT")?,
            Err(error) => {
                let _ = conn.execute_batch("ROLLBACK");
                return Err(error);
            }
        }
        validate_schema_marker(&conn)
    }

    pub(crate) fn connect(&self) -> Result<Connection> {
        self.connect_with_busy_timeout(SQLITE_BUSY_TIMEOUT)
    }

    pub(crate) fn connect_with_busy_timeout(&self, timeout: Duration) -> Result<Connection> {
        let conn = Connection::open(&self.db_path)?;
        conn.busy_timeout(timeout)?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        Ok(conn)
    }
}

pub(crate) fn is_sqlite_busy(error: &SystemServiceError) -> bool {
    matches!(
        error,
        SystemServiceError::Sqlite(error)
            if matches!(
                error.sqlite_error_code(),
                Some(ErrorCode::DatabaseBusy | ErrorCode::DatabaseLocked)
            )
    )
}

pub(crate) fn begin_write_transaction(conn: &mut Connection) -> Result<Transaction<'_>> {
    conn.transaction_with_behavior(TransactionBehavior::Deferred)
        .map_err(Into::into)
}

pub(crate) fn begin_immediate_write_transaction(conn: &mut Connection) -> Result<Transaction<'_>> {
    conn.transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(Into::into)
}

fn application_table_count(conn: &Connection) -> Result<i64> {
    conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
        [],
        |row| row.get(0),
    )
    .map_err(Into::into)
}

fn validate_schema_marker(conn: &Connection) -> Result<()> {
    if !has_schema_marker_table(conn)? {
        return Err(unsupported_schema("current baseline marker is missing"));
    }

    let mut statement =
        conn.prepare("SELECT version, name FROM schema_metadata ORDER BY version")?;
    let rows = statement.query_map([], |row| {
        Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
    })?;
    let markers = rows.collect::<std::result::Result<Vec<_>, _>>()?;
    let expected = vec![(CURRENT_SCHEMA_VERSION, CURRENT_SCHEMA_NAME.to_string())];
    if markers != expected {
        return Err(unsupported_schema(&format!(
            "expected {expected:?}, found {markers:?}"
        )));
    }
    Ok(())
}

fn has_schema_marker_table(conn: &Connection) -> Result<bool> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master
         WHERE type = 'table' AND name = 'schema_metadata'",
        [],
        |row| row.get(0),
    )?;
    Ok(count == 1)
}

fn unsupported_schema(detail: &str) -> crate::SystemServiceError {
    crate::SystemServiceError::Invariant(format!(
        "unsupported pre-release store schema: {detail}; recreate the store"
    ))
}
