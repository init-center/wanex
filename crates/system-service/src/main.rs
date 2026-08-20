mod generated;
mod rpc;

use serde_json::Value;
use std::env;
use std::path::PathBuf;
use wanex_system_service::{
    run_workspace_child_helper, run_workspace_lock_helper, run_workspace_snapshot_helper,
    run_workspace_transaction_helper, SystemServiceError,
};

fn main() {
    let args = match parse_args() {
        Ok(args) => args,
        Err(error) => {
            print_response(rpc::response_for_result(None, Err(error)).response);
            std::process::exit(1);
        }
    };

    match args {
        CliArgs::Storage { store_dir, serve } => {
            if serve {
                if let Err(error) = rpc::run_serve(store_dir) {
                    print_response(rpc::response_for_result(None, Err(error)).response);
                    std::process::exit(1);
                }
                return;
            }

            let output = rpc::run_once(store_dir);
            print_response(output.response);
            if !output.ok {
                std::process::exit(1);
            }
        }
        CliArgs::WorkspaceLock { lock_path } => {
            if let Err(error) = run_workspace_lock_helper(&lock_path) {
                eprintln!("workspace lock helper failed: {error}");
                std::process::exit(1);
            }
        }
        CliArgs::WorkspaceTransaction {
            root,
            transaction_id,
        } => {
            if let Err(error) = run_workspace_transaction_helper(&root, &transaction_id) {
                eprintln!("workspace transaction helper failed: {error}");
                std::process::exit(1);
            }
        }
        CliArgs::WorkspaceSnapshot {
            root,
            worktree_parent,
            isolation,
            git,
            release,
            base_revision,
        } => {
            if let Err(error) = run_workspace_snapshot_helper(
                &root,
                &worktree_parent,
                &isolation,
                &git,
                release,
                base_revision.as_deref(),
            ) {
                eprintln!("workspace snapshot helper failed: {error}");
                std::process::exit(1);
            }
        }
        CliArgs::WorkspaceChild => {
            if let Err(error) = run_workspace_child_helper() {
                eprintln!("workspace child helper failed: {error}");
                std::process::exit(1);
            }
        }
    }
}

#[derive(Debug)]
enum CliArgs {
    Storage {
        store_dir: PathBuf,
        serve: bool,
    },
    WorkspaceLock {
        lock_path: PathBuf,
    },
    WorkspaceTransaction {
        root: PathBuf,
        transaction_id: String,
    },
    WorkspaceSnapshot {
        root: PathBuf,
        worktree_parent: PathBuf,
        isolation: String,
        git: String,
        release: bool,
        base_revision: Option<String>,
    },
    WorkspaceChild,
}

fn parse_args() -> Result<CliArgs, SystemServiceError> {
    parse_args_from(env::args().skip(1))
}

