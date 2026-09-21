use crate::agent::events;
use crate::error::{AppError, AppResult};
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::{
    collections::HashMap,
    io::{Read, Write},
    path::Path,
    sync::{Arc, Mutex},
    thread,
};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSessionInfo {
    pub id: String,
    pub shell: String,
    pub cwd: String,
    pub status: &'static str,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutputEvent {
    pub session_id: String,
    pub data: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalExitEvent {
    pub session_id: String,
    pub exit_code: Option<i32>,
}

struct LiveSession {
    writer: Mutex<Box<dyn Write + Send>>,
    master: Mutex<Box<dyn MasterPty + Send>>,
    child: Mutex<Box<dyn portable_pty::Child + Send>>,
}

pub struct TerminalManager {
    sessions: Arc<Mutex<HashMap<String, Arc<LiveSession>>>>,
}

impl Default for TerminalManager {
    fn default() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn unix_fallback_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| {
        if cfg!(target_os = "macos") {
            "/bin/zsh".to_owned()
        } else if Path::new("/bin/bash").exists() {
            "/bin/bash".to_owned()
        } else {
            "/bin/sh".to_owned()
        }
    })
}

#[cfg(not(target_os = "windows"))]
fn unix_preferred_shell(preferred: &str) -> Option<String> {
    let candidate = match preferred {
        "zsh" => "/bin/zsh".to_owned(),
        "bash" => "/bin/bash".to_owned(),
        "sh" => "/bin/sh".to_owned(),
        other if preferred.contains('/') => other.to_owned(),
        _ => return None,
    };
    Path::new(&candidate).exists().then_some(candidate)
}

fn default_shell(preferred: Option<&str>) -> (String, Vec<String>) {
    #[cfg(target_os = "windows")]
    {
        match preferred.unwrap_or("PowerShell") {
            "Command Prompt" | "cmd" => ("cmd.exe".to_owned(), vec!["/K".to_owned()]),
            "Git Bash" => ("bash.exe".to_owned(), Vec::new()),
            _ => ("powershell.exe".to_owned(), vec!["-NoLogo".to_owned()]),
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let shell = preferred
            .and_then(unix_preferred_shell)
            .unwrap_or_else(unix_fallback_shell);
        (shell, Vec::new())
    }
}

impl TerminalManager {
    pub fn create(
        &self,
        app: AppHandle,
        cwd: &Path,
        preferred_shell: Option<&str>,
    ) -> AppResult<TerminalSessionInfo> {
        if !cwd.is_dir() {
            return Err(AppError::ProjectMissing);
        }

        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|_| AppError::TerminalFailed)?;

        let (program, args) = default_shell(preferred_shell);
        let mut cmd = CommandBuilder::new(&program);
        for arg in &args {
            cmd.arg(arg);
        }
        cmd.cwd(cwd);
        #[cfg(not(target_os = "windows"))]
        {
            cmd.env("TERM", "xterm-256color");
        }

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|_| AppError::TerminalFailed)?;
        drop(pair.slave);
        let mut reader = pair.master.try_clone_reader().map_err(|_| AppError::TerminalFailed)?;
        let writer = pair.master.take_writer().map_err(|_| AppError::TerminalFailed)?;
        let id = Uuid::new_v4().to_string();
        let session = Arc::new(LiveSession {
            writer: Mutex::new(writer),
            master: Mutex::new(pair.master),
            child: Mutex::new(child),
        });

        self.sessions
            .lock()
            .map_err(|_| AppError::TerminalFailed)?
            .insert(id.clone(), session.clone());

        let emit_id = id.clone();
        let sessions = self.sessions.clone();
        let waiter = session.clone();
        thread::spawn(move || {
            let mut buffer = [0u8; 4096];
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) => break,
                    Ok(count) => {
                        let data = String::from_utf8_lossy(&buffer[..count]).into_owned();
                        let _ = app.emit(
                            events::TERMINAL_OUTPUT,
                            TerminalOutputEvent {
                                session_id: emit_id.clone(),
                                data,
                            },
                        );
                    }
                    Err(_) => break,
                }
            }
            let exit_code = waiter
                .child
                .lock()
                .ok()
                .and_then(|mut child| child.wait().ok())
                .map(|status| status.exit_code() as i32);
            let _ = app.emit(
                events::TERMINAL_EXIT,
                TerminalExitEvent {
                    session_id: emit_id.clone(),
                    exit_code,
                },
            );
            if let Ok(mut map) = sessions.lock() {
                map.remove(&emit_id);
            }
        });

        Ok(TerminalSessionInfo {
            id,
            shell: program,
            cwd: cwd.display().to_string(),
            status: "running",
        })
    }

    pub fn write(&self, session_id: &str, data: &str) -> AppResult<()> {
        let session = self.get(session_id)?;
        let result = {
            let mut writer = session
                .writer
                .lock()
                .map_err(|_| AppError::TerminalFailed)?;
            writer
                .write_all(data.as_bytes())
                .map_err(|_| AppError::TerminalFailed)
        };
        result
    }

    pub fn resize(&self, session_id: &str, cols: u16, rows: u16) -> AppResult<()> {
        let session = self.get(session_id)?;
        let result = {
            let master = session
                .master
                .lock()
                .map_err(|_| AppError::TerminalFailed)?;
            master
                .resize(PtySize {
                    rows,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|_| AppError::TerminalFailed)
        };
        result
    }

    pub fn kill(&self, session_id: &str) -> AppResult<()> {
        let session = self.get(session_id)?;
        let result = {
            let mut child = session
                .child
                .lock()
                .map_err(|_| AppError::TerminalFailed)?;
            child.kill().map_err(|_| AppError::TerminalFailed)
        };
        result
    }

    fn get(&self, session_id: &str) -> AppResult<Arc<LiveSession>> {
        self.sessions
            .lock()
            .map_err(|_| AppError::TerminalFailed)?
            .get(session_id)
            .cloned()
            .ok_or_else(|| AppError::InvalidRequest("The terminal session is no longer running.".to_owned()))
    }
}
