use crate::{Result, SystemServiceError};
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashSet;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct AdmissionCondition {
    key: String,
    expected_revision: Option<i64>,
    expected_value_digest: Option<String>,
}

pub(crate) fn validate_admission_conditions(binding: &Value) -> Result<Vec<AdmissionCondition>> {
    let Some(value) = binding.get("admissionConditions") else {
        return Ok(Vec::new());
    };
    let invalid =
        || SystemServiceError::InvalidJobRequest("invalid turn admission conditions".into());
    let array = value.as_array().ok_or_else(invalid)?;
    if array.is_empty() || array.len() > 16 {
        return Err(invalid());
    }
    let mut keys = HashSet::new();
    let mut conditions = Vec::new();
    for item in array {
        let object = item.as_object().ok_or_else(invalid)?;
        if object.len() != 3
            || !["key", "expectedRevision", "expectedValueDigest"]
                .iter()
                .all(|key| object.contains_key(*key))
        {
            return Err(invalid());
        }
        let condition: AdmissionCondition =
            serde_json::from_value(item.clone()).map_err(|_| invalid())?;
        if condition.key.is_empty()
            || condition.key.len() > 512
            || !keys.insert(condition.key.clone())
            || condition
                .expected_revision
                .is_some_and(|revision| revision <= 0 || revision > 9_007_199_254_740_991)
        {
            return Err(invalid());
        }
        match (
            condition.expected_revision,
            condition.expected_value_digest.as_deref(),
        ) {
            (None, None) => {}
            (Some(_), Some(digest))
                if digest.len() == 64
                    && digest
                        .bytes()
                        .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte)) => {}
            _ => return Err(invalid()),
        }
        conditions.push(condition);
    }
    Ok(conditions)
}

pub(crate) fn require_admission_conditions_tx(
    tx: &rusqlite::Transaction<'_>,
    binding: &Value,
) -> Result<()> {
    for condition in validate_admission_conditions(binding)? {
        let current = crate::config::read_config_entry(tx, &condition.key)?;
        let revision = current.as_ref().map(|entry| entry.revision);
        let digest = current
            .as_ref()
            .map(|entry| {
                serde_json_canonicalizer::to_vec(&entry.value)
                    .map(|bytes| crate::util::hex_sha256(&bytes))
            })
            .transpose()
            .map_err(|_| {
                SystemServiceError::Invariant("config value cannot be canonicalized".into())
            })?;
        if revision != condition.expected_revision || digest != condition.expected_value_digest {
            return Err(SystemServiceError::Invariant(format!(
                "turn admission condition changed: {}",
                condition.key
            )));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use serde_json::json;

    #[test]
    fn validates_exact_bounded_conditions() {
        let absent = json!({"key":"context", "expectedRevision":null, "expectedValueDigest":null});
        assert!(validate_admission_conditions(&json!({}))
            .unwrap()
            .is_empty());
        assert!(
            validate_admission_conditions(&json!({"admissionConditions":[absent.clone()]})).is_ok()
        );
        let existing =
            json!({"key":"context", "expectedRevision":1, "expectedValueDigest":"a".repeat(64)});
        assert!(
            validate_admission_conditions(&json!({"admissionConditions":[existing.clone()]}))
                .is_ok()
        );
        for value in [
            json!(null),
            json!([]),
            json!([absent.clone(), absent.clone()]),
            json!(vec![absent.clone(); 17]),
        ] {
            assert!(validate_admission_conditions(&json!({"admissionConditions":value})).is_err());
        }
        for (field, value) in [
            ("key", json!("")),
            ("key", json!("x".repeat(513))),
            ("expectedRevision", json!(0)),
            ("expectedRevision", json!(-1)),
            ("expectedRevision", json!(9_007_199_254_740_992_i64)),
            ("expectedRevision", json!(1.5)),
            ("expectedRevision", json!(null)),
            ("expectedValueDigest", json!(null)),
            ("expectedValueDigest", json!("A".repeat(64))),
            ("unknown", json!(true)),
        ] {
            let mut invalid = existing.clone();
            invalid[field] = value;
            assert!(
                validate_admission_conditions(&json!({"admissionConditions":[invalid]})).is_err(),
                "{field}"
            );
        }
        for field in ["key", "expectedRevision", "expectedValueDigest"] {
            let mut invalid = absent.clone();
            invalid.as_object_mut().unwrap().remove(field);
            assert!(
                validate_admission_conditions(&json!({"admissionConditions":[invalid]})).is_err()
            );
        }
    }

    #[test]
    fn fences_revision_value_aba_and_absence_in_transaction() {
        let mut connection = Connection::open_in_memory().unwrap();
        connection.execute_batch("CREATE TABLE config_entry (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, revision INTEGER NOT NULL, updated_at INTEGER NOT NULL);").unwrap();
        let tx = connection.transaction().unwrap();
        let absent = json!({"admissionConditions":[{"key":"context", "expectedRevision":null, "expectedValueDigest":null}]});
        require_admission_conditions_tx(&tx, &absent).unwrap();
        tx.execute(
            "INSERT INTO config_entry VALUES ('context', '{\"b\":2,\"a\":1}', 1, 0)",
            [],
        )
        .unwrap();
        assert!(require_admission_conditions_tx(&tx, &absent).is_err());
        let expected = json!({"admissionConditions":[{"key":"context", "expectedRevision":1, "expectedValueDigest":crate::util::digest_json(&json!({"a":1,"b":2}))}]});
        require_admission_conditions_tx(&tx, &expected).unwrap();
        tx.execute("UPDATE config_entry SET revision = 2", [])
            .unwrap();
        assert!(require_admission_conditions_tx(&tx, &expected).is_err());
        tx.execute("DELETE FROM config_entry", []).unwrap();
        tx.execute(
            "INSERT INTO config_entry VALUES ('context', '{\"a\":9}', 1, 0)",
            [],
        )
        .unwrap();
        assert!(require_admission_conditions_tx(&tx, &expected).is_err());
        tx.rollback().unwrap();
        assert_eq!(
            connection
                .query_row("SELECT count(*) FROM config_entry", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }

    #[test]
    fn uses_ecmascript_numbers_and_utf16_key_order_for_jcs() {
        let mut connection = Connection::open_in_memory().unwrap();
        connection.execute_batch("CREATE TABLE config_entry (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, revision INTEGER NOT NULL, updated_at INTEGER NOT NULL);").unwrap();
        let tx = connection.transaction().unwrap();
        let value = r#"{"10":1e+21,"2":0.000001,"\ue000":1e-7,"\ud83d\ude00":1773788458401.1233,"integer":3}"#;
        tx.execute(
            "INSERT INTO config_entry VALUES ('canonical', ?, 1, 0)",
            [value],
        )
        .unwrap();
        let expected = json!({"admissionConditions":[{
            "key":"canonical", "expectedRevision":1,
            "expectedValueDigest":"bfa937b992d6105aba08bf2540550faa1de6deed23857bf9350d7a8845d0775d"
        }]});
        require_admission_conditions_tx(&tx, &expected).unwrap();
    }
}
