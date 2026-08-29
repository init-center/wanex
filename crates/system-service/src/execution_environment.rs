use serde_json::{Map, Value};

type ValidationResult<T> = std::result::Result<T, String>;

const FILE_EFFECTS: [&str; 4] = ["create", "read", "remove", "write"];

pub(crate) fn validate_binding(value: &Value, label: &str) -> ValidationResult<()> {
    let binding = object(value, label)?;
    exact_keys(
        binding,
        &[
            "revision",
            "environmentId",
            "providerId",
            "providerRevision",
            "capabilities",
            "capabilityDigest",
            "policy",
            "policyDigest",
        ],
        label,
    )?;
    revision(binding.get("revision"), &format!("{label}.revision"))?;
    bounded_string(
        binding.get("environmentId"),
        &format!("{label}.environmentId"),
    )?;
    bounded_string(binding.get("providerId"), &format!("{label}.providerId"))?;
    bounded_string(
        binding.get("providerRevision"),
        &format!("{label}.providerRevision"),
    )?;
    let capabilities = required(binding, "capabilities", label)?;
    validate_capabilities(capabilities, &format!("{label}.capabilities"))?;
    let capability_digest = sha256(
        binding.get("capabilityDigest"),
        &format!("{label}.capabilityDigest"),
    )?;
    if crate::util::digest_json(capabilities) != capability_digest {
        return Err(format!(
            "{label}.capabilityDigest does not match its content"
        ));
    }
    let policy = required(binding, "policy", label)?;
    validate_policy(policy, &format!("{label}.policy"))?;
    let policy_digest = sha256(
        binding.get("policyDigest"),
        &format!("{label}.policyDigest"),
    )?;
    if crate::util::digest_json(policy) != policy_digest {
        return Err(format!("{label}.policyDigest does not match its content"));
    }
    Ok(())
}

pub(crate) fn validate_application_scope(value: &Value, label: &str) -> ValidationResult<()> {
    let scope = object(value, label)?;
    exact_keys(scope, &["kind", "id", "digest", "metadata"], label)?;
    let kind = bounded_string(scope.get("kind"), &format!("{label}.kind"))?;
    let id = bounded_string(scope.get("id"), &format!("{label}.id"))?;
    let digest = sha256(scope.get("digest"), &format!("{label}.digest"))?;
    let metadata = required(scope, "metadata", label)?;
    let unsigned = serde_json::json!({
        "kind": kind,
        "id": id,
        "metadata": metadata,
    });
    if crate::util::digest_json(&unsigned) != digest {
        return Err(format!("{label}.digest does not match its content"));
    }
    Ok(())
}

fn validate_capabilities(value: &Value, label: &str) -> ValidationResult<()> {
    let capabilities = object(value, label)?;
    exact_keys(
        capabilities,
        &[
            "revision",
            "isolation",
            "filesystem",
            "process",
            "pty",
            "network",
            "secretProjection",
            "artifactExport",
        ],
        label,
    )?;
    revision(capabilities.get("revision"), &format!("{label}.revision"))?;

    let isolation = child_object(capabilities, "isolation", label)?;
    exact_keys(isolation, &["enforcement"], &format!("{label}.isolation"))?;
    allowed_string(
        isolation.get("enforcement"),
        &["none", "os"],
        &format!("{label}.isolation.enforcement"),
    )?;

    let filesystem = child_object(capabilities, "filesystem", label)?;
    exact_keys(
        filesystem,
        &["enforcement", "effects"],
        &format!("{label}.filesystem"),
    )?;
    allowed_string(
        filesystem.get("enforcement"),
        &["library_guard", "os"],
        &format!("{label}.filesystem.enforcement"),
    )?;
    effects(
        filesystem.get("effects"),
        &format!("{label}.filesystem.effects"),
    )?;

    let process = child_object(capabilities, "process", label)?;
    exact_keys(
        process,
        &["oneShot", "managed", "cleanup"],
        &format!("{label}.process"),
    )?;
    if !boolean(process.get("oneShot"), &format!("{label}.process.oneShot"))? {
        return Err(format!("{label}.process.oneShot must be true"));
    }
    boolean(process.get("managed"), &format!("{label}.process.managed"))?;
    allowed_string(
        process.get("cleanup"),
        &["runtime_process_tree", "durable_supervisor"],
        &format!("{label}.process.cleanup"),
    )?;

    validate_supported_flag(capabilities, "pty", label)?;
    let network = child_object(capabilities, "network", label)?;
    exact_keys(network, &["enforcement"], &format!("{label}.network"))?;
    allowed_string(
        network.get("enforcement"),
        &["none", "os"],
        &format!("{label}.network.enforcement"),
    )?;
    validate_supported_flag(capabilities, "secretProjection", label)?;
    validate_supported_flag(capabilities, "artifactExport", label)?;
    Ok(())
}

