use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::Path;
use std::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::mpsc;
use std::time::Duration;
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
fn workspace_transaction_helper_prepares_commits_inspects_and_cleans_exact_files() {
    let root = tempdir().unwrap();
    fs::create_dir_all(root.path().join("src")).unwrap();
    fs::write(root.path().join("src/hello world 世界.txt"), "before\n").unwrap();
    fs::write(root.path().join("delete me.txt"), "delete\n").unwrap();

    let transaction_id = "wtx_cli_create_update_delete";
    let files = json!([
        {
            "ordinal": 0,
            "path": "src/hello world 世界.txt",
            "before_sha256": sha256_hex(b"before\n"),
            "after_text": "after\n",
            "after_sha256": sha256_hex(b"after\n")
        },
        {
            "ordinal": 1,
            "path": "new dir/created 空格.txt",
            "before_sha256": null,
            "after_text": "created\n",
            "after_sha256": sha256_hex(b"created\n")
        },
        {
            "ordinal": 2,
            "path": "empty.txt",
            "before_sha256": null,
            "after_text": "",
            "after_sha256": sha256_hex(b"")
        },
        {
            "ordinal": 3,
            "path": "delete me.txt",
            "before_sha256": sha256_hex(b"delete\n"),
            "after_text": null,
            "after_sha256": null
        }
    ]);
    let mut helper = WorkspaceTransactionProcess::spawn(root.path(), transaction_id);

    helper.send(json!({
        "protocol": 1,
        "command": "prepare",
        "transaction_id": transaction_id,
        "files": files.clone()
    }));
    assert_transaction_progress(&mut helper, transaction_id, "prepared", 0..=3);
    assert_eq!(
        helper.read(),
        json!({
            "protocol": 1,
            "kind": "workspace_transaction_prepared",
            "transaction_id": transaction_id
        })
    );

    assert_eq!(
        fs::read_to_string(root.path().join("src/hello world 世界.txt")).unwrap(),
        "before\n"
    );
    assert!(!root.path().join("new dir/created 空格.txt").exists());
    assert!(!root.path().join("empty.txt").exists());
    assert_eq!(
        fs::read_to_string(root.path().join("delete me.txt")).unwrap(),
        "delete\n"
    );

    helper.send(json!({
        "protocol": 1,
        "command": "inspect",
        "transaction_id": transaction_id,
        "files": files.clone()
    }));
    assert_eq!(
        observation_states(&helper.read()),
        vec!["before", "before", "before", "before"]
    );

    fs::write(root.path().join("src/hello world 世界.txt"), "external\n").unwrap();
    helper.send(json!({
        "protocol": 1,
        "command": "inspect",
        "transaction_id": transaction_id,
        "files": files.clone()
    }));
    assert_eq!(
        observation_states(&helper.read()),
        vec!["other", "before", "before", "before"]
    );
    fs::write(root.path().join("src/hello world 世界.txt"), "before\n").unwrap();

    helper.send(json!({
        "protocol": 1,
        "command": "commit",
        "transaction_id": transaction_id,
        "files": files.clone(),
        "ordinals": [0, 1, 2, 3]
    }));
    assert_transaction_progress(&mut helper, transaction_id, "committed", 0..=3);
    assert_eq!(
        helper.read(),
        json!({
            "protocol": 1,
            "kind": "workspace_transaction_committed",
            "transaction_id": transaction_id
        })
    );

    assert_eq!(
        fs::read_to_string(root.path().join("src/hello world 世界.txt")).unwrap(),
        "after\n"
    );
    assert_eq!(
        fs::read_to_string(root.path().join("new dir/created 空格.txt")).unwrap(),
        "created\n"
    );
    assert_eq!(fs::read(root.path().join("empty.txt")).unwrap(), b"");
    assert!(!root.path().join("delete me.txt").exists());

    helper.send(json!({
        "protocol": 1,
        "command": "inspect",
        "transaction_id": transaction_id,
        "files": files.clone()
    }));
    assert_eq!(
        observation_states(&helper.read()),
        vec!["after", "after", "after", "after"]
    );

    let unrelated = root.path().join("new dir/.wanex-unrelated");
    fs::write(&unrelated, "keep").unwrap();
    helper.send(json!({
        "protocol": 1,
        "command": "cleanup",
        "transaction_id": transaction_id,
        "files": files
    }));
    assert_eq!(
        helper.read(),
        json!({
            "protocol": 1,
            "kind": "workspace_transaction_cleaned",
            "transaction_id": transaction_id
        })
    );
    helper.wait_success();
    assert_eq!(fs::read_to_string(unrelated).unwrap(), "keep");
    assert!(transaction_owned_files(root.path(), transaction_id).is_empty());
}

