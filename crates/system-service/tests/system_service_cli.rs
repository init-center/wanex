use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use tempfile::tempdir;
use wanex_system_service::CURRENT_SCHEMA_VERSION;

#[test]
fn cli_enforces_storage_rpc_protocol_before_opening_store() {
    let root = tempdir().unwrap();
    let store = root.path().join("must-not-open-for-describe");
    let store_str = store.to_str().unwrap();

    let (describe_ok, describe) = run_cli_envelope(
        store_str,
        json!({
            "storage_rpc_version": 1,
            "request_id": "rpc_describe_test",
            "request": { "command": "rpc-describe" }
        }),
    );
    assert!(describe_ok);
    assert_eq!(describe["storage_rpc_version"], 1);
    assert_eq!(describe["request_id"], "rpc_describe_test");
    assert_eq!(describe["value"]["selected_version"], 1);
    assert_eq!(describe["value"]["supported_versions"], json!([1]));
    assert_eq!(
        describe["value"]["capabilities"],
        json!([
            "storage.runtime",
            "storage.sessions",
            "storage.context",
            "storage.scheduler",
            "storage.tools",
            "storage.workspace",
            "storage.plan",
            "storage.objective",
            "storage.delegation",
            "storage.team",
            "storage.plugin",
            "storage.connector",
            "storage.channel",
            "storage.media_generation"
        ])
    );
    assert!(describe["value"]["schema_sha256"]
        .as_str()
        .is_some_and(|value| value.len() == 64));
    assert!(!store.exists(), "rpc-describe must not open the store");

    let cases = [
        (
            json!({
                "storage_rpc_version": 2,
                "request_id": "rpc_wrong_version",
                "request": { "command": "doctor" }
            }),
            "rpc_wrong_version",
            "unsupported_storage_rpc_version",
        ),
        (
            json!({
                "storage_rpc_version": 1,
                "request_id": "rpc_outer_extra",
                "request": { "command": "doctor" },
                "extra": true
            }),
            "rpc_outer_extra",
            "invalid_storage_rpc_envelope",
        ),
        (
            json!({
                "storage_rpc_version": 1,
                "request_id": "rpc_describe_extra",
                "request": { "command": "rpc-describe", "extra": true }
            }),
            "rpc_describe_extra",
            "invalid_storage_rpc_envelope",
        ),
        (
            json!({
                "storage_rpc_version": 1,
                "request_id": "rpc_unknown_command",
                "request": { "command": "does-not-exist" }
            }),
            "rpc_unknown_command",
            "unknown_storage_rpc_command",
        ),
        (
            json!({
                "storage_rpc_version": 1,
                "request_id": "rpc_runtime_nested_extra",
                "request": {
                    "command": "append-event",
                    "event": {
                        "id": "evt_invalid",
                        "type": "config.updated",
                        "scope": {
                            "session_id": null,
                            "turn_id": null,
                            "attempt_id": null,
                            "input_id": null,
                            "message_id": null,
                            "resource_id": null,
                            "plan_proposal_id": null,
                            "objective_id": null
                        },
                        "payload": null,
                        "occurredAt": 1,
                        "extra": true
                    }
                }
            }),
            "rpc_runtime_nested_extra",
            "invalid_storage_rpc_envelope",
        ),
        (
            json!({
                "storage_rpc_version": 1,
                "request_id": "rpc_session_missing_nullable",
                "request": {
                    "command": "admit-session-input",
                    "id": "inp_invalid",
                    "session_id": "ses_invalid",
                    "principal_id": "user_invalid",
                    "idempotency_key": "idem_invalid",
                    "input_type": "user",
                    "content": []
                }
            }),
            "rpc_session_missing_nullable",
            "invalid_storage_rpc_envelope",
        ),
    ];

    for (request, request_id, error_code) in cases {
        let (ok, response) = run_cli_envelope(store_str, request);
        assert!(!ok, "{error_code} must produce a failing process status");
        assert_eq!(response["storage_rpc_version"], 1);
        assert_eq!(response["request_id"], request_id);
        assert_eq!(response["ok"], false);
        assert_eq!(response["error"]["code"], error_code);
    }
    assert!(
        !store.exists(),
        "invalid protocol requests must not open the store"
    );

    fs::create_dir_all(&store).unwrap();
    let (doctor_ok, doctor) = run_cli_envelope(
        store_str,
        json!({
            "storage_rpc_version": 1,
            "request_id": "rpc_echo_test",
            "request": { "command": "doctor" }
        }),
    );
    assert!(doctor_ok);
    assert_eq!(doctor["request_id"], "rpc_echo_test");
}

