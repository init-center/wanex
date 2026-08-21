use crate::{Result, SystemServiceError};
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::io::{self, BufRead, Read, Write};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::thread;
use std::time::{Duration, Instant};

const PROTOCOL: u8 = 1;
const MAX_FRAME_BYTES: usize = 2 * 1024 * 1024;
const MAX_ARGUMENTS: usize = 256;
const MAX_ARGUMENT_BYTES: usize = 64 * 1024;
const MAX_ENVIRONMENT_ENTRIES: usize = 512;
const MAX_STDIN_BYTES: usize = 1024 * 1024;
const MAX_OUTPUT_BYTES: u64 = 50 * 1024 * 1024;
const OUTPUT_CHUNK_BYTES: usize = 16 * 1024;
const DEFAULT_GRACE_MS: u64 = 250;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct StartFrame {
    protocol: u8,
    kind: String,
    run_id: String,
    attempt_id: String,
    child_id: String,
    claim_token_sha256: String,
    program: String,
    args: Vec<String>,
    cwd: String,
    environment: BTreeMap<String, String>,
    stdin_base64: Option<String>,
    stdout_limit_bytes: u64,
    stderr_limit_bytes: u64,
    termination_grace_ms: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ControlFrame {
    protocol: u8,
    run_id: String,
    command: String,
    attempt_id: String,
    child_id: String,
    claim_token_sha256: String,
    reason: Option<String>,
}

#[derive(Debug, Serialize)]
struct ReadyFrame<'a> {
    protocol: u8,
    kind: &'static str,
    run_id: &'a str,
    attempt_id: &'a str,
    child_id: &'a str,
    claim_token_sha256: &'a str,
}

#[derive(Debug, Serialize)]
struct OutputFrame<'a> {
    protocol: u8,
    kind: &'static str,
    run_id: &'a str,
    attempt_id: &'a str,
    child_id: &'a str,
    claim_token_sha256: &'a str,
    data_base64: String,
}

#[derive(Debug, Serialize)]
struct TerminalFrame<'a> {
    protocol: u8,
    kind: &'static str,
    run_id: &'a str,
    attempt_id: &'a str,
    child_id: &'a str,
    claim_token_sha256: &'a str,
    exit_code: Option<i32>,
    signal: Option<String>,
    termination: &'static str,
    cleanup: &'static str,
    cleanup_error: Option<&'static str>,
    stdout_observed_bytes: u64,
    stderr_observed_bytes: u64,
    stdout_truncated: bool,
    stderr_truncated: bool,
}

enum Event {
    Stdout(Vec<u8>),
    Stderr(Vec<u8>),
    StdoutClosed,
    StderrClosed,
    Control(ControlResult),
}

enum ControlResult {
    Frame(ControlFrame),
    Eof,
    Invalid,
}

enum TerminationRequest {
    Cancelled,
    TimedOut,
    PipeEof,
}

struct OutputState {
    observed: u64,
    limit: u64,
    head: Vec<u8>,
    tail: Vec<u8>,
}

impl OutputState {
    fn new(limit: u64) -> Result<Self> {
        if limit > MAX_OUTPUT_BYTES {
            return Err(SystemServiceError::InvalidInput(
                "workspace child output limit exceeds the hard maximum".to_string(),
            ));
        }
        Ok(Self {
            observed: 0,
            limit,
            head: Vec::new(),
            tail: Vec::new(),
        })
    }

    fn append(&mut self, bytes: &[u8]) {
        self.observed = self.observed.saturating_add(bytes.len() as u64);
        let head_limit = self.limit.div_ceil(2) as usize;
        let tail_limit = (self.limit / 2) as usize;
        let mut offset = 0;
        if self.head.len() < head_limit {
            let retained = (head_limit - self.head.len()).min(bytes.len());
            self.head.extend_from_slice(&bytes[..retained]);
            offset = retained;
        }
        if tail_limit == 0 || offset >= bytes.len() {
            return;
        }
        self.tail.extend_from_slice(&bytes[offset..]);
        if self.tail.len() > tail_limit {
            self.tail.drain(..self.tail.len() - tail_limit);
        }
    }

    fn retained(&self) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(self.head.len() + self.tail.len());
        bytes.extend_from_slice(&self.head);
        bytes.extend_from_slice(&self.tail);
        bytes
    }

    fn truncated(&self) -> bool {
        self.observed > (self.head.len() + self.tail.len()) as u64
    }
}

