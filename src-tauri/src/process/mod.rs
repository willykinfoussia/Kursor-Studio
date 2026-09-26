use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::{
    collections::HashMap,
    io::Read,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};

const MAX_OUTPUT_CHARS: usize = 32_768;
const DEFAULT_TIMEOUT_MS: u64 = 30_000;

mod git;
pub use git::*;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessResult {
    pub command: String,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub truncated: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessJob {
    pub job_id: String,
    pub command: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessOutput {
    pub job_id: String,
    pub command: String,
    pub stdout: String,
    pub stderr: String,
    pub running: bool,
    pub exit_code: Option<i32>,
    pub truncated: bool,
}

struct OutputTail {
    text: String,
    truncated: bool,
}

struct ManagedJob {
    child: Child,
    command: String,
    stdout: Arc<Mutex<OutputTail>>,
    stderr: Arc<Mutex<OutputTail>>,
}

fn push_tail(buffer: &Arc<Mutex<OutputTail>>, chunk: &str, max_chars: usize) {
    let mut guard = buffer.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    guard.text.push_str(chunk);
    let count = guard.text.chars().count();
    if count > max_chars {
        let skip = count - max_chars;
        guard.text = guard.text.chars().skip(skip).collect();
        guard.truncated = true;
    }
}

fn snapshot_tail(buffer: &Arc<Mutex<OutputTail>>) -> (String, bool) {
    let guard = buffer.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    (guard.text.clone(), guard.truncated)
}

fn spawn_reader(mut pipe: impl Read + Send + 'static, buffer: Arc<Mutex<OutputTail>>) {
    thread::spawn(move || {
        let mut chunk = [0u8; 4096];
        loop {
            match pipe.read(&mut chunk) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let text = String::from_utf8_lossy(&chunk[..n]);
                    push_tail(&buffer, &text, MAX_OUTPUT_CHARS);
                }
            }
        }
    });
}

pub struct CommandPolicy;

impl CommandPolicy {
    pub fn resolve(command: &str) -> AppResult<(&'static str, &'static [&'static str])> {
        match command.trim() {
            "node --version" => Ok(("node", &["--version"])),
            "pnpm --version" => {
                #[cfg(target_os = "windows")]
                return Ok(("pnpm.cmd", &["--version"]));
                #[cfg(not(target_os = "windows"))]
                return Ok(("pnpm", &["--version"]));
            }
            "git --version" => Ok(("git", &["--version"])),
            _ => Err(AppError::CommandDenied),
        }
    }
}

pub fn execute_allowed(command: String) -> AppResult<ProcessResult> {
    let (program, args) = CommandPolicy::resolve(&command)?;
    let output = Command::new(program).args(args).output()?;
    Ok(ProcessResult {
        command,
        stdout: String::from_utf8_lossy(&output.stdout).trim().to_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).trim().to_owned(),
        exit_code: output.status.code(),
        truncated: None,
    })
}

pub fn split_command(command: &str) -> AppResult<(String, Vec<String>)> {
    let trimmed = command.trim();
    if trimmed.is_empty() || trimmed.len() > 8_192 {
        return Err(AppError::CommandDenied);
    }
    let mut parts = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    for ch in trimmed.chars() {
        match (quote, ch) {
            (Some(q), c) if c == q => quote = None,
            (Some(_), c) => current.push(c),
            (None, c) if c == '"' || c == '\'' => quote = Some(c),
            (None, c) if c.is_whitespace() => {
                if !current.is_empty() {
                    parts.push(std::mem::take(&mut current));
                }
            }
            (None, c) => current.push(c),
        }
    }
    if quote.is_some() {
        return Err(AppError::InvalidRequest("Unclosed quote in command.".to_owned()));
    }
    if !current.is_empty() {
        parts.push(current);
    }
    let program = parts.first().cloned().ok_or(AppError::CommandDenied)?;
    Ok((program, parts.into_iter().skip(1).collect()))
}

pub fn is_denied_command(command: &str, program: &str, args: &[String]) -> bool {
    let lower = command.to_lowercase();
    let prog = program.to_lowercase();
    if matches!(
        prog.as_str(),
        "sudo" | "su" | "doas" | "shutdown" | "reboot" | "mkfs" | "diskpart" | "format"
    ) {
        return true;
    }
    if matches!(prog.as_str(), "cmd" | "cmd.exe" | "powershell" | "powershell.exe" | "pwsh" | "bash" | "sh" | "zsh" | "fish")
        && args.is_empty()
    {
        return true;
    }
    if lower.contains("rm -rf /") || lower.contains("rm -rf /*") || lower.contains("rm -rf c:\\") {
        return true;
    }
    if lower.contains("169.254.169.254") || lower.contains("metadata.google") {
        return true;
    }
    false
}

fn resolve_program(program: &str) -> String {
    #[cfg(target_os = "windows")]
    {
        match program {
            "pnpm" => return "pnpm.cmd".to_owned(),
            "npm" => return "npm.cmd".to_owned(),
            "npx" => return "npx.cmd".to_owned(),
            _ => {}
        }
    }
    program.to_owned()
}

