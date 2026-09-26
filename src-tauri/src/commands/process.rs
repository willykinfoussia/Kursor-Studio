use crate::{
    error::AppResult,
    process::{execute_allowed, resolve_cwd, run_command, ProcessJob, ProcessOutput, ProcessResult},
    state::AppState,
};
use tauri::State;

use super::project::active_root;

#[tauri::command]
pub fn process_execute(command: String) -> AppResult<ProcessResult> {
    execute_allowed(command)
}

#[tauri::command]
pub fn process_run(
    command: String,
    cwd: Option<String>,
    timeout_ms: Option<u64>,
    state: State<'_, AppState>,
) -> AppResult<ProcessResult> {
    let root = active_root(&state)?;
    let directory = resolve_cwd(&root, cwd.as_deref())?;
    run_command(command, &directory, timeout_ms)
}

#[tauri::command]
pub fn process_start(
    command: String,
    cwd: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<ProcessJob> {
    let root = active_root(&state)?;
    let directory = resolve_cwd(&root, cwd.as_deref())?;
    state.jobs.start(command, &directory)
}

#[tauri::command]
pub fn process_output(job_id: String, state: State<'_, AppState>) -> AppResult<ProcessOutput> {
    state.jobs.output(&job_id)
}

#[tauri::command]
pub fn process_kill(job_id: String, state: State<'_, AppState>) -> AppResult<()> {
    state.jobs.kill(&job_id)
}