pub fn run_workspace_child_helper() -> Result<()> {
    let start = {
        let stdin = io::stdin();
        let mut input = stdin.lock();
        read_frame::<StartFrame>(&mut input)?
            .ok_or_else(|| invalid_input("workspace child start frame is missing"))?
    };
    validate_start(&start)?;
    let stdin_bytes = match start.stdin_base64.as_deref() {
        Some(value) => base64::engine::general_purpose::STANDARD
            .decode(value)
            .map_err(|_| invalid_input("workspace child stdin is not valid base64"))?,
        None => Vec::new(),
    };
    if stdin_bytes.len() > MAX_STDIN_BYTES {
        return Err(invalid_input("workspace child stdin exceeds its limit"));
    }

    let mut command = Command::new(&start.program);
    command
        .args(&start.args)
        .current_dir(&start.cwd)
        .env_clear()
        .envs(&start.environment)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    configure_process_group(&mut command);
    let mut child = command.spawn().map_err(|_| {
        SystemServiceError::Io(io::Error::other("workspace child process failed to spawn"))
    })?;
    let ownership = ChildOwnership::claim(&mut child)?;
    if let Some(mut child_stdin) = child.stdin.take() {
        child_stdin.write_all(&stdin_bytes)?;
        drop(child_stdin);
    }

    let (events_tx, events_rx) = mpsc::channel();
    spawn_output_reader(child.stdout.take(), events_tx.clone(), false);
    spawn_output_reader(child.stderr.take(), events_tx.clone(), true);
    let control_tx = events_tx.clone();
    thread::Builder::new()
        .name("wanex-workspace-child-control".to_string())
        .spawn(move || {
            let stdin = io::stdin();
            read_control(stdin.lock(), control_tx);
        })?;
    drop(events_tx);

    let stdout = io::stdout();
    let mut output = stdout.lock();
    write_json(
        &mut output,
        &ReadyFrame {
            protocol: PROTOCOL,
            kind: "workspace_child_ready",
            run_id: &start.run_id,
            attempt_id: &start.attempt_id,
            child_id: &start.child_id,
            claim_token_sha256: &start.claim_token_sha256,
        },
    )?;

    run_child_loop(&mut child, ownership, &events_rx, &mut output, &start)
}

