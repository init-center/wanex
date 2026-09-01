use crate::atomic_file::open_path_write_lock_file;
use crate::Result;
use serde::Serialize;
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
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

pub(crate) fn workspace_mutation_lock_path(root: &Path) -> Result<PathBuf> {
    let git_marker = root.join(".git");
    match fs::metadata(&git_marker) {
        Ok(metadata) if metadata.is_dir() => {
            Ok(fs::canonicalize(git_marker)?.join("wanex-workspace-mutation.lock"))
        }
        // A linked worktree's .git is a marker file whose target lives outside
        // the execution root. Lock the marker itself so task-local mutation
        // does not require access to shared Git administration data.
        Ok(metadata) if metadata.is_file() => Ok(git_marker),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(root
            .join(".wanex")
            .join("locks")
            .join("workspace-mutation.lock")),
        Ok(_) => Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Git marker is neither a directory nor a regular file",
        )
        .into()),
        Err(error) => Err(error.into()),
    }
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
    use super::{hold_workspace_lock, workspace_mutation_lock_path};
    use crate::atomic_file::acquire_path_write_lock;
    use std::fs;
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

    #[test]
    fn git_workspace_uses_the_common_git_lock() {
        let root = tempdir().unwrap();
        fs::create_dir(root.path().join(".git")).unwrap();
        let lock = workspace_mutation_lock_path(root.path()).unwrap();
        assert_eq!(
            lock,
            fs::canonicalize(root.path().join(".git"))
                .unwrap()
                .join("wanex-workspace-mutation.lock")
        );
    }

    #[test]
    fn linked_worktree_uses_its_marker_as_a_local_lock() {
        let fixture = tempdir().unwrap();
        let root = fixture.path().join("worktree");
        let git_dir = fixture
            .path()
            .join("repository.git")
            .join("worktrees")
            .join("task");
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&git_dir).unwrap();
        fs::write(
            root.join(".git"),
            format!("gitdir: {}\n", git_dir.display()),
        )
        .unwrap();
        assert_eq!(
            workspace_mutation_lock_path(&root).unwrap(),
            root.join(".git")
        );
    }

    #[test]
    fn non_git_workspace_keeps_a_root_local_lock() {
        let root = tempdir().unwrap();
        assert_eq!(
            workspace_mutation_lock_path(root.path()).unwrap(),
            root.path()
                .join(".wanex")
                .join("locks")
                .join("workspace-mutation.lock")
        );
    }
}
