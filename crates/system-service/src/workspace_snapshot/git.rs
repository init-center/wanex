use super::TemporaryDirectory;
use crate::{Result, SystemServiceError};
use std::fs;
use std::path::Path;
use std::process::Command;

pub(super) fn git_command(root: &Path, git_bin: &str) -> Command {
    let mut command = Command::new(git_bin);
    // Snapshot worktrees must preserve the committed byte content exactly.
    command
        .arg("-c")
        .arg("core.autocrlf=false")
        .args([
            "-c",
            if cfg!(windows) {
                "core.hooksPath=NUL"
            } else {
                "core.hooksPath=/dev/null"
            },
        ])
        .args([
            "-c",
            "core.fsmonitor=false",
            "-c",
            "core.untrackedCache=false",
        ])
        .args(["-c", "gc.auto=0", "-c", "maintenance.auto=false"])
        .args(["-c", "protocol.allow=never", "-c", "commit.gpgsign=false"])
        .arg("-C")
        .arg(root);
    command.env("GIT_TERMINAL_PROMPT", "0");
    command
}

pub(super) fn reject_executable_filters(root: &Path, git_bin: &str, parent: &Path) -> Result<()> {
    let output = git_command(root, git_bin)
        .args([
            "config",
            "--null",
            "--get-regexp",
            r"^filter\..*\.(clean|smudge|process)$",
        ])
        .output()?;
    if output.status.code() == Some(1) {
        return Ok(());
    }
    if !output.status.success() {
        return Err(SystemServiceError::Conflict(
            "cannot inspect workspace Git filter configuration".into(),
        ));
    }
    let config = String::from_utf8(output.stdout).map_err(|_| {
        SystemServiceError::Conflict("invalid workspace Git filter configuration".into())
    })?;
    let mut drivers = std::collections::HashSet::new();
    for entry in config.split('\0').filter(|entry| !entry.is_empty()) {
        let Some((key, value)) = entry.split_once('\n') else {
            return Err(SystemServiceError::Conflict(
                "invalid workspace Git filter configuration".into(),
            ));
        };
        if !value.trim().is_empty() {
            let driver = key
                .strip_prefix("filter.")
                .and_then(|key| key.rsplit_once('.'))
                .ok_or_else(|| {
                    SystemServiceError::Conflict("invalid workspace Git filter key".into())
                })?
                .0;
            drivers.insert(driver);
        }
    }
    if drivers.is_empty() {
        return Ok(());
    }
    let paths = git_command(root, git_bin)
        .args([
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "-z",
        ])
        .output()?;
    if !paths.status.success() {
        return Err(SystemServiceError::Conflict(
            "cannot inspect workspace Git paths".into(),
        ));
    }
    // A file-backed stdin avoids pipe deadlocks for large repositories and preserves NUL-delimited paths.
    let temp = TemporaryDirectory::new(parent)?;
    let input = temp.path.join("paths");
    fs::write(&input, paths.stdout)?;
    let attributes = git_command(root, git_bin)
        .args(["check-attr", "-z", "--stdin", "filter"])
        .stdin(fs::File::open(input)?)
        .output()?;
    if !attributes.status.success() {
        return Err(SystemServiceError::Conflict(
            "cannot inspect workspace Git attributes".into(),
        ));
    }
    let attributes = String::from_utf8(attributes.stdout)
        .map_err(|_| SystemServiceError::Conflict("invalid workspace Git attributes".into()))?;
    let fields: Vec<&str> = attributes
        .strip_suffix('\0')
        .unwrap_or(&attributes)
        .split('\0')
        .collect();
    if attributes.is_empty() {
        return Ok(());
    }
    if !fields.len().is_multiple_of(3) {
        return Err(SystemServiceError::Conflict(
            "invalid workspace Git attributes".into(),
        ));
    }
    for fields in fields.as_chunks::<3>().0 {
        if fields[1] != "filter" {
            return Err(SystemServiceError::Conflict(
                "invalid workspace Git attribute name".into(),
            ));
        }
        if drivers.contains(fields[2]) {
            return Err(SystemServiceError::Conflict(
                "executable Git filters are not supported by controlled workspace snapshots".into(),
            ));
        }
    }
    Ok(())
}