fn run_child_loop(
    child: &mut Child,
    mut ownership: ChildOwnership,
    events: &Receiver<Event>,
    output: &mut impl Write,
    start: &StartFrame,
) -> Result<()> {
    let mut stdout_state = OutputState::new(start.stdout_limit_bytes)?;
    let mut stderr_state = OutputState::new(start.stderr_limit_bytes)?;
    let mut stdout_closed = false;
    let mut stderr_closed = false;
    let mut termination: Option<TerminationRequest> = None;
    let mut cleanup = "completed";
    let mut cleanup_error: Option<&'static str> = None;
    let mut termination_deadline: Option<Instant> = None;
    let mut termination_sent = false;
    let mut force_sent = false;
    let mut final_deadline_reached = false;
    let mut terminate_failed = false;
    let mut force_terminate_failed = false;
    let mut membership_probe_failed = false;
    let grace = Duration::from_millis(start.termination_grace_ms.unwrap_or(DEFAULT_GRACE_MS));
    let mut status: Option<ExitStatus> = None;

    loop {
        if status.is_none() {
            status = child.try_wait()?;
        }
        if (termination.is_some() || status.is_some()) && !termination_sent {
            if ownership.terminate(child).is_err() {
                terminate_failed = true;
            }
            termination_sent = true;
            termination_deadline = Some(Instant::now() + grace);
        }
        let members_alive = match ownership.has_live_members(child) {
            Ok(value) => value,
            Err(_) => {
                membership_probe_failed = true;
                true
            }
        };
        if members_alive && termination_sent {
            if let Some(deadline) = termination_deadline {
                if Instant::now() >= deadline && !force_sent {
                    if ownership.force_terminate(child).is_err() {
                        force_terminate_failed = true;
                    }
                    force_sent = true;
                    termination_deadline = Some(Instant::now() + grace);
                } else if Instant::now() >= deadline && force_sent {
                    cleanup = "ambiguous";
                    cleanup_error = Some(if force_terminate_failed {
                        "force_terminate_failed"
                    } else if terminate_failed {
                        "terminate_failed"
                    } else if membership_probe_failed {
                        "membership_probe_failed"
                    } else {
                        "termination_unproven"
                    });
                    final_deadline_reached = true;
                    termination_deadline = None;
                }
            }
        }
        if final_deadline_reached
            || (status.is_some() && stdout_closed && stderr_closed && !members_alive)
        {
            if !members_alive {
                ownership.disarm();
            }
            write_output(
                output,
                start,
                "workspace_child_stdout",
                &stdout_state.retained(),
            )?;
            write_output(
                output,
                start,
                "workspace_child_stderr",
                &stderr_state.retained(),
            )?;
            let reason = termination
                .as_ref()
                .map(TerminationRequest::label)
                .unwrap_or_else(|| {
                    if status.as_ref().and_then(ExitStatus::code).is_some() {
                        "exited"
                    } else {
                        "signaled"
                    }
                });
            write_json(
                output,
                &TerminalFrame {
                    protocol: PROTOCOL,
                    kind: "workspace_child_terminal",
                    run_id: &start.run_id,
                    attempt_id: &start.attempt_id,
                    child_id: &start.child_id,
                    claim_token_sha256: &start.claim_token_sha256,
                    exit_code: status.as_ref().and_then(ExitStatus::code),
                    signal: status.as_ref().and_then(signal_name),
                    termination: reason,
                    cleanup,
                    cleanup_error,
                    stdout_observed_bytes: stdout_state.observed,
                    stderr_observed_bytes: stderr_state.observed,
                    stdout_truncated: stdout_state.truncated(),
                    stderr_truncated: stderr_state.truncated(),
                },
            )?;
            return Ok(());
        }

        match events.recv_timeout(Duration::from_millis(20)) {
            Ok(Event::Stdout(bytes)) => stdout_state.append(&bytes),
            Ok(Event::Stderr(bytes)) => stderr_state.append(&bytes),
            Ok(Event::StdoutClosed) => stdout_closed = true,
            Ok(Event::StderrClosed) => stderr_closed = true,
            Ok(Event::Control(ControlResult::Frame(frame))) => {
                if !control_matches(&frame, start) {
                    cleanup = "ambiguous";
                    cleanup_error = Some("control_identity_mismatch");
                    termination.get_or_insert(TerminationRequest::PipeEof);
                    continue;
                }
                if frame.command == "terminate"
                    && termination.is_none()
                    && matches!(frame.reason.as_deref(), Some("cancelled" | "timed_out"))
                {
                    termination = Some(match frame.reason.as_deref() {
                        Some("timed_out") => TerminationRequest::TimedOut,
                        _ => TerminationRequest::Cancelled,
                    });
                } else {
                    cleanup = "ambiguous";
                    cleanup_error = Some("control_command_invalid");
                    termination.get_or_insert(TerminationRequest::PipeEof);
                }
            }
            Ok(Event::Control(ControlResult::Eof)) => {
                if termination.is_none() {
                    termination = Some(TerminationRequest::PipeEof);
                }
            }
            Ok(Event::Control(ControlResult::Invalid)) => {
                cleanup = "ambiguous";
                cleanup_error = Some("control_frame_invalid");
                termination.get_or_insert(TerminationRequest::PipeEof);
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => {
                if termination.is_none() {
                    termination = Some(TerminationRequest::PipeEof);
                }
            }
        }
    }
}

fn write_output(
    output: &mut impl Write,
    start: &StartFrame,
    kind: &'static str,
    bytes: &[u8],
) -> Result<()> {
    for chunk in bytes.chunks(OUTPUT_CHUNK_BYTES) {
        write_json(
            output,
            &OutputFrame {
                protocol: PROTOCOL,
                kind,
                run_id: &start.run_id,
                attempt_id: &start.attempt_id,
                child_id: &start.child_id,
                claim_token_sha256: &start.claim_token_sha256,
                data_base64: base64::engine::general_purpose::STANDARD.encode(chunk),
            },
        )?;
    }
    Ok(())
}

fn spawn_output_reader(
    stream: Option<impl Read + Send + 'static>,
    sender: Sender<Event>,
    stderr: bool,
) {
    thread::spawn(move || {
        let Some(mut stream) = stream else {
            let _ = sender.send(if stderr {
                Event::StderrClosed
            } else {
                Event::StdoutClosed
            });
            return;
        };
        let mut buffer = [0_u8; OUTPUT_CHUNK_BYTES];
        loop {
            match stream.read(&mut buffer) {
                Ok(0) => {
                    let _ = sender.send(if stderr {
                        Event::StderrClosed
                    } else {
                        Event::StdoutClosed
                    });
                    return;
                }
                Ok(size) => {
                    let event = if stderr {
                        Event::Stderr(buffer[..size].to_vec())
                    } else {
                        Event::Stdout(buffer[..size].to_vec())
                    };
                    if sender.send(event).is_err() {
                        return;
                    }
                }
                Err(_) => {
                    let _ = sender.send(if stderr {
                        Event::StderrClosed
                    } else {
                        Event::StdoutClosed
                    });
                    return;
                }
            }
        }
    });
}

fn read_control(mut input: impl BufRead, sender: Sender<Event>) {
    loop {
        match read_line(&mut input) {
            Ok(Some(line)) => {
                let result = serde_json::from_str::<ControlFrame>(&line)
                    .map(ControlResult::Frame)
                    .unwrap_or(ControlResult::Invalid);
                if sender.send(Event::Control(result)).is_err() {
                    return;
                }
            }
            Ok(None) => {
                let _ = sender.send(Event::Control(ControlResult::Eof));
                return;
            }
            Err(_) => {
                let _ = sender.send(Event::Control(ControlResult::Invalid));
                return;
            }
        }
    }
}

fn read_frame<T: for<'de> Deserialize<'de>>(input: &mut impl BufRead) -> Result<Option<T>> {
    let Some(line) = read_line(input)? else {
        return Ok(None);
    };
    serde_json::from_str(&line)
        .map(Some)
        .map_err(|_| invalid_input("workspace child frame is invalid JSON"))
}

fn read_line(input: &mut impl BufRead) -> Result<Option<String>> {
    let mut line = String::new();
    let bytes = input.read_line(&mut line)?;
    if bytes == 0 {
        return Ok(None);
    }
    if bytes > MAX_FRAME_BYTES || !line.ends_with('\n') {
        return Err(invalid_input("workspace child frame exceeded its limit"));
    }
    line.pop();
    if line.ends_with('\r') {
        line.pop();
    }
    Ok(Some(line))
}

fn validate_start(start: &StartFrame) -> Result<()> {
    if start.protocol != PROTOCOL || start.kind != "workspace_child_start" {
        return Err(invalid_input(
            "workspace child start frame is not supported",
        ));
    }
    if !opaque_id(&start.run_id)
        || !opaque_id(&start.attempt_id)
        || !opaque_id(&start.child_id)
        || start.program.is_empty()
        || start.cwd.is_empty()
        || start.program.contains('\0')
        || start.cwd.contains('\0')
        || start.args.iter().any(|value| value.contains('\0'))
    {
        return Err(invalid_input(
            "workspace child start frame contains invalid input",
        ));
    }
    if !is_sha256(&start.claim_token_sha256)
        || start.args.len() > MAX_ARGUMENTS
        || start.args.iter().map(|value| value.len()).sum::<usize>() > MAX_ARGUMENT_BYTES
        || start.environment.len() > MAX_ENVIRONMENT_ENTRIES
        || start
            .environment
            .keys()
            .any(|key| key.is_empty() || key.contains('\0'))
        || start.environment.values().any(|value| value.contains('\0'))
    {
        return Err(invalid_input(
            "workspace child start frame exceeds its limits",
        ));
    }
    if start.termination_grace_ms.unwrap_or(DEFAULT_GRACE_MS) > 60_000 {
        return Err(invalid_input(
            "workspace child termination grace exceeds its limit",
        ));
    }
    let _ = OutputState::new(start.stdout_limit_bytes)?;
    let _ = OutputState::new(start.stderr_limit_bytes)?;
    Ok(())
}

fn opaque_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 256
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"_.:-".contains(&byte))
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn control_matches(frame: &ControlFrame, start: &StartFrame) -> bool {
    frame.protocol == PROTOCOL
        && frame.run_id == start.run_id
        && frame.attempt_id == start.attempt_id
        && frame.child_id == start.child_id
        && frame.claim_token_sha256 == start.claim_token_sha256
}

