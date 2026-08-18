use crate::event_store::append_event_tx;
use crate::{
    ConfigCompareAndApplyResult, ConfigConditionConflict, ConfigEntryRecord,
    ConfigMutationCondition, EventScope, Result, SystemService, SystemServiceError,
};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;
use std::collections::HashSet;
use uuid::Uuid;

const MAX_CONFIG_MUTATIONS: usize = 64;
const MAX_CONFIG_KEY_BYTES: usize = 512;
const MAX_CONFIG_LIST_LIMIT: u32 = 200;

impl SystemService {
    pub fn put_config(&self, key: &str, value: &Value) -> Result<()> {
        self.apply_config_mutations(&[(key.to_string(), value.clone())], &[])
    }

    pub fn apply_config_mutations(
        &self,
        puts: &[(String, Value)],
        deletes: &[String],
    ) -> Result<()> {
        validate_config_mutations(puts, deletes)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        for (key, value) in puts {
            tx.execute(
                "INSERT INTO config_entry (key, value_json, revision, updated_at)
                 VALUES (?, ?, 1, ?)
                 ON CONFLICT(key) DO UPDATE SET
                   value_json = excluded.value_json,
                   revision = config_entry.revision + 1,
                   updated_at = excluded.updated_at",
                params![key, serde_json::to_string(value)?, now],
            )?;
            let revision = config_revision(&tx, key)?.ok_or_else(|| {
                SystemServiceError::Invariant(format!("config entry disappeared after put: {key}"))
            })?;
            append_config_event(&tx, "config.updated", key, revision, now)?;
        }
        for key in deletes {
            let deleted_revision = config_revision(&tx, key)?.map(|revision| revision + 1);
            tx.execute("DELETE FROM config_entry WHERE key = ?", params![key])?;
            append_config_event(
                &tx,
                "config.updated",
                key,
                deleted_revision.unwrap_or(1),
                now,
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn get_config(&self, key: &str) -> Result<Option<Value>> {
        Ok(self.get_config_entry(key)?.map(|entry| entry.value))
    }

    pub fn get_config_entry(&self, key: &str) -> Result<Option<ConfigEntryRecord>> {
        validate_config_key(key)?;
        let conn = self.connect()?;
        read_config_entry(&conn, key)
    }

    pub fn list_config_entries(
        &self,
        prefix: &str,
        after_key: Option<&str>,
        limit: Option<u32>,
    ) -> Result<Vec<ConfigEntryRecord>> {
        validate_config_key(prefix)?;
        if let Some(after_key) = after_key {
            validate_config_key(after_key)?;
            if !after_key.starts_with(prefix) {
                return Err(SystemServiceError::InvalidInput(
                    "config list after_key must start with prefix".to_string(),
                ));
            }
        }
        let limit = limit.unwrap_or(100);
        if limit == 0 || limit > MAX_CONFIG_LIST_LIMIT {
            return Err(SystemServiceError::InvalidInput(format!(
                "config list limit must be between 1 and {MAX_CONFIG_LIST_LIMIT}"
            )));
        }
        let conn = self.connect()?;
        let mut statement = conn.prepare(
            "SELECT key, value_json, revision, updated_at
             FROM config_entry
             WHERE substr(key, 1, length(?)) = ?
               AND (? IS NULL OR key > ?)
             ORDER BY key
             LIMIT ?",
        )?;
        let rows = statement.query_map(
            params![prefix, prefix, after_key, after_key, limit],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                ))
            },
        )?;
        rows.map(|row| parse_config_entry(row?)).collect()
    }

    pub fn compare_and_apply_config_mutations(
        &self,
        conditions: &[ConfigMutationCondition],
        puts: &[(String, Value)],
        deletes: &[String],
    ) -> Result<ConfigCompareAndApplyResult> {
        validate_conditional_config_mutations(conditions, puts, deletes)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_immediate_write_transaction(&mut conn)?;
        let mut conflicts = Vec::new();
        for condition in conditions {
            let current = read_config_entry(&tx, &condition.key)?;
            if current.as_ref().map(|entry| entry.revision) != condition.expected_revision {
                conflicts.push(ConfigConditionConflict {
                    key: condition.key.clone(),
                    expected_revision: condition.expected_revision,
                    current,
                });
            }
        }
        if !conflicts.is_empty() {
            tx.rollback()?;
            return Ok(ConfigCompareAndApplyResult {
                applied: false,
                entries: Vec::new(),
                conflicts,
            });
        }

        let condition_by_key = conditions
            .iter()
            .map(|condition| (condition.key.as_str(), condition.expected_revision))
            .collect::<std::collections::HashMap<_, _>>();
        let mut entries = Vec::with_capacity(puts.len());
        for (key, value) in puts {
            let expected_revision = condition_by_key[key.as_str()];
            let changed = match expected_revision {
                None => tx.execute(
                    "INSERT INTO config_entry (key, value_json, revision, updated_at)
                     VALUES (?, ?, 1, ?)",
                    params![key, serde_json::to_string(value)?, now],
                )?,
                Some(revision) => tx.execute(
                    "UPDATE config_entry
                     SET value_json = ?, revision = revision + 1, updated_at = ?
                     WHERE key = ? AND revision = ?",
                    params![serde_json::to_string(value)?, now, key, revision],
                )?,
            };
            if changed != 1 {
                return Err(SystemServiceError::Invariant(format!(
                    "validated config put did not change exactly one row: {key}"
                )));
            }
            let entry = read_config_entry(&tx, key)?.ok_or_else(|| {
                SystemServiceError::Invariant(format!(
                    "config entry disappeared after conditional put: {key}"
                ))
            })?;
            append_config_event(&tx, "config.updated", key, entry.revision, now)?;
            entries.push(entry);
        }
        for key in deletes {
            let expected_revision = condition_by_key[key.as_str()].ok_or_else(|| {
                SystemServiceError::Invariant(format!(
                    "validated config delete has missing expectation: {key}"
                ))
            })?;
            let changed = tx.execute(
                "DELETE FROM config_entry WHERE key = ? AND revision = ?",
                params![key, expected_revision],
            )?;
            if changed != 1 {
                return Err(SystemServiceError::Invariant(format!(
                    "validated config delete did not change exactly one row: {key}"
                )));
            }
            append_config_event(&tx, "config.updated", key, expected_revision + 1, now)?;
        }
        tx.commit()?;
        Ok(ConfigCompareAndApplyResult {
            applied: true,
            entries,
            conflicts: Vec::new(),
        })
    }
}

