pub mod detect;
pub mod reconnect;
pub mod redact;
pub mod types;

use crate::database::records::{McpCapabilityRecord, McpServerRecord, McpUsageRecord};
use crate::database::Database;
use crate::error::{AppError, AppResult};
use crate::secrets::SecretStore;
use reconnect::{backoff_ms, should_retry};
use redact::{key_is_secret, looks_like_secret, truncate_output};
use rmcp::{
    model::{CallToolRequestParams, GetPromptRequestParams, ReadResourceRequestParams},
    service::RunningService,
    transport::{
        streamable_http_client::StreamableHttpClientTransportConfig, ConfigureCommandExt, StreamableHttpClientTransport,
        TokioChildProcess,
    },
    RoleClient, ServiceExt,
};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tokio::process::Command;
use types::*;

type Client = RunningService<RoleClient, ()>;

struct LiveSession {
    client: Client,
    restart_count: u32,
}

#[derive(Default)]
pub struct McpRuntime {
    sessions: tokio::sync::Mutex<HashMap<String, LiveSession>>,
}

impl McpRuntime {
    pub async fn list(&self, db: &Database, project_id: Option<&str>) -> AppResult<Vec<McpServerSnapshot>> {
        let records = db.list_mcp_servers(project_id)?;
        let sessions = self.sessions.lock().await;
        Ok(records
            .into_iter()
            .map(|record| snapshot_from_record(&record, sessions.contains_key(&record.id)))
            .collect())
    }

    pub async fn upsert(&self, db: &Database, input: McpServerInput) -> AppResult<McpServerSnapshot> {
        validate_input(&input)?;
        let now = now_ms();
        let existing = db.get_mcp_server(&input.id)?;
        let record = record_from_input(&input, existing.as_ref(), now);
        db.upsert_mcp_server(&record)?;
        Ok(snapshot_from_record(&record, false))
    }

    pub async fn remove(&self, db: &Database, id: &str, app: &AppHandle) -> AppResult<()> {
        self.stop(db, id, app).await.ok();
        db.delete_mcp_server(id)
    }

    pub async fn set_enabled(
        &self,
        db: &Database,
        secrets: &SecretStore,
        project_root: &Mutex<Option<PathBuf>>,
        id: &str,
        enabled: bool,
        app: &AppHandle,
    ) -> AppResult<McpServerSnapshot> {
        let mut record = db
            .get_mcp_server(id)?
            .ok_or_else(|| AppError::InvalidRequest(format!("Unknown MCP server '{id}'.")))?;
        record.enabled = if enabled { 1 } else { 0 };
        record.status = if enabled { "disconnected".into() } else { "disabled".into() };
        record.updated_at = now_ms();
        db.upsert_mcp_server(&record)?;
        if enabled {
            match self.start(db, secrets, project_root, id, app).await {
                Ok(snapshot) => Ok(snapshot),
                Err(error) => {
                    emit_event(app, "mcp-server-error", id, None, Some(error.to_string()), None);
                    self.list_one(db, id).await
                }
            }
        } else {
            self.stop(db, id, app).await?;
            self.list_one(db, id).await
        }
    }

    pub async fn start(
        &self,
        db: &Database,
        secrets: &SecretStore,
        project_root: &Mutex<Option<PathBuf>>,
        id: &str,
        app: &AppHandle,
    ) -> AppResult<McpServerSnapshot> {
        let mut record = db
            .get_mcp_server(id)?
            .ok_or_else(|| AppError::InvalidRequest(format!("Unknown MCP server '{id}'.")))?;
        if record.enabled == 0 {
            record.status = "disabled".into();
            db.upsert_mcp_server(&record)?;
            return Ok(snapshot_from_record(&record, false));
        }
        if record.trust == "blocked" {
            return Err(AppError::InvalidRequest(format!(
                "MCP server '{id}' is blocked."
            )));
        }
        if record.transport != "stdio" && record.transport != "streamable-http" {
            return Err(AppError::InvalidRequest(
                "This transport is not started yet.".to_owned(),
            ));
        }
        emit_event(app, "mcp-server-started", id, None, None, None);
        self.connect_record(db, secrets, project_root, record, app, 0).await
    }

    pub async fn stop(&self, db: &Database, id: &str, app: &AppHandle) -> AppResult<McpServerSnapshot> {
        if let Some(mut session) = self.sessions.lock().await.remove(id) {
            let _ = session.client.close_with_timeout(Duration::from_secs(2)).await;
        }
        if let Some(mut record) = db.get_mcp_server(id)? {
            record.status = if record.enabled == 0 { "disabled".into() } else { "disconnected".into() };
            record.updated_at = now_ms();
            db.upsert_mcp_server(&record)?;
            emit_event(app, "mcp-server-disconnected", id, None, None, None);
            return Ok(snapshot_from_record(&record, false));
        }
        Err(AppError::InvalidRequest(format!("Unknown MCP server '{id}'.")))
    }