fn filtered_env() -> Vec<(String, String)> {
    const ALLOW: &[&str] = &[
        "PATH", "PATHEXT", "SYSTEMROOT", "SYSTEMDRIVE", "WINDIR", "COMSPEC", "ComSpec",
        "TEMP", "TMP", "HOME", "USERPROFILE", "HOMEDRIVE", "HOMEPATH",
        "LANG", "LC_ALL", "TERM", "USER", "USERNAME",
    ];
    std::env::vars()
        .filter(|(key, _)| ALLOW.iter().any(|allowed| allowed.eq_ignore_ascii_case(key)))
        .collect()
}

fn truncate_chars(value: &str, max: usize) -> (String, bool) {
    if value.chars().count() <= max {
        return (value.to_owned(), false);
    }
    (value.chars().take(max).collect(), true)
}

fn spawn_direct(program: &str, args: &[String], cwd: &Path, capture: bool) -> AppResult<Child> {
    let mut command = Command::new(resolve_program(program));
    command
        .args(args)
        .current_dir(cwd)
        .env_clear()
        .envs(filtered_env())
        .stdin(Stdio::null())
        .stdout(if capture { Stdio::piped() } else { Stdio::null() })
        .stderr(if capture { Stdio::piped() } else { Stdio::null() });
    command
        .spawn()
        .map_err(|_| AppError::InvalidRequest("Unable to start the process.".to_owned()))
}

#[cfg(target_os = "windows")]
fn quote_windows_arg(value: &str) -> String {
    if value.is_empty() {
        return "\"\"".to_owned();
    }
    if !value.chars().any(|ch| ch.is_whitespace() || matches!(ch, '"' | '&' | '|' | '<' | '>')) {
        return value.to_owned();
    }
    format!("\"{}\"", value.replace('"', "\\\""))
}

#[cfg(target_os = "windows")]
fn join_command_line(program: &str, args: &[String]) -> String {
    std::iter::once(program)
        .chain(args.iter().map(String::as_str))
        .map(quote_windows_arg)
        .collect::<Vec<_>>()
        .join(" ")
}

fn prepare_command(program: &str, args: &[String]) -> (String, Vec<String>) {
    #[cfg(target_os = "windows")]
    {
        let lower = program.to_ascii_lowercase();
        if lower == "mkdir" || lower == "md" {
            let filtered: Vec<String> = args
                .iter()
                .filter(|arg| *arg != "-p" && *arg != "--parents")
                .cloned()
                .collect();
            return (program.to_string(), filtered);
        }
        if lower == "pwd" && args.is_empty() {
            return ("cd".to_string(), Vec::new());
        }
        if lower == "ls" {
            return ("dir".to_string(), Vec::new());
        }
    }
    (program.to_string(), args.to_vec())
}

fn spawn_command(program: &str, args: &[String], cwd: &Path, capture: bool) -> AppResult<Child> {
    let (program, args) = prepare_command(program, args);
    match spawn_direct(&program, &args, cwd, capture) {
        Ok(child) => Ok(child),
        Err(error) => {
            #[cfg(target_os = "windows")]
            {
                let _ = error;
                let cmdline = join_command_line(&program, &args);
                spawn_direct(
                    "cmd.exe",
                    &["/d".into(), "/s".into(), "/c".into(), cmdline],
                    cwd,
                    capture,
                )
            }
            #[cfg(not(target_os = "windows"))]
            {
                Err(error)
            }
        }
    }
}

pub fn run_command(
    command: String,
    cwd: &Path,
    timeout_ms: Option<u64>,
) -> AppResult<ProcessResult> {
    let (program, args) = split_command(&command)?;
    if is_denied_command(&command, &program, &args) {
        return Err(AppError::CommandDenied);
    }
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS).max(1));
    let mut child = spawn_command(&program, &args, cwd, true)?;
    let stdout_pipe = child.stdout.take();
    let stderr_pipe = child.stderr.take();
    let stdout_handle = thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(mut pipe) = stdout_pipe {
            let _ = pipe.read_to_end(&mut buf);
        }
        buf
    });
    let stderr_handle = thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(mut pipe) = stderr_pipe {
            let _ = pipe.read_to_end(&mut buf);
        }
        buf
    });

    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if started.elapsed() >= timeout => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(AppError::InvalidRequest("Command timed out.".to_owned()));
            }
            Ok(None) => thread::sleep(Duration::from_millis(20)),
            Err(error) => return Err(error.into()),
        }
    };

    let stdout_raw = String::from_utf8_lossy(&stdout_handle.join().unwrap_or_else(|_| Vec::new())).into_owned();
    let stderr_raw = String::from_utf8_lossy(&stderr_handle.join().unwrap_or_else(|_| Vec::new())).into_owned();
    let per = MAX_OUTPUT_CHARS / 2;
    let (stdout, stdout_cut) = truncate_chars(stdout_raw.trim(), per);
    let (stderr, stderr_cut) = truncate_chars(stderr_raw.trim(), per);
    Ok(ProcessResult {
        command,
        stdout,
        stderr,
        exit_code: status.code(),
        truncated: Some(stdout_cut || stderr_cut),
    })
}

