use crate::event_store::append_event_tx;
use crate::{EventScope, Result, SystemService};
use rusqlite::{params, OptionalExtension};
use serde_json::Value;
use uuid::Uuid;

impl SystemService {
    pub fn put_config(&self, key: &str, value: &Value) -> Result<()> {
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        tx.execute(
            "INSERT INTO config_entry (key, value_json, updated_at)
             VALUES (?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET
               value_json = excluded.value_json,
               updated_at = excluded.updated_at",
            params![key, serde_json::to_string(value)?, now],
        )?;
        append_event_tx(
            &tx,
            &format!("evt_{}", Uuid::now_v7()),
            "config.updated",
            &EventScope::default(),
            &serde_json::json!({
                "key": key,
                "updatedAt": now
            }),
            now,
        )?;
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
