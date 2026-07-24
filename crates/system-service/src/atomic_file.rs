use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub(crate) fn prepare_replacement(
    destination: &Path,
    content: &[u8],
) -> io::Result<PreparedReplacement> {
    let temp_path = destination.with_extension(format!("tmp-{}", Uuid::now_v7()));
    let pending = PreparedReplacement::new(temp_path, destination.to_path_buf());
    {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(pending.temp_path())?;
        file.write_all(content)?;
        file.sync_all()?;
    }
    Ok(pending)
}

pub(crate) struct PreparedReplacement {
    temp_path: PathBuf,
    destination: PathBuf,
    committed: bool,
}

impl PreparedReplacement {
    fn new(temp_path: PathBuf, destination: PathBuf) -> Self {
        Self {
            temp_path,
            destination,
            committed: false,
        }
    }

    fn temp_path(&self) -> &Path {
        &self.temp_path
    }

    pub(crate) fn commit(mut self) -> io::Result<()> {
        replace_file(&self.temp_path, &self.destination)?;
        self.committed = true;
        Ok(())
    }
}

impl Drop for PreparedReplacement {
    fn drop(&mut self) {
        if !self.committed {
            let _ = fs::remove_file(&self.temp_path);
        }
    }
}

#[cfg(not(windows))]
fn replace_file(source: &Path, destination: &Path) -> io::Result<()> {
    fs::rename(source, destination)
}

#[cfg(windows)]
fn replace_file(source: &Path, destination: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use std::thread;
    use std::time::Duration;
    use windows_sys::Win32::Foundation::{
        ERROR_ACCESS_DENIED, ERROR_LOCK_VIOLATION, ERROR_SHARING_VIOLATION,
    };
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    const MAX_ATTEMPTS: u32 = 8;
    let source = source
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let destination = destination
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();

    for attempt in 0..MAX_ATTEMPTS {
        let replaced = unsafe {
            MoveFileExW(
                source.as_ptr(),
                destination.as_ptr(),
                MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
            )
        };
        if replaced != 0 {
            return Ok(());
        }
        let error = io::Error::last_os_error();
        let transient = matches!(
            error.raw_os_error().map(|code| code as u32),
            Some(ERROR_ACCESS_DENIED | ERROR_LOCK_VIOLATION | ERROR_SHARING_VIOLATION)
        );
        if !transient || attempt + 1 == MAX_ATTEMPTS {
            return Err(error);
        }
        thread::sleep(Duration::from_millis(5 * u64::from(attempt + 1)));
    }
    unreachable!("Windows replacement loop always returns")
}

#[cfg(test)]
mod tests {
    use super::prepare_replacement;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn prepared_replacement_is_invisible_until_commit() {
        let dir = tempdir().unwrap();
        let destination = dir.path().join("output.txt");
        fs::write(&destination, b"before").unwrap();

        let prepared = prepare_replacement(&destination, b"after").unwrap();
        let temp_path = prepared.temp_path().to_path_buf();
        assert_eq!(fs::read(&destination).unwrap(), b"before");
        assert_eq!(fs::read(&temp_path).unwrap(), b"after");

        prepared.commit().unwrap();
        assert_eq!(fs::read(&destination).unwrap(), b"after");
        assert!(!temp_path.exists());
    }

    #[test]
    fn dropping_prepared_replacement_removes_temp_and_preserves_destination() {
        let dir = tempdir().unwrap();
        let destination = dir.path().join("output.txt");
        fs::write(&destination, b"before").unwrap();

        let prepared = prepare_replacement(&destination, b"after").unwrap();
        let temp_path = prepared.temp_path().to_path_buf();
        drop(prepared);

        assert_eq!(fs::read(&destination).unwrap(), b"before");
        assert!(!temp_path.exists());
    }
}
