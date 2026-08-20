use crate::atomic_file::acquire_path_write_lock;
use crate::{Result, SystemServiceError};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use uuid::Uuid;

const PROTOCOL: u8 = 1;

#[derive(Debug, Serialize)]
struct CreatedFrame {
    protocol: u8,
    kind: &'static str,
    isolation_id: String,
    base_revision: String,
    runtime_ref: String,
    root_dir: String,
}

#[derive(Debug, Serialize)]
struct ReleasedFrame {
    protocol: u8,
    kind: &'static str,
}

pub fn run_workspace_snapshot_helper(
    repository_root: &Path,
    worktree_parent: &Path,
    isolation_id: &str,
    git_bin: &str,
    release: bool,
    expected_base_revision: Option<&str>,
) -> Result<()> {
    require_absolute(repository_root, "workspace snapshot repository root")?;
    require_absolute(worktree_parent, "workspace snapshot worktree parent")?;
    require_isolation_id(isolation_id)?;
    if git_bin.is_empty() {
        return Err(SystemServiceError::InvalidInput(
            "workspace snapshot git binary must not be empty".to_string(),
        ));
    }

    let repository_root = fs::canonicalize(repository_root)?;
    if !repository_root.is_dir() {
        return Err(SystemServiceError::InvalidInput(
            "workspace snapshot repository root is not a directory".to_string(),
        ));
    }
    let worktree_parent = canonicalize_parent(worktree_parent)?;
    if same_or_child(&repository_root, &worktree_parent) {
        return Err(SystemServiceError::InvalidInput(
            "workspace snapshot worktree parent must be outside the repository".to_string(),
        ));
    }

    verify_repository(&repository_root, git_bin)?;
    let git_common_dir = git_common_dir(&repository_root, git_bin)?;
    let lock_path = git_common_dir.join("wanex-workspace-mutation.lock");
    let _lock = acquire_path_write_lock(&lock_path)?;
    verify_repository(&repository_root, git_bin)?;

    let identity = runtime_identity(&worktree_parent, isolation_id);
    if release {
        release_snapshot(&repository_root, &identity, git_bin, expected_base_revision)?;
        println!(
            "{}",
            serde_json::to_string(&ReleasedFrame {
                protocol: PROTOCOL,
                kind: "workspace_snapshot_released",
            })?
        );
        return Ok(());
    }

    let snapshot = create_snapshot(&repository_root, &identity, git_bin)?;
    println!("{}", serde_json::to_string(&snapshot)?);
    Ok(())
}

#[derive(Debug)]
struct RuntimeIdentity {
    isolation_id: String,
    branch: String,
    ref_name: String,
    root: PathBuf,
}

fn runtime_identity(worktree_parent: &Path, isolation_id: &str) -> RuntimeIdentity {
    let hash = hex_digest(isolation_id.as_bytes());
    let short_hash = hash[..32].to_string();
    let branch = format!("wanex/runtime/{short_hash}");
    RuntimeIdentity {
        isolation_id: isolation_id.to_string(),
        ref_name: format!("refs/heads/{branch}"),
        root: worktree_parent.join(format!("wanex-{short_hash}")),
        branch,
    }
}

