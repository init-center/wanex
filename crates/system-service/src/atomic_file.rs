use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub(crate) fn write_replacing(destination: &Path, content: &[u8]) -> io::Result<()> {
    let temp_path = destination.with_extension(format!("tmp-{}", Uuid::now_v7()));
    let mut temp = PendingTempFile::new(temp_path);
    {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(temp.path())?;
        file.write_all(content)?;
        file.sync_all()?;
    }
    replace_file(temp.path(), destination)?;
    temp.commit();
    Ok(())
}

struct PendingTempFile {
    path: PathBuf,
    committed: bool,
}

impl PendingTempFile {
    fn new(path: PathBuf) -> Self {
        Self {
            path,
            committed: false,
        }
    }

    fn path(&self) -> &Path {
        &self.path
    }

    fn commit(&mut self) {
        self.committed = true;
    }
}

impl Drop for PendingTempFile {
    fn drop(&mut self) {
        if !self.committed {
            let _ = fs::remove_file(&self.path);
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