#[test]
fn cli_appends_and_queries_events() {
    let dir = tempdir().unwrap();

    let append = run_cli(
        dir.path().to_str().unwrap(),
        json!({
            "command": "append-event",
            "event": {
                "id": "evt_cli_1",
                "type": "session.input.admitted",
                "scope": {
                    "session_id": "ses_cli_1",
                    "turn_id": null,
                    "attempt_id": null,
                    "input_id": "inp_cli_1",
                    "message_id": null,
                    "resource_id": null,
                    "plan_proposal_id": null,
                    "objective_id": null
                },
                "payload": { "text": "hello from cli" },
                "occurredAt": 100
            }
        }),
    );
    assert_eq!(append["ok"], true);

    let queried = run_cli(
        dir.path().to_str().unwrap(),
        json!({
            "command": "query-events",
            "query": {
                "session_id": "ses_cli_1",
                "plan_proposal_id": null,
                "objective_id": null,
                "after_occurred_at": null,
                "after_event_id": null,
                "limit": 10
            }
        }),
    );

    assert_eq!(queried["ok"], true);
    assert_eq!(queried["value"][0]["id"], "evt_cli_1");
    assert_eq!(queried["value"][0]["payload"]["text"], "hello from cli");
}

#[test]
fn cli_writes_file_and_reports_doctor() {
    let dir = tempdir().unwrap();

    let written = run_cli(
        dir.path().to_str().unwrap(),
        json!({
            "command": "write-atomic-file",
            "logical_path": "cli/output.txt",
            "content_base64": "aGVsbG8=",
            "expected_sha256": null
        }),
    );

    assert_eq!(written["ok"], true);
    assert_eq!(written["value"]["logical_path"], "cli/output.txt");
    assert_eq!(written["value"]["size_bytes"], 5);

    let doctor = run_cli(dir.path().to_str().unwrap(), json!({ "command": "doctor" }));
    assert_eq!(doctor["ok"], true);
    assert_eq!(doctor["value"]["schema_version"], CURRENT_SCHEMA_VERSION);
}