#[test]
fn workspace_transaction_helper_rejects_commit_without_the_exact_prepared_plan() {
    let root = tempdir().unwrap();
    let transaction_id = "wtx_cli_plan_binding";
    let files = json!([{
        "ordinal": 0,
        "path": "bound.txt",
        "before_sha256": null,
        "after_text": "bound\n",
        "after_sha256": sha256_hex(b"bound\n")
    }]);
    let mut helper = WorkspaceTransactionProcess::spawn(root.path(), transaction_id);

    helper.send(json!({
        "protocol": 1,
        "command": "commit",
        "transaction_id": transaction_id,
        "files": files,
        "ordinals": [0]
    }));
    assert!(helper.read_optional().is_none());
    let stderr = helper.wait_failure();
    assert!(stderr.contains("commit plan was not prepared"), "{stderr}");
    assert!(!root.path().join("bound.txt").exists());
}

#[test]
fn killed_workspace_transaction_helper_can_finish_forward_from_partial_commit() {
    let root = tempdir().unwrap();
    fs::write(root.path().join("first.txt"), "one\n").unwrap();
    fs::write(root.path().join("second.txt"), "two\n").unwrap();
    let transaction_id = "wtx_cli_killed_partial_commit";
    let files = json!([
        {
            "ordinal": 0,
            "path": "first.txt",
            "before_sha256": sha256_hex(b"one\n"),
            "after_text": "ONE\n",
            "after_sha256": sha256_hex(b"ONE\n")
        },
        {
            "ordinal": 1,
            "path": "second.txt",
            "before_sha256": sha256_hex(b"two\n"),
            "after_text": "TWO\n",
            "after_sha256": sha256_hex(b"TWO\n")
        }
    ]);
    let mut crashed = WorkspaceTransactionProcess::spawn(root.path(), transaction_id);
    crashed.send(json!({
        "protocol": 1,
        "command": "prepare",
        "transaction_id": transaction_id,
        "files": files.clone()
    }));
    assert_transaction_progress(&mut crashed, transaction_id, "prepared", 0..=1);
    assert_eq!(
        crashed.read(),
        json!({
            "protocol": 1,
            "kind": "workspace_transaction_prepared",
            "transaction_id": transaction_id
        })
    );
    crashed.send(json!({
        "protocol": 1,
        "command": "commit",
        "transaction_id": transaction_id,
        "files": files.clone(),
        "ordinals": [0]
    }));
    assert_transaction_progress(&mut crashed, transaction_id, "committed", 0..=0);
    assert_eq!(
        crashed.read(),
        json!({
            "protocol": 1,
            "kind": "workspace_transaction_committed",
            "transaction_id": transaction_id
        })
    );
    crashed.kill_and_wait();

    let mut recovery = WorkspaceTransactionProcess::spawn(root.path(), transaction_id);
    recovery.send(json!({
        "protocol": 1,
        "command": "inspect",
        "transaction_id": transaction_id,
        "files": files.clone()
    }));
    assert_eq!(
        observation_states(&recovery.read()),
        vec!["after", "before"]
    );
    recovery.send(json!({
        "protocol": 1,
        "command": "prepare",
        "transaction_id": transaction_id,
        "files": files.clone()
    }));
    assert_transaction_progress(&mut recovery, transaction_id, "prepared", 0..=1);
    recovery.read();
    recovery.send(json!({
        "protocol": 1,
        "command": "commit",
        "transaction_id": transaction_id,
        "files": files.clone(),
        "ordinals": [0, 1]
    }));
    assert_transaction_progress(&mut recovery, transaction_id, "committed", 0..=1);
    recovery.read();
    recovery.send(json!({
        "protocol": 1,
        "command": "cleanup",
        "transaction_id": transaction_id,
        "files": files
    }));
    recovery.read();
    recovery.wait_success();

    assert_eq!(
        fs::read_to_string(root.path().join("first.txt")).unwrap(),
        "ONE\n"
    );
    assert_eq!(
        fs::read_to_string(root.path().join("second.txt")).unwrap(),
        "TWO\n"
    );
    assert!(transaction_owned_files(root.path(), transaction_id).is_empty());
}

