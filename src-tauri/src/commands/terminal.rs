use crate::{
    error::{AppError, AppResult},
    filesystem::{is_inside, strip_verbatim},
    state::AppState,
    terminal::TerminalSessionInfo,
};
use tauri::{AppHandle, State};

fn session_cwd(state: &State<'_, AppState>, cwd: Option<String>) -> AppResult<std::path::PathBuf> {
    let root = crate::commands::project::active_root(state)?;
    let Some(path) = cwd else {
        return Ok(root);
    };
    let candidate = std::path::PathBuf::from(path)
        .canonicalize()
        .map_err(|_| AppError::ProjectMissing)?;
    if !is_inside(&root, &candidate) {
        return Err(AppError::PathOutsideProject);
    }
    Ok(strip_verbatim(&candidate))
}

#[tauri::command]
pub fn terminal_create(
    cwd: Option<String>,
    shell: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> AppResult<TerminalSessionInfo> {
    let directory = session_cwd(&state, cwd)?;
    state.terminals.create(app, &directory, shell.as_deref())
}

#[tauri::command]
pub fn terminal_write(session_id: String, data: String, state: State<'_, AppState>) -> AppResult<()> {
    state.terminals.write(&session_id, &data)
}

#[tauri::command]
pub fn terminal_resize(
    session_id: String,
    cols: u16,
    rows: u16,
    state: State<'_, AppState>,
) -> AppResult<()> {
    state.terminals.resize(&session_id, cols, rows)
}

#[tauri::command]
pub fn terminal_kill(session_id: String, state: State<'_, AppState>) -> AppResult<()> {
    state.terminals.kill(&session_id)
}
