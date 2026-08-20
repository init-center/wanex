use crate::atomic_file::open_path_write_lock_file;
use crate::Result;
use serde::Serialize;
use std::io::{self, Write};
use std::path::Path;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::thread;
use std::time::Duration;

const LOCK_RETRY_INTERVAL: Duration = Duration::from_millis(10);

#[derive(Serialize)]
struct WorkspaceLockAcquired {
    protocol: u8,
    kind: &'static str,
}

pub fn run_workspace_lock_helper(lock_path: &Path) -> Result<()> {
    let (control_sender, control_receiver) = mpsc::channel();
    let control_thread = thread::Builder::new()
        .name("wanex-workspace-lock-control".to_string())
        .spawn(move || {
            let mut stdin = io::stdin();
            let result = io::copy(&mut stdin, &mut io::sink()).map(|_| ());
            let _ = control_sender.send(result);
        })?;
    let stdout = io::stdout();
    let result = hold_workspace_lock(lock_path, &control_receiver, stdout.lock());
    if result.is_ok() {
        control_thread.join().map_err(|_| {
            io::Error::other("workspace lock control thread terminated unexpectedly")
        })?;
    }
    result
}

fn hold_workspace_lock(
    lock_path: &Path,
    control: &Receiver<io::Result<()>>,
    mut output: impl Write,
) -> Result<()> {
    let lock = open_path_write_lock_file(lock_path)?;
    loop {
        match lock.try_lock() {
            Ok(()) => break,
            Err(std::fs::TryLockError::WouldBlock) => {
                match control.recv_timeout(LOCK_RETRY_INTERVAL) {
                    Ok(result) => return Ok(result?),
                    Err(RecvTimeoutError::Timeout) => {}
                    Err(RecvTimeoutError::Disconnected) => {
                        return Err(io::Error::new(
                            io::ErrorKind::BrokenPipe,
                            "workspace lock control channel disconnected",
                        )
                        .into());
                    }
                }
            }
            Err(std::fs::TryLockError::Error(error)) => return Err(error.into()),
        }
    }
    serde_json::to_writer(
        &mut output,
        &WorkspaceLockAcquired {
            protocol: 1,
            kind: "workspace_lock_acquired",
        },
    )?;
    output.write_all(b"\n")?;
    output.flush()?;
    match control.recv() {
        Ok(result) => Ok(result?),
        Err(_) => Err(io::Error::new(
            io::ErrorKind::BrokenPipe,
            "workspace lock control channel disconnected",
        )
        .into()),
    }
}

#[cfg(test)]
mod tests {
    use super::hold_workspace_lock;
    use crate::atomic_file::acquire_path_write_lock;
    use std::sync::mpsc;
    use tempfile::tempdir;

    #[test]
    fn acquisition_uses_a_versioned_single_line_protocol() {
        let dir = tempdir().unwrap();
        let lock_path = dir.path().join("locks/workspace mutation.lock");
        let mut output = Vec::new();
        let (sender, receiver) = mpsc::channel();
        sender.send(Ok(())).unwrap();

        hold_workspace_lock(&lock_path, &receiver, &mut output).unwrap();

        assert_eq!(
            String::from_utf8(output).unwrap(),
            "{\"protocol\":1,\"kind\":\"workspace_lock_acquired\"}\n"
        );
        assert!(lock_path.exists());
    }

    #[test]
    fn closed_control_cancels_a_waiter_before_it_acquires() {
        let dir = tempdir().unwrap();
        let lock_path = dir.path().join("locks/workspace.lock");
        let owner = acquire_path_write_lock(&lock_path).unwrap();
        let (sender, receiver) = mpsc::channel();
        sender.send(Ok(())).unwrap();
        let mut output = Vec::new();

        hold_workspace_lock(&lock_path, &receiver, &mut output).unwrap();

        assert!(output.is_empty());
        drop(owner);
    }
}
