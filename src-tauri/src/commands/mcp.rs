use crate::database::records::McpUsageRecord;
use crate::error::AppResult;
use crate::mcp::detect::{BlenderInstallation, DetectedExecutable};
use crate::mcp::types::{
    McpCallResult, McpDiscovery, McpHealthReport, McpServerInput, McpServerSnapshot,
};
use crate::state::AppState;
use serde_json::Value;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn mcp_list(project_id: Option<String>, state: State<'_, AppState>) -> AppResult<Vec<McpServerSnapshot>> {
    state.mcp.list(&state.db, project_id.as_deref()).await
}

#[tauri::command]
pub async fn mcp_upsert(input: McpServerInput, state: State<'_, AppState>) -> AppResult<McpServerSnapshot> {
    state.mcp.upsert(&state.db, input).await
}

#[tauri::command]
pub async fn mcp_remove(id: String, app: AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    state.mcp.remove(&state.db, &id, &app).await
}

#[tauri::command]
pub async fn mcp_enable(id: String, enabled: bool, app: AppHandle, state: State<'_, AppState>) -> AppResult<McpServerSnapshot> {
    state.mcp.set_enabled(&state.db, &state.secrets, &state.project_root, &id, enabled, &app).await
}

#[tauri::command]
pub async fn mcp_start(id: String, app: AppHandle, state: State<'_, AppState>) -> AppResult<McpServerSnapshot> {
    state.mcp.start(&state.db, &state.secrets, &state.project_root, &id, &app).await
}

#[tauri::command]
pub async fn mcp_stop(id: String, app: AppHandle, state: State<'_, AppState>) -> AppResult<McpServerSnapshot> {
    state.mcp.stop(&state.db, &id, &app).await
}

#[tauri::command]
pub async fn mcp_restart(id: String, app: AppHandle, state: State<'_, AppState>) -> AppResult<McpServerSnapshot> {
    state.mcp.restart(&state.db, &state.secrets, &state.project_root, &id, &app).await
}

#[tauri::command]
pub async fn mcp_call_tool(
    id: String,
    tool: String,
    arguments: Value,
    timeout_ms: Option<u64>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<McpCallResult> {
    state.mcp.call_tool(&state.db, &id, &tool, arguments, timeout_ms, &app).await
}

#[tauri::command]
pub async fn mcp_list_tools(id: String, state: State<'_, AppState>) -> AppResult<McpDiscovery> {
    state.mcp.discovery(&state.db, &id).await
}

#[tauri::command]
pub async fn mcp_set_tool_enabled(
    id: String,
    tool_id: String,
    enabled: bool,
    state: State<'_, AppState>,
) -> AppResult<()> {
    state.mcp.set_tool_enabled(&state.db, &id, &tool_id, enabled).await
}

#[tauri::command]
pub fn mcp_which(name: String) -> DetectedExecutable {
    crate::mcp::detect::which(&name)
}

#[tauri::command]
pub fn mcp_detect_blender() -> BlenderInstallation {
    crate::mcp::detect::detect_blender()
}

#[tauri::command]
pub fn mcp_probe_tcp(host: String, port: u16) -> bool {
    crate::mcp::detect::probe_tcp(&host, port)
}

#[tauri::command]
pub async fn mcp_list_resources(id: String, state: State<'_, AppState>) -> AppResult<Vec<Value>> {
    state.mcp.list_resources(&id).await
}

#[tauri::command]
pub async fn mcp_list_prompts(id: String, state: State<'_, AppState>) -> AppResult<Vec<Value>> {
    state.mcp.list_prompts(&id).await
}

#[tauri::command]
pub async fn mcp_read_resource(id: String, uri: String, state: State<'_, AppState>) -> AppResult<Value> {
    state.mcp.read_resource(&id, &uri).await
}

#[tauri::command]
pub async fn mcp_get_prompt(
    id: String,
    name: String,
    arguments: Option<Value>,
    state: State<'_, AppState>,
) -> AppResult<Value> {
    state.mcp.get_prompt(&id, &name, arguments).await
}

#[tauri::command]
pub async fn mcp_health(id: String, app: AppHandle, state: State<'_, AppState>) -> AppResult<McpHealthReport> {
    state.mcp.health(&state.db, &state.secrets, &state.project_root, &id, &app).await
}

#[tauri::command]
pub async fn mcp_bootstrap(project_id: Option<String>, app: AppHandle, state: State<'_, AppState>) -> AppResult<Vec<McpServerSnapshot>> {
    state.mcp.bootstrap(&state.db, &state.secrets, &state.project_root, project_id.as_deref(), &app).await
}

#[tauri::command]
pub async fn mcp_switch_project(
    project_id: Option<String>,
    project_root: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<Vec<McpServerSnapshot>> {
    if let (Some(id), Some(root)) = (project_id.as_deref(), project_root.as_deref()) {
        state.mcp.import_project_config(&state.db, id, root).await?;
    }
    state.mcp.switch_project(&state.db, &state.secrets, &state.project_root, project_id.as_deref(), &app).await
}

#[tauri::command]
pub async fn mcp_record_usage(record: McpUsageRecord, state: State<'_, AppState>) -> AppResult<()> {
    state.mcp.record_usage(&state.db, record).await
}

#[tauri::command]
pub async fn mcp_cancel(id: String, app: AppHandle, state: State<'_, AppState>) -> AppResult<McpServerSnapshot> {
    state.mcp.stop(&state.db, &id, &app).await
}
