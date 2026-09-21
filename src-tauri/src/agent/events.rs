use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime};

pub const AGENT_MESSAGE: &str = "agent:message";
pub const AGENT_STATUS: &str = "agent:status";
pub const AGENT_TOOL_START: &str = "agent:tool-start";
pub const AGENT_TOOL_COMPLETE: &str = "agent:tool-complete";
pub const TERMINAL_OUTPUT: &str = "terminal:output";
pub const TERMINAL_EXIT: &str = "terminal:exit";
pub const PROJECT_FILE_CHANGED: &str = "project:file-changed";
pub const USER_SPECS_CHANGED: &str = "user:specs-changed";
pub const TASK_UPDATED: &str = "task:updated";

pub fn emit<R: Runtime, T: Serialize + Clone>(
    app: &AppHandle<R>,
    event: &str,
    payload: T,
) -> Result<(), String> {
    app.emit(event, payload).map_err(|error| error.to_string())
}