#[cfg(unix)]
#[test]
fn workspace_transaction_helper_rejects_symlink_targets() {
    use std::os::unix::fs::symlink;

    let root = tempdir().unwrap();
    let outside = tempdir().unwrap();
    fs::write(outside.path().join("outside.txt"), "outside\n").unwrap();
    symlink(
        outside.path().join("outside.txt"),
        root.path().join("link.txt"),
    )
    .unwrap();
    let transaction_id = "wtx_cli_symlink";
    let files = json!([{
        "ordinal": 0,
        "path": "link.txt",
        "before_sha256": sha256_hex(b"outside\n"),
        "after_text": "changed\n",
        "after_sha256": sha256_hex(b"changed\n")
    }]);
    let mut helper = WorkspaceTransactionProcess::spawn(root.path(), transaction_id);

    helper.send(json!({
        "protocol": 1,
        "command": "prepare",
        "transaction_id": transaction_id,
        "files": files
    }));
    assert!(helper.read_optional().is_none());
    let stderr = helper.wait_failure();
    assert!(stderr.contains("crosses a symlink"), "{stderr}");
    assert_eq!(
        fs::read_to_string(outside.path().join("outside.txt")).unwrap(),
        "outside\n"
    );
}

#[test]
fn terminating_workspace_transaction_helper_releases_live_ownership() {
    let root = tempdir().unwrap();
    let first = WorkspaceTransactionProcess::spawn(root.path(), "wtx_cli_lock_first");
    let mut second = spawn_workspace_transaction(root.path(), "wtx_cli_lock_second");
    let mut second_stdin = second.stdin.take().unwrap();
    let mut second_stdout = BufReader::new(second.stdout.take().unwrap());
    let (ready_tx, ready_rx) = mpsc::channel();
    let reader = std::thread::spawn(move || {
        let mut line = String::new();
        let result = second_stdout.read_line(&mut line);
        ready_tx.send((result, line)).unwrap();
    });

    assert!(ready_rx.recv_timeout(Duration::from_millis(100)).is_err());
    first.kill_and_wait();
    let (result, line) = ready_rx.recv_timeout(Duration::from_secs(5)).unwrap();
    assert!(result.unwrap() > 0);
    assert_eq!(
        serde_json::from_str::<Value>(&line).unwrap(),
        json!({
            "protocol": 1,
            "kind": "workspace_transaction_ready"
        })
    );
    reader.join().unwrap();
    second_stdin.flush().unwrap();
    drop(second_stdin);
    let output = second.wait_with_output().unwrap();
    assert!(
        output.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

#[test]
fn workspace_snapshot_captures_dirty_checkout_and_releases_exact_runtime_resources() {
    let root = tempdir().unwrap();
    let repository = root.path().join("repository");
    let worktree_parent = root.path().join("worktrees");
    fs::create_dir_all(&repository).unwrap();
    fs::create_dir_all(&worktree_parent).unwrap();
    git(&repository, &["init"]);
    git(
        &repository,
        &["config", "user.email", "wanex@example.local"],
    );
    git(&repository, &["config", "user.name", "Wanex Test"]);
    fs::write(repository.join("README.md"), "base\n").unwrap();
    fs::write(repository.join("delete.txt"), "delete\n").unwrap();
    fs::write(repository.join(".gitignore"), "ignored.log\n").unwrap();
    git(&repository, &["add", "."]);
    git(&repository, &["commit", "-m", "initial"]);
    let head = git(&repository, &["rev-parse", "HEAD"]);

    fs::write(repository.join("README.md"), "staged\n").unwrap();
    git(&repository, &["add", "README.md"]);
    let index_before = git(&repository, &["rev-parse", ":README.md"]);
    fs::write(repository.join("README.md"), "unstaged\n").unwrap();
    fs::remove_file(repository.join("delete.txt")).unwrap();
    fs::write(repository.join("untracked.txt"), "untracked\n").unwrap();
    fs::write(repository.join("ignored.log"), "ignored\n").unwrap();

    let bin = env!("CARGO_BIN_EXE_wanex-system-service");
    let created = Command::new(bin)
        .args([
            "--workspace-snapshot",
            "--root",
            repository.to_str().unwrap(),
            "--worktree-parent",
            worktree_parent.to_str().unwrap(),
            "--isolation",
            "wiso_cli_dirty",
        ])
        .output()
        .unwrap();
    assert!(
        created.status.success(),
        "{}",
        String::from_utf8_lossy(&created.stderr)
    );
    let frame: Value = serde_json::from_slice(&created.stdout).unwrap();
    assert_eq!(frame["protocol"], 1);
    assert_eq!(frame["kind"], "workspace_snapshot_created");
    assert_eq!(frame["isolation_id"], "wiso_cli_dirty");
    assert_ne!(frame["base_revision"], head);
    assert_eq!(
        frame["runtime_ref"]
            .as_str()
            .unwrap()
            .starts_with("wanex/runtime/"),
        true
    );
    let snapshot_root = Path::new(frame["root_dir"].as_str().unwrap());
    assert_eq!(
        fs::read_to_string(snapshot_root.join("README.md")).unwrap(),
        "unstaged\n"
    );
    assert_eq!(
        fs::read_to_string(snapshot_root.join("untracked.txt")).unwrap(),
        "untracked\n"
    );
    assert!(!snapshot_root.join("delete.txt").exists());
    assert!(!snapshot_root.join("ignored.log").exists());

    assert_eq!(git(&repository, &["rev-parse", "HEAD"]), head);
    assert_eq!(git(&repository, &["rev-parse", ":README.md"]), index_before);

    let released = Command::new(bin)
        .args([
            "--workspace-snapshot",
            "--root",
            repository.to_str().unwrap(),
            "--worktree-parent",
            worktree_parent.to_str().unwrap(),
            "--isolation",
            "wiso_cli_dirty",
            "--release",
            "--base-revision",
            frame["base_revision"].as_str().unwrap(),
        ])
        .output()
        .unwrap();
    assert!(
        released.status.success(),
        "{}",
        String::from_utf8_lossy(&released.stderr)
    );
    assert!(!snapshot_root.exists());
    assert!(!Command::new("git")
        .args([
            "-C",
            repository.to_str().unwrap(),
            "show-ref",
            "--verify",
            "--quiet",
            &format!("refs/heads/{}", frame["runtime_ref"].as_str().unwrap())
        ])
        .status()
        .unwrap()
        .success());
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

#[test]
fn workspace_child_fixture() {
    match std::env::var("WANEX_WORKSPACE_CHILD_FIXTURE").as_deref() {
        Ok("quick") => print!("workspace-child-fixture"),
        Ok("sleep") => std::thread::sleep(Duration::from_secs(30)),
        _ => {}
    }
}

#[test]
fn workspace_child_helper_emits_exact_ready_and_terminal_evidence() {
    let root = tempdir().unwrap();
    let mut helper = WorkspaceChildProcess::spawn(workspace_child_start(root.path(), "quick"));
    let ready = helper.read();
    assert_child_identity(&ready, "workspace_child_ready");
    assert_exact_keys(
        &ready,
        &[
            "protocol",
            "kind",
            "run_id",
            "attempt_id",
            "child_id",
            "claim_token_sha256",
        ],
    );

    let terminal = helper.read_terminal();
    assert_child_identity(&terminal, "workspace_child_terminal");
    assert_exact_keys(
        &terminal,
        &[
            "protocol",
            "kind",
            "run_id",
            "attempt_id",
            "child_id",
            "claim_token_sha256",
            "exit_code",
            "signal",
            "termination",
            "cleanup",
            "cleanup_error",
            "stdout_observed_bytes",
            "stderr_observed_bytes",
            "stdout_truncated",
            "stderr_truncated",
        ],
    );
    assert_eq!(terminal["exit_code"], 0);
    assert_eq!(terminal["termination"], "exited");
    assert_eq!(terminal["cleanup"], "completed");
    assert_eq!(terminal["cleanup_error"], Value::Null);
    helper.wait_success();
}

#[test]
fn workspace_child_helper_rejects_noncanonical_start_frames_before_ready() {
    let root = tempdir().unwrap();
    let base = workspace_child_start(root.path(), "quick");
    let mut unknown = base.clone();
    unknown
        .as_object_mut()
        .unwrap()
        .insert("unexpected".to_string(), json!(true));
    let mut invalid_hash = base.clone();
    invalid_hash["claim_token_sha256"] = json!("A".repeat(64));
    let mut excessive_output = base.clone();
    excessive_output["stdout_limit_bytes"] = json!(50 * 1024 * 1024 + 1);
    let mut excessive_stdin = base;
    excessive_stdin["stdin_base64"] = json!(STANDARD.encode(vec![0_u8; 1024 * 1024 + 1]));

    for frame in [unknown, invalid_hash, excessive_output, excessive_stdin] {
        let output = run_workspace_child_once(&frame.to_string());
        assert!(!output.status.success());
        assert!(
            output.stdout.is_empty(),
            "invalid start emitted a ready frame"
        );
        assert!(
            String::from_utf8_lossy(&output.stderr).contains("workspace child helper failed"),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
}

#[test]
fn workspace_child_helper_fails_closed_on_invalid_control() {
    let root = tempdir().unwrap();
    let cases = [
        (
            json!({
                "protocol": 1,
                "command": "terminate",
                "run_id": "wtsk_child_cli",
                "attempt_id": "wtat_stale",
                "child_id": "exch_child_cli",
                "claim_token_sha256": "a".repeat(64),
                "reason": "cancelled"
            })
            .to_string(),
            "control_identity_mismatch",
        ),
        ("{\"malformed\":true}".to_string(), "control_frame_invalid"),
    ];

    for (control, expected_error) in cases {
        let mut helper = WorkspaceChildProcess::spawn(workspace_child_start(root.path(), "sleep"));
        assert_child_identity(&helper.read(), "workspace_child_ready");
        helper.send_raw(&control);
        let terminal = helper.read_terminal();
        assert_eq!(terminal["termination"], "pipe_eof");
        assert_eq!(terminal["cleanup"], "ambiguous");
        assert_eq!(terminal["cleanup_error"], expected_error);
        helper.wait_success();
    }
}

#[test]
fn workspace_child_helper_treats_control_pipe_eof_as_tree_cleanup() {
    let root = tempdir().unwrap();
    let mut helper = WorkspaceChildProcess::spawn(workspace_child_start(root.path(), "sleep"));
    assert_child_identity(&helper.read(), "workspace_child_ready");
    helper.close_control();
    let terminal = helper.read_terminal();
    assert_eq!(terminal["termination"], "pipe_eof");
    assert_eq!(terminal["cleanup"], "completed");
    assert_eq!(terminal["cleanup_error"], Value::Null);
    helper.wait_success();
}

struct WorkspaceChildProcess {
    child: Child,
    stdin: Option<ChildStdin>,
    stdout: BufReader<ChildStdout>,
    stderr: ChildStderr,
}

impl WorkspaceChildProcess {
    fn spawn(start: Value) -> Self {
        let mut child = Command::new(env!("CARGO_BIN_EXE_wanex-system-service"))
            .arg("--workspace-child")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        let mut stdin = child.stdin.take().unwrap();
        writeln!(stdin, "{start}").unwrap();
        stdin.flush().unwrap();
        Self {
            stdout: BufReader::new(child.stdout.take().unwrap()),
            stderr: child.stderr.take().unwrap(),
            child,
            stdin: Some(stdin),
        }
    }

    fn send_raw(&mut self, frame: &str) {
        let stdin = self.stdin.as_mut().unwrap();
        writeln!(stdin, "{frame}").unwrap();
        stdin.flush().unwrap();
    }

    fn close_control(&mut self) {
        drop(self.stdin.take());
    }

    fn read(&mut self) -> Value {
        let mut line = String::new();
        assert!(self.stdout.read_line(&mut line).unwrap() > 0);
        serde_json::from_str(&line).unwrap()
    }

    fn read_terminal(&mut self) -> Value {
        loop {
            let frame = self.read();
            if frame["kind"] == "workspace_child_terminal" {
                return frame;
            }
            assert!(
                matches!(
                    frame["kind"].as_str(),
                    Some("workspace_child_stdout" | "workspace_child_stderr")
                ),
                "unexpected child frame: {frame}"
            );
        }
    }

    fn wait_success(mut self) {
        drop(self.stdin.take());
        let status = self.child.wait().unwrap();
        let mut stderr = String::new();
        self.stderr.read_to_string(&mut stderr).unwrap();
        assert!(status.success(), "stderr: {stderr}");
    }
}

fn workspace_child_start(root: &Path, mode: &str) -> Value {
    json!({
        "protocol": 1,
        "kind": "workspace_child_start",
        "run_id": "wtsk_child_cli",
        "attempt_id": "wtat_child_cli",
        "child_id": "exch_child_cli",
        "claim_token_sha256": "a".repeat(64),
        "program": std::env::current_exe().unwrap(),
        "args": ["--exact", "workspace_child_fixture", "--nocapture"],
        "cwd": root,
        "environment": { "WANEX_WORKSPACE_CHILD_FIXTURE": mode },
        "stdin_base64": "",
        "stdout_limit_bytes": 4096,
        "stderr_limit_bytes": 4096,
        "termination_grace_ms": 100
    })
}

fn run_workspace_child_once(frame: &str) -> std::process::Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_wanex-system-service"))
        .arg("--workspace-child")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    writeln!(child.stdin.take().unwrap(), "{frame}").unwrap();
    child.wait_with_output().unwrap()
}

fn assert_child_identity(frame: &Value, kind: &str) {
    assert_eq!(frame["protocol"], 1);
    assert_eq!(frame["kind"], kind);
    assert_eq!(frame["run_id"], "wtsk_child_cli");
    assert_eq!(frame["attempt_id"], "wtat_child_cli");
    assert_eq!(frame["child_id"], "exch_child_cli");
    assert_eq!(frame["claim_token_sha256"], "a".repeat(64));
}

fn assert_exact_keys(frame: &Value, keys: &[&str]) {
    let object = frame.as_object().unwrap();
    assert_eq!(object.len(), keys.len(), "unexpected frame keys: {frame}");
    for key in keys {
        assert!(
            object.contains_key(*key),
            "missing frame key {key}: {frame}"
        );
    }
}

struct WorkspaceTransactionProcess {
    child: Child,
    stdin: Option<ChildStdin>,
    stdout: BufReader<ChildStdout>,
    stderr: ChildStderr,
}

impl WorkspaceTransactionProcess {
    fn spawn(root: &std::path::Path, transaction_id: &str) -> Self {
        let mut child = spawn_workspace_transaction(root, transaction_id);
        let stdin = child.stdin.take().unwrap();
        let stdout = child.stdout.take().unwrap();
        let stderr = child.stderr.take().unwrap();
        let mut process = Self {
            child,
            stdin: Some(stdin),
            stdout: BufReader::new(stdout),
            stderr,
        };
        assert_eq!(
            process.read(),
            json!({
                "protocol": 1,
                "kind": "workspace_transaction_ready"
            })
        );
        process
    }

    fn send(&mut self, command: Value) {
        let stdin = self.stdin.as_mut().unwrap();
        writeln!(stdin, "{command}").unwrap();
        stdin.flush().unwrap();
    }

    fn read(&mut self) -> Value {
        self.read_optional()
            .expect("workspace transaction helper should return a frame")
    }

    fn read_optional(&mut self) -> Option<Value> {
        let mut line = String::new();
        let size = self.stdout.read_line(&mut line).unwrap();
        if size == 0 {
            return None;
        }
        Some(serde_json::from_str(&line).unwrap())
    }

    fn wait_success(mut self) {
        drop(self.stdin.take());
        let status = self.child.wait().unwrap();
        let stderr = self.read_stderr();
        assert!(status.success(), "stderr: {stderr}");
    }

    fn wait_failure(mut self) -> String {
        drop(self.stdin.take());
        let status = self.child.wait().unwrap();
        let stderr = self.read_stderr();
        assert!(!status.success(), "helper unexpectedly succeeded");
        stderr
    }

    fn kill_and_wait(mut self) {
        self.child.kill().unwrap();
        self.child.wait().unwrap();
    }

    fn read_stderr(&mut self) -> String {
        let mut stderr = String::new();
        self.stderr.read_to_string(&mut stderr).unwrap();
        stderr
    }
}

fn spawn_workspace_transaction(root: &std::path::Path, transaction_id: &str) -> Child {
    Command::new(env!("CARGO_BIN_EXE_wanex-system-service"))
        .args([
            "--workspace-transaction",
            "--root",
            root.to_str().unwrap(),
            "--transaction",
            transaction_id,
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap()
}

fn assert_transaction_progress(
    helper: &mut WorkspaceTransactionProcess,
    transaction_id: &str,
    state: &str,
    ordinals: impl IntoIterator<Item = i64>,
) {
    for ordinal in ordinals {
        assert_eq!(
            helper.read(),
            json!({
                "protocol": 1,
                "kind": "workspace_transaction_file",
                "transaction_id": transaction_id,
                "ordinal": ordinal,
                "state": state
            })
        );
    }
}

fn observation_states(frame: &Value) -> Vec<&str> {
    assert_eq!(frame["protocol"], 1);
    assert_eq!(frame["kind"], "workspace_transaction_inspection");
    frame["observations"]
        .as_array()
        .unwrap()
        .iter()
        .map(|observation| observation["current"].as_str().unwrap())
        .collect()
}

fn transaction_owned_files(
    root: &std::path::Path,
    transaction_id: &str,
) -> Vec<std::path::PathBuf> {
    let digest = sha256_hex(transaction_id.as_bytes());
    let prefix = format!(".wanex-{digest}-");
    let mut pending = vec![root.to_path_buf()];
    let mut owned = Vec::new();
    while let Some(directory) = pending.pop() {
        for entry in fs::read_dir(directory).unwrap() {
            let entry = entry.unwrap();
            if entry.file_type().unwrap().is_dir() {
                pending.push(entry.path());
            } else if entry.file_name().to_string_lossy().starts_with(&prefix) {
                owned.push(entry.path());
            }
        }
    }
    owned
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

fn git(repository: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
        .arg("-C")
        .arg(repository)
        .args(args)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "git {:?} failed: {}",
        args,
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}