    pub async fn restart(
        &self,
        db: &Database,
        secrets: &SecretStore,
        project_root: &Mutex<Option<PathBuf>>,
        id: &str,
        app: &AppHandle,
    ) -> AppResult<McpServerSnapshot> {
        self.stop(db, id, app).await.ok();
        self.start(db, secrets, project_root, id, app).await
    }

    pub async fn call_tool(
        &self,
        db: &Database,
        id: &str,
        tool: &str,
        arguments: Value,
        timeout_ms: Option<u64>,
        app: &AppHandle,
    ) -> AppResult<McpCallResult> {
        let started = Instant::now();
        emit_event(app, "mcp-tool-started", id, Some(tool), None, None);
        let result = self.call_tool_inner(db, id, tool, arguments, timeout_ms).await;
        let duration_ms = started.elapsed().as_millis() as u64;
        match result {
            Ok(mut payload) => {
                payload.duration_ms = duration_ms;
                emit_event(app, "mcp-tool-completed", id, Some(tool), None, None);
                Ok(payload)
            }
            Err(error) => {
                emit_event(app, "mcp-tool-error", id, Some(tool), Some(error.to_string()), None);
                Ok(McpCallResult {
                    success: false,
                    data: None,
                    error: Some(McpCallError {
                        code: classify_error(&error),
                        message: error.to_string(),
                    }),
                    truncated: None,
                    duration_ms,
                })
            }
        }
    }

    async fn call_tool_inner(
        &self,
        db: &Database,
        id: &str,
        tool: &str,
        arguments: Value,
        timeout_ms: Option<u64>,
    ) -> AppResult<McpCallResult> {
        let timeout = timeout_ms
            .or_else(|| {
                db.get_mcp_server(id)
                    .ok()
                    .flatten()
                    .and_then(|record| record.timeout_ms.map(|value| value as u64))
            })
            .unwrap_or(MCP_TIMEOUT_MS);
        let sessions = self.sessions.lock().await;
        let session = sessions
            .get(id)
            .ok_or_else(|| AppError::InvalidRequest(format!("MCP server '{id}' is unavailable.")))?;
        if session.client.is_closed() {
            return Err(AppError::InvalidRequest(format!("MCP server '{id}' is unavailable.")));
        }
        let mut params = CallToolRequestParams::new(tool.to_string());
        if let Some(object) = arguments.as_object() {
            params = params.with_arguments(object.clone());
        }
        let call = session.client.call_tool(params);
        let output = tokio::time::timeout(Duration::from_millis(timeout), call)
            .await
            .map_err(|_| AppError::InvalidRequest("MCP tool timed out.".to_owned()))?
            .map_err(|error| AppError::InvalidRequest(error.to_string()))?;
        let value = serde_json::to_value(&output).unwrap_or_else(|_| json!({ "raw": format!("{output:?}") }));
        let serialized = value.to_string();
        let (text, truncated) = truncate_output(&serialized, MAX_MCP_TOOL_OUTPUT_CHARS);
        let data = serde_json::from_str(&text).unwrap_or_else(|_| json!({ "text": text }));
        let is_error = output.is_error.unwrap_or(false);
        Ok(McpCallResult {
            success: !is_error,
            data: Some(data),
            error: is_error.then(|| McpCallError {
                code: "mcp_tool_error".into(),
                message: "MCP tool returned an error.".into(),
            }),
            truncated: truncated.then_some(true),
            duration_ms: 0,
        })
    }

    pub async fn discovery(&self, db: &Database, id: &str) -> AppResult<McpDiscovery> {
        let sessions = self.sessions.lock().await;
        if let Some(session) = sessions.get(id) {
            let mut discovered = discover(&session.client).await?;
            merge_enabled(db, id, &mut discovered)?;
            return Ok(discovered);
        }
        stored_discovery(db, id)
    }

    pub async fn set_tool_enabled(&self, db: &Database, id: &str, tool_id: &str, enabled: bool) -> AppResult<()> {
        let cap_id = if tool_id.starts_with("mcp.") {
            tool_id.to_string()
        } else {
            format!("mcp.{id}.tool.{tool_id}")
        };
        db.set_mcp_capability_enabled(&cap_id, if enabled { 1 } else { 0 }, now_ms())
    }

    pub async fn list_resources(&self, id: &str) -> AppResult<Vec<Value>> {
        let sessions = self.sessions.lock().await;
        let session = sessions
            .get(id)
            .ok_or_else(|| AppError::InvalidRequest(format!("MCP server '{id}' is unavailable.")))?;
        Ok(discover(&session.client).await?.resources)
    }

    pub async fn list_prompts(&self, id: &str) -> AppResult<Vec<Value>> {
        let sessions = self.sessions.lock().await;
        let session = sessions
            .get(id)
            .ok_or_else(|| AppError::InvalidRequest(format!("MCP server '{id}' is unavailable.")))?;
        Ok(discover(&session.client).await?.prompts)
    }

