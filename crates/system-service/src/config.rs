use crate::event_store::append_event_tx;
use crate::{EventScope, Result, SystemService, SystemServiceError};
use rusqlite::{params, OptionalExtension};
use serde_json::Value;
use std::collections::HashSet;
use uuid::Uuid;

const MAX_CONFIG_MUTATIONS: usize = 64;
const MAX_CONFIG_KEY_BYTES: usize = 512;

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
                "INSERT INTO config_entry (key, value_json, updated_at)
                 VALUES (?, ?, ?)
                 ON CONFLICT(key) DO UPDATE SET
                   value_json = excluded.value_json,
                   updated_at = excluded.updated_at",
                params![key, serde_json::to_string(value)?, now],
            )?;
            append_config_event(&tx, "config.updated", key, now)?;
        }
        for key in deletes {
            tx.execute("DELETE FROM config_entry WHERE key = ?", params![key])?;
            append_config_event(&tx, "config.updated", key, now)?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn get_config(&self, key: &str) -> Result<Option<Value>> {
        let conn = self.connect()?;
        let json: Option<String> = conn
            .query_row(
                "SELECT value_json FROM config_entry WHERE key = ?",
                params![key],
                |row| row.get(0),
            )
            .optional()?;
        json.map(|raw| serde_json::from_str(&raw))
            .transpose()
            .map_err(Into::into)
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
        if key.is_empty() || key.len() > MAX_CONFIG_KEY_BYTES {
            return Err(SystemServiceError::InvalidInput(format!(
                "config key must contain 1 to {MAX_CONFIG_KEY_BYTES} bytes"
            )));
        }
        if !keys.insert(key.as_str()) {
            return Err(SystemServiceError::InvalidInput(
                "config mutation keys must be unique".to_string(),
            ));
        }
    }
    Ok(())
}

fn append_config_event(
    tx: &rusqlite::Transaction<'_>,
    event_type: &str,
    key: &str,
    now: i64,
) -> Result<()> {
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        event_type,
        &EventScope::default(),
        &serde_json::json!({
            "key": key,
            "updatedAt": now
        }),
        now,
    )
}