#[test]
fn cli_serializes_cross_process_atomic_replacement() {
    const WRITERS: usize = 8;
    let dir = tempdir().unwrap();
    let store = dir.path().to_str().unwrap();
    run_cli(store, json!({ "command": "doctor" }));

    let payloads = (0..WRITERS)
        .map(|index| format!("process-{index}:{}", "x".repeat(64 * 1024)).into_bytes())
        .collect::<Vec<_>>();
    let bin = env!("CARGO_BIN_EXE_wanex-system-service");
    let mut children = (0..WRITERS)
        .map(|_| {
            Command::new(bin)
                .args(["--store", store])
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .unwrap()
        })
        .collect::<Vec<_>>();

    for (index, child) in children.iter_mut().enumerate() {
        let request = wire_request(json!({
            "command": "write-atomic-file",
            "logical_path": "concurrent/跨进程 output.txt",
            "content_base64": STANDARD.encode(&payloads[index]),
            "expected_sha256": null
        }));
        child
            .stdin
            .take()
            .unwrap()
            .write_all(request.to_string().as_bytes())
            .unwrap();
    }

    let records = children
        .into_iter()
        .map(|child| {
            let output = child.wait_with_output().unwrap();
            assert!(
                output.status.success(),
                "cross-process write failed: {}",
                String::from_utf8_lossy(&output.stderr)
            );
            let response: Value = serde_json::from_slice(&output.stdout).unwrap();
            assert_eq!(response["ok"], true);
            response["value"].clone()
        })
        .collect::<Vec<_>>();

    let final_path = records[0]["absolute_path"].as_str().unwrap();
    let final_content = fs::read(final_path).unwrap();
    assert!(payloads.iter().any(|payload| payload == &final_content));
    let stored = run_cli(
        store,
        json!({
            "command": "get-resource",
            "resource_id": records[0]["resource_id"]
        }),
    );
    assert_eq!(stored["value"]["sha256"], sha256_hex(&final_content));
    assert_eq!(stored["value"]["size_bytes"], final_content.len());

    let lock_files = fs::read_dir(dir.path().join("locks/resource-write"))
        .unwrap()
        .collect::<std::io::Result<Vec<_>>>()
        .unwrap();
    assert_eq!(lock_files.len(), 1);
    let temp_files = fs::read_dir(std::path::Path::new(final_path).parent().unwrap())
        .unwrap()
        .filter_map(std::result::Result::ok)
        .filter(|entry| entry.file_name().to_string_lossy().contains(".tmp-"))
        .collect::<Vec<_>>();
    assert!(temp_files.is_empty());
}

#[test]
fn cli_runs_durable_turn_flow() {
    let dir = tempdir().unwrap();

    let session = run_cli(
        dir.path().to_str().unwrap(),
        json!({
            "command": "create-session",
            "id": "ses_cli_phase2",
            "title": "CLI Phase 2",
            "kind": "chat"
        }),
    );
    assert_eq!(session["ok"], true);
    assert_eq!(session["value"]["id"], "ses_cli_phase2");

    let submitted = run_cli(
        dir.path().to_str().unwrap(),
        json!({
            "command": "submit-session-turn",
            "request": {
                "id": "inp_cli_phase2",
                "turn_id": "turn_cli_phase2",
                "session_id": "ses_cli_phase2",
                "principal_id": "user_cli",
                "idempotency_key": "idem_cli_phase2",
                "input_type": "user",
                "content": [{ "type": "text", "id": "part_cli", "text": "hello" }],
                "origin": null,
                "intent": null,
                "run_control_policy": null,
                "expected_turn_id": null,
                "job_id": "job_cli_phase2",
                "job_idempotency_key": "job:idem_cli_phase2",
                "execution_binding": test_execution_binding("cli_phase2"),
                "max_steps": 4,
                "regenerates_turn_id": null,
                "scheduled_at": null,
                "not_before": null,
                "priority": null,
                "budget_grant_id": null
            }
        }),
    );
    assert_eq!(submitted["ok"], true);
    assert_eq!(
        submitted["value"]["admission"]["input_id"],
        "inp_cli_phase2"
    );
    assert_eq!(submitted["value"]["turn"]["id"], "turn_cli_phase2");
    assert_eq!(submitted["value"]["job"]["id"], "job_cli_phase2");

    let claim = run_cli(
        dir.path().to_str().unwrap(),
        json!({
            "command": "claim-job",
            "request": {
                "worker_id": "worker_cli",
                "lease_ms": 60000,
                "kinds": ["session.turn"]
            }
        }),
    );
    assert_eq!(claim["ok"], true);
    assert_eq!(claim["value"]["id"], "job_cli_phase2");

    let started = run_cli(
        dir.path().to_str().unwrap(),
        json!({
            "command": "start-session-turn-attempt",
            "request": {
                "session_id": "ses_cli_phase2",
                "turn_id": "turn_cli_phase2",
                "input_id": "inp_cli_phase2",
                "job_id": "job_cli_phase2",
                "worker_id": "worker_cli",
                "lease_token": claim["value"]["lease_token"]
            }
        }),
    );
    assert_eq!(started["ok"], true);
    assert_eq!(started["value"]["turn"]["state"], "running");
    assert_eq!(started["value"]["input_message"]["role"], "user");

    let appended = run_cli(
        dir.path().to_str().unwrap(),
        json!({
            "command": "append-session-message",
            "session_id": "ses_cli_phase2",
            "turn_id": "turn_cli_phase2",
            "attempt_id": started["value"]["attempt"]["id"],
            "input_id": "inp_cli_phase2",
            "job_id": "job_cli_phase2",
            "worker_id": "worker_cli",
            "lease_token": claim["value"]["lease_token"],
            "idempotency_key": "message:turn_cli_phase2:tool",
            "role": "tool",
            "content": [{
                "type": "tool_result",
                "id": "part_cli_tool",
                "toolCallId": "call_cli",
                "result": { "ok": true },
                "isError": false
            }],
            "provider_state": null
        }),
    );
    assert_eq!(appended["ok"], true);
    assert_eq!(appended["value"]["role"], "tool");

    let settled = run_cli(
        dir.path().to_str().unwrap(),
        json!({
            "command": "settle-session-turn",
            "request": {
                "session_id": "ses_cli_phase2",
                "turn_id": "turn_cli_phase2",
                "attempt_id": started["value"]["attempt"]["id"],
                "input_id": "inp_cli_phase2",
                "job_id": "job_cli_phase2",
                "worker_id": "worker_cli",
                "lease_token": claim["value"]["lease_token"],
                "outcome": "failed",
                "provider_invocation_id": null,
                "assistant_message": null,
                "provider_state": null,
                "result": null,
                "error": { "message": "cli failure" },
                "reason": "cli failure"
            }
        }),
    );
    assert_eq!(settled["ok"], true);
    assert_eq!(settled["value"]["turn"]["state"], "failed");
    assert_eq!(settled["value"]["job"]["state"], "failed");
}