    pub async fn read_resource(&self, id: &str, uri: &str) -> AppResult<Value> {
        let sessions = self.sessions.lock().await;
        let session = sessions
            .get(id)
            .ok_or_else(|| AppError::InvalidRequest(format!("MCP server '{id}' is unavailable.")))?;
        let params = ReadResourceRequestParams::new(uri.to_string());
        let result = session
            .client
            .read_resource(params)
            .await
            .map_err(|error| AppError::InvalidRequest(error.to_string()))?;
        Ok(serde_json::to_value(result).unwrap_or(Value::Null))
    }

    pub async fn get_prompt(&self, id: &str, name: &str, arguments: Option<Value>) -> AppResult<Value> {
        let sessions = self.sessions.lock().await;
        let session = sessions
            .get(id)
            .ok_or_else(|| AppError::InvalidRequest(format!("MCP server '{id}' is unavailable.")))?;
        let mut params = GetPromptRequestParams::new(name.to_string());
        if let Some(Value::Object(map)) = arguments {
            params = params.with_arguments(map);
        }
        let result = session
            .client
            .get_prompt(params)
            .await
            .map_err(|error| AppError::InvalidRequest(error.to_string()))?;
        Ok(serde_json::to_value(result).unwrap_or(Value::Null))
    }

    pub async fn health(
        &self,
        db: &Database,
        secrets: &SecretStore,
        project_root: &Mutex<Option<PathBuf>>,
        id: &str,
        app: &AppHandle,
    ) -> AppResult<McpHealthReport> {
        let record = db
            .get_mcp_server(id)?
            .ok_or_else(|| AppError::InvalidRequest(format!("Unknown MCP server '{id}'.")))?;
        let mut checks = Vec::new();
        let config_ok = (record.transport == "stdio" && record.command.as_ref().is_some_and(|value| !value.is_empty()))
            || (record.transport == "streamable-http" && record.url.as_ref().is_some_and(|value| !value.is_empty()));
        checks.push(check("config", "Config valid", config_ok, None));
        let command_ok = if record.transport == "streamable-http" {
            true
        } else {
            record
                .command
                .as_ref()
                .map(|command| command_available(command))
                .unwrap_or(false)
        };
        checks.push(check(
            "executable",
            if record.transport == "streamable-http" { "Endpoint reachable" } else { "Process starts" },
            command_ok,
            record.command.clone().or(record.url.clone()),
        ));
        let connected = self.sessions.lock().await.contains_key(id);
        if record.enabled == 1 && !connected && config_ok && command_ok {
            match self.start(db, secrets, project_root, id, app).await {
                Ok(snapshot) => {
                    checks.push(check("connection", "Connection established", true, None));
                    checks.push(check(
                        "discovery",
                        "Tool discovery",
                        true,
                        Some(format!("{} tools discovered", snapshot.tool_count)),
                    ));
                }
                Err(error) => {
                    checks.push(check("connection", "Connection established", false, Some(error.to_string())));
                    checks.push(check("discovery", "Tool discovery", false, None));
                }
            }
        } else {
            checks.push(check("connection", "Connection established", connected, None));
            checks.push(check(
                "discovery",
                "Tool discovery",
                connected || record.tool_count > 0,
                Some(format!("{} tools discovered", record.tool_count)),
            ));
        }
        let ok = checks.iter().all(|item| item.status == "pass" || item.status == "skip");
        Ok(McpHealthReport {
            server_id: id.to_string(),
            ok,
            checks,
        })
    }

    pub async fn switch_project(
        &self,
        db: &Database,
        secrets: &SecretStore,
        project_root: &Mutex<Option<PathBuf>>,
        project_id: Option<&str>,
        app: &AppHandle,
    ) -> AppResult<Vec<McpServerSnapshot>> {
        let records = db.list_mcp_servers(None)?;
        let keep: std::collections::HashSet<String> = db
            .list_mcp_servers(project_id)?
            .into_iter()
            .filter(|record| record.scope == "global" || record.project_id.as_deref() == project_id)
            .map(|record| record.id)
            .collect();
        let live: Vec<String> = self.sessions.lock().await.keys().cloned().collect();
        for id in live {
            let record = records.iter().find(|item| item.id == id);
            let project_scoped = record.is_some_and(|item| item.scope == "project");
            if project_scoped && !keep.contains(&id) {
                self.stop(db, &id, app).await.ok();
            }
        }
        for record in db.list_mcp_servers(project_id)? {
            if record.enabled == 1 && record.scope != "agent" && record.trust == "trusted" && !self.sessions.lock().await.contains_key(&record.id) {
                if let Err(error) = self.start(db, secrets, project_root, &record.id, app).await {
                    emit_event(app, "mcp-server-error", &record.id, None, Some(error.to_string()), None);
                }
            }
        }
        self.list(db, project_id).await
    }

