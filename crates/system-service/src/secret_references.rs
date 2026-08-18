use crate::{Result, SystemService, SystemServiceError};
use rusqlite::params;

const MAX_SECRET_REF_BYTES: usize = 2048;

impl SystemService {
    pub fn has_live_secret_reference(&self, secret_ref: &str) -> Result<bool> {
        if secret_ref.is_empty() || secret_ref.len() > MAX_SECRET_REF_BYTES {
            return Err(SystemServiceError::InvalidInput(format!(
                "secret ref must contain 1 to {MAX_SECRET_REF_BYTES} bytes"
            )));
        }
        let conn = self.connect()?;
        let turn_reference: bool = conn.query_row(
            "SELECT EXISTS(
               SELECT 1
               FROM session_turn AS turn_record,
                    json_tree(turn_record.execution_binding_json) AS binding_value
               WHERE turn_record.state NOT IN ('succeeded', 'failed', 'cancelled', 'interrupted')
                 AND binding_value.key = 'secretRef'
                 AND binding_value.value = ?
             )",
            params![secret_ref],
            |row| row.get(0),
        )?;
        if turn_reference {
            return Ok(true);
        }
        conn.query_row(
            "SELECT EXISTS(
               SELECT 1
               FROM media_generation_operation AS operation_record,
                    json_tree(operation_record.binding_json) AS binding_value
               WHERE operation_record.state NOT IN ('succeeded', 'failed', 'cancelled')
                 AND binding_value.key = 'secretRef'
                 AND binding_value.value = ?
             )",
            params![secret_ref],
            |row| row.get(0),
        )
        .map_err(Into::into)
    }
}