fn create_snapshot(
    repository_root: &Path,
    identity: &RuntimeIdentity,
    git_bin: &str,
) -> Result<CreatedFrame> {
    let root_exists = identity.root.exists();
    let branch_exists = git_success(
        repository_root,
        git_bin,
        &["show-ref", "--verify", "--quiet", &identity.ref_name],
        &[],
    )?;
    match (root_exists, branch_exists) {
        (true, true) => {
            let base_revision = verify_existing_worktree(repository_root, identity, git_bin)?;
            return Ok(frame(identity, base_revision));
        }
        (true, false) | (false, true) => {
            return Err(SystemServiceError::Conflict(
                "workspace snapshot runtime resource is only partially present".to_string(),
            ));
        }
        (false, false) => {}
    }

    let head = git_output(repository_root, git_bin, &["rev-parse", "HEAD"], &[])?;
    let temp = TemporaryDirectory::new()?;
    let index = temp.path.join("index");
    let index_env = vec![("GIT_INDEX_FILE".to_string(), git_path_arg(&index))];
    git_output(repository_root, git_bin, &["read-tree", "HEAD"], &index_env)?;
    git_output(
        repository_root,
        git_bin,
        &["add", "-A", "--", "."],
        &index_env,
    )?;
    reject_special_objects(repository_root, git_bin, &index_env)?;
    let tree = git_output(repository_root, git_bin, &["write-tree"], &index_env)?;
    let index_file = index.to_string_lossy().into_owned();
    let commit = git_output(
        repository_root,
        git_bin,
        &[
            "commit-tree",
            &tree,
            "-p",
            &head,
            "-m",
            "Wanex workspace snapshot",
        ],
        &[
            ("GIT_AUTHOR_NAME".to_string(), "Wanex Workspace".to_string()),
            (
                "GIT_AUTHOR_EMAIL".to_string(),
                "workspace@wanex.invalid".to_string(),
            ),
            (
                "GIT_COMMITTER_NAME".to_string(),
                "Wanex Workspace".to_string(),
            ),
            (
                "GIT_COMMITTER_EMAIL".to_string(),
                "workspace@wanex.invalid".to_string(),
            ),
            ("GIT_INDEX_FILE".to_string(), index_file),
        ],
    )?;
    git_output(
        repository_root,
        git_bin,
        &["update-ref", &identity.ref_name, &commit],
        &[],
    )?;
    if let Err(error) = git_output(
        repository_root,
        git_bin,
        &[
            "worktree",
            "add",
            &git_path_arg(&identity.root),
            &identity.branch,
        ],
        &[],
    ) {
        let _ = git_output(
            repository_root,
            git_bin,
            &["update-ref", "-d", &identity.ref_name, &commit],
            &[],
        );
        return Err(error);
    }
    Ok(frame(identity, commit))
}

fn release_snapshot(
    repository_root: &Path,
    identity: &RuntimeIdentity,
    git_bin: &str,
    expected_base_revision: Option<&str>,
) -> Result<()> {
    let branch_exists = git_success(
        repository_root,
        git_bin,
        &["show-ref", "--verify", "--quiet", &identity.ref_name],
        &[],
    )?;
    if identity.root.exists() {
        let actual = verify_existing_worktree(repository_root, identity, git_bin)?;
        if expected_base_revision.is_some_and(|expected| expected != actual) {
            return Err(SystemServiceError::Conflict(
                "workspace snapshot runtime ref changed externally".to_string(),
            ));
        }
        git_output(
            repository_root,
            git_bin,
            &[
                "worktree",
                "remove",
                "--force",
                &git_path_arg(&identity.root),
            ],
            &[],
        )?;
    } else if branch_exists {
        let actual = git_output(
            repository_root,
            git_bin,
            &["rev-parse", "--verify", &identity.ref_name],
            &[],
        )?;
        if expected_base_revision.is_some_and(|expected| expected != actual) {
            return Err(SystemServiceError::Conflict(
                "workspace snapshot runtime ref changed externally".to_string(),
            ));
        }
    } else {
        return Ok(());
    }
    if branch_exists {
        let expected = expected_base_revision.unwrap_or("");
        if expected.is_empty() {
            git_output(
                repository_root,
                git_bin,
                &["update-ref", "-d", &identity.ref_name],
                &[],
            )?;
        } else {
            git_output(
                repository_root,
                git_bin,
                &["update-ref", "-d", &identity.ref_name, expected],
                &[],
            )?;
        }
    }
    let _ = git_output(repository_root, git_bin, &["worktree", "prune"], &[])?;
    Ok(())
}