fn validate_config_mutations(puts: &[(String, Value)], deletes: &[String]) -> Result<()> {
    let count = puts.len() + deletes.len();
    if count == 0 || count > MAX_CONFIG_MUTATIONS {
        return Err(SystemServiceError::InvalidInput(format!(
            "config mutations must contain 1 to {MAX_CONFIG_MUTATIONS} entries"
        )));
    }
    let mut keys = HashSet::with_capacity(count);
    for key in puts.iter().map(|(key, _)| key).chain(deletes.iter()) {
        validate_config_key(key)?;
        if !keys.insert(key.as_str()) {
            return Err(SystemServiceError::InvalidInput(
                "config mutation keys must be unique".to_string(),
            ));
        }
    }
    Ok(())
}

fn validate_conditional_config_mutations(
    conditions: &[ConfigMutationCondition],
    puts: &[(String, Value)],
    deletes: &[String],
) -> Result<()> {
    validate_config_mutations(puts, deletes)?;
    if conditions.is_empty() || conditions.len() > MAX_CONFIG_MUTATIONS {
        return Err(SystemServiceError::InvalidInput(format!(
            "config conditions must contain 1 to {MAX_CONFIG_MUTATIONS} entries"
        )));
    }
    let mut condition_keys = HashSet::with_capacity(conditions.len());
    for condition in conditions {
        validate_config_key(&condition.key)?;
        if condition
            .expected_revision
            .is_some_and(|revision| revision <= 0)
        {
            return Err(SystemServiceError::InvalidInput(
                "config expected revision must be positive or null".to_string(),
            ));
        }
        if !condition_keys.insert(condition.key.as_str()) {
            return Err(SystemServiceError::InvalidInput(
                "config condition keys must be unique".to_string(),
            ));
        }
    }
    for key in puts.iter().map(|(key, _)| key).chain(deletes.iter()) {
        if !condition_keys.contains(key.as_str()) {
            return Err(SystemServiceError::InvalidInput(format!(
                "config mutation requires a condition for key: {key}"
            )));
        }
    }
    for key in deletes {
        let condition = conditions
            .iter()
            .find(|condition| condition.key == *key)
            .expect("mutation condition was validated");
        if condition.expected_revision.is_none() {
            return Err(SystemServiceError::InvalidInput(format!(
                "config delete requires an existing revision: {key}"
            )));
        }
    }
    Ok(())
}

fn validate_config_key(key: &str) -> Result<()> {
    if key.is_empty() || key.len() > MAX_CONFIG_KEY_BYTES {
        return Err(SystemServiceError::InvalidInput(format!(
            "config key must contain 1 to {MAX_CONFIG_KEY_BYTES} bytes"
        )));
    }
    Ok(())
}

fn read_config_entry(conn: &Connection, key: &str) -> Result<Option<ConfigEntryRecord>> {
    let row = conn
        .query_row(
            "SELECT key, value_json, revision, updated_at
             FROM config_entry WHERE key = ?",
            params![key],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                ))
            },
        )
        .optional()?;
    row.map(parse_config_entry).transpose()
}

fn parse_config_entry(row: (String, String, i64, i64)) -> Result<ConfigEntryRecord> {
    Ok(ConfigEntryRecord {
        key: row.0,
        value: serde_json::from_str(&row.1)?,
        revision: row.2,
        updated_at: row.3,
    })
}

fn config_revision(conn: &Connection, key: &str) -> Result<Option<i64>> {
    conn.query_row(
        "SELECT revision FROM config_entry WHERE key = ?",
        params![key],
        |row| row.get(0),
    )
    .optional()
    .map_err(Into::into)
}

fn append_config_event(
    tx: &rusqlite::Transaction<'_>,
    event_type: &str,
    key: &str,
    revision: i64,
    now: i64,
) -> Result<()> {
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        event_type,
        &EventScope::default(),
        &serde_json::json!({
            "key": key,
            "revision": revision,
            "updatedAt": now
        }),
        now,
    )
}
