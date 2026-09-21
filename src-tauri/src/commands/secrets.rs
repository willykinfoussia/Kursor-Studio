use crate::{error::AppResult, state::AppState};
use tauri::State;

#[tauri::command]
pub fn secret_get(key: String, state: State<'_, AppState>) -> AppResult<Option<String>> {
    state.secrets.get(&key)
}

#[tauri::command]
pub fn secret_set(key: String, value: String, state: State<'_, AppState>) -> AppResult<()> {
    state.secrets.set(&key, value)
}

#[tauri::command]
pub fn secret_delete(key: String, state: State<'_, AppState>) -> AppResult<()> {
    state.secrets.delete(&key)
}
