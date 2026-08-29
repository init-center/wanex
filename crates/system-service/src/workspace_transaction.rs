use crate::atomic_file::{replace_file, sync_parent};
use crate::Result;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs::{self, OpenOptions};
use std::io::{self, BufRead, Write};
use std::path::{Component, Path, PathBuf};
use std::thread;
use std::time::Duration;

const PROTOCOL: u8 = 1;
const MAX_FRAME_BYTES: usize = 64 * 1024 * 1024;
const MAX_FILES: usize = 10_000;
const MAX_ATTEMPTS: u32 = 8;

#[derive(Debug, Deserialize)]
#[serde(tag = "command", rename_all = "snake_case")]
enum Command {
    Prepare {
        protocol: u8,
        transaction_id: String,
        files: Vec<FilePlan>,
    },
    Commit {
        protocol: u8,
        transaction_id: String,
        files: Vec<FilePlan>,
        ordinals: Vec<i64>,
    },
    Inspect {
        protocol: u8,
        transaction_id: String,
        files: Vec<FilePlan>,
    },
    Cleanup {
        protocol: u8,
        transaction_id: String,
        files: Vec<FilePlan>,
    },
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
struct FilePlan {
    ordinal: i64,
    path: String,
    before_sha256: Option<String>,
    after_text: Option<String>,
    after_sha256: Option<String>,
}

#[derive(Debug, Serialize)]
struct ReadyFrame {
    protocol: u8,
    kind: &'static str,
}

#[derive(Debug, Serialize)]
struct FileFrame<'a> {
    protocol: u8,
    kind: &'static str,
    transaction_id: &'a str,
    ordinal: i64,
    state: &'static str,
}

#[derive(Debug, Serialize)]
struct InspectionFrame<'a> {
    protocol: u8,
    kind: &'static str,
    transaction_id: &'a str,
    observations: Vec<Observation>,
}

#[derive(Debug, Serialize)]
struct Observation {
    ordinal: i64,
    current: &'static str,
    sha256: Option<String>,
}

#[derive(Debug, Serialize)]
struct DoneFrame<'a> {
    protocol: u8,
    kind: &'static str,
    transaction_id: &'a str,
}

type Progress<'a> = dyn FnMut(i64, &'static str) -> Result<()> + 'a;

pub fn run_workspace_transaction_helper(root: &Path, transaction_id: &str) -> Result<()> {
    let root = fs::canonicalize(root)?;
    if !root.is_dir() {
        return Err(io::Error::new(
            io::ErrorKind::NotADirectory,
            "workspace root is not a directory",
        )
        .into());
    }
    validate_transaction_argument(transaction_id)?;
    let lock_path = crate::workspace_lock::workspace_mutation_lock_path(&root)?;
    let stdin = io::stdin();
    let stdout = io::stdout();
    run_locked_transaction(
        &root,
        &lock_path,
        transaction_id,
        stdin.lock(),
        stdout.lock(),
    )
}