    pub async fn bootstrap(
        &self,
        db: &Database,
        secrets: &SecretStore,
        project_root: &Mutex<Option<PathBuf>>,
        project_id: Option<&str>,
        app: &AppHandle,
    ) -> AppResult<Vec<McpServerSnapshot>> {
        import_global_files(db)?;
        for record in db.list_mcp_servers(project_id)? {
            if record.enabled == 1 && record.trust == "trusted" && (record.transport == "stdio" || record.transport == "streamable-http") {
                if let Err(error) = self.start(db, secrets, project_root, &record.id, app).await {
                    emit_event(app, "mcp-server-error", &record.id, None, Some(error.to_string()), None);
                }
            }
        }
        self.list(db, project_id).await
    }

    pub async fn import_project_config(&self, db: &Database, project_id: &str, root: &str) -> AppResult<Vec<McpServerSnapshot>> {
        let path = PathBuf::from(root).join(".kursor").join("mcp.json");
        if let Ok(text) = std::fs::read_to_string(&path) {
            if let Ok(value) = serde_json::from_str::<Value>(&text) {
                import_config_value(db, &value, "project", Some(project_id))?;
            }
        }
        self.list(db, Some(project_id)).await
    }

    pub async fn record_usage(&self, db: &Database, record: McpUsageRecord) -> AppResult<()> {
        if record
            .metadata_json
            .as_ref()
            .is_some_and(|value| looks_like_secret(value) || value.contains("ghp_"))
        {
            return Err(AppError::InvalidRequest("Refusing to persist secret MCP metadata.".into()));
        }
        db.insert_mcp_usage(&record)
    }

    async fn list_one(&self, db: &Database, id: &str) -> AppResult<McpServerSnapshot> {
        let record = db
            .get_mcp_server(id)?
            .ok_or_else(|| AppError::InvalidRequest(format!("Unknown MCP server '{id}'.")))?;
        let live = self.sessions.lock().await.contains_key(id);
        Ok(snapshot_from_record(&record, live))
    }

    async fn connect_record(
        &self,
        db: &Database,
        secrets: &SecretStore,
        project_root: &Mutex<Option<PathBuf>>,
        mut record: McpServerRecord,
        app: &AppHandle,
        attempt: u32,
    ) -> AppResult<McpServerSnapshot> {
        record.status = "connecting".into();
        record.updated_at = now_ms();
        db.upsert_mcp_server(&record)?;
        emit_event(app, "mcp-server-connecting", &record.id, None, None, None);

        match spawn_session(&record, secrets, project_cwd(project_root)).await {
            Ok(mut client) => {
                record.status = "discovering".into();
                db.upsert_mcp_server(&record)?;
                emit_event(app, "mcp-server-connected", &record.id, None, None, None);
                let discovered = match discover(&client).await {
                    Ok(value) => value,
                    Err(error) => {
                        let _ = client.close_with_timeout(Duration::from_secs(1)).await;
                        return self
                            .fail_and_maybe_retry(db, secrets, project_root, record, app, attempt, error.to_string())
                            .await;
                    }
                };
                persist_discovery(db, &record.id, &discovered)?;
                record.tool_count = discovered.tools.len() as i64;
                record.resource_count = discovered.resources.len() as i64;
                record.prompt_count = discovered.prompts.len() as i64;
                record.status = "ready".into();
                record.last_connected_at = Some(now_ms());
                record.last_error = None;
                record.updated_at = now_ms();
                if let Some(info) = client.peer_info() {
                    if let Some(server) = info.server_info.as_ref() {
                        record.version = Some(server.version.to_string());
                    }
                }
                db.upsert_mcp_server(&record)?;
                emit_event(app, "mcp-tool-discovered", &record.id, None, None, Some(record.tool_count));
                emit_event(app, "mcp-resource-discovered", &record.id, None, None, Some(record.resource_count));
                emit_event(app, "mcp-prompt-discovered", &record.id, None, None, Some(record.prompt_count));
                self.sessions.lock().await.insert(
                    record.id.clone(),
                    LiveSession {
                        client,
                        restart_count: attempt,
                    },
                );
                Ok(snapshot_from_record(&record, true))
            }
            Err(error) => {
                self.fail_and_maybe_retry(db, secrets, project_root, record, app, attempt, error.to_string())
                    .await
            }
        }
    }

    async fn fail_and_maybe_retry(
        &self,
        db: &Database,
        secrets: &SecretStore,
        project_root: &Mutex<Option<PathBuf>>,
        mut record: McpServerRecord,
        app: &AppHandle,
        attempt: u32,
        message: String,
    ) -> AppResult<McpServerSnapshot> {
        record.status = "error".into();
        record.last_error = Some(redact::redact_text(&message));
        record.restart_count = attempt as i64;
        record.updated_at = now_ms();
        db.upsert_mcp_server(&record)?;
        emit_event(app, "mcp-server-error", &record.id, None, Some(redact::redact_text(&message)), None);
        if should_retry(true, attempt, MCP_MAX_RETRIES) {
            tokio::time::sleep(Duration::from_millis(backoff_ms(attempt))).await;
            return Box::pin(self.connect_record(db, secrets, project_root, record, app, attempt + 1)).await;
        }
        Ok(snapshot_from_record(&record, false))
    }
}

