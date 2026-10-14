use super::*;
use std::os::unix::process::CommandExt;

struct OwnedChild(Child);

impl Drop for OwnedChild {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

fn group_root() -> OwnedChild {
    OwnedChild(
        Command::new("/bin/sleep")
            .arg("60")
            .process_group(0)
            .spawn()
            .unwrap(),
    )
}

fn zombie_member(group: libc::pid_t) -> OwnedChild {
    let child = OwnedChild(
        Command::new("/bin/sh")
            .args(["-c", "exit 0"])
            .process_group(group)
            .spawn()
            .unwrap(),
    );
    let mut info = std::mem::MaybeUninit::<libc::siginfo_t>::uninit();
    // Observe exit without reaping: the test deliberately owns the zombie until Drop.
    assert_eq!(
        unsafe {
            libc::waitid(
                libc::P_PID,
                child.0.id() as libc::id_t,
                info.as_mut_ptr(),
                libc::WEXITED | libc::WNOWAIT,
            )
        },
        0
    );
    child
}

#[test]
fn exited_unreaped_members_do_not_make_supervisor_cleanup_ambiguous() {
    let mut root = group_root();
    let group = root.0.id() as libc::pid_t;
    let _zombie = zombie_member(group);
    let ownership = ChildOwnership::claim(&mut root.0).unwrap();
    let start: StartFrame = serde_json::from_value(serde_json::json!({
        "protocol": 1, "kind": "workspace_child_start", "run_id": "zombie_run",
        "attempt_id": "zombie_attempt", "child_id": "zombie_child",
        "claim_token_sha256": "b".repeat(64), "program": "/bin/sleep", "args": ["60"],
        "cwd": std::env::current_dir().unwrap(), "environment": {}, "stdin_mode": "closed", "stdin_base64": "",
        "stdout_limit_bytes": 0, "stderr_limit_bytes": 0, "termination_grace_ms": 30
    })).unwrap();
    let control: ControlFrame = serde_json::from_value(serde_json::json!({
        "protocol": 1, "run_id": start.run_id, "attempt_id": start.attempt_id,
        "child_id": start.child_id, "claim_token_sha256": start.claim_token_sha256,
        "command": "terminate", "reason": "cancelled"
    }))
    .unwrap();
    let (sender, events) = mpsc::channel();
    // These processes have no captured output pipes; both output streams are already closed.
    sender.send(Event::StdoutClosed).unwrap();
    sender.send(Event::StderrClosed).unwrap();
    sender
        .send(Event::Control(ControlResult::Frame(control)))
        .unwrap();
    let mut output = Vec::new();
    run_child_loop(&mut root.0, None, ownership, &events, &mut output, &start).unwrap();
    let terminal: serde_json::Value = serde_json::from_slice(&output).unwrap();
    assert_eq!(terminal["termination"], "cancelled");
    assert_eq!(terminal["cleanup"], "completed", "{terminal}");
    assert!(terminal["cleanup_error"].is_null());
    let exists = unsafe { libc::kill(-group, 0) };
    assert!(
        exists == 0 || io::Error::last_os_error().raw_os_error() == Some(libc::EPERM),
        "the group still contains the unreaped zombie"
    );
}

#[test]
fn ownership_detects_live_members_after_the_root_exits() {
    let mut root = group_root();
    let group = root.0.id() as libc::pid_t;
    let mut member = OwnedChild(
        Command::new("/bin/sleep")
            .arg("60")
            .process_group(group)
            .spawn()
            .unwrap(),
    );
    let mut ownership = ChildOwnership::claim(&mut root.0).unwrap();
    root.0.kill().unwrap();
    root.0.wait().unwrap();
    assert!(ownership.has_live_members(&root.0).unwrap());
    assert_eq!(
        unsafe { libc::kill(member.0.id() as libc::pid_t, libc::SIGSTOP) },
        0
    );
    let mut info = std::mem::MaybeUninit::<libc::siginfo_t>::uninit();
    assert_eq!(
        unsafe {
            libc::waitid(
                libc::P_PID,
                member.0.id() as libc::id_t,
                info.as_mut_ptr(),
                libc::WSTOPPED | libc::WNOWAIT,
            )
        },
        0
    );
    assert!(
        ownership.has_live_members(&root.0).unwrap(),
        "stopped members are still live"
    );
    member.0.kill().unwrap();
    member.0.wait().unwrap();
    assert!(!ownership.has_live_members(&root.0).unwrap());
    ownership.disarm();
}