fn run_locked_transaction(
    root: &Path,
    lock_path: &Path,
    transaction_id: &str,
    mut input: impl BufRead,
    mut output: impl Write,
) -> Result<()> {
    let lock = crate::atomic_file::open_path_write_lock_file(lock_path)?;
    lock.lock()?;
    write_frame(
        &mut output,
        &ReadyFrame {
            protocol: PROTOCOL,
            kind: "workspace_transaction_ready",
        },
    )?;
    let mut prepared_plan: Option<Vec<FilePlan>> = None;

    loop {
        let Some(line) = read_bounded_line(&mut input)? else {
            return Ok(());
        };
        let command: Command = serde_json::from_str(&line)?;
        match command {
            Command::Prepare {
                protocol,
                transaction_id: actual,
                files,
            } => {
                validate_command(protocol, transaction_id, &actual, &files)?;
                if prepared_plan.as_ref().is_some_and(|plan| plan != &files) {
                    return Err(io::Error::new(
                        io::ErrorKind::InvalidData,
                        "workspace transaction prepare plan changed",
                    )
                    .into());
                }
                prepare_files(root, transaction_id, &files, &mut |ordinal, state| {
                    write_frame(
                        &mut output,
                        &FileFrame {
                            protocol: PROTOCOL,
                            kind: "workspace_transaction_file",
                            transaction_id,
                            ordinal,
                            state,
                        },
                    )
                })?;
                prepared_plan = Some(files);
                write_frame(
                    &mut output,
                    &DoneFrame {
                        protocol: PROTOCOL,
                        kind: "workspace_transaction_prepared",
                        transaction_id,
                    },
                )?;
            }
            Command::Commit {
                protocol,
                transaction_id: actual,
                files,
                ordinals,
            } => {
                validate_command(protocol, transaction_id, &actual, &files)?;
                if prepared_plan.as_ref() != Some(&files) {
                    return Err(io::Error::new(
                        io::ErrorKind::InvalidData,
                        "workspace transaction commit plan was not prepared",
                    )
                    .into());
                }
                commit_files(
                    root,
                    transaction_id,
                    &files,
                    &ordinals,
                    &mut |ordinal, state| {
                        write_frame(
                            &mut output,
                            &FileFrame {
                                protocol: PROTOCOL,
                                kind: "workspace_transaction_file",
                                transaction_id,
                                ordinal,
                                state,
                            },
                        )
                    },
                )?;
                write_frame(
                    &mut output,
                    &DoneFrame {
                        protocol: PROTOCOL,
                        kind: "workspace_transaction_committed",
                        transaction_id,
                    },
                )?;
            }
            Command::Inspect {
                protocol,
                transaction_id: actual,
                files,
            } => {
                validate_command(protocol, transaction_id, &actual, &files)?;
                write_frame(
                    &mut output,
                    &InspectionFrame {
                        protocol: PROTOCOL,
                        kind: "workspace_transaction_inspection",
                        transaction_id,
                        observations: inspect_files(root, &files)?,
                    },
                )?;
            }
            Command::Cleanup {
                protocol,
                transaction_id: actual,
                files,
            } => {
                validate_command(protocol, transaction_id, &actual, &files)?;
                cleanup_files(root, transaction_id, &files)?;
                write_frame(
                    &mut output,
                    &DoneFrame {
                        protocol: PROTOCOL,
                        kind: "workspace_transaction_cleaned",
                        transaction_id,
                    },
                )?;
                return Ok(());
            }
        }
    }
}

fn prepare_files(
    root: &Path,
    transaction_id: &str,
    files: &[FilePlan],
    progress: &mut Progress<'_>,
) -> Result<()> {
    for file in files {
        let destination = resolve_destination(root, &file.path)?;
        let current = read_current(&destination)?;
        match classify(
            current.as_deref(),
            file.before_sha256.as_deref(),
            file.after_sha256.as_deref(),
        ) {
            "before" => {
                if let Some(after_text) = file.after_text.as_deref() {
                    if let Some(parent) = destination.parent() {
                        fs::create_dir_all(parent)?;
                        validate_existing_ancestors(root, &file.path)?;
                    }
                    prepare_exact_temp(
                        &temp_path(&destination, transaction_id, file.ordinal)?,
                        after_text.as_bytes(),
                        file.after_sha256
                            .as_deref()
                            .expect("plan validation requires hash"),
                    )?;
                }
                progress(file.ordinal, "prepared")?;
            }
            "after" => progress(file.ordinal, "prepared")?,
            _ => {
                return Err(io::Error::new(
                    io::ErrorKind::AlreadyExists,
                    format!(
                        "workspace transaction preflight is ambiguous: {}",
                        file.path
                    ),
                )
                .into())
            }
        }
    }
    Ok(())
}