async fn spawn_session(record: &McpServerRecord, secrets: &SecretStore, cwd: Option<PathBuf>) -> AppResult<Client> {
    if record.transport == "streamable-http" {
        return spawn_http_client(record, secrets).await;
    }
    spawn_stdio_client(record, secrets, cwd).await
}

async fn spawn_http_client(record: &McpServerRecord, secrets: &SecretStore) -> AppResult<Client> {
    let url = record
        .url
        .as_ref()
        .ok_or_else(|| AppError::InvalidRequest("streamable-http servers require a url.".into()))?;
    let env = resolve_env(record, secrets)?;
    let mut headers = std::collections::HashMap::new();
    for (key, value) in env {
        let name = key.to_ascii_lowercase();
        if name == "authorization" {
            continue;
        }
        if let (Ok(header), Ok(header_value)) = (
            http::HeaderName::from_bytes(name.as_bytes()),
            http::HeaderValue::from_str(&value),
        ) {
            headers.insert(header, header_value);
        }
    }
    let config = StreamableHttpClientTransportConfig::with_uri(url.clone()).custom_headers(headers);
    let transport = StreamableHttpClientTransport::from_config(config);
    ().serve(transport)
        .await
        .map_err(|error| AppError::InvalidRequest(error.to_string()))
}