fn write_json(output: &mut impl Write, value: &impl Serialize) -> Result<()> {
    serde_json::to_writer(&mut *output, value)?;
    output.write_all(b"\n")?;
    output.flush()?;
    Ok(())
}

fn invalid_input(message: &str) -> SystemServiceError {
    SystemServiceError::InvalidInput(message.to_string())
}

#[cfg(unix)]
fn signal_name(status: &ExitStatus) -> Option<String> {
    use std::os::unix::process::ExitStatusExt;
    status.signal().map(|value| match value {
        libc::SIGHUP => "SIGHUP".to_string(),
        libc::SIGINT => "SIGINT".to_string(),
        libc::SIGQUIT => "SIGQUIT".to_string(),
        libc::SIGABRT => "SIGABRT".to_string(),
        libc::SIGKILL => "SIGKILL".to_string(),
        libc::SIGALRM => "SIGALRM".to_string(),
        libc::SIGTERM => "SIGTERM".to_string(),
        other => format!("SIGNAL_{other}"),
    })
}

#[cfg(not(unix))]
fn signal_name(_: &ExitStatus) -> Option<String> {
    None
}

impl TerminationRequest {
    fn label(&self) -> &'static str {
        match self {
            Self::Cancelled => "cancelled",
            Self::TimedOut => "timed_out",
            Self::PipeEof => "pipe_eof",
        }
    }
}

