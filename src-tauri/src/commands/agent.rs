use crate::agent::events;
use tauri::AppHandle;

#[tauri::command]
pub fn agent_ping(app: AppHandle) -> Result<String, String> {
    events::emit(&app, events::AGENT_STATUS, "idle")?;
    Ok("agent-ready".to_owned())
}