fn validate_supported_flag(
    parent: &Map<String, Value>,
    key: &str,
    label: &str,
) -> ValidationResult<()> {
    let child_label = format!("{label}.{key}");
    let value = child_object(parent, key, label)?;
    exact_keys(value, &["supported"], &child_label)?;
    boolean(value.get("supported"), &format!("{child_label}.supported"))?;
    Ok(())
}

fn validate_policy(value: &Value, label: &str) -> ValidationResult<()> {
    let policy = object(value, label)?;
    exact_keys(
        policy,
        &[
            "revision",
            "filesystem",
            "process",
            "network",
            "isolation",
            "pty",
        ],
        label,
    )?;
    revision(policy.get("revision"), &format!("{label}.revision"))?;

    let filesystem = child_object(policy, "filesystem", label)?;
    exact_keys(
        filesystem,
        &["roots", "maxReadBytes", "maxDirectoryEntries"],
        &format!("{label}.filesystem"),
    )?;
    let roots = filesystem
        .get("roots")
        .and_then(Value::as_array)
        .ok_or_else(|| format!("{label}.filesystem.roots must be an array"))?;
    let mut previous_root: Option<&str> = None;
    for (index, root) in roots.iter().enumerate() {
        let root_label = format!("{label}.filesystem.roots.{index}");
        let root = object(root, &root_label)?;
        exact_keys(root, &["id", "effects"], &root_label)?;
        let id = bounded_string(root.get("id"), &format!("{root_label}.id"))?;
        if previous_root.is_some_and(|previous| previous >= id) {
            return Err(format!("{label}.filesystem.roots must use canonical order"));
        }
        previous_root = Some(id);
        effects(root.get("effects"), &format!("{root_label}.effects"))?;
    }
    positive_integer(
        filesystem.get("maxReadBytes"),
        &format!("{label}.filesystem.maxReadBytes"),
    )?;
    positive_integer(
        filesystem.get("maxDirectoryEntries"),
        &format!("{label}.filesystem.maxDirectoryEntries"),
    )?;

    let process = child_object(policy, "process", label)?;
    exact_keys(
        process,
        &["oneShot", "managed", "cleanup", "environmentVariables"],
        &format!("{label}.process"),
    )?;
    boolean(process.get("oneShot"), &format!("{label}.process.oneShot"))?;
    boolean(process.get("managed"), &format!("{label}.process.managed"))?;
    allowed_string(
        process.get("cleanup"),
        &["runtime_process_tree", "durable_supervisor"],
        &format!("{label}.process.cleanup"),
    )?;
    canonical_strings(
        process.get("environmentVariables"),
        &format!("{label}.process.environmentVariables"),
    )?;

    allowed_string(
        policy.get("network"),
        &["unrestricted", "denied"],
        &format!("{label}.network"),
    )?;
    allowed_string(
        policy.get("isolation"),
        &["none", "os"],
        &format!("{label}.isolation"),
    )?;
    boolean(policy.get("pty"), &format!("{label}.pty"))?;
    Ok(())
}