#[test]
fn cli_serve_process_handles_multiple_requests() {
    let dir = tempdir().unwrap();
    let bin = env!("CARGO_BIN_EXE_wanex-system-service");
    let mut child = Command::new(bin)
        .args(["--store", dir.path().to_str().unwrap(), "--serve"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut stdin = child.stdin.take().unwrap();
    let stdout = child.stdout.take().unwrap();
    let mut reader = BufReader::new(stdout);

    let doctor = serve_request(&mut stdin, &mut reader, json!({ "command": "doctor" }));
    assert_eq!(doctor["ok"], true);

    let session = serve_request(
        &mut stdin,
        &mut reader,
        json!({
            "command": "create-session",
            "id": "ses_serve",
            "title": "Serve",
            "kind": "agent"
        }),
    );
    assert_eq!(session["ok"], true);
    assert_eq!(session["value"]["id"], "ses_serve");

    let events = serve_request(
        &mut stdin,
        &mut reader,
        json!({
            "command": "query-events",
            "query": {
                "session_id": "ses_serve",
                "plan_proposal_id": null,
                "objective_id": null,
                "after_occurred_at": null,
                "after_event_id": null,
                "limit": 10
            }
        }),
    );
    assert_eq!(events["ok"], true);
    assert_eq!(events["value"][0]["event_type"], "session.created");

    let job = serve_request(
        &mut stdin,
        &mut reader,
        json!({
            "command": "enqueue-job",
            "request": {
                "id": "job_serve",
                "kind": "memory.compaction",
                "principal_id": "user_cli",
                "payload": { "sessionId": "ses_serve" },
                "scheduled_at": null,
                "not_before": null,
                "priority": 1,
                "concurrency_key": null,
                "max_attempts": 1,
                "retry_policy": null,
                "idempotency_key": "idem_job_serve",
                "budget_grant_id": null
            }
        }),
    );
    assert_eq!(job["ok"], true);
    assert_eq!(job["value"]["state"], "ready");

    let claim = serve_request(
        &mut stdin,
        &mut reader,
        json!({
            "command": "claim-job",
            "request": {
                "worker_id": "worker_cli",
                "lease_ms": 60000,
                "kinds": ["memory.compaction"]
            }
        }),
    );
    assert_eq!(claim["ok"], true);
    assert_eq!(claim["value"]["id"], "job_serve");

    let complete = serve_request(
        &mut stdin,
        &mut reader,
        json!({
            "command": "complete-job",
            "request": {
                "job_id": "job_serve",
                "worker_id": "worker_cli",
                "lease_token": claim["value"]["lease_token"],
                "result": { "ok": true }
            }
        }),
    );
    assert_eq!(complete["ok"], true);
    assert_eq!(complete["value"]["state"], "succeeded");

    drop(stdin);
    let output = child.wait_with_output().unwrap();
    assert!(
        output.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

fn run_cli(store: &str, request: Value) -> Value {
    let (ok, response) = run_cli_envelope(store, wire_request(request));
    assert!(ok, "storage RPC command should succeed: {response}");
    assert_eq!(response["storage_rpc_version"], 1);
    assert_eq!(response["request_id"], "rpc_cli_test");
    response
}

fn run_cli_envelope(store: &str, request: Value) -> (bool, Value) {
    let bin = env!("CARGO_BIN_EXE_wanex-system-service");
    let mut child = Command::new(bin)
        .args(["--store", store])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();

    child
        .stdin
        .as_mut()
        .unwrap()
        .write_all(request.to_string().as_bytes())
        .unwrap();

    let output = child.wait_with_output().unwrap();
    let response: Value = serde_json::from_slice(&output.stdout).unwrap();
    (output.status.success(), response)
}

fn serve_request(
    stdin: &mut std::process::ChildStdin,
    reader: &mut BufReader<std::process::ChildStdout>,
    request: Value,
) -> Value {
    writeln!(stdin, "{}", wire_request(request)).unwrap();
    stdin.flush().unwrap();
    let mut line = String::new();
    reader.read_line(&mut line).unwrap();
    let response: Value = serde_json::from_str(&line).unwrap();
    assert_eq!(response["storage_rpc_version"], 1);
    assert_eq!(response["request_id"], "rpc_cli_test");
    response
}

fn wire_request(request: Value) -> Value {
    json!({
        "storage_rpc_version": 1,
        "request_id": "rpc_cli_test",
        "request": request,
    })
}

fn test_execution_binding(label: &str) -> Value {
    let endpoint = json!({
        "id": format!("endpoint_{label}"),
        "connection": {
            "id": format!("connection_{label}"),
            "providerId": "fake"
        },
        "protocol": { "id": "fake" },
        "model": {
            "id": format!("model_{label}"),
            "operations": ["conversation"],
            "inputModalities": ["text"],
            "outputModalities": ["text"],
            "features": [],
            "catalog": {
                "source": "custom",
                "catalogId": format!("test.model_{label}"),
                "revision": "1"
            }
        }
    });
    let endpoint_digest = sha256_json(&endpoint);
    let mut binding = json!({
        "createdAt": 1,
        "modelEndpoint": {
            "endpointId": format!("endpoint_{label}"),
            "endpointDigest": endpoint_digest,
            "connection": endpoint["connection"].clone(),
            "protocol": endpoint["protocol"].clone(),
            "model": endpoint["model"].clone()
        },
        "completion": { "maxOutputTokens": 4096 },
        "capabilityRoutes": [],
        "resources": [],
        "recovery": {
            "providerMaxAttempts": 2,
            "idempotentToolMaxAttempts": 2
        }
    });
    let digest = sha256_json(&binding);
    binding
        .as_object_mut()
        .unwrap()
        .insert("digest".to_string(), json!(digest));
    binding
}

fn sha256_json(value: &Value) -> String {
    Sha256::digest(serde_json::to_string(value).unwrap().as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn sha256_hex(content: &[u8]) -> String {
    Sha256::digest(content)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}