async fn spawn_stdio_client(record: &McpServerRecord, secrets: &SecretStore, cwd: Option<PathBuf>) -> AppResult<Client> {
    let command = record
        .command
        .as_ref()
        .ok_or_else(|| AppError::InvalidRequest("stdio servers require a command.".into()))?;
    let args: Vec<String> = record
        .args_json
        .as_deref()
        .and_then(|value| serde_json::from_str(value).ok())
        .unwrap_or_default();
    let env = resolve_env(record, secrets)?;
    let program = resolve_program(command);
    let transport = TokioChildProcess::new(Command::new(&program).configure(|cmd| {
        cmd.args(&args);
        for (key, value) in &env {
            cmd.env(key, value);
        }
        if let Some(dir) = cwd.as_ref() {
            cmd.current_dir(dir);
        }
        #[cfg(windows)]
        {
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
    }))
    .map_err(|error| AppError::InvalidRequest(error.to_string()))?;
    ().serve(transport)
        .await
        .map_err(|error| AppError::InvalidRequest(error.to_string()))
}

fn resolve_env(record: &McpServerRecord, secrets: &SecretStore) -> AppResult<Vec<(String, String)>> {
    let vars: Vec<McpEnvironmentVariable> = record
        .env_json
        .as_deref()
        .and_then(|value| serde_json::from_str(value).ok())
        .unwrap_or_default();
    let mut resolved = Vec::new();
    for env in vars {
        if let Some(secret_ref) = env.secret_ref.as_ref() {
            if record.trust != "trusted" {
                if env.required {
                    return Err(AppError::InvalidRequest(format!(
                        "Untrusted MCP server '{}' cannot receive secret {}.",
                        record.id, env.name
                    )));
                }
                continue;
            }
            let key = secret_store_key(&record.id, secret_ref);
            let mut stored = secrets.get(&key)?;
            if stored.is_none() {
                stored = github_token_fallback(&record.id, &env.name, secrets)?;
            }
            match stored {
                Some(value) => resolved.push((env.name, value)),
                None if env.required => {
                    return Err(AppError::InvalidRequest(format!(
                        "Missing secret {} for MCP server '{}'.",
                        env.name, record.id
                    )))
                }
                None => {}
            }
        } else if let Some(value) = env.value {
            if key_is_secret(&env.name) || looks_like_secret(&value) {
                return Err(AppError::InvalidRequest(format!(
                    "Refusing to inject plaintext secret {}.",
                    env.name
                )));
            }
            resolved.push((env.name, value));
        }
    }
    Ok(resolved)
}

fn github_token_fallback(server_id: &str, env_name: &str, secrets: &SecretStore) -> AppResult<Option<String>> {
    if server_id != "github" {
        return Ok(None);
    }
    let wants_token = env_name.eq_ignore_ascii_case("GITHUB_PERSONAL_ACCESS_TOKEN")
        || env_name.eq_ignore_ascii_case("GITHUB_TOKEN")
        || env_name.eq_ignore_ascii_case("GITHUB_ACCESS_TOKEN");
    if !wants_token {
        return Ok(None);
    }
    secrets.get("GITHUB_ACCESS_TOKEN")
}

fn secret_store_key(server_id: &str, secret_ref: &str) -> String {
    if let Some(path) = secret_ref.strip_prefix("secret://") {
        let parts: Vec<&str> = path.split('/').collect();
        if parts.len() >= 2 {
            return format!("mcp:{}:{}", parts[0], parts[1]);
        }
        return path.to_string();
    }
    if secret_ref.starts_with("mcp:") {
        return secret_ref.to_string();
    }
    format!("mcp:{server_id}:{secret_ref}")
}

async fn discover(client: &Client) -> AppResult<McpDiscovery> {
    let tools = client.list_all_tools().await.unwrap_or_default();
    let resources = client.list_all_resources().await.unwrap_or_default();
    let prompts = client.list_all_prompts().await.unwrap_or_default();
    Ok(McpDiscovery {
        tools: tools.into_iter().filter_map(|item| serde_json::to_value(item).ok()).collect(),
        resources: resources.into_iter().filter_map(|item| serde_json::to_value(item).ok()).collect(),
        prompts: prompts.into_iter().filter_map(|item| serde_json::to_value(item).ok()).collect(),
    })
}

fn persist_discovery(db: &Database, server_id: &str, discovery: &McpDiscovery) -> AppResult<()> {
    let now = now_ms();
    let previous: HashMap<String, i64> = db
        .list_mcp_capabilities(server_id)?
        .into_iter()
        .map(|item| (item.id, item.enabled))
        .collect();
    let mut records = Vec::new();
    for tool in &discovery.tools {
        let name = tool.get("name").and_then(Value::as_str).unwrap_or("tool").to_string();
        let id = format!("mcp.{server_id}.tool.{name}");
        records.push(McpCapabilityRecord {
            id: id.clone(),
            server_id: server_id.into(),
            kind: "mcp-tool".into(),
            name,
            description: tool.get("description").and_then(Value::as_str).map(ToOwned::to_owned),
            uri: None,
            schema_json: tool.get("inputSchema").cloned().or_else(|| tool.get("input_schema").cloned()).map(|value| value.to_string()),
            enabled: previous.get(&id).copied().unwrap_or(1),
            created_at: now,
            updated_at: now,
        });
    }
    for resource in &discovery.resources {
        let uri = resource.get("uri").and_then(Value::as_str).unwrap_or("").to_string();
        let name = resource
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or(uri.as_str())
            .to_string();
        let id = format!("mcp.{server_id}.resource.{}", urlencoding::encode(&uri));
        records.push(McpCapabilityRecord {
            id: id.clone(),
            server_id: server_id.into(),
            kind: "mcp-resource".into(),
            name,
            description: resource.get("description").and_then(Value::as_str).map(ToOwned::to_owned),
            uri: Some(uri),
            schema_json: None,
            enabled: previous.get(&id).copied().unwrap_or(1),
            created_at: now,
            updated_at: now,
        });
    }
    for prompt in &discovery.prompts {
        let name = prompt.get("name").and_then(Value::as_str).unwrap_or("prompt").to_string();
        let id = format!("mcp.{server_id}.prompt.{name}");
        records.push(McpCapabilityRecord {
            id: id.clone(),
            server_id: server_id.into(),
            kind: "mcp-prompt".into(),
            name,
            description: prompt.get("description").and_then(Value::as_str).map(ToOwned::to_owned),
            uri: None,
            schema_json: prompt.get("arguments").cloned().map(|value| value.to_string()),
            enabled: previous.get(&id).copied().unwrap_or(1),
            created_at: now,
            updated_at: now,
        });
    }
    db.replace_mcp_capabilities(server_id, &records)
}

fn merge_enabled(db: &Database, server_id: &str, discovery: &mut McpDiscovery) -> AppResult<()> {
    let previous: HashMap<String, bool> = db
        .list_mcp_capabilities(server_id)?
        .into_iter()
        .map(|item| (item.id, item.enabled != 0))
        .collect();
    for tool in &mut discovery.tools {
        let Some(name) = tool.get("name").and_then(Value::as_str).map(ToOwned::to_owned) else { continue };
        let id = format!("mcp.{server_id}.tool.{name}");
        if let Some(enabled) = previous.get(&id) {
            if let Some(object) = tool.as_object_mut() {
                object.insert("enabled".into(), json!(*enabled));
            }
        }
    }
    Ok(())
}

fn stored_discovery(db: &Database, server_id: &str) -> AppResult<McpDiscovery> {
    let records = db.list_mcp_capabilities(server_id)?;
    let mut tools = Vec::new();
    let mut resources = Vec::new();
    let mut prompts = Vec::new();
    for record in records {
        match record.kind.as_str() {
            "mcp-tool" => {
                let schema = record
                    .schema_json
                    .as_deref()
                    .and_then(|value| serde_json::from_str(value).ok())
                    .unwrap_or_else(|| json!({}));
                tools.push(json!({
                    "name": record.name,
                    "description": record.description,
                    "inputSchema": schema,
                    "enabled": record.enabled != 0,
                }));
            }
            "mcp-resource" => {
                resources.push(json!({
                    "uri": record.uri,
                    "name": record.name,
                    "description": record.description,
                }));
            }
            "mcp-prompt" => {
                prompts.push(json!({
                    "name": record.name,
                    "description": record.description,
                }));
            }
            _ => {}
        }
    }
    Ok(McpDiscovery { tools, resources, prompts })
}

fn import_global_files(db: &Database) -> AppResult<()> {
    let path = db.data_dir.join("mcp").join("mcp.json");
    if let Ok(text) = std::fs::read_to_string(path) {
        if let Ok(value) = serde_json::from_str::<Value>(&text) {
            import_config_value(db, &value, "user", None)?;
        }
    }
    Ok(())
}

fn import_config_value(db: &Database, value: &Value, origin: &str, project_id: Option<&str>) -> AppResult<()> {
    let map = value
        .get("mcpServers")
        .or_else(|| value.get("servers"))
        .and_then(Value::as_object);
    let Some(map) = map else { return Ok(()) };
    for (id, entry) in map {
        let Some(object) = entry.as_object() else { continue };
        let transport = object
            .get("type")
            .and_then(Value::as_str)
            .or_else(|| object.get("transport").and_then(Value::as_str))
            .unwrap_or("stdio");
        let env = object.get("env").and_then(Value::as_object).map(|vars| {
            vars.iter()
                .map(|(name, raw)| {
                    let value = raw.as_str().unwrap_or("").to_string();
                    if key_is_secret(name) || value.starts_with("${") || value.starts_with("secret://") {
                        json!({ "name": name, "required": true, "secretRef": format!("secret://{id}/{name}") })
                    } else {
                        json!({ "name": name, "required": false, "value": value })
                    }
                })
                .collect::<Vec<_>>()
        });
        let input = McpServerInput {
            id: id.clone(),
            name: id.clone(),
            display_name: Some(id.clone()),
            enabled: object.get("disabled").and_then(Value::as_bool) != Some(true),
            transport: transport.to_string(),
            command: object.get("command").and_then(Value::as_str).map(ToOwned::to_owned),
            args: object.get("args").and_then(Value::as_array).map(|items| {
                items.iter().filter_map(Value::as_str).map(ToOwned::to_owned).collect()
            }),
            url: object.get("url").and_then(Value::as_str).map(ToOwned::to_owned),
            env: env.and_then(|items| serde_json::from_value(Value::Array(items)).ok()),
            scope: if project_id.is_some() { "project".into() } else { "global".into() },
            origin: origin.into(),
            trust: if origin == "user" { "trusted".into() } else { "untrusted".into() },
            version: None,
            timeout_ms: Some(MCP_TIMEOUT_MS),
            project_id: project_id.map(ToOwned::to_owned),
            metadata: None,
        };
        if validate_input(&input).is_ok() {
            let existing = db.get_mcp_server(&input.id)?;
            db.upsert_mcp_server(&record_from_input(&input, existing.as_ref(), now_ms()))?;
        }
    }
    Ok(())
}

fn validate_input(input: &McpServerInput) -> AppResult<()> {
    if input.id.trim().is_empty() {
        return Err(AppError::InvalidRequest("MCP server id is required.".into()));
    }
    if input.transport == "stdio" && input.command.as_ref().is_none_or(|value| value.trim().is_empty()) {
        return Err(AppError::InvalidRequest("stdio servers require a command.".into()));
    }
    if input.transport != "stdio" && input.transport != "sse" && input.transport != "streamable-http" {
        return Err(AppError::InvalidRequest("Unknown MCP transport.".into()));
    }
    for env in input.env.iter().flatten() {
        if let Some(value) = &env.value {
            if key_is_secret(&env.name) || looks_like_secret(value) {
                return Err(AppError::InvalidRequest(format!(
                    "Refusing to store plaintext secret {}.",
                    env.name
                )));
            }
        }
    }
    Ok(())
}

fn record_from_input(input: &McpServerInput, existing: Option<&McpServerRecord>, now: i64) -> McpServerRecord {
    McpServerRecord {
        id: input.id.clone(),
        name: input.name.clone(),
        display_name: input.display_name.clone(),
        scope: input.scope.clone(),
        origin: input.origin.clone(),
        transport: input.transport.clone(),
        command: input.command.clone(),
        args_json: input.args.as_ref().and_then(|value| serde_json::to_string(value).ok()),
        url: input.url.clone(),
        env_json: input.env.as_ref().and_then(|value| serde_json::to_string(value).ok()),
        enabled: if input.enabled { 1 } else { 0 },
        status: if input.enabled {
            existing.map(|item| item.status.clone()).unwrap_or_else(|| "disconnected".into())
        } else {
            "disabled".into()
        },
        trust: input.trust.clone(),
        version: input.version.clone(),
        timeout_ms: input.timeout_ms.map(|value| value as i64),
        project_id: input.project_id.clone(),
        last_connected_at: existing.and_then(|item| item.last_connected_at),
        last_error: existing.and_then(|item| item.last_error.clone()),
        restart_count: existing.map(|item| item.restart_count).unwrap_or(0),
        tool_count: existing.map(|item| item.tool_count).unwrap_or(0),
        resource_count: existing.map(|item| item.resource_count).unwrap_or(0),
        prompt_count: existing.map(|item| item.prompt_count).unwrap_or(0),
        metadata_json: input.metadata.as_ref().and_then(|value| serde_json::to_string(value).ok()),
        created_at: existing.map(|item| item.created_at).unwrap_or(now),
        updated_at: now,
    }
}

fn snapshot_from_record(record: &McpServerRecord, live: bool) -> McpServerSnapshot {
    let args = record
        .args_json
        .as_deref()
        .and_then(|value| serde_json::from_str(value).ok());
    let env = record
        .env_json
        .as_deref()
        .and_then(|value| serde_json::from_str(value).ok());
    McpServerSnapshot {
        id: record.id.clone(),
        name: record.name.clone(),
        display_name: record.display_name.clone(),
        enabled: record.enabled != 0,
        transport: record.transport.clone(),
        command: record.command.clone(),
        args,
        url: record.url.clone(),
        env,
        scope: record.scope.clone(),
        origin: record.origin.clone(),
        trust: record.trust.clone(),
        version: record.version.clone(),
        timeout_ms: record.timeout_ms.map(|value| value as u64),
        project_id: record.project_id.clone(),
        status: if live && record.status == "ready" { "ready".into() } else { record.status.clone() },
        last_connected_at: record.last_connected_at,
        last_error: record.last_error.clone(),
        restart_count: record.restart_count,
        tool_count: record.tool_count,
        resource_count: record.resource_count,
        prompt_count: record.prompt_count,
        created_at: record.created_at,
        updated_at: record.updated_at,
        metadata: record
            .metadata_json
            .as_deref()
            .and_then(|value| serde_json::from_str(value).ok()),
    }
}

fn emit_event(app: &AppHandle, kind: &str, server_id: &str, tool: Option<&str>, message: Option<String>, count: Option<i64>) {
    let _ = app.emit(
        MCP_EVENT,
        McpEvent {
            kind: kind.into(),
            server_id: server_id.into(),
            tool_name: tool.map(ToOwned::to_owned),
            message: message.map(|value| redact::redact_text(&value)),
            count,
        },
    );
}

fn check(id: &str, label: &str, ok: bool, detail: Option<String>) -> McpHealthCheck {
    McpHealthCheck {
        id: id.into(),
        label: label.into(),
        status: if ok { "pass".into() } else { "fail".into() },
        detail: detail.map(|value| redact::redact_text(&value)),
    }
}

fn classify_error(error: &AppError) -> String {
    let text = error.to_string().to_ascii_lowercase();
    if text.contains("timeout") {
        "mcp_timeout".into()
    } else if text.contains("unavailable") || text.contains("closed") {
        "mcp_server_unavailable".into()
    } else if text.contains("connect") || text.contains("spawn") {
        "mcp_connection".into()
    } else {
        "mcp_protocol".into()
    }
}

fn command_available(command: &str) -> bool {
    let program = resolve_program(command);
    if Path::new(&program).exists() {
        return true;
    }
    let Ok(path) = std::env::var("PATH") else { return true };
    std::env::split_paths(&path).any(|dir| {
        dir.join(&program).exists()
            || dir.join(format!("{program}.exe")).exists()
            || dir.join(format!("{program}.cmd")).exists()
            || dir.join(format!("{program}.bat")).exists()
    })
}

fn resolve_program(command: &str) -> String {
    #[cfg(windows)]
    {
        if command.eq_ignore_ascii_case("npx") {
            return "npx.cmd".into();
        }
        if command.eq_ignore_ascii_case("npm") {
            return "npm.cmd".into();
        }
        if command.eq_ignore_ascii_case("pnpm") {
            return "pnpm.cmd".into();
        }
    }
    command.to_string()
}

fn project_cwd(project_root: &Mutex<Option<PathBuf>>) -> Option<PathBuf> {
    project_root.lock().ok().and_then(|guard| guard.clone())
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis() as i64)
        .unwrap_or(0)
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secret_keys_from_refs() {
        assert_eq!(secret_store_key("github", "secret://github/GITHUB_TOKEN"), "mcp:github:GITHUB_TOKEN");
        assert_eq!(secret_store_key("github", "mcp:github:TOKEN"), "mcp:github:TOKEN");
        assert_eq!(secret_store_key("github", "TOKEN"), "mcp:github:TOKEN");
        assert_eq!(
            secret_store_key("github", "secret://github/GITHUB_PERSONAL_ACCESS_TOKEN"),
            "mcp:github:GITHUB_PERSONAL_ACCESS_TOKEN"
        );
    }
}