fn verify_existing_worktree(
    repository_root: &Path,
    identity: &RuntimeIdentity,
    git_bin: &str,
) -> Result<String> {
    let base_revision = git_output(
        repository_root,
        git_bin,
        &["rev-parse", "--verify", &identity.ref_name],
        &[],
    )?;
    let worktree = git_output(
        repository_root,
        git_bin,
        &["worktree", "list", "--porcelain"],
        &[],
    )?;
    let expected_path = normalized_git_path(&identity.root);
    let mut found = false;
    let mut current_path: Option<String> = None;
    let mut current_branch: Option<String> = None;
    for line in worktree.lines() {
        if let Some(path) = line.strip_prefix("worktree ") {
            if current_path
                .as_deref()
                .is_some_and(|path| same_git_path(path, &expected_path))
                && current_branch.as_deref() == Some(identity.ref_name.as_str())
            {
                found = true;
            }
            current_path = Some(path.to_string());
            current_branch = None;
        } else if let Some(branch) = line.strip_prefix("branch ") {
            current_branch = Some(branch.to_string());
        }
    }
    if current_path
        .as_deref()
        .is_some_and(|path| same_git_path(path, &expected_path))
        && current_branch.as_deref() == Some(identity.ref_name.as_str())
    {
        found = true;
    }
    if !found {
        return Err(SystemServiceError::Conflict(
            "workspace snapshot worktree identity cannot be proven".to_string(),
        ));
    }
    Ok(base_revision)
}

fn frame(identity: &RuntimeIdentity, base_revision: String) -> CreatedFrame {
    CreatedFrame {
        protocol: PROTOCOL,
        kind: "workspace_snapshot_created",
        isolation_id: identity.isolation_id.clone(),
        base_revision,
        runtime_ref: identity.branch.clone(),
        root_dir: normalized_git_path(&identity.root),
    }
}

fn verify_repository(root: &Path, git_bin: &str) -> Result<()> {
    let reported = git_output(root, git_bin, &["rev-parse", "--show-toplevel"], &[])?;
    let reported = fs::canonicalize(reported)?;
    if reported != root {
        return Err(SystemServiceError::Conflict(
            "workspace snapshot repository identity changed".to_string(),
        ));
    }
    Ok(())
}

fn git_common_dir(root: &Path, git_bin: &str) -> Result<PathBuf> {
    let reported = git_output(root, git_bin, &["rev-parse", "--git-common-dir"], &[])?;
    let path = Path::new(&reported);
    let path = if path.is_absolute() {
        path.to_path_buf()
    } else {
        root.join(path)
    };
    Ok(fs::canonicalize(path)?)
}

fn reject_special_objects(
    root: &Path,
    git_bin: &str,
    index_env: &[(String, String)],
) -> Result<()> {
    let entries = git_output(root, git_bin, &["ls-files", "--stage", "-z"], index_env)?;
    for entry in entries.split('\0').filter(|entry| !entry.is_empty()) {
        let metadata = entry
            .split_once('\t')
            .map(|(metadata, _)| metadata)
            .ok_or_else(|| {
                SystemServiceError::Conflict(
                    "workspace snapshot index entry could not be classified".to_string(),
                )
            })?;
        let mode = metadata.split_whitespace().next().unwrap_or_default();
        if matches!(mode, "120000" | "160000") {
            return Err(SystemServiceError::Conflict(
                "workspace snapshot contains an unsupported special Git object".to_string(),
            ));
        }
    }
    Ok(())
}