fn commit_files(
    root: &Path,
    transaction_id: &str,
    files: &[FilePlan],
    ordinals: &[i64],
    progress: &mut Progress<'_>,
) -> Result<()> {
    if ordinals.is_empty() || ordinals.len() > files.len() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "workspace transaction commit ordinals are empty or oversized",
        )
        .into());
    }
    let plans = files
        .iter()
        .map(|file| (file.ordinal, file))
        .collect::<BTreeMap<_, _>>();
    let mut seen = BTreeSet::new();
    let mut previous = None;
    for ordinal in ordinals {
        if !seen.insert(*ordinal) || previous.is_some_and(|value| value >= *ordinal) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "workspace transaction commit ordinals must be unique and increasing",
            )
            .into());
        }
        previous = Some(*ordinal);
        let file = plans.get(ordinal).ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::NotFound,
                format!("unknown workspace transaction ordinal: {ordinal}"),
            )
        })?;
        let destination = resolve_destination(root, &file.path)?;
        let current = read_current(&destination)?;
        match classify(
            current.as_deref(),
            file.before_sha256.as_deref(),
            file.after_sha256.as_deref(),
        ) {
            "after" => progress(*ordinal, "committed")?,
            "before" => {
                if file.after_text.is_some() {
                    let temp = temp_path(&destination, transaction_id, *ordinal)?;
                    validate_owned_file(
                        &temp,
                        file.after_sha256
                            .as_deref()
                            .expect("plan validation requires hash"),
                    )?;
                    replace_file(&temp, &destination)?;
                } else {
                    reject_existing_owned_path(&backup_path(
                        &destination,
                        transaction_id,
                        *ordinal,
                    )?)?;
                    move_with_retry(
                        &destination,
                        &backup_path(&destination, transaction_id, *ordinal)?,
                    )?;
                }
                progress(*ordinal, "committed")?;
            }
            _ => {
                return Err(io::Error::new(
                    io::ErrorKind::AlreadyExists,
                    format!("workspace transaction commit is ambiguous: {}", file.path),
                )
                .into())
            }
        }
    }
    Ok(())
}

fn inspect_files(root: &Path, files: &[FilePlan]) -> Result<Vec<Observation>> {
    let mut observations = Vec::with_capacity(files.len());
    for file in files {
        let destination = resolve_destination(root, &file.path)?;
        let current = read_current(&destination)?;
        observations.push(Observation {
            ordinal: file.ordinal,
            current: classify(
                current.as_deref(),
                file.before_sha256.as_deref(),
                file.after_sha256.as_deref(),
            ),
            sha256: current.as_deref().map(|text| sha256(text.as_bytes())),
        });
    }
    Ok(observations)
}

fn cleanup_files(root: &Path, transaction_id: &str, files: &[FilePlan]) -> Result<()> {
    for file in files {
        let destination = resolve_destination(root, &file.path)?;
        remove_exact_owned_file(
            &temp_path(&destination, transaction_id, file.ordinal)?,
            file.after_sha256.as_deref(),
        )?;
        remove_exact_owned_file(
            &backup_path(&destination, transaction_id, file.ordinal)?,
            if file.after_sha256.is_none() {
                file.before_sha256.as_deref()
            } else {
                None
            },
        )?;
    }
    Ok(())
}

fn validate_command(
    protocol: u8,
    expected_transaction_id: &str,
    actual_transaction_id: &str,
    files: &[FilePlan],
) -> Result<()> {
    if protocol != PROTOCOL {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "unsupported workspace transaction protocol",
        )
        .into());
    }
    if expected_transaction_id != actual_transaction_id {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "workspace transaction id mismatch",
        )
        .into());
    }
    validate_plans(files)
}

fn validate_plans(files: &[FilePlan]) -> Result<()> {
    if files.is_empty() || files.len() > MAX_FILES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "workspace transaction file count is invalid",
        )
        .into());
    }
    let mut ordinals = BTreeSet::new();
    let mut paths = BTreeSet::new();
    let mut previous_ordinal = None;
    for file in files {
        if file.ordinal < 0
            || previous_ordinal.is_some_and(|value| value >= file.ordinal)
            || !ordinals.insert(file.ordinal)
            || !paths.insert(file.path.as_str())
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "workspace transaction ordinals must be increasing and paths must be unique",
            )
            .into());
        }
        previous_ordinal = Some(file.ordinal);
        validate_relative_path(&file.path)?;
        if file
            .before_sha256
            .as_deref()
            .is_some_and(|hash| !is_sha256(hash))
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "workspace transaction before hash is invalid",
            )
            .into());
        }
        match (file.after_text.as_deref(), file.after_sha256.as_deref()) {
            (Some(text), Some(hash)) if sha256(text.as_bytes()) == hash => {}
            (None, None) => {}
            _ => {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "workspace transaction after text and hash do not match",
                )
                .into())
            }
        }
        if file.before_sha256.is_none() && file.after_sha256.is_none() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "workspace transaction file has no before or after evidence",
            )
            .into());
        }
    }
    Ok(())
}