fn parse_args_from(args: impl IntoIterator<Item = String>) -> Result<CliArgs, SystemServiceError> {
    let mut args = args.into_iter();
    let mut store_dir: Option<PathBuf> = None;
    let mut workspace_lock: Option<PathBuf> = None;
    let mut workspace_transaction = false;
    let mut workspace_root: Option<PathBuf> = None;
    let mut transaction_id: Option<String> = None;
    let mut workspace_snapshot = false;
    let mut snapshot_parent: Option<PathBuf> = None;
    let mut snapshot_isolation: Option<String> = None;
    let mut snapshot_git = String::from("git");
    let mut snapshot_release = false;
    let mut snapshot_base_revision: Option<String> = None;
    let mut workspace_child = false;
    let mut serve = false;
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--store" => {
                let Some(path) = args.next() else {
                    return Err(SystemServiceError::InvalidLogicalPath(
                        "missing value for --store".to_string(),
                    ));
                };
                store_dir = Some(PathBuf::from(path));
            }
            "--serve" => {
                serve = true;
            }
            "--workspace-lock" => {
                let Some(path) = args.next() else {
                    return Err(SystemServiceError::InvalidLogicalPath(
                        "missing value for --workspace-lock".to_string(),
                    ));
                };
                workspace_lock = Some(PathBuf::from(path));
            }
            "--workspace-transaction" => {
                workspace_transaction = true;
            }
            "--root" => {
                let Some(path) = args.next() else {
                    return Err(SystemServiceError::InvalidLogicalPath(
                        "missing value for --root".to_string(),
                    ));
                };
                workspace_root = Some(PathBuf::from(path));
            }
            "--transaction" => {
                let Some(id) = args.next() else {
                    return Err(SystemServiceError::InvalidLogicalPath(
                        "missing value for --transaction".to_string(),
                    ));
                };
                transaction_id = Some(id);
            }
            "--workspace-snapshot" => workspace_snapshot = true,
            "--workspace-child" => workspace_child = true,
            "--worktree-parent" => {
                let Some(path) = args.next() else {
                    return Err(SystemServiceError::InvalidLogicalPath(
                        "missing value for --worktree-parent".to_string(),
                    ));
                };
                snapshot_parent = Some(PathBuf::from(path));
            }
            "--isolation" => {
                let Some(id) = args.next() else {
                    return Err(SystemServiceError::InvalidLogicalPath(
                        "missing value for --isolation".to_string(),
                    ));
                };
                snapshot_isolation = Some(id);
            }
            "--git" => {
                let Some(path) = args.next() else {
                    return Err(SystemServiceError::InvalidLogicalPath(
                        "missing value for --git".to_string(),
                    ));
                };
                snapshot_git = path;
            }
            "--release" => snapshot_release = true,
            "--base-revision" => snapshot_base_revision = args.next(),
            _ => {
                return Err(SystemServiceError::InvalidLogicalPath(format!(
                    "unknown argument: {arg}"
                )));
            }
        }
    }
    match (
        store_dir,
        workspace_lock,
        workspace_transaction,
        workspace_root,
        transaction_id,
    ) {
        (Some(store_dir), None, false, None, None)
            if !workspace_snapshot && !workspace_child =>
        {
            Ok(CliArgs::Storage { store_dir, serve })
        }
        (None, Some(lock_path), false, None, None)
            if !serve
                && !workspace_snapshot
                && !workspace_child
                && lock_path.is_absolute() =>
        {
            Ok(CliArgs::WorkspaceLock { lock_path })
        }
        (None, None, true, Some(root), Some(transaction_id))
            if !serve
                && !workspace_snapshot
                && !workspace_child
                && root.is_absolute()
                && !transaction_id.is_empty() =>
        {
            Ok(CliArgs::WorkspaceTransaction {
                root,
                transaction_id,
            })
        }
        (None, None, false, Some(root), None) if workspace_snapshot && !workspace_child => {
            let Some(worktree_parent) = snapshot_parent else {
                return Err(SystemServiceError::InvalidLogicalPath(
                    "workspace snapshot requires --worktree-parent".to_string(),
                ));
            };
            let Some(isolation) = snapshot_isolation else {
                return Err(SystemServiceError::InvalidLogicalPath(
                    "workspace snapshot requires --isolation".to_string(),
                ));
            };
            Ok(CliArgs::WorkspaceSnapshot {
                root,
                worktree_parent,
                isolation,
                git: snapshot_git,
                release: snapshot_release,
                base_revision: snapshot_base_revision,
            })
        }
        (None, None, false, None, None)
            if workspace_child && !workspace_snapshot && !serve =>
        {
            Ok(CliArgs::WorkspaceChild)
        }
        (None, Some(_), false, None, None) if serve => Err(SystemServiceError::InvalidLogicalPath(
            "--serve cannot be combined with --workspace-lock".to_string(),
        )),
        (None, Some(_), false, None, None) => Err(SystemServiceError::InvalidLogicalPath(
            "workspace lock path must be absolute".to_string(),
        )),
        _ => Err(SystemServiceError::InvalidLogicalPath(
            "usage: wanex-system-service (--store <dir> [--serve] | --workspace-lock <absolute-file> | --workspace-transaction --root <absolute-dir> --transaction <id> | --workspace-snapshot --root <absolute-dir> --worktree-parent <absolute-dir> --isolation <id> [--git <path>] [--release] [--base-revision <oid>] | --workspace-child)"
                .to_string(),
        )),
    }
}

fn print_response(response: Value) {
    println!(
        "{}",
        serde_json::to_string(&response).expect("response should serialize")
    );
}

#[cfg(test)]
mod tests {
    use super::{parse_args_from, CliArgs};

    #[test]
    fn parses_workspace_lock_mode_as_a_distinct_absolute_path_mode() {
        let parsed = parse_args_from([
            "--workspace-lock".to_string(),
            std::env::temp_dir()
                .join("wanex workspace.lock")
                .to_string_lossy()
                .into_owned(),
        ])
        .unwrap();
        assert!(matches!(parsed, CliArgs::WorkspaceLock { .. }));
    }

    #[test]
    fn rejects_mixed_storage_and_workspace_lock_modes() {
        let error = parse_args_from([
            "--store".to_string(),
            "store".to_string(),
            "--workspace-lock".to_string(),
            std::env::temp_dir()
                .join("workspace.lock")
                .to_string_lossy()
                .into_owned(),
        ])
        .unwrap_err();
        assert!(error.to_string().contains("usage:"));
    }

    #[test]
    fn parses_workspace_transaction_mode() {
        let parsed = parse_args_from([
            "--workspace-transaction".to_string(),
            "--root".to_string(),
            std::env::temp_dir().to_string_lossy().into_owned(),
            "--transaction".to_string(),
            "wtx_test".to_string(),
        ])
        .unwrap();
        assert!(matches!(parsed, CliArgs::WorkspaceTransaction { .. }));
    }

    #[test]
    fn parses_workspace_child_as_a_distinct_semantic_mode() {
        let parsed = parse_args_from(["--workspace-child".to_string()]).unwrap();
        assert!(matches!(parsed, CliArgs::WorkspaceChild));
    }

    #[test]
    fn rejects_workspace_child_mixed_with_storage_mode() {
        let error = parse_args_from([
            "--workspace-child".to_string(),
            "--store".to_string(),
            "store".to_string(),
        ])
        .unwrap_err();
        assert!(error.to_string().contains("usage:"));
    }
}