struct ChildOwnership {
    armed: bool,
    #[cfg(unix)]
    process_group: libc::pid_t,
    #[cfg(windows)]
    job: windows_sys::Win32::Foundation::HANDLE,
}

impl ChildOwnership {
    fn claim(child: &mut Child) -> Result<Self> {
        #[cfg(windows)]
        {
            use std::os::windows::io::AsRawHandle;
            use windows_sys::Win32::System::JobObjects::{
                AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
                SetInformationJobObject, JOBOBJECT_BASIC_LIMIT_INFORMATION,
                JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
            };
            let job = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
            if job.is_null() {
                return Err(kill_unclaimed_child(child, io::Error::last_os_error()).into());
            }
            let limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
                BasicLimitInformation: JOBOBJECT_BASIC_LIMIT_INFORMATION {
                    LimitFlags: JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
                    ..Default::default()
                },
                ..Default::default()
            };
            let configured = unsafe {
                SetInformationJobObject(
                    job,
                    JobObjectExtendedLimitInformation,
                    std::ptr::from_ref(&limits).cast::<std::ffi::c_void>(),
                    std::mem::size_of_val(&limits) as u32,
                )
            };
            let assigned = unsafe { AssignProcessToJobObject(job, child.as_raw_handle() as _) };
            if configured == 0 || assigned == 0 {
                unsafe { windows_sys::Win32::Foundation::CloseHandle(job) };
                return Err(kill_unclaimed_child(child, io::Error::last_os_error()).into());
            }
            if let Err(error) = resume_suspended_child(child.id()) {
                unsafe { windows_sys::Win32::Foundation::CloseHandle(job) };
                let _ = child.wait();
                return Err(error.into());
            }
            Ok(Self { armed: true, job })
        }
        #[cfg(not(windows))]
        {
            #[cfg(unix)]
            {
                Ok(Self {
                    armed: true,
                    process_group: child.id() as libc::pid_t,
                })
            }
            #[cfg(not(unix))]
            {
                let _ = child;
                Ok(Self { armed: true })
            }
        }
    }

    fn disarm(&mut self) {
        self.armed = false;
    }

    fn terminate(&self, _child: &mut Child) -> io::Result<()> {
        #[cfg(windows)]
        {
            let result =
                unsafe { windows_sys::Win32::System::JobObjects::TerminateJobObject(self.job, 1) };
            if result == 0 {
                return Err(io::Error::last_os_error());
            }
            Ok(())
        }
        #[cfg(unix)]
        {
            let pid = _child.id() as libc::pid_t;
            let result = unsafe { libc::kill(-pid, libc::SIGTERM) };
            if result != 0 && io::Error::last_os_error().raw_os_error() != Some(libc::ESRCH) {
                return Err(io::Error::last_os_error());
            }
            Ok(())
        }
        #[cfg(not(any(windows, unix)))]
        {
            _child.kill()
        }
    }

    fn force_terminate(&self, child: &mut Child) -> io::Result<()> {
        #[cfg(windows)]
        {
            self.terminate(child)
        }
        #[cfg(unix)]
        {
            let pid = child.id() as libc::pid_t;
            let result = unsafe { libc::kill(-pid, libc::SIGKILL) };
            if result != 0 && io::Error::last_os_error().raw_os_error() != Some(libc::ESRCH) {
                return Err(io::Error::last_os_error());
            }
            Ok(())
        }
        #[cfg(not(any(windows, unix)))]
        {
            child.kill()
        }
    }

    fn has_live_members(&self, child: &Child) -> io::Result<bool> {
        #[cfg(windows)]
        {
            let _ = child;
            use windows_sys::Win32::System::JobObjects::{
                JobObjectBasicAccountingInformation, QueryInformationJobObject,
                JOBOBJECT_BASIC_ACCOUNTING_INFORMATION,
            };
            let mut accounting = JOBOBJECT_BASIC_ACCOUNTING_INFORMATION::default();
            let result = unsafe {
                QueryInformationJobObject(
                    self.job,
                    JobObjectBasicAccountingInformation,
                    std::ptr::from_mut(&mut accounting).cast::<std::ffi::c_void>(),
                    std::mem::size_of_val(&accounting) as u32,
                    std::ptr::null_mut(),
                )
            };
            if result == 0 {
                return Err(io::Error::last_os_error());
            }
            Ok(accounting.ActiveProcesses > 0)
        }
        #[cfg(unix)]
        {
            let pid = child.id() as libc::pid_t;
            let result = unsafe { libc::kill(-pid, 0) };
            if result == 0 {
                return Ok(true);
            }
            let error = io::Error::last_os_error();
            if error.raw_os_error() == Some(libc::ESRCH) {
                Ok(false)
            } else {
                Err(error)
            }
        }
        #[cfg(not(any(windows, unix)))]
        {
            Ok(child.try_wait()?.is_none())
        }
    }
}