fn git_output(
    root: &Path,
    git_bin: &str,
    args: &[&str],
    envs: &[(String, String)],
) -> Result<String> {
    let mut command = Command::new(git_bin);
    command.arg("-C").arg(root).args(args);
    command.env("GIT_TERMINAL_PROMPT", "0");
    for (key, value) in envs {
        command.env(key, value);
    }
    let output = command.output()?;
    if !output.status.success() {
        return Err(SystemServiceError::Conflict(format!(
            "workspace snapshot git operation failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        )));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn git_success(
    root: &Path,
    git_bin: &str,
    args: &[&str],
    envs: &[(String, String)],
) -> Result<bool> {
    let mut command = Command::new(git_bin);
    command.arg("-C").arg(root).args(args);
    command.env("GIT_TERMINAL_PROMPT", "0");
    for (key, value) in envs {
        command.env(key, value);
    }
    let output = command.output()?;
    if output.status.success() {
        Ok(true)
    } else if output.status.code() == Some(1) {
        Ok(false)
    } else {
        Err(SystemServiceError::Conflict(format!(
            "workspace snapshot git probe failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        )))
    }
}

fn canonicalize_parent(path: &Path) -> Result<PathBuf> {
    fs::create_dir_all(path)?;
    Ok(fs::canonicalize(path)?)
}

fn same_or_child(parent: &Path, child: &Path) -> bool {
    child == parent || child.strip_prefix(parent).is_ok()
}

fn normalized_git_path(path: &Path) -> String {
    git_path_arg(path).replace('\\', "/")
}

fn same_git_path(actual: &str, expected: &str) -> bool {
    let actual = normalize_git_string(actual);
    let expected = normalize_git_string(expected);
    #[cfg(windows)]
    {
        actual.eq_ignore_ascii_case(&expected)
    }
    #[cfg(not(windows))]
    {
        actual == expected
    }
}

fn normalize_git_string(value: &str) -> String {
    let value = value.replace('\\', "/");
    #[cfg(windows)]
    {
        if let Some(path) = value.strip_prefix("//?/UNC/") {
            return format!("//{path}");
        }
        if let Some(path) = value.strip_prefix("//?/") {
            return path.to_string();
        }
    }
    value
}

fn git_path_arg(path: &Path) -> String {
    let value = path.to_string_lossy();
    #[cfg(windows)]
    {
        if let Some(path) = value.strip_prefix("\\\\?\\UNC\\") {
            return format!("\\\\{path}");
        }
        if let Some(path) = value.strip_prefix("\\\\?\\") {
            return path.to_string();
        }
    }
    value.into_owned()
}

fn require_absolute(path: &Path, label: &str) -> Result<()> {
    if !path.is_absolute() {
        return Err(SystemServiceError::InvalidInput(format!(
            "{label} must be absolute"
        )));
    }
    Ok(())
}

fn require_isolation_id(value: &str) -> Result<()> {
    if value.is_empty()
        || value.len() > 256
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-' | b'.' | b':'))
    {
        return Err(SystemServiceError::InvalidInput(
            "workspace snapshot isolation id is invalid".to_string(),
        ));
    }
    Ok(())
}

struct TemporaryDirectory {
    path: PathBuf,
}

impl TemporaryDirectory {
    fn new() -> Result<Self> {
        let path = env::temp_dir().join(format!("wanex-index-{}", Uuid::now_v7()));
        fs::create_dir(&path)?;
        Ok(Self { path })
    }
}

impl Drop for TemporaryDirectory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

fn hex_digest(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{normalized_git_path, same_git_path};
    use std::path::Path;

    #[test]
    fn normalizes_git_paths_to_forward_slashes() {
        assert_eq!(
            normalized_git_path(Path::new("/tmp/wanex-worktree")),
            "/tmp/wanex-worktree"
        );
        assert!(same_git_path("/tmp/wanex-worktree", "/tmp/wanex-worktree"));
    }

    #[cfg(windows)]
    #[test]
    fn removes_windows_extended_prefix_at_git_boundary() {
        let path = Path::new(r"\\?\C:\Users\runner\wanex-worktree");
        assert_eq!(normalized_git_path(path), "C:/Users/runner/wanex-worktree");
        assert!(same_git_path(
            "C:/Users/runner/wanex-worktree",
            "//?/C:/Users/runner/wanex-worktree"
        ));

        let unc = Path::new(r"\\?\UNC\server\share\wanex-worktree");
        assert_eq!(normalized_git_path(unc), "//server/share/wanex-worktree");
        assert!(same_git_path(
            "//server/share/wanex-worktree",
            "//?/UNC/server/share/wanex-worktree"
        ));
    }
}