#[derive(Default)]
pub struct ProcessManager {
    jobs: Mutex<HashMap<String, ManagedJob>>,
}

impl ProcessManager {
    pub fn start(&self, command: String, cwd: &Path) -> AppResult<ProcessJob> {
        let (program, args) = split_command(&command)?;
        if is_denied_command(&command, &program, &args) {
            return Err(AppError::CommandDenied);
        }
        let mut child = spawn_command(&program, &args, cwd, true)?;
        let stdout = Arc::new(Mutex::new(OutputTail { text: String::new(), truncated: false }));
        let stderr = Arc::new(Mutex::new(OutputTail { text: String::new(), truncated: false }));
        if let Some(pipe) = child.stdout.take() {
            spawn_reader(pipe, Arc::clone(&stdout));
        }
        if let Some(pipe) = child.stderr.take() {
            spawn_reader(pipe, Arc::clone(&stderr));
        }
        let job_id = uuid::Uuid::new_v4().to_string();
        self.jobs
            .lock()
            .map_err(|_| AppError::InvalidRequest("Process state is unavailable.".to_owned()))?
            .insert(job_id.clone(), ManagedJob {
                child,
                command: command.clone(),
                stdout,
                stderr,
            });
        Ok(ProcessJob { job_id, command })
    }

    pub fn output(&self, job_id: &str) -> AppResult<ProcessOutput> {
        let mut jobs = self
            .jobs
            .lock()
            .map_err(|_| AppError::InvalidRequest("Process state is unavailable.".to_owned()))?;
        let job = jobs
            .get_mut(job_id)
            .ok_or_else(|| AppError::InvalidRequest("Unknown process job.".to_owned()))?;
        let status = job
            .child
            .try_wait()
            .map_err(|error| AppError::Io(error.to_string()))?;
        let (stdout, stdout_cut) = snapshot_tail(&job.stdout);
        let (stderr, stderr_cut) = snapshot_tail(&job.stderr);
        Ok(ProcessOutput {
            job_id: job_id.to_owned(),
            command: job.command.clone(),
            stdout,
            stderr,
            running: status.is_none(),
            exit_code: status.and_then(|value| value.code()),
            truncated: stdout_cut || stderr_cut,
        })
    }

    pub fn kill(&self, job_id: &str) -> AppResult<()> {
        let mut job = {
            let mut jobs = self
                .jobs
                .lock()
                .map_err(|_| AppError::InvalidRequest("Process state is unavailable.".to_owned()))?;
            jobs.remove(job_id)
                .ok_or_else(|| AppError::InvalidRequest("Unknown process job.".to_owned()))?
        };
        let _ = job.child.kill();
        let _ = job.child.wait();
        Ok(())
    }
}

pub fn resolve_cwd(root: &Path, cwd: Option<&str>) -> AppResult<PathBuf> {
    match crate::filesystem::resolve_within_root(root, cwd.unwrap_or(""), true) {
        Err(AppError::InvalidRequest(message)) if message == "Unable to read file." => {
            Err(AppError::InvalidRequest(
                "Working directory does not exist.".to_owned(),
            ))
        }
        other => other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::AppError;
    use std::sync::{Arc, Mutex};

    #[test]
    fn splits_quoted_commands() {
        let (program, args) = split_command(r#"pnpm test -- "foo bar""#).unwrap();
        assert_eq!(program, "pnpm");
        assert_eq!(args, vec!["test", "--", "foo bar"]);
    }

    #[test]
    fn denies_sudo_and_rm_root() {
        assert!(is_denied_command("sudo ls", "sudo", &[]));
        assert!(is_denied_command("rm -rf /", "rm", &["-rf".into(), "/".into()]));
        assert!(is_denied_command("bash", "bash", &[]));
        assert!(!is_denied_command("pnpm test", "pnpm", &["test".into()]));
    }

    #[test]
    fn output_tail_keeps_the_end() {
        let buffer = Arc::new(Mutex::new(OutputTail { text: String::new(), truncated: false }));
        push_tail(&buffer, "abcdefghij", 4);
        let guard = buffer.lock().unwrap();
        assert_eq!(guard.text, "ghij");
        assert!(guard.truncated);
    }

    #[test]
    fn unknown_job_output_is_an_error() {
        let manager = ProcessManager::default();
        let err = manager.output("missing").unwrap_err();
        assert!(matches!(err, AppError::InvalidRequest(message) if message == "Unknown process job."));
    }

    #[cfg(windows)]
    #[test]
    fn prepares_windows_shell_builtins() {
        let (program, args) = prepare_command("mkdir", &["-p".into(), "boiss/client".into()]);
        assert_eq!(program, "mkdir");
        assert_eq!(args, vec!["boiss/client"]);
        let (program, args) = prepare_command("pwd", &[]);
        assert_eq!(program, "cd");
        assert!(args.is_empty());
        let (program, args) = prepare_command("ls", &["-la".into()]);
        assert_eq!(program, "dir");
        assert!(args.is_empty());
    }
}