impl Drop for ChildOwnership {
    fn drop(&mut self) {
        #[cfg(unix)]
        if self.armed {
            unsafe {
                libc::kill(-self.process_group, libc::SIGKILL);
            }
        }
        #[cfg(windows)]
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.job);
        }
    }
}

#[cfg(unix)]
fn configure_process_group(command: &mut Command) {
    use std::os::unix::process::CommandExt;
    command.process_group(0);
}

#[cfg(not(unix))]
fn configure_process_group(command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        use windows_sys::Win32::System::Threading::CREATE_SUSPENDED;
        command.creation_flags(CREATE_SUSPENDED);
    }
}

#[cfg(windows)]
fn kill_unclaimed_child(child: &mut Child, error: io::Error) -> io::Error {
    let _ = child.kill();
    let _ = child.wait();
    error
}

#[cfg(windows)]
fn resume_suspended_child(process_id: u32) -> io::Result<()> {
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Thread32First, Thread32Next, TH32CS_SNAPTHREAD, THREADENTRY32,
    };
    use windows_sys::Win32::System::Threading::{OpenThread, ResumeThread, THREAD_SUSPEND_RESUME};

    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0) };
    if snapshot == INVALID_HANDLE_VALUE {
        return Err(io::Error::last_os_error());
    }
    let mut entry = THREADENTRY32 {
        dwSize: std::mem::size_of::<THREADENTRY32>() as u32,
        ..Default::default()
    };
    let mut found = unsafe { Thread32First(snapshot, &mut entry) } != 0;
    let result = loop {
        if !found {
            break Err(io::Error::new(
                io::ErrorKind::NotFound,
                "workspace child suspended thread was not found",
            ));
        }
        if entry.th32OwnerProcessID == process_id {
            let thread = unsafe { OpenThread(THREAD_SUSPEND_RESUME, 0, entry.th32ThreadID) };
            if thread.is_null() {
                break Err(io::Error::last_os_error());
            }
            let resumed = unsafe { ResumeThread(thread) };
            unsafe { CloseHandle(thread) };
            if resumed == u32::MAX {
                break Err(io::Error::last_os_error());
            }
            break Ok(());
        }
        found = unsafe { Thread32Next(snapshot, &mut entry) } != 0;
    };
    unsafe { CloseHandle(snapshot) };
    result
}
