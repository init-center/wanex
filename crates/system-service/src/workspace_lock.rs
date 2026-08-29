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
const MAX_GIT_PATH_BYTES: u64 = 4_096;

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
        Ok(metadata) if metadata.is_file() => {
            let git_dir = git_directory_from_marker(root, &git_marker)?;
            let common_dir_marker = git_dir.join("commondir");
            let common_dir = match fs::metadata(&common_dir_marker) {
                Ok(metadata) if metadata.is_file() => {
                    resolve_git_path(&git_dir, &read_bounded_git_path(&common_dir_marker)?)?
                }
                Err(error) if error.kind() == io::ErrorKind::NotFound => git_dir,
                Ok(_) => {
                    return Err(io::Error::new(
                        io::ErrorKind::InvalidData,
                        "Git commondir marker is not a regular file",
                    )
                    .into())
                }
                Err(error) => return Err(error.into()),
            };
            Ok(common_dir.join("wanex-workspace-mutation.lock"))
        }
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

fn git_directory_from_marker(root: &Path, marker: &Path) -> Result<PathBuf> {
    let value = read_bounded_git_path(marker)?;
    let path = value.strip_prefix("gitdir: ").ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidData,
            "Git directory marker is invalid",
        )
    })?;
    resolve_git_path(root, path)
}

fn read_bounded_git_path(path: &Path) -> Result<String> {
    if fs::metadata(path)?.len() > MAX_GIT_PATH_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Git path marker exceeded its limit",
        )
        .into());
    }
    let value = fs::read_to_string(path)?;
    let value = value.trim_end_matches(['\r', '\n']);
    if value.is_empty() || value.contains('\n') || value.contains('\r') {
        return Err(
            io::Error::new(io::ErrorKind::InvalidData, "Git path marker is invalid").into(),
        );
    }
    Ok(value.to_string())
}

fn resolve_git_path(base: &Path, value: &str) -> Result<PathBuf> {
    let path = Path::new(value);
    let path = if path.is_absolute() {
        path.to_path_buf()
    } else {
        base.join(path)
    };
    let path = fs::canonicalize(path)?;
    if !path.is_dir() {
        return Err(
            io::Error::new(io::ErrorKind::NotADirectory, "Git path is not a directory").into(),
        );
    }
    Ok(path)
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
    fn linked_worktree_resolves_its_common_git_lock() {
        let fixture = tempdir().unwrap();
        let root = fixture.path().join("worktree");
        let common = fixture.path().join("repository.git");
        let git_dir = common.join("worktrees").join("task");
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&git_dir).unwrap();
        fs::write(
            root.join(".git"),
            format!("gitdir: {}\n", git_dir.display()),
        )
        .unwrap();
        fs::write(git_dir.join("commondir"), "../..\n").unwrap();

        assert_eq!(
            workspace_mutation_lock_path(&root).unwrap(),
            fs::canonicalize(common)
                .unwrap()
                .join("wanex-workspace-mutation.lock")
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