fn resolve_destination(root: &Path, relative: &str) -> Result<PathBuf> {
    validate_relative_path(relative)?;
    validate_existing_ancestors(root, relative)?;
    Ok(root.join(relative))
}

fn validate_existing_ancestors(root: &Path, relative: &str) -> Result<()> {
    let mut current = root.to_path_buf();
    for component in Path::new(relative).components() {
        let Component::Normal(part) = component else {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "workspace path is not normalized",
            )
            .into());
        };
        current.push(part);
        match fs::symlink_metadata(&current) {
            Ok(metadata) if is_link_or_reparse_point(&metadata) => {
                return Err(io::Error::new(
                    io::ErrorKind::PermissionDenied,
                    format!(
                        "workspace transaction path crosses a symlink: {}",
                        current.display()
                    ),
                )
                .into())
            }
            Ok(_) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => break,
            Err(error) => return Err(error.into()),
        }
    }
    Ok(())
}

fn validate_relative_path(path: &str) -> Result<()> {
    if path.is_empty()
        || path.starts_with('/')
        || path.ends_with('/')
        || path.contains('\\')
        || path.contains('\0')
        || path
            .split('/')
            .any(|part| part.is_empty() || part == "." || part == "..")
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "workspace path must be relative and normalized",
        )
        .into());
    }
    Ok(())
}

fn validate_transaction_argument(transaction_id: &str) -> Result<()> {
    if transaction_id.is_empty() || transaction_id.len() > 512 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "workspace transaction id is invalid",
        )
        .into());
    }
    Ok(())
}

fn read_current(path: &Path) -> Result<Option<String>> {
    match fs::read(path) {
        Ok(bytes) => {
            Ok(Some(String::from_utf8(bytes).map_err(|error| {
                io::Error::new(io::ErrorKind::InvalidData, error)
            })?))
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}

fn classify(current: Option<&str>, before: Option<&str>, after: Option<&str>) -> &'static str {
    match current {
        None if before.is_none() => "before",
        None if after.is_none() => "after",
        None => "other",
        Some(text) => {
            let current_hash = sha256(text.as_bytes());
            if before == Some(current_hash.as_str()) {
                "before"
            } else if after == Some(current_hash.as_str()) {
                "after"
            } else {
                "other"
            }
        }
    }
}

fn prepare_exact_temp(path: &Path, content: &[u8], expected_sha256: &str) -> Result<()> {
    match OpenOptions::new().create_new(true).write(true).open(path) {
        Ok(mut file) => {
            file.write_all(content)?;
            file.sync_all()?;
            Ok(())
        }
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
            validate_owned_file(path, expected_sha256)
        }
        Err(error) => Err(error.into()),
    }
}

fn validate_owned_file(path: &Path, expected_sha256: &str) -> Result<()> {
    let metadata = fs::symlink_metadata(path)?;
    if is_link_or_reparse_point(&metadata) || !metadata.is_file() {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "workspace transaction owned path is not a regular file",
        )
        .into());
    }
    if sha256(&fs::read(path)?) != expected_sha256 {
        return Err(io::Error::new(
            io::ErrorKind::AlreadyExists,
            "workspace transaction temp file has unexpected content",
        )
        .into());
    }
    Ok(())
}

fn reject_existing_owned_path(path: &Path) -> Result<()> {
    match fs::symlink_metadata(path) {
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Ok(_) => Err(io::Error::new(
            io::ErrorKind::AlreadyExists,
            "workspace transaction backup already exists",
        )
        .into()),
        Err(error) => Err(error.into()),
    }
}

fn remove_exact_owned_file(path: &Path, expected_sha256: Option<&str>) -> Result<()> {
    match fs::symlink_metadata(path) {
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
        Ok(_) => {
            let Some(expected_sha256) = expected_sha256 else {
                return Err(io::Error::new(
                    io::ErrorKind::AlreadyExists,
                    "unexpected workspace transaction owned path exists",
                )
                .into());
            };
            validate_owned_file(path, expected_sha256)?;
            fs::remove_file(path)?;
            sync_parent(path).map_err(Into::into)
        }
    }
}

fn is_link_or_reparse_point(metadata: &fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
        metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    }
    #[cfg(not(windows))]
    {
        false
    }
}

fn temp_path(destination: &Path, transaction_id: &str, ordinal: i64) -> Result<PathBuf> {
    owned_sibling_path(destination, transaction_id, ordinal, "tmp")
}

