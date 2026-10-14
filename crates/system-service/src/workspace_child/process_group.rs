use std::io;

pub(super) fn has_live_members(group: libc::pid_t) -> io::Result<bool> {
    if unsafe { libc::kill(-group, 0) } != 0 {
        let error = io::Error::last_os_error();
        if error.raw_os_error() == Some(libc::ESRCH) {
            return Ok(false);
        }
        // macOS can return EPERM when only zombies remain. Inspect membership evidence.
        if error.raw_os_error() != Some(libc::EPERM) {
            return Err(error);
        }
        #[cfg(not(any(target_os = "macos", target_os = "linux")))]
        return Err(error);
    }
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        let before = members(group)?;
        if before.iter().any(|member| member.live) {
            return Ok(true);
        }
        // A parent may fork and exit during enumeration. Require stable dead membership.
        let after = members(group)?;
        Ok(after.iter().any(|member| member.live) || before != after)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        Ok(true)
    }
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
#[derive(PartialEq, Eq)]
struct Member {
    pid: libc::pid_t,
    live: bool,
}

#[cfg(target_os = "macos")]
fn members(group: libc::pid_t) -> io::Result<Vec<Member>> {
    fn list(group: libc::pid_t, buffer: *mut libc::c_void, bytes: i32) -> io::Result<usize> {
        unsafe {
            *libc::__error() = 0;
        }
        let count = unsafe { libc::proc_listpgrppids(group, buffer, bytes) };
        let error = io::Error::last_os_error();
        if count < 0 || (count == 0 && error.raw_os_error().unwrap_or(0) != 0) {
            return Err(error);
        }
        Ok(count as usize)
    }
    let capacity = list(group, std::ptr::null_mut(), 0)?.saturating_add(16);
    if capacity > 65_536 {
        return Err(io::Error::other("process group exceeds probe capacity"));
    }
    let mut pids = vec![0 as libc::pid_t; capacity];
    let count = list(
        group,
        pids.as_mut_ptr().cast(),
        std::mem::size_of_val(pids.as_slice()) as i32,
    )?;
    if count >= pids.len() {
        return Err(io::Error::other(
            "process group changed beyond probe capacity",
        ));
    }
    pids.truncate(count);
    pids.sort_unstable();
    pids.dedup();
    let mut result = Vec::with_capacity(pids.len());
    for pid in pids.into_iter().filter(|pid| *pid > 0) {
        let mut info = std::mem::MaybeUninit::<libc::proc_bsdinfo>::uninit();
        let size = std::mem::size_of::<libc::proc_bsdinfo>() as i32;
        let read = unsafe {
            libc::proc_pidinfo(
                pid,
                libc::PROC_PIDTBSDINFO,
                0,
                info.as_mut_ptr().cast(),
                size,
            )
        };
        if read == 0 {
            let error = io::Error::last_os_error();
            if error.raw_os_error() == Some(libc::ESRCH) {
                result.push(Member { pid, live: false });
                continue;
            }
            return Err(error);
        }
        if read != size {
            return Err(io::Error::other("incomplete process membership evidence"));
        }
        let info = unsafe { info.assume_init() };
        if info.pbi_pgid == group as u32 {
            result.push(Member {
                pid,
                live: info.pbi_status != libc::SZOMB,
            });
        }
    }
    Ok(result)
}

#[cfg(target_os = "linux")]
fn members(group: libc::pid_t) -> io::Result<Vec<Member>> {
    let mut result = Vec::new();
    for entry in std::fs::read_dir("/proc")? {
        let entry = entry?;
        let Some(pid) = entry
            .file_name()
            .to_str()
            .and_then(|name| name.parse::<libc::pid_t>().ok())
        else {
            continue;
        };
        if pid <= 0 {
            continue;
        }
        let stat = match std::fs::read(entry.path().join("stat")) {
            Ok(stat) => stat,
            Err(error) if matches!(error.raw_os_error(), Some(libc::ENOENT | libc::ESRCH)) => {
                continue
            }
            Err(error) => return Err(error),
        };
        let (process_group, live) = parse_stat(&stat)?;
        if process_group == group {
            result.push(Member { pid, live });
        }
    }
    result.sort_unstable_by_key(|member| member.pid);
    Ok(result)
}

#[cfg(any(target_os = "linux", test))]
fn parse_stat(stat: &[u8]) -> io::Result<(libc::pid_t, bool)> {
    let invalid = || io::Error::new(io::ErrorKind::InvalidData, "invalid process state evidence");
    let end = stat
        .windows(2)
        .rposition(|bytes| bytes == b") ")
        .ok_or_else(invalid)?;
    let tail = std::str::from_utf8(&stat[end + 2..]).map_err(|_| invalid())?;
    let mut fields = tail.split_whitespace();
    let state = fields
        .next()
        .filter(|state| state.len() == 1)
        .ok_or_else(invalid)?;
    fields.next().ok_or_else(invalid)?;
    let group = fields
        .next()
        .and_then(|value| value.parse::<libc::pid_t>().ok())
        .ok_or_else(invalid)?;
    Ok((group, !matches!(state, "Z" | "X" | "x")))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn process_state_parsing_keeps_stopped_processes_live_and_rejects_bad_evidence() {
        assert_eq!(
            parse_stat(b"42 (name with ) parens) Z 1 123 0").unwrap(),
            (123, false)
        );
        assert_eq!(parse_stat(b"42 (worker) X 1 123 0").unwrap(), (123, false));
        assert_eq!(parse_stat(b"42 (worker) T 1 123 0").unwrap(), (123, true));
        assert_eq!(parse_stat(b"42 (worker) R 1 123 0").unwrap(), (123, true));
        assert_eq!(parse_stat(b"42 (\xff) Z 1 123 0").unwrap(), (123, false));
        assert!(parse_stat(b"42 (broken) Z 1").is_err());
        assert!(parse_stat(b"42 (broken) Z 1 not-a-group").is_err());
    }
}
