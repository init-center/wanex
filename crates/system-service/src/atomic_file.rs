use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub(crate) fn acquire_path_write_lock(lock_path: &Path) -> io::Result<PathWriteLock> {
    let file = open_path_write_lock_file(lock_path)?;
    file.lock()?;
    Ok(PathWriteLock { _file: file })
}

pub(crate) fn open_path_write_lock_file(lock_path: &Path) -> io::Result<File> {
    if let Some(parent) = lock_path.parent() {
        fs::create_dir_all(parent)?;
    }
    OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(lock_path)
}

pub(crate) struct PathWriteLock {
    _file: File,
}

impl PathWriteLock {
    #[cfg(test)]
    fn file(&self) -> &File {
        &self._file
    }
}

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

pub(crate) fn sync_parent(path: &Path) -> io::Result<()> {
    #[cfg(not(windows))]
    {
        let parent = path
            .parent()
            .ok_or_else(|| io::Error::other("path has no parent directory"))?;
        File::open(parent)?.sync_all()
    }
    #[cfg(windows)]
    {
        let _ = path;
        Ok(())
    }
}

#[cfg(not(windows))]
pub(crate) fn replace_file(source: &Path, destination: &Path) -> io::Result<()> {
    fs::rename(source, destination)?;
    sync_parent(destination)
}

#[cfg(windows)]
pub(crate) fn replace_file(source: &Path, destination: &Path) -> io::Result<()> {
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
    let source_wide = source
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let destination_wide = destination
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();

    for attempt in 0..MAX_ATTEMPTS {
        let replaced = unsafe {
            MoveFileExW(
                source_wide.as_ptr(),
                destination_wide.as_ptr(),
                MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
            )
        };
        if replaced != 0 {
            return sync_parent(destination);
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
    use super::{acquire_path_write_lock, prepare_replacement};
    use std::fs::{self, OpenOptions};
    use tempfile::tempdir;

    #[test]
    fn path_write_lock_is_owned_by_the_open_handle() {
        let dir = tempdir().unwrap();
        let lock_path = dir.path().join("locks/resource.lock");
        let first = acquire_path_write_lock(&lock_path).unwrap();
        let second = OpenOptions::new()
            .read(true)
            .write(true)
            .open(&lock_path)
            .unwrap();

        assert!(matches!(
            second.try_lock(),
            Err(std::fs::TryLockError::WouldBlock)
        ));
        drop(first);
        second.try_lock().unwrap();
        second.unlock().unwrap();
    }

    #[test]
    fn path_write_lock_uses_one_stable_file() {
        let dir = tempdir().unwrap();
        let lock_path = dir.path().join("locks/resource.lock");

        let first = acquire_path_write_lock(&lock_path).unwrap();
        let first_metadata = first.file().metadata().unwrap();
        drop(first);
        let second = acquire_path_write_lock(&lock_path).unwrap();
        let second_metadata = second.file().metadata().unwrap();

        assert_eq!(first_metadata.len(), 0);
        assert_eq!(second_metadata.len(), 0);
        assert!(lock_path.exists());
    }

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