fn backup_path(destination: &Path, transaction_id: &str, ordinal: i64) -> Result<PathBuf> {
    owned_sibling_path(destination, transaction_id, ordinal, "backup")
}

fn owned_sibling_path(
    destination: &Path,
    transaction_id: &str,
    ordinal: i64,
    suffix: &str,
) -> Result<PathBuf> {
    let parent = destination
        .parent()
        .ok_or_else(|| io::Error::other("workspace destination has no parent"))?;
    let transaction_digest = sha256(transaction_id.as_bytes());
    Ok(parent.join(format!(".wanex-{transaction_digest}-{ordinal}.{suffix}")))
}

fn move_with_retry(source: &Path, destination: &Path) -> Result<()> {
    for attempt in 0..MAX_ATTEMPTS {
        match fs::rename(source, destination) {
            Ok(()) => return sync_parent(destination).map_err(Into::into),
            Err(error) if is_transient(&error) && attempt + 1 < MAX_ATTEMPTS => {
                thread::sleep(Duration::from_millis(5 * u64::from(attempt + 1)));
            }
            Err(error) => return Err(error.into()),
        }
    }
    unreachable!("move retry always returns")
}

fn is_transient(error: &io::Error) -> bool {
    #[cfg(windows)]
    {
        matches!(
            error.raw_os_error().map(|code| code as u32),
            Some(5 | 32 | 33)
        )
    }
    #[cfg(not(windows))]
    {
        let _ = error;
        false
    }
}

fn read_bounded_line(input: &mut impl BufRead) -> Result<Option<String>> {
    let mut line = Vec::new();
    loop {
        let buffer = input.fill_buf()?;
        if buffer.is_empty() {
            if line.is_empty() {
                return Ok(None);
            }
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "workspace transaction frame was incomplete",
            )
            .into());
        }
        let newline = buffer.iter().position(|byte| *byte == b'\n');
        let take = newline.map_or(buffer.len(), |index| index + 1);
        line.extend_from_slice(&buffer[..take]);
        input.consume(take);
        if line.len() > MAX_FRAME_BYTES {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "workspace transaction frame exceeded its limit",
            )
            .into());
        }
        if newline.is_some() {
            line.pop();
            if line.last() == Some(&b'\r') {
                line.pop();
            }
            return String::from_utf8(line)
                .map(Some)
                .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error).into());
        }
    }
}

fn sha256(bytes: &[u8]) -> String {
    let mut digest = Sha256::new();
    digest.update(bytes);
    format!("{:x}", digest.finalize())
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn write_frame(output: &mut impl Write, frame: &impl Serialize) -> Result<()> {
    serde_json::to_writer(&mut *output, frame)?;
    output.write_all(b"\n")?;
    output.flush()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{classify, owned_sibling_path, sha256, validate_relative_path};
    use std::path::Path;

    #[test]
    fn classifies_presence_and_content_evidence() {
        let before = sha256(b"before");
        let after = sha256(b"after");
        assert_eq!(
            classify(Some("before"), Some(&before), Some(&after)),
            "before"
        );
        assert_eq!(
            classify(Some("after"), Some(&before), Some(&after)),
            "after"
        );
        assert_eq!(
            classify(Some("other"), Some(&before), Some(&after)),
            "other"
        );
        assert_eq!(classify(None, None, Some(&after)), "before");
        assert_eq!(classify(None, Some(&before), None), "after");
    }

    #[test]
    fn temp_and_backup_are_deterministic_destination_siblings() {
        let destination = Path::new("/workspace/src/main.ts");
        let temp = owned_sibling_path(destination, "tx", 3, "tmp").unwrap();
        let backup = owned_sibling_path(destination, "tx", 3, "backup").unwrap();
        assert_eq!(temp.parent(), destination.parent());
        assert_eq!(backup.parent(), destination.parent());
        assert_eq!(
            temp,
            owned_sibling_path(destination, "tx", 3, "tmp").unwrap()
        );
    }

    #[test]
    fn rejects_unsafe_relative_paths() {
        for path in ["", "/absolute", "../escape", "nested/../escape", "a\\b"] {
            assert!(validate_relative_path(path).is_err(), "{path}");
        }
    }
}
