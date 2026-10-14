use crate::{Result, SystemServiceError};
use serde_json::Value;

fn invalid() -> SystemServiceError {
    SystemServiceError::InvalidJobRequest("invalid or noncanonical generationOptions".to_string())
}

pub(crate) fn validate_descriptors(value: &Value) -> Result<()> {
    let descriptors = value.as_array().ok_or_else(invalid)?;
    if descriptors.len() > 32 {
        return Err(invalid());
    }
    let mut previous = "";
    for descriptor in descriptors {
        let item = descriptor.as_object().ok_or_else(invalid)?;
        let name = item
            .get("name")
            .and_then(Value::as_str)
            .ok_or_else(invalid)?;
        if name.is_empty()
            || name.len() > 64
            || name <= previous
            || !name.as_bytes()[0].is_ascii_lowercase()
            || !name
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
        {
            return Err(invalid());
        }
        previous = name;
        let description = item
            .get("description")
            .and_then(Value::as_str)
            .ok_or_else(invalid)?;
        if description.is_empty()
            || description.trim() != description
            || description.encode_utf16().count() > 512
        {
            return Err(invalid());
        }
        let kind = item
            .get("type")
            .and_then(Value::as_str)
            .ok_or_else(invalid)?;
        let fields: &[&str] = match kind {
            "string" => &["name", "description", "type", "enum"],
            "integer" => &["name", "description", "type", "minimum", "maximum"],
            "boolean" => &["name", "description", "type"],
            _ => return Err(invalid()),
        };
        if item.len() != fields.len() || item.keys().any(|key| !fields.contains(&key.as_str())) {
            return Err(invalid());
        }
        if kind == "string" {
            let values = item
                .get("enum")
                .and_then(Value::as_array)
                .ok_or_else(invalid)?;
            if values.is_empty() || values.len() > 32 {
                return Err(invalid());
            }
            let mut previous_value: Option<&str> = None;
            for entry in values {
                let entry = entry.as_str().ok_or_else(invalid)?;
                if entry.is_empty()
                    || entry.encode_utf16().count() > 128
                    || previous_value
                        .is_some_and(|p| p.encode_utf16().cmp(entry.encode_utf16()).is_ge())
                {
                    return Err(invalid());
                }
                previous_value = Some(entry);
            }
        } else if kind == "integer" {
            let minimum = safe_integer(item.get("minimum").ok_or_else(invalid)?)?;
            let maximum = safe_integer(item.get("maximum").ok_or_else(invalid)?)?;
            if minimum > maximum {
                return Err(invalid());
            }
        }
    }
    Ok(())
}

fn safe_integer(value: &Value) -> Result<f64> {
    let number = value.as_f64().ok_or_else(invalid)?;
    if !number.is_finite() || number.fract() != 0.0 || number.abs() > 9_007_199_254_740_991.0 {
        return Err(invalid());
    }
    Ok(number)
}

pub(crate) fn validate_values(descriptors: Option<&Value>, value: &Value) -> Result<()> {
    if let Some(descriptors) = descriptors {
        validate_descriptors(descriptors)?;
    }
    if value.is_null() {
        return Ok(());
    }
    let options = value.as_object().ok_or_else(invalid)?;
    for (name, entry) in options {
        let option = descriptors
            .and_then(Value::as_array)
            .and_then(|items| {
                items
                    .iter()
                    .find(|item| item.get("name").and_then(Value::as_str) == Some(name))
            })
            .ok_or_else(invalid)?;
        let valid = match option.get("type").and_then(Value::as_str) {
            Some("boolean") => entry.is_boolean(),
            Some("string") => {
                entry.is_string()
                    && option["enum"]
                        .as_array()
                        .is_some_and(|values| values.contains(entry))
            }
            Some("integer") => safe_integer(entry).is_ok_and(|n| {
                n >= option["minimum"].as_f64().unwrap() && n <= option["maximum"].as_f64().unwrap()
            }),
            _ => false,
        };
        if !valid {
            return Err(invalid());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn validates_canonical_scalar_descriptors_and_values() {
        let descriptors = json!([
            {"name":"count","description":"Output count","type":"integer","minimum":1,"maximum":4},
            {"name":"quality","description":"Quality","type":"string","enum":["high","low"]},
            {"name":"watermark","description":"Watermark","type":"boolean"}
        ]);
        validate_descriptors(&descriptors).unwrap();
        validate_values(
            Some(&descriptors),
            &json!({"count":2.0,"quality":"high","watermark":false}),
        )
        .unwrap();
        for value in [
            json!({"count":0}),
            json!({"count":1.5}),
            json!({"quality":"auto"}),
            json!({"watermark":"true"}),
            json!({"model":"override"}),
        ] {
            assert!(validate_values(Some(&descriptors), &value).is_err());
        }
        assert!(validate_values(None, &json!({"quality":"high"})).is_err());
        validate_values(None, &json!({})).unwrap();
    }

    #[test]
    fn rejects_unbounded_duplicate_and_noncanonical_metadata() {
        for value in [
            json!([{"name":"quality","description":"Quality","type":"string","enum":["low","high"]}]),
            json!([{"name":"count","description":"Count","type":"integer","minimum":2,"maximum":1}]),
            json!([{"name":"quality","description":"Quality","type":"string","enum":["high","high"]}]),
            json!([{"name":"flag","description":"Flag","type":"boolean","extra":true}]),
            json!([{"name":"flag","description":" Flag","type":"boolean"}]),
        ] {
            assert!(validate_descriptors(&value).is_err());
        }
    }
}