fn effects(value: Option<&Value>, label: &str) -> ValidationResult<()> {
    let values = value
        .and_then(Value::as_array)
        .ok_or_else(|| format!("{label} must be an array"))?;
    if values.is_empty() {
        return Err(format!("{label} must contain unique effects"));
    }
    let mut previous: Option<&str> = None;
    for value in values {
        let effect = value
            .as_str()
            .filter(|effect| FILE_EFFECTS.contains(effect))
            .ok_or_else(|| format!("{label} contains an invalid effect"))?;
        if previous.is_some_and(|previous| previous >= effect) {
            return Err(format!("{label} must use canonical order"));
        }
        previous = Some(effect);
    }
    Ok(())
}

fn canonical_strings(value: Option<&Value>, label: &str) -> ValidationResult<()> {
    let values = value
        .and_then(Value::as_array)
        .ok_or_else(|| format!("{label} must be an array"))?;
    let mut previous: Option<&str> = None;
    for value in values {
        let item = bounded_string(Some(value), label)?;
        if previous.is_some_and(|previous| previous >= item) {
            return Err(format!("{label} must use canonical order"));
        }
        previous = Some(item);
    }
    Ok(())
}

fn object<'a>(value: &'a Value, label: &str) -> ValidationResult<&'a Map<String, Value>> {
    value
        .as_object()
        .ok_or_else(|| format!("{label} must be an object"))
}

fn child_object<'a>(
    parent: &'a Map<String, Value>,
    key: &str,
    label: &str,
) -> ValidationResult<&'a Map<String, Value>> {
    object(required(parent, key, label)?, &format!("{label}.{key}"))
}

fn required<'a>(
    object: &'a Map<String, Value>,
    key: &str,
    label: &str,
) -> ValidationResult<&'a Value> {
    object
        .get(key)
        .ok_or_else(|| format!("{label}.{key} is required"))
}

fn exact_keys(object: &Map<String, Value>, keys: &[&str], label: &str) -> ValidationResult<()> {
    if object.len() != keys.len() || keys.iter().any(|key| !object.contains_key(*key)) {
        return Err(format!("{label} contains missing or unknown fields"));
    }
    Ok(())
}

fn revision(value: Option<&Value>, label: &str) -> ValidationResult<()> {
    if value.and_then(Value::as_u64) != Some(1) {
        return Err(format!("{label} must be 1"));
    }
    Ok(())
}

fn bounded_string<'a>(value: Option<&'a Value>, label: &str) -> ValidationResult<&'a str> {
    value
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty() && value.len() <= 256)
        .ok_or_else(|| format!("{label} must be a non-empty string of at most 256 characters"))
}

fn allowed_string<'a>(
    value: Option<&'a Value>,
    allowed: &[&str],
    label: &str,
) -> ValidationResult<&'a str> {
    value
        .and_then(Value::as_str)
        .filter(|value| allowed.contains(value))
        .ok_or_else(|| format!("{label} is invalid"))
}

fn boolean(value: Option<&Value>, label: &str) -> ValidationResult<bool> {
    value
        .and_then(Value::as_bool)
        .ok_or_else(|| format!("{label} must be a boolean"))
}

fn positive_integer(value: Option<&Value>, label: &str) -> ValidationResult<u64> {
    value
        .and_then(Value::as_u64)
        .filter(|value| *value > 0 && *value <= 9_007_199_254_740_991)
        .ok_or_else(|| format!("{label} must be a positive safe integer"))
}

fn sha256<'a>(value: Option<&'a Value>, label: &str) -> ValidationResult<&'a str> {
    value
        .and_then(Value::as_str)
        .filter(|value| {
            value.len() == 64
                && value
                    .bytes()
                    .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        })
        .ok_or_else(|| format!("{label} must be a lowercase SHA-256 digest"))
}
